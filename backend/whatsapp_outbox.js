import fs from 'node:fs';
import path from 'node:path';

// A single WhatsApp worker owns this file. It never connects to the orders DB.
export class WhatsAppOutbox {
    constructor({ filename, deliver, isReady, refreshAcknowledgements, now = Date.now, logger = console }) {
        this.filename = filename;
        this.deliver = deliver;
        this.isReady = isReady;
        this.refreshAcknowledgements = refreshAcknowledgements;
        this.ackCursor = 0;
        this.now = now;
        this.logger = logger;
        this.jobs = new Map();
        if (fs.existsSync(filename)) {
            const saved = JSON.parse(fs.readFileSync(filename, 'utf8'));
            if (saved.version !== 1 || !Array.isArray(saved.jobs)) {
                throw new Error('Invalid WhatsApp outbox; existing file has been preserved');
            }
            this.jobs = new Map(saved.jobs.map(job => [job.id, job]));
        }
    }

    save() {
        fs.mkdirSync(path.dirname(this.filename), { recursive: true, mode: 0o700 });
        const temporary = `${this.filename}.tmp`;
        const fd = fs.openSync(temporary, 'w', 0o600);
        try {
            fs.writeFileSync(fd, JSON.stringify({ version: 1, jobs: [...this.jobs.values()] }));
            fs.fsyncSync(fd);
        } finally {
            fs.closeSync(fd);
        }
        fs.renameSync(temporary, this.filename);
    }

    enqueue(id, payload, { force = false } = {}) {
        const existing = this.jobs.get(id);
        if (existing?.cancelled) return { success: true, queued: false, skipped: true };
        // A manual resend must not create a second copy of an in-flight job.
        if (existing && (!force || !existing.completedAt)) {
            return { success: true, queued: !existing.completedAt, duplicate: true };
        }
        this.jobs.set(id, { ...payload, id, createdAt: this.now(), attempts: 0, nextAttemptAt: 0 });
        try {
            this.save(); // Persist before acknowledging or attempting a send.
        } catch (error) {
            if (existing) this.jobs.set(id, existing);
            else this.jobs.delete(id);
            throw error;
        }
        this.kick();
        return { success: true, queued: true };
    }

    cancel(id) {
        const job = this.jobs.get(id);
        if (!job || job.completedAt) return;
        job.cancelled = true;
        this.save();
    }

    start() {
        if (this.timer) return;
        this.timer = setInterval(() => this.kick(), 30000);
        this.timer.unref?.();
    }

    stop() {
        clearInterval(this.timer);
        this.timer = null;
    }

    kick(retryNow = false) {
        this.flush(retryNow).catch(error => this.logger.error('[WHATSAPP OUTBOX]', error));
    }

    async flush(retryNow = false) {
        if (this.running) return this.running;
        this.running = this.drain(retryNow);
        try {
            await this.running;
        } finally {
            this.running = null;
        }
    }

    async drain(retryNow) {
        // Reconcile receipts missed while the process was offline. A recipient
        // being offline never causes an already-accepted message to be resent.
        if (this.isReady() && this.refreshAcknowledgements) {
            const ids = [...this.jobs.values()].filter(job => job.completedAt).flatMap(job => (job.targets || []).flatMap(target =>
                ['text', 'pdf'].filter(part => target[`${part}MessageId`] && !(target[`${part}Ack`] >= 2))
                    .map(part => target[`${part}MessageId`])
            ));
            if (ids.length) {
                this.ackCursor %= ids.length;
                const batch = [...ids.slice(this.ackCursor), ...ids.slice(0, this.ackCursor)].slice(0, 20);
                this.ackCursor += batch.length;
                try {
                    for (const receipt of await this.refreshAcknowledgements(batch)) {
                        this.recordAcknowledgement(receipt.id, receipt.ack);
                    }
                } catch (error) { this.logger.warn('[WHATSAPP] Receipt check deferred:', error.message); }
            }
        }
        for (const job of this.jobs.values()) {
            if (!this.isReady()) break;
            if (job.completedAt || job.cancelled || (!retryNow && job.nextAttemptAt > this.now())) continue;
            // Checkpoint recipient progress before moving on to another recipient.
            let storageError;
            const checkpoint = () => {
                try { this.save(); } catch (error) {
                    error.outboxStorageError = true;
                    storageError = error;
                    throw error;
                }
            };
            try {
                await this.deliver(job, checkpoint);
                if (storageError) throw storageError;
                // Keep retry context until recipient delivery is confirmed. Only
                // then compact the job to a receipt without customer/order data.
                const receipt = job.targets?.length
                    ? { ...job, completedAt: this.now() }
                    : { id: job.id, completedAt: this.now() };
                this.finishReceipt(receipt);
                this.jobs.set(job.id, receipt);
                try { this.save(); } catch (error) {
                    this.jobs.set(job.id, job);
                    throw error;
                }
            } catch (error) {
                // Stop sending if progress cannot be saved safely.
                if (storageError) throw storageError;
                job.attempts++;
                job.lastError = error.message;
                job.nextAttemptAt = this.now() + Math.min(300000, 30000 * 2 ** Math.min(job.attempts - 1, 4));
                this.save();
                this.logger.warn(`[WHATSAPP OUTBOX] ${job.id} queued for retry: ${error.message}`);
            }
        }
    }

    finishReceipt(job) {
        if (job.completedAt && job.targets?.length && job.targets.every(target => target.textAck >= 2 && target.pdfAck >= 2)) {
            const { id, completedAt } = job;
            for (const key of Object.keys(job)) delete job[key];
            Object.assign(job, { id, completedAt, deliveredAt: this.now() });
        }
    }

    recordAcknowledgement(messageId, ack) {
        if (!messageId || typeof ack !== 'number') return false;
        let changed = false;
        for (const job of this.jobs.values()) {
            for (const target of job.targets || []) {
                for (const part of ['text', 'pdf']) {
                    const matches = target[`${part}MessageId`] === messageId ||
                        (target[`${part}Id`] && messageId.endsWith(`_${target[`${part}Id`]}`));
                    if (!matches || target[`${part}Ack`] === ack || target[`${part}Ack`] >= 2) continue;
                    target[`${part}Ack`] = ack;
                    changed = true;
                    if (ack === -1 && !job.cancelled) {
                        target[`${part}Sent`] = false;
                        delete job.completedAt;
                        job.lastError = `WhatsApp rejected ${part} delivery`;
                        job.nextAttemptAt = this.now() + 30000;
                    }
                    if (ack >= 2) this.logger.log(`[WHATSAPP] Recipient delivery confirmed (ID: ${messageId})`);
                }
            }
            this.finishReceipt(job);
        }
        if (changed) this.save();
        return changed;
    }

    status() {
        const pending = [...this.jobs.values()].filter(job => !job.completedAt && !job.cancelled);
        const awaitingDelivery = [...this.jobs.values()].filter(job => job.completedAt && job.targets?.length);
        return {
            pendingNotifications: pending.length,
            awaitingDelivery: awaitingDelivery.length,
            lastDeliveryError: pending.find(job => job.lastError)?.lastError || null
        };
    }
}

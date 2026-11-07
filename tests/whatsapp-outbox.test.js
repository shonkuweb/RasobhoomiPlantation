import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { WhatsAppOutbox } from '../backend/whatsapp_outbox.js';

function fixture(t, overrides = {}) {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'wa-outbox-test-'));
    t.after(() => fs.rmSync(dir, { recursive: true, force: true }));
    const options = { filename: path.join(dir, 'notifications.json'), isReady: () => true,
        logger: { warn() {}, error() {} }, deliver: async () => {}, ...overrides };
    const queue = new WhatsAppOutbox(options);
    // Tests explicitly flush, instead of racing a background timer.
    queue.kick = () => {};
    return { queue, options };
}

test('disconnected jobs survive a process restart and completed jobs remain deduplicated', async t => {
    let ready = false;
    let calls = 0;
    const { queue, options } = fixture(t, { isReady: () => ready, deliver: async () => { calls++; } });
    queue.enqueue('paid:1', { order: { id: 1 } });
    await queue.flush();
    assert.equal(calls, 0);
    const restored = new WhatsAppOutbox(options);
    ready = true;
    await restored.flush();
    assert.equal(calls, 1);
    assert.equal(restored.status().pendingNotifications, 0);
    const restartedAgain = new WhatsAppOutbox(options);
    assert.equal(restartedAgain.enqueue('paid:1', {}).duplicate, true);
    await restartedAgain.flush();
    assert.equal(calls, 1);
    assert.equal(JSON.stringify([...restartedAgain.jobs.values()]).includes('order'), false);
});

test('recipient checkpoints survive restart; retry sends only the unfinished recipient', async t => {
    const calls = [];
    let failCustomer = true;
    const { queue, options } = fixture(t, { deliver: async (job, save) => {
        job.sent ||= {};
        for (const recipient of ['admin', 'customer']) {
            if (job.sent[recipient]) continue;
            calls.push(recipient);
            if (recipient === 'customer' && failCustomer) throw new Error('network');
            job.sent[recipient] = true;
            save();
        }
    }});
    queue.enqueue('paid:2', {});
    await queue.flush();
    assert.equal(queue.status().pendingNotifications, 1);
    failCustomer = false;
    await new WhatsAppOutbox(options).flush(true);
    assert.deepEqual(calls, ['admin', 'customer', 'customer']);
});

test('overlapping flushes and duplicate callbacks dispatch a job once', async t => {
    let finish;
    let calls = 0;
    const { queue } = fixture(t, { deliver: async () => {
        calls++;
        await new Promise(resolve => { finish = resolve; });
    }});
    queue.enqueue('paid:3', {});
    const first = queue.flush();
    queue.enqueue('paid:3', {}, { force: true });
    const second = queue.flush(true);
    finish();
    await Promise.all([first, second]);
    assert.equal(calls, 1);
});

test('backoff limits retries; ready event can retry immediately', async t => {
    let now = 1000;
    let calls = 0;
    const { queue } = fixture(t, { now: () => now, deliver: async () => { calls++; throw new Error('offline'); } });
    queue.enqueue('paid:4', {});
    await queue.flush();
    await queue.flush();
    assert.equal(calls, 1);
    now += 30000;
    await queue.flush();
    assert.equal(calls, 2);
    await queue.flush(true);
    assert.equal(calls, 3);
});

test('cancelled obsolete notifications never dispatch after restart', async t => {
    let calls = 0;
    const { queue, options } = fixture(t, { deliver: async () => { calls++; } });
    queue.enqueue('pending:5', {});
    queue.cancel('pending:5');
    await new WhatsAppOutbox(options).flush(true);
    assert.equal(calls, 0);
    assert.equal(queue.status().pendingNotifications, 0);
    assert.equal(queue.enqueue('pending:5', {}).skipped, true);
});

test('corrupt queue is preserved, not silently reset', t => {
    const { options } = fixture(t);
    fs.writeFileSync(options.filename, 'broken state');
    assert.throws(() => new WhatsAppOutbox(options));
    assert.equal(fs.readFileSync(options.filename, 'utf8'), 'broken state');
});

test('failure to persist enqueue rolls back and prevents a send', async t => {
    let calls = 0;
    const { queue } = fixture(t, { deliver: async () => { calls++; } });
    queue.save = () => { throw new Error('disk full'); };
    assert.throws(() => queue.enqueue('paid:6', {}), /disk full/);
    await queue.flush();
    assert.equal(calls, 0);
    assert.equal(queue.jobs.size, 0);
});

test('checkpoint storage failure stops the batch before another recipient/job', async t => {
    let calls = 0;
    const { queue } = fixture(t, { deliver: async (job, checkpoint) => { calls++; checkpoint(); } });
    queue.enqueue('paid:7', {});
    queue.enqueue('paid:8', {});
    queue.save = () => { throw new Error('disk full'); };
    await assert.rejects(queue.flush(), /disk full/);
    assert.equal(calls, 1);
});

test('delivery receipts missed during downtime are reconciled without resending', async t => {
    let calls = 0;
    const { queue, options } = fixture(t, {
        logger: { warn() {}, error() {}, log() {} },
        refreshAcknowledgements: async ids => ids.map(id => ({ id, ack: 2 })),
        deliver: async job => {
            calls++;
            job.targets = [{ textMessageId: 'text', pdfMessageId: 'pdf', textSent: true, pdfSent: true, textAck: 1, pdfAck: 1 }];
        }
    });
    queue.enqueue('paid:receipts', { order: { id: 'receipts', name: 'Private customer' } });
    await queue.flush();
    assert.equal(queue.status().awaitingDelivery, 1);
    const restored = new WhatsAppOutbox(options);
    await restored.flush();
    assert.equal(calls, 1);
    assert.equal(restored.status().awaitingDelivery, 0);
    assert.ok(restored.jobs.get('paid:receipts').deliveredAt);
    assert.equal(restored.jobs.get('paid:receipts').order, undefined);
});

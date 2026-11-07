import '../scripts/patch_wwebjs.js';
import dotenv from 'dotenv';
import { randomBytes, createHash } from 'node:crypto';
import { WhatsAppOutbox } from './whatsapp_outbox.js';
import pkg from 'whatsapp-web.js';
const { Client, LocalAuth, MessageMedia } = pkg;
import QRCode from 'qrcode';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { generateInvoicePdf } from './invoice_generator.js';
import { translateProduct } from './product_translator.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
dotenv.config({ path: path.join(__dirname, '../.env') });

// Target phone number for payment success notifications
export const DEFAULT_NOTIFICATION_NUMBER = process.env.ADMIN_WHATSAPP || process.env.ADMIN_PHONE || process.env.NOTIFICATION_NUMBER || '9907541613';


export const SITE_URL = (process.env.APP_FE_URL || process.env.APP_BE_URL || 'https://rasobhoomiplantation.com').replace(/\/+$/, '');

export function getInvoiceUrl(orderId) {
    return `${SITE_URL}/api/orders/${encodeURIComponent(orderId)}/invoice`;
}

function withTimeout(promise, ms, errorMsg) {
    let timer;
    return Promise.race([
        promise,
        new Promise((_, reject) => {
            timer = setTimeout(() => reject(new Error(errorMsg)), ms);
        })
    ]).finally(() => clearTimeout(timer));
}

/**
 * Injects in-browser safety hooks to prevent WhatsApp Web's
 * "Data passed to getter must include an id property" crash when sending media
 */
export async function ensureMediaPatchApplied() {
    if (!client?.pupPage) return;
    try {
        await withTimeout(client.pupPage.evaluate(() => {
            if (!window.WWebJS?.processMediaData) return;
            if (window._wwebjs_media_patch_installed === window.WWebJS) return;
            const original = window.WWebJS.processMediaData;
            window.WWebJS.processMediaData = async function (...args) {
                const media = await original.apply(this, args);
                // Keep the actual model's ID: its own getters may require it.
                // Only omit IDs from the plain attributes merged into a message.
                if (media?.toJSON) {
                    const serialize = media.toJSON;
                    media.toJSON = function (...serializeArgs) {
                        const attributes = { ...serialize.apply(this, serializeArgs) };
                        delete attributes.id;
                        delete attributes.__x_id;
                        return attributes;
                    };
                }
                return media;
            };
            window._wwebjs_media_patch_installed = window.WWebJS;
        }), 10000, 'WhatsApp media patch timed out');
    } catch (error) {
        console.warn('[WHATSAPP] Media patch deferred:', error.message);
    }
}

/**
 * Safely send a direct PDF invoice document to a WhatsApp recipient.
 */
async function sendInvoiceDocument(targetJid, pdfBuffer, orderId, messageId) {
    if (!targetJid || !pdfBuffer?.length || !client) throw new Error('Missing invoice, recipient, or WhatsApp client');
    const filename = `Invoice_${orderId}.pdf`;
    const data = Buffer.isBuffer(pdfBuffer) ? pdfBuffer.toString('base64') : String(pdfBuffer);
    const media = new MessageMedia('application/pdf', data, filename, pdfBuffer.length);
    const result = await safeSendMessage(targetJid, '', {
        media, messageId, sendMediaAsDocument: true, caption: `📄 Order #${orderId} Tax Invoice`
    });
    console.log(`[WHATSAPP] PDF send confirmed for order #${orderId} (ID: ${result.messageId})`);
    return result;
}

export async function sendPdfDocumentSafe(targetJid, pdfBuffer, orderId, messageId) {
    try {
        await sendInvoiceDocument(targetJid, pdfBuffer, orderId, messageId);
        return true;
    } catch (error) {
        console.error(`[WHATSAPP] PDF send failed for order #${orderId}:`, error.message);
        return false;
    }
}

let client = null;
let currentQrDataUrl = null;
let connectionState = 'DISCONNECTED'; // DISCONNECTED, INITIALIZING, QR_READY, CONNECTED
let userInfo = null;
let lastEngineError = null;
let outbox = null;
let initRetryCount = 0;
let reconnectTimer = null;
let lifecycleTask = null;
let stopping = false;

function getOutbox() {
    if (!outbox) {
        outbox = new WhatsAppOutbox({
            filename: path.join(process.env.WHATSAPP_OUTBOX_DIR || path.join(__dirname, '../.wwebjs_outbox'), 'notifications.json'),
            isReady: () => connectionState === 'CONNECTED' && !!client,
            deliver: deliverQueuedNotification,
            refreshAcknowledgements: async ids => withTimeout(client.pupPage.evaluate(async messageIds => {
                const messages = window.require('WAWebCollections').Msg;
                const loaded = await messages.getMessagesById(messageIds);
                return messageIds.map(id => {
                    const message = messages.get(id) || loaded?.messages?.find(item => item.id?._serialized === id);
                    return { id, ack: message?.ack };
                });
            }, ids), 10000, 'WhatsApp receipt lookup timed out')
        });
        outbox.start();
    }
    return outbox;
}

function notificationTargets(job) {
    const targets = [];
    if (job.order.phone) targets.push({ role: 'customer', phone: job.order.phone });
    if (job.kind !== 'status') {
        const adminPhone = process.env.ADMIN_WHATSAPP || process.env.ADMIN_PHONE || process.env.NOTIFICATION_NUMBER;
        targets.push({ role: 'admin', phone: adminPhone || DEFAULT_NOTIFICATION_NUMBER });
        const selfJid = client?.info?.wid?._serialized;
        if (!adminPhone && selfJid && selfJid !== formatWhatsAppJid(DEFAULT_NOTIFICATION_NUMBER)) {
            targets.push({ role: 'admin', jid: selfJid });
        }
    }
    return targets.map(target => ({ ...target,
        textId: randomBytes(16).toString('hex').toUpperCase(),
        pdfId: randomBytes(16).toString('hex').toUpperCase()
    }));
}

async function deliverQueuedNotification(job, checkpoint) {
    if (!job.targets) {
        job.targets = notificationTargets(job);
        checkpoint();
    }
    if (!job.targets.length) throw new Error('Notification has no recipients');
    // Attempt all texts before uploading PDFs. Failure for one recipient does not
    // prevent another recipient from receiving their notification.
    for (const target of job.targets) {
        if (job.cancelled) return;
        if (target.textSent) continue;
        try {
            target.jid ||= await resolveWhatsAppJid(target.phone);
            if (!target.jid) throw new Error('Invalid WhatsApp recipient');
            checkpoint();
            const message = job.kind === 'status' ? buildOrderStatusMessage(job.order, job.newStatus)
                : job.kind === 'paid'
                    ? (target.role === 'customer' ? buildCustomerOrderMessage(job.order) : buildOrderNotificationMessage(job.order))
                    : (target.role === 'customer' ? buildCustomerPendingOrderMessage(job.order) : buildPendingPaymentNotificationMessage(job.order));
            const sent = await safeSendMessage(target.jid, message, { messageId: target.textId });
            target.textMessageId = sent.messageId;
            target.textAck = Math.max(target.textAck || 0, sent.ack || 0);
            target.textSent = true;
            target.lastError = null;
            checkpoint();
        } catch (error) {
            if (error.outboxStorageError) throw error;
            target.lastError = error.message;
        }
    }
    let pdfBuffer;
    for (const target of job.targets) {
        if (job.cancelled) return;
        if (!target.textSent || target.pdfSent) continue;
        try {
            pdfBuffer ||= await withTimeout(generateInvoicePdf(job.order, job.order.lang || 'en'), 30000, 'Invoice PDF generation timed out');
            if (!pdfBuffer?.length) throw new Error('Invoice PDF generation returned no document');
            await new Promise(resolve => setTimeout(resolve, 1200));
            if (job.cancelled) return;
            const sent = await sendInvoiceDocument(target.jid, pdfBuffer, job.order.id, target.pdfId);
            target.pdfMessageId = sent.messageId;
            target.pdfAck = Math.max(target.pdfAck || 0, sent.ack || 0);
            target.pdfSent = true;
            target.lastError = null;
            checkpoint();
        } catch (error) {
            if (error.outboxStorageError) throw error;
            target.lastError = error.message;
        }
    }
    const incomplete = job.targets.filter(target => !target.textSent || !target.pdfSent);
    if (incomplete.length) throw new Error(incomplete.map(target => `${target.role}: ${target.lastError}`).join('; '));
}

function queueOrderNotification(kind, order, { force = false, newStatus } = {}) {
    if (!order?.id) return { success: false, error: 'Invalid order data' };
    if (kind === 'status' && !order.phone) return { success: false, error: 'Customer phone number missing' };
    const queue = getOutbox();
    if (kind === 'paid') queue.cancel(`pending:${order.id}`);
    // A delayed failed-payment callback must not resurrect an obsolete receipt.
    if (kind === 'pending' && queue.jobs.has(`paid:${order.id}`)) return { success: true, skipped: true };
    const key = kind === 'status'
        ? `status:${order.id}:${randomBytes(8).toString('hex')}`
        : `${kind}:${order.id}`;
    if (kind === 'status') {
        for (const job of queue.jobs.values()) {
            if (job.kind === 'status' && job.order?.id === order.id && job.id !== key) queue.cancel(job.id);
        }
    }
    return queue.enqueue(key, { kind, order: JSON.parse(JSON.stringify(order)), newStatus }, { force });
}

/**
 * Wait for client to enter CONNECTED state if it is currently INITIALIZING or AUTHENTICATED
 */
export async function waitForReady(timeoutMs = 12000) {
    if (connectionState === 'CONNECTED' && client) return true;
    if (connectionState !== 'INITIALIZING' && connectionState !== 'AUTHENTICATED') return false;

    const start = Date.now();
    while (Date.now() - start < timeoutMs) {
        if (connectionState === 'CONNECTED' && client) return true;
        await new Promise(r => setTimeout(r, 800));
    }
    return (connectionState === 'CONNECTED' && client);
}

/**
 * Detect available Chromium executable on Linux/Docker VPS or fallback to puppeteer default for Mac/Win
 */
function getChromiumExecutablePath() {
    if (process.env.CHROMIUM_PATH && fs.existsSync(process.env.CHROMIUM_PATH)) {
        return process.env.CHROMIUM_PATH;
    }
    if (process.env.CHROME_PATH && fs.existsSync(process.env.CHROME_PATH)) {
        return process.env.CHROME_PATH;
    }
    const commonLinuxPaths = [
        '/usr/bin/chromium-browser',
        '/usr/bin/chromium',
        '/usr/bin/google-chrome-stable',
        '/usr/bin/google-chrome'
    ];
    for (const p of commonLinuxPaths) {
        if (fs.existsSync(p)) return p;
    }
    return undefined; // Puppeteer will use bundled browser
}

/**
 * Format any phone number into standard WhatsApp JID format (e.g., 918972076182@c.us)
 */
export function formatWhatsAppJid(phone) {
    if (!phone) return null;
    let cleaned = String(phone).replace(/\D/g, ''); // strip non-digits
    if (cleaned.startsWith('0')) {
        cleaned = cleaned.replace(/^0+/, '');
    }
    if (cleaned.length === 10) {
        cleaned = '91' + cleaned;
    } else if (cleaned.length === 11 && cleaned.startsWith('0')) {
        cleaned = '91' + cleaned.slice(1);
    } else if (cleaned.length > 10 && cleaned.startsWith('910')) {
        cleaned = '91' + cleaned.slice(3);
    }
    return (cleaned && cleaned.length >= 10) ? `${cleaned}@c.us` : null;
}

/**
 * Robust async resolver that checks WhatsApp server registry.
 * Returns either @c.us or @lid (for accounts migrated to WhatsApp LID privacy mode).
 */
export async function resolveWhatsAppJid(phone) {
    const rawJid = formatWhatsAppJid(phone);
    if (!rawJid) return null;
    if (!client) return rawJid;

    const cleaned = rawJid.replace('@c.us', '');
    try {
        const contact = await withTimeout(client.getNumberId(cleaned), 10000, 'WhatsApp recipient lookup timed out');
        if (!contact) throw new Error('Recipient is not registered on WhatsApp');
        if (contact && contact._serialized) {
            return contact._serialized;
        }
    } catch (e) {
        throw new Error(`Could not resolve WhatsApp recipient ${cleaned}: ${e.message}`);
    }
    return rawJid;
}

/**
 * Direct in-page WhatsApp message dispatcher.
 * Handles chat lookup and message-model races without fabricating send success:
 * 1. "No LID for user" / uncaught minified evaluation errors ('t', 'r').
 * 2. Msg.get race conditions where sendMessage returns undefined.
 * 3. Chat serialization crashes on fresh contacts.
 * 4. Transparently handles both @c.us phone numbers and @lid privacy accounts.
 */
export async function customSendWhatsAppMessage(targetId, content, options = {}) {
    if (!client || !client.pupPage) {
        throw new Error(`WhatsApp browser session is not ready (Status: ${connectionState})`);
    }

    // Determine text and media payload
    let text = typeof content === 'string' ? content : '';
    let mediaPayload = null;

    if (content && typeof content === 'object' && content.data && content.mimetype) {
        mediaPayload = {
            mimetype: content.mimetype,
            data: content.data,
            filename: content.filename || 'attachment.pdf',
            filesize: content.filesize || content.data.length
        };
    } else if (options.media && options.media.data && options.media.mimetype) {
        mediaPayload = {
            mimetype: options.media.mimetype,
            data: options.media.data,
            filename: options.media.filename || 'attachment.pdf',
            filesize: options.media.filesize || options.media.data.length
        };
    }

    const cleanTarget = String(targetId).trim();

    const evalResult = await client.pupPage.evaluate(async (target, textMsg, media, opts) => {
        let dispatched = false;
        try {
            const WidFactory = window.require('WAWebWidFactory');
            const Collections = window.require('WAWebCollections');
            const QueryExists = window.require('WAWebQueryExistsJob');
            const FindChatAction = window.require('WAWebFindChatAction');
            const SendMsgAction = window.require('WAWebSendMsgChatAction');
            const MeUser = window.require('WAWebUserPrefsMeUser');
            const MsgKey = window.require('WAWebMsgKey');
            const Ephemeral = window.require('WAWebGetEphemeralFieldsMsgActionsUtils');

            // Step 1: Ensure JID formatting
            let jidString = target;
            if (!jidString.includes('@')) {
                jidString = jidString.replace(/\D/g, '') + '@c.us';
            }

            const rawWid = WidFactory.createWid(jidString);
            if (!rawWid) {
                return { success: false, error: 'Could not create Wid for recipient: ' + jidString };
            }

            // Step 2: Query existence and resolve the true server WID (e.g. resolve @c.us -> @lid if migrated)
            let serverWid = rawWid;
            try {
                const existRes = await QueryExists.queryWidExists(rawWid);
                if (existRes && existRes.wid) {
                    serverWid = existRes.wid;
                }
            } catch (queryErr) {}

            // Step 3: Resolve or create the Chat model
            let chat = null;
            // 3a. In-memory check
            try {
                chat = Collections.Chat.get(serverWid) || Collections.Chat.get(rawWid);
            } catch (e) {}

            // 3b. IndexedDB check
            if (!chat) {
                try {
                    chat = (await Collections.Chat.find(serverWid)) || (await Collections.Chat.find(rawWid));
                } catch (e) {}
            }

            // 3c. FindOrCreateLatestChat with serverWid (preferred for LID-migrated accounts)
            if (!chat) {
                try {
                    const res = await FindChatAction.findOrCreateLatestChat(serverWid);
                    chat = res?.chat || res;
                } catch (errServerWid) {}
                if (!chat?.id) {
                    // Also try the phone WID if the LID lookup returned no chat.
                    try {
                        const res2 = await FindChatAction.findOrCreateLatestChat(rawWid);
                        chat = res2?.chat || res2;
                    } catch (errRawWid) {}
                }
            }

            if (!chat?.id) {
                return {
                    success: false,
                    error: `Could not initialize chat for recipient ${target} (Server WID: ${serverWid?._serialized || serverWid})`
                };
            }

            // Step 4: Construct message key & message object
            const lidUser = MeUser.getMaybeMeLidUser ? MeUser.getMaybeMeLidUser() : null;
            const meUser = MeUser.getMaybeMePnUser ? MeUser.getMaybeMePnUser() : null;
            const newId = opts.messageId || await MsgKey.newId();
            const from = (chat.id && chat.id.isLid && chat.id.isLid()) ? (lidUser || meUser) : (meUser || lidUser);

            const newMsgKey = new MsgKey({
                from: from,
                to: chat.id,
                id: newId,
                participant: undefined,
                selfDir: 'out',
            });

            // A retry uses the persisted message key. Never resend a message already acknowledged.
            const existing = Collections.Msg.get(newMsgKey._serialized);
            if (existing && existing.ack >= 1) {
                return { success: true, messageId: newMsgKey._serialized, to: chat.id._serialized, ack: existing.ack };
            }
            // Step 5: Process media if sending document/image
            let mediaOptions = {};
            if (media && !window.WWebJS?.processMediaData) {
                throw new Error('WhatsApp media processor is not ready');
            }
            if (media) {
                try {
                    mediaOptions = await window.WWebJS.processMediaData(media, {
                        forceDocument: true,
                        forceMediaHd: false
                    });
                    delete mediaOptions.__x_id;
                    if (opts.caption) {
                        mediaOptions.caption = opts.caption;
                    }
                } catch (mediaErr) {
                    return {
                        success: false,
                        error: 'Failed to process media attachment: ' + (mediaErr?.message || mediaErr)
                    };
                }
            }

            let ephemeralFields = {};
            try {
                if (Ephemeral && Ephemeral.getEphemeralFields) {
                    ephemeralFields = Ephemeral.getEphemeralFields(chat);
                }
            } catch (e) {}

            const message = {
                id: newMsgKey,
                ack: 0,
                body: textMsg || '',
                from: from,
                to: chat.id,
                local: true,
                self: 'out',
                t: parseInt(new Date().getTime() / 1000),
                isNewMsg: true,
                type: media ? 'document' : 'chat',
                ...ephemeralFields,
                ...mediaOptions,
                ...(mediaOptions.toJSON ? mediaOptions.toJSON() : {}),
            };
            delete message.__x_id;
            message.id = newMsgKey;

            dispatched = true;
            const [msgPromise, sendMsgResultPromise] = SendMsgAction.addAndSendMsgToChat(chat, message);
            if (!sendMsgResultPromise?.then) throw new Error('WhatsApp returned no send confirmation');
            // Await both together so a rejected server send cannot become an unhandled rejection.
            await Promise.all([msgPromise, sendMsgResultPromise]);

            return {
                success: true,
                messageId: newMsgKey._serialized,
                to: chat.id._serialized,
                ack: Collections.Msg.get(newMsgKey._serialized)?.ack || 0
            };
        } catch (unhandledErr) {
            return {
                success: false,
                error: (unhandledErr && unhandledErr.message) ? unhandledErr.message : String(unhandledErr),
                dispatched,
                name: unhandledErr?.name || 'Error',
                stack: unhandledErr?.stack || null
            };
        }
    }, cleanTarget, text, mediaPayload, { caption: options.caption, messageId: options.messageId });

    if (!evalResult || !evalResult.success) {
        const detail = evalResult?.error || evalResult?.name || 'Unknown browser evaluation error';
        const error = new Error(detail);
        error.dispatched = Boolean(evalResult?.dispatched);
        throw error;
    }

    return evalResult;
}

/**
 * Safely send message to a recipient.
 * Uses one dispatcher; a failed or uncertain send is never retried by a second sender.
 */
export async function safeSendMessage(jid, content, options = {}) {
    if (!client || connectionState !== 'CONNECTED') throw new Error('WhatsApp is not connected');
    if (!jid) throw new Error('WhatsApp recipient is missing');
    await ensureMediaPatchApplied();
    // A timeout is an unknown delivery outcome, never proof of success. The outbox
    // retains the same message ID for the next attempt instead of firing a second sender.
    const result = await withTimeout(
        customSendWhatsAppMessage(jid, content, options),
        60000,
        'WhatsApp send timed out; delivery was not confirmed'
    );
    if (!result?.success || !result.messageId) throw new Error('WhatsApp returned no confirmed message');
    console.log(`[WHATSAPP] Send confirmed for ${jid} (ID: ${result.messageId})`);
    return result;
}

/**
 * Resolves all admin recipient JIDs, checking environment variables,
 * default admin number, and connected WhatsApp account self-chat.
 */
export async function getAdminJids() {
    const targets = new Set();
    const envAdmin = process.env.ADMIN_WHATSAPP || process.env.ADMIN_PHONE || process.env.NOTIFICATION_NUMBER;

    if (envAdmin) {
        const jid = await resolveWhatsAppJid(envAdmin);
        if (jid) targets.add(jid);
    } else {
        // Use default admin notification number
        const defaultJid = await resolveWhatsAppJid(DEFAULT_NOTIFICATION_NUMBER);
        if (defaultJid) targets.add(defaultJid);

        // Also if client is connected on another number (e.g. self-chat), notify it too!
        if (client && client.info && client.info.wid && client.info.wid._serialized) {
            targets.add(client.info.wid._serialized);
        }
    }
    return Array.from(targets);
}

/**
 * Resolves the admin recipient JID, checking environment variables
 * and WhatsApp Web self-messaging mode (backward compatibility).
 */
export function getAdminJid() {
    const adminPhone = process.env.ADMIN_WHATSAPP || process.env.ADMIN_PHONE || process.env.NOTIFICATION_NUMBER || DEFAULT_NOTIFICATION_NUMBER;
    if (client && client.info && client.info.wid) {
        const clientUser = String(client.info.wid.user || '');
        const cleanAdmin = String(adminPhone).replace(/\D/g, '').slice(-10);
        if (clientUser && clientUser.endsWith(cleanAdmin)) {
            // Self-messaging mode: use serialized WID to send message directly to own chat
            return client.info.wid._serialized;
        }
    }
    return formatWhatsAppJid(adminPhone);
}

/**
 * Build structured WhatsApp notification message for paid orders
 */
export function buildOrderNotificationMessage(order) {
    let itemsText = '• Item details unavailable';
    try {
        const items = typeof order.items === 'string' ? JSON.parse(order.items) : (order.items || []);
        if (Array.isArray(items) && items.length > 0) {
            itemsText = items.map((item, idx) => {
                const name = item.name || item.title || 'Plant / Product';
                const qty = item.qty || item.quantity || 1;
                const price = item.price ? `₹${item.price}` : '';
                return `  ${idx + 1}. *${name}* × ${qty} ${price ? `(${price})` : ''}`;
            }).join('\n');
        }
    } catch (e) {
        if (typeof order.items === 'string' && order.items.trim()) {
            itemsText = `• ${order.items}`;
        }
    }

    const formattedDate = new Date().toLocaleString('en-IN', {
        timeZone: 'Asia/Kolkata',
        dateStyle: 'medium',
        timeStyle: 'short'
    });

    const txnId = order.transaction_id || order.id;
    const phoneFormatted = order.phone ? `+91 ${order.phone.replace(/\D/g, '').slice(-10)}` : 'N/A';

    const invoiceUrl = getInvoiceUrl(order.id);

    return `🌿 *RASOBHOOMI PLANTATION - NEW PAID ORDER* 🌿
--------------------------------------------------
🆔 *Order ID:* #${order.id}
👤 *Customer Name:* ${order.name || 'N/A'}
📞 *Phone Number:* ${phoneFormatted}
📍 *Delivery Address:* ${order.address || ''}, ${order.city || ''} - ${order.zip || ''}

📦 *Ordered Items:*
${itemsText}

💰 *Total Paid:* ₹${order.total || 0}
💳 *Payment Status:* ${(order.payment_status || 'PAID').toUpperCase()}
🏷️ *Transaction ID:* ${txnId}
⏰ *Time:* ${formattedDate}
--------------------------------------------------
📄 *Tax Invoice:* Official PDF is attached below.
🔗 *View / Download PDF:* ${invoiceUrl}
--------------------------------------------------
✨ *Order confirmed & ready for processing.*`;
}

/**
 * Clean Chromium lock files recursively without removing session data
 */
function cleanChromiumLocks(dirPath) {
    if (!fs.existsSync(dirPath)) return;
    try {
        const entries = fs.readdirSync(dirPath, { withFileTypes: true });
        for (const entry of entries) {
            const fullPath = path.join(dirPath, entry.name);
            if (entry.isDirectory()) {
                cleanChromiumLocks(fullPath);
            } else if (['SingletonLock', 'SingletonSocket', 'SingletonCookie', 'DevToolsActivePort'].includes(entry.name)) {
                try {
                    fs.unlinkSync(fullPath);
                    console.log(`[WHATSAPP] Cleaned stale lock file: ${entry.name}`);
                } catch (e) {}
            }
        }
    } catch (e) {}
}

let initTimeoutTimer = null;

function clearLifecycleTimers() {
    clearTimeout(initTimeoutTimer);
    clearTimeout(reconnectTimer);
    initTimeoutTimer = null;
    reconnectTimer = null;
}

function scheduleReconnect(instance, reason) {
    if (stopping || client !== instance) return;
    clearTimeout(initTimeoutTimer);
    connectionState = 'DISCONNECTED';
    currentQrDataUrl = null;
    userInfo = null;
    lastEngineError = String(reason?.message || reason || 'WhatsApp disconnected');
    if (reconnectTimer) return;
    const delay = Math.min(60000, 5000 * 2 ** Math.min(initRetryCount++, 4));
    console.warn(`[WHATSAPP] ${lastEngineError}. Reconnecting in ${delay / 1000}s.`);
    reconnectTimer = setTimeout(() => {
        reconnectTimer = null;
        if (client !== instance) return;
        restartWhatsApp().catch(error => console.error('[WHATSAPP] Reconnect failed:', error));
    }, delay);
    reconnectTimer.unref?.();
}

function armReadyTimeout(instance) {
    clearTimeout(initTimeoutTimer);
    initTimeoutTimer = setTimeout(() => {
        if (client === instance && ['INITIALIZING', 'AUTHENTICATED'].includes(connectionState)) {
            scheduleReconnect(instance, `WhatsApp did not become ready (${connectionState})`);
        }
    }, 120000);
    initTimeoutTimer.unref?.();
}

/** Start exactly one browser for the saved WhatsApp session. */
export function initWhatsApp() {
    if (client || lifecycleTask || stopping) return;
    connectionState = 'INITIALIZING';
    currentQrDataUrl = null;
    userInfo = null;
    try {
        getOutbox(); // Restore notifications, without reading or changing the orders DB.
        const authPath = path.join(__dirname, '../.wwebjs_auth');
        fs.mkdirSync(authPath, { recursive: true });
        cleanChromiumLocks(authPath);
        const instance = new Client({
            authStrategy: new LocalAuth({ dataPath: authPath }),
            webVersionCache: {
                type: 'remote',
                remotePath: 'https://raw.githubusercontent.com/wppconnect-team/wa-version/main/html/{version}.html',
                strict: false
            },
            takeoverOnConflict: true,
            bypassCSP: true,
            authTimeoutMs: 120000,
            qrMaxRetries: 15,
            puppeteer: {
                headless: true,
                executablePath: getChromiumExecutablePath(),
                args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-dev-shm-usage',
                    '--disable-accelerated-2d-canvas', '--no-first-run', '--disable-gpu', '--disable-extensions']
            }
        });
        client = instance;
        armReadyTimeout(instance);
        instance.on('qr', async qr => {
            if (client !== instance || stopping) return;
            clearTimeout(initTimeoutTimer);
            connectionState = 'QR_READY';
            lastEngineError = null;
            try {
                const data = await QRCode.toDataURL(qr, { margin: 2, scale: 8 });
                if (client === instance && connectionState === 'QR_READY') currentQrDataUrl = data;
            } catch (error) { console.error('[WHATSAPP] QR generation failed:', error); }
        });
        instance.on('loading_screen', percent => {
            if (client === instance) console.log(`[WHATSAPP] Loading: ${percent}%`);
        });
        instance.on('authenticated', () => {
            if (client !== instance || stopping) return;
            connectionState = 'AUTHENTICATED';
            currentQrDataUrl = null;
            // Authentication precedes injection of WWebJS; keep watching until ready.
            armReadyTimeout(instance);
        });
        instance.on('ready', async () => {
            if (client !== instance || stopping) return;
            clearLifecycleTimers();
            connectionState = 'CONNECTED';
            currentQrDataUrl = null;
            lastEngineError = null;
            initRetryCount = 0;
            userInfo = {
                name: instance.info?.pushname || 'Rasobhoomi WhatsApp',
                number: instance.info?.wid?.user ? `+${instance.info.wid.user}` : 'Connected'
            };
            await ensureMediaPatchApplied();
            if (client === instance && connectionState === 'CONNECTED') getOutbox().kick(true);
        });
        instance.on('auth_failure', reason => scheduleReconnect(instance, `Authentication failed: ${reason}`));
        instance.on('disconnected', reason => scheduleReconnect(instance, reason));
        instance.on('message_ack', (message, ack) => {
            if (client !== instance || stopping) return;
            try { outbox?.recordAcknowledgement(message.id?._serialized, ack); }
            catch (error) { console.error('[WHATSAPP] Could not save delivery receipt:', error); }
        });
        instance.initialize().then(() => {
            // A browser may finish launching after a user requests reconnect/logout.
            if (client !== instance) return instance.destroy();
        }).catch(error => scheduleReconnect(instance, error));
    } catch (error) {
        scheduleReconnect(client, error);
    }
}

export function getWhatsAppStatus() {
    const adminPhone = process.env.ADMIN_WHATSAPP || process.env.ADMIN_PHONE || process.env.NOTIFICATION_NUMBER || DEFAULT_NOTIFICATION_NUMBER;
    return {
        status: connectionState,
        qrCode: currentQrDataUrl,
        user: userInfo,
        lastError: lastEngineError,
        isReady: connectionState === 'CONNECTED' && !!client,
        targetNumber: `+91 ${String(adminPhone).replace(/\D/g, '').slice(-10)}`,
        ...(outbox?.status() || { pendingNotifications: 0, awaitingDelivery: 0, lastDeliveryError: null })
    };
}

async function restartWhatsApp(logout = false) {
    if (lifecycleTask) {
        await lifecycleTask;
        return getWhatsAppStatus();
    }
    lifecycleTask = (async () => {
        clearLifecycleTimers();
        stopping = true;
        const previous = client;
        client = null; // Ignore late events from the previous browser.
        connectionState = 'DISCONNECTED';
        currentQrDataUrl = null;
        userInfo = null;
        try {
            if (logout && previous) {
                try { await previous.logout(); } catch (error) {
                    console.warn('[WHATSAPP] Logout:', error.message);
                }
            }
            // Failed launches have no browser to destroy. whatsapp-web.js's
            // destroy() dereferences pupBrowser, so calling it then blocks recovery.
            if (previous?.pupBrowser) await previous.destroy();
            if (logout) {
                // Explicit logout clears only WhatsApp session files. Notification
                // receipts live in a separate volume; database volumes are untouched.
                const authPath = path.join(__dirname, '../.wwebjs_auth');
                if (fs.existsSync(authPath)) {
                    for (const item of fs.readdirSync(authPath)) {
                        fs.rmSync(path.join(authPath, item), { recursive: true, force: true });
                    }
                }
            }
        } catch (error) {
            client = previous;
            throw error;
        } finally {
            stopping = false;
        }
    })();
    try {
        await lifecycleTask;
    } catch (error) {
        scheduleReconnect(client, error);
        throw error;
    } finally {
        lifecycleTask = null;
    }
    initWhatsApp();
    return getWhatsAppStatus();
}

export async function reconnectWhatsApp() {
    initRetryCount = 0;
    return restartWhatsApp();
}

/**
 * Build structured WhatsApp confirmation message for customer in their selected language
 */
export function buildCustomerOrderMessage(order) {
    const lang = order.lang || 'en';
    let itemsText = '• Item details unavailable';
    try {
        const items = typeof order.items === 'string' ? JSON.parse(order.items) : (order.items || []);
        if (Array.isArray(items) && items.length > 0) {
            itemsText = items.map((item, idx) => {
                const itemObj = translateProduct(item, lang);
                const name = itemObj.name || item.name || item.title || 'Plant / Product';
                const qty = item.qty || item.quantity || 1;
                const price = item.price ? `₹${item.price}` : '';
                return `  ${idx + 1}. *${name}* × ${qty} ${price ? `(${price})` : ''}`;
            }).join('\n');
        }
    } catch (e) {
        if (typeof order.items === 'string' && order.items.trim()) {
            itemsText = `• ${order.items}`;
        }
    }

    const customerName = order.name ? order.name.trim() : 'Customer';
    const txnId = order.transaction_id || order.id;

    if (lang === 'hi') {
        return `🌿 *रसोभूमि प्लांटेशन से ऑर्डर करने के लिए आपका धन्यवाद!* 🌿
--------------------------------------------------
प्रिय *${customerName}*,

हमें आपका भुगतान प्राप्त हो गया है और आपका ऑर्डर *#${order.id}* सफलतापूर्वक कन्फर्म हो गया है! 🎉

📦 *ऑर्डर किए गए पौधे:*
${itemsText}

💰 *कुल भुगतान:* ₹${order.total || 0}
💳 *भुगतान स्थिति:* सफलता (PAID)
🏷️ *ट्रांजैक्शन आईडी:* ${txnId}

📍 *डिलिवरी पता:*
${order.address || ''}, ${order.city || ''} ${order.zip ? `- ${order.zip}` : ''}

--------------------------------------------------
📄 *टैक्स इनवॉइस:* आपका आधिकारिक टैक्स इनवॉइस PDF दस्तावेज़ नीचे सीधे संलग्न है। 🪴
--------------------------------------------------

यदि आपका कोई प्रश्न है, तो इस व्हाट्सएप संदेश का उत्तर दें या हमसे संपर्क करें (+91 89720 76182)।

*रसोभूमि प्लांटेशन* को चुनने के लिए धन्यवाद! 🪴✨`;
    }

    if (lang === 'bn') {
        return `🌿 *রসভূমি প্ল্যান্টেশন থেকে অর্ডারের জন্য আপনাকে ধন্যবাদ!* 🌿
--------------------------------------------------
প্রিয় *${customerName}*,

আমরা আপনার পেমেন্ট পেয়েছি এবং আপনার অর্ডার *#${order.id}* সফলভাবে নিশ্চিত হয়েছে! 🎉

📦 *অর্ডার করা চারা/পণ্য:*
${itemsText}

💰 *মোট পেমেন্ট:* ₹${order.total || 0}
💳 *পেমেন্ট স্ট্যাটাস:* সফল (PAID)
🏷️ *ট্রানজ্যাকশন আইডি:* ${txnId}

📍 *ডেলিভারি ঠিকানা:*
${order.address || ''}, ${order.city || ''} ${order.zip ? `- ${order.zip}` : ''}

--------------------------------------------------
📄 *ট্যাক্স ইনভয়েস:* আপনার অফিশিয়াল ট্যাক্স ইনভয়েস PDF ডকুমেন্টটি নিচে সরাসরি সংযুক্ত করা হলো। 🪴
--------------------------------------------------

যেকোনো প্রশ্নের জন্য এই হোয়াটসঅ্যাপ মেসেজের উত্তর দিন অথবা যোগাযোগ করুন (+91 89720 76182)।

*রসভূমি প্ল্যান্টেশন* বেছে নেওয়ার জন্য ধন্যবাদ! 🪴✨`;
    }

    return `🌿 *THANK YOU FOR YOUR ORDER WITH RASOBHOOMI PLANTATION!* 🌿
--------------------------------------------------
Dear *${customerName}*,

We have received your payment and your order *#${order.id}* is successfully confirmed! 🎉

📦 *Ordered Items:*
${itemsText}

💰 *Total Paid:* ₹${order.total || 0}
💳 *Payment Status:* ${(order.payment_status || 'PAID').toUpperCase()}
🏷️ *Transaction ID:* ${txnId}

📍 *Delivery Address:*
${order.address || ''}, ${order.city || ''} ${order.zip ? `- ${order.zip}` : ''}

--------------------------------------------------
📄 *Tax Invoice:* Your official Tax Invoice PDF document is attached directly below. 🪴
--------------------------------------------------

If you have any questions, feel free to reply directly to this message or contact us on WhatsApp (+91 89720 76182).

Thank you for choosing *Rasobhoomi Plantation* for a greener home! 🪴✨`;
}

/**
 * Send Payment Success Notification & Invoice PDF for an Order to Admin and Customer
 */
export async function sendOrderPaymentNotification(order, force = false) {
    return queueOrderNotification('paid', order, { force });
}

/**
 * Build WhatsApp notification message for pending / incomplete payments (Headline + Customer Details ONLY)
 */
export function buildPendingPaymentNotificationMessage(order) {
    let itemsText = '• Item details unavailable';
    try {
        const items = typeof order.items === 'string' ? JSON.parse(order.items) : (order.items || []);
        if (Array.isArray(items) && items.length > 0) {
            itemsText = items.map((item, idx) => {
                const name = item.name || item.title || 'Plant / Product';
                const qty = item.qty || item.quantity || 1;
                const price = item.price ? `₹${item.price}` : '';
                return `  ${idx + 1}. *${name}* × ${qty} ${price ? `(${price})` : ''}`;
            }).join('\n');
        }
    } catch (e) {
        if (typeof order.items === 'string' && order.items.trim()) {
            itemsText = `• ${order.items}`;
        }
    }

    const formattedDate = new Date().toLocaleString('en-IN', {
        timeZone: 'Asia/Kolkata',
        dateStyle: 'medium',
        timeStyle: 'short'
    });

    const phoneFormatted = order.phone ? `+91 ${order.phone.replace(/\D/g, '').slice(-10)}` : 'N/A';
    const addressFormatted = `${order.address || ''}, ${order.city || ''}${order.zip ? ` - ${order.zip}` : ''}`;

    return `⚠️ *RASOBHOOMI - NEW ORDER / PENDING PAYMENT* ⚠️
--------------------------------------------------
🆔 *Order ID:* #${order.id}
👤 *Customer Name:* ${order.name || 'N/A'}
📞 *Phone Number:* ${phoneFormatted}
📍 *Delivery Address:* ${addressFormatted || 'N/A'}

📦 *Ordered Items:*
${itemsText}

💰 *Amount Pending:* ₹${order.total || 0}
⏰ *Time:* ${formattedDate}
--------------------------------------------------
📄 *Tax Invoice:* Official PDF invoice document is attached directly below. 🪴
--------------------------------------------------`;
}

/**
 * Build sweet WhatsApp notification message for customer when an order is placed
 */
export function buildCustomerPendingOrderMessage(order) {
    const customerName = order.name ? order.name.trim() : 'Valued Customer';
    const lang = order.lang || 'en';

    let itemsText = '• Plants / Products';
    try {
        const items = typeof order.items === 'string' ? JSON.parse(order.items) : (order.items || []);
        if (Array.isArray(items) && items.length > 0) {
            itemsText = items.map((item, idx) => {
                const itemObj = translateProduct(item, lang);
                const name = itemObj.name || item.name || item.title || 'Plant / Product';
                const qty = item.qty || item.quantity || 1;
                const price = item.price ? `₹${item.price}` : '';
                return `  ${idx + 1}. *${name}* × ${qty} ${price ? `(${price})` : ''}`;
            }).join('\n');
        }
    } catch (e) {}

    if (lang === 'hi') {
        return `🌿 *रसोभूमि प्लांटेशन - आपका ऑर्डर प्राप्त हुआ!* 🌿
--------------------------------------------------
नमस्ते *${customerName}*,

आपके ऑर्डर *#${order.id}* का विवरण प्राप्त हो गया है।

📦 *ऑर्डर किए गए पौधे:*
${itemsText}

💰 *कुल राशि:* ₹${order.total || 0}
📍 *डिलिवरी पता:*
${order.address || ''}, ${order.city || ''} ${order.zip ? `- ${order.zip}` : ''}

--------------------------------------------------
📄 *टैक्स इनवॉइस:* आपका आधिकारिक इनवॉइस PDF दस्तावेज़ नीचे संलग्न है। 🪴
--------------------------------------------------

यदि आपका कोई प्रश्न है, तो हमसे व्हाट्सएप (+91 89720 76182) पर संपर्क करें।
*रसोभूमि प्लांटेशन* को चुनने के लिए धन्यवाद! 🪴✨`;
    }

    if (lang === 'bn') {
        return `🌿 *রসভূমি প্ল্যান্টেশন - আপনার অর্ডার গৃহীত হয়েছে!* 🌿
--------------------------------------------------
নমস্কার *${customerName}*,

আপনার অর্ডার *#${order.id}* এর বিবরণ আমরা পেয়েছি।

📦 *অর্ডার করা চারা/পণ্য:*
${itemsText}

💰 *মোট মূল্য:* ₹${order.total || 0}
📍 *ডেলিভারি ঠিকানা:*
${order.address || ''}, ${order.city || ''} ${order.zip ? `- ${order.zip}` : ''}

--------------------------------------------------
📄 *ট্যাক্স ইনভয়েস:* আপনার অফিশিয়াল ইনভয়েস PDF ডকুমেন্টটি নিচে সংযুক্ত করা হলো। 🪴
--------------------------------------------------

যেকোনো সহায়তার জন্য যোগাযোগ করুন (+91 89720 76182)।
*রসভূমি প্ল্যান্টেশন* বেছে নেওয়ার জন্য ধন্যবাদ! 🪴✨`;
    }

    return `🌿 *RASOBHOOMI PLANTATION - ORDER RECEIVED!* 🌿
--------------------------------------------------
Dear *${customerName}*,

Thank you for placing your order *#${order.id}* with Rasobhoomi Plantation!

📦 *Ordered Items:*
${itemsText}

💰 *Total Amount:* ₹${order.total || 0}
📍 *Delivery Address:*
${order.address || ''}, ${order.city || ''} ${order.zip ? `- ${order.zip}` : ''}

--------------------------------------------------
📄 *Tax Invoice:* Your official Invoice PDF document is attached directly below. 🪴
--------------------------------------------------

For queries or support, feel free to reply directly or WhatsApp us (+91 89720 76182).
Thank you for choosing *Rasobhoomi Plantation*! 🪴✨`;
}

/**
 * Send Pending Payment notification and Invoice PDF to Admin and Customer WhatsApp numbers
 */
export async function sendPendingPaymentNotification(order, force = false) {
    return queueOrderNotification('pending', order, { force });
}

/**
 * Directly sends the PDF invoice file to a specific recipient phone number or to both admin and customer.
 */
export async function sendDirectInvoicePdf(order, targetPhone = null) {
    if (!order || !order.id) return { success: false, error: 'Invalid order data' };
    const ready = await waitForReady(12000);
    if (!ready || !client) {
        return { success: false, error: `WhatsApp not connected (Status: ${connectionState})` };
    }

    const pdfLang = order.lang || 'en';
    const pdfBuffer = await withTimeout(generateInvoicePdf(order, pdfLang), 30000, 'Invoice PDF generation timed out');
    if (!pdfBuffer || pdfBuffer.length === 0) {
        return { success: false, error: 'Failed to generate PDF invoice' };
    }

    const targets = [];
    if (targetPhone) {
        const jid = await resolveWhatsAppJid(targetPhone);
        if (jid) targets.push(jid);
    } else {
        const adminJids = await getAdminJids();
        targets.push(...adminJids);
        if (order.phone) {
            const custJid = await resolveWhatsAppJid(order.phone);
            if (custJid && !targets.includes(custJid)) targets.push(custJid);
        }
    }

    let sentCount = 0;
    let pdfSentCount = 0;
    const invoiceUrl = getInvoiceUrl(order.id);
    const companionMsg = `🌿 *Rasobhoomi Plantation - Tax Invoice for Order #${order.id}*\n\nPlease find your official Tax Invoice PDF document attached directly below. 📄🪴\n🔗 *Download Online:* ${invoiceUrl}`;

    for (const jid of targets) {
        try {
            await safeSendMessage(jid, companionMsg);
            sentCount++;
        } catch (msgErr) {
            console.warn(`[WHATSAPP] Failed to send companion text to ${jid}:`, msgErr.message);
        }
        await new Promise(r => setTimeout(r, 1200));
        const ok = await sendPdfDocumentSafe(jid, pdfBuffer, order.id);
        if (ok) { sentCount++; pdfSentCount++; }
        await new Promise(r => setTimeout(r, 1200));
    }

    const success = targets.length > 0 && pdfSentCount === targets.length;
    return { success, sentCount, pdfSentCount, error: success ? undefined : 'PDF delivery was not confirmed for every recipient' };
}

/**
 * Build sweet, delightful WhatsApp status update message for customer
 */
export function buildOrderStatusMessage(order, newStatus) {
    const customerName = order.name ? order.name.trim() : 'Valued Customer';
    const statusKey = String(newStatus || '').toLowerCase().trim();

    let itemsText = '• Item details unavailable';
    try {
        const items = typeof order.items === 'string' ? JSON.parse(order.items) : (order.items || []);
        if (Array.isArray(items) && items.length > 0) {
            itemsText = items.map((item, idx) => {
                const name = item.name || item.title || 'Plant / Product';
                const qty = item.qty || item.quantity || 1;
                return `  ${idx + 1}. *${name}* × ${qty}`;
            }).join('\n');
        }
    } catch (e) {
        if (typeof order.items === 'string' && order.items.trim()) {
            itemsText = `• ${order.items}`;
        }
    }

    const deliveryAddress = [order.address, order.city, order.zip ? `- ${order.zip}` : ''].filter(Boolean).join(', ');

    if (statusKey === 'in-process' || statusKey === 'in_process' || statusKey === 'processing') {
        return `🌿 *RASOBHOOMI PLANTATION - ORDER UPDATE* 🌿
--------------------------------------------------
Dearest *${customerName}*, 🌸

Wonderful news! We are loving and pampering your plant babies for Order *#${order.id}*! 🪴💚

Our nursery team is carefully inspecting, watering, and packing your plants with utmost care so they reach you fresh, healthy, and vibrant!

📦 *Your Ordered Items:*
${itemsText}

We can't wait for your home and garden to blossom! Thank you for choosing *Rasobhoomi Plantation*. ✨🌿`;
    }

    if (statusKey === 'in-transit' || statusKey === 'in_transit' || statusKey === 'dispatched' || statusKey === 'shipped') {
        const courierName = (order.courier_name || 'dtdc').toUpperCase();
        let trackingDetails = '';
        if (order.courier_name === 'dtdc') {
            trackingDetails = `• *Courier:* DTDC Express 🚚\n• *Tracking AWB:* ${order.tracking_id || 'N/A'}\n• *Track Here:* https://www.dtdc.in/tracking.asp`;
        } else if (order.courier_name === 'amazon') {
            trackingDetails = `• *Courier:* Amazon Shipping 📦\n• *Tracking ID:* ${order.tracking_id || 'N/A'}\n• *Track Here:* https://track.amazon.in/tracking/${order.tracking_id || ''}`;
        } else if (order.courier_name === 'rail') {
            trackingDetails = `• *Delivery Method:* Rail / Train Transport 🚂\n• *Note:* Delivery will be done in hand by Rasobhoomi team upon arrival.`;
        } else if (order.courier_name === 'bus') {
            trackingDetails = `• *Delivery Method:* BUS Transport 🚌\n• *Note:* Delivery will be done in hand by Rasobhoomi team upon arrival.`;
        } else {
            trackingDetails = `• *Delivery Method:* ${courierName}\n• *Tracking ID:* ${order.tracking_id || 'Hand Delivery'}`;
        }

        return `🌿 *RASOBHOOMI PLANTATION - ORDER DISPATCHED!* 🌿
--------------------------------------------------
Yay, *${customerName}*! 🚀📦
Your green companions for Order *#${order.id}* are on their way to you!

🚚 *Shipment Details:*
${trackingDetails}

📦 *Items in Transit:*
${itemsText}

📍 *Delivery Destination:*
${deliveryAddress}

💡 *Quick Tip:* Once your green friends arrive, give them a gentle spray of water and place them in partial shade to rest after their journey! 🪴💧

Thank you for bringing nature into your life with *Rasobhoomi Plantation*! 🌸💚`;
    }

    if (statusKey === 'completed' || statusKey === 'delivered') {
        return `🌿 *RASOBHOOMI PLANTATION - ORDER DELIVERED!* 🌿
--------------------------------------------------
Dearest *${customerName}*, 🎉🏡
Your Order *#${order.id}* has been marked as *DELIVERED*!

We hope your new plant babies bring boundless joy, positivity, and fresh air into your home! 🪴✨

📦 *Delivered Items:*
${itemsText}

🌱 *Plant Care & Support:*
If you ever have any questions about soil, watering, or sunlight for your plants, we are always just a message away right here on WhatsApp!

If you loved your experience, we would mean the world to us if you shared your green corners with us! 💚

Thank you for choosing *Rasobhoomi Plantation*! 🌸🌿`;
    }

    if (statusKey === 'cancelled') {
        return `🌿 *RASOBHOOMI PLANTATION - ORDER CANCELLED* 🌿
--------------------------------------------------
Dear *${customerName}*, 🌸

Your Order *#${order.id}* status has been updated to *CANCELLED*.

If you have any questions or need assistance, please feel free to reply directly to this message or call/WhatsApp us at +91 89720 76182. We are always here to help you! 💚`;
    }

    // Default / General Status Change
    const formattedStatus = statusKey.replace(/[-_]/g, ' ').toUpperCase();
    return `🌿 *RASOBHOOMI PLANTATION - ORDER STATUS UPDATE* 🌿
--------------------------------------------------
Dear *${customerName}*, 🌸

The status of your Order *#${order.id}* has been updated to: *${formattedStatus}* ✨

📦 *Ordered Items:*
${itemsText}

If you have any questions, feel free to reply to this WhatsApp message anytime.

Thank you for trusting *Rasobhoomi Plantation* for a greener world! 🪴💚`;
}

/**
 * Send WhatsApp Notification to Customer for Order Status Change
 */
export async function sendOrderStatusNotification(order, newStatus) {
    return queueOrderNotification('status', order, { newStatus });
}

/**
 * Send a custom test message to verify connection
 */
export async function sendTestMessage(targetNumber = DEFAULT_NOTIFICATION_NUMBER) {
    const ready = await waitForReady(8000);
    if (!ready || !client) {
        throw new Error(`WhatsApp is not connected (Current status: ${connectionState})`);
    }

    const jid = await resolveWhatsAppJid(targetNumber);
    if (!jid) {
        throw new Error(`Invalid recipient phone number: ${targetNumber}`);
    }

    const testMsg = `🧪 *Rasobhoomi Plantation - WhatsApp Test Alert*\n\n✅ WhatsApp integration is ACTIVE and working properly!\n⏰ Server Time: ${new Date().toLocaleString('en-IN', { timeZone: 'Asia/Kolkata' })}\n🌿 Ready to dispatch order alerts and tax invoices.`;
    await safeSendMessage(jid, testMsg);
    return { success: true, recipient: jid };
}

/**
 * Logout and clear session
 */
export async function logoutWhatsApp() {
    await restartWhatsApp(true);
    return { success: true };
}

/**
 * Build 2-Step WhatsApp Recovery Notification Copy for Failed/Pending Orders
 * @param {Object} order Order record from DB
 * @param {Number} phase 1 (Immediate Nudge: 15-30m), 2 (72-Hour Follow Up)
 * @returns {String} Formatted WhatsApp message copy
 */
export function buildRecoveryNotificationMessage(order, phase = 1) {
    const lang = (order.lang || 'bn').toLowerCase();
    const isBn = lang === 'bn';
    const customerName = (order.name || (isBn ? 'গ্রাহক' : 'Customer')).trim();
    const orderId = order.id || 'N/A';
    const total = order.total || 0;
    const checkoutLink = `https://rasobhoomiplantation.com/checkout?order_id=${encodeURIComponent(orderId)}`;

    if (phase === 1) {
        // Message 1: Gentle Nudge (~15-30 mins after payment failure)
        if (isBn) {
            return `🪴 *নমস্কার ${customerName}! আপনার গাছের চারাগুলি অপেক্ষায় আছে।*

আপনার অর্ডার *#${orderId}*-এর পেমেন্টটি কোনো কারণে অসম্পূর্ণ রয়ে গেছে। চিন্তা করবেন না, আপনার পছন্দের চারা গাছগুলি আপনার কার্টে নিরাপদেই সংরক্ষিত আছে! 🌿

🛒 *আপনার অর্ডার সম্পন্ন করতে নিচের লিঙ্কে ক্লিক করুন:*
${checkoutLink}

যেকোনো সহায়তার জন্য সরাসরি এই মেসেজের উত্তর দিন অথবা কল করুন: +91 89720 76182 📞

— *রসোভূমি প্ল্যান্টেশন*`;
        } else {
            return `🪴 *Hi ${customerName}! Your saplings are waiting for you.*

It looks like your payment for Order *#${orderId}* was not completed. Don't worry, your selected plants are safely held in your cart! 🌿

🛒 *Click here to complete your order now:*
${checkoutLink}

Need help? Reply directly to this WhatsApp message or call +91 89720 76182 📞

— *Rasobhoomi Plantation*`;
        }
    } else {
        // Message 2: Follow-up (~72 hours / 3 days after failure)
        if (isBn) {
            return `🪴 *নমস্কার ${customerName}, রসোভূমি থেকে কোনো সাহায্যের প্রয়োজন?*

আমরা লক্ষ্য করেছি আপনার অর্ডার *#${orderId}* (মূল্য: ₹${total}) এখনো বাকি রয়েছে। গাছের সঠিক পরিচর্যা, চারা নির্বাচন বা পেমেন্ট সংক্রান্ত যেকোনো তথ্যের জন্য আমরা আপনাকে সাহায্য করতে প্রস্তুত! 🌱

🌿 *আপনার সংরক্ষিত অর্ডারটি দেখতে ও সম্পন্ন করতে এখানে যান:*
${checkoutLink}

📞 আমাদের নার্সারি বিশেষজ্ঞের সাথে কথা বলতে সরাসরি এই মেসেজে উত্তর দিন।

— *রসোভূমি প্ল্যান্টেশন টিম*`;
        } else {
            return `🪴 *Need any assistance with your order, ${customerName}?*

We noticed your order *#${orderId}* (Total: ₹${total}) is still pending. If you have any questions about plant care, sapling selection, or payment options, we're happy to help! 🌱

🌿 *Click here to review & complete your order:*
${checkoutLink}

📞 Reply to this message anytime to chat with our nursery horticulturists.

— *Rasobhoomi Plantation Team*`;
        }
    }
}

/**
 * Send Automated Recovery WhatsApp Message to Customer (Phases 1, 2, or 3)
 */
export async function sendPaymentRecoveryWhatsApp(order, phase = 1) {
    if (!order || !order.id || !order.phone) return { success: false, error: 'Invalid order or missing phone number' };

    // STRICT CHECK: If order has already been paid, ABORT immediately!
    const paymentStatus = String(order.payment_status || '').toLowerCase();
    const orderStatus = String(order.status || '').toLowerCase();
    if (paymentStatus === 'paid' || orderStatus === 'new' || orderStatus === 'completed') {
        console.log(`[WHATSAPP RECOVERY] Order #${order.id} is already paid. Skipping recovery Phase ${phase}.`);
        return { success: true, skipped: true, reason: 'Already paid' };
    }

    const ready = await waitForReady(12000);
    if (!ready || !client) {
        console.warn(`[WHATSAPP RECOVERY] Cannot send Phase ${phase} message. WhatsApp state is '${connectionState}'`);
        return { success: false, error: `WhatsApp not connected (Status: ${connectionState})` };
    }

    try {
        const customerJid = await resolveWhatsAppJid(order.phone);
        if (!customerJid) {
            return { success: false, error: 'Invalid WhatsApp JID format' };
        }

        const msgText = buildRecoveryNotificationMessage(order, phase);
        console.log(`[WHATSAPP RECOVERY] Sending Phase ${phase} recovery message for order #${order.id} to ${customerJid}...`);

        const messageId = createHash('sha256').update(`recovery:${order.id}:${phase}`).digest('hex').slice(0, 32).toUpperCase();
        await safeSendMessage(customerJid, msgText, { messageId });
        console.log(`[WHATSAPP RECOVERY] Phase ${phase} recovery send confirmed for ${customerJid}.`);
        return { success: true };
    } catch (err) {
        console.error(`[WHATSAPP RECOVERY] Error sending Phase ${phase} message for order #${order.id}:`, err);
        return { success: false, error: err.message };
    }
}

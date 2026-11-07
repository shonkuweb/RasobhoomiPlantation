import '../scripts/patch_wwebjs.js';
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

// Target phone number for payment success notifications
export const DEFAULT_NOTIFICATION_NUMBER = process.env.ADMIN_WHATSAPP || process.env.ADMIN_PHONE || process.env.NOTIFICATION_NUMBER || '9907541613';


export const SITE_URL = (process.env.APP_FE_URL || process.env.APP_BE_URL || 'https://rasobhoomiplantation.com').replace(/\/+$/, '');

export function getInvoiceUrl(orderId) {
    return `${SITE_URL}/api/orders/${encodeURIComponent(orderId)}/invoice`;
}

function withTimeout(promise, ms, errorMsg) {
    return Promise.race([
        promise,
        new Promise((_, reject) => setTimeout(() => reject(new Error(errorMsg)), ms))
    ]);
}

/**
 * Injects in-browser safety hooks to prevent WhatsApp Web's
 * "Data passed to getter must include an id property" crash when sending media
 */
export async function ensureMediaPatchApplied() {
    if (!client || !client.pupPage) return;
    try {
        await client.pupPage.evaluate(() => {
            if (window._wwebjs_media_patch_installed) return;

            // 1. Hook processMediaData so media attributes don't overwrite message.id with undefined
            if (window.WWebJS && window.WWebJS.processMediaData) {
                const origProcess = window.WWebJS.processMediaData;
                window.WWebJS.processMediaData = async function () {
                    const result = await origProcess.apply(this, arguments);
                    if (result) {
                        try {
                            delete result.id;
                            delete result.__x_id;
                            if (result.toJSON) {
                                const origToJSON = result.toJSON;
                                result.toJSON = function () {
                                    const json = origToJSON.apply(this, arguments) || {};
                                    delete json.id;
                                    delete json.__x_id;
                                    return json;
                                };
                            }
                        } catch (e) {}
                    }
                    return result;
                };
            }

            // 2. Hook addAndSendMsgToChat directly as an extra safety layer
            try {
                const SendAction = window.require && window.require('WAWebSendMsgChatAction');
                if (SendAction && SendAction.addAndSendMsgToChat && !SendAction._idPatchInstalled) {
                    const origAddAndSend = SendAction.addAndSendMsgToChat;
                    SendAction.addAndSendMsgToChat = function (chat, message) {
                        if (chat && chat.id && message) {
                            delete message.__x_id;
                            if (!message.id || typeof message.id !== 'object' || !message.id._serialized) {
                                try {
                                    const MsgKey = window.require('WAWebMsgKey');
                                    const { getMaybeMeLidUser, getMaybeMePnUser } = window.require('WAWebUserPrefsMeUser');
                                    const from = (chat.id.isLid && chat.id.isLid()) ? getMaybeMeLidUser() : getMaybeMePnUser();
                                    const newId = (MsgKey.newId ? MsgKey.newId() : ('3EB0' + Math.random().toString(36).substring(2, 12).toUpperCase()));
                                    message.id = new MsgKey({
                                        from: from,
                                        to: chat.id,
                                        id: newId,
                                        selfDir: 'out'
                                    });
                                } catch (err) {}
                            }
                        }
                        return origAddAndSend.apply(this, arguments);
                    };
                    SendAction._idPatchInstalled = true;
                }
            } catch (e) {}

            // 3. Hook window.WWebJS.getChat to handle "No LID for user" / evaluation failure gracefully
            try {
                if (window.WWebJS && window.WWebJS.getChat && !window._wwebjs_getchat_patch_installed) {
                    const origGetChat = window.WWebJS.getChat;
                    window.WWebJS.getChat = async function (chatId, options = {}) {
                        try {
                            const res = await origGetChat.apply(this, arguments);
                            if (res) return res;
                        } catch (origErr) {}

                        try {
                            let chatWid = window.require('WAWebWidFactory').createWid(chatId);
                            let chat = null;
                            try {
                                const ChatCol = window.require('WAWebCollections').Chat;
                                chat = ChatCol.get(chatWid) || (await ChatCol.find(chatWid));
                            } catch (e0) {}

                            if (!chat) {
                                try {
                                    const FindAction = window.require('WAWebFindChatAction');
                                    const res1 = await FindAction.findOrCreateLatestChat(chatWid);
                                    chat = res1?.chat || res1;
                                } catch (e1) {
                                    try {
                                        const QueryJob = window.require('WAWebQueryExistsJob');
                                        const existRes = await QueryJob.queryWidExists(chatWid);
                                        if (existRes && existRes.wid) {
                                            const FindAction = window.require('WAWebFindChatAction');
                                            const res2 = await FindAction.findOrCreateLatestChat(existRes.wid);
                                            chat = res2?.chat || res2;
                                        }
                                    } catch (e2) {}
                                }
                            }

                            if (!chat) return null;
                            if (options && options.getAsModel) {
                                try {
                                    return await window.WWebJS.getChatModel(chat);
                                } catch (mErr) {
                                    return chat;
                                }
                            }
                            return chat;
                        } catch (fatal) {
                            return null;
                        }
                    };
                    window._wwebjs_getchat_patch_installed = true;
                }
            } catch (e) {}

            window._wwebjs_media_patch_installed = true;
        });
    } catch (err) {
        // Puppeteer page may still be loading
    }
}

/**
 * Safely send a direct PDF invoice document to a WhatsApp recipient.
 */
export async function sendPdfDocumentSafe(targetJid, pdfBuffer, orderId) {
    if (!targetJid || !pdfBuffer || !client) return false;
    await ensureMediaPatchApplied();
    try {
        const filename = `Invoice_${orderId}.pdf`;
        const b64Data = Buffer.isBuffer(pdfBuffer) ? pdfBuffer.toString('base64') : String(pdfBuffer);
        const media = new MessageMedia(
            'application/pdf',
            b64Data,
            filename,
            pdfBuffer.length || b64Data.length
        );

        console.log(`[WHATSAPP] Dispatching direct PDF document (${filename}, ${pdfBuffer.length} bytes) to ${targetJid}...`);

        const res = await safeSendMessage(targetJid, '', {
            media,
            caption: `📄 Order #${orderId} Tax Invoice`
        });

        if (res && (res.success || res.messageId)) {
            console.log(`[WHATSAPP] Direct PDF invoice document sent successfully to ${targetJid} for order #${orderId}`);
            return true;
        }
        return false;
    } catch (finalErr) {
        console.error(`[WHATSAPP] Failed to send direct PDF document to ${targetJid} for order #${orderId}:`, finalErr.message);
        return false;
    }
}

let client = null;
let currentQrDataUrl = null;
let connectionState = 'DISCONNECTED'; // DISCONNECTED, INITIALIZING, QR_READY, CONNECTED
let userInfo = null;
let lastEngineError = null;
const notifiedOrderIds = new Set();
const notifiedPendingOrderIds = new Set();
let initRetryCount = 0;
const MAX_INIT_RETRIES = 3;

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
        const contact = await client.getNumberId(cleaned);
        if (contact && contact._serialized) {
            return contact._serialized;
        }
    } catch (e) {
        console.warn(`[WHATSAPP] getNumberId check failed for ${cleaned}:`, e.message);
    }
    return rawJid;
}

/**
 * Direct in-page WhatsApp message dispatcher.
 * Bypasses all known whatsapp-web.js bugs:
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
                } catch (errServerWid) {
                    // 3d. FindOrCreateLatestChat with rawWid
                    try {
                        const res2 = await FindChatAction.findOrCreateLatestChat(rawWid);
                        chat = res2?.chat || res2;
                    } catch (errRawWid) {}
                }
            }

            // 3e. Direct instantiation fallback if findOrCreate failed
            if (!chat) {
                try {
                    const ChatClass = Collections.Chat.modelClass;
                    if (ChatClass) {
                        chat = new ChatClass({ id: serverWid });
                        Collections.Chat.add(chat);
                    }
                } catch (instErr) {}
            }

            if (!chat) {
                return {
                    success: false,
                    error: `Could not initialize chat for recipient ${target} (Server WID: ${serverWid?._serialized || serverWid})`
                };
            }

            // Step 4: Process media if sending document/image
            let mediaOptions = {};
            if (media && window.WWebJS && window.WWebJS.processMediaData) {
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

            // Step 5: Construct message key & message object
            const lidUser = MeUser.getMaybeMeLidUser ? MeUser.getMaybeMeLidUser() : null;
            const meUser = MeUser.getMaybeMePnUser ? MeUser.getMaybeMePnUser() : null;
            const newId = await MsgKey.newId();
            const from = (chat.id && chat.id.isLid && chat.id.isLid()) ? (lidUser || meUser) : (meUser || lidUser);

            const newMsgKey = new MsgKey({
                from: from,
                to: chat.id,
                id: newId,
                participant: undefined,
                selfDir: 'out',
            });

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
            };
            delete message.__x_id;
            message.id = newMsgKey;

            // Step 6: Dispatch directly via WAWebSendMsgChatAction
            const [msgPromise, sendMsgResultPromise] = SendMsgAction.addAndSendMsgToChat(chat, message);
            await msgPromise;

            return {
                success: true,
                messageId: newMsgKey._serialized,
                to: chat.id._serialized
            };
        } catch (unhandledErr) {
            return {
                success: false,
                error: (unhandledErr && unhandledErr.message) ? unhandledErr.message : String(unhandledErr),
                name: unhandledErr?.name || 'Error',
                stack: unhandledErr?.stack || null
            };
        }
    }, cleanTarget, text, mediaPayload, options);

    if (!evalResult || !evalResult.success) {
        const detail = evalResult?.error || evalResult?.name || 'Unknown browser evaluation error';
        throw new Error(detail);
    }

    return evalResult;
}

/**
 * Safely send message to a recipient.
 * Uses custom resilient dispatcher as Priority 1, and client.sendMessage as fallback.
 */
export async function safeSendMessage(jid, content, options = {}) {
    if (!client || !jid) return null;
    await ensureMediaPatchApplied();

    let targetJid = jid;
    console.log(`[WHATSAPP] safeSendMessage dispatching to ${targetJid}...`);

    // Priority 1: Use our resilient custom in-page sender
    try {
        const customRes = await customSendWhatsAppMessage(targetJid, content, options);
        console.log(`[WHATSAPP] ✅ Message delivered successfully via custom dispatcher to ${customRes.to} (ID: ${customRes.messageId})`);
        return customRes;
    } catch (customErr) {
        console.warn(`[WHATSAPP] Custom dispatcher failed for ${targetJid} (${customErr.message}). Attempting client.sendMessage fallback...`);
    }

    // Priority 2: Standard client.sendMessage fallback (with patched Utils.js)
    try {
        const result = await client.sendMessage(targetJid, content, options);
        return result || { success: true, jid: targetJid };
    } catch (err) {
        console.error(`[WHATSAPP] Secondary client.sendMessage also failed to ${targetJid}:`, err?.message || err);
        throw (err instanceof Error ? err : new Error(String(err)));
    }
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
            } else if (['SingletonLock', 'SingletonSocket', 'SingletonCookie', 'lockfile', 'LOCK', 'DevToolsActivePort'].includes(entry.name)) {
                try {
                    fs.unlinkSync(fullPath);
                    console.log(`[WHATSAPP] Cleaned stale lock file: ${entry.name}`);
                } catch (e) {}
            }
        }
    } catch (e) {}
}

let initTimeoutTimer = null;

/**
 * Initialize WhatsApp Client
 */
export function initWhatsApp() {
    if (client) {
        console.log('[WHATSAPP] Client already exists. Skipping init.');
        return;
    }

    connectionState = 'INITIALIZING';
    currentQrDataUrl = null;
    userInfo = null;

    const authPath = path.join(__dirname, '../.wwebjs_auth');
    if (!fs.existsSync(authPath)) {
        fs.mkdirSync(authPath, { recursive: true });
    }

    // Clean ONLY stale lock files (never delete saved session credentials!)
    cleanChromiumLocks(authPath);

    const execPath = getChromiumExecutablePath();
    console.log(`[WHATSAPP] Initializing client... Chromium path: ${execPath || 'Puppeteer default'}`);

    if (initTimeoutTimer) clearTimeout(initTimeoutTimer);
    initTimeoutTimer = setTimeout(() => {
        if (connectionState === 'INITIALIZING' && !currentQrDataUrl) {
            console.warn('[WHATSAPP] Initialization stuck in INITIALIZING for >35s. Triggering automatic reconnect...');
            reconnectWhatsApp();
        }
    }, 35000);

    client = new Client({
        authStrategy: new LocalAuth({
            dataPath: authPath
        }),
        webVersionCache: {
            type: 'remote',
            remotePath: 'https://raw.githubusercontent.com/wppconnect-team/wa-version/main/html/{version}.html',
            strict: false
        },
        userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/128.0.0.0 Safari/537.36',
        takeoverOnConflict: true,
        bypassCSP: true,
        authTimeoutMs: 120000,
        qrMaxRetries: 15,
        puppeteer: {
            headless: true,
            executablePath: execPath,
            args: [
                '--no-sandbox',
                '--disable-setuid-sandbox',
                '--disable-dev-shm-usage',
                '--disable-accelerated-2d-canvas',
                '--no-first-run',
                '--disable-gpu',
                '--disable-extensions'
            ]
        }
    });

    client.on('qr', async (qr) => {
        console.log('[WHATSAPP] New QR code generated');
        if (initTimeoutTimer) clearTimeout(initTimeoutTimer);
        connectionState = 'QR_READY';
        lastEngineError = null;
        try {
            currentQrDataUrl = await QRCode.toDataURL(qr, { margin: 2, scale: 8 });
        } catch (err) {
            console.error('[WHATSAPP] Error generating QR Data URL:', err);
        }
    });

    client.on('loading_screen', (percent, message) => {
        console.log(`[WHATSAPP] Loading screen: ${percent}% - ${message}`);
    });

    client.on('ready', async () => {
        console.log('[WHATSAPP] Client is ready & authenticated!');
        if (initTimeoutTimer) clearTimeout(initTimeoutTimer);
        connectionState = 'CONNECTED';
        currentQrDataUrl = null;
        lastEngineError = null;
        initRetryCount = 0;
        await ensureMediaPatchApplied();
        try {
            const info = client.info;
            userInfo = {
                name: info?.pushname || 'Rasobhoomi WhatsApp',
                number: info?.wid?.user ? `+${info.wid.user}` : 'Connected'
            };
        } catch (e) {
            userInfo = { name: 'Rasobhoomi WhatsApp', number: 'Connected' };
        }
    });

    client.on('authenticated', async () => {
        console.log('[WHATSAPP] Authenticated successfully! Waiting for ready state...');
        if (initTimeoutTimer) clearTimeout(initTimeoutTimer);
        connectionState = 'AUTHENTICATED';
        currentQrDataUrl = null;
        await ensureMediaPatchApplied();
    });

    client.on('auth_failure', (msg) => {
        console.error('[WHATSAPP] Authentication failure:', msg);
        if (initTimeoutTimer) clearTimeout(initTimeoutTimer);
        connectionState = 'DISCONNECTED';
        currentQrDataUrl = null;
        userInfo = null;
        lastEngineError = 'Authentication failed: ' + (msg || 'Invalid or expired session');
    });

    client.on('disconnected', (reason) => {
        console.warn('[WHATSAPP] Client disconnected:', reason);
        connectionState = 'DISCONNECTED';
        currentQrDataUrl = null;
        userInfo = null;
        lastEngineError = 'Disconnected: ' + (reason || 'Session closed');
        // Attempt restart after delay
        setTimeout(() => {
            if (client) {
                try {
                    client.destroy();
                } catch (e) {}
                client = null;
                initWhatsApp();
            }
        }, 5000);
    });

    client.initialize().catch((err) => {
        console.error('[WHATSAPP] Error during initialize:', err?.message || err);
        connectionState = 'DISCONNECTED';
        lastEngineError = err?.message || String(err);
        if (err?.message?.includes('already running') || err?.message?.includes('userDataDir')) {
            if (initRetryCount < MAX_INIT_RETRIES) {
                initRetryCount++;
                console.log(`[WHATSAPP] Cleaning session locks and retrying initialization (${initRetryCount}/${MAX_INIT_RETRIES})...`);
                cleanChromiumLocks(authPath);
                setTimeout(() => {
                    client = null;
                    initWhatsApp();
                }, 3000);
            } else {
                console.warn('[WHATSAPP] Max retries reached for browser session lock. Disabling WhatsApp auto-client so Express server runs smoothly.');
                client = null;
            }
        }
    });
}

/**
 * Get Current Status and QR Code
 */
export function getWhatsAppStatus() {
    // If client was destroyed or disconnected, attempt soft auto-init
    if (!client && connectionState === 'DISCONNECTED' && initRetryCount === 0) {
        console.log('[WHATSAPP] Status checked while disconnected. Auto-triggering init...');
        initWhatsApp();
    }
    const adminPhone = process.env.ADMIN_WHATSAPP || process.env.ADMIN_PHONE || process.env.NOTIFICATION_NUMBER || DEFAULT_NOTIFICATION_NUMBER;
    return {
        status: connectionState,
        qrCode: currentQrDataUrl,
        user: userInfo,
        lastError: lastEngineError,
        isReady: (connectionState === 'CONNECTED' && !!client),
        targetNumber: `+91 ${String(adminPhone).replace(/\D/g, '').slice(-10)}`
    };
}

/**
 * Reconnect / Re-initialize WhatsApp Client
 */
export function reconnectWhatsApp() {
    console.log('[WHATSAPP] Explicit reconnect requested...');
    initRetryCount = 0;
    if (client) {
        try {
            client.destroy();
        } catch (e) {}
        client = null;
    }
    initWhatsApp();
    return getWhatsAppStatus();
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
    if (!order || !order.id) return { success: false, error: 'Invalid order data' };

    if (!force && notifiedOrderIds.has(order.id)) {
        console.log(`[WHATSAPP] Notification already sent for order #${order.id}. Skipping.`);
        return { success: true, duplicate: true };
    }

    const ready = await waitForReady(12000);
    if (!ready || !client) {
        console.warn(`[WHATSAPP] Cannot send notification. WhatsApp state is '${connectionState}'`);
        return { success: false, error: `WhatsApp not connected (Status: ${connectionState})` };
    }

    let deliveredAny = false;

    try {
        const customerJid = order.phone ? await resolveWhatsAppJid(order.phone) : null;
        const adminJids = await getAdminJids();

        // 1. Send Text Confirmation to Customer immediately (Highest Priority, non-blocking)
        if (customerJid) {
            try {
                const customerMsg = buildCustomerOrderMessage(order);
                console.log(`[WHATSAPP] Sending customer order confirmation for #${order.id} to Customer (${customerJid})...`);
                const sent = await safeSendMessage(customerJid, customerMsg);
                if (sent) deliveredAny = true;
                console.log(`[WHATSAPP] Customer order confirmation text dispatched to ${customerJid}!`);
            } catch (custErr) {
                console.error(`[WHATSAPP] Error sending paid confirmation text to customer (${customerJid}):`, custErr.message);
            }
        }

        // 2. Send Text Notification to Admin Numbers
        for (const adminJid of adminJids) {
            try {
                const textMessage = buildOrderNotificationMessage(order);
                console.log(`[WHATSAPP] Sending order notification for #${order.id} to Admin (${adminJid})...`);
                const sent = await safeSendMessage(adminJid, textMessage);
                if (sent) deliveredAny = true;
            } catch (adminErr) {
                console.error(`[WHATSAPP] Error sending paid alert to admin (${adminJid}):`, adminErr.message);
            }
        }

        // 3. Dispatch PDF Invoices Asynchronously in Background (ensures upload issues never block text delivery)
        (async () => {
            try {
                const pdfLang = order.lang || 'en';
                const pdfBuffer = await generateInvoicePdf(order, pdfLang);
                if (pdfBuffer && pdfBuffer.length > 0) {
                    if (customerJid) {
                        await new Promise(r => setTimeout(r, 1200));
                        console.log(`[WHATSAPP] Sending direct PDF invoice document for #${order.id} to Customer (${customerJid})...`);
                        await sendPdfDocumentSafe(customerJid, pdfBuffer, order.id);
                    }
                    for (const adminJid of adminJids) {
                        await new Promise(r => setTimeout(r, 1200));
                        console.log(`[WHATSAPP] Sending direct PDF invoice document for #${order.id} to Admin (${adminJid})...`);
                        await sendPdfDocumentSafe(adminJid, pdfBuffer, order.id);
                    }
                }
            } catch (pdfErr) {
                console.error(`[WHATSAPP] Failed background PDF invoice dispatch for #${order.id}:`, pdfErr.message);
            }
        })();

        if (deliveredAny) {
            notifiedOrderIds.add(order.id);
            console.log(`[WHATSAPP] Order notification sent successfully for #${order.id}!`);
            return { success: true };
        } else {
            console.warn(`[WHATSAPP] Delivery failed for both admin and customer for order #${order.id}`);
            return { success: false, error: 'Failed to deliver to both admin and customer' };
        }
    } catch (err) {
        console.error(`[WHATSAPP] Failed to send notification for order #${order.id}:`, err);
        return { success: false, error: err.message };
    }
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
    if (!order || !order.id) return { success: false, error: 'Invalid order data' };

    if (!force && notifiedPendingOrderIds.has(order.id)) {
        console.log(`[WHATSAPP] Pending payment notification already sent for order #${order.id}. Skipping.`);
        return { success: true, duplicate: true };
    }

    const ready = await waitForReady(12000);
    if (!ready || !client) {
        console.warn(`[WHATSAPP] Cannot send pending payment notification. WhatsApp state is '${connectionState}'`);
        return { success: false, error: `WhatsApp not connected (Status: ${connectionState})` };
    }

    let deliveredAny = false;

    try {
        const customerJid = order.phone ? await resolveWhatsAppJid(order.phone) : null;
        const adminJids = await getAdminJids();

        // 1. Send Text Receipt to Customer immediately (non-blocking)
        if (customerJid) {
            try {
                const customerMsg = buildCustomerPendingOrderMessage(order);
                console.log(`[WHATSAPP] Sending customer order receipt for #${order.id} to Customer (${customerJid})...`);
                const sent = await safeSendMessage(customerJid, customerMsg);
                if (sent) deliveredAny = true;
                console.log(`[WHATSAPP] Customer pending order receipt text dispatched to ${customerJid}!`);
            } catch (custErr) {
                console.error(`[WHATSAPP] Error delivering pending alert to customer (${customerJid}):`, custErr.message);
            }
        }

        // 2. Send Pending Alert to Admin Numbers
        for (const adminJid of adminJids) {
            try {
                const textMessage = buildPendingPaymentNotificationMessage(order);
                console.log(`[WHATSAPP] Sending pending payment alert for #${order.id} to Admin (${adminJid})...`);
                const sent = await safeSendMessage(adminJid, textMessage);
                if (sent) deliveredAny = true;
            } catch (adminErr) {
                console.error(`[WHATSAPP] Error delivering pending alert to admin (${adminJid}):`, adminErr.message);
            }
        }

        // 3. Dispatch PDF Invoices Asynchronously in Background
        (async () => {
            try {
                const pdfLang = order.lang || 'en';
                const pdfBuffer = await generateInvoicePdf(order, pdfLang);
                if (pdfBuffer && pdfBuffer.length > 0) {
                    if (customerJid) {
                        await new Promise(r => setTimeout(r, 1200));
                        console.log(`[WHATSAPP] Sending direct PDF invoice document for pending #${order.id} to Customer (${customerJid})...`);
                        await sendPdfDocumentSafe(customerJid, pdfBuffer, order.id);
                    }
                    for (const adminJid of adminJids) {
                        await new Promise(r => setTimeout(r, 1200));
                        console.log(`[WHATSAPP] Sending direct PDF invoice document for pending #${order.id} to Admin (${adminJid})...`);
                        await sendPdfDocumentSafe(adminJid, pdfBuffer, order.id);
                    }
                }
            } catch (pdfErr) {
                console.error(`[WHATSAPP] Failed background PDF invoice dispatch for pending #${order.id}:`, pdfErr.message);
            }
        })();

        if (deliveredAny) {
            notifiedPendingOrderIds.add(order.id);
            console.log(`[WHATSAPP] Pending payment alert processing finished for #${order.id}!`);
            return { success: true };
        } else {
            return { success: false, error: 'Failed to deliver pending alert to both admin and customer' };
        }
    } catch (err) {
        console.error(`[WHATSAPP] Failed to send pending payment notification for order #${order.id}:`, err);
        return { success: false, error: err.message };
    }
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
    const pdfBuffer = await generateInvoicePdf(order, pdfLang);
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
        if (ok) sentCount++;
        await new Promise(r => setTimeout(r, 1200));
    }

    return { success: sentCount > 0, sentCount };
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
    if (!order || !order.id) return { success: false, error: 'Invalid order data' };

    const ready = await waitForReady(12000);
    if (!ready || !client) {
        console.warn(`[WHATSAPP] Cannot send order status notification. WhatsApp state is '${connectionState}'`);
        return { success: false, error: `WhatsApp not connected (Status: ${connectionState})` };
    }

    if (!order.phone) {
        console.warn(`[WHATSAPP] Order #${order.id} has no phone number. Skipping status notification.`);
        return { success: false, error: 'Customer phone number missing' };
    }

    try {
        const customerJid = await resolveWhatsAppJid(order.phone);
        if (!customerJid) {
            console.warn(`[WHATSAPP] Invalid customer phone format for order #${order.id}: ${order.phone}`);
            return { success: false, error: 'Invalid customer phone format' };
        }

        const messageText = buildOrderStatusMessage(order, newStatus);

        console.log(`[WHATSAPP] Sending order status update ('${newStatus}') for #${order.id} to Customer (${customerJid})...`);
        await safeSendMessage(customerJid, messageText);
        console.log(`[WHATSAPP] Order status text successfully delivered to ${customerJid}!`);

        // Send direct PDF invoice attachment asynchronously in background
        (async () => {
            try {
                const pdfLang = order.lang || 'en';
                console.log(`[WHATSAPP] Generating direct PDF invoice (${pdfLang}) on status change for #${order.id}...`);
                const pdfBuffer = await generateInvoicePdf(order, pdfLang);
                if (pdfBuffer && pdfBuffer.length > 0) {
                    await new Promise(r => setTimeout(r, 1200));
                    console.log(`[WHATSAPP] Dispatching direct PDF invoice document for #${order.id} to Customer (${customerJid})...`);
                    await sendPdfDocumentSafe(customerJid, pdfBuffer, order.id);
                }
            } catch (pdfErr) {
                console.error(`[WHATSAPP] Failed background PDF invoice on status update for order #${order.id}:`, pdfErr.message);
            }
        })();

        return { success: true };
    } catch (err) {
        console.error(`[WHATSAPP] Failed to send status notification for order #${order.id}:`, err);
        return { success: false, error: err.message };
    }
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
    console.log('[WHATSAPP] Logging out and destroying session...');
    connectionState = 'DISCONNECTED';
    currentQrDataUrl = null;
    userInfo = null;

    if (client) {
        try {
            await client.logout();
        } catch (e) {}
        try {
            await client.destroy();
        } catch (e) {}
        client = null;
    }

    // Clean auth directory contents without removing the mounted volume directory itself
    const authPath = path.join(__dirname, '../.wwebjs_auth');
    if (fs.existsSync(authPath)) {
        try {
            const items = fs.readdirSync(authPath);
            for (const item of items) {
                fs.rmSync(path.join(authPath, item), { recursive: true, force: true });
            }
            console.log('[WHATSAPP] Successfully cleared auth session data.');
        } catch (e) {
            console.error('[WHATSAPP] Error clearing auth directory contents:', e);
        }
    }

    // Restart client to issue fresh QR
    setTimeout(() => {
        initWhatsApp();
    }, 1500);

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

        await safeSendMessage(customerJid, msgText);
        console.log(`[WHATSAPP RECOVERY] Phase ${phase} recovery message successfully delivered to ${customerJid}!`);
        return { success: true };
    } catch (err) {
        console.error(`[WHATSAPP RECOVERY] Error sending Phase ${phase} message for order #${order.id}:`, err);
        return { success: false, error: err.message };
    }
}

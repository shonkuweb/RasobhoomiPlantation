import pkg from 'whatsapp-web.js';
const { Client, LocalAuth } = pkg;
import QRCode from 'qrcode';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Target phone number for payment success notifications
export const DEFAULT_NOTIFICATION_NUMBER = '8972076182';

let client = null;
let currentQrDataUrl = null;
let connectionState = 'DISCONNECTED'; // DISCONNECTED, INITIALIZING, QR_READY, CONNECTED
let userInfo = null;
const notifiedOrderIds = new Set();
let initRetryCount = 0;
const MAX_INIT_RETRIES = 3;

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
    if (cleaned.length === 10) {
        cleaned = '91' + cleaned;
    } else if (cleaned.startsWith('0')) {
        cleaned = '91' + cleaned.substring(1);
    }
    return cleaned ? `${cleaned}@c.us` : null;
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

    client = new Client({
        authStrategy: new LocalAuth({
            dataPath: authPath
        }),
        puppeteer: {
            headless: true,
            executablePath: execPath,
            args: [
                '--no-sandbox',
                '--disable-setuid-sandbox',
                '--disable-dev-shm-usage',
                '--disable-accelerated-2d-canvas',
                '--no-first-run',
                '--no-zygote',
                '--disable-gpu'
            ]
        }
    });

    client.on('qr', async (qr) => {
        console.log('[WHATSAPP] New QR code generated');
        connectionState = 'QR_READY';
        try {
            currentQrDataUrl = await QRCode.toDataURL(qr, { margin: 2, scale: 8 });
        } catch (err) {
            console.error('[WHATSAPP] Error generating QR Data URL:', err);
        }
    });

    client.on('ready', async () => {
        console.log('[WHATSAPP] Client is ready & authenticated!');
        connectionState = 'CONNECTED';
        currentQrDataUrl = null;
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

    client.on('authenticated', () => {
        console.log('[WHATSAPP] Authenticated successfully!');
        connectionState = 'INITIALIZING';
        currentQrDataUrl = null;
    });

    client.on('auth_failure', (msg) => {
        console.error('[WHATSAPP] Authentication failure:', msg);
        connectionState = 'DISCONNECTED';
        currentQrDataUrl = null;
        userInfo = null;
    });

    client.on('disconnected', (reason) => {
        console.warn('[WHATSAPP] Client disconnected:', reason);
        connectionState = 'DISCONNECTED';
        currentQrDataUrl = null;
        userInfo = null;
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
    return {
        status: connectionState,
        qrCode: currentQrDataUrl,
        user: userInfo,
        targetNumber: `+91 ${DEFAULT_NOTIFICATION_NUMBER}`
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
 * Send Payment Success Notification for an Order to 8972076182
 */
export async function sendOrderPaymentNotification(order) {
    if (!order || !order.id) return { success: false, error: 'Invalid order data' };

    if (notifiedOrderIds.has(order.id)) {
        console.log(`[WHATSAPP] Notification already sent for order #${order.id}. Skipping.`);
        return { success: true, duplicate: true };
    }

    if (connectionState !== 'CONNECTED' || !client) {
        console.warn(`[WHATSAPP] Cannot send notification. WhatsApp state is '${connectionState}'`);
        return { success: false, error: `WhatsApp not connected (Status: ${connectionState})` };
    }

    try {
        const recipientJid = formatWhatsAppJid(DEFAULT_NOTIFICATION_NUMBER);
        const message = buildOrderNotificationMessage(order);

        console.log(`[WHATSAPP] Sending order notification for #${order.id} to ${recipientJid}...`);
        await client.sendMessage(recipientJid, message);
        notifiedOrderIds.add(order.id);
        console.log(`[WHATSAPP] Order notification successfully sent for #${order.id}!`);
        return { success: true };
    } catch (err) {
        console.error(`[WHATSAPP] Failed to send notification for order #${order.id}:`, err);
        return { success: false, error: err.message };
    }
}

/**
 * Send a custom test message to verify connection
 */
export async function sendTestMessage(targetNumber = DEFAULT_NOTIFICATION_NUMBER) {
    if (connectionState !== 'CONNECTED' || !client) {
        throw new Error(`WhatsApp is not connected (Current status: ${connectionState})`);
    }
    const jid = formatWhatsAppJid(targetNumber);
    const testMsg = `🧪 *Rasobhoomi Plantation - WhatsApp Test Message*\n\nWhatsApp integration is active and working properly!\n⏰ Time: ${new Date().toLocaleString('en-IN', { timeZone: 'Asia/Kolkata' })}`;
    await client.sendMessage(jid, testMsg);
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

    // Clean auth directory
    const authPath = path.join(__dirname, '../.wwebjs_auth');
    if (fs.existsSync(authPath)) {
        try {
            fs.rmSync(authPath, { recursive: true, force: true });
        } catch (e) {
            console.error('[WHATSAPP] Error removing auth directory:', e);
        }
    }

    // Restart client to issue fresh QR
    setTimeout(() => {
        initWhatsApp();
    }, 1500);

    return { success: true };
}

import pkg from 'whatsapp-web.js';
const { Client, LocalAuth, MessageMedia } = pkg;
import QRCode from 'qrcode';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { generateInvoicePdf } from './invoice_generator.js';

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
 * Build structured WhatsApp confirmation message for customer
 */
export function buildCustomerOrderMessage(order) {
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

    const customerName = order.name ? order.name.trim() : 'Valued Customer';
    const txnId = order.transaction_id || order.id;

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
📄 *Your official Tax Invoice PDF is attached below.*

If you have any questions, feel free to reply directly to this message or contact us on WhatsApp (+91 89720 76182).

Thank you for choosing *Rasobhoomi Plantation* for a greener home! 🪴✨`;
}

/**
 * Send Payment Success Notification & Invoice PDF for an Order to Admin (8972076182) and Customer
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
        const textMessage = buildOrderNotificationMessage(order);
        
        // Generate PDF Invoice
        let pdfMedia = null;
        try {
            const pdfBuffer = await generateInvoicePdf(order);
            pdfMedia = new MessageMedia('application/pdf', pdfBuffer.toString('base64'), `Invoice_${order.id}.pdf`);
        } catch (pdfErr) {
            console.error('[WHATSAPP] Failed to generate PDF invoice:', pdfErr);
        }

        // 1. Send to Admin / Notification Number (8972076182)
        const adminJid = formatWhatsAppJid(DEFAULT_NOTIFICATION_NUMBER);
        if (adminJid) {
            console.log(`[WHATSAPP] Sending order notification for #${order.id} to Admin (${adminJid})...`);
            await client.sendMessage(adminJid, textMessage);
            if (pdfMedia) {
                await client.sendMessage(adminJid, pdfMedia, { caption: `📄 Admin Copy - Invoice PDF Order #${order.id}` });
            }
        }

        // 2. Send to Customer's WhatsApp Number provided at checkout
        if (order.phone) {
            const customerJid = formatWhatsAppJid(order.phone);
            if (customerJid && customerJid !== adminJid) {
                console.log(`[WHATSAPP] Sending customer order confirmation & invoice PDF for #${order.id} to Customer (${customerJid})...`);
                const customerMsg = buildCustomerOrderMessage(order);
                await client.sendMessage(customerJid, customerMsg);
                if (pdfMedia) {
                    await client.sendMessage(customerJid, pdfMedia, { caption: `📄 Tax Invoice - Order #${order.id}` });
                }
                console.log(`[WHATSAPP] Customer order confirmation & invoice PDF delivered to ${customerJid}!`);
            }
        }

        notifiedOrderIds.add(order.id);
        console.log(`[WHATSAPP] Order notification & invoice PDF sent for #${order.id}!`);
        return { success: true };
    } catch (err) {
        console.error(`[WHATSAPP] Failed to send notification for order #${order.id}:`, err);
        return { success: false, error: err.message };
    }
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

    if (connectionState !== 'CONNECTED' || !client) {
        console.warn(`[WHATSAPP] Cannot send order status notification. WhatsApp state is '${connectionState}'`);
        return { success: false, error: `WhatsApp not connected (Status: ${connectionState})` };
    }

    if (!order.phone) {
        console.warn(`[WHATSAPP] Order #${order.id} has no phone number. Skipping status notification.`);
        return { success: false, error: 'Customer phone number missing' };
    }

    try {
        const customerJid = formatWhatsAppJid(order.phone);
        if (!customerJid) {
            console.warn(`[WHATSAPP] Invalid customer phone format for order #${order.id}: ${order.phone}`);
            return { success: false, error: 'Invalid customer phone format' };
        }

        const messageText = buildOrderStatusMessage(order, newStatus);

        console.log(`[WHATSAPP] Sending order status update ('${newStatus}') for #${order.id} to Customer (${customerJid})...`);
        await client.sendMessage(customerJid, messageText);
        console.log(`[WHATSAPP] Order status notification successfully delivered to ${customerJid}!`);

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

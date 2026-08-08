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
export const DEFAULT_NOTIFICATION_NUMBER = '8972076182';

let client = null;
let currentQrDataUrl = null;
let connectionState = 'DISCONNECTED'; // DISCONNECTED, INITIALIZING, QR_READY, CONNECTED
let userInfo = null;
const notifiedOrderIds = new Set();
const notifiedPendingOrderIds = new Set();
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
            remotePath: 'https://raw.githubusercontent.com/wppconnect-team/wa-version/main/html/2.2412.54.html'
        },
        takeoverOnConflict: true,
        bypassCSP: true,
        authTimeoutMs: 90000,
        qrMaxRetries: 10,
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
                '--disable-gpu',
                '--disable-extensions'
            ]
        }
    });

    client.on('qr', async (qr) => {
        console.log('[WHATSAPP] New QR code generated');
        if (initTimeoutTimer) clearTimeout(initTimeoutTimer);
        connectionState = 'QR_READY';
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
        console.log('[WHATSAPP] Authenticated successfully! Waiting for ready state...');
        if (initTimeoutTimer) clearTimeout(initTimeoutTimer);
        connectionState = 'AUTHENTICATED';
        currentQrDataUrl = null;
    });

    client.on('auth_failure', (msg) => {
        console.error('[WHATSAPP] Authentication failure:', msg);
        if (initTimeoutTimer) clearTimeout(initTimeoutTimer);
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
📄 *आपका टैक्स इनवॉइस (Invoice PDF) नीचे संलग्न है।*

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
📄 *আপনার ট্যাক্স ইনভয়েস (Invoice PDF) নিচে সংযুক্ত করা হলো।*

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

    if ((connectionState !== 'CONNECTED' && connectionState !== 'AUTHENTICATED') || !client) {
        console.warn(`[WHATSAPP] Cannot send notification. WhatsApp state is '${connectionState}'`);
        return { success: false, error: `WhatsApp not connected (Status: ${connectionState})` };
    }

    try {
        const textMessage = buildOrderNotificationMessage(order);
        
        // Generate PDF Invoice
        let pdfMedia = null;
        try {
            const pdfLang = order.lang || 'en';
            const pdfBuffer = await generateInvoicePdf(order, pdfLang);
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

    return `⚠️ *PENDING PAYMENT* ⚠️
--------------------------------------------------
🆔 *Order ID:* #${order.id}
👤 *Customer Name:* ${order.name || 'N/A'}
📞 *Phone Number:* ${phoneFormatted}
📍 *Delivery Address:* ${addressFormatted || 'N/A'}

📦 *Ordered Items:*
${itemsText}

💰 *Amount Pending:* ₹${order.total || 0}
⏰ *Time:* ${formattedDate}
--------------------------------------------------`;
}

/**
 * Send Pending Payment notification (headline & customer details) to Admin WhatsApp number (8972076182)
 */
export async function sendPendingPaymentNotification(order) {
    if (!order || !order.id) return { success: false, error: 'Invalid order data' };

    if (notifiedPendingOrderIds.has(order.id)) {
        console.log(`[WHATSAPP] Pending payment notification already sent for order #${order.id}. Skipping.`);
        return { success: true, duplicate: true };
    }

    if ((connectionState !== 'CONNECTED' && connectionState !== 'AUTHENTICATED') || !client) {
        console.warn(`[WHATSAPP] Cannot send pending payment notification. WhatsApp state is '${connectionState}'`);
        return { success: false, error: `WhatsApp not connected (Status: ${connectionState})` };
    }

    try {
        const textMessage = buildPendingPaymentNotificationMessage(order);
        const adminJid = formatWhatsAppJid(DEFAULT_NOTIFICATION_NUMBER);

        if (adminJid) {
            console.log(`[WHATSAPP] Sending pending payment alert for #${order.id} to Admin (${adminJid})...`);
            await client.sendMessage(adminJid, textMessage);
            notifiedPendingOrderIds.add(order.id);
            console.log(`[WHATSAPP] Pending payment alert delivered for #${order.id}!`);
            return { success: true };
        } else {
            return { success: false, error: 'Invalid admin phone number' };
        }
    } catch (err) {
        console.error(`[WHATSAPP] Failed to send pending payment notification for order #${order.id}:`, err);
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

    if ((connectionState !== 'CONNECTED' && connectionState !== 'AUTHENTICATED') || !client) {
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
    if ((connectionState !== 'CONNECTED' && connectionState !== 'AUTHENTICATED') || !client) {
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

/**
 * Build 3-Step WhatsApp Recovery Notification Copy for Failed/Pending Orders
 * @param {Object} order Order record from DB
 * @param {Number} phase 1 (Nudge), 2 (Support), 3 (Urgency)
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
        // Phase 1: Gentle Nudge (~15-30 mins after failure)
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
    } else if (phase === 2) {
        // Phase 2: Care & Support Offer (~2-4 hours after failure)
        if (isBn) {
            return `🪴 *${customerName}, রসোভূমি থেকে কোনো সাহায্যের প্রয়োজন?*

আমরা লক্ষ্য করেছি আপনার অর্ডার *#${orderId}* (মূল্য: ₹${total}) এখনো বাকি রয়েছে। গাছের সঠিক বাছাই বা পেমেন্ট নিয়ে কোনো প্রশ্ন থাকলে আমরা সাহায্য করতে প্রস্তুত! 🌱

🌿 *আপনার সংরক্ষিত অর্ডারটি নিশ্চিত করতে এখানে যান:*
${checkoutLink}

📞 রসোভূমির বিশেষজ্ঞের সাথে কথা বলতে এই মেসেজে উত্তর দিন।`;
        } else {
            return `🪴 *Need any assistance with your order, ${customerName}?*

We noticed your order *#${orderId}* (Total: ₹${total}) is still pending. If you have questions about plant care, delivery, or payment options, we're here to help! 🌱

🌿 *Resume & confirm your order here:*
${checkoutLink}

📞 Reply to this message to chat with our nursery horticulturists.`;
        }
    } else {
        // Phase 3: Stock Urgency Notice (~20-24 hours after failure)
        if (isBn) {
            return `⏳ *জরুরি বিজ্ঞপ্তি: ${customerName}, আপনার গাছের রিজার্ভেশন মেয়াদ শেষ হতে চলেছে!*

আপনার অর্ডার *#${orderId}*-এর স্টক খুব সীমিত। পেমেন্ট সম্পন্ন না হলে চারাগুলি অন্যান্য গ্রাহকদের জন্য উন্মুক্ত করে দেওয়া হবে। 🌿

🛑 *আপনার পছন্দের গাছগুলি মিস না করতে এখনই পেমেন্ট সম্পন্ন করুন:*
${checkoutLink}

— *রসোভূমি প্ল্যান্টেশন টিম*`;
        } else {
            return `⏳ *Final Notice: ${customerName}, your plant reservation is expiring!*

Stock for items in your order *#${orderId}* is limited. Unconfirmed saplings will be released back to other buyers soon. 🌿

🛑 *Don't miss out! Secure your plants now:*
${checkoutLink}

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

    if ((connectionState !== 'CONNECTED' && connectionState !== 'AUTHENTICATED') || !client) {
        console.warn(`[WHATSAPP RECOVERY] Cannot send Phase ${phase} message. WhatsApp state is '${connectionState}'`);
        return { success: false, error: `WhatsApp not connected (Status: ${connectionState})` };
    }

    try {
        const customerJid = formatWhatsAppJid(order.phone);
        if (!customerJid) {
            return { success: false, error: 'Invalid WhatsApp JID format' };
        }

        const msgText = buildRecoveryNotificationMessage(order, phase);
        console.log(`[WHATSAPP RECOVERY] Sending Phase ${phase} recovery message for order #${order.id} to ${customerJid}...`);

        await client.sendMessage(customerJid, msgText);
        console.log(`[WHATSAPP RECOVERY] Phase ${phase} recovery message successfully delivered to ${customerJid}!`);
        return { success: true };
    } catch (err) {
        console.error(`[WHATSAPP RECOVERY] Error sending Phase ${phase} message for order #${order.id}:`, err);
        return { success: false, error: err.message };
    }
}

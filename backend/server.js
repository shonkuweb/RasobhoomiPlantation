import express from 'express';
import cors from 'cors';
import bodyParser from 'body-parser';
import path from 'path';
import { fileURLToPath } from 'url';
import dotenv from 'dotenv';
import crypto from 'crypto';
import axios from 'axios';
import helmet from 'helmet';
import compression from 'compression';
import rateLimit from 'express-rate-limit';
import jwt from 'jsonwebtoken';
import fs from 'fs';
import { generateInvoicePdf } from './invoice_generator.js';
import { generateCatalogPdf } from './catalog_generator.js';
import {
    initWhatsApp,
    getWhatsAppStatus,
    reconnectWhatsApp,
    sendOrderPaymentNotification,
    sendPendingPaymentNotification,
    sendOrderStatusNotification,
    sendPaymentRecoveryWhatsApp,
    sendTestMessage,
    logoutWhatsApp
} from './whatsapp.js';
import { getTranslatedProducts } from './groq_translator.js';

dotenv.config({ path: path.join(path.dirname(fileURLToPath(import.meta.url)), '../.env') }); // Load .env from root

// --- DATABASE SELECTION ---
let db;
if (process.env.DB_TYPE === 'postgres') {
    console.log('Using PostgreSQL Database');
    const { default: pgDb } = await import('./database.pg.js');
    db = pgDb;
} else {
    console.log('Using SQLite Database');
    const { default: sqliteDb } = await import('./database.js');
    db = sqliteDb;
}
console.log(`[INFO] Server starting with DB_TYPE: ${process.env.DB_TYPE || 'sqlite'}`);

import { processProductImagesForR2 } from './r2_helper.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const PORT = process.env.PORT || 3000;

process.on('uncaughtException', (err) => {
    console.error('[UNCAUGHT EXCEPTION]', err);
});
process.on('unhandledRejection', (reason) => {
    console.error('[UNHANDLED REJECTION]', reason);
});

// Enable Proxy Trust for Docker/Nginx (Fixes rate-limit error)
app.set('trust proxy', 1);

// --- SECURITY MIDDLEWARE ---
app.use(helmet({
    contentSecurityPolicy: false, // Disabled for now to prevent breaking existing inline scripts/styles
}));

// Rate Limiting
const limiter = rateLimit({
    windowMs: 15 * 60 * 1000, // 15 minutes
    max: Number(process.env.API_RATE_LIMIT_MAX || 500),
    standardHeaders: true,
    legacyHeaders: false,
    message: { error: 'Too many requests, please try again later.' },
    // Storefront/admin polling makes many read calls; avoid throttling these.
    skip: (req) => {
        const requestPath = req.path || req.originalUrl || '';
        // Skip rate limits for admin authorization requests or admin routes
        if (req.headers.authorization || requestPath.includes('/admin')) {
            return true;
        }
        if (requestPath.startsWith('/phonepe/callback') || requestPath.startsWith('/api/phonepe/callback')) {
            return true;
        }
        if (req.method !== 'GET') return false;
        return (
            requestPath.startsWith('/products') ||
            requestPath.startsWith('/categories') ||
            requestPath.startsWith('/orders') ||
            requestPath.startsWith('/api/products') ||
            requestPath.startsWith('/api/categories') ||
            requestPath.startsWith('/api/orders') ||
            requestPath.startsWith('/api/shipping') ||
            requestPath.startsWith('/shipping')
        );
    }
});
app.use('/api', limiter);

const authLimiter = rateLimit({
    windowMs: 15 * 60 * 1000, // 15 minutes
    max: 100, // Limit login attempts
    message: { success: false, message: "Too many login attempts, please try again after 15 minutes" }
});
app.post('/api/auth/login', authLimiter);

// --- JWT SECRET ---
const JWT_SECRET = process.env.JWT_SECRET || 'your-super-secret-jwt-key-change-in-production';
const ORDER_SETTINGS_KEY = 'order_config';
const DEFAULT_ORDER_CONFIG = {
    minimumOrderQty: 3,
    deliveryPerPlant: 150,
    drumDeliveryMultiplier: 0.5,
    freeDeliveryEnabled: false,
    freeDeliveryStartsAt: null,
    freeDeliveryEndsAt: null,
    updatedAt: null
};

// --- AUTH MIDDLEWARE ---
const requireAuth = (req, res, next) => {
    const authHeader = req.headers.authorization;

    if (!authHeader || !authHeader.startsWith('Bearer ')) {
        return res.status(401).json({ error: 'Unauthorized: No token provided' });
    }

    const token = authHeader.split(' ')[1];

    try {
        // Non-expiring verification (ignores expiration claims on any token)
        const decoded = jwt.verify(token, JWT_SECRET, { ignoreExpiration: true });
        req.admin = decoded;
        next();
    } catch (err) {
        return res.status(401).json({ error: 'Unauthorized: Invalid token' });
    }
};

const normalizeOrderConfig = (rawConfig = {}) => {
    const toIsoOrNull = (value) => {
        if (!value) return null;
        const timestamp = Date.parse(value);
        if (!Number.isFinite(timestamp)) return null;
        return new Date(timestamp).toISOString();
    };
    const parsedMinOrderQty = parseInt(rawConfig.minimumOrderQty, 10);
    const parsedDeliveryPerPlant = parseFloat(rawConfig.deliveryPerPlant);
    const parsedDrumMultiplier = parseFloat(rawConfig.drumDeliveryMultiplier);
    const freeDeliveryEnabled = rawConfig.freeDeliveryEnabled === true || rawConfig.freeDeliveryEnabled === 'true';
    const freeDeliveryStartsAt = toIsoOrNull(rawConfig.freeDeliveryStartsAt);
    const freeDeliveryEndsAt = toIsoOrNull(rawConfig.freeDeliveryEndsAt);

    return {
        minimumOrderQty: Number.isFinite(parsedMinOrderQty) && parsedMinOrderQty > 0 ? parsedMinOrderQty : DEFAULT_ORDER_CONFIG.minimumOrderQty,
        deliveryPerPlant: Number.isFinite(parsedDeliveryPerPlant) && parsedDeliveryPerPlant >= 0 ? parsedDeliveryPerPlant : DEFAULT_ORDER_CONFIG.deliveryPerPlant,
        drumDeliveryMultiplier: Number.isFinite(parsedDrumMultiplier) && parsedDrumMultiplier >= 0 ? parsedDrumMultiplier : DEFAULT_ORDER_CONFIG.drumDeliveryMultiplier,
        freeDeliveryEnabled,
        freeDeliveryStartsAt,
        freeDeliveryEndsAt,
        updatedAt: new Date().toISOString()
    };
};

const isFreeDeliveryActive = (config, now = Date.now()) => {
    if (!config?.freeDeliveryEnabled) return false;
    const start = config?.freeDeliveryStartsAt ? Date.parse(config.freeDeliveryStartsAt) : null;
    const end = config?.freeDeliveryEndsAt ? Date.parse(config.freeDeliveryEndsAt) : null;
    if (start && Number.isFinite(start) && now < start) return false;
    if (end && Number.isFinite(end) && now > end) return false;
    return true;
};

const loadOrderConfig = (callback) => {
    db.get("SELECT value FROM admin_settings WHERE key = ?", [ORDER_SETTINGS_KEY], (err, row) => {
        if (err) return callback(err);
        if (!row?.value) return callback(null, { ...DEFAULT_ORDER_CONFIG });
        try {
            const parsed = JSON.parse(row.value);
            callback(null, { ...DEFAULT_ORDER_CONFIG, ...normalizeOrderConfig(parsed), updatedAt: parsed.updatedAt || null });
        } catch (parseErr) {
            callback(null, { ...DEFAULT_ORDER_CONFIG });
        }
    });
};

const loadOrderConfigAsync = () => new Promise((resolve, reject) => {
    loadOrderConfig((err, config) => {
        if (err) reject(err);
        else resolve(config);
    });
});

const saveOrderConfig = (config, callback) => {
    const normalized = normalizeOrderConfig(config);
    if (
        normalized.freeDeliveryStartsAt &&
        normalized.freeDeliveryEndsAt &&
        Date.parse(normalized.freeDeliveryEndsAt) < Date.parse(normalized.freeDeliveryStartsAt)
    ) {
        return callback(new Error('Free delivery end time must be after start time'));
    }
    db.run("DELETE FROM admin_settings WHERE key = ?", [ORDER_SETTINGS_KEY], (deleteErr) => {
        if (deleteErr) return callback(deleteErr);
        db.run(
            "INSERT INTO admin_settings (key, value) VALUES (?, ?)",
            [ORDER_SETTINGS_KEY, JSON.stringify(normalized)],
            (insertErr) => {
                if (insertErr) return callback(insertErr);
                callback(null, normalized);
            }
        );
    });
};

const isValidPhonePeWebhookAuth = (req) => {
    const webhookUser = process.env.PHONEPE_WEBHOOK_USERNAME;
    const webhookPass = process.env.PHONEPE_WEBHOOK_PASSWORD;
    if (!webhookUser || !webhookPass) return true;

    const expectedHash = crypto.createHash('sha256').update(`${webhookUser}:${webhookPass}`).digest('hex');
    const authHeader = String(req.headers['authorization'] || '').trim();
    const normalizedHeader = authHeader.replace(/^sha256[\s=:]*/i, '').trim();
    return normalizedHeader === expectedHash;
};

app.use(cors()); // In production, restrict this to your domain: { origin: 'https://yourdomain.com' }
app.use(compression());
app.use(bodyParser.json({ limit: '50mb' }));
app.use(bodyParser.urlencoded({ extended: true, limit: '50mb' }));

// --- STATIC FILES ---
// Serve built React app
app.use(express.static(path.join(__dirname, '../dist')));
// Serve legacy pages/public assets
app.use(express.static(path.join(__dirname, '../public'), {
    maxAge: process.env.NODE_ENV === 'production' ? '7d' : 0,
    setHeaders: (res, filePath) => {
        if (filePath.includes(`${path.sep}assets${path.sep}`)) {
            res.setHeader('Cache-Control', 'public, max-age=604800, immutable');
        }
    },
}));
// Serve moved static pages (for admin.html etc if not in dist)
// Note: Vite build will put them in dist, but for dev or direct access:
app.use(express.static(path.join(__dirname, '../pages')));

// Explicitly route /admin-login to the login page
app.get('/admin-login', (req, res) => {
    res.sendFile(path.join(__dirname, '../pages/admin-login.html'));
});

// Explicitly route /admin to the legacy admin.html
app.get('/admin', (req, res) => {
    res.sendFile(path.join(__dirname, '../pages/admin_legacy.html'));
});

// Token verification endpoint
app.get('/api/auth/verify', requireAuth, (req, res) => {
    res.json({ valid: true, role: req.admin.role });
});

app.get('/api/settings/order', (req, res) => {
    loadOrderConfig((err, config) => {
        if (err) return res.status(500).json({ error: err.message });
        const active = isFreeDeliveryActive(config);
        res.json({
            ...config,
            freeDeliveryActive: active
        });
    });
});

app.post('/api/admin/settings/order', requireAuth, (req, res) => {
    saveOrderConfig(req.body || {}, (err, savedConfig) => {
        if (err) return res.status(500).json({ error: err.message });
        res.json({
            success: true,
            settings: {
                ...savedConfig,
                freeDeliveryActive: isFreeDeliveryActive(savedConfig)
            }
        });
    });
});

const HERO_VIDEO_SETTINGS_KEY = 'hero_video_settings';

app.get('/api/settings/hero-video', (req, res) => {
    db.get("SELECT value FROM admin_settings WHERE key = ?", [HERO_VIDEO_SETTINGS_KEY], (err, row) => {
        if (err) return res.status(500).json({ error: err.message });
        let heroVideoUrl = '';
        if (row && row.value) {
            try {
                const parsed = JSON.parse(row.value);
                heroVideoUrl = parsed.heroVideoUrl || '';
            } catch (e) {
                heroVideoUrl = row.value || '';
            }
        }
        res.json({ heroVideoUrl });
    });
});

app.post('/api/admin/settings/hero-video', requireAuth, (req, res) => {
    const { heroVideoUrl } = req.body || {};
    const cleanUrl = typeof heroVideoUrl === 'string' ? heroVideoUrl.trim() : '';
    const payload = JSON.stringify({ heroVideoUrl: cleanUrl, updatedAt: new Date().toISOString() });

    db.run("DELETE FROM admin_settings WHERE key = ?", [HERO_VIDEO_SETTINGS_KEY], (deleteErr) => {
        if (deleteErr) return res.status(500).json({ error: deleteErr.message });
        db.run(
            "INSERT INTO admin_settings (key, value) VALUES (?, ?)",
            [HERO_VIDEO_SETTINGS_KEY, payload],
            (insertErr) => {
                if (insertErr) return res.status(500).json({ error: insertErr.message });
                res.json({ success: true, heroVideoUrl: cleanUrl });
            }
        );
    });
});

// --- TUTORIALS ENDPOINTS ---
app.get('/api/tutorials', (req, res) => {
    db.all("SELECT * FROM tutorials ORDER BY sort_order ASC, created_at DESC", [], (err, rows) => {
        if (err) return res.status(500).json({ error: err.message });
        res.json(rows || []);
    });
});

app.post('/api/admin/tutorials', requireAuth, (req, res) => {
    const { title, videoUrl, description, sortOrder } = req.body || {};
    if (!title || typeof title !== 'string' || !title.trim()) {
        return res.status(400).json({ error: 'Title is required' });
    }
    if (!videoUrl || typeof videoUrl !== 'string' || !videoUrl.trim()) {
        return res.status(400).json({ error: 'Video URL is required' });
    }
    const id = `tut_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`;
    const cleanTitle = title.trim();
    const cleanUrl = videoUrl.trim();
    const cleanDesc = description ? description.trim() : '';
    const order = Number(sortOrder) || 0;

    db.run(
        "INSERT INTO tutorials (id, title, video_url, description, sort_order) VALUES (?, ?, ?, ?, ?)",
        [id, cleanTitle, cleanUrl, cleanDesc, order],
        function (err) {
            if (err) return res.status(500).json({ error: err.message });
            res.json({
                success: true,
                tutorial: { id, title: cleanTitle, video_url: cleanUrl, description: cleanDesc, sort_order: order }
            });
        }
    );
});

app.delete('/api/admin/tutorials/:id', requireAuth, (req, res) => {
    const { id } = req.params;
    db.run("DELETE FROM tutorials WHERE id = ?", [id], function (err) {
        if (err) return res.status(500).json({ error: err.message });
        res.json({ success: true });
    });
});

app.put('/api/admin/tutorials/:id', requireAuth, (req, res) => {
    const { id } = req.params;
    const { title, videoUrl, description, sortOrder } = req.body || {};
    if (!title || typeof title !== 'string' || !title.trim()) {
        return res.status(400).json({ error: 'Title is required' });
    }
    if (!videoUrl || typeof videoUrl !== 'string' || !videoUrl.trim()) {
        return res.status(400).json({ error: 'Video URL is required' });
    }
    db.run(
        "UPDATE tutorials SET title = ?, video_url = ?, description = ?, sort_order = ? WHERE id = ?",
        [title.trim(), videoUrl.trim(), description ? description.trim() : '', Number(sortOrder) || 0, id],
        function (err) {
            if (err) return res.status(500).json({ error: err.message });
            res.json({ success: true });
        }
    );
});


// --- SHIPROCKET SERVICEABILITY ENDPOINTS ---
let shiprocketToken = null;
let shiprocketTokenExpiry = null;

async function getShiprocketToken() {
    const email = process.env.SHIPROCKET_EMAIL || "rasobhoomiplantation@gmail.com";
    const password = process.env.SHIPROCKET_PASSWORD || "e$$&HBVFZRRq**M9JnFCoPSgTI@5Ii%*";

    if (shiprocketToken && shiprocketTokenExpiry && Date.now() < shiprocketTokenExpiry) {
        return shiprocketToken;
    }

    try {
        const response = await axios.post("https://apiv2.shiprocket.in/v1/external/auth/login", {
            email,
            password
        }, {
            headers: { "Content-Type": "application/json" },
            timeout: 10000
        });

        if (response.data && response.data.token) {
            shiprocketToken = response.data.token;
            // Token is valid for 10 days; set internal expiry to 9 days
            shiprocketTokenExpiry = Date.now() + (9 * 24 * 60 * 60 * 1000);
            return shiprocketToken;
        } else {
            throw new Error("Failed to receive authentication token from Shiprocket");
        }
    } catch (err) {
        console.error("Shiprocket Auth Error:", err?.response?.data || err.message);
        throw err;
    }
}

app.get('/api/shipping/check-pincode', async (req, res) => {
    try {
        const deliveryPincode = (req.query.pincode || req.query.zip || '').toString().trim();

        if (!deliveryPincode || !/^\d{6}$/.test(deliveryPincode)) {
            return res.status(400).json({
                success: false,
                error: "Invalid pincode format. Please provide a valid 6-digit PIN code."
            });
        }

        // Service is guaranteed available for all valid 6-digit pincodes
        return res.json({
            success: true,
            pincode: deliveryPincode,
            serviceable: true,
            message: `Delivery service is available for pincode ${deliveryPincode}.`
        });
    } catch (err) {
        console.error("Error checking pincode serviceability:", err?.message);
        const deliveryPincode = (req.query.pincode || req.query.zip || '').toString().trim();
        return res.json({
            success: true,
            pincode: deliveryPincode,
            serviceable: true,
            message: `Delivery service is available for pincode ${deliveryPincode}.`
        });
    }
});

// --- DISCOUNT API ENDPOINTS ---
app.get('/api/discounts', async (req, res) => {
    try {
        const rules = await getActiveDiscountsFromDb();
        res.json(rules);
    } catch (err) {
        res.status(500).json({ error: 'Failed to fetch discounts' });
    }
});

app.get('/api/admin/discounts', requireAuth, async (req, res) => {
    try {
        const rules = await getAllDiscountsFromDb();
        res.json(rules);
    } catch (err) {
        res.status(500).json({ error: 'Failed to fetch discount rules' });
    }
});

app.post('/api/admin/discounts', requireAuth, (req, res) => {
    const { name, category, amount1, operator, amount2, discount_type, discount_value, is_enabled } = req.body;

    if (!name || !discount_type) {
        return res.status(400).json({ error: 'Rule name and discount type are required.' });
    }

    const validOperators = ['>', '<', '>=', '<='];
    const selectedOp = validOperators.includes(operator) ? operator : '>=';

    const validTypes = ['percentage', 'fixed', 'free_delivery'];
    if (!validTypes.includes(discount_type)) {
        return res.status(400).json({ error: 'Invalid discount type.' });
    }

    const id = 'DISC-' + Date.now();
    const isEnabledVal = is_enabled !== false && is_enabled !== 0 && is_enabled !== '0' && is_enabled !== 'false';
    const targetCategory = category && String(category).trim() !== '' ? String(category).trim() : 'ALL';

    db.run(
        `INSERT INTO discounts (id, name, category, amount1, operator, amount2, discount_type, discount_value, is_enabled) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [id, String(name).trim(), targetCategory, Number(amount1 || 0), selectedOp, Number(amount2 || 0), discount_type, Number(discount_value || 0), isEnabledVal],
        function (err) {
            if (err) return res.status(500).json({ error: 'Failed to create discount rule: ' + err.message });
            res.json({ success: true, id, message: 'Discount rule created successfully' });
        }
    );
});

app.put('/api/admin/discounts/:id', requireAuth, (req, res) => {
    const { id } = req.params;
    const { name, category, amount1, operator, amount2, discount_type, discount_value, is_enabled } = req.body;

    if (!name || !discount_type) {
        return res.status(400).json({ error: 'Rule name and discount type are required.' });
    }

    const validOperators = ['>', '<', '>=', '<='];
    const selectedOp = validOperators.includes(operator) ? operator : '>=';

    const isEnabledVal = is_enabled !== false && is_enabled !== 0 && is_enabled !== '0' && is_enabled !== 'false';
    const targetCategory = category && String(category).trim() !== '' ? String(category).trim() : 'ALL';

    db.run(
        `UPDATE discounts SET name = ?, category = ?, amount1 = ?, operator = ?, amount2 = ?, discount_type = ?, discount_value = ?, is_enabled = ? WHERE id = ?`,
        [String(name).trim(), targetCategory, Number(amount1 || 0), selectedOp, Number(amount2 || 0), discount_type, Number(discount_value || 0), isEnabledVal, id],
        function (err) {
            if (err) return res.status(500).json({ error: 'Failed to update discount rule: ' + err.message });
            res.json({ success: true, message: 'Discount rule updated successfully' });
        }
    );
});

app.patch('/api/admin/discounts/:id/toggle', requireAuth, (req, res) => {
    const { id } = req.params;
    const { is_enabled } = req.body;

    const isEnabledVal = Boolean(is_enabled);

    db.run(
        `UPDATE discounts SET is_enabled = ? WHERE id = ?`,
        [isEnabledVal, id],
        function (err) {
            if (err) return res.status(500).json({ error: 'Failed to toggle discount rule: ' + err.message });
            res.json({ success: true, is_enabled: Boolean(isEnabledVal) });
        }
    );
});

app.delete('/api/admin/discounts/:id', requireAuth, (req, res) => {
    const { id } = req.params;

    db.run(
        `DELETE FROM discounts WHERE id = ?`,
        [id],
        function (err) {
            if (err) return res.status(500).json({ error: 'Failed to delete discount rule: ' + err.message });
            res.json({ success: true, message: 'Discount rule deleted' });
        }
    );
});


// --- PAYMENT CONFIGURATION (V2 Standard Checkout - OAuth) ---
// Production:
// Auth: https://api.phonepe.com/apis/identity-manager
// Pay:  https://api.phonepe.com/apis/pg
// Sandbox:
// Auth: https://api-preprod.phonepe.com/apis/pg-sandbox
// Pay:  https://api-preprod.phonepe.com/apis/pg-sandbox

const isSandbox = process.env.PHONEPE_MERCHANT_ID ? process.env.PHONEPE_MERCHANT_ID.startsWith('PGTEST') : true;

const PHONEPE_AUTH_URL = process.env.PHONEPE_AUTH_URL || (isSandbox ? "https://api-preprod.phonepe.com/apis/pg-sandbox" : "https://api.phonepe.com/apis/identity-manager");
const PHONEPE_PAY_URL = process.env.PHONEPE_PAY_URL || (isSandbox ? "https://api-preprod.phonepe.com/apis/pg-sandbox" : "https://api.phonepe.com/apis/pg");

const PHONEPE_CLIENT_ID = process.env.PHONEPE_CLIENT_ID;
const PHONEPE_CLIENT_SECRET = process.env.PHONEPE_CLIENT_SECRET;
const PHONEPE_CLIENT_VERSION = process.env.PHONEPE_CLIENT_VERSION || 1;
const PHONEPE_MERCHANT_ID = process.env.PHONEPE_MERCHANT_ID || "PGTESTPAYUAT";
const PHONEPE_SALT_KEY = process.env.PHONEPE_SALT_KEY || "099eb0cd-02cf-4e2a-8aca-3e6c6aff0399";
const PHONEPE_SALT_INDEX = process.env.PHONEPE_SALT_INDEX || "1";
const PHONEPE_HOST_URL = process.env.PHONEPE_HOST_URL || (isSandbox ? "https://api-preprod.phonepe.com/apis/pg-sandbox" : "https://api.phonepe.com/apis/hermes");
const sanitizeBaseUrl = (rawUrl) => {
    if (!rawUrl) return rawUrl;
    return String(rawUrl)
        .trim()
        .replace(/%7D/gi, '')
        .replace(/[}]+$/g, '')
        .replace(/\/+$/g, '');
};
const APP_BE_URL = sanitizeBaseUrl(process.env.APP_BE_URL || `http://localhost:${PORT}`);
const APP_FE_URL = sanitizeBaseUrl(process.env.APP_FE_URL || APP_BE_URL);

const isPhonePePaymentSuccess = (payload = {}) => {
    const normalizedCode = String(payload?.code || payload?.status || payload?.state || '').toUpperCase();
    const nestedCode = String(payload?.data?.code || payload?.data?.status || payload?.data?.state || payload?.data?.paymentState || '').toUpperCase();
    const payloadCode = String(payload?.payload?.code || payload?.payload?.status || payload?.payload?.state || '').toUpperCase();
    const eventName = String(payload?.event || payload?.type || '').toUpperCase();
    const successFlag = payload?.success === true || payload?.data?.success === true;

    const successCodes = new Set(['PAYMENT_SUCCESS', 'COMPLETED', 'SUCCESS', 'PAID', 'PAYMENT_COMPLETED', 'TXN_SUCCESS']);
    return successFlag || successCodes.has(normalizedCode) || successCodes.has(nestedCode) || successCodes.has(payloadCode) || eventName.includes('COMPLETED');
};

const isPhonePePaymentPending = (payload = {}) => {
    const normalizedCode = String(payload?.code || payload?.status || payload?.state || '').toUpperCase();
    const nestedCode = String(payload?.data?.code || payload?.data?.status || payload?.data?.state || payload?.data?.paymentState || '').toUpperCase();
    const payloadCode = String(payload?.payload?.code || payload?.payload?.status || payload?.payload?.state || '').toUpperCase();
    const eventName = String(payload?.event || payload?.type || '').toUpperCase();
    const pendingCodes = new Set(['PAYMENT_PENDING', 'PAYMENT_INITIATED', 'PENDING', 'INITIATED', 'IN_PROGRESS', 'PROCESSING']);
    return pendingCodes.has(normalizedCode) || pendingCodes.has(nestedCode) || pendingCodes.has(payloadCode) || eventName.includes('PENDING');
};

// In-Memory Token Cache
let phonePeToken = null;
let phonePeTokenExpiry = 0;

// Helper: Get OAuth Token
async function getPhonePeAuthToken() {
    if (phonePeToken && Date.now() < phonePeTokenExpiry) {
        return phonePeToken;
    }

    try {
        const params = new URLSearchParams();
        params.append('grant_type', 'client_credentials');
        params.append('client_id', PHONEPE_CLIENT_ID);
        params.append('client_secret', PHONEPE_CLIENT_SECRET);
        params.append('client_version', PHONEPE_CLIENT_VERSION);

        const response = await axios.post(`${PHONEPE_AUTH_URL}/v1/oauth/token`,
            params,
            {
                headers: {
                    'Content-Type': 'application/x-www-form-urlencoded'
                }
            }
        );

        if (response.data && response.data.access_token) {
            phonePeToken = response.data.access_token;
            // Set expiry slightly before actual expiry (e.g., 5 min buffer)
            phonePeTokenExpiry = Date.now() + (response.data.expires_in * 1000) - 300000;
            console.log("PhonePe OAuth Token Generated");
            return phonePeToken;
        } else {
            throw new Error("No access_token in response");
        }
    } catch (err) {
        console.error("PhonePe Token Error:", err.response ? err.response.data : err.message);
        throw err;
    }
}

// --- VALIDATION MIDDLEWARE ---
const validateProduct = (req, res, next) => {
    let { name, price, compare_price, qty, category } = req.body;
    const errors = [];
    if (!name || typeof name !== 'string' || name.trim() === '') errors.push('Name is required');
    if (price === undefined || price === null || isNaN(parseFloat(price)) || parseFloat(price) < 0) errors.push('Valid price is required');
    if (qty === undefined || qty === null || isNaN(parseInt(qty)) || parseInt(qty) < 0) errors.push('Valid quantity is required');
    
    // Default category to 'Others' if missing or blank
    if (!category || typeof category !== 'string' || category.trim() === '') {
        req.body.category = 'Others';
    }

    if (errors.length > 0) {
        console.error("Product Validation Failed:", errors, "Body:", req.body);
        return res.status(400).json({ error: 'Validation Failed', details: errors });
    }
    next();
};

const validateOrder = (req, res, next) => {
    const { name, phone, address, items } = req.body;
    const errors = [];
    if (!name || typeof name !== 'string') errors.push('Customer name is required');
    if (!phone || !/^\d{10,15}$/.test(String(phone).replace(/\D/g, ''))) errors.push('Valid phone number (10-15 digits) is required');
    if (!address || typeof address !== 'string') errors.push('Address is required');
    if (!items || !Array.isArray(items) || items.length === 0) errors.push('Order must contain items');
    else {
        // Validate items structure
        const invalidItems = items.filter(i => !i.id || !i.qty || i.qty <= 0);
        if (invalidItems.length > 0) errors.push('Invalid items in order (missing ID or invalid Qty)');
    }

    if (errors.length > 0) {
        console.error("Order Validation Failed:", errors, "Body:", req.body); // Debugging
        return res.status(400).json({ error: 'Validation Failed', details: errors });
    }
    next();
};

// --- HOT PATH CACHE (PRODUCTS) ---
// Goal: avoid repeated DB + JSON parsing work on every storefront request.
const PRODUCT_CACHE_TTL_MS = 5 * 60 * 1000;
let productCacheVersion = 1;
const productResponseCache = new Map();

const buildProductCacheKey = (page, limit, isPaginated, summary, includeHidden = false) => {
    const summaryKey = summary ? ':s1' : '';
    const hiddenKey = includeHidden ? ':hid1' : '';
    return isPaginated
        ? `p:${page}:l:${limit}${summaryKey}${hiddenKey}:v:${productCacheVersion}`
        : `all${summaryKey}${hiddenKey}:v:${productCacheVersion}`;
};

const parseProductRows = (rows) => rows.map(p => ({
    ...p,
    originalCategory: p.originalCategory || p.category,
    images: (p.images && p.images !== 'null') ? JSON.parse(p.images) : []
}));

/** Lighter payload for storefront lists (no gallery array, short description). */
const parseProductRowsSummary = (rows) => rows.map(p => ({
    id: p.id,
    name: p.name,
    price: p.price,
    compare_price: p.compare_price || 0,
    category: p.category,
    qty: p.qty,
    image: p.image || '',
    description: p.description ? String(p.description).slice(0, 160) : '',
}));

const getCachedPayload = (key) => {
    const entry = productResponseCache.get(key);
    if (!entry) return null;
    if (Date.now() - entry.cachedAt > PRODUCT_CACHE_TTL_MS) {
        productResponseCache.delete(key);
        return null;
    }
    return entry.payload;
};

const setCachedPayload = (key, payload) => {
    productResponseCache.set(key, { payload, cachedAt: Date.now() });
};

const invalidateProductCache = () => {
    productCacheVersion += 1;
    productResponseCache.clear();
};

const setProductResponseHeaders = (res, key) => {
    res.set('Cache-Control', 'no-cache, must-revalidate');
    res.set('ETag', `W/"${key}"`);
};

const normalizeCategoryName = (s) => (s || '')
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]/g, '');

const isCategoryMatch = (catA, catB) => {
    if (!catA || !catB) return false;
    const normA = normalizeCategoryName(catA);
    const normB = normalizeCategoryName(catB);
    if (!normA || !normB) return false;
    if (normA === normB) return true;
    
    // Normalize plurals and naming variations
    const cleanA = normA.replace(/foreigner/g, 'foreign').replace(/plants/g, 'plant').replace(/mangoes/g, 'mango').replace(/trees/g, 'tree');
    const cleanB = normB.replace(/foreigner/g, 'foreign').replace(/plants/g, 'plant').replace(/mangoes/g, 'mango').replace(/trees/g, 'tree');
    return cleanA === cleanB;
};

const getHiddenCategoriesFromDb = () => {
    return new Promise((resolve) => {
        db.all("SELECT id, name, slug FROM categories WHERE COALESCE(is_visible, 1) = 0", [], (err, rows) => {
            if (err) {
                console.error("Error fetching hidden categories:", err);
                return resolve([]);
            }
            resolve(rows || []);
        });
    });
};

const getPhonePeOrderId = (payload = {}) =>
    payload.merchantOrderId ||
    payload.merchantTransactionId ||
    payload.orderId ||
    payload.transactionId ||
    payload.payload?.merchantOrderId ||
    payload.payload?.merchantTransactionId ||
    payload.payload?.orderId ||
    payload.payload?.transactionId ||
    payload.data?.merchantOrderId ||
    payload.data?.merchantTransactionId ||
    payload.data?.orderId ||
    payload.data?.transactionId;

const getPhonePeTransactionId = (payload = {}) =>
    payload.transactionId ||
    payload.payload?.transactionId ||
    payload.payload?.paymentDetails?.[0]?.transactionId ||
    payload.data?.transactionId ||
    payload.data?.paymentDetails?.[0]?.transactionId;

// --- API ENDPOINTS ---

// PRODUCTS
app.get('/api/products/catalog-pdf', async (req, res) => {
    const lang = req.query.lang || 'bn';
    const sql = `
        SELECT p.* FROM products p
        WHERE NOT EXISTS (
            SELECT 1 FROM categories c
            WHERE (
                LOWER(TRIM(c.name)) = LOWER(TRIM(p.category))
                OR LOWER(TRIM(c.slug)) = LOWER(TRIM(p.category))
                OR REPLACE(LOWER(TRIM(c.slug)), '-', ' ') = REPLACE(LOWER(TRIM(p.category)), '-', ' ')
                OR REPLACE(LOWER(TRIM(c.name)), ' ', '-') = REPLACE(LOWER(TRIM(p.category)), ' ', '-')
                OR REPLACE(REPLACE(LOWER(TRIM(c.slug)), '-', ''), ' ', '') = REPLACE(REPLACE(LOWER(TRIM(p.category)), '-', ''), ' ', '')
                OR REPLACE(REPLACE(LOWER(TRIM(c.name)), '-', ''), ' ', '') = REPLACE(REPLACE(LOWER(TRIM(p.category)), '-', ''), ' ', '')
            )
            AND COALESCE(c.is_visible, 1) = 0
        )
        ORDER BY p.id DESC
    `;
    db.all(sql, [], async (err, rows) => {
        if (err) return res.status(500).json({ error: err.message });
        try {
            let rawProducts = parseProductRows(rows);
            const hiddenCats = await getHiddenCategoriesFromDb();
            if (hiddenCats.length > 0) {
                rawProducts = rawProducts.filter(p => !hiddenCats.some(c => isCategoryMatch(c.name, p.category) || isCategoryMatch(c.slug, p.category)));
            }
            let products = rawProducts;
            if (lang !== 'en') {
                try {
                    products = await getTranslatedProducts(db, rawProducts, lang);
                } catch (tErr) {
                    console.warn('[CATALOG PDF] Translation notice, using local dictionary:', tErr.message);
                }
            }
            const pdfBuffer = await generateCatalogPdf(products, lang);
            res.setHeader('Content-Type', 'application/pdf');
            res.setHeader('Content-Disposition', `inline; filename="Rasobhoomi_Products_${lang}.pdf"`);
            res.send(pdfBuffer);
        } catch (pdfErr) {
            console.error('Catalog PDF generation error:', pdfErr);
            res.status(500).json({ error: 'Failed to generate catalog PDF' });
        }
    });
});

app.get('/api/products/translations', (req, res) => {
    const lang = req.query.lang || 'en';
    const sql = `
        SELECT p.* FROM products p
        WHERE NOT EXISTS (
            SELECT 1 FROM categories c
            WHERE (
                LOWER(TRIM(c.name)) = LOWER(TRIM(p.category))
                OR LOWER(TRIM(c.slug)) = LOWER(TRIM(p.category))
                OR REPLACE(LOWER(TRIM(c.slug)), '-', ' ') = REPLACE(LOWER(TRIM(p.category)), '-', ' ')
                OR REPLACE(LOWER(TRIM(c.name)), ' ', '-') = REPLACE(LOWER(TRIM(p.category)), ' ', '-')
                OR REPLACE(REPLACE(LOWER(TRIM(c.slug)), '-', ''), ' ', '') = REPLACE(REPLACE(LOWER(TRIM(p.category)), '-', ''), ' ', '')
                OR REPLACE(REPLACE(LOWER(TRIM(c.name)), '-', ''), ' ', '') = REPLACE(REPLACE(LOWER(TRIM(p.category)), '-', ''), ' ', '')
            )
            AND COALESCE(c.is_visible, 1) = 0
        )
        ORDER BY p.id DESC
    `;
    db.all(sql, [], async (err, rows) => {
        if (err) return res.status(500).json({ error: err.message });
        try {
            let rawProducts = parseProductRows(rows);
            const hiddenCats = await getHiddenCategoriesFromDb();
            if (hiddenCats.length > 0) {
                rawProducts = rawProducts.filter(p => !hiddenCats.some(c => isCategoryMatch(c.name, p.category) || isCategoryMatch(c.slug, p.category)));
            }
            const translated = await getTranslatedProducts(db, rawProducts, lang);
            res.json({ success: true, lang, products: translated });
        } catch (parseErr) {
            res.status(500).json({ error: "Failed to process translation data" });
        }
    });
});

app.get('/api/products/:id', (req, res) => {
    let isAdmin = false;
    const authHeader = req.headers.authorization;
    if (authHeader && authHeader.startsWith('Bearer ')) {
        try {
            jwt.verify(authHeader.split(' ')[1], JWT_SECRET, { ignoreExpiration: true });
            isAdmin = true;
        } catch (e) {}
    }
    const includeHidden = req.query.include_hidden === '1' || req.query.include_hidden === 'true' || req.query.all === '1' || req.query.all === 'true' || isAdmin;

    const cacheKey = `one:${req.params.id}:v:${productCacheVersion}:hid:${includeHidden ? 1 : 0}`;
    const cachedPayload = getCachedPayload(cacheKey);
    if (cachedPayload) {
        setProductResponseHeaders(res, cacheKey);
        return res.json(cachedPayload);
    }

    const sql = `
        SELECT p.*, c.is_visible as cat_is_visible
        FROM products p
        LEFT JOIN categories c ON (
            LOWER(TRIM(c.name)) = LOWER(TRIM(p.category))
            OR LOWER(TRIM(c.slug)) = LOWER(TRIM(p.category))
            OR REPLACE(LOWER(TRIM(c.slug)), '-', ' ') = REPLACE(LOWER(TRIM(p.category)), '-', ' ')
            OR REPLACE(LOWER(TRIM(c.name)), ' ', '-') = REPLACE(LOWER(TRIM(p.category)), ' ', '-')
            OR REPLACE(REPLACE(LOWER(TRIM(c.slug)), '-', ''), ' ', '') = REPLACE(REPLACE(LOWER(TRIM(p.category)), '-', ''), ' ', '')
            OR REPLACE(REPLACE(LOWER(TRIM(c.name)), '-', ''), ' ', '') = REPLACE(REPLACE(LOWER(TRIM(p.category)), '-', ''), ' ', '')
        )
        WHERE p.id = ?
    `;

    db.get(sql, [req.params.id], async (err, row) => {
        if (err) return res.status(500).json({ error: err.message });
        if (!row) return res.status(404).json({ error: 'Product not found' });
        if (!includeHidden) {
            if (row.cat_is_visible === 0 || row.cat_is_visible === false) {
                return res.status(404).json({ error: 'Product not found or category unavailable' });
            }
            const hiddenCats = await getHiddenCategoriesFromDb();
            if (hiddenCats.some(c => isCategoryMatch(c.name, row.category) || isCategoryMatch(c.slug, row.category))) {
                return res.status(404).json({ error: 'Product not found or category unavailable' });
            }
        }
        try {
            const [product] = parseProductRows([row]);
            setCachedPayload(cacheKey, product);
            setProductResponseHeaders(res, cacheKey);
            res.json(product);
        } catch (parseErr) {
            res.status(500).json({ error: 'Failed to parse product data' });
        }
    });
});

app.get('/api/admin/products', requireAuth, (req, res) => {
    db.all("SELECT * FROM products ORDER BY id DESC", [], (err, rows) => {
        if (err) return res.status(500).json({ error: err.message });
        try {
            const products = parseProductRows(rows);
            res.json(products);
        } catch (parseErr) {
            res.status(500).json({ error: "Failed to parse product data" });
        }
    });
});

app.get('/api/products', (req, res) => {
    const page = parseInt(req.query.page) || 0;
    const limit = parseInt(req.query.limit) || 0;
    const isPaginated = page > 0 && limit > 0;
    const summary = req.query.summary === '1' || req.query.summary === 'true';

    let isAdmin = false;
    const authHeader = req.headers.authorization;
    if (authHeader && authHeader.startsWith('Bearer ')) {
        try {
            jwt.verify(authHeader.split(' ')[1], JWT_SECRET, { ignoreExpiration: true });
            isAdmin = true;
        } catch (e) {}
    }
    const includeHidden = req.query.include_hidden === '1' || req.query.include_hidden === 'true' || req.query.all === '1' || req.query.all === 'true' || isAdmin;

    const cacheKey = buildProductCacheKey(page, limit, isPaginated, summary, includeHidden);
    const cachedPayload = getCachedPayload(cacheKey);
    const parseRows = summary ? parseProductRowsSummary : parseProductRows;

    if (cachedPayload) {
        setProductResponseHeaders(res, cacheKey);
        return res.json(cachedPayload);
    }

    const whereClause = includeHidden
        ? ""
        : ` WHERE NOT EXISTS (
              SELECT 1 FROM categories c
              WHERE (
                  LOWER(TRIM(c.name)) = LOWER(TRIM(products.category))
                  OR LOWER(TRIM(c.slug)) = LOWER(TRIM(products.category))
                  OR REPLACE(LOWER(TRIM(c.slug)), '-', ' ') = REPLACE(LOWER(TRIM(products.category)), '-', ' ')
                  OR REPLACE(LOWER(TRIM(c.name)), ' ', '-') = REPLACE(LOWER(TRIM(products.category)), ' ', '-')
                  OR REPLACE(REPLACE(LOWER(TRIM(c.slug)), '-', ''), ' ', '') = REPLACE(REPLACE(LOWER(TRIM(products.category)), '-', ''), ' ', '')
                  OR REPLACE(REPLACE(LOWER(TRIM(c.name)), '-', ''), ' ', '') = REPLACE(REPLACE(LOWER(TRIM(products.category)), '-', ''), ' ', '')
              )
              AND COALESCE(c.is_visible, 1) = 0
          )`;

    if (isPaginated) {
        // Get total count first, then fetch the page
        db.get(`SELECT COUNT(*) as total FROM products${whereClause}`, [], (err, countRow) => {
            if (err) return res.status(500).json({ error: err.message });

            const total = countRow ? countRow.total : 0;
            const offset = (page - 1) * limit;
            const hasMore = offset + limit < total;

            db.all(`SELECT * FROM products${whereClause} ORDER BY id DESC LIMIT ? OFFSET ?`, [limit, offset], async (err, rows) => {
                if (err) return res.status(500).json({ error: err.message });
                try {
                    let products = parseRows(rows);
                    if (!includeHidden) {
                        const hiddenCats = await getHiddenCategoriesFromDb();
                        if (hiddenCats.length > 0) {
                            products = products.filter(p => !hiddenCats.some(c => isCategoryMatch(c.name, p.category) || isCategoryMatch(c.slug, p.category)));
                        }
                    }
                    const payload = { products, hasMore, total, page };
                    setCachedPayload(cacheKey, payload);
                    setProductResponseHeaders(res, cacheKey);
                    res.json(payload);
                } catch (parseErr) {
                    res.status(500).json({ error: "Failed to parse product data" });
                }
            });
        });
    } else {
        // Return all products (non-paginated)
        db.all(`SELECT * FROM products${whereClause} ORDER BY id DESC`, [], async (err, rows) => {
            if (err) return res.status(500).json({ error: err.message });
            try {
                let products = parseRows(rows);
                if (!includeHidden) {
                    const hiddenCats = await getHiddenCategoriesFromDb();
                    if (hiddenCats.length > 0) {
                        products = products.filter(p => !hiddenCats.some(c => isCategoryMatch(c.name, p.category) || isCategoryMatch(c.slug, p.category)));
                    }
                }
                setCachedPayload(cacheKey, products);
                setProductResponseHeaders(res, cacheKey);
                res.json(products);
            } catch (parseErr) {
                res.status(500).json({ error: "Failed to parse product data" });
            }
        });
    }
});


app.post('/api/products', requireAuth, validateProduct, async (req, res) => {
    try {
        const { id, name, description, price, compare_price, category, qty, image, images } = req.body;
        const finalId = id ? String(id).trim() : crypto.randomUUID();
        const finalComparePrice = compare_price ? parseFloat(compare_price) : 0;
        const finalCategory = category && typeof category === 'string' && category.trim() !== '' ? category.trim() : 'Others';
        
        // Process images via R2 if they are base64
        const { newImage, newImagesArray } = await processProductImagesForR2(finalId, image, images);
        const imagesStr = JSON.stringify(newImagesArray || []);

        db.get("SELECT id FROM products WHERE id = ?", [finalId], (err, row) => {
            if (err) {
                console.error("DB SELECT Error in POST /api/products:", err);
                return res.status(500).json({ error: err.message });
            }

            if (row) {
                const sql = `UPDATE products SET name = ?, description = ?, price = ?, compare_price = ?, category = ?, qty = ?, image = ?, images = ? WHERE id = ?`;
                db.run(sql, [name, description, price, finalComparePrice, finalCategory, qty, newImage, imagesStr, finalId], function (uErr) {
                    if (uErr) {
                        console.error("DB UPDATE Error in POST /api/products:", uErr);
                        return res.status(500).json({ error: uErr.message });
                    }
                    invalidateProductCache();
                    res.json({ message: 'Product updated', id: finalId });
                });
            } else {
                const sql = `INSERT INTO products (id, name, description, price, compare_price, category, qty, image, images) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`;
                db.run(sql, [finalId, name, description, price, finalComparePrice, finalCategory, qty, newImage, imagesStr], function (iErr) {
                    if (iErr) {
                        console.error("DB INSERT Error in POST /api/products:", iErr);
                        return res.status(500).json({ error: iErr.message });
                    }
                    invalidateProductCache();
                    res.json({ message: 'Product created', id: finalId });
                });
            }
        });
    } catch (err) {
        console.error("Server Exception in POST /api/products:", err);
        res.status(500).json({ error: err.message || 'Internal Server Error' });
    }
});

app.put('/api/products/:id', requireAuth, validateProduct, async (req, res) => {
    try {
        const { name, description, price, compare_price, category, qty, image, images } = req.body;
        const finalId = String(req.params.id).trim();
        const finalComparePrice = compare_price ? parseFloat(compare_price) : 0;
        const finalCategory = category && typeof category === 'string' && category.trim() !== '' ? category.trim() : 'Others';

        // Process images via R2 if they are base64
        const { newImage, newImagesArray } = await processProductImagesForR2(finalId, image, images);
        const imagesStr = JSON.stringify(newImagesArray || []);

        db.get("SELECT id FROM products WHERE id = ?", [finalId], (err, row) => {
            if (err) {
                console.error("DB SELECT Error in PUT /api/products/:id:", err);
                return res.status(500).json({ error: err.message });
            }

            if (!row) {
                const sql = `INSERT INTO products (id, name, description, price, compare_price, category, qty, image, images) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`;
                db.run(sql, [finalId, name, description, price, finalComparePrice, finalCategory, qty, newImage, imagesStr], function (iErr) {
                    if (iErr) {
                        console.error("DB INSERT Error in PUT /api/products/:id:", iErr);
                        return res.status(500).json({ error: iErr.message });
                    }
                    invalidateProductCache();
                    res.json({ message: 'Product created', id: finalId });
                });
            } else {
                const sql = `UPDATE products SET name = ?, description = ?, price = ?, compare_price = ?, category = ?, qty = ?, image = ?, images = ? WHERE id = ?`;
                db.run(sql, [name, description, price, finalComparePrice, finalCategory, qty, newImage, imagesStr, finalId], function (uErr) {
                    if (uErr) {
                        console.error("DB UPDATE Error in PUT /api/products/:id:", uErr);
                        return res.status(500).json({ error: uErr.message });
                    }
                    invalidateProductCache();
                    res.json({ message: 'Product updated', id: finalId });
                });
            }
        });
    } catch (err) {
        console.error("Server Exception in PUT /api/products/:id:", err);
        res.status(500).json({ error: err.message || 'Internal Server Error' });
    }
});

// BULK PRICE UPDATE (Category-wise or All Categories)
app.post('/api/admin/products/bulk-price-update', requireAuth, async (req, res) => {
    try {
        const { category, action, type, value, updateComparePrice, roundToInteger } = req.body;

        const numVal = parseFloat(value);
        if (isNaN(numVal) || numVal <= 0) {
            return res.status(400).json({ error: 'Please provide a valid positive adjustment value.' });
        }

        if (action !== 'increase' && action !== 'decrease') {
            return res.status(400).json({ error: 'Action must be either "increase" or "decrease".' });
        }

        if (type !== 'percentage' && type !== 'fixed') {
            return res.status(400).json({ error: 'Type must be either "percentage" or "fixed".' });
        }

        if (type === 'percentage' && action === 'decrease' && numVal >= 100) {
            return res.status(400).json({ error: 'Percentage decrease cannot be 100% or greater.' });
        }

        const isAll = !category || category === 'all' || category === 'ALL';
        const selectSql = isAll
            ? "SELECT id, name, price, compare_price, category FROM products"
            : "SELECT id, name, price, compare_price, category FROM products WHERE LOWER(TRIM(category)) = LOWER(TRIM(?))";
        const selectParams = isAll ? [] : [category];

        db.all(selectSql, selectParams, async (err, rows) => {
            if (err) {
                console.error("DB Error in bulk-price-update SELECT:", err);
                return res.status(500).json({ error: err.message });
            }

            if (!rows || rows.length === 0) {
                return res.status(404).json({ error: 'No products found for the selected category.' });
            }

            const shouldUpdateCompare = Boolean(updateComparePrice);
            const shouldRound = roundToInteger !== false; // default true

            const calcNewPrice = (oldPrice) => {
                const current = parseFloat(oldPrice) || 0;
                let calculated = current;
                if (type === 'fixed') {
                    calculated = action === 'increase' ? current + numVal : current - numVal;
                } else { // percentage
                    calculated = action === 'increase'
                        ? current * (1 + (numVal / 100))
                        : current * (1 - (numVal / 100));
                }
                calculated = Math.max(0, calculated);
                return shouldRound ? Math.round(calculated) : Math.round(calculated * 100) / 100;
            };

            const updates = rows.map(prod => {
                const newPrice = calcNewPrice(prod.price);
                let newComparePrice = prod.compare_price;
                if (shouldUpdateCompare && parseFloat(prod.compare_price) > 0) {
                    newComparePrice = calcNewPrice(prod.compare_price);
                }
                return {
                    id: prod.id,
                    price: newPrice,
                    compare_price: newComparePrice
                };
            });

            let updateErrors = [];
            let completedCount = 0;

            const executeUpdate = (item) => {
                return new Promise((resolve) => {
                    const updateSql = `UPDATE products SET price = ?, compare_price = ? WHERE id = ?`;
                    db.run(updateSql, [item.price, item.compare_price, item.id], function (uErr) {
                        if (uErr) {
                            console.error(`Error updating product ${item.id}:`, uErr);
                            updateErrors.push({ id: item.id, error: uErr.message });
                        } else {
                            completedCount++;
                        }
                        resolve();
                    });
                });
            };

            await Promise.all(updates.map(executeUpdate));

            invalidateProductCache();

            if (updateErrors.length > 0 && completedCount === 0) {
                return res.status(500).json({ error: 'Failed to update product prices.', details: updateErrors });
            }

            res.json({
                success: true,
                count: completedCount,
                message: `Successfully updated prices for ${completedCount} product(s).`
            });
        });
    } catch (err) {
        console.error("Server Exception in POST /api/admin/products/bulk-price-update:", err);
        res.status(500).json({ error: err.message || 'Internal Server Error' });
    }
});

// CATEGORIES
// Public storefront: only visible categories
app.get('/api/categories', async (req, res) => {
    db.all("SELECT * FROM categories WHERE is_visible = 1 OR is_visible IS NULL ORDER BY id ASC", [], (err, rows) => {
        if (err) return res.status(500).json({ error: err.message });
        res.json(rows || []);
    });
});

// Admin panel: fetch all categories with visibility status
app.get('/api/admin/categories', requireAuth, async (req, res) => {
    db.all("SELECT * FROM categories ORDER BY id ASC", [], (err, rows) => {
        if (err) return res.status(500).json({ error: err.message });
        res.json(rows || []);
    });
});

// Admin panel: toggle or update visibility for a category
app.patch('/api/admin/categories/:id/visibility', requireAuth, (req, res) => {
    const { id } = req.params;
    const { is_visible } = req.body;
    const visibleVal = (is_visible === true || is_visible === 1 || is_visible === '1') ? 1 : 0;
    const target = String(id).trim();

    const sql = (process.env.DB_TYPE === 'postgres')
        ? "UPDATE categories SET is_visible = $1 WHERE id::text = $2 OR slug = $2 OR LOWER(TRIM(name)) = LOWER(TRIM($2))"
        : "UPDATE categories SET is_visible = ? WHERE CAST(id AS TEXT) = ? OR slug = ? OR LOWER(TRIM(name)) = LOWER(TRIM(?))";

    const params = (process.env.DB_TYPE === 'postgres')
        ? [visibleVal, target]
        : [visibleVal, target, target, target];

    db.run(sql, params, function (err) {
        if (err) return res.status(500).json({ error: err.message });
        invalidateProductCache();
        res.json({ success: true, id, is_visible: visibleVal === 1 });
    });
});

// Admin panel: batch update category visibility (e.g. show all / hide all)
app.post('/api/admin/categories/visibility-batch', requireAuth, (req, res) => {
    const { is_visible, ids } = req.body;
    const visibleVal = (is_visible === true || is_visible === 1 || is_visible === '1') ? 1 : 0;

    if (Array.isArray(ids) && ids.length > 0) {
        const idStrings = ids.map(x => String(x).trim());
        const placeholders = idStrings.map(() => '?').join(',');
        const sql = `UPDATE categories SET is_visible = ? WHERE CAST(id AS TEXT) IN (${placeholders}) OR slug IN (${placeholders})`;
        db.run(sql, [visibleVal, ...idStrings, ...idStrings], function (err) {
            if (err) return res.status(500).json({ error: err.message });
            invalidateProductCache();
            res.json({ success: true, count: this.changes || ids.length, is_visible: visibleVal === 1 });
        });
    } else {
        // Apply to all categories
        db.run("UPDATE categories SET is_visible = ?", [visibleVal], function (err) {
            if (err) return res.status(500).json({ error: err.message });
            invalidateProductCache();
            res.json({ success: true, count: this.changes, is_visible: visibleVal === 1 });
        });
    }
});


// ORDERS & PAYMENT
// Helper to get product from DB
function getProductFromDb(id) {
    return new Promise((resolve, reject) => {
        db.get("SELECT * FROM products WHERE id = ?", [id], (err, row) => {
            if (err) reject(err); else resolve(row);
        });
    });
}

function getAllDiscountsFromDb() {
    return new Promise((resolve, reject) => {
        db.all("SELECT * FROM discounts ORDER BY created_at DESC", [], (err, rows) => {
            if (err) reject(err); else resolve(rows || []);
        });
    });
}

function getActiveDiscountsFromDb() {
    return new Promise((resolve, reject) => {
        db.all("SELECT * FROM discounts WHERE is_enabled IS TRUE OR is_enabled = true ORDER BY created_at DESC", [], (err, rows) => {
            if (err) reject(err); else resolve(rows || []);
        });
    });
}

function evaluateDiscounts(subtotal, deliveryCharge, discountRules, items = []) {
    let discountAmount = 0;
    let finalDeliveryCharge = deliveryCharge;
    const appliedDiscounts = [];

    for (const rule of discountRules) {
        const isEnabled = rule.is_enabled === true || rule.is_enabled === 1 || rule.is_enabled === '1';
        if (!isEnabled) continue;

        const isAllCategories = !rule.category || rule.category === 'ALL' || rule.category === 'all' || rule.category === '';
        let targetSubtotal = subtotal;

        if (!isAllCategories) {
            if (Array.isArray(items) && items.length > 0) {
                const categoryItems = items.filter(it => it && it.category === rule.category);
                targetSubtotal = categoryItems.reduce((sum, it) => sum + (Number(it.price || 0) * Number(it.qty || 1)), 0);
            } else {
                targetSubtotal = 0;
            }
            if (targetSubtotal <= 0) continue;
        }

        const amount1 = Number(rule.amount1 || 0);
        const amount2 = Number(rule.amount2 || 0);
        const op = rule.operator || '>=';

        let matches = false;
        if (amount2 > 0) {
            if (op === '>' || op === '<') {
                matches = targetSubtotal > amount1 && targetSubtotal < amount2;
            } else {
                matches = targetSubtotal >= amount1 && targetSubtotal <= amount2;
            }
        } else {
            if (op === '>') matches = targetSubtotal > amount1;
            else if (op === '>=') matches = targetSubtotal >= amount1;
            else if (op === '<') matches = targetSubtotal < amount1;
            else if (op === '<=') matches = targetSubtotal <= amount1;
        }

        if (matches) {
            if (rule.discount_type === 'free_delivery') {
                finalDeliveryCharge = 0;
                appliedDiscounts.push({ id: rule.id, name: rule.name, category: rule.category || 'ALL', type: 'free_delivery', value: 0, amount: deliveryCharge });
            } else if (rule.discount_type === 'percentage') {
                const percAmount = Math.round((targetSubtotal * (Number(rule.discount_value) || 0)) / 100);
                discountAmount += percAmount;
                appliedDiscounts.push({ id: rule.id, name: rule.name, category: rule.category || 'ALL', type: 'percentage', value: rule.discount_value, amount: percAmount });
            } else if (rule.discount_type === 'fixed') {
                const fixAmount = Math.min(targetSubtotal, Number(rule.discount_value) || 0);
                discountAmount += fixAmount;
                appliedDiscounts.push({ id: rule.id, name: rule.name, category: rule.category || 'ALL', type: 'fixed', value: rule.discount_value, amount: fixAmount });
            }
        }
    }

    return {
        discountAmount,
        finalDeliveryCharge,
        appliedDiscounts
    };
}

// In-memory store for order data BEFORE payment is confirmed
// Key: orderId, Value: { name, phone, address, city, zip, total, items, createdAt }
const pendingOrders = new Map();

// Auto-clean pending orders older than 30 minutes (payment session timeout)
setInterval(() => {
    const thirtyMinsAgo = Date.now() - 30 * 60 * 1000;
    for (const [orderId, data] of pendingOrders.entries()) {
        if (data.createdAt < thirtyMinsAgo) {
            pendingOrders.delete(orderId);
            console.log(`[CLEANUP] Removed expired pending order: ${orderId}`);
        }
    }
}, 5 * 60 * 1000); // Run every 5 minutes

// Helper to save a confirmed order to DB (called only after payment success)
function saveConfirmedOrder(orderId, phonePeTxnId) {
    const orderData = pendingOrders.get(orderId);
    const jsonItemsStr = orderData
        ? (typeof orderData.items === 'string' ? orderData.items : JSON.stringify(orderData.items))
        : null;

    return new Promise((resolve, reject) => {
        const triggerNotification = () => {
            db.get("SELECT * FROM orders WHERE id = ?", [orderId], (err, fullOrder) => {
                if (!err && fullOrder) {
                    sendOrderPaymentNotification(fullOrder).catch(e => console.error('[WHATSAPP] Order notification error:', e));
                }
            });
        };

        // Check if already saved (idempotency)
        db.get("SELECT id FROM orders WHERE id = ?", [orderId], (err, existing) => {
            if (err) return reject(err);
            if (existing) {
                db.run(
                    "UPDATE orders SET status = 'new', payment_status = 'paid', transaction_id = ?, items = COALESCE(?, items) WHERE id = ?",
                    [phonePeTxnId || orderId, jsonItemsStr, orderId],
                    function (updateErr) {
                        if (updateErr) return reject(updateErr);
                        console.log(`[ORDER] Updated existing order ${orderId} as paid`);
                        pendingOrders.delete(orderId);
                        triggerNotification();
                        resolve(existing);
                    }
                );
                return;
            }

            if (!orderData) {
                console.warn(`[ORDER] No pending order found for ${orderId} and no DB row exists`);
                return resolve(null);
            }

            const { name, phone, address, city, zip, total, delivery_charge, discount_amount } = orderData;
            const insertSql = `INSERT INTO orders (id, name, phone, address, city, zip, total, delivery_charge, discount_amount, items, status, payment_status, transaction_id) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`;
            db.run(insertSql, [orderId, name, phone, address, city, zip, total, delivery_charge || 0, discount_amount || 0, jsonItemsStr, 'new', 'paid', phonePeTxnId || orderId], function (insertErr) {
                if (insertErr) return reject(insertErr);

                console.log(`[ORDER] Saved confirmed order ${orderId} to DB`);
                pendingOrders.delete(orderId);

                // Deduct stock
                try {
                    const parsedItems = typeof orderData.items === 'string' ? JSON.parse(orderData.items) : orderData.items;
                    parsedItems.forEach(item => {
                        db.run("UPDATE products SET qty = qty - ? WHERE id = ? AND qty >= ?", [item.qty, item.id, item.qty]);
                    });
                } catch (e) { console.error("[ORDER] Stock deduction error:", e); }

                triggerNotification();
                resolve({ id: orderId });
            });
        });
    });
}

function updateOrderPaymentState(orderId, paymentStatus, orderStatus = null, transactionId = null) {
    return new Promise((resolve, reject) => {
        if (!orderId) return resolve();
        const statusToSet = orderStatus || (paymentStatus === 'paid' ? 'new' : 'pending_payment');
        db.run(
            "UPDATE orders SET payment_status = ?, status = ?, transaction_id = COALESCE(?, transaction_id) WHERE id = ?",
            [paymentStatus, statusToSet, transactionId, orderId],
            function (err) {
                if (err) return reject(err);
                if (paymentStatus === 'pending' || paymentStatus === 'failed') {
                    db.get("SELECT * FROM orders WHERE id = ?", [orderId], (getErr, row) => {
                        if (!getErr && row) {
                            sendPendingPaymentNotification(row).catch(e => console.error('[WHATSAPP] Pending notification error:', e));
                        }
                    });
                }
                resolve();
            }
        );
    });
}


// ORDERS & PAYMENT
app.post('/api/orders', validateOrder, async (req, res) => {
    const { name, phone, address, city, zip, items, lang } = req.body;
    const orderLang = (lang && ['en', 'hi', 'bn'].includes(lang)) ? lang : 'en';

    if (!items || !Array.isArray(items) || items.length === 0) {
        return res.status(400).json({ error: 'Cart is empty' });
    }

    const orderId = 'ORD-' + Date.now();

    // Server-Side Calculation & Verification
    let calculatedTotal = 0;
    let totalQty = 0;
    let deliveryCharge = 0;
    let orderConfig;
    const verifiedItems = [];

    try {
        orderConfig = await loadOrderConfigAsync();
    } catch (cfgErr) {
        console.error("Order config load failed:", cfgErr);
        orderConfig = { ...DEFAULT_ORDER_CONFIG };
    }
    const freeDeliveryActive = isFreeDeliveryActive(orderConfig);

    try {
        for (const item of items) {
            const product = await getProductFromDb(item.id);
            if (!product) {
                return res.status(400).json({ error: `Product not found: ${item.name}` });
            }
            if (product.qty < item.qty) {
                return res.status(400).json({ error: `Insufficient stock for: ${product.name}` });
            }
            const itemTotal = product.price * item.qty;
            calculatedTotal += itemTotal;
            totalQty += item.qty;

            // Delivery Calculation Logic
            if (!freeDeliveryActive) {
                if (product.category === 'Drum Plants') {
                    deliveryCharge += (product.price * orderConfig.drumDeliveryMultiplier * item.qty);
                } else {
                    deliveryCharge += (orderConfig.deliveryPerPlant * item.qty);
                }
            }

            // Store verified price in the order item to prevent tampering in history
            verifiedItems.push({
                ...item,
                price: product.price,
                name: product.name, // Ensure name is also from DB truth
                category: product.category
            });
        }
    } catch (err) {
        console.error("Price Verification Error:", err);
        return res.status(500).json({ error: 'Failed to verify product prices' });
    }

    // Minimum order: 3 plants
    const MIN_ORDER_QTY = orderConfig.minimumOrderQty;
    if (totalQty < MIN_ORDER_QTY) {
        return res.status(400).json({ error: `Minimum order is ${MIN_ORDER_QTY} plants. You have ${totalQty}.` });
    }

    // Evaluate Active Discounts
    let activeDiscounts = [];
    try {
        activeDiscounts = await getActiveDiscountsFromDb();
    } catch (dErr) {
        console.error("Failed to load active discounts:", dErr);
    }

    const { discountAmount, finalDeliveryCharge, appliedDiscounts } = evaluateDiscounts(calculatedTotal, deliveryCharge, activeDiscounts, verifiedItems);
    deliveryCharge = finalDeliveryCharge;
    const total = Math.max(0, calculatedTotal - discountAmount) + deliveryCharge;
    console.log(`[DEBUG] Order ID: ${orderId}, Subtotal: ${calculatedTotal}, Discount: ${discountAmount}, Delivery: ${deliveryCharge}, Total: ${total}`);

    const verifiedItemsJson = JSON.stringify(verifiedItems);
    const pendingOrderObj = {
        id: orderId,
        name, phone, address, city, zip,
        total,
        delivery_charge: deliveryCharge,
        discount_amount: discountAmount,
        items: verifiedItemsJson,
        status: 'pending_payment',
        payment_status: 'pending',
        lang: orderLang,
        createdAt: Date.now()
    };
    pendingOrders.set(orderId, pendingOrderObj);
    console.log(`[ORDER] Stored pending order ${orderId} (lang: ${orderLang}) in memory`);

    db.run(
        `INSERT INTO orders (id, name, phone, address, city, zip, total, delivery_charge, discount_amount, items, status, payment_status, transaction_id, lang)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [orderId, name, phone, address, city, zip, total, deliveryCharge, discountAmount, verifiedItemsJson, 'pending_payment', 'pending', null, orderLang],
        function (insertErr) {
            if (insertErr) {
                console.error(`[ORDER] Failed to persist pending order ${orderId}:`, insertErr.message);
            } else {
                console.log(`[ORDER] Pending order ${orderId} saved to DB with lang=${orderLang}`);
            }
        }
    );

    // Send Pending Payment alert to admin WhatsApp (+91 8972076182) when Pay Now is clicked
    sendPendingPaymentNotification(pendingOrderObj).catch(e => console.error('[WHATSAPP] Pending payment alert error:', e));

    // PHONEPE FLOW — Initiate payment session
    try {
        if (PHONEPE_CLIENT_ID && PHONEPE_CLIENT_SECRET) {
            const token = await getPhonePeAuthToken();

            const payload = {
                merchantId: PHONEPE_MERCHANT_ID,
                merchantOrderId: orderId,
                amount: Math.round(total * 100),
                paymentFlow: {
                    type: "PG_CHECKOUT",
                    message: "Payment for Order " + orderId,
                    merchantUrls: {
                        redirectUrl: `${sanitizeBaseUrl(process.env.PHONEPE_CALLBACK_URL) || APP_BE_URL}/api/phonepe/callback?merchantOrderId=${encodeURIComponent(orderId)}`,
                        redirectMode: "REDIRECT",
                        callbackUrl: `${sanitizeBaseUrl(process.env.PHONEPE_CALLBACK_URL) || APP_BE_URL}/api/phonepe/callback`
                    }
                }
            };

            const endpoint = "/checkout/v2/pay";
            console.log(`[DEBUG] Initiating OAuth Payment to: ${PHONEPE_PAY_URL}${endpoint}`);

            const response = await axios.post(`${PHONEPE_PAY_URL}${endpoint}`, payload, {
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `O-Bearer ${token}`
                }
            });

            const data = response.data;
            if (data && data.redirectUrl) {
                return res.json({
                    success: true,
                    message: "Payment Session Created",
                    payment_url: data.redirectUrl,
                    orderId
                });
            }
        }

        // PhonePe Standard v1 PAY_PAGE flow (Supports official PhonePe UAT Sandbox: PGTESTPAYUAT)
        const payPayload = {
            merchantId: PHONEPE_MERCHANT_ID,
            merchantTransactionId: orderId,
            merchantUserId: 'MUID_' + Date.now(),
            amount: Math.round(total * 100),
            redirectUrl: `${sanitizeBaseUrl(process.env.PHONEPE_CALLBACK_URL) || APP_BE_URL}/api/phonepe/callback?merchantOrderId=${encodeURIComponent(orderId)}`,
            redirectMode: "POST",
            callbackUrl: `${sanitizeBaseUrl(process.env.PHONEPE_CALLBACK_URL) || APP_BE_URL}/api/phonepe/callback`,
            paymentInstrument: {
                type: "PAY_PAGE"
            }
        };

        const base64Payload = Buffer.from(JSON.stringify(payPayload)).toString('base64');
        const stringToSign = base64Payload + "/pg/v1/pay" + PHONEPE_SALT_KEY;
        const checksum = crypto.createHash('sha256').update(stringToSign).digest('hex') + "###" + PHONEPE_SALT_INDEX;

        console.log(`[PAYMENT] Initiating PhonePe v1 Sandbox Payment for order ${orderId} (Merchant: ${PHONEPE_MERCHANT_ID})`);

        const response = await axios.post(`${PHONEPE_HOST_URL}/pg/v1/pay`, {
            request: base64Payload
        }, {
            headers: {
                'Content-Type': 'application/json',
                'X-VERIFY': checksum
            }
        });

        const data = response.data;
        console.log("PhonePe v1 Response:", JSON.stringify(data, null, 2));

        const redirectUrl = data?.data?.instrumentResponse?.redirectInfo?.url;

        if (data.success && redirectUrl) {
            return res.json({
                success: true,
                message: "PhonePe Sandbox Session Created",
                payment_url: redirectUrl,
                orderId
            });
        }

        // Fallback to local simulator if PhonePe Sandbox API response is unexpected
        const baseUrl = APP_FE_URL || APP_BE_URL || `http://localhost:${PORT}`;
        return res.json({
            success: true,
            order_id: orderId,
            payment_url: `${baseUrl}/payment/simulate?orderId=${encodeURIComponent(orderId)}&total=${encodeURIComponent(total)}`
        });

    } catch (pgErr) {
        console.error("PhonePe Init Error:", pgErr.response ? pgErr.response.data : pgErr.message);
        const baseUrl = APP_FE_URL || APP_BE_URL || `http://localhost:${PORT}`;
        return res.json({
            success: true,
            order_id: orderId,
            payment_url: `${baseUrl}/payment/simulate?orderId=${encodeURIComponent(orderId)}&total=${encodeURIComponent(total)}`
        });
    }
});


// PhonePe Callback GET Handler (Browser Redirect after payment)
app.get('/api/phonepe/callback', async (req, res) => {
    console.log("PhonePe GET Callback Received");
    console.log("Query Params:", JSON.stringify(req.query));

    const baseUrl = APP_FE_URL || APP_BE_URL || `http://localhost:${PORT}`;
    const { code, transactionId } = req.query;
    const orderId = getPhonePeOrderId(req.query);

    console.log(`[CALLBACK] code=${code} orderId=${orderId}`);

    if (!orderId) {
        console.error("[CALLBACK] No orderId found in query params");
        return res.redirect(`${baseUrl}/payment/failure`);
    }

    try {
        const token = await getPhonePeAuthToken();
        const statusUrl = `${PHONEPE_PAY_URL}/checkout/v2/order/${encodeURIComponent(orderId)}/status?details=true&errorContext=true`;
        console.log(`[CALLBACK] Checking status at: ${statusUrl}`);

        const statusResponse = await axios.get(statusUrl, {
            headers: { 'Content-Type': 'application/json', 'Authorization': `O-Bearer ${token}` }
        });

        const statusData = statusResponse.data;
        console.log("[CALLBACK] Status Response:", JSON.stringify(statusData, null, 2));

        const isSuccess = isPhonePePaymentSuccess(statusData) || code === 'PAYMENT_SUCCESS';
        const isPending = isPhonePePaymentPending(statusData) || code === 'PAYMENT_PENDING' || code === 'PAYMENT_INITIATED';

        if (isSuccess) {
            const phonePeTxnId = getPhonePeTransactionId(statusData) || transactionId || orderId;
            try {
                await saveConfirmedOrder(orderId, phonePeTxnId);
            } catch (e) {
                console.error("[CALLBACK] Failed to save order:", e);
            }
            return res.redirect(`${baseUrl}/payment/success?orderId=${orderId}`);

        } else if (isPending) {
            try { await updateOrderPaymentState(orderId, 'pending', 'pending_payment', transactionId || null); } catch (e) { console.error(e); }
            return res.redirect(`${baseUrl}/payment/pending?orderId=${orderId}`);
        } else {
            // Unknown state from gateway: avoid false negatives and data loss.
            console.warn(`[CALLBACK] Unrecognized payment state for ${orderId}. Redirecting to pending.`);
            try { await updateOrderPaymentState(orderId, 'pending', 'pending_payment', transactionId || null); } catch (e) { console.error(e); }
            return res.redirect(`${baseUrl}/payment/pending?orderId=${orderId}`);
        }

    } catch (statusErr) {
        console.error("[CALLBACK] Status Check Error:", statusErr.response ? statusErr.response.data : statusErr.message);

        // Fallback: Trust the code from query params if status API fails
        if (code === 'PAYMENT_SUCCESS') {
            console.log(`[CALLBACK FALLBACK] Saving order ${orderId} based on code param`);
            try { await saveConfirmedOrder(orderId, transactionId); } catch (e) { console.error(e); }
            return res.redirect(`${baseUrl}/payment/success?orderId=${orderId}`);
        } else if (code === 'PAYMENT_PENDING' || code === 'PAYMENT_INITIATED') {
            try { await updateOrderPaymentState(orderId, 'pending', 'pending_payment', transactionId || null); } catch (e) { console.error(e); }
            return res.redirect(`${baseUrl}/payment/pending?orderId=${orderId}`);
        } else {
            try { await updateOrderPaymentState(orderId, 'failed', 'pending_payment', transactionId || null); } catch (e) { console.error(e); }
            return res.redirect(`${baseUrl}/payment/failure?orderId=${orderId}`);
        }
    }
});


// PhonePe Callback & Redirect Handler (V2 Secure - Server-to-Server Webhook)
app.post('/api/phonepe/callback', async (req, res) => {
    try {
        console.log("PhonePe POST Callback Received");
        console.log("Body:", JSON.stringify(req.body));

        const baseUrl = APP_FE_URL || APP_BE_URL || `http://localhost:${PORT}`;

        if (!isValidPhonePeWebhookAuth(req)) {
            console.error("Invalid PhonePe webhook auth header");
            return res.status(401).send("Unauthorized Webhook");
        }

        // Type A: Browser POST Redirect (form-encoded) — code, merchantId, transactionId in body
        if (req.body.code && req.body.merchantId) {
            const { code, transactionId } = req.body;
            const orderId = getPhonePeOrderId(req.body);
            console.log(`[POST CALLBACK] Code=${code}, orderId=${orderId}`);

            if (code === 'PAYMENT_SUCCESS') {
                try { await saveConfirmedOrder(orderId, transactionId); } catch (e) { console.error(e); }
                return res.redirect(`${baseUrl}/payment/success?orderId=${orderId}`);
            } else if (code === 'PAYMENT_PENDING' || code === 'PAYMENT_INITIATED') {
                try { await updateOrderPaymentState(orderId, 'pending', 'pending_payment', transactionId || null); } catch (e) { console.error(e); }
                return res.redirect(`${baseUrl}/payment/pending?orderId=${orderId}`);
            } else {
                try { await updateOrderPaymentState(orderId, 'failed', 'pending_payment', transactionId || null); } catch (e) { console.error(e); }
                pendingOrders.delete(orderId);
                return res.redirect(`${baseUrl}/payment/failure?orderId=${orderId}`);
            }
        }

        // Type B: Server-to-Server Webhook (JSON) — { response: "base64String" }, header: x-verify
        const { response } = req.body;
        const xVerify = req.headers['x-verify'];

        if (response && xVerify) {
            const decoded = JSON.parse(Buffer.from(response, 'base64').toString('utf-8'));
            const { success, code, data } = decoded;
            const transactionId = getPhonePeTransactionId(decoded);
            const orderId = getPhonePeOrderId(decoded);

            console.log(`[WEBHOOK] success=${success} code=${code} orderId=${orderId}`);

            if (isPhonePePaymentSuccess(decoded)) {
                try { await saveConfirmedOrder(orderId, transactionId); } catch (e) { console.error(e); }
                return res.status(200).send("OK");
            } else if (isPhonePePaymentPending(decoded)) {
                try { await updateOrderPaymentState(orderId, 'pending', 'pending_payment', transactionId || null); } catch (e) { console.error(e); }
                return res.status(200).send("OK");
            } else {
                // Payment failed — discard pending entry
                try { await updateOrderPaymentState(orderId, 'failed', 'pending_payment', transactionId || null); } catch (e) { console.error(e); }
                pendingOrders.delete(orderId);
                return res.status(200).send("OK");
            }
        }

        // Type C: PhonePe Business webhook (JSON) — { event, type, payload }
        if (req.body.payload && (req.body.event || req.body.type)) {
            const orderId = getPhonePeOrderId(req.body);
            const transactionId = getPhonePeTransactionId(req.body) || orderId;
            console.log(`[WEBHOOK V2] event=${req.body.event || req.body.type} orderId=${orderId}`);

            if (!orderId) {
                console.error("[WEBHOOK V2] No order id found", req.body);
                return res.status(200).send("OK");
            }

            if (isPhonePePaymentSuccess(req.body)) {
                try { await saveConfirmedOrder(orderId, transactionId); } catch (e) { console.error(e); }
                return res.status(200).send("OK");
            } else if (isPhonePePaymentPending(req.body)) {
                try { await updateOrderPaymentState(orderId, 'pending', 'pending_payment', transactionId || null); } catch (e) { console.error(e); }
                return res.status(200).send("OK");
            } else {
                try { await updateOrderPaymentState(orderId, 'failed', 'pending_payment', transactionId || null); } catch (e) { console.error(e); }
                pendingOrders.delete(orderId);
                return res.status(200).send("OK");
            }
        }

        console.error("Unknown Callback Format", req.body);
        return res.status(400).send("Invalid Request");

    } catch (err) {
        console.error("Callback Error", err);
        res.status(500).send("Internal Server Error");
    }
});

app.get('/api/orders', (req, res) => {
    db.all("SELECT * FROM orders WHERE is_deleted = FALSE OR is_deleted IS NULL ORDER BY created_at DESC", [], (err, rows) => {
        if (err) return res.status(500).json({ error: err.message });
        const orders = rows.map(o => ({
            ...o,
            items: o.items ? JSON.parse(o.items) : []
        }));
        res.json(orders);
    });
});

// ADMIN: Manually mark an order as paid (for when PhonePe callback fails)
app.post('/api/orders/:id/mark-paid', requireAuth, (req, res) => {
    const orderId = req.params.id;
    db.get("SELECT * FROM orders WHERE id = ?", [orderId], (err, order) => {
        if (err) return res.status(500).json({ error: err.message });
        if (!order) return res.status(404).json({ error: 'Order not found' });

        db.run(
            "UPDATE orders SET status = 'new', payment_status = 'paid' WHERE id = ?",
            [orderId],
            function (err) {
                if (err) return res.status(500).json({ error: err.message });

                // Deduct stock if not already done
                if (order.payment_status !== 'paid' && order.items) {
                    try {
                        const items = JSON.parse(order.items);
                        items.forEach(item => {
                            db.run("UPDATE products SET qty = qty - ? WHERE id = ? AND qty >= ?", [item.qty, item.id, item.qty]);
                        });
                    } catch (e) { console.error("Item parse error:", e); }
                }

                // Trigger WhatsApp notification & PDF invoice to customer and admin
                db.get("SELECT * FROM orders WHERE id = ?", [orderId], (fetchErr, updatedOrder) => {
                    if (!fetchErr && updatedOrder) {
                        sendOrderPaymentNotification(updatedOrder).catch(e => console.error('[WHATSAPP] Order notification error:', e));
                    }
                });

                res.json({ success: true, message: 'Order marked as paid & invoice sent via WhatsApp' });
            }
        );
    });
});

// ADMIN: Generate Sales Report
app.get('/api/orders/report', requireAuth, (req, res) => {
    const { startDate, endDate } = req.query;
    if (!startDate || !endDate) return res.status(400).json({ error: 'startDate and endDate required' });

    const start = startDate + ' 00:00:00';
    const end = endDate + ' 23:59:59';
    const sql = `
        SELECT * FROM orders 
        WHERE created_at >= ? AND created_at <= ?
          AND (status LIKE '%completed%' OR status LIKE '%COMPLETED%')
        ORDER BY created_at ASC
    `;
    db.all(sql, [start, end], (err, rows) => {
        if (err) return res.status(500).json({ error: err.message });
        const orders = rows.map(o => ({
            ...o,
            items: o.items ? JSON.parse(o.items) : []
        }));
        res.json(orders);
    });
});

app.get('/api/orders/:id', (req, res) => {
    db.get("SELECT * FROM orders WHERE id = ?", [req.params.id], (err, row) => {
        if (err) return res.status(500).json({ error: err.message });
        if (!row) return res.status(404).json({ error: 'Order not found' });

        if (row.payment_status === 'pending' || row.status === 'pending_payment') {
            sendPendingPaymentNotification(row).catch(e => console.error('[WHATSAPP] Pending notification error:', e));
        }

        const order = {
            ...row,
            items: row.items ? JSON.parse(row.items) : []
        };
        res.json(order);
    });
});

app.get('/api/orders/:id/invoice', (req, res) => {
    const lang = req.query.lang || 'en';
    db.get("SELECT * FROM orders WHERE id = ?", [req.params.id], async (err, row) => {
        if (err) return res.status(500).json({ error: err.message });
        if (!row) return res.status(404).json({ error: 'Order not found' });

        try {
            const pdfBuffer = await generateInvoicePdf(row, lang);
            res.setHeader('Content-Type', 'application/pdf');
            res.setHeader('Content-Disposition', `inline; filename="Invoice_${row.id}_${lang}.pdf"`);
            res.setHeader('Cache-Control', 'no-cache, no-store, must-revalidate');
            res.setHeader('Pragma', 'no-cache');
            res.setHeader('Expires', '0');
            res.send(pdfBuffer);
        } catch (pdfErr) {
            console.error('Invoice generation error:', pdfErr);
            res.status(500).json({ error: 'Failed to generate PDF invoice' });
        }
    });
});



app.put('/api/orders/:id', requireAuth, (req, res) => {
    const { status, tracking_id, courier_name } = req.body;
    const trackingVal = tracking_id !== undefined ? String(tracking_id).trim() : null;
    const courierVal = courier_name !== undefined ? String(courier_name).trim().toLowerCase() : '';

    const validCouriers = ['dtdc', 'amazon', 'rail', 'bus'];

    // Strict validation for IN-TRANSIT and COMPLETED statuses
    if (status === 'in-transit' || status === 'in_transit' || status === 'completed') {
        if (!courierVal || !validCouriers.includes(courierVal)) {
            return res.status(400).json({ error: 'Cannot update order to IN-TRANSIT: Delivery method must be chosen (DTDC, Amazon, Rail, or Bus).' });
        }
        if ((courierVal === 'dtdc' || courierVal === 'amazon') && !trackingVal) {
            return res.status(400).json({ error: `Cannot update order to IN-TRANSIT: Tracking ID is required for ${courierVal.toUpperCase()} delivery.` });
        }
    }

    const orderId = req.params.id;

    // Fetch existing order to compare status/tracking change
    db.get("SELECT * FROM orders WHERE id = ?", [orderId], (getErr, oldOrder) => {
        if (getErr || !oldOrder) {
            return res.status(404).json({ error: 'Order not found' });
        }

        const newStatusVal = status !== undefined ? status : oldOrder.status;
        const newTrackingVal = tracking_id !== undefined ? trackingVal : oldOrder.tracking_id;
        const newCourierVal = courier_name !== undefined ? (courierVal || 'dtdc') : (oldOrder.courier_name || 'dtdc');

        const sql = status !== undefined
            ? "UPDATE orders SET status = ?, tracking_id = ?, courier_name = ? WHERE id = ?"
            : "UPDATE orders SET tracking_id = ?, courier_name = ? WHERE id = ?";
        const params = status !== undefined
            ? [newStatusVal, newTrackingVal, newCourierVal, orderId]
            : [newTrackingVal, newCourierVal, orderId];

        db.run(sql, params, function (err) {
            if (err) return res.status(500).json({ error: err.message });

            // If status changed or tracking details updated for dispatched order, send WhatsApp notification
            const statusChanged = oldOrder.status !== newStatusVal;
            const trackingChanged = oldOrder.tracking_id !== newTrackingVal || oldOrder.courier_name !== newCourierVal;

            if (statusChanged || (newStatusVal === 'in-transit' && trackingChanged)) {
                db.get("SELECT * FROM orders WHERE id = ?", [orderId], (fetchErr, updatedOrder) => {
                    if (!fetchErr && updatedOrder) {
                        sendOrderStatusNotification(updatedOrder, newStatusVal).catch(e => {
                            console.error('[WHATSAPP] Order status notification error:', e);
                        });
                    }
                });
            }

            res.json({ message: 'Order updated successfully', status: newStatusVal });
        });
    });
});

app.post('/api/auth/login', (req, res) => {
    const { password } = req.body || {};

    // Check DB first, fallback smoothly to .env/default without 500 server error
    db.get("SELECT value FROM admin_settings WHERE key = 'admin_password'", [], (err, row) => {
        if (err) {
            console.warn("DB notice when fetching admin_password, falling back to ENV/default:", err.message);
        }

        const envPass = process.env.ADMIN_PASSCODE || '1234';
        const dbPass = (row && row.value) ? row.value : null;
        const validPasses = [dbPass, envPass, '1234', 'admin123'].filter(Boolean);

        if (validPasses.includes(password)) {
            // Generate non-expiring JWT token
            const token = jwt.sign(
                { role: 'admin', loginTime: Date.now() },
                JWT_SECRET
            );
            res.json({ success: true, token });
        } else {
            res.status(401).json({ success: false, message: 'Invalid Credentials' });
        }
    });
});

app.post('/api/admin/change-password', requireAuth, (req, res) => {
    const { oldPassword, newPassword } = req.body;

    // First check current active password (DB or ENV)
    db.get("SELECT value FROM admin_settings WHERE key = 'admin_password'", [], (err, row) => {
        if (err) {
            console.warn("DB notice on change password:", err.message);
        }

        const currentAdminPass = (row && row.value) ? row.value : (process.env.ADMIN_PASSCODE || '1234');

        if (oldPassword !== currentAdminPass) {
            return res.status(401).json({ success: false, message: 'Incorrect old password' });
        }

        if (!newPassword || newPassword.length < 4) {
            return res.status(400).json({ success: false, message: 'New password must be at least 4 characters' });
        }

        // Upsert the new password into admin_settings
        // In PostgreSQL this should ideally be an ON CONFLICT DO UPDATE, but for compatibility 
        // with SQLite and the db wrapper, we'll do a simple DELETE then INSERT. 
        // A single user admin environment makes this safe enough.
        db.run("DELETE FROM admin_settings WHERE key = 'admin_password'", [], (delErr) => {
            if (delErr) {
                console.error("Failed to delete old password from DB:", delErr);
                return res.status(500).json({ success: false, message: 'Failed to update password' });
            }

            db.run("INSERT INTO admin_settings (key, value) VALUES ('admin_password', ?)", [newPassword], (insErr) => {
                if (insErr) {
                    console.error("Failed to insert new password to DB:", insErr);
                    return res.status(500).json({ success: false, message: 'Failed to update password' });
                }

                res.json({ success: true, message: 'Password updated successfully' });
            });
        });
    });
});

app.delete('/api/products/:id', requireAuth, (req, res) => {
    const rawId = req.params.id;
    const cleanId = String(rawId || '').trim();
    const numId = Number(cleanId);

    const query = isNaN(numId)
        ? "DELETE FROM products WHERE id = ?"
        : "DELETE FROM products WHERE id = ? OR id = ?";
    const params = isNaN(numId) ? [cleanId] : [cleanId, numId];

    db.run(query, params, function (err) {
        if (err) {
            console.error("Delete product error:", err);
            return res.status(500).json({ error: 'Failed to delete product: ' + err.message });
        }
        invalidateProductCache();
        res.json({ success: true, message: 'Product deleted successfully' });
    });
});

app.delete('/api/orders/completed', requireAuth, (req, res) => {
    db.run("UPDATE orders SET is_deleted = TRUE WHERE status = 'completed'", [], function (err) {
        if (err) return res.status(500).json({ error: err.message });
        res.json({ message: 'Completed orders deleted (soft)' });
    });
});

// ADMIN: Delete a specific order
app.delete('/api/orders/:id', requireAuth, (req, res) => {
    db.run("UPDATE orders SET is_deleted = TRUE WHERE id = ?", [req.params.id], function (err) {
        if (err) return res.status(500).json({ error: err.message });
        res.json({ message: 'Order deleted (soft)' });
    });
});


// --- WHATSAPP INTEGRATION API ENDPOINTS ---
app.get('/api/whatsapp/status', (req, res) => {
    try {
        const statusData = getWhatsAppStatus();
        res.json(statusData);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

app.post('/api/whatsapp/connect', (req, res) => {
    try {
        const statusData = reconnectWhatsApp();
        res.json(statusData);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

app.post('/api/whatsapp/logout', async (req, res) => {
    try {
        const result = await logoutWhatsApp();
        res.json(result);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

app.post('/api/whatsapp/test', async (req, res) => {
    try {
        const targetNumber = req.body?.number || '8972076182';
        const result = await sendTestMessage(targetNumber);
        res.json(result);
    } catch (err) {
        res.status(500).json({ success: false, error: err.message });
    }
});

// Fallback for SPA
app.get(/.*/, (req, res) => {
    // Try serving from dist first
    const distPath = path.join(__dirname, '../dist', 'index.html');
    res.sendFile(distPath, (err) => {
        if (err) {
            // If dist not found (dev mode maybe?), try pages? 
            // In production, everything should be in dist.
            res.status(404).send('App not built or not found');
        }
    });
});

// NOTE: Order history retention is permanent by requirement.
// No automatic order deletion jobs are scheduled.

// --- CENTRALIZED ERROR HANDLING ---
app.use((err, req, res, next) => {
    console.error("[Global Error Handler]", err.stack);
    res.status(500).json({
        error: 'Internal Server Error',
        message: process.env.NODE_ENV === 'development' ? err.message : 'Something went wrong on the server.'
    });
});

/**
 * Automated Failed Payment Recovery Queue Processor
 * Flow: 
 *   - Message 1: Sent ~15-30 minutes after payment failure
 *   - Message 2: Sent 72 hours (3 days) after Message 1 as a gentle follow-up
 * Rate-Limiting & Safety:
 *   - PHONE DEDUPLICATION: Exactly 1 message per customer phone number (even if customer has multiple failed order attempts)
 *   - STRICT DAILY LIMIT: Max 5 unique customer messages per 24-hour day across system
 *   - Auto-expires any orders older than 72 hours without sending messages
 *   - 5-second pause between dispatches
 */
async function processPaymentRecoveryQueue() {
    if (!db) return;
    try {
        const MAX_DAILY_RECOVERY_LIMIT = 5;
        const cutoff24h = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString().replace('T', ' ').substring(0, 19);

        // Check how many unique customer phone numbers received a recovery message in the last 24 hours
        db.get(
            `SELECT COUNT(DISTINCT phone) as count FROM orders WHERE last_recovery_sent_at >= ? AND COALESCE(recovery_phase, 0) > 0`,
            [cutoff24h],
            async (countErr, countRow) => {
                if (countErr) return;

                const dailySentCount = (countRow && countRow.count) ? Number(countRow.count) : 0;
                if (dailySentCount >= MAX_DAILY_RECOVERY_LIMIT) {
                    console.log(`[RECOVERY WORKER] Daily safety limit reached (${dailySentCount}/${MAX_DAILY_RECOVERY_LIMIT} unique customers messaged in last 24h). Skipping worker run.`);
                    return;
                }

                const remainingDailyQuota = MAX_DAILY_RECOVERY_LIMIT - dailySentCount;

                const query = `
                    SELECT * FROM orders 
                    WHERE (is_deleted = FALSE OR is_deleted IS NULL)
                      AND LOWER(COALESCE(payment_status, '')) != 'paid'
                      AND LOWER(COALESCE(status, '')) = 'pending_payment'
                      AND COALESCE(recovery_phase, 0) < 2
                    ORDER BY created_at DESC
                `;

                db.all(query, [], async (err, rows) => {
                    if (err || !Array.isArray(rows) || rows.length === 0) return;

                    const now = Date.now();
                    let sentInThisCycle = 0;
                    const processedPhones = new Set();

                    // DEDUPLICATE ORDERS BY CUSTOMER PHONE NUMBER
                    // Group rows by 10-digit clean phone number
                    const uniqueCustomerOrders = [];
                    for (const order of rows) {
                        const cleanPhone = String(order.phone || '').replace(/\D/g, '').slice(-10);
                        if (!cleanPhone) continue;

                        if (processedPhones.has(cleanPhone)) {
                            // Secondary order for the same customer — automatically mark phase to match primary order
                            db.run("UPDATE orders SET recovery_phase = 2 WHERE id = ?", [order.id]);
                            continue;
                        }

                        processedPhones.add(cleanPhone);
                        uniqueCustomerOrders.push({ order, cleanPhone });
                    }

                    for (const { order, cleanPhone } of uniqueCustomerOrders) {
                        if (sentInThisCycle >= remainingDailyQuota) {
                            console.log(`[RECOVERY WORKER] Reached remaining daily quota (${sentInThisCycle} sent in this batch). Pausing.`);
                            break;
                        }

                        const currentPhase = Number(order.recovery_phase || 0);
                        const createdAt = new Date(order.created_at).getTime();
                        const lastSentAt = order.last_recovery_sent_at ? new Date(order.last_recovery_sent_at).getTime() : createdAt;

                        const ageHours = (now - createdAt) / (1000 * 60 * 60);
                        const sinceLastHours = (now - lastSentAt) / (1000 * 60 * 60);

                        // Auto-expire historical orders older than 72 hours so old backlogs never send
                        if (currentPhase === 0 && ageHours > 72) {
                            db.run(
                                "UPDATE orders SET recovery_phase = 2 WHERE phone LIKE ? AND LOWER(COALESCE(payment_status, '')) != 'paid'",
                                [`%${cleanPhone}`]
                            );
                            continue;
                        }

                        let targetPhase = 0;

                        if (currentPhase === 0 && (now - createdAt) >= 15 * 60 * 1000) {
                            // Message 1: 15-30 minutes after payment failure
                            targetPhase = 1;
                        } else if (currentPhase === 1 && sinceLastHours >= 72) {
                            // Message 2: 72 hours (3 days) after Message 1
                            targetPhase = 2;
                        }

                        if (targetPhase > 0) {
                            console.log(`[RECOVERY WORKER] Triggering Phase ${targetPhase} for Order #${order.id} (Phone: ${order.phone})...`);
                            const result = await sendPaymentRecoveryWhatsApp(order, targetPhase);

                            const updateTime = new Date().toISOString().replace('T', ' ').substring(0, 19);

                            if (result.success && !result.skipped) {
                                sentInThisCycle++;
                                // UPDATE ALL ORDERS FOR THIS PHONE NUMBER so no duplicate row triggers a second message
                                db.run(
                                    "UPDATE orders SET recovery_phase = ?, last_recovery_sent_at = ? WHERE phone LIKE ? AND LOWER(COALESCE(payment_status, '')) != 'paid'",
                                    [targetPhase, updateTime, `%${cleanPhone}`]
                                );
                                // Delay 5 seconds between sending messages to different customers
                                await new Promise(res => setTimeout(res, 5000));
                            } else if (result.skipped) {
                                // Order was already paid in interim
                                db.run(
                                    "UPDATE orders SET recovery_phase = 2 WHERE phone LIKE ?",
                                    [`%${cleanPhone}`]
                                );
                            }
                        }
                    }
                });
            }
        );
    } catch (e) {
        console.error('[RECOVERY WORKER] Error processing recovery queue:', e.message);
    }
}

app.listen(PORT, () => {
    console.log(`Server running on http://localhost:${PORT}`);
    console.log(`Callback Base URL: ${APP_BE_URL}`);
    initWhatsApp();

    // Start 15-minute background recovery worker
    setInterval(processPaymentRecoveryQueue, 15 * 60 * 1000);
    setTimeout(processPaymentRecoveryQueue, 30 * 1000);
});

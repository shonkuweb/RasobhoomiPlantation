import express from 'express';
import cors from 'cors';
import bodyParser from 'body-parser';
import path from 'path';
import { fileURLToPath } from 'url';
import dotenv from 'dotenv';
import crypto from 'crypto';
import axios from 'axios';
import helmet from 'helmet';
import rateLimit from 'express-rate-limit';
import jwt from 'jsonwebtoken';
import fs from 'fs';

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

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const PORT = process.env.PORT || 3000;

// Enable Proxy Trust for Docker/Nginx (Fixes rate-limit error)
app.set('trust proxy', 1);

// --- SECURITY MIDDLEWARE ---
app.use(helmet({
    contentSecurityPolicy: false, // Disabled for now to prevent breaking existing inline scripts/styles
}));

// Rate Limiting
const limiter = rateLimit({
    windowMs: 15 * 60 * 1000, // 15 minutes
    max: Number(process.env.API_RATE_LIMIT_MAX || 100),
    standardHeaders: true,
    legacyHeaders: false,
    // Storefront/admin polling makes many read calls; avoid throttling these.
    skip: (req) => {
        if (req.method !== 'GET') return false;
        const requestPath = req.path || req.originalUrl || '';
        return (
            requestPath.startsWith('/products') ||
            requestPath.startsWith('/categories') ||
            requestPath.startsWith('/orders') ||
            requestPath.startsWith('/api/products') ||
            requestPath.startsWith('/api/categories') ||
            requestPath.startsWith('/api/orders')
        );
    }
});
app.use('/api', limiter);

const authLimiter = rateLimit({
    windowMs: 15 * 60 * 1000, // 15 minutes
    max: 10, // Limit login attempts
    message: "Too many login attempts, please try again after 15 minutes"
});
app.use('/api/auth', authLimiter);

// --- JWT SECRET ---
const JWT_SECRET = process.env.JWT_SECRET || 'your-super-secret-jwt-key-change-in-production';

// --- AUTH MIDDLEWARE ---
const requireAuth = (req, res, next) => {
    const authHeader = req.headers.authorization;

    if (!authHeader || !authHeader.startsWith('Bearer ')) {
        return res.status(401).json({ error: 'Unauthorized: No token provided' });
    }

    const token = authHeader.split(' ')[1];

    try {
        const decoded = jwt.verify(token, JWT_SECRET);
        req.admin = decoded;
        next();
    } catch (err) {
        return res.status(401).json({ error: 'Unauthorized: Invalid token' });
    }
};

app.use(cors()); // In production, restrict this to your domain: { origin: 'https://yourdomain.com' }
app.use(bodyParser.json({ limit: '50mb' }));
app.use(bodyParser.urlencoded({ extended: true, limit: '50mb' }));

// --- STATIC FILES ---
// Serve built React app
app.use(express.static(path.join(__dirname, '../dist')));
// Serve legacy pages/public assets
app.use(express.static(path.join(__dirname, '../public')));
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
    const successFlag = payload?.success === true || payload?.data?.success === true;

    const successCodes = new Set(['PAYMENT_SUCCESS', 'COMPLETED', 'SUCCESS', 'PAID', 'PAYMENT_COMPLETED', 'TXN_SUCCESS']);
    return successFlag || successCodes.has(normalizedCode) || successCodes.has(nestedCode);
};

const isPhonePePaymentPending = (payload = {}) => {
    const normalizedCode = String(payload?.code || payload?.status || payload?.state || '').toUpperCase();
    const nestedCode = String(payload?.data?.code || payload?.data?.status || payload?.data?.state || payload?.data?.paymentState || '').toUpperCase();
    const pendingCodes = new Set(['PAYMENT_PENDING', 'PAYMENT_INITIATED', 'PENDING', 'INITIATED', 'IN_PROGRESS', 'PROCESSING']);
    return pendingCodes.has(normalizedCode) || pendingCodes.has(nestedCode);
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
    const { name, price, qty, category } = req.body;
    const errors = [];
    if (!name || typeof name !== 'string' || name.trim() === '') errors.push('Name is required');
    if (price === undefined || isNaN(parseFloat(price)) || parseFloat(price) < 0) errors.push('Valid price is required');
    if (qty === undefined || isNaN(parseInt(qty)) || parseInt(qty) < 0) errors.push('Valid quantity is required');
    // Category optional logic if needed, but assuming required
    if (!category || typeof category !== 'string') errors.push('Category is required');

    if (errors.length > 0) {
        console.error("Validation Failed:", errors, "Body:", req.body); // Debugging
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
const PRODUCT_CACHE_TTL_MS = 30 * 1000;
let productCacheVersion = 1;
const productResponseCache = new Map();

const buildProductCacheKey = (page, limit, isPaginated) =>
    isPaginated ? `p:${page}:l:${limit}:v:${productCacheVersion}` : `all:v:${productCacheVersion}`;

const parseProductRows = (rows) => rows.map(p => ({
    ...p,
    images: (p.images && p.images !== 'null') ? JSON.parse(p.images) : []
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
    res.set('Cache-Control', 'public, max-age=10, stale-while-revalidate=30');
    res.set('ETag', `W/"${key}"`);
};

// --- API ENDPOINTS ---

// PRODUCTS
app.get('/api/products', (req, res) => {
    const page = parseInt(req.query.page) || 0;
    const limit = parseInt(req.query.limit) || 0;
    const isPaginated = page > 0 && limit > 0;
    const cacheKey = buildProductCacheKey(page, limit, isPaginated);
    const cachedPayload = getCachedPayload(cacheKey);

    if (cachedPayload) {
        setProductResponseHeaders(res, cacheKey);
        return res.json(cachedPayload);
    }

    if (isPaginated) {
        // Get total count first, then fetch the page
        db.get("SELECT COUNT(*) as total FROM products", [], (err, countRow) => {
            if (err) return res.status(500).json({ error: err.message });

            const total = countRow.total;
            const offset = (page - 1) * limit;
            const hasMore = offset + limit < total;

            db.all("SELECT * FROM products ORDER BY id DESC LIMIT ? OFFSET ?", [limit, offset], (err, rows) => {
                if (err) return res.status(500).json({ error: err.message });
                try {
                    const products = parseProductRows(rows);
                    console.log(`Fetched ${products.length} products (Page: ${page}, Limit: ${limit}, Total: ${total})`);
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
        // Return all products (non-paginated, legacy)
        db.all("SELECT * FROM products ORDER BY id DESC", [], (err, rows) => {
            if (err) return res.status(500).json({ error: err.message });
            try {
                const products = parseProductRows(rows);
                setCachedPayload(cacheKey, products);
                setProductResponseHeaders(res, cacheKey);
                res.json(products);
            } catch (parseErr) {
                res.status(500).json({ error: "Failed to parse product data" });
            }
        });
    }
});


app.post('/api/products', requireAuth, validateProduct, (req, res) => {
    const { id, name, description, price, category, qty, image, images } = req.body;
    const finalId = id || 'P' + Date.now();
    const imagesStr = JSON.stringify(images || []);

    db.get("SELECT id FROM products WHERE id = ?", [finalId], (err, row) => {
        if (row) {
            const sql = `UPDATE products SET name = ?, description = ?, price = ?, category = ?, qty = ?, image = ?, images = ? WHERE id = ?`;
            db.run(sql, [name, description, price, category, qty, image, imagesStr, finalId], function (err) {
                if (err) return res.status(500).json({ error: err.message });
                invalidateProductCache();
                res.json({ message: 'Product updated', id: finalId });
            });
        } else {
            const sql = `INSERT INTO products (id, name, description, price, category, qty, image, images) VALUES (?, ?, ?, ?, ?, ?, ?, ?)`;
            db.run(sql, [finalId, name, description, price, category, qty, image, imagesStr], function (err) {
                if (err) return res.status(500).json({ error: err.message });
                invalidateProductCache();
                res.json({ message: 'Product created', id: finalId });
            });
        }
    });
});

app.put('/api/products/:id', requireAuth, validateProduct, (req, res) => {
    const { name, description, price, category, qty, image, images } = req.body;
    const finalId = req.params.id;
    const imagesStr = JSON.stringify(images || []);

    const sql = `UPDATE products SET name = ?, description = ?, price = ?, category = ?, qty = ?, image = ?, images = ? WHERE id = ?`;
    db.run(sql, [name, description, price, category, qty, image, imagesStr, finalId], function (err) {
        if (err) return res.status(500).json({ error: err.message });
        invalidateProductCache();
        res.json({ message: 'Product updated', id: finalId });
    });
});

// CATEGORIES
app.get('/api/categories', async (req, res) => {
    db.all("SELECT * FROM categories ORDER BY id ASC", [], (err, rows) => {
        if (err) return res.status(500).json({ error: err.message });
        res.json(rows);
    });
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
                        resolve(existing);
                    }
                );
                return;
            }

            if (!orderData) {
                console.warn(`[ORDER] No pending order found for ${orderId} and no DB row exists`);
                return resolve(null);
            }

            const { name, phone, address, city, zip, total } = orderData;
            const insertSql = `INSERT INTO orders (id, name, phone, address, city, zip, total, items, status, payment_status, transaction_id) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`;
            db.run(insertSql, [orderId, name, phone, address, city, zip, total, jsonItemsStr, 'new', 'paid', phonePeTxnId || orderId], function (insertErr) {
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
                resolve();
            }
        );
    });
}


// ORDERS & PAYMENT
app.post('/api/orders', validateOrder, async (req, res) => {
    const { name, phone, address, city, zip, items, forcedMock } = req.body;
    const orderId = 'ORD-' + Date.now();

    // Server-Side Calculation & Verification
    let calculatedTotal = 0;
    let totalQty = 0;
    let deliveryCharge = 0;
    const verifiedItems = [];

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
            if (product.category === 'Drum Plants') {
                deliveryCharge += (product.price * 0.5 * item.qty);
            } else {
                deliveryCharge += (150 * item.qty);
            }

            // Store verified price in the order item to prevent tampering in history
            verifiedItems.push({
                ...item,
                price: product.price,
                name: product.name // Ensure name is also from DB truth
            });
        }
    } catch (err) {
        console.error("Price Verification Error:", err);
        return res.status(500).json({ error: 'Failed to verify product prices' });
    }

    // Minimum order: 3 plants
    const MIN_ORDER_QTY = 3;
    if (totalQty < MIN_ORDER_QTY) {
        return res.status(400).json({ error: `Minimum order is ${MIN_ORDER_QTY} plants. You have ${totalQty}.` });
    }

    const total = calculatedTotal + deliveryCharge;
    console.log(`[DEBUG] Order ID: ${orderId}`);

    // Check for credentials
    if (!process.env.PHONEPE_CLIENT_ID || !process.env.PHONEPE_CLIENT_SECRET) {
        return res.status(500).json({ error: 'Server Payment Configuration Missing' });
    }

    // PHONEPE FLOW — Store order in memory, initiate payment, save to DB ONLY on success
    try {
        const token = await getPhonePeAuthToken();

        const payload = {
            merchantId: PHONEPE_MERCHANT_ID,
            merchantOrderId: orderId,
            amount: total * 100,
            paymentFlow: {
                type: "PG_CHECKOUT",
                message: "Payment for Order " + orderId,
                merchantUrls: {
                    redirectUrl: `${sanitizeBaseUrl(process.env.PHONEPE_CALLBACK_URL) || APP_BE_URL}/api/phonepe/callback`,
                    redirectMode: "REDIRECT",
                    callbackUrl: `${sanitizeBaseUrl(process.env.PHONEPE_CALLBACK_URL) || APP_BE_URL}/api/phonepe/callback`
                }
            }
        };

        const endpoint = "/checkout/v2/pay";
        console.log(`[DEBUG] Initiating Payment to: ${PHONEPE_PAY_URL}${endpoint}`);

        const response = await axios.post(`${PHONEPE_PAY_URL}${endpoint}`, payload, {
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `O-Bearer ${token}`
            }
        });

        const data = response.data;
        console.log("PhonePe Pay Response:", JSON.stringify(data, null, 2));

        if (data && data.redirectUrl) {
            // Store order in temp map and DB as pending to avoid data loss on callback issues/restarts
            const verifiedItemsJson = JSON.stringify(verifiedItems);
            pendingOrders.set(orderId, {
                name, phone, address, city, zip,
                total,
                items: verifiedItemsJson,
                createdAt: Date.now()
            });
            console.log(`[ORDER] Stored pending order ${orderId} in memory`);

            db.run(
                `INSERT INTO orders (id, name, phone, address, city, zip, total, items, status, payment_status, transaction_id)
                 VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
                [orderId, name, phone, address, city, zip, total, verifiedItemsJson, 'pending_payment', 'pending', null],
                function (insertErr) {
                    if (insertErr) {
                        console.error(`[ORDER] Failed to persist pending order ${orderId}:`, insertErr.message);
                    } else {
                        console.log(`[ORDER] Pending order ${orderId} saved to DB`);
                    }
                }
            );

            res.json({
                success: true,
                message: "Payment Session Created",
                payment_url: data.redirectUrl,
                orderId
            });
        } else {
            res.status(500).json({ error: "Unexpected PhonePe Response", details: data });
        }

    } catch (pgErr) {
        console.error("PhonePe Init Error:", pgErr.response ? pgErr.response.data : pgErr.message);
        res.status(500).json({
            error: 'Payment Initiation Failed',
            details: pgErr.response ? pgErr.response.data : pgErr.message
        });
    }
});


// PhonePe Callback GET Handler (Browser Redirect after payment)
app.get('/api/phonepe/callback', async (req, res) => {
    console.log("PhonePe GET Callback Received");
    console.log("Query Params:", JSON.stringify(req.query));

    const baseUrl = APP_FE_URL || APP_BE_URL || `http://localhost:${PORT}`;
    const getCallbackOrderId = (payload = {}) =>
        payload.merchantOrderId || payload.merchantTransactionId || payload.orderId || payload.transactionId;

    const { code, transactionId } = req.query;
    const orderId = getCallbackOrderId(req.query);

    console.log(`[CALLBACK] code=${code} orderId=${orderId}`);

    if (!orderId) {
        console.error("[CALLBACK] No orderId found in query params");
        return res.redirect(`${baseUrl}/payment/failure`);
    }

    try {
        const token = await getPhonePeAuthToken();
        const statusUrl = `${PHONEPE_PAY_URL}/checkout/v2/order/${PHONEPE_MERCHANT_ID}/${orderId}/status`;
        console.log(`[CALLBACK] Checking status at: ${statusUrl}`);

        const statusResponse = await axios.get(statusUrl, {
            headers: { 'Content-Type': 'application/json', 'Authorization': `O-Bearer ${token}` }
        });

        const statusData = statusResponse.data;
        console.log("[CALLBACK] Status Response:", JSON.stringify(statusData, null, 2));

        const isSuccess = isPhonePePaymentSuccess(statusData) || code === 'PAYMENT_SUCCESS';
        const isPending = isPhonePePaymentPending(statusData) || code === 'PAYMENT_PENDING' || code === 'PAYMENT_INITIATED';

        if (isSuccess) {
            const phonePeTxnId = statusData?.data?.transactionId || transactionId || orderId;
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

        const getCallbackOrderId = (payload = {}) =>
            payload.merchantOrderId || payload.merchantTransactionId || payload.orderId || payload.transactionId;

        // Type A: Browser POST Redirect (form-encoded) — code, merchantId, transactionId in body
        if (req.body.code && req.body.merchantId) {
            const { code, transactionId } = req.body;
            const orderId = getCallbackOrderId(req.body);
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
            // Verify auth header
            const authHeader = req.headers['authorization'];
            const webhookUser = process.env.PHONEPE_WEBHOOK_USERNAME;
            const webhookPass = process.env.PHONEPE_WEBHOOK_PASSWORD;

            if (webhookUser && webhookPass) {
                const expectedAuth = crypto.createHash('sha256').update(`${webhookUser}:${webhookPass}`).digest('hex');
                if (authHeader !== expectedAuth) {
                    console.error("Invalid Webhook Auth. Received:", authHeader);
                    return res.status(401).send("Unauthorized Webhook");
                }
            }

            const decoded = JSON.parse(Buffer.from(response, 'base64').toString('utf-8'));
            const { success, code, data } = decoded;
            const transactionId = data?.transactionId;
            const orderId = getCallbackOrderId(data || {});

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

        console.error("Unknown Callback Format", req.body);
        return res.status(400).send("Invalid Request");

    } catch (err) {
        console.error("Callback Error", err);
        res.status(500).send("Internal Server Error");
    }
});

app.get('/api/orders', (req, res) => {
    db.all("SELECT * FROM orders ORDER BY created_at DESC", [], (err, rows) => {
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

                res.json({ success: true, message: 'Order marked as paid' });
            }
        );
    });
});

app.get('/api/orders/:id', (req, res) => {
    db.get("SELECT * FROM orders WHERE id = ?", [req.params.id], (err, row) => {
        if (err) return res.status(500).json({ error: err.message });
        if (!row) return res.status(404).json({ error: 'Order not found' });

        const order = {
            ...row,
            items: row.items ? JSON.parse(row.items) : []
        };
        res.json(order);
    });
});


app.put('/api/orders/:id', requireAuth, (req, res) => {
    const { status } = req.body;
    db.run("UPDATE orders SET status = ? WHERE id = ?", [status, req.params.id], function (err) {
        if (err) return res.status(500).json({ error: err.message });
        res.json({ message: 'Order status updated' });
    });
});

app.post('/api/auth/login', (req, res) => {
    const { password } = req.body;

    // Check DB first, fallback to .env 
    db.get("SELECT value FROM admin_settings WHERE key = 'admin_password'", [], (err, row) => {
        if (err) {
            console.error("DB Error checking password:", err);
            return res.status(500).json({ success: false, message: 'Internal Server Error' });
        }

        const adminPass = row ? row.value : (process.env.ADMIN_PASSCODE || '1234');

        if (password === adminPass) {
            // Generate real JWT token
            const token = jwt.sign(
                { role: 'admin', loginTime: Date.now() },
                JWT_SECRET,
                { expiresIn: '2h' }
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
            console.error("DB Error on change password:", err);
            return res.status(500).json({ success: false, message: 'Internal server error' });
        }

        const currentAdminPass = row ? row.value : (process.env.ADMIN_PASSCODE || '1234');

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
    db.run("DELETE FROM products WHERE id = ?", [req.params.id], function (err) {
        if (err) return res.status(500).json({ error: err.message });
        invalidateProductCache();
        res.json({ message: 'Deleted' });
    });
});

app.delete('/api/orders/:id', requireAuth, (req, res) => {
    db.run("DELETE FROM orders WHERE id = ?", [req.params.id], function (err) {
        if (err) return res.status(500).json({ error: err.message });
        res.json({ message: 'Deleted' });
    });
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

app.listen(PORT, () => {
    console.log(`Server running on http://localhost:${PORT}`);
    console.log(`Callback Base URL: ${APP_BE_URL}`);
});

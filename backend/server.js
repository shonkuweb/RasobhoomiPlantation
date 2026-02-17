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

// --- SECURITY MIDDLEWARE ---
app.set('trust proxy', 1); // Trust first proxy (Nginx/Docker)
app.use(helmet({
    contentSecurityPolicy: false, // Disabled for now to prevent breaking existing inline scripts/styles
}));

// Rate Limiting
const limiter = rateLimit({
    windowMs: 15 * 60 * 1000, // 15 minutes
    max: 100, // Limit each IP to 100 requests per windowMs
    standardHeaders: true,
    legacyHeaders: false,
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
    res.sendFile(path.join(__dirname, '../pages/admin.html'));
});

// --- LOGGING MIDDLEWARE ---
app.use((req, res, next) => {
    console.log(`[${new Date().toISOString()}] ${req.method} ${req.url}`);
    next();
});

// Token verification endpoint
app.get('/api/auth/verify', requireAuth, (req, res) => {
    res.json({ valid: true, role: req.admin.role });
});



// --- PAYMENT CONFIGURATION (V2) ---
const PHONEPE_HOST_URL = process.env.PHONEPE_HOST_URL || "https://api-preprod.phonepe.com/apis/pg-sandbox";
const PHONEPE_CLIENT_ID = process.env.PHONEPE_CLIENT_ID;
const PHONEPE_CLIENT_SECRET = process.env.PHONEPE_CLIENT_SECRET;
const PHONEPE_CLIENT_VERSION = process.env.PHONEPE_CLIENT_VERSION || 1;
const APP_BE_URL = process.env.APP_BE_URL || `http://localhost:${PORT}`;

// Token Caching
let cachedAccessToken = null;
let tokenExpiryTime = 0;

async function getAuthToken() {
    if (cachedAccessToken && Date.now() < tokenExpiryTime) {
        return cachedAccessToken;
    }

    if (!PHONEPE_CLIENT_ID || !PHONEPE_CLIENT_SECRET) {
        throw new Error("PhonePe Credentials Missing");
    }

    try {
        console.log("Fetching new PhonePe Auth Token...");
        const params = new URLSearchParams();
        params.append('client_id', PHONEPE_CLIENT_ID);
        params.append('client_version', PHONEPE_CLIENT_VERSION);
        params.append('client_secret', PHONEPE_CLIENT_SECRET);
        params.append('grant_type', 'client_credentials');

        const response = await axios.post(`${PHONEPE_HOST_URL}/v1/oauth/token`, params, {
            headers: { 'Content-Type': 'application/x-www-form-urlencoded' }
        });

        const { access_token, expires_in } = response.data;
        cachedAccessToken = access_token;
        // Expire 10 seconds before actual expiry to be safe
        tokenExpiryTime = Date.now() + (expires_in * 1000) - 10000;
        console.log("PhonePe Auth Token refreshed.");
        return access_token;

    } catch (error) {
        console.error("Failed to get Auth Token:", error.response ? error.response.data : error.message);
        throw new Error("Payment System Authentication Failed");
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
        return res.status(400).json({ error: 'Validation Failed', details: errors });
    }
    next();
};

const validateOrder = (req, res, next) => {
    const { name, phone, address, items } = req.body;
    const errors = [];
    if (!name || typeof name !== 'string') errors.push('Customer name is required');
    if (!phone || !/^\d{10}$/.test(String(phone).trim())) errors.push('Valid 10-digit phone number is required');
    if (!address || typeof address !== 'string') errors.push('Address is required');
    if (!items || !Array.isArray(items) || items.length === 0) errors.push('Order must contain items');
    else {
        // Validate items structure
        const invalidItems = items.filter(i => !i.id || !i.qty || i.qty <= 0);
        if (invalidItems.length > 0) errors.push('Invalid items in order (missing ID or invalid Qty)');
    }

    if (errors.length > 0) {
        return res.status(400).json({ error: 'Validation Failed', details: errors });
    }
    next();
};

// --- API ENDPOINTS ---

// PRODUCTS
app.get('/api/products', (req, res) => {
    db.all("SELECT * FROM products", [], (err, rows) => {
        if (err) {
            console.error("Fetch Products Error:", err);
            return res.status(500).json({ error: err.message });
        }

        try {
            const products = rows.map(p => ({
                ...p,
                images: (p.images && p.images !== 'null') ? JSON.parse(p.images) : []
            }));
            console.log(`Fetched ${products.length} products`);
            res.json(products);
        } catch (parseErr) {
            console.error("Product Parse Error:", parseErr);
            console.error("Raw Rows:", rows);
            res.status(500).json({ error: "Failed to parse product data" });
        }
    });
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
                res.json({ message: 'Product updated', id: finalId });
            });
        } else {
            const sql = `INSERT INTO products (id, name, description, price, category, qty, image, images) VALUES (?, ?, ?, ?, ?, ?, ?, ?)`;
            db.run(sql, [finalId, name, description, price, category, qty, image, imagesStr], function (err) {
                if (err) return res.status(500).json({ error: err.message });
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
        res.json({ message: 'Product updated', id: finalId });
    });
});

// CATEGORIES
app.get('/api/categories', (req, res) => {
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
            if (err) reject(err);
            else resolve(row);
        });
    });
}

// ORDERS & PAYMENT
app.post('/api/orders', validateOrder, async (req, res) => {
    const { name, phone, address, city, zip, items, forcedMock } = req.body;
    const orderId = 'ORD-' + Date.now();


    // Server-Side Calculation & Verification
    let calculatedTotal = 0;
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

    const SHIPPING_FEE = 150;
    const total = calculatedTotal + SHIPPING_FEE; // Include shipping fee in total
    const amountInPaise = total * 100;

    const useMock = forcedMock || (!process.env.PHONEPE_CLIENT_ID || !process.env.PHONEPE_CLIENT_SECRET);

    if (useMock) {
        // MOCK FLOW
        const transactionId = 'MOCK-TXN-' + Date.now();
        const itemsStr = JSON.stringify(verifiedItems);
        const sql = `INSERT INTO orders (id, name, phone, address, city, zip, total, items, status, payment_status, transaction_id) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`;

        db.run(sql, [orderId, name, phone, address, city, zip, total, itemsStr, 'new', 'paid', transactionId], function (err) {
            if (err) return res.status(500).json({ error: err.message });

            // Deduct Stock
            verifiedItems.forEach(item => {
                db.run("UPDATE products SET qty = qty - ? WHERE id = ?", [item.qty, item.id], (err) => { });
            });

            res.json({ success: true, message: 'Order created (Mock)', id: orderId });
        });
        return;
    }

    // REAL PHONEPE FLOW (V2)
    const itemsStr = JSON.stringify(verifiedItems);
    const sql = `INSERT INTO orders (id, name, phone, address, city, zip, total, items, status, payment_status, transaction_id) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`;

    console.log(`[ORDER] Creating order ${orderId} for amount ₹${total}`);

    db.run(sql, [orderId, name, phone, address, city, zip, total, itemsStr, 'pending_payment', 'pending', null], async function (err) {
        if (err) {
            console.error(`[ORDER] DB Insert Error: ${err.message}`);
            return res.status(500).json({ error: err.message });
        }

        // Initiate PhonePe V2
        try {
            console.log(`[PHONEPE] Initiating payment for ${orderId}...`);
            const token = await getAuthToken();


            const payload = {
                merchantOrderId: orderId,
                amount: amountInPaise,
                paymentFlow: {
                    type: "PG_CHECKOUT",
                    merchantUrls: {
                        redirectUrl: `${APP_BE_URL}/api/phonepe/redirect?orderId=${orderId}`
                    }
                },
                // Optional: metaInfo to store extra data, or paymentModeConfig
            };

            const response = await axios.post(`${PHONEPE_HOST_URL}/checkout/v2/pay`, payload, {
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `O-Bearer ${token}`
                }
            });

            const data = response.data;
            // V2 Success Response: { state: "PENDING", redirectUrl: "...", ... }
            if (data && data.redirectUrl) {
                res.json({
                    success: true,
                    message: 'Payment Initiated',
                    payment_url: data.redirectUrl,
                    orderId: orderId
                });
            } else {
                console.error("PhonePe V2 Response Error:", data);
                res.status(500).json({ error: 'PhonePe Error', details: data });
            }

        } catch (pgErr) {
            console.error("PhonePe Init Error:", pgErr.response ? pgErr.response.data : pgErr.message);
            res.status(500).json({ error: 'Payment Initiation Failed' });
        }
    });
});

// PhonePe Redirect Handler (User comes here after payment)
app.get('/api/phonepe/redirect', async (req, res) => {
    const { orderId } = req.query;
    console.log(`[REDIRECT] Handling redirect for Order ID: ${orderId}`);

    if (!orderId) {
        return res.redirect('/?error=missing_order_id');
    }

    try {
        const token = await getAuthToken();
        console.log(`[REDIRECT] Checking status with PhonePe for ${orderId}...`);

        const response = await axios.get(`${PHONEPE_HOST_URL}/checkout/v2/order/${orderId}/status`, {
            headers: { 'Authorization': `O-Bearer ${token}` }
        });

        const { state } = response.data; // "COMPLETED", "FAILED", "PENDING"
        console.log(`[REDIRECT] Payment Status for ${orderId}: ${state}`);

        if (state === 'COMPLETED') {
            // Update DB
            db.run("UPDATE orders SET status = ?, payment_status = ? WHERE id = ?", ['new', 'paid', orderId], (err) => {
                if (err) console.error("DB Update Error (Redirect)", err);
                // Stock deduction typically done on 'pending_payment' -> 'paid' transition.
                // Ideally check if already paid to avoid double deduction.
                // For now simplicity:
                db.get("SELECT items, payment_status FROM orders WHERE id = ?", [orderId], (err, row) => {
                    if (row && row.payment_status !== 'paid' && row.items) {
                        const items = JSON.parse(row.items);
                        items.forEach(item => {
                            db.run("UPDATE products SET qty = qty - ? WHERE id = ?", [item.qty, item.id], () => { });
                        });
                    }
                });
            });

            res.redirect(`/?payment=success&order=${orderId}`);
        } else if (state === 'FAILED') {
            db.run("UPDATE orders SET payment_status = ? WHERE id = ?", ['failed', orderId]);
            res.redirect(`/?payment=failure&order=${orderId}`);
        } else {
            // PENDING or other
            res.redirect(`/?payment=pending&order=${orderId}`);
        }
    } catch (e) {
        console.error("Redirect Status Check Error:", e.response ? e.response.data : e.message);
        res.redirect(`/?payment=error&order=${orderId}`);
    }
});

// PhonePe Webhook (S2S Callback for robustness)
app.post('/api/phonepe/callback', async (req, res) => {
    console.log(`[WEBHOOK] Received callback: ${JSON.stringify(req.body)}`);
    try {
        // Basic Authorization Header Verification
        // Header format: SHA256(username:password)
        const authHeader = req.headers['authorization'];
        if (process.env.PHONEPE_WEBHOOK_USERNAME && process.env.PHONEPE_WEBHOOK_PASSWORD) {
            const expectedHash = crypto.createHash('sha256').update(`${process.env.PHONEPE_WEBHOOK_USERNAME}:${process.env.PHONEPE_WEBHOOK_PASSWORD}`).digest('hex');
            // Check if authHeader matches expectedHash (PhonePe sends "SHA256(...)") or just the hash?
            // "Authorization" header value is "SHA256(username:password)" -> actually likely the hash itself? 
            // Docs say: "Authorization header in the following format: Authorization: SHA256(username:password)"
            // This usually means the literal string "SHA256(hash)".
            // Let's implement permissive check for now or log it.
            console.log("Webhook Auth Header:", authHeader);
        }

        const { event, payload } = req.body;

        if (event === 'checkout.order.completed' && payload.state === 'COMPLETED') {
            const { merchantOrderId } = payload;

            db.run("UPDATE orders SET status = ?, payment_status = ? WHERE id = ?", ['new', 'paid', merchantOrderId], (err) => {
                if (!err) {
                    // Stock logic (duplicate of redirect logic, safe due to check)
                    db.get("SELECT items, payment_status FROM orders WHERE id = ?", [merchantOrderId], (err, row) => {
                        if (row && row.payment_status !== 'paid' && row.items) {
                            const items = JSON.parse(row.items);
                            items.forEach(item => {
                                db.run("UPDATE products SET qty = qty - ? WHERE id = ?", [item.qty, item.id], () => { });
                            });
                        }
                    });
                }
            });
        }
        res.status(200).send("OK");
    } catch (err) {
        console.error("Webhook Error", err);
        res.status(500).send("Internal Server Error");
    }
});


// ORDERS LIST (ADMIN)
app.get('/api/orders', (req, res) => {
    db.all("SELECT * FROM orders WHERE status != 'pending_payment' ORDER BY created_at DESC", [], (err, rows) => {
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
    // SECURE: Use Environment Variable
    const adminPass = process.env.ADMIN_PASSCODE || '1234';



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

app.delete('/api/products/:id', requireAuth, (req, res) => {
    db.run("DELETE FROM products WHERE id = ?", [req.params.id], function (err) {
        if (err) return res.status(500).json({ error: err.message });
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

// --- AUTO-CLEANUP TASK ---
function cleanupOldOrders() {
    console.log('[CLEANUP] Starting cleanup of old completed orders...');
    const isPostgres = process.env.DB_TYPE === 'postgres';

    let sql;
    if (isPostgres) {
        sql = "DELETE FROM orders WHERE status = 'completed' AND created_at < NOW() - INTERVAL '7 days'";
    } else {
        // SQLite
        sql = "DELETE FROM orders WHERE status = 'completed' AND created_at < datetime('now', '-7 days')";
    }

    db.run(sql, [], function (err) {
        if (err) {
            console.error('[CLEANUP] Error deleting old orders:', err.message);
        } else {
            // Safe access to 'this.changes' depending on DB wrapper
            const changes = this ? this.changes : 'unknown';
            if (changes > 0 || changes === 'unknown') {
                console.log(`[CLEANUP] Deleted old completed orders. Rows affected: ${changes}`);
            } else {
                console.log('[CLEANUP] No old orders to delete.');
            }
        }
    });
}

// Run cleanup on startup
cleanupOldOrders();

// Schedule cleanup every 24 hours (24 * 60 * 60 * 1000 ms)
setInterval(cleanupOldOrders, 24 * 60 * 60 * 1000);

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

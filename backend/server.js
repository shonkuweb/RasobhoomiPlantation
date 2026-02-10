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

// Token verification endpoint
app.get('/api/auth/verify', requireAuth, (req, res) => {
    res.json({ valid: true, role: req.admin.role });
});


// --- PAYMENT CONFIGURATION ---
const PHONEPE_HOST_URL = process.env.PHONEPE_HOST_URL || "https://api-preprod.phonepe.com/apis/pg-sandbox";
const PHONEPE_MERCHANT_ID = process.env.PHONEPE_MERCHANT_ID || "PGTESTPAYUAT";
const PHONEPE_SALT_KEY = process.env.PHONEPE_SALT_KEY || "099eb0cd-02cf-4e2a-8aca-3e6c6aff0399";
const PHONEPE_SALT_INDEX = process.env.PHONEPE_SALT_INDEX || 1;
const APP_BE_URL = process.env.APP_BE_URL || `http://localhost:${PORT}`;

// Helper: Checksum
function generatePhonePeChecksum(payloadBase64, endpoint) {
    const stringToHash = payloadBase64 + endpoint + PHONEPE_SALT_KEY;
    const sha256 = crypto.createHash('sha256').update(stringToHash).digest('hex');
    return `${sha256}###${PHONEPE_SALT_INDEX}`;
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

    const itemsStr = JSON.stringify(verifiedItems);
    const total = calculatedTotal; // Override client total

    const useMock = forcedMock || (!process.env.PHONEPE_MERCHANT_ID && !process.env.PHONEPE_SALT_KEY);

    if (useMock) {
        // MOCK FLOW
        const transactionId = 'MOCK-TXN-' + Date.now();
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

    // REAL PHONEPE FLOW (Initial Order Creation)
    const sql = `INSERT INTO orders (id, name, phone, address, city, zip, total, items, status, payment_status, transaction_id) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`;

    db.run(sql, [orderId, name, phone, address, city, zip, total, itemsStr, 'pending_payment', 'pending', null], async function (err) {
        if (err) return res.status(500).json({ error: err.message });

        // Initiate PhonePe
        try {
            const payload = {
                merchantId: PHONEPE_MERCHANT_ID,
                merchantTransactionId: orderId,
                merchantUserId: 'U' + Date.now(),
                amount: total * 100, // in paise
                redirectUrl: `${APP_BE_URL}/api/phonepe/callback`,
                redirectMode: "POST",
                callbackUrl: `${APP_BE_URL}/api/phonepe/callback`,
                mobileNumber: phone,
                paymentInstrument: {
                    type: "PAY_PAGE"
                }
            };

            const payloadBase64 = Buffer.from(JSON.stringify(payload)).toString('base64');
            const checksum = generatePhonePeChecksum(payloadBase64, "/pg/v1/pay");

            const response = await axios.post(`${PHONEPE_HOST_URL}/pg/v1/pay`, {
                request: payloadBase64
            }, {
                headers: {
                    'Content-Type': 'application/json',
                    'X-VERIFY': checksum
                }
            });

            const data = response.data;
            if (data.success) {
                res.json({
                    success: true,
                    message: 'Payment Initiated',
                    payment_url: data.data.instrumentResponse.redirectInfo.url,
                    orderId: orderId
                });
            } else {
                res.status(500).json({ error: 'PhonePe Error', details: data });
            }

        } catch (pgErr) {
            console.error("PhonePe Init Error:", pgErr.response ? pgErr.response.data : pgErr);
            res.status(500).json({ error: 'Payment Initiation Failed' });
        }
    });
});

// PhonePe Callback
app.post('/api/phonepe/callback', async (req, res) => {
    try {
        const { response } = req.body;

        if (!response) {
            return res.status(400).send("Invalid Callback");
        }

        const decoded = JSON.parse(Buffer.from(response, 'base64').toString('utf-8'));
        const { success, code, data } = decoded;
        const { merchantTransactionId, transactionId } = data; // merchantTransactionId is our orderId

        if (success && code === 'PAYMENT_SUCCESS') {
            // Update Order
            db.run("UPDATE orders SET status = ?, payment_status = ?, transaction_id = ? WHERE id = ?",
                ['new', 'paid', transactionId, merchantTransactionId], // merchantTransactionId is the Order ID we sent
                (err) => {
                    if (err) console.error("DB Update Error", err);

                    // Deduct Stock (Ideally verify amount too)
                    // We need to fetch order items to deduct stock...
                    db.get("SELECT items FROM orders WHERE id = ?", [merchantTransactionId], (err, row) => {
                        if (row && row.items) {
                            const items = JSON.parse(row.items);
                            items.forEach(item => {
                                db.run("UPDATE products SET qty = qty - ? WHERE id = ?", [item.qty, item.id], (err) => { });
                            });
                        }
                    });
                }
            );

            // Redirect User to Success Page
            res.redirect('/?payment=success&order=' + merchantTransactionId);
        } else {
            // Update Order Failed
            db.run("UPDATE orders SET payment_status = ? WHERE id = ?", ['failed', merchantTransactionId]);
            res.redirect('/?payment=failure&order=' + merchantTransactionId);
        }

    } catch (err) {
        console.error("Callback Error", err);
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

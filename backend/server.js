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

// Enable Proxy Trust for Docker/Nginx (Fixes rate-limit error)
app.set('trust proxy', 1);

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
    res.sendFile(path.join(__dirname, '../pages/admin_legacy.html'));
});

// Token verification endpoint
app.get('/api/auth/verify', requireAuth, (req, res) => {
    res.json({ valid: true, role: req.admin.role });
});


// --- PAYMENT CONFIGURATION (V2) ---
// --- PAYMENT CONFIGURATION (V2) ---
// Production: 
// Auth: https://api.phonepe.com/apis/identity-manager
// Pay:  https://api.phonepe.com/apis/hermes
// Sandbox:
// Auth: https://api-preprod.phonepe.com/apis/pg-sandbox
// Pay:  https://api-preprod.phonepe.com/apis/pg-sandbox

const isSandbox = process.env.PHONEPE_MERCHANT_ID ? process.env.PHONEPE_MERCHANT_ID.startsWith('PGTEST') : true;

const PHONEPE_AUTH_URL = process.env.PHONEPE_AUTH_URL || (isSandbox ? "https://api-preprod.phonepe.com/apis/pg-sandbox" : "https://api.phonepe.com/apis/identity-manager");
const PHONEPE_PAY_URL = process.env.PHONEPE_PAY_URL || (isSandbox ? "https://api-preprod.phonepe.com/apis/pg-sandbox" : "https://api.phonepe.com/apis/hermes");

const PHONEPE_CLIENT_ID = process.env.PHONEPE_CLIENT_ID;
const PHONEPE_CLIENT_SECRET = process.env.PHONEPE_CLIENT_SECRET;
const PHONEPE_CLIENT_VERSION = process.env.PHONEPE_CLIENT_VERSION || 1;
const PHONEPE_MERCHANT_ID = process.env.PHONEPE_MERCHANT_ID || "PGTESTPAYUAT";
const APP_BE_URL = process.env.APP_BE_URL || `http://localhost:${PORT}`;

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
    const jsonItemsStr = JSON.stringify(items);


    console.log(`[DEBUG] Order ID: ${orderId}`);

    // Check for credentials
    if (!process.env.PHONEPE_CLIENT_ID || !process.env.PHONEPE_CLIENT_SECRET) {
        return res.status(500).json({ error: 'Server Payment Configuration Missing' });
    }

    // REAL PHONEPE FLOW (V2 OAuth)
    const sql = `INSERT INTO orders (id, name, phone, address, city, zip, total, items, status, payment_status, transaction_id) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`;

    db.run(sql, [orderId, name, phone, address, city, zip, total, jsonItemsStr, 'pending_payment', 'pending', null], async function (err) {
        if (err) return res.status(500).json({ error: err.message });

        // Initiate PhonePe
        try {
            const token = await getPhonePeAuthToken(); // Get OAuth Token

            const payload = {
                merchantId: PHONEPE_MERCHANT_ID,
                merchantTransactionId: orderId,
                merchantUserId: "MUID-" + orderId,
                amount: total * 100,
                redirectUrl: `${process.env.PHONEPE_CALLBACK_URL || process.env.APP_BE_URL}/api/phonepe/callback`,
                redirectMode: "REDIRECT",
                callbackUrl: `${process.env.PHONEPE_CALLBACK_URL || process.env.APP_BE_URL}/api/phonepe/callback`,
                mobileNumber: phone,
                paymentInstrument: {
                    type: "PAY_PAGE"
                }
            };

            const endpoint = "/pg/v1/pay";
            console.log(`[DEBUG] Initiating Payment to: ${PHONEPE_PAY_URL}${endpoint}`);

            // Note: If using OAuth, some docs suggest sending JSON directly.
            // If using Salt, we would need Base64 + X-VERIFY. 
            // Assuming OAuth supports JSON body for V1 as per recent V2-like behavior docs or we'll try standard JSON.
            const response = await axios.post(`${PHONEPE_PAY_URL}${endpoint}`,
                payload,
                {
                    headers: {
                        'Content-Type': 'application/json',
                        'Authorization': `O-Bearer ${token}`
                    }
                }
            );

            const data = response.data;
            console.log("PhonePe Pay Response:", JSON.stringify(data, null, 2));

            if (data.success && (data.code === 'PAYMENT_INITIATED' || data.code === 'SUCCESS')) {
                const redirectUrl = data.data?.instrumentResponse?.redirectInfo?.url ||
                    data.data?.redirectUrl;

                if (redirectUrl) {
                    res.json({
                        success: true,
                        message: 'Payment Initiated',
                        payment_url: redirectUrl,
                        orderId: orderId
                    });
                } else {
                    res.status(500).json({ error: 'No Redirect URL in PhonePe Response', details: data });
                }

            } else {
                res.status(500).json({ error: 'PhonePe Error', details: data });
            }

        } catch (pgErr) {
            console.error("PhonePe Init Error:", pgErr.response ? pgErr.response.data : pgErr.message);
            res.status(500).json({
                error: 'Payment Initiation Failed',
                details: pgErr.response ? pgErr.response.data : pgErr.message
            });
        }
    });
});

// PhonePe Callback GET Handler (Handle GET Redirects from PhonePe)
app.get('/api/phonepe/callback', (req, res) => {
    console.log("PhonePe Callback Received via GET");
    console.log("Query Params:", JSON.stringify(req.query));

    const { code, transactionId } = req.query;

    if (code && transactionId) {
        // Handle GET Redirect (Same logic as POST)
        console.log(`Processing GET Redirect: Code=${code}, Txn=${transactionId}`);
        const baseUrl = process.env.APP_FE_URL || 'http://localhost:8080';

        if (code === 'PAYMENT_SUCCESS') {
            return res.redirect(`${baseUrl}/payment/success?orderId=${transactionId}`);
        } else if (code === 'PAYMENT_PENDING' || code === 'PAYMENT_INITIATED') {
            return res.redirect(`${baseUrl}/payment/pending?orderId=${transactionId}`);
        } else {
            return res.redirect(`${baseUrl}/payment/failure?orderId=${transactionId}`);
        }
    }

    // If no code/txn, then show error (Direct Access)
    res.status(405).send('<h1>Method Not Allowed</h1><p>Invalid Callback Request.</p><a href="/">Go to Home</a>');
});

// PhonePe Callback & Redirect Handler (V2 Secure)
app.post('/api/phonepe/callback', async (req, res) => {
    try {
        console.log("PhonePe Callback Received");
        console.log("Headers:", JSON.stringify(req.headers));
        console.log("Body:", JSON.stringify(req.body));

        // DETECT REQUEST TYPE
        // Type A: Browser Redirect (Standard Checkout V2) -> Content-Type: application/x-www-form-urlencoded
        // Body contains: code, merchantId, transactionId, providerReferenceId
        if (req.body.code && req.body.merchantId) {
            const { code, transactionId } = req.body;
            console.log(`Processing Redirect: Code=${code}, Txn=${transactionId}`);

            // For Browser Redirect, we TRUST the 'code' implies success (or should ideally check Status API)
            // Redirect user to Success Page immediately.
            // IMPORTANT: If APP_FE_URL is not set in Production, this might redirect to localhost!
            // Fallback to relative path if on same domain? No, separating FE/BE is safer.
            const baseUrl = process.env.APP_FE_URL || 'http://localhost:8080';
            console.log(`Redirecting to Base URL: ${baseUrl}`);

            if (code === 'PAYMENT_SUCCESS') {
                return res.redirect(`${baseUrl}/payment/success?orderId=${transactionId}`);
            } else if (code === 'PAYMENT_PENDING' || code === 'PAYMENT_INITIATED') {
                return res.redirect(`${baseUrl}/payment/pending?orderId=${transactionId}`);
            } else {
                return res.redirect(`${baseUrl}/payment/failure?orderId=${transactionId}`);
            }
        }

        // Type B: Server-to-Server Webhook -> Content-Type: application/json
        // Body contains: { response: "base64String" }
        // Header: x-verify
        const { response } = req.body;
        const xVerify = req.headers['x-verify'];

        if (response && xVerify) {
            // 1. VERIFY SIGNATURE (Custom Authorization Header as per User Requirement)
            const authHeader = req.headers['authorization'];
            const webhookUser = process.env.PHONEPE_WEBHOOK_USERNAME;
            const webhookPass = process.env.PHONEPE_WEBHOOK_PASSWORD;

            if (webhookUser && webhookPass) {
                // Prompt: SHA256(username:password)
                const expectedAuth = crypto.createHash('sha256').update(`${webhookUser}:${webhookPass}`).digest('hex');

                if (authHeader !== expectedAuth) {
                    console.error("Invalid Webhook Authorization Header");
                    console.error("Received:", authHeader);
                    console.error("Expected:", expectedAuth);
                    return res.status(401).send("Unauthorized Webhook");
                }
            } else {
                console.warn("Skipping Webhook Verification: Missing Username/Password in .env");
            }

            // 2. DECODE & PROCESS
            const decoded = JSON.parse(Buffer.from(response, 'base64').toString('utf-8'));
            const { success, code, data } = decoded;
            const { merchantTransactionId, transactionId } = data;

            // 3. IDEMPOTENCY CHECK (Prevent Double Deduction)
            const order = await new Promise((resolve, reject) => {
                db.get("SELECT * FROM orders WHERE id = ?", [merchantTransactionId], (err, row) => {
                    if (err) reject(err); else resolve(row);
                });
            });

            if (!order) return res.status(404).send("Order Not Found");

            if (order.payment_status === 'paid') {
                // Already processed, acknowledge to PhonePe
                return res.status(200).send("OK");
            }

            if (success && code === 'PAYMENT_SUCCESS') {
                // Update Order
                db.run("UPDATE orders SET status = 'new', payment_status = 'paid', transaction_id = ? WHERE id = ?",
                    [transactionId, merchantTransactionId],
                    (err) => {
                        if (err) console.error("DB Error", err);

                        // Deduct Stock
                        // Ensure we parse items correctly
                        if (order.items) {
                            try {
                                const items = JSON.parse(order.items);
                                items.forEach(item => {
                                    db.run("UPDATE products SET qty = qty - ? WHERE id = ?", [item.qty, item.id]);
                                });
                            } catch (e) { console.error("Item Parse Error", e); }
                        }
                    }
                );
                return res.status(200).send("OK");
            } else {
                db.run("UPDATE orders SET payment_status = 'failed' WHERE id = ?", [merchantTransactionId]);
                return res.status(200).send("OK"); // Acknowledge failure receipt
            }
        }

        // Unknown Payload
        console.error("Unknown Callback Format", req.body);
        return res.status(400).send("Invalid Request");

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

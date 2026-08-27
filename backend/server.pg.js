import express from 'express';
import cors from 'cors';
import bodyParser from 'body-parser';
import path from 'path';
import { fileURLToPath } from 'url';
import db from './database.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const PORT = process.env.PORT || 3000;

app.use(cors());
app.use(bodyParser.json({ limit: '50mb' })); // Increased limit for Base64 images
app.use(express.static(path.join(__dirname, 'dist')));

// Serve static assets from root for dev (vite proxy setup handles this usually, but for production)
// Also serve 'public' folder if exists
app.use(express.static(path.join(__dirname, 'public')));


// --- MOCK PAYMENT MIDDLEWARE ---
const processPayment = (req, res, next) => {
    // Simulate delay
    setTimeout(() => {
        // Simple random success/fail for robustness, but for demo we want success usually.
        // Let's say 95% success rate
        // const isSuccess = Math.random() > 0.05;
        const isSuccess = true; // FORCE SUCCESS FOR DEBUGGING

        if (isSuccess) {
            req.paymentDetails = {
                status: 'paid',
                transaction_id: 'TXN-' + Date.now() + '-' + Math.floor(Math.random() * 1000)
            };
            next();
        } else {
            res.status(400).json({ error: 'Payment Failed', message: 'Bank rejected transaction' });
        }
    }, 1500);
};

// --- API ENDPOINTS ---

// --- API ENDPOINTS ---

// PRODUCTS
app.get('/api/products', async (req, res) => {
    const includeHidden = req.query.include_hidden === '1' || req.query.include_hidden === 'true' || req.query.all === '1' || req.query.all === 'true';
    try {
        const sql = includeHidden
            ? "SELECT * FROM products ORDER BY id DESC"
            : `SELECT p.* FROM products p WHERE NOT EXISTS (
                SELECT 1 FROM categories c
                WHERE (LOWER(TRIM(c.name)) = LOWER(TRIM(p.category)) OR LOWER(TRIM(c.slug)) = LOWER(TRIM(p.category)))
                  AND c.is_visible = 0
               ) ORDER BY p.id DESC`;
        const { rows } = await db.query(sql);
        // Parse JSON fields
        const products = rows.map(p => ({
            ...p,
            images: p.images ? JSON.parse(p.images) : []
        }));
        res.json(products);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

app.post('/api/products', async (req, res) => {
    const { id, name, description, price, category, qty, image, images } = req.body;
    const finalId = id || 'P' + Date.now();
    const imagesStr = JSON.stringify(images || []);

    try {
        // Check if exists
        const checkRes = await db.query("SELECT id FROM products WHERE id = $1", [finalId]);

        if (checkRes.rows.length > 0) {
            // Update
            const sql = `UPDATE products SET name = $1, description = $2, price = $3, category = $4, qty = $5, image = $6, images = $7 WHERE id = $8`;
            await db.query(sql, [name, description, price, category, qty, image, imagesStr, finalId]);
            res.json({ message: 'Product updated', id: finalId });
        } else {
            // Insert
            const sql = `INSERT INTO products (id, name, description, price, category, qty, image, images) VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`;
            await db.query(sql, [finalId, name, description, price, category, qty, image, imagesStr]);
            res.json({ message: 'Product created', id: finalId });
        }
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

app.delete('/api/products/:id', async (req, res) => {
    try {
        await db.query("DELETE FROM products WHERE id = $1", [req.params.id]);
        res.json({ message: 'Product deleted' });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// ORDERS
app.get('/api/orders', async (req, res) => {
    try {
        const { rows } = await db.query("SELECT * FROM orders ORDER BY created_at DESC");
        const orders = rows.map(o => ({
            ...o,
            items: o.items ? JSON.parse(o.items) : []
        }));
        res.json(orders);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

app.post('/api/orders', processPayment, async (req, res) => {
    const { name, phone, address, city, zip, items, total } = req.body;
    const { status, transaction_id } = req.paymentDetails;
    const id = 'ORD-' + Date.now().toString().slice(-6);
    const itemsStr = JSON.stringify(items);

    const sql = `INSERT INTO orders (id, name, phone, address, city, zip, total, items, status, payment_status, transaction_id) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)`;

    try {
        await db.query(sql, [id, name, phone, address, city, zip, total, itemsStr, 'new', status, transaction_id]);

        // Update Stock (Iterate sequentially for simplicity)
        for (const item of items) {
            await db.query("UPDATE products SET qty = qty - $1 WHERE id = $2", [item.qty, item.id]);
        }

        res.json({ message: 'Order created successfully', id, transaction_id });
    } catch (err) {
        console.error('DB INSERT ERROR:', err);
        return res.status(500).json({ error: err.message });
    }
});

app.put('/api/orders/:id/status', async (req, res) => {
    const { status } = req.body;
    try {
        await db.query("UPDATE orders SET status = $1 WHERE id = $2", [status, req.params.id]);
        res.json({ message: 'Order status updated' });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

app.delete('/api/orders/:id', async (req, res) => {
    try {
        await db.query("DELETE FROM orders WHERE id = $1", [req.params.id]);
        res.json({ message: 'Order deleted' });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// AUTH
app.post('/api/auth/login', (req, res) => {
    const { password } = req.body;
    if (password === '1234') {
        res.json({ success: true, token: 'mock-jwt-token' });
    } else {
        res.status(401).json({ success: false, message: 'Invalid Credentials' });
    }
});

// Fallback for SPA
app.get(/.*/, (req, res) => {
    // If request accepts html and is not an API call
    if (req.accepts('html')) {
        res.sendFile(path.join(__dirname, 'dist', 'index.html'), (err) => {
            if (err) {
                // If dist doesn't exist yet (dev mode), try serving source files for some routes or 404
                // But typically in dev mode we use Vite. This is for PRODUCTION.
                res.status(404).send('Production build not found. Run "npm run build" first.');
            }
        });
    } else {
        res.status(404).send('Not Found');
    }
});

app.listen(PORT, () => {
    console.log(`Server running on http://localhost:${PORT}`);
});

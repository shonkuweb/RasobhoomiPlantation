import sqlite3 from 'sqlite3';
import { fileURLToPath } from 'url';
import { dirname, resolve } from 'path';
import fs from 'fs';

const __dirname = dirname(fileURLToPath(import.meta.url));
const rootDir = resolve(__dirname, '..');
const dbPaths = [
    resolve(rootDir, 'backend', 'ecommerce.db'),
    resolve(rootDir, 'ecommerce.db')
];

async function syncProducts() {
    let products = [];

    // Try reading cached file fetched from https://rasobhoomiplantation.com/api/products
    const cachedPath = '/Users/shonkuweb/.gemini/antigravity/brain/769a0132-2312-4157-8135-3ae4e206691d/.system_generated/steps/224/content.md';

    if (fs.existsSync(cachedPath)) {
        const fileContent = fs.readFileSync(cachedPath, 'utf-8');
        const jsonStart = fileContent.indexOf('[');
        if (jsonStart !== -1) {
            products = JSON.parse(fileContent.substring(jsonStart));
        }
    }

    if (!Array.isArray(products) || products.length === 0) {
        try {
            console.log('Attempting live fetch from https://rasobhoomiplantation.com/api/products...');
            const res = await fetch('https://rasobhoomiplantation.com/api/products');
            if (res.ok) {
                products = await res.json();
            }
        } catch (err) {
            console.error('Fetch failed:', err.message);
        }
    }

    if (!Array.isArray(products) || products.length === 0) {
        console.error('No products found to sync.');
        process.exit(1);
    }

    console.log(`Found ${products.length} products from deployed database.`);

    for (const dbPath of dbPaths) {
        if (!fs.existsSync(dbPath) && dbPath.endsWith('backend/ecommerce.db')) {
            console.log(`Database file at ${dbPath} does not exist. Creating...`);
        } else if (!fs.existsSync(dbPath)) {
            continue;
        }

        console.log(`Syncing products into SQLite database: ${dbPath}...`);

        await new Promise((resolvePromise, rejectPromise) => {
            const db = new sqlite3.Database(dbPath, (err) => {
                if (err) return rejectPromise(err);

                db.serialize(() => {
                    db.run(`CREATE TABLE IF NOT EXISTS products (
                        id TEXT PRIMARY KEY,
                        name TEXT NOT NULL,
                        description TEXT,
                        price REAL NOT NULL,
                        compare_price REAL DEFAULT 0,
                        category TEXT,
                        qty INTEGER DEFAULT 0,
                        image TEXT,
                        images TEXT,
                        created_at DATETIME DEFAULT CURRENT_TIMESTAMP
                    )`);

                    // Clear existing products
                    db.run(`DELETE FROM products`, (delErr) => {
                        if (delErr) console.error('Error clearing products table:', delErr);

                        const stmt = db.prepare(`INSERT OR REPLACE INTO products (
                            id, name, description, price, compare_price, category, qty, image, images, created_at
                        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`);

                        let count = 0;
                        products.forEach(p => {
                            const imagesStr = Array.isArray(p.images) ? JSON.stringify(p.images) : (typeof p.images === 'string' ? p.images : '[]');
                            stmt.run(
                                p.id,
                                p.name || '',
                                p.description || '',
                                typeof p.price === 'number' ? p.price : (parseFloat(p.price) || 0),
                                typeof p.compare_price === 'number' ? p.compare_price : (parseFloat(p.compare_price) || 0),
                                p.category || 'Others',
                                typeof p.qty === 'number' ? p.qty : (parseInt(p.qty, 10) || 0),
                                p.image || '',
                                imagesStr,
                                p.created_at || new Date().toISOString()
                            );
                            count++;
                        });

                        stmt.finalize(() => {
                            console.log(`Successfully synced ${count} products into ${dbPath}`);
                            db.close();
                            resolvePromise();
                        });
                    });
                });
            });
        });
    }

    console.log('All products successfully synced into local development databases!');
}

syncProducts().catch(err => {
    console.error('Sync failed:', err);
    process.exit(1);
});

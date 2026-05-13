import sqlite3 from 'sqlite3';
import { fileURLToPath } from 'url';
import { dirname, resolve } from 'path';
import fs from 'fs';
import { categories } from '../src/utils/categories.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const dbPath = resolve(__dirname, 'ecommerce.db');

const db = new sqlite3.Database(dbPath, (err) => {
    if (err) {
        console.error('Error opening database ' + dbPath + ': ' + err.message);
    } else {
        console.log('Connected to the SQLite database.');
        initDb();
    }
});

function initDb() {
    db.serialize(() => {
        // Products Table
        db.run(`CREATE TABLE IF NOT EXISTS products (
            id TEXT PRIMARY KEY,
            name TEXT NOT NULL,
            description TEXT,
            price REAL NOT NULL,
            category TEXT,
            qty INTEGER DEFAULT 0,
            image TEXT,
            images TEXT, -- JSON string
            created_at DATETIME DEFAULT CURRENT_TIMESTAMP
        )`, (err) => {
            if (err) console.error("Error creating products table:", err);
        });

        // Orders Table
        db.run(`CREATE TABLE IF NOT EXISTS orders (
            id TEXT PRIMARY KEY,
            name TEXT,
            phone TEXT,
            address TEXT,
            city TEXT,
            zip TEXT,
            total REAL,
            status TEXT DEFAULT 'new',
            items TEXT, -- JSON string
            payment_status TEXT DEFAULT 'pending',
            transaction_id TEXT,
            created_at DATETIME DEFAULT CURRENT_TIMESTAMP
        )`, (err) => {
            if (err) console.error("Error creating orders table:", err);
        });

        // Categories Table
        db.run(`CREATE TABLE IF NOT EXISTS categories (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            name TEXT NOT NULL,
            slug TEXT UNIQUE,
            image TEXT
        )`, (err) => {
            if (err) {
                console.error("Error creating categories table:", err);
            } else {
                // Seed if empty
                db.get("SELECT count(*) as count FROM categories", (err, row) => {
                    if (row && row.count === 0) {
                        console.log("Seeding categories...");
                        const insert = db.prepare("INSERT INTO categories (id, name, slug, image) VALUES (?, ?, ?, ?)");
                        categories.forEach(cat => {
                            insert.run(cat.id, cat.name, cat.slug, cat.image);
                        });
                        insert.finalize();
                        console.log("Categories seeded.");
                    }
                });
                // Rename Logan → Longon for existing databases (after table exists; runs every startup, no-op if already migrated)
                db.run(
                    `UPDATE categories SET name = 'Longon', slug = 'longon', image = 'https://placehold.co/150?text=Longon' WHERE slug = 'logan'`,
                    (mErr) => {
                        if (mErr) console.error('Category migration (logan→longon):', mErr);
                    }
                );
                db.run(`UPDATE products SET category = 'Longon' WHERE category = 'Logan'`, (mErr) => {
                    if (mErr) console.error('Product category migration (Logan→Longon):', mErr);
                });
                const categoryImageBySlug = [
                    ['indian-mangoes', '/assets/indianmango.png'],
                    ['foreigner-mango', '/assets/foreignmango.png'],
                    ['malta-orange', '/assets/maltaorange.png'],
                    ['guava', '/assets/guava.png'],
                    ['jackfruit', '/assets/jackfruit.png'],
                    ['jamun', '/assets/jamun.png'],
                    ['water-apple', '/assets/watterapple.png'],
                    ['chiku', '/assets/chiku.png'],
                    ['lemon', '/assets/lemon.png'],
                    ['amloki', '/assets/amloki.png'],
                    ['litchi', '/assets/litchi.png'],
                    ['fruit-tree', '/assets/fruittree.png'],
                    ['others', '/assets/others.png'],
                    ['drum-plants', '/assets/drumplants.png'],
                ];
                categoryImageBySlug.forEach(([slug, image]) => {
                    db.run(
                        'UPDATE categories SET image = ? WHERE slug = ?',
                        [image, slug],
                        (uErr) => {
                            if (uErr) console.error('Category image migration:', slug, uErr);
                        }
                    );
                });
            }
        });

        // Admin Settings Table (for persistent password)
        db.run(`CREATE TABLE IF NOT EXISTS admin_settings (
            key TEXT PRIMARY KEY,
            value TEXT NOT NULL
        )`, (err) => {
            if (err) console.error("Error creating admin_settings table:", err);
        });

        console.log('Database tables initialized.');
    });
}

export default db;

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
            compare_price REAL DEFAULT 0,
            category TEXT,
            qty INTEGER DEFAULT 0,
            image TEXT,
            images TEXT, -- JSON string
            created_at DATETIME DEFAULT CURRENT_TIMESTAMP
        )`, (err) => {
            if (err) console.error("Error creating products table:", err);
            // Migration for existing sqlite databases
            db.run(`ALTER TABLE products ADD COLUMN compare_price REAL DEFAULT 0`, (mErr) => {
                // Column might already exist, safe to ignore error
            });
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
            delivery_charge REAL DEFAULT 0,
            discount_amount REAL DEFAULT 0,
            status TEXT DEFAULT 'new',
            items TEXT, -- JSON string
            payment_status TEXT DEFAULT 'pending',
            transaction_id TEXT,
            tracking_id TEXT,
            courier_name TEXT DEFAULT 'dtdc',
            recovery_phase INTEGER DEFAULT 0,
            last_recovery_sent_at DATETIME,
            created_at DATETIME DEFAULT CURRENT_TIMESTAMP
        )`, (err) => {
            if (err) console.error("Error creating orders table:", err);
        });

        db.run(`ALTER TABLE orders ADD COLUMN tracking_id TEXT`, (mErr) => {});
        db.run(`ALTER TABLE orders ADD COLUMN courier_name TEXT DEFAULT 'dtdc'`, (mErr) => {});
        db.run(`ALTER TABLE orders ADD COLUMN delivery_charge REAL DEFAULT 0`, (mErr) => {});
        db.run(`ALTER TABLE orders ADD COLUMN discount_amount REAL DEFAULT 0`, (mErr) => {});
        db.run(`ALTER TABLE orders ADD COLUMN lang TEXT DEFAULT 'en'`, (mErr) => {});
        db.run(`ALTER TABLE orders ADD COLUMN recovery_phase INTEGER DEFAULT 0`, (mErr) => {});
        db.run(`ALTER TABLE orders ADD COLUMN last_recovery_sent_at DATETIME`, (mErr) => {});

        // Categories Table
        db.run(`CREATE TABLE IF NOT EXISTS categories (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            name TEXT NOT NULL,
            slug TEXT UNIQUE,
            image TEXT,
            is_visible INTEGER DEFAULT 1
        )`, (err) => {
            if (err) {
                console.error("Error creating categories table:", err);
            } else {
                // Migration for existing sqlite databases to add is_visible column
                db.run(`ALTER TABLE categories ADD COLUMN is_visible INTEGER DEFAULT 1`, (mErr) => {
                    // Column might already exist, safe to ignore error
                });
                db.run(`UPDATE categories SET is_visible = 1 WHERE is_visible IS NULL`, (mErr) => {});

                // Seed if empty
                db.get("SELECT count(*) as count FROM categories", (err, row) => {
                    if (row && row.count === 0) {
                        console.log("Seeding categories...");
                        const insert = db.prepare("INSERT INTO categories (id, name, slug, image, is_visible) VALUES (?, ?, ?, ?, 1)");
                        categories.forEach(cat => {
                            insert.run(cat.id, cat.name, cat.slug, cat.image);
                        });
                        insert.finalize();
                        console.log("Categories seeded.");
                    }
                });
                // Rename Logan → Longon for existing databases (after table exists; runs every startup, no-op if already migrated)
                db.run(
                    `UPDATE categories SET name = 'Longon', slug = 'longon', image = '/assets/longan.png' WHERE slug = 'logan'`,
                    (mErr) => {
                        if (mErr) console.error('Category migration (logan→longon):', mErr);
                    }
                );
                db.run(`UPDATE products SET category = 'Longon' WHERE category = 'Logan'`, (mErr) => {
                    if (mErr) console.error('Product category migration (Logan→Longon):', mErr);
                });
                db.run(
                    `UPDATE categories SET name = 'Anar', slug = 'anar', image = '/assets/pomegranant.png' WHERE slug = 'currant'`,
                    (mErr) => {
                        if (mErr) console.error('Category migration (currant→anar):', mErr);
                    }
                );
                db.run(`UPDATE products SET category = 'Anar' WHERE category = 'Currant'`, (mErr) => {
                    if (mErr) console.error('Product category migration (Currant→Anar):', mErr);
                });
                const categoryImageBySlug = [
                    ['indian-mangoes', '/assets/indianmango.png'],
                    ['foreigner-mango', '/assets/foreignmango.png'],
                    ['malta-orange', '/assets/maltaorange.png'],
                    ['orange', '/assets/orange.png'],
                    ['longon', '/assets/longan.png'],
                    ['guava', '/assets/guava.png'],
                    ['jackfruit', '/assets/jackfruit.png'],
                    ['jamun', '/assets/jamun.png'],
                    ['water-apple', '/assets/watterapple.png'],
                    ['chiku', '/assets/chiku.png'],
                    ['coconut', '/assets/coconut.png'],
                    ['betel-nut', '/assets/betelnut.png'],
                    ['lemon', '/assets/lemon.png'],
                    ['amloki', '/assets/amloki.png'],
                    ['litchi', '/assets/litchi.png'],
                    ['grape', '/assets/grapes.png'],
                    ['anar', '/assets/pomegranant.png'],
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

                // Ensure all standard categories are present
                const insertMissing = db.prepare("INSERT OR IGNORE INTO categories (id, name, slug, image, is_visible) VALUES (?, ?, ?, ?, 1)");
                categories.forEach(cat => {
                    insertMissing.run(cat.id, cat.name, cat.slug, cat.image);
                });
                insertMissing.finalize();

                // Move large / drum tub plants from Others to Drum Plants
                const drumPlantIds = [
                    'P1772115032771', 'P1772114745041', 'P1772114346899', 'P1772113250744', 'P1772113077154',
                    'P1772112934648', 'P1772112723786', 'P1772112590001', 'P1772112451449', 'P1772112303168',
                    'P1772112195993', 'P1772112102363', 'P1772111806321', 'P1772111725547', 'P1772111543192',
                    'P1772111424578', 'P1772111353870', 'P1772110763839', 'P1772110659599', 'P1772110587356',
                    'P1772110447253', 'P1772110286037', 'P1772110149214', 'P1772109416972', 'P1772109378964',
                    'P1772109330053', 'P1772109281697', 'P1772108155823', 'P1772108086899', 'P1772107934114',
                    'P1772107843129', 'P1772107777508', 'P1772107335126', 'P1772107245242', 'P1772107112986',
                    'P1772106819310', 'P1772106781262', 'P1772106733694', 'P1772106660200', 'P1772106578277',
                    'P1772106538961', 'P1772106498213', 'P1772106243309', 'P1772106073390', 'P1772106009381',
                    'P1772105915126', 'P1772105485687', 'P1772105354050', 'P1772105278483', 'P1772105199566',
                    'P1772105152809', 'P1772105019727', 'P1772104836587', 'P1772104700321', 'P1772104546340',
                    'P1772101566764', 'P1772101374800', 'P1772101232179', 'P1772100943014',
                    'P1779174373700', 'P1779174340268', 'P1779174022081', 'P1779173869379', 'P1779173526790',
                    'P1779172225240', 'P1779172186616', 'P1779172132477', 'P1779170778469', 'P1779170625443'
                ];
                const placeholders = drumPlantIds.map(() => '?').join(',');
                db.run(
                    \`UPDATE products SET category = 'Drum Plants' WHERE id IN (\${placeholders})\`,
                    drumPlantIds,
                    (pErr) => {
                        if (pErr) console.error('Error migrating products to Drum Plants:', pErr);
                    }
                );
            }
        });

        // Admin Settings Table (for persistent password)
        db.run(`CREATE TABLE IF NOT EXISTS admin_settings (
            key TEXT PRIMARY KEY,
            value TEXT NOT NULL
        )`, (err) => {
            if (err) console.error("Error creating admin_settings table:", err);
        });

        // Discounts Table
        db.run(`CREATE TABLE IF NOT EXISTS discounts (
            id TEXT PRIMARY KEY,
            name TEXT NOT NULL,
            category TEXT DEFAULT 'ALL',
            amount1 REAL DEFAULT 0,
            operator TEXT DEFAULT '>=',
            amount2 REAL DEFAULT 0,
            discount_type TEXT NOT NULL,
            discount_value REAL DEFAULT 0,
            is_enabled INTEGER DEFAULT 1,
            created_at DATETIME DEFAULT CURRENT_TIMESTAMP
        )`, (err) => {
            if (err) console.error("Error creating discounts table:", err);
        });

        // Migration: Add category column to discounts table if not exists
        db.run(`ALTER TABLE discounts ADD COLUMN category TEXT DEFAULT 'ALL'`, (err) => {
            // Ignore error if column already exists
        });

        // Product Translations Table (Groq AI Cache)
        db.run(`CREATE TABLE IF NOT EXISTS product_translations (
            product_id TEXT,
            lang TEXT,
            name TEXT,
            description TEXT,
            category TEXT,
            PRIMARY KEY (product_id, lang)
        )`, (err) => {
            if (err) console.error("Error creating product_translations table:", err);
        });

        // Tutorials Table
        db.run(`CREATE TABLE IF NOT EXISTS tutorials (
            id TEXT PRIMARY KEY,
            title TEXT NOT NULL,
            video_url TEXT NOT NULL,
            description TEXT,
            sort_order INTEGER DEFAULT 0,
            created_at DATETIME DEFAULT CURRENT_TIMESTAMP
        )`, (err) => {
            if (err) console.error("Error creating tutorials table:", err);
        });

        console.log('Database tables initialized.');
    });
}

export default db;

import sqlite3 from 'sqlite3';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const dbPath = path.join(__dirname, 'ecommerce.db');

const db = new sqlite3.Database(dbPath, (err) => {
    if (err) {
        console.error('Connection Error:', err.message);
        process.exit(1);
    }
});

db.all("SELECT * FROM products", [], (err, rows) => {
    if (err) {
        console.error('Fetch Error:', err.message);
        process.exit(1);
    }

    console.log(`Fetched ${rows.length} rows.`);

    rows.forEach(p => {
        try {
            const images = (p.images && p.images !== 'null') ? JSON.parse(p.images) : [];
            // console.log(`Product ${p.id} OK. Images:`, images.length);
        } catch (e) {
            console.error(`ERROR PARSING PRODUCT ${p.id}:`, e.message);
            console.error('Bad Content:', p.images);
        }
    });
});

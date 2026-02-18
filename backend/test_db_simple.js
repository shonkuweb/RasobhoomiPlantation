import sqlite3 from 'sqlite3';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const dbPath = path.join(__dirname, 'ecommerce.db');

console.log('Testing DB connection to:', dbPath);

const db = new sqlite3.Database(dbPath, (err) => {
    if (err) {
        console.error('Connection Error:', err.message);
    } else {
        console.log('Connected to the SQLite database.');
        db.all("SELECT name FROM sqlite_master WHERE type='table'", [], (err, rows) => {
            if (err) {
                console.error('Query Error:', err.message);
            } else {
                console.log('Tables:', rows);
            }
        });
    }
});

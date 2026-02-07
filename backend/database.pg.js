import pkg from 'pg';
const { Pool } = pkg;
import dotenv from 'dotenv';
// Hardcoded categories to avoid dependency on 'src' in backend deployment
const categories = [
    { id: 1, name: 'Indian Mangoes', slug: 'indian-mangoes', image: 'https://placehold.co/150?text=Indian+Mangoes' },
    { id: 2, name: 'Foreigner Mango', slug: 'foreigner-mango', image: 'https://placehold.co/150?text=Foreigner+Mango' },
    { id: 3, name: 'Malta Orange', slug: 'malta-orange', image: 'https://placehold.co/150?text=Malta+Orange' },
    { id: 4, name: 'Orange', slug: 'orange', image: 'https://placehold.co/150?text=Orange' },
    { id: 5, name: 'Guava', slug: 'guava', image: 'https://placehold.co/150?text=Guava' },
    { id: 6, name: 'Jackfruit', slug: 'jackfruit', image: 'https://placehold.co/150?text=Jackfruit' },
    { id: 7, name: 'Jamun', slug: 'jamun', image: 'https://placehold.co/150?text=Jamun' },
    { id: 8, name: 'Water Apple', slug: 'water-apple', image: 'https://placehold.co/150?text=Water+Apple' },
    { id: 9, name: 'Chiku', slug: 'chiku', image: 'https://placehold.co/150?text=Chiku' },
    { id: 10, name: 'Coconut', slug: 'coconut', image: 'https://placehold.co/150?text=Coconut' },
    { id: 11, name: 'Betel Nut', slug: 'betel-nut', image: 'https://placehold.co/150?text=Betel+Nut' },
    { id: 12, name: 'Lemon', slug: 'lemon', image: 'https://placehold.co/150?text=Lemon' },
    { id: 13, name: 'Amloki', slug: 'amloki', image: 'https://placehold.co/150?text=Amloki' },
    { id: 14, name: 'Logan', slug: 'logan', image: 'https://placehold.co/150?text=Logan' },
    { id: 15, name: 'Litchi', slug: 'litchi', image: 'https://placehold.co/150?text=Litchi' },
    { id: 16, name: 'Currant', slug: 'currant', image: 'https://placehold.co/150?text=Currant' },
    { id: 17, name: 'Grape', slug: 'grape', image: 'https://placehold.co/150?text=Grape' },
    { id: 18, name: 'Fruit Tree', slug: 'fruit-tree', image: 'https://placehold.co/150?text=Fruit+Tree' },
    { id: 19, name: 'Others', slug: 'others', image: 'https://placehold.co/150?text=Others' },
];

dotenv.config();

const isProduction = process.env.NODE_ENV === 'production';
const connectionString = process.env.DATABASE_URL;

let pool;

if (connectionString) {
    pool = new Pool({
        connectionString,
        ssl: false
    });
    console.log('Connected to PostgreSQL database.');
    initDb();
} else {
    console.error('DATABASE_URL not set.');
}

// Wrapper to mimic SQLite interface
const db = {
    query: (text, params) => pool.query(text, params),

    // SQLite: db.run(sql, [params], callback)
    // callback(err) - distinct from result
    run: function (sql, params, callback) {
        if (!pool) return callback(new Error('Database not connected'));

        // Convert ? to $1, $2, etc.
        let i = 1;
        const pgSql = sql.replace(/\?/g, () => `$${i++}`);

        pool.query(pgSql, params)
            .then(res => {
                // Mimic 'this' context of sqlite run (lastID, changes) if possible, 
                // but commonly we just check err. 
                // PG doesn't return lastID easily without RETURNING clause.
                // We might need to adjust queries in server.js to use RETURNING id.
                // For now, call callback with null.
                callback.call({ changes: res.rowCount }, null);
            })
            .catch(err => {
                console.error("DB Error:", err);
                callback(err);
            });
    },

    // SQLite: db.all(sql, [params], callback)
    all: function (sql, params, callback) {
        if (!pool) return callback(new Error('Database not connected'));

        let i = 1;
        const pgSql = sql.replace(/\?/g, () => `$${i++}`);

        pool.query(pgSql, params)
            .then(res => callback(null, res.rows))
            .catch(err => callback(err));
    },

    // SQLite: db.get(sql, [params], callback)
    get: function (sql, params, callback) {
        if (!pool) return callback(new Error('Database not connected'));

        let i = 1;
        const pgSql = sql.replace(/\?/g, () => `$${i++}`);

        pool.query(pgSql, params)
            .then(res => callback(null, res.rows[0]))
            .catch(err => callback(err));
    }
};

function initDb() {
    // PG specific compatible schema
    // Note: TEXT PRIMARY KEY is fine.
    // JSON in sqlite is TEXT, in PG it can be JSONB, but TEXT works for compatibility.
    // DATETIME DEFAULT CURRENT_TIMESTAMP works in both usually, but PG prefers TIMESTAMP.

    const queries = [
        `CREATE TABLE IF NOT EXISTS products (
            id TEXT PRIMARY KEY,
            name TEXT NOT NULL,
            description TEXT,
            price REAL NOT NULL,
            category TEXT,
            qty INTEGER DEFAULT 0,
            image TEXT,
            images TEXT, 
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        )`,
        `CREATE TABLE IF NOT EXISTS orders (
            id TEXT PRIMARY KEY,
            name TEXT,
            phone TEXT,
            address TEXT,
            city TEXT,
            zip TEXT,
            total REAL,
            status TEXT DEFAULT 'new',
            items TEXT,
            payment_status TEXT DEFAULT 'pending',
            transaction_id TEXT,
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        )`,
        `CREATE TABLE IF NOT EXISTS categories (
            id SERIAL PRIMARY KEY,
            name TEXT NOT NULL,
            slug TEXT UNIQUE,
            image TEXT
        )`
    ];

    queries.forEach(q => {
        pool.query(q)
            .then(() => {
                // Check if categories need seeding
                if (q.includes('CREATE TABLE IF NOT EXISTS categories')) {
                    pool.query('SELECT count(*) as count FROM categories')
                        .then(res => {
                            if (res.rows[0].count === '0') {
                                console.log("Seeding categories (Postgres)...");
                                const insertQuery = "INSERT INTO categories (name, slug, image) VALUES ($1, $2, $3)";
                                categories.forEach(cat => {
                                    // Note: we let Postgres handle the ID with SERIAL
                                    pool.query(insertQuery, [cat.name, cat.slug, cat.image])
                                        .catch(e => console.error("Seed error:", e));
                                });
                                console.log("Categories seeded (Postgres).");
                            }
                        })
                        .catch(err => console.error("Error checking categories count:", err));
                }
            })
            .catch(err => console.error('Table creation error:', err));
    });
}

export default db;

import pkg from 'pg';
const { Pool } = pkg;
import dotenv from 'dotenv';
// Hardcoded categories to avoid dependency on 'src' in backend deployment
const categories = [
    { id: 1, name: 'Indian Mangoes', slug: 'indian-mangoes', image: '/assets/indianmango.png' },
    { id: 2, name: 'Foreigner Mango', slug: 'foreigner-mango', image: '/assets/foreignmango.png' },
    { id: 3, name: 'Malta Orange', slug: 'malta-orange', image: '/assets/maltaorange.png' },
    { id: 4, name: 'Orange', slug: 'orange', image: 'https://placehold.co/150?text=Orange' },
    { id: 5, name: 'Guava', slug: 'guava', image: '/assets/guava.png' },
    { id: 6, name: 'Jackfruit', slug: 'jackfruit', image: '/assets/jackfruit.png' },
    { id: 7, name: 'Jamun', slug: 'jamun', image: '/assets/jamun.png' },
    { id: 8, name: 'Water Apple', slug: 'water-apple', image: '/assets/watterapple.png' },
    { id: 9, name: 'Chiku', slug: 'chiku', image: '/assets/chiku.png' },
    { id: 10, name: 'Coconut', slug: 'coconut', image: 'https://placehold.co/150?text=Coconut' },
    { id: 11, name: 'Betel Nut', slug: 'betel-nut', image: 'https://placehold.co/150?text=Betel+Nut' },
    { id: 12, name: 'Lemon', slug: 'lemon', image: '/assets/lemon.png' },
    { id: 13, name: 'Amloki', slug: 'amloki', image: '/assets/amloki.png' },
    { id: 14, name: 'Longon', slug: 'longon', image: 'https://placehold.co/150?text=Longon' },
    { id: 15, name: 'Litchi', slug: 'litchi', image: '/assets/litchi.png' },
    { id: 16, name: 'Currant', slug: 'currant', image: 'https://placehold.co/150?text=Currant' },
    { id: 17, name: 'Grape', slug: 'grape', image: 'https://placehold.co/150?text=Grape' },
    { id: 18, name: 'Fruit Tree', slug: 'fruit-tree', image: '/assets/fruittree.png' },
    { id: 19, name: 'Others', slug: 'others', image: '/assets/others.png' },
    { id: 20, name: 'Drum Plants', slug: 'drum-plants', image: '/assets/drumplants.png' },
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
                // Ensure res exists before accessing rowCount
                const changes = (res && res.rowCount) ? res.rowCount : 0;
                callback.call({ changes: changes }, null);
            })
            .catch(err => {
                console.error("DB Error in run:", err);
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

    const schemaQueries = [
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
        )`,
        `CREATE TABLE IF NOT EXISTS admin_settings (
            key TEXT PRIMARY KEY,
            value TEXT NOT NULL
        )`,
        `CREATE INDEX IF NOT EXISTS idx_products_created_at_desc ON products (created_at DESC)`,
        `CREATE INDEX IF NOT EXISTS idx_orders_created_at_desc ON orders (created_at DESC)`
    ];

    const migrateQueries = [
        `UPDATE categories SET name = 'Longon', slug = 'longon', image = 'https://placehold.co/150?text=Longon' WHERE slug = 'logan'`,
        `UPDATE products SET category = 'Longon' WHERE category = 'Logan'`,
        `UPDATE categories SET image = '/assets/indianmango.png' WHERE slug = 'indian-mangoes'`,
        `UPDATE categories SET image = '/assets/foreignmango.png' WHERE slug = 'foreigner-mango'`,
        `UPDATE categories SET image = '/assets/maltaorange.png' WHERE slug = 'malta-orange'`,
        `UPDATE categories SET image = '/assets/guava.png' WHERE slug = 'guava'`,
        `UPDATE categories SET image = '/assets/jackfruit.png' WHERE slug = 'jackfruit'`,
        `UPDATE categories SET image = '/assets/jamun.png' WHERE slug = 'jamun'`,
        `UPDATE categories SET image = '/assets/watterapple.png' WHERE slug = 'water-apple'`,
        `UPDATE categories SET image = '/assets/chiku.png' WHERE slug = 'chiku'`,
        `UPDATE categories SET image = '/assets/lemon.png' WHERE slug = 'lemon'`,
        `UPDATE categories SET image = '/assets/amloki.png' WHERE slug = 'amloki'`,
        `UPDATE categories SET image = '/assets/litchi.png' WHERE slug = 'litchi'`,
        `UPDATE categories SET image = '/assets/fruittree.png' WHERE slug = 'fruit-tree'`,
        `UPDATE categories SET image = '/assets/others.png' WHERE slug = 'others'`,
        `UPDATE categories SET image = '/assets/drumplants.png' WHERE slug = 'drum-plants'`
    ];

    Promise.all(schemaQueries.map((q) => pool.query(q)))
        .then(() => Promise.all(migrateQueries.map((q) => pool.query(q))))
        .then(() => {
            console.log("Ensuring all standard categories exist (Postgres)...");
            const insertQuery = "INSERT INTO categories (name, slug, image) VALUES ($1, $2, $3) ON CONFLICT (slug) DO NOTHING";
            categories.forEach((cat) => {
                pool.query(insertQuery, [cat.name, cat.slug, cat.image])
                    .catch((e) => console.error("Category Seed error:", e));
            });
        })
        .catch((err) => console.error('PostgreSQL init error:', err));
}

export default db;

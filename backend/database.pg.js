import pkg from 'pg';
const { Pool } = pkg;
import dotenv from 'dotenv';
// Hardcoded categories to avoid dependency on 'src' in backend deployment
const categories = [
    { id: 1, name: 'Indian Mangoes', slug: 'indian-mangoes', image: '/assets/indianmango.png' },
    { id: 2, name: 'Foreigner Mango', slug: 'foreigner-mango', image: '/assets/foreignmango.png' },
    { id: 3, name: 'Malta Orange', slug: 'malta-orange', image: '/assets/maltaorange.png' },
    { id: 4, name: 'Orange', slug: 'orange', image: '/assets/orange.png' },
    { id: 5, name: 'Guava', slug: 'guava', image: '/assets/guava.png' },
    { id: 6, name: 'Jackfruit', slug: 'jackfruit', image: '/assets/jackfruit.png' },
    { id: 7, name: 'Jamun', slug: 'jamun', image: '/assets/jamun.png' },
    { id: 8, name: 'Water Apple', slug: 'water-apple', image: '/assets/watterapple.png' },
    { id: 9, name: 'Chiku', slug: 'chiku', image: '/assets/chiku.png' },
    { id: 10, name: 'Coconut', slug: 'coconut', image: '/assets/coconut.png' },
    { id: 11, name: 'Betel Nut', slug: 'betel-nut', image: '/assets/betelnut.png' },
    { id: 12, name: 'Lemon', slug: 'lemon', image: '/assets/lemon.png' },
    { id: 13, name: 'Amloki', slug: 'amloki', image: '/assets/amloki.png' },
    { id: 14, name: 'Longon', slug: 'longon', image: '/assets/longan.png' },
    { id: 15, name: 'Litchi', slug: 'litchi', image: '/assets/litchi.png' },
    { id: 16, name: 'Anar', slug: 'anar', image: '/assets/pomegranant.png' },
    { id: 17, name: 'Grape', slug: 'grape', image: '/assets/grapes.png' },
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
            compare_price REAL DEFAULT 0,
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
            delivery_charge REAL DEFAULT 0,
            discount_amount REAL DEFAULT 0,
            status TEXT DEFAULT 'new',
            items TEXT,
            payment_status TEXT DEFAULT 'pending',
            transaction_id TEXT,
            tracking_id TEXT,
            courier_name TEXT DEFAULT 'dtdc',
            is_deleted BOOLEAN DEFAULT FALSE,
            recovery_phase INTEGER DEFAULT 0,
            last_recovery_sent_at TIMESTAMP,
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        )`,
        `ALTER TABLE orders ADD COLUMN IF NOT EXISTS tracking_id TEXT`,
        `ALTER TABLE orders ADD COLUMN IF NOT EXISTS courier_name TEXT DEFAULT 'dtdc'`,
        `ALTER TABLE orders ADD COLUMN IF NOT EXISTS delivery_charge REAL DEFAULT 0`,
        `ALTER TABLE orders ADD COLUMN IF NOT EXISTS discount_amount REAL DEFAULT 0`,
        `ALTER TABLE orders ADD COLUMN IF NOT EXISTS lang TEXT DEFAULT 'en'`,
        `ALTER TABLE orders ADD COLUMN IF NOT EXISTS recovery_phase INTEGER DEFAULT 0`,
        `ALTER TABLE orders ADD COLUMN IF NOT EXISTS last_recovery_sent_at TIMESTAMP`,
        `CREATE TABLE IF NOT EXISTS categories (
            id SERIAL PRIMARY KEY,
            name TEXT NOT NULL,
            slug TEXT UNIQUE,
            image TEXT,
            is_visible INTEGER DEFAULT 1
        )`,
        `ALTER TABLE categories ADD COLUMN IF NOT EXISTS is_visible INTEGER DEFAULT 1`,
        `CREATE TABLE IF NOT EXISTS admin_settings (
            key TEXT PRIMARY KEY,
            value TEXT NOT NULL
        )`,
        `CREATE TABLE IF NOT EXISTS discounts (
            id TEXT PRIMARY KEY,
            name TEXT NOT NULL,
            category TEXT DEFAULT 'ALL',
            amount1 REAL DEFAULT 0,
            operator TEXT DEFAULT '>=',
            amount2 REAL DEFAULT 0,
            discount_type TEXT NOT NULL,
            discount_value REAL DEFAULT 0,
            is_enabled BOOLEAN DEFAULT TRUE,
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        )`,
        `ALTER TABLE discounts ADD COLUMN IF NOT EXISTS category TEXT DEFAULT 'ALL'`,
        `CREATE TABLE IF NOT EXISTS product_translations (
            product_id TEXT,
            lang TEXT,
            name TEXT,
            description TEXT,
            category TEXT,
            PRIMARY KEY (product_id, lang)
        )`,
        `CREATE TABLE IF NOT EXISTS tutorials (
            id TEXT PRIMARY KEY,
            title TEXT NOT NULL,
            video_url TEXT NOT NULL,
            description TEXT,
            sort_order INTEGER DEFAULT 0,
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        )`,
        `CREATE INDEX IF NOT EXISTS idx_products_created_at_desc ON products (created_at DESC)`,
        `CREATE INDEX IF NOT EXISTS idx_orders_created_at_desc ON orders (created_at DESC)`
    ];

    const migrateQueries = [
        `UPDATE categories SET name = 'Longon', slug = 'longon', image = '/assets/longan.png' WHERE slug = 'logan'`,
        `UPDATE products SET category = 'Longon' WHERE category = 'Logan'`,
        `UPDATE categories SET image = '/assets/orange.png' WHERE slug = 'orange'`,
        `UPDATE categories SET image = '/assets/longan.png' WHERE slug = 'longon'`,
        `UPDATE categories SET image = '/assets/indianmango.png' WHERE slug = 'indian-mangoes'`,
        `UPDATE categories SET image = '/assets/foreignmango.png' WHERE slug = 'foreigner-mango'`,
        `UPDATE categories SET image = '/assets/maltaorange.png' WHERE slug = 'malta-orange'`,
        `UPDATE categories SET image = '/assets/guava.png' WHERE slug = 'guava'`,
        `UPDATE categories SET image = '/assets/jackfruit.png' WHERE slug = 'jackfruit'`,
        `UPDATE categories SET image = '/assets/jamun.png' WHERE slug = 'jamun'`,
        `UPDATE categories SET image = '/assets/watterapple.png' WHERE slug = 'water-apple'`,
        `UPDATE categories SET image = '/assets/chiku.png' WHERE slug = 'chiku'`,
        `UPDATE categories SET image = '/assets/coconut.png' WHERE slug = 'coconut'`,
        `UPDATE categories SET image = '/assets/betelnut.png' WHERE slug = 'betel-nut'`,
        `UPDATE categories SET image = '/assets/lemon.png' WHERE slug = 'lemon'`,
        `UPDATE categories SET image = '/assets/amloki.png' WHERE slug = 'amloki'`,
        `UPDATE categories SET image = '/assets/litchi.png' WHERE slug = 'litchi'`,
        `UPDATE categories SET image = '/assets/grapes.png' WHERE slug = 'grape'`,
        `UPDATE categories SET name = 'Anar', slug = 'anar', image = '/assets/pomegranant.png' WHERE slug = 'currant'`,
        `UPDATE products SET category = 'Anar' WHERE category = 'Currant'`,
        `UPDATE categories SET image = '/assets/pomegranant.png' WHERE slug = 'anar'`,
        `UPDATE categories SET image = '/assets/fruittree.png' WHERE slug = 'fruit-tree'`,
        `UPDATE categories SET image = '/assets/others.png' WHERE slug = 'others'`,
        `UPDATE categories SET image = '/assets/drumplants.png' WHERE slug = 'drum-plants'`,
        `UPDATE categories SET is_visible = 1 WHERE is_visible IS NULL`,
        `UPDATE products SET category = 'Drum Plants' WHERE id IN ('P1772115032771', 'P1772114745041', 'P1772114346899', 'P1772113250744', 'P1772113077154', 'P1772112934648', 'P1772112723786', 'P1772112590001', 'P1772112451449', 'P1772112303168', 'P1772112195993', 'P1772112102363', 'P1772111806321', 'P1772111725547', 'P1772111543192', 'P1772111424578', 'P1772111353870', 'P1772110763839', 'P1772110659599', 'P1772110587356', 'P1772110447253', 'P1772110286037', 'P1772110149214', 'P1772109416972', 'P1772109378964', 'P1772109330053', 'P1772109281697', 'P1772108155823', 'P1772108086899', 'P1772107934114', 'P1772107843129', 'P1772107777508', 'P1772107335126', 'P1772107245242', 'P1772107112986', 'P1772106819310', 'P1772106781262', 'P1772106733694', 'P1772106660200', 'P1772106578277', 'P1772106538961', 'P1772106498213', 'P1772106243309', 'P1772106073390', 'P1772106009381', 'P1772105915126', 'P1772105485687', 'P1772105354050', 'P1772105278483', 'P1772105199566', 'P1772105152809', 'P1772105019727', 'P1772104836587', 'P1772104700321', 'P1772104546340', 'P1772101566764', 'P1772101374800', 'P1772101232179', 'P1772100943014')`,
        `ALTER TABLE orders ADD COLUMN IF NOT EXISTS is_deleted BOOLEAN DEFAULT FALSE`
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

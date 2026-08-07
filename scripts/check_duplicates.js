import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: path.join(__dirname, '../.env') });

const isPostgres = process.env.DB_TYPE === 'postgres';
const dbModulePath = isPostgres ? '../backend/database.pg.js' : '../backend/database.js';

console.log(`[INFO] Connecting to DB (type: ${process.env.DB_TYPE || 'sqlite'})...`);

import(dbModulePath).then(({ default: db }) => {
    setTimeout(() => {
        const query = `
            SELECT LOWER(TRIM(name)) AS clean_name, COUNT(*) AS count 
            FROM products 
            GROUP BY LOWER(TRIM(name)) 
            HAVING COUNT(*) > 1 
            ORDER BY count DESC, clean_name ASC
        `;

        db.all(query, [], (err, duplicateGroups) => {
            if (err) {
                console.error('[ERROR] Failed to query database:', err.message);
                process.exit(1);
            }

            if (!duplicateGroups || duplicateGroups.length === 0) {
                console.log('\n✅ NO EXACT DUPLICATE PRODUCT NAMES FOUND IN DATABASE!');
                console.log('All product names in the database are unique.\n');
                process.exit(0);
            }

            // Fetch full details of products in duplicate groups
            db.all('SELECT id, name, category, price, created_at FROM products ORDER BY name ASC, id ASC', [], (err2, allProducts) => {
                if (err2) {
                    console.error('[ERROR] Failed to fetch product details:', err2.message);
                    process.exit(1);
                }

                const nameMap = new Map();
                (allProducts || []).forEach(p => {
                    const key = (p.name || '').trim().toLowerCase();
                    if (!nameMap.has(key)) nameMap.set(key, []);
                    nameMap.get(key).push(p);
                });

                console.log('\n================================================================');
                console.log(`🔍 EXACT DUPLICATE PRODUCT NAMES REPORT (${duplicateGroups.length} Groups Found)`);
                console.log('================================================================\n');

                let totalExtraDuplicates = 0;

                duplicateGroups.forEach((group, index) => {
                    const items = nameMap.get(group.clean_name) || [];
                    const extraCount = items.length - 1;
                    totalExtraDuplicates += extraCount;

                    const displayName = items[0] ? items[0].name.trim() : group.clean_name;
                    console.log(`${index + 1}. Product: "${displayName}" (${items.length} copies present)`);
                    items.forEach((item, itemIdx) => {
                        const status = itemIdx === 0 ? ' [PRIMARY/KEEP]' : ' [DUPLICATE]';
                        console.log(`   - ID: ${item.id} | Category: ${item.category || 'N/A'} | Price: ₹${item.price || 0}${status}`);
                    });
                    console.log('');
                });

                console.log('================================================================');
                console.log(`📊 SUMMARY:`);
                console.log(`- Duplicate Name Groups : ${duplicateGroups.length}`);
                console.log(`- Extra Redundant Copies: ${totalExtraDuplicates}`);
                console.log('================================================================\n');

                process.exit(0);
            });
        });
    }, 1000);
}).catch(e => {
    console.error('[ERROR] Could not load database module:', e);
    process.exit(1);
});

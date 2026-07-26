import { uploadBase64ToR2 } from '../backend/r2_helper.js';
import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';

dotenv.config({ path: path.join(path.dirname(fileURLToPath(import.meta.url)), '../.env') });

// Make sure we have credentials
if (!process.env.R2_ACCOUNT_ID || !process.env.R2_ACCESS_KEY_ID || !process.env.R2_SECRET_ACCESS_KEY) {
    console.error("Missing R2 credentials in .env");
    process.exit(1);
}

// Support both PostgreSQL and SQLite based on DB_TYPE
let db;
let isPostgres = process.env.DB_TYPE === 'postgres';

async function initDB() {
    if (isPostgres) {
        console.log('Connecting to PostgreSQL...');
        const { default: pgDb } = await import('../backend/database.pg.js');
        db = pgDb;
    } else {
        console.log('Connecting to SQLite...');
        const { default: sqliteDb } = await import('../backend/database.js');
        db = sqliteDb;
    }
}

async function runMigration() {
    await initDB();
    console.log("Database connected. Starting migration...");

    db.all("SELECT id, name, image, images FROM products", [], async (err, rows) => {
        if (err) {
            console.error("Failed to fetch products:", err);
            process.exit(1);
        }

        console.log(`Found ${rows.length} products. Processing...`);

        let updatedCount = 0;
        let skippedCount = 0;
        let errorCount = 0;

        for (const product of rows) {
            let changed = false;
            let newImage = product.image;
            let newImagesArray = [];

            try {
                if (product.images) {
                    newImagesArray = JSON.parse(product.images);
                }
            } catch (e) {
                console.warn(`Product ${product.id} has invalid images JSON`);
            }

            console.log(`Processing product: ${product.id} - ${product.name}`);

            try {
                // 1. Process Main Image
                if (newImage && newImage.startsWith('data:image/')) {
                    console.log(`  - Uploading main image for ${product.id}...`);
                    newImage = await uploadBase64ToR2(newImage, product.id, 'main');
                    changed = true;
                }

                // 2. Process Gallery Images
                if (Array.isArray(newImagesArray)) {
                    for (let i = 0; i < newImagesArray.length; i++) {
                        if (newImagesArray[i] && newImagesArray[i].startsWith('data:image/')) {
                            console.log(`  - Uploading gallery image ${i} for ${product.id}...`);
                            newImagesArray[i] = await uploadBase64ToR2(newImagesArray[i], product.id, i);
                            changed = true;
                        }
                    }
                }

                // 3. Update Database if changed (Safe Update - won't delete)
                if (changed) {
                    const newImagesStr = JSON.stringify(newImagesArray);
                    
                    await new Promise((resolve, reject) => {
                        db.run(
                            "UPDATE products SET image = ?, images = ? WHERE id = ?",
                            [newImage, newImagesStr, product.id],
                            function(updateErr) {
                                if (updateErr) reject(updateErr);
                                else resolve();
                            }
                        );
                    });
                    
                    console.log(`  ✅ Successfully updated ${product.id} in database.`);
                    updatedCount++;
                } else {
                    console.log(`  - No base64 images found for ${product.id}. Skipped.`);
                    skippedCount++;
                }

            } catch (err) {
                console.error(`  ❌ Error processing product ${product.id}:`, err);
                errorCount++;
                // We do NOT exit. We continue to the next product.
            }
        }

        console.log("\n--- MIGRATION COMPLETE ---");
        console.log(`Total Products: ${rows.length}`);
        console.log(`Updated: ${updatedCount}`);
        console.log(`Skipped: ${skippedCount}`);
        console.log(`Errors: ${errorCount}`);
        
        console.log("\nYou can safely run this script multiple times. It will only process images that are still in base64 format.");
        process.exit(0);
    });
}

runMigration();

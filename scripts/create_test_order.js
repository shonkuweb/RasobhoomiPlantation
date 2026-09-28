import dotenv from 'dotenv';
import path from 'path';
import fs from 'fs';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: path.join(__dirname, '../.env') });

// Dynamic DB loader to support both SQLite and PostgreSQL on VPS
let db;
if (process.env.DB_TYPE === 'postgres') {
    const { default: pgDb } = await import('../backend/database.pg.js');
    db = pgDb;
} else {
    const { default: sqliteDb } = await import('../backend/database.js');
    db = sqliteDb;
}

import { generateInvoicePdf } from '../backend/invoice_generator.js';
import { sendOrderPaymentNotification } from '../backend/whatsapp.js';

async function createManualOrder() {
    const orderId = 'ORD-' + Date.now();
    const customer = {
        id: orderId,
        name: 'SOUMYOJIT DAS',
        phone: '9907541613',
        address: 'Jora sirishtola habra',
        city: 'habra',
        zip: '743263',
        total: 900,
        delivery_charge: 150,
        discount_amount: 0,
        status: 'new',
        payment_status: 'paid',
        transaction_id: 'MANUAL_TEST_' + Date.now(),
        tracking_id: 'MANUAL_TRK_' + Math.floor(10000000 + Math.random() * 90000000),
        courier_name: 'dtdc',
        lang: 'en',
        items: JSON.stringify([
            { id: 'P1771315381917', name: 'VIETNAM ALL TIME MANGO 2ft', qty: 1, price: 250 },
            { id: 'P1778363647800', name: 'GOLDEN 8 guava', qty: 1, price: 250 },
            { id: 'P1771311499001', name: 'KAGAJI LEMON 3 FEET', qty: 1, price: 250 }
        ])
    };

    console.log(`\n==================================================`);
    console.log(`🚀 Creating Manual Test Order on VPS/Local: ${orderId}`);
    console.log(`==================================================`);
    console.log(`Customer: ${customer.name}`);
    console.log(`Address : ${customer.address}, ${customer.city} - ${customer.zip}`);
    console.log(`Phone   : ${customer.phone}`);
    console.log(`Total   : ₹${customer.total} (Delivery: ₹${customer.delivery_charge})`);
    console.log(`Database: ${process.env.DB_TYPE || 'sqlite'}`);

    // 1. Insert order into DB
    await new Promise((resolve, reject) => {
        const sql = `INSERT INTO orders (id, name, phone, address, city, zip, total, delivery_charge, discount_amount, items, status, payment_status, transaction_id, tracking_id, courier_name)
                     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`;
        db.run(sql, [
            customer.id, customer.name, customer.phone, customer.address,
            customer.city, customer.zip, customer.total, customer.delivery_charge,
            customer.discount_amount, customer.items, customer.status, customer.payment_status,
            customer.transaction_id, customer.tracking_id, customer.courier_name
        ], function (err) {
            if (err) {
                console.error('❌ Failed to insert order into DB:', err.message);
                return reject(err);
            }
            console.log('✅ Order recorded successfully in DB (status: paid)');
            resolve();
        });
    });

    // 2. Deduct product inventory
    const items = JSON.parse(customer.items);
    for (const item of items) {
        await new Promise((resolve) => {
            db.run('UPDATE products SET qty = qty - ? WHERE id = ? AND qty >= ?', [item.qty, item.id, item.qty], function (err) {
                if (err) console.error(`⚠️ Stock update warning for ${item.name}:`, err.message);
                else console.log(`📦 Stock updated for product: ${item.name} (-${item.qty})`);
                resolve();
            });
        });
    }

    // 3. Fetch newly created order object from DB
    const fullOrder = await new Promise((resolve) => {
        db.get('SELECT * FROM orders WHERE id = ?', [customer.id], (err, row) => resolve(row));
    });

    // 4. Generate PDF Invoice
    try {
        console.log('📄 Generating PDF Invoice...');
        const pdfBuffer = await generateInvoicePdf(fullOrder, 'en');
        const invoicesDir = path.join(__dirname, '../public/invoices');
        if (!fs.existsSync(invoicesDir)) fs.mkdirSync(invoicesDir, { recursive: true });
        
        const invoiceFilePath = path.join(invoicesDir, `Invoice_${customer.id}.pdf`);
        fs.writeFileSync(invoiceFilePath, pdfBuffer);
        console.log(`✅ Invoice PDF generated successfully: ${invoiceFilePath} (${pdfBuffer.length} bytes)`);
    } catch (pdfErr) {
        console.error('❌ PDF Invoice Generation Failed:', pdfErr.message);
    }

    // 5. Trigger WhatsApp notification
    try {
        console.log('📱 Attempting WhatsApp notification dispatch...');
        const waResult = await sendOrderPaymentNotification(fullOrder);
        if (waResult?.success) {
            console.log('✅ WhatsApp order confirmation notification sent!');
        } else {
            console.log(`ℹ️ WhatsApp notification status: ${waResult?.error || 'client offline'}`);
        }
    } catch (waErr) {
        console.error('⚠️ WhatsApp Dispatch Warning:', waErr.message);
    }

    console.log(`==================================================`);
    console.log(`🎉 SUCCESS: Manual Order ${customer.id} created end-to-end!`);
    console.log(`==================================================\n`);
    process.exit(0);
}

createManualOrder().catch((err) => {
    console.error('Fatal Error:', err);
    process.exit(1);
});

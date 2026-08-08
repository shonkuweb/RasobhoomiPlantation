import db from '../backend/database.js';

console.log('\n📊 FETCHING FAILED & PENDING PAYMENT ORDERS...\n');

db.all(
    `SELECT 
        id AS Order_ID, 
        name AS Customer_Name, 
        phone AS Phone, 
        '₹' || total AS Amount, 
        payment_status AS Payment_Status, 
        status AS Order_Status, 
        created_at AS Date 
     FROM orders 
     WHERE LOWER(COALESCE(payment_status, '')) != 'paid' 
     ORDER BY created_at DESC`,
    [],
    (err, rows) => {
        if (err) {
            console.error('❌ Error fetching failed payments:', err.message);
            process.exit(1);
        }

        if (!rows || rows.length === 0) {
            console.log('✅ No failed or pending payment orders found.\n');
        } else {
            console.table(rows);
            console.log(`\n📌 Total Failed/Pending Orders: ${rows.length}\n`);
        }
        process.exit(0);
    }
);

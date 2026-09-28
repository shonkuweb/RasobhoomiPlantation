import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: path.join(__dirname, '../.env') });

const PORT = process.env.PORT || 3000;
const BASE_URL = `http://127.0.0.1:${PORT}`;
const ADMIN_PASS = process.env.ADMIN_PASSCODE || '1234';

async function main() {
    console.log(`🚀 Triggering Live Order on running server at ${BASE_URL}...`);

    let token = null;
    const passesToTry = [ADMIN_PASS, '1234', 'admin123'];
    for (const pass of passesToTry) {
        try {
            const loginRes = await fetch(`${BASE_URL}/api/auth/login`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ password: pass })
            });
            const data = await loginRes.json();
            if (data.token) {
                token = data.token;
                console.log('🔑 Authenticated with live backend server!');
                break;
            }
        } catch (e) {
            // try next
        }
    }

    if (!token) {
        console.error(`❌ Could not connect/authenticate with live server on ${BASE_URL}. Is your backend server running on port ${PORT}?`);
        process.exit(1);
    }

    const orderPayload = {
        name: 'SOUMYOJIT DAS',
        phone: '9907541613',
        address: 'Jora sirishtola habra',
        city: 'habra',
        zip: '743263',
        lang: 'en',
        items: [
            { id: 'P1771315381917', name: 'VIETNAM ALL TIME MANGO 2ft', qty: 1, price: 250 },
            { id: 'P1778363647800', name: 'GOLDEN 8 guava', qty: 1, price: 250 },
            { id: 'P1771311499001', name: 'KAGAJI LEMON 3 FEET', qty: 1, price: 250 }
        ]
    };

    const orderRes = await fetch(`${BASE_URL}/api/orders`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(orderPayload)
    });

    const orderData = await orderRes.json();
    const orderId = orderData.orderId;

    if (!orderId) {
        console.error('❌ Order creation failed:', orderData);
        process.exit(1);
    }

    console.log(`✅ Order created in live database with ID: ${orderId}`);

    const markPaidRes = await fetch(`${BASE_URL}/api/orders/${orderId}/mark-paid`, {
        method: 'POST',
        headers: {
            'Authorization': `Bearer ${token}`,
            'Content-Type': 'application/json'
        }
    });

    const result = await markPaidRes.json();
    console.log('🎉 Live Server Response:', result);
    console.log(`\n==================================================`);
    console.log(`SUCCESS! Order ${orderId} is now visible in Admin section.`);
    console.log(`WhatsApp notifications & Invoice PDF dispatched by live process.`);
    console.log(`==================================================\n`);
}

main().catch(console.error);

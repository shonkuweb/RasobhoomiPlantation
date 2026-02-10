import axios from 'axios';

async function crashTest() {
    try {
        // 1. Create a dummy order to delete
        const orderId = 'CRASH-TEST-' + Date.now();
        const createPayload = {
            name: "Delete Me",
            phone: "0000000000",
            address: "Void",
            city: "Nowhere",
            zip: "00000",
            items: [],
            total: 100,
            forcedMock: true
        };

        // We need auth token. Login as admin.
        const loginRes = await axios.post('http://localhost:3000/api/auth/login', { password: "your-secure-admin-password" });
        const token = loginRes.data.token;

        // Create Order (Directly via DB or API? API is safer)
        // Actually, API /api/orders doesn't return the ID cleanly in the body if we just fire it? 
        // My previous script showed it returns { id: ... } in mock mode.
        const createRes = await axios.post('http://localhost:3000/api/orders', createPayload);
        const id = createRes.data.id;
        console.log(`Created Order: ${id}`);

        // 2. Try to Delete it
        console.log(`Attempting DELETE /api/orders/${id}...`);
        const delRes = await axios.delete(`http://localhost:3000/api/orders/${id}`, {
            headers: { Authorization: `Bearer ${token}` }
        });

        console.log('Delete Response:', delRes.status, delRes.data);

    } catch (err) {
        console.error('Crash Test Failed:', err.message);
        if (err.response) console.error('Response:', err.response.data);
    }
}

crashTest();

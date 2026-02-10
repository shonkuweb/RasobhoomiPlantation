import axios from 'axios';

const BASE_URL = 'http://localhost:3000/api';
const PASSWORD = '1234';

async function testLogin() {
    console.log(`Testing login with password: '${PASSWORD}'...`);
    try {
        const res = await axios.post(`${BASE_URL}/auth/login`, { password: PASSWORD });
        if (res.data.success) {
            console.log('✅ Login Successful! Token:', res.data.token);
        } else {
            console.log('❌ Login Failed (Logic Error):', res.data);
        }
    } catch (e) {
        console.error('❌ Login Request Failed:', e.response ? e.response.data : e.message);
        console.error('Status:', e.response ? e.response.status : 'Unknown');
    }
}

testLogin();

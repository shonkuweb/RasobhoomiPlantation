import axios from 'axios';

// SANDBOX CONFIGURATION (Corrected Secret)
const PHONEPE_HOST_URL = "https://api-preprod.phonepe.com/apis/pg-sandbox";
const PHONEPE_CLIENT_ID = "M23IHNJR0YDL2_2602131810";
const PHONEPE_CLIENT_SECRET = "NjI5MWJkMGYtOTVlYS00NTg4LThiNTktYzU5OTI3MGMzMzll"; // ENDS IN 'll'

async function testToken() {
    try {
        console.log("Testing PhonePe Token Generation (Sandbox)...");
        console.log("Host:", PHONEPE_HOST_URL);
        console.log("Client ID:", PHONEPE_CLIENT_ID);

        // Header: Content-Type: application/x-www-form-urlencoded
        // Body: client_id, client_secret, client_version, grant_type

        const params = new URLSearchParams();
        params.append('grant_type', 'client_credentials');
        params.append('client_id', PHONEPE_CLIENT_ID);
        params.append('client_secret', PHONEPE_CLIENT_SECRET);
        params.append('client_version', '1');

        const response = await axios.post(`${PHONEPE_HOST_URL}/v1/oauth/token`,
            params,
            {
                headers: {
                    'Content-Type': 'application/x-www-form-urlencoded'
                }
            }
        );

        console.log("SUCCESS!");
        console.log("Token:", response.data.access_token);
        console.log("Expires In:", response.data.expires_in);

    } catch (err) {
        console.error("FAILED!");
        if (err.response) {
            console.error("Status:", err.response.status);
            console.error("Data:", JSON.stringify(err.response.data, null, 2));
        } else {
            console.error("Error:", err.message);
        }
    }
}

testToken();

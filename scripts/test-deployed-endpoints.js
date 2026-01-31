const https = require('https');
const http = require('http');
const path = require('path');
const fs = require('fs');

// Load environment from root .env or Frontend .env
const envPath = path.resolve(__dirname, '../.env');
if (fs.existsSync(envPath)) {
    require('dotenv').config({ path: envPath });
}

// Check Frontend .env as fallback
const frontendEnv = path.resolve(__dirname, '../../Ataraxia/.env.local');
if (!process.env.VITE_API_URL && fs.existsSync(frontendEnv)) {
    const content = fs.readFileSync(frontendEnv, 'utf8');
    const match = content.match(/VITE_API_URL=(.*)/);
    if (match) process.env.VITE_API_URL = match[1];
}

const API_URL = process.env.VITE_API_URL || process.env.API_GATEWAY_URL;

if (!API_URL) {
    console.error('❌ API URL not found. Please deploy first.');
    process.exit(1);
}

console.log(`🔍 Testing Deployed API at: ${API_URL}`);

const request = (method, path, body = null) => {
    return new Promise((resolve, reject) => {
        const url = new URL(path, API_URL);
        const client = url.protocol === 'https:' ? https : http;

        const options = {
            method,
            headers: {
                'Content-Type': 'application/json'
            }
        };

        const req = client.request(url, options, (res) => {
            let data = '';
            res.on('data', chunk => data += chunk);
            res.on('end', () => {
                try {
                    resolve({ status: res.statusCode, data: JSON.parse(data) });
                } catch {
                    resolve({ status: res.statusCode, data });
                }
            });
        });

        req.on('error', reject);

        if (body) {
            req.write(JSON.stringify(body));
        }
        req.end();
    });
};

(async () => {
    try {
        console.log('\n🧪 Testing Endpoints...');

        // 1. Health/Root Check (API Gateway usually returns 403 on root if no method, but check /api/auth/me)
        console.log('1. Checking Auth Protection (/api/auth/me)...');
        const authRes = await request('GET', 'api/auth/me');
        if (authRes.status === 401 || authRes.status === 403) {
            console.log('✅ Auth endpoints protected (401/403 received)');
        } else {
            console.log(`⚠️ Unexpected status: ${authRes.status}`);
        }

        // 2. Public Registration Endpoint check
        console.log('2. Checking Registration Endpoint (/api/auth/register)...');
        // sending empty body to trigger validation error (400)
        const regRes = await request('POST', 'api/auth/register', {});
        if (regRes.status === 400) {
            console.log('✅ Registration endpoint active (400 Validation Error received)');
        } else {
            console.log(`⚠️ Function might be cold or error: ${regRes.status}`);
        }

        console.log('\n✅ Basic connectivity test complete.');
    } catch (e) {
        console.error('❌ Test execution failed:', e.message);
    }
})();

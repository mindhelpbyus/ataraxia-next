#!/usr/bin/env node

/**
 * Trigger deployment with schema fix
 * This script will rebuild and redeploy the Lambda functions with the DATABASE_SCHEMA environment variable
 */

const http = require('http');

async function triggerDeployment() {
    console.log('🚀 Triggering deployment with schema fix...');
    
    const postData = JSON.stringify({
        environment: 'dev',
        force: true,
        reason: 'Schema fix - adding DATABASE_SCHEMA environment variable'
    });

    const options = {
        hostname: 'localhost',
        port: 3012,
        path: '/api/deployment/start',
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
            'Content-Length': Buffer.byteLength(postData)
        }
    };

    return new Promise((resolve, reject) => {
        const req = http.request(options, (res) => {
            let data = '';
            
            res.on('data', (chunk) => {
                data += chunk;
            });
            
            res.on('end', () => {
                try {
                    const response = JSON.parse(data);
                    console.log('✅ Deployment triggered successfully!');
                    console.log('📊 Response:', response);
                    console.log('🌐 Dashboard: http://localhost:3012');
                    resolve(response);
                } catch (error) {
                    console.error('❌ Failed to parse response:', error);
                    reject(error);
                }
            });
        });

        req.on('error', (error) => {
            console.error('❌ Request failed:', error);
            reject(error);
        });

        req.write(postData);
        req.end();
    });
}

// Run the deployment
triggerDeployment()
    .then(() => {
        console.log('🎉 Deployment request completed!');
        console.log('📱 Open http://localhost:3012 to monitor progress');
        process.exit(0);
    })
    .catch((error) => {
        console.error('💥 Deployment failed:', error);
        process.exit(1);
    });
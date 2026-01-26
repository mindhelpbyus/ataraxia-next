#!/usr/bin/env node

/**
 * Comprehensive API Test Script
 * Tests all endpoints to ensure deployment is working correctly
 */

const https = require('https');

const API_BASE = 'https://zojyvoao3c.execute-api.us-west-2.amazonaws.com/dev';

async function testEndpoint(method, path, expectedStatus = 200) {
    return new Promise((resolve, reject) => {
        const url = `${API_BASE}${path}`;
        console.log(`Testing ${method} ${path}...`);
        
        const req = https.request(url, { method }, (res) => {
            let data = '';
            res.on('data', chunk => data += chunk);
            res.on('end', () => {
                try {
                    const json = JSON.parse(data);
                    const status = res.statusCode;
                    
                    if (status === expectedStatus || (status >= 200 && status < 300)) {
                        console.log(`✅ ${method} ${path} - Status: ${status}`);
                        resolve({ status, data: json });
                    } else {
                        console.log(`❌ ${method} ${path} - Status: ${status}`);
                        console.log(`   Response: ${JSON.stringify(json, null, 2)}`);
                        resolve({ status, data: json, error: true });
                    }
                } catch (error) {
                    console.log(`❌ ${method} ${path} - Parse Error: ${error.message}`);
                    console.log(`   Raw Response: ${data}`);
                    resolve({ status: res.statusCode, error: true, raw: data });
                }
            });
        });
        
        req.on('error', (error) => {
            console.log(`❌ ${method} ${path} - Request Error: ${error.message}`);
            resolve({ error: true, message: error.message });
        });
        
        req.end();
    });
}

async function runTests() {
    console.log('🧪 Starting comprehensive API tests...\n');
    
    const tests = [
        ['GET', '/api/therapist'],
        ['GET', '/api/therapist/search'],
        ['GET', '/api/therapist/search?limit=5'],
        ['GET', '/api/therapist/1000008'],
        ['GET', '/api/auth/me'],
        ['GET', '/api/verification/pending']
    ];
    
    let passed = 0;
    let failed = 0;
    
    for (const [method, path] of tests) {
        const result = await testEndpoint(method, path);
        if (result.error) {
            failed++;
        } else {
            passed++;
        }
        console.log(''); // Add spacing
    }
    
    console.log(`\n📊 Test Results: ${passed} passed, ${failed} failed`);
    
    if (failed === 0) {
        console.log('🎉 All tests passed! Deployment is working correctly.');
    } else {
        console.log('⚠️  Some tests failed. Check the logs above for details.');
    }
}

runTests().catch(console.error);

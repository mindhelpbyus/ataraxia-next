#!/usr/bin/env node

/**
 * Test Complete Deployment System
 * 
 * Comprehensive test of the deployment dashboard functionality:
 * - Dashboard accessibility
 * - API endpoints
 * - WebSocket connectivity
 * - Service management
 * - Database connectivity
 */

const axios = require('axios');
const WebSocket = require('ws');

const DASHBOARD_URL = 'http://localhost:3012';
const WS_URL = 'ws://localhost:3012';

async function testCompleteDeploymentSystem() {
    console.log('🧪 Testing Complete Deployment System...\n');

    let testResults = {
        dashboard: false,
        api: false,
        websocket: false,
        database: false,
        endpoints: []
    };

    // Test 1: Dashboard Accessibility
    console.log('🔍 Test 1: Dashboard Accessibility...');
    try {
        const response = await axios.get(DASHBOARD_URL, { timeout: 5000 });
        if (response.status === 200 && (response.data.includes('Ataraxia Deployment Dashboard') || response.data.includes('Ataraxia Deployment Command Center'))) {
            console.log('✅ Dashboard is accessible and serving HTML');
            testResults.dashboard = true;
        } else {
            console.log('❌ Dashboard returned unexpected content');
        }
    } catch (error) {
        console.log(`❌ Dashboard not accessible: ${error.message}`);
    }

    // Test 2: API Status Endpoint
    console.log('\n🔍 Test 2: API Status Endpoint...');
    try {
        const response = await axios.get(`${DASHBOARD_URL}/api/status`, { timeout: 5000 });
        if (response.status === 200 && response.data.local !== undefined) {
            console.log('✅ API status endpoint working');
            console.log(`   Local: ${response.data.local}`);
            console.log(`   Cloud: ${response.data.cloud}`);
            console.log(`   Database: ${response.data.database}`);
            console.log(`   API: ${response.data.api}`);
            testResults.api = true;
            testResults.database = response.data.database === 'connected';
        } else {
            console.log('❌ API status endpoint returned unexpected data');
        }
    } catch (error) {
        console.log(`❌ API status endpoint failed: ${error.message}`);
    }

    // Test 3: WebSocket Connectivity
    console.log('\n🔍 Test 3: WebSocket Connectivity...');
    try {
        await new Promise((resolve, reject) => {
            const ws = new WebSocket(WS_URL);
            let messageReceived = false;

            const timeout = setTimeout(() => {
                ws.close();
                if (!messageReceived) {
                    reject(new Error('WebSocket timeout - no initial message received'));
                }
            }, 5000);

            ws.on('open', () => {
                console.log('✅ WebSocket connection established');
            });

            ws.on('message', (data) => {
                try {
                    const message = JSON.parse(data);
                    if (message.type === 'state') {
                        console.log('✅ WebSocket state message received');
                        messageReceived = true;
                        testResults.websocket = true;
                        clearTimeout(timeout);
                        ws.close();
                        resolve();
                    }
                } catch (e) {
                    console.log('⚠️  WebSocket message parsing error');
                }
            });

            ws.on('error', (error) => {
                clearTimeout(timeout);
                reject(error);
            });

            ws.on('close', () => {
                if (messageReceived) {
                    resolve();
                }
            });
        });
    } catch (error) {
        console.log(`❌ WebSocket test failed: ${error.message}`);
    }

    // Test 4: API Endpoint Testing
    console.log('\n🔍 Test 4: API Endpoint Testing...');
    try {
        const response = await axios.post(`${DASHBOARD_URL}/api/test-endpoints`, {}, {
            timeout: 30000
        });

        if (response.status === 200 && response.data.success) {
            console.log('✅ API endpoint testing completed');
            testResults.endpoints = response.data.results;

            const successCount = response.data.results.filter(r => r.success).length;
            console.log(`   Results: ${successCount}/${response.data.results.length} endpoints passed`);

            response.data.results.forEach(result => {
                const status = result.success ? '✅' : '❌';
                const time = result.responseTime ? `${result.responseTime}ms` : 'N/A';
                console.log(`   ${status} ${result.method} ${result.path} - ${result.status} (${time})`);
            });
        } else {
            console.log('❌ API endpoint testing failed');
        }
    } catch (error) {
        console.log(`❌ API endpoint testing error: ${error.message}`);
    }

    // Test 5: Process Management API
    console.log('\n🔍 Test 5: Process Management API...');
    try {
        const response = await axios.get(`${DASHBOARD_URL}/api/processes`, { timeout: 5000 });
        if (response.status === 200) {
            console.log('✅ Process management API working');
            console.log(`   Active processes: ${response.data.length}`);
            response.data.forEach(proc => {
                console.log(`   - Process ${proc.id}: ${proc.type}/${proc.service} (port ${proc.port || 'N/A'})`);
            });
        }
    } catch (error) {
        console.log(`❌ Process management API failed: ${error.message}`);
    }

    // Test 6: Deployment Logs API
    console.log('\n🔍 Test 6: Deployment Logs API...');
    try {
        const response = await axios.get(`${DASHBOARD_URL}/api/deployment/logs/all?limit=5`, { timeout: 5000 });
        if (response.status === 200) {
            console.log('✅ Deployment logs API working');
            console.log(`   Recent logs: ${response.data.length} entries`);
        }
    } catch (error) {
        console.log(`❌ Deployment logs API failed: ${error.message}`);
    }

    // Summary
    console.log('\n' + '='.repeat(60));
    console.log('📊 DEPLOYMENT SYSTEM TEST SUMMARY');
    console.log('='.repeat(60));

    const tests = [
        { name: 'Dashboard Accessibility', passed: testResults.dashboard },
        { name: 'API Status Endpoint', passed: testResults.api },
        { name: 'WebSocket Connectivity', passed: testResults.websocket },
        { name: 'Database Connectivity', passed: testResults.database },
        { name: 'API Endpoint Testing', passed: testResults.endpoints.length > 0 }
    ];

    const passedTests = tests.filter(t => t.passed).length;

    console.log(`✅ Passed: ${passedTests}/${tests.length} tests`);
    console.log(`❌ Failed: ${tests.length - passedTests}/${tests.length} tests`);
    console.log('');

    tests.forEach(test => {
        const status = test.passed ? '✅' : '❌';
        console.log(`${status} ${test.name}`);
    });

    if (testResults.endpoints.length > 0) {
        const apiSuccessCount = testResults.endpoints.filter(r => r.success).length;
        console.log(`\n🌐 API Endpoints: ${apiSuccessCount}/${testResults.endpoints.length} working`);
    }

    console.log('\n🎯 Next Steps:');
    if (testResults.dashboard && testResults.api && testResults.websocket) {
        console.log('✅ Deployment dashboard is fully functional!');
        console.log('🌐 Open http://localhost:3012 to use the dashboard');
        console.log('🚀 You can now deploy services using the UI');
    } else {
        console.log('⚠️  Some components need attention:');
        if (!testResults.dashboard) console.log('   - Fix dashboard accessibility');
        if (!testResults.api) console.log('   - Fix API endpoints');
        if (!testResults.websocket) console.log('   - Fix WebSocket connectivity');
        if (!testResults.database) console.log('   - Fix database connectivity');
    }

    return passedTests === tests.length;
}

// Run the test
if (require.main === module) {
    testCompleteDeploymentSystem()
        .then(success => {
            process.exit(success ? 0 : 1);
        })
        .catch(error => {
            console.error('Fatal error:', error);
            process.exit(1);
        });
}

module.exports = testCompleteDeploymentSystem;
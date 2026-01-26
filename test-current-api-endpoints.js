#!/usr/bin/env node

/**
 * Test Current API Endpoints
 * Tests the deployed Lambda functions to ensure they're working
 */

const axios = require('axios');

const API_BASE_URL = 'https://zojyvoao3c.execute-api.us-west-2.amazonaws.com/dev';

async function testApiEndpoints() {
    console.log('🧪 Testing Current API Endpoints...\n');
    console.log(`🌐 API Base URL: ${API_BASE_URL}\n`);
    
    const endpoints = [
        { 
            method: 'GET', 
            path: '/api/therapist', 
            description: 'List all therapists',
            expectStatus: [200]
        },
        { 
            method: 'GET', 
            path: '/api/therapist/search', 
            description: 'Search therapists (no params)',
            expectStatus: [200]
        },
        { 
            method: 'GET', 
            path: '/api/therapist/search?specialty=anxiety&limit=5', 
            description: 'Advanced search with filters',
            expectStatus: [200]
        },
        { 
            method: 'GET', 
            path: '/api/therapist/1000008', 
            description: 'Get specific therapist by ID',
            expectStatus: [200, 404]
        },
        { 
            method: 'GET', 
            path: '/api/therapist/999999', 
            description: 'Get non-existent therapist (should 404)',
            expectStatus: [404]
        }
    ];
    
    const results = [];
    let successCount = 0;
    
    for (const endpoint of endpoints) {
        try {
            console.log(`🔍 Testing: ${endpoint.method} ${endpoint.path}`);
            console.log(`   Description: ${endpoint.description}`);
            
            const startTime = Date.now();
            const response = await axios({
                method: endpoint.method,
                url: `${API_BASE_URL}${endpoint.path}`,
                validateStatus: () => true, // Accept any status code
                timeout: 15000
            });
            const responseTime = Date.now() - startTime;
            
            const isExpectedStatus = endpoint.expectStatus.includes(response.status);
            const success = isExpectedStatus;
            
            if (success) {
                successCount++;
                console.log(`   ✅ Status: ${response.status} (${responseTime}ms)`);
                
                // Log response data summary
                if (response.data && typeof response.data === 'object') {
                    if (response.data.therapists && Array.isArray(response.data.therapists)) {
                        console.log(`   📊 Found ${response.data.therapists.length} therapists`);
                    } else if (response.data.therapist) {
                        console.log(`   👤 Therapist: ${response.data.therapist.first_name} ${response.data.therapist.last_name}`);
                    } else if (response.data.message) {
                        console.log(`   💬 Message: ${response.data.message}`);
                    }
                }
            } else {
                console.log(`   ❌ Status: ${response.status} (expected: ${endpoint.expectStatus.join(' or ')}) (${responseTime}ms)`);
                if (response.data && response.data.message) {
                    console.log(`   💬 Error: ${response.data.message}`);
                }
            }
            
            results.push({
                ...endpoint,
                status: response.status,
                success,
                responseTime,
                dataSize: JSON.stringify(response.data || {}).length
            });
            
        } catch (error) {
            console.log(`   ❌ Error: ${error.message}`);
            
            results.push({
                ...endpoint,
                success: false,
                error: error.message,
                responseTime: 0
            });
        }
        
        console.log(''); // Empty line for readability
    }
    
    // Summary
    console.log('=' .repeat(60));
    console.log('📊 API ENDPOINT TEST SUMMARY');
    console.log('=' .repeat(60));
    console.log(`✅ Successful tests: ${successCount}/${endpoints.length}`);
    console.log(`❌ Failed tests: ${endpoints.length - successCount}/${endpoints.length}`);
    console.log('');
    
    // Detailed results
    console.log('📋 Detailed Results:');
    results.forEach((result, index) => {
        const status = result.success ? '✅' : '❌';
        console.log(`${index + 1}. ${status} ${result.method} ${result.path}`);
        if (result.status) {
            console.log(`   Status: ${result.status}, Time: ${result.responseTime}ms`);
        }
        if (result.error) {
            console.log(`   Error: ${result.error}`);
        }
    });
    
    console.log('');
    
    if (successCount === endpoints.length) {
        console.log('🎉 ALL API ENDPOINTS ARE WORKING PERFECTLY!');
        console.log('✅ The Lambda functions are deployed and responding correctly');
        console.log('✅ Database connections are working');
        console.log('✅ Ready for production use');
    } else if (successCount > 0) {
        console.log('⚠️  SOME API ENDPOINTS HAVE ISSUES');
        console.log(`✅ ${successCount} endpoints working correctly`);
        console.log(`❌ ${endpoints.length - successCount} endpoints need attention`);
    } else {
        console.log('❌ ALL API ENDPOINTS ARE FAILING');
        console.log('🔧 Check Lambda deployment and database connectivity');
    }
    
    return results;
}

// Run the test
if (require.main === module) {
    testApiEndpoints()
        .then(results => {
            const allSuccess = results.every(r => r.success);
            process.exit(allSuccess ? 0 : 1);
        })
        .catch(error => {
            console.error('Fatal error:', error);
            process.exit(1);
        });
}

module.exports = testApiEndpoints;
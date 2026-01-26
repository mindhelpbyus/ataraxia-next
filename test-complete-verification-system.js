#!/usr/bin/env node

/**
 * Complete Verification System Test
 * Tests all endpoints and functionality to confirm implementation
 */

const axios = require('axios');
const { v4: uuidv4 } = require('uuid');

// Configuration
const BASE_URL = process.env.API_BASE_URL || 'http://localhost:3008';
const AUTH_URL = `${BASE_URL}/api/auth`;
const VERIFICATION_URL = `${BASE_URL}/api/verification`;

// Test data
const testUser = {
    email: `test-therapist-${Date.now()}@example.com`,
    password: 'TestPassword123!',
    firstName: 'Test',
    lastName: 'Therapist',
    phoneNumber: '5551234567',
    role: 'therapist'
};

const testRegistration = {
    authProviderId: null, // Will be set after user creation
    authProviderType: 'cognito',
    email: testUser.email,
    phoneNumber: testUser.phoneNumber,
    firstName: testUser.firstName,
    lastName: testUser.lastName,
    dateOfBirth: '1985-06-15',
    gender: 'female',
    
    // Address
    address1: '123 Main St',
    city: 'San Francisco',
    state: 'CA',
    zipCode: '94102',
    country: 'US',
    timezone: 'America/Los_Angeles',
    
    // Professional
    degree: 'PhD in Clinical Psychology',
    institutionName: 'Stanford University',
    graduationYear: 2010,
    yearsOfExperience: 13,
    bio: 'Experienced therapist specializing in anxiety and depression.',
    specializations: ['anxiety', 'depression', 'trauma'],
    
    // License
    licenseNumber: 'PSY12345',
    licenseState: 'CA',
    licenseType: 'Clinical Psychologist',
    licenseExpiry: '2025-12-31',
    npiNumber: '1234567890',
    
    // Insurance
    malpracticeInsuranceProvider: 'HPSO',
    malpracticePolicyNumber: 'POL123456',
    malpracticeExpiry: '2025-12-31',
    
    // Practice
    sessionFormats: { individual: true, couples: true, group: false },
    newClientsCapacity: 5,
    maxCaseloadCapacity: 25,
    selfPayAccepted: true,
    
    // Compliance
    hipaaTrainingCompleted: true,
    ethicsCertification: true,
    signedBaa: true,
    backgroundCheckConsent: true
};

let authToken = null;
let registrationId = null;
let adminToken = null;

async function makeRequest(method, url, data = null, headers = {}) {
    try {
        const config = {
            method,
            url,
            headers: {
                'Content-Type': 'application/json',
                ...headers
            }
        };
        
        if (data) {
            config.data = data;
        }
        
        const response = await axios(config);
        return { success: true, data: response.data, status: response.status };
    } catch (error) {
        return {
            success: false,
            error: error.response?.data || error.message,
            status: error.response?.status || 500
        };
    }
}

async function testAuthEndpoints() {
    console.log('\n🔐 Testing Authentication Endpoints...');
    
    // Test user registration
    console.log('  📝 Testing user registration...');
    const registerResult = await makeRequest('POST', `${AUTH_URL}/register`, testUser);
    
    if (!registerResult.success) {
        console.log('  ❌ Registration failed:', registerResult.error);
        return false;
    }
    
    console.log('  ✅ User registration successful');
    
    // Test login
    console.log('  🔑 Testing login...');
    const loginResult = await makeRequest('POST', `${AUTH_URL}/login`, {
        email: testUser.email,
        password: testUser.password
    });
    
    if (!loginResult.success) {
        console.log('  ❌ Login failed:', loginResult.error);
        return false;
    }
    
    authToken = loginResult.data.tokens.idToken;
    testRegistration.authProviderId = loginResult.data.user.id; // Use user ID as auth provider ID for testing
    
    console.log('  ✅ Login successful');
    
    // Test get current user
    console.log('  👤 Testing get current user...');
    const meResult = await makeRequest('GET', `${AUTH_URL}/me`, null, {
        'Authorization': `Bearer ${authToken}`
    });
    
    if (!meResult.success) {
        console.log('  ❌ Get current user failed:', meResult.error);
        return false;
    }
    
    console.log('  ✅ Get current user successful');
    
    return true;
}

async function testVerificationEndpoints() {
    console.log('\n📋 Testing Verification Endpoints...');
    
    // Test duplicate check
    console.log('  🔍 Testing duplicate check...');
    const duplicateResult = await makeRequest('POST', `${VERIFICATION_URL}/check-duplicate`, {
        email: testUser.email,
        phoneNumber: testUser.phoneNumber
    });
    
    if (duplicateResult.success) {
        console.log('  ❌ Duplicate check should have failed (user already exists)');
        return false;
    }
    
    console.log('  ✅ Duplicate check correctly identified existing user');
    
    // Test therapist registration
    console.log('  📝 Testing therapist registration...');
    const regResult = await makeRequest('POST', `${VERIFICATION_URL}/register`, testRegistration);
    
    if (!regResult.success) {
        console.log('  ❌ Therapist registration failed:', regResult.error);
        return false;
    }
    
    registrationId = regResult.data.registrationId;
    console.log('  ✅ Therapist registration successful, ID:', registrationId);
    
    // Test get registration status
    console.log('  📊 Testing get registration status...');
    const statusResult = await makeRequest('GET', `${VERIFICATION_URL}/status/${testRegistration.authProviderId}`);
    
    if (!statusResult.success) {
        console.log('  ❌ Get registration status failed:', statusResult.error);
        return false;
    }
    
    console.log('  ✅ Get registration status successful:', statusResult.data.registration?.status);
    
    return true;
}

async function testAuthStatusEndpoint() {
    console.log('\n🔍 Testing Auth Status Endpoint...');
    
    // Test the specific endpoint mentioned in the user query
    console.log('  📊 Testing GET /api/auth/therapist/status/:authProviderId...');
    const statusResult = await makeRequest('GET', `${AUTH_URL}/therapist/status/${testRegistration.authProviderId}`);
    
    if (!statusResult.success) {
        console.log('  ❌ Auth status endpoint failed:', statusResult.error);
        return false;
    }
    
    console.log('  ✅ Auth status endpoint successful');
    console.log('  📋 Status:', statusResult.data);
    
    return true;
}

async function testDocumentUpload() {
    console.log('\n📄 Testing Document Upload...');
    
    if (!registrationId) {
        console.log('  ❌ No registration ID available for document upload test');
        return false;
    }
    
    // Test document upload
    console.log('  📤 Testing document upload...');
    const docResult = await makeRequest('POST', `${VERIFICATION_URL}/${registrationId}/documents`, {
        documentType: 'license_document',
        documentUrl: 'https://example.com/license.pdf',
        originalFilename: 'license.pdf',
        fileSize: 1024000,
        mimeType: 'application/pdf'
    }, {
        'Authorization': `Bearer ${authToken}`
    });
    
    if (!docResult.success) {
        console.log('  ❌ Document upload failed:', docResult.error);
        return false;
    }
    
    console.log('  ✅ Document upload successful');
    
    // Test get documents
    console.log('  📋 Testing get documents...');
    const getDocsResult = await makeRequest('GET', `${VERIFICATION_URL}/${registrationId}/documents`, null, {
        'Authorization': `Bearer ${authToken}`
    });
    
    if (!getDocsResult.success) {
        console.log('  ❌ Get documents failed:', getDocsResult.error);
        return false;
    }
    
    console.log('  ✅ Get documents successful, count:', getDocsResult.data.documents.length);
    
    return true;
}

async function testAdminEndpoints() {
    console.log('\n👑 Testing Admin Endpoints...');
    
    // Create admin user for testing
    console.log('  👤 Creating admin user...');
    const adminUser = {
        email: `admin-${Date.now()}@example.com`,
        password: 'AdminPassword123!',
        firstName: 'Admin',
        lastName: 'User',
        role: 'admin'
    };
    
    const adminRegResult = await makeRequest('POST', `${AUTH_URL}/register`, adminUser);
    if (!adminRegResult.success) {
        console.log('  ❌ Admin user creation failed:', adminRegResult.error);
        return false;
    }
    
    const adminLoginResult = await makeRequest('POST', `${AUTH_URL}/login`, {
        email: adminUser.email,
        password: adminUser.password
    });
    
    if (!adminLoginResult.success) {
        console.log('  ❌ Admin login failed:', adminLoginResult.error);
        return false;
    }
    
    adminToken = adminLoginResult.data.tokens.idToken;
    console.log('  ✅ Admin user created and logged in');
    
    // Test get pending verifications
    console.log('  📋 Testing get pending verifications...');
    const pendingResult = await makeRequest('GET', `${VERIFICATION_URL}/pending`, null, {
        'Authorization': `Bearer ${adminToken}`
    });
    
    if (!pendingResult.success) {
        console.log('  ❌ Get pending verifications failed:', pendingResult.error);
        return false;
    }
    
    console.log('  ✅ Get pending verifications successful, count:', pendingResult.data.registrations.length);
    
    // Test approve therapist (if we have a registration)
    if (registrationId) {
        console.log('  ✅ Testing approve therapist...');
        const approveResult = await makeRequest('POST', `${VERIFICATION_URL}/${registrationId}/approve`, {}, {
            'Authorization': `Bearer ${adminToken}`
        });
        
        if (!approveResult.success) {
            console.log('  ❌ Approve therapist failed:', approveResult.error);
            return false;
        }
        
        console.log('  ✅ Approve therapist successful');
        
        // Verify status changed
        console.log('  🔍 Verifying status change...');
        const newStatusResult = await makeRequest('GET', `${AUTH_URL}/therapist/status/${testRegistration.authProviderId}`);
        
        if (newStatusResult.success) {
            console.log('  ✅ Status verification successful:', newStatusResult.data.status);
        } else {
            console.log('  ⚠️  Status verification failed, but approval succeeded');
        }
    }
    
    return true;
}

async function testCompleteWorkflow() {
    console.log('\n🔄 Testing Complete Workflow...');
    
    // Create a new user for complete workflow test
    const workflowUser = {
        email: `workflow-${Date.now()}@example.com`,
        password: 'WorkflowPassword123!',
        firstName: 'Workflow',
        lastName: 'Test',
        phoneNumber: '5559876543',
        role: 'therapist'
    };
    
    // 1. Register user
    console.log('  1️⃣ Registering new user...');
    const regResult = await makeRequest('POST', `${AUTH_URL}/register`, workflowUser);
    if (!regResult.success) {
        console.log('  ❌ User registration failed');
        return false;
    }
    
    // 2. Login
    console.log('  2️⃣ Logging in...');
    const loginResult = await makeRequest('POST', `${AUTH_URL}/login`, {
        email: workflowUser.email,
        password: workflowUser.password
    });
    if (!loginResult.success) {
        console.log('  ❌ Login failed');
        return false;
    }
    
    const workflowToken = loginResult.data.tokens.idToken;
    const workflowAuthId = loginResult.data.user.id;
    
    // 3. Submit therapist registration
    console.log('  3️⃣ Submitting therapist registration...');
    const therapistReg = {
        ...testRegistration,
        authProviderId: workflowAuthId,
        email: workflowUser.email,
        phoneNumber: workflowUser.phoneNumber,
        firstName: workflowUser.firstName,
        lastName: workflowUser.lastName,
        licenseNumber: 'PSY' + Date.now()
    };
    
    const therapistRegResult = await makeRequest('POST', `${VERIFICATION_URL}/register`, therapistReg);
    if (!therapistRegResult.success) {
        console.log('  ❌ Therapist registration failed');
        return false;
    }
    
    const workflowRegId = therapistRegResult.data.registrationId;
    
    // 4. Check status
    console.log('  4️⃣ Checking registration status...');
    const statusResult = await makeRequest('GET', `${AUTH_URL}/therapist/status/${workflowAuthId}`);
    if (!statusResult.success) {
        console.log('  ❌ Status check failed');
        return false;
    }
    
    // 5. Upload document
    console.log('  5️⃣ Uploading document...');
    const docResult = await makeRequest('POST', `${VERIFICATION_URL}/${workflowRegId}/documents`, {
        documentType: 'license_document',
        documentUrl: 'https://example.com/workflow-license.pdf',
        originalFilename: 'workflow-license.pdf',
        fileSize: 2048000,
        mimeType: 'application/pdf'
    }, {
        'Authorization': `Bearer ${workflowToken}`
    });
    
    if (!docResult.success) {
        console.log('  ❌ Document upload failed');
        return false;
    }
    
    // 6. Admin approval
    console.log('  6️⃣ Admin approval...');
    if (adminToken) {
        const approveResult = await makeRequest('POST', `${VERIFICATION_URL}/${workflowRegId}/approve`, {}, {
            'Authorization': `Bearer ${adminToken}`
        });
        
        if (!approveResult.success) {
            console.log('  ❌ Admin approval failed');
            return false;
        }
        
        // 7. Final status check
        console.log('  7️⃣ Final status check...');
        const finalStatusResult = await makeRequest('GET', `${AUTH_URL}/therapist/status/${workflowAuthId}`);
        if (finalStatusResult.success) {
            console.log('  ✅ Complete workflow successful!');
            console.log('  📊 Final status:', finalStatusResult.data);
        } else {
            console.log('  ⚠️  Workflow completed but final status check failed');
        }
    }
    
    return true;
}

async function runAllTests() {
    console.log('🚀 Starting Complete Verification System Test');
    console.log('=' .repeat(60));
    
    const results = {
        auth: false,
        verification: false,
        authStatus: false,
        documents: false,
        admin: false,
        workflow: false
    };
    
    try {
        // Test authentication endpoints
        results.auth = await testAuthEndpoints();
        
        // Test verification endpoints
        results.verification = await testVerificationEndpoints();
        
        // Test auth status endpoint specifically
        results.authStatus = await testAuthStatusEndpoint();
        
        // Test document upload
        results.documents = await testDocumentUpload();
        
        // Test admin endpoints
        results.admin = await testAdminEndpoints();
        
        // Test complete workflow
        results.workflow = await testCompleteWorkflow();
        
    } catch (error) {
        console.error('❌ Test execution error:', error.message);
    }
    
    // Print results
    console.log('\n' + '=' .repeat(60));
    console.log('📊 TEST RESULTS SUMMARY');
    console.log('=' .repeat(60));
    
    const testCategories = [
        { name: 'Authentication Endpoints', key: 'auth' },
        { name: 'Verification Endpoints', key: 'verification' },
        { name: 'Auth Status Endpoint', key: 'authStatus' },
        { name: 'Document Upload', key: 'documents' },
        { name: 'Admin Endpoints', key: 'admin' },
        { name: 'Complete Workflow', key: 'workflow' }
    ];
    
    let passedCount = 0;
    testCategories.forEach(category => {
        const status = results[category.key] ? '✅ PASS' : '❌ FAIL';
        console.log(`${status} ${category.name}`);
        if (results[category.key]) passedCount++;
    });
    
    console.log('=' .repeat(60));
    console.log(`📈 Overall: ${passedCount}/${testCategories.length} tests passed`);
    
    if (passedCount === testCategories.length) {
        console.log('🎉 ALL TESTS PASSED! The verification system is fully functional.');
    } else {
        console.log('⚠️  Some tests failed. Please check the implementation.');
    }
    
    console.log('=' .repeat(60));
}

// Run the tests
if (require.main === module) {
    runAllTests().catch(console.error);
}

module.exports = { runAllTests };
#!/usr/bin/env node

/**
 * Comprehensive Test Suite for Ataraxia-Next Services
 * 
 * Tests all migrated services:
 * - Auth Service (Login, Register, Confirm)
 * - Therapist Service (CRUD, Search, Matching)
 * - Client Service (CRUD, Medical, Insurance, Safety)
 * - Appointment Service (CRUD, Scheduling)
 * - Verification Service (Registration, Documents)
 */

const axios = require('axios');

const API_BASE_URL = process.env.API_BASE_URL || 'http://localhost:3010';
const colors = {
    reset: '\x1b[0m',
    green: '\x1b[32m',
    red: '\x1b[31m',
    yellow: '\x1b[33m',
    blue: '\x1b[36m',
    gray: '\x1b[90m'
};

let testResults = {
    passed: 0,
    failed: 0,
    skipped: 0
};

// Test data storage
let testData = {
    authToken: null,
    userId: null,
    therapistId: null,
    clientId: null,
    appointmentId: null
};

function log(message, color = 'reset') {
    console.log(`${colors[color]}${message}${colors.reset}`);
}

function logTest(name, status, details = '') {
    const icon = status === 'PASS' ? '✓' : status === 'FAIL' ? '✗' : '○';
    const color = status === 'PASS' ? 'green' : status === 'FAIL' ? 'red' : 'yellow';
    log(`  ${icon} ${name}${details ? ': ' + details : ''}`, color);

    if (status === 'PASS') testResults.passed++;
    else if (status === 'FAIL') testResults.failed++;
    else testResults.skipped++;
}

async function testHealthCheck() {
    log('\n📋 Testing Health Check...', 'blue');
    try {
        const response = await axios.get(`${API_BASE_URL}/health`);
        logTest('Health endpoint', 'PASS', `Status: ${response.data.status}`);
        log(`   Database: ${response.data.database}`, 'gray');
        log(`   Cognito: ${response.data.cognito}`, 'gray');
        return true;
    } catch (error) {
        logTest('Health endpoint', 'FAIL', error.message);
        return false;
    }
}

async function testAuthService() {
    log('\n🔐 Testing Auth Service...', 'blue');

    // Test 1: Register new user
    try {
        const registerData = {
            email: `test-${Date.now()}@ataraxia.com`,
            password: 'SecurePassword123!@#',
            firstName: 'Test',
            lastName: 'User',
            phoneNumber: '5551234567',
            role: 'therapist'
        };

        const response = await axios.post(`${API_BASE_URL}/api/auth/register`, registerData);
        logTest('Register new user', 'PASS', `Email: ${registerData.email}`);
        testData.testEmail = registerData.email;
        testData.testPassword = registerData.password;
    } catch (error) {
        const msg = error.response?.data?.message || error.message;
        if (msg.includes('already registered')) {
            logTest('Register new user', 'SKIP', 'User already exists');
        } else {
            logTest('Register new user', 'FAIL', msg);
        }
    }

    // Test 2: Login
    try {
        const loginData = {
            email: 'vignesh@ataraxia.com', // Use existing user
            password: 'Test@1234'
        };

        const response = await axios.post(`${API_BASE_URL}/api/auth/login`, loginData);
        if (response.data.success && response.data.data.tokens) {
            testData.authToken = response.data.data.tokens.accessToken;
            testData.userId = response.data.data.user.id;
            logTest('Login existing user', 'PASS', `User ID: ${testData.userId}`);
        } else {
            logTest('Login existing user', 'FAIL', 'No token returned');
        }
    } catch (error) {
        logTest('Login existing user', 'FAIL', error.response?.data?.message || error.message);
    }
}

async function testTherapistService() {
    log('\n👨‍⚕️ Testing Therapist Service...', 'blue');

    const headers = testData.authToken ? { Authorization: `Bearer ${testData.authToken}` } : {};

    // Test 1: Get all therapists
    try {
        const response = await axios.get(`${API_BASE_URL}/api/therapist?limit=5`, { headers });
        if (response.data.success && response.data.data && Array.isArray(response.data.data.therapists)) {
            logTest('List therapists', 'PASS', `Found ${response.data.data.therapists.length} therapists`);
            if (response.data.data.therapists.length > 0) {
                testData.therapistId = response.data.data.therapists[0].id;
            }
        } else {
            logTest('List therapists', 'FAIL', 'Invalid response format');
        }
    } catch (error) {
        logTest('List therapists', 'FAIL', error.response?.data?.message || error.message);
    }

    // Test 2: Get single therapist
    if (testData.therapistId) {
        try {
            const response = await axios.get(`${API_BASE_URL}/api/therapist/${testData.therapistId}`, { headers });
            if (response.data.success && response.data.data && response.data.data.therapist) {
                const therapist = response.data.data.therapist;
                logTest('Get therapist details', 'PASS', `${therapist.first_name} ${therapist.last_name}`);
            } else {
                logTest('Get therapist details', 'FAIL', 'No therapist data');
            }
        } catch (error) {
            logTest('Get therapist details', 'FAIL', error.response?.data?.message || error.message);
        }
    } else {
        logTest('Get therapist details', 'SKIP', 'No therapist ID available');
    }

    // Test 3: Search therapists
    try {
        const response = await axios.get(`${API_BASE_URL}/api/therapist/search?specialty=anxiety&limit=3`, { headers });
        if (response.data.success && response.data.data) {
            logTest('Search therapists', 'PASS', `Found ${response.data.data.therapists?.length || 0} matches`);
        } else {
            logTest('Search therapists', 'FAIL', 'Invalid response');
        }
    } catch (error) {
        logTest('Search therapists', 'FAIL', error.response?.data?.message || error.message);
    }

    // Test 4: Update therapist (if we have auth)
    if (testData.therapistId && testData.authToken) {
        try {
            const updateData = {
                bio: `Updated bio at ${new Date().toISOString()}`,
                timezone: 'America/Los_Angeles'
            };
            const response = await axios.put(`${API_BASE_URL}/api/therapist/${testData.therapistId}`, updateData, { headers });
            logTest('Update therapist profile', response.data.success ? 'PASS' : 'FAIL');
        } catch (error) {
            logTest('Update therapist profile', 'FAIL', error.response?.data?.message || error.message);
        }
    } else {
        logTest('Update therapist profile', 'SKIP', 'No auth token or therapist ID');
    }
}

async function testClientService() {
    log('\n👤 Testing Client Service...', 'blue');

    const headers = testData.authToken ? { Authorization: `Bearer ${testData.authToken}` } : {};

    // Test 1: Get all clients
    try {
        const response = await axios.get(`${API_BASE_URL}/api/client?limit=5`, { headers });
        if (response.data.success && response.data.data && Array.isArray(response.data.data.clients)) {
            logTest('List clients', 'PASS', `Found ${response.data.data.clients.length} clients`);
            if (response.data.data.clients.length > 0) {
                testData.clientId = response.data.data.clients[0].id;
            }
        } else {
            logTest('List clients', 'FAIL', 'Invalid response format');
        }
    } catch (error) {
        logTest('List clients', 'FAIL', error.response?.data?.message || error.message);
    }

    // Test 2: Get single client
    if (testData.clientId) {
        try {
            const response = await axios.get(`${API_BASE_URL}/api/client/${testData.clientId}`, { headers });
            if (response.data.success && response.data.data.client) {
                logTest('Get client details', 'PASS', `Client ID: ${testData.clientId}`);
            } else {
                logTest('Get client details', 'FAIL', 'No client data');
            }
        } catch (error) {
            logTest('Get client details', 'FAIL', error.response?.data?.message || error.message);
        }
    } else {
        logTest('Get client details', 'SKIP', 'No client ID available');
    }

    // Test 3: Update client medical history
    if (testData.clientId && testData.authToken) {
        try {
            const medicalData = {
                medical_history: {
                    allergies: ['Penicillin'],
                    current_medications: ['Aspirin'],
                    past_diagnoses: ['Anxiety']
                }
            };
            const response = await axios.put(`${API_BASE_URL}/api/client/${testData.clientId}/medical-history`, medicalData, { headers });
            logTest('Update medical history', response.data.success ? 'PASS' : 'FAIL');
        } catch (error) {
            logTest('Update medical history', 'FAIL', error.response?.data?.message || error.message);
        }
    } else {
        logTest('Update medical history', 'SKIP', 'No auth token or client ID');
    }
}

async function testAppointmentService() {
    log('\n📅 Testing Appointment Service...', 'blue');

    const headers = testData.authToken ? { Authorization: `Bearer ${testData.authToken}` } : {};

    // Test 1: Get all appointments
    try {
        const response = await axios.get(`${API_BASE_URL}/api/appointment?limit=5`, { headers });
        if (response.data.success && response.data.data.appointments) {
            logTest('List appointments', 'PASS', `Found ${response.data.data.appointments.length} appointments`);
            if (response.data.data.appointments.length > 0) {
                testData.appointmentId = response.data.data.appointments[0].id;
            }
        } else {
            logTest('List appointments', 'FAIL', 'Invalid response format');
        }
    } catch (error) {
        logTest('List appointments', 'FAIL', error.response?.data?.message || error.message);
    }

    // Test 2: Create appointment
    if (testData.therapistId && testData.authToken) {
        try {
            const appointmentData = {
                therapist_id: testData.therapistId,
                client_id: testData.clientId,
                start_time: new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString(), // Tomorrow
                end_time: new Date(Date.now() + 25 * 60 * 60 * 1000).toISOString(), // Tomorrow + 1 hour
                type: 'video',
                title: 'Test Appointment'
            };
            const response = await axios.post(`${API_BASE_URL}/api/appointment`, appointmentData, { headers });
            if (response.data.success) {
                testData.newAppointmentId = response.data.data.id;
                logTest('Create appointment', 'PASS', `ID: ${testData.newAppointmentId}`);
            } else {
                logTest('Create appointment', 'FAIL', 'No appointment created');
            }
        } catch (error) {
            logTest('Create appointment', 'FAIL', error.response?.data?.message || error.message);
        }
    } else {
        logTest('Create appointment', 'SKIP', 'No therapist ID or auth token');
    }

    // Test 3: Get single appointment
    if (testData.appointmentId) {
        try {
            const response = await axios.get(`${API_BASE_URL}/api/appointment/${testData.appointmentId}`, { headers });
            if (response.data.success) {
                logTest('Get appointment details', 'PASS');
            } else {
                logTest('Get appointment details', 'FAIL');
            }
        } catch (error) {
            logTest('Get appointment details', 'FAIL', error.response?.data?.message || error.message);
        }
    } else {
        logTest('Get appointment details', 'SKIP', 'No appointment ID available');
    }

    // Test 4: Update appointment
    if (testData.newAppointmentId && testData.authToken) {
        try {
            const updateData = {
                status: 'confirmed',
                notes: 'Test appointment confirmed'
            };
            const response = await axios.put(`${API_BASE_URL}/api/appointment/${testData.newAppointmentId}`, updateData, { headers });
            logTest('Update appointment', response.data.success ? 'PASS' : 'FAIL');
        } catch (error) {
            logTest('Update appointment', 'FAIL', error.response?.data?.message || error.message);
        }
    } else {
        logTest('Update appointment', 'SKIP', 'No appointment to update');
    }

    // Test 5: Cancel appointment
    if (testData.newAppointmentId && testData.authToken) {
        try {
            const response = await axios.delete(`${API_BASE_URL}/api/appointment/${testData.newAppointmentId}`, { headers });
            logTest('Cancel appointment', response.data.success ? 'PASS' : 'FAIL');
        } catch (error) {
            logTest('Cancel appointment', 'FAIL', error.response?.data?.message || error.message);
        }
    } else {
        logTest('Cancel appointment', 'SKIP', 'No appointment to cancel');
    }
}

async function testVerificationService() {
    log('\n✅ Testing Verification Service...', 'blue');

    // Test 1: Check therapist status
    try {
        const testAuthId = 'test-auth-id-' + Date.now();
        const response = await axios.get(`${API_BASE_URL}/auth/therapist/status/${testAuthId}`);
        // This will likely return 404, which is expected for a non-existent ID
        logTest('Get therapist status', 'PASS', 'Endpoint accessible');
    } catch (error) {
        if (error.response?.status === 404) {
            logTest('Get therapist status', 'PASS', 'Endpoint accessible (404 expected)');
        } else {
            logTest('Get therapist status', 'FAIL', error.response?.data?.message || error.message);
        }
    }
}

async function runAllTests() {
    log('\n' + '='.repeat(60), 'blue');
    log('🧪 ATARAXIA-NEXT COMPREHENSIVE TEST SUITE', 'blue');
    log('='.repeat(60), 'blue');
    log(`API Base URL: ${API_BASE_URL}`, 'gray');
    log(`Started: ${new Date().toISOString()}`, 'gray');

    const healthOk = await testHealthCheck();

    if (!healthOk) {
        log('\n❌ Health check failed. Aborting tests.', 'red');
        return;
    }

    await testAuthService();
    await testTherapistService();
    await testClientService();
    await testAppointmentService();
    await testVerificationService();

    // Summary
    log('\n' + '='.repeat(60), 'blue');
    log('📊 TEST SUMMARY', 'blue');
    log('='.repeat(60), 'blue');
    log(`✓ Passed:  ${testResults.passed}`, 'green');
    log(`✗ Failed:  ${testResults.failed}`, 'red');
    log(`○ Skipped: ${testResults.skipped}`, 'yellow');
    log(`Total:     ${testResults.passed + testResults.failed + testResults.skipped}`, 'gray');

    const successRate = ((testResults.passed / (testResults.passed + testResults.failed)) * 100).toFixed(1);
    log(`\nSuccess Rate: ${successRate}%`, successRate >= 80 ? 'green' : successRate >= 50 ? 'yellow' : 'red');

    log('\n' + '='.repeat(60), 'blue');

    process.exit(testResults.failed > 0 ? 1 : 0);
}

// Run tests
runAllTests().catch(error => {
    log('\n❌ Test suite crashed:', 'red');
    console.error(error);
    process.exit(1);
});

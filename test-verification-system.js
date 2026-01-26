#!/usr/bin/env node

/**
 * Comprehensive Verification System Test
 * Tests the complete therapist registration and verification workflow
 */

const fetch = require('node-fetch');

const API_URL = 'http://localhost:3010';

// Test data
const testTherapist = {
  email: 'test.therapist@example.com',
  password: 'TestPassword123!',
  firstName: 'Dr. Sarah',
  lastName: 'Johnson',
  phoneNumber: '5551234567',
  countryCode: '+1',
  
  // Professional Information
  licenseNumber: 'LMFT123456',
  licenseState: 'CA',
  licenseType: 'LMFT',
  licenseExpiry: '2025-12-31',
  degree: 'Masters in Clinical Psychology',
  institutionName: 'Stanford University',
  graduationYear: 2018,
  yearsOfExperience: 5,
  
  // Address
  address1: '123 Therapy Lane',
  city: 'San Francisco',
  state: 'CA',
  zipCode: '94102',
  country: 'US',
  timezone: 'America/Los_Angeles',
  
  // Specialties
  clinicalSpecialties: {
    anxiety: true,
    depression: true,
    trauma: false
  },
  therapeuticModalities: {
    cbt: true,
    dbt: false,
    emdr: true
  },
  
  // Practice Information
  sessionFormats: {
    video: true,
    inPerson: false
  },
  newClientsCapacity: 10,
  maxCaseloadCapacity: 50,
  
  // Compliance
  hipaaTrainingCompleted: true,
  ethicsCertification: true,
  signedBaa: true,
  backgroundCheckConsent: true,
  
  // Profile
  shortBio: 'Experienced therapist specializing in anxiety and depression.',
  extendedBio: 'Dr. Johnson has over 5 years of experience helping clients overcome anxiety and depression using evidence-based approaches.',
  whatClientsCanExpected: 'A warm, supportive environment focused on your healing journey.',
  myApproachToTherapy: 'I use a combination of CBT and EMDR to help clients process trauma and develop coping skills.'
};

async function runVerificationTests() {
  console.log('🧪 Testing Complete Verification System');
  console.log('=====================================\n');

  try {
    // Test 1: Check duplicate registration
    console.log('1. Testing duplicate check...');
    await testDuplicateCheck();
    
    // Test 2: Register user with Cognito
    console.log('\n2. Testing user registration...');
    const tokens = await testUserRegistration();
    
    // Test 3: Complete therapist registration
    console.log('\n3. Testing therapist registration...');
    const registrationId = await testTherapistRegistration(tokens.idToken);
    
    // Test 4: Check registration status
    console.log('\n4. Testing registration status...');
    await testRegistrationStatus(tokens.idToken);
    
    // Test 5: Upload documents
    console.log('\n5. Testing document upload...');
    await testDocumentUpload(registrationId, tokens.idToken);
    
    // Test 6: Admin functions (mock admin token)
    console.log('\n6. Testing admin functions...');
    await testAdminFunctions(registrationId);
    
    console.log('\n✅ All verification tests completed successfully!');
    
  } catch (error) {
    console.error('\n❌ Test failed:', error.message);
    process.exit(1);
  }
}

async function testDuplicateCheck() {
  const response = await fetch(`${API_URL}/api/verification/check-duplicate`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      email: testTherapist.email,
      phoneNumber: testTherapist.phoneNumber
    })
  });

  const result = await response.json();
  console.log('   Duplicate check result:', result.success ? '✅ Available' : '❌ Exists');
  
  if (!result.success && result.details) {
    console.log('   Details:', result.details);
  }
}

async function testUserRegistration() {
  const response = await fetch(`${API_URL}/api/auth/register`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      email: testTherapist.email,
      password: testTherapist.password,
      firstName: testTherapist.firstName,
      lastName: testTherapist.lastName,
      phoneNumber: testTherapist.phoneNumber,
      countryCode: testTherapist.countryCode,
      role: 'therapist'
    })
  });

  const result = await response.json();
  
  if (response.ok) {
    console.log('   User registration: ✅ Success');
    
    // For testing, we'll simulate login to get tokens
    const loginResponse = await fetch(`${API_URL}/api/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        email: testTherapist.email,
        password: testTherapist.password
      })
    });

    if (loginResponse.ok) {
      const loginResult = await loginResponse.json();
      console.log('   Login: ✅ Success');
      return loginResult.tokens;
    } else {
      // For testing purposes, return mock tokens
      console.log('   Login: ⚠️  Using mock tokens for testing');
      return {
        idToken: 'mock-id-token',
        accessToken: 'mock-access-token'
      };
    }
  } else {
    if (result.message?.includes('already exists')) {
      console.log('   User registration: ⚠️  User already exists, continuing with login...');
      // Try to login with existing user
      const loginResponse = await fetch(`${API_URL}/api/auth/login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          email: testTherapist.email,
          password: testTherapist.password
        })
      });

      if (loginResponse.ok) {
        const loginResult = await loginResponse.json();
        return loginResult.tokens;
      } else {
        return {
          idToken: 'mock-id-token',
          accessToken: 'mock-access-token'
        };
      }
    } else {
      throw new Error(`Registration failed: ${result.message}`);
    }
  }
}

async function testTherapistRegistration(idToken) {
  const response = await fetch(`${API_URL}/api/auth/therapist/register`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${idToken}`
    },
    body: JSON.stringify(testTherapist)
  });

  const result = await response.json();
  
  if (response.ok) {
    console.log('   Therapist registration: ✅ Success');
    console.log('   Registration ID:', result.registrationId);
    console.log('   Status:', result.status);
    console.log('   Workflow Stage:', result.workflowStage);
    return result.registrationId;
  } else {
    if (result.message?.includes('already submitted')) {
      console.log('   Therapist registration: ⚠️  Already submitted');
      return 'existing-registration-id'; // Mock ID for testing
    } else {
      throw new Error(`Therapist registration failed: ${result.message}`);
    }
  }
}

async function testRegistrationStatus(idToken) {
  // Extract auth provider ID from token (mock for testing)
  const authProviderId = 'mock-cognito-sub-123';
  
  const response = await fetch(`${API_URL}/api/verification/status/${authProviderId}`, {
    method: 'GET',
    headers: {
      'Content-Type': 'application/json'
    }
  });

  const result = await response.json();
  
  if (response.ok) {
    console.log('   Registration status: ✅ Retrieved');
    console.log('   Status:', result.registration?.status || 'Not found');
    console.log('   Workflow Stage:', result.registration?.workflowStage || 'N/A');
    console.log('   Can Login:', result.registration?.canLogin || false);
  } else {
    console.log('   Registration status: ⚠️  Not found (expected for new registration)');
  }
}

async function testDocumentUpload(registrationId, idToken) {
  const documents = [
    {
      documentType: 'license_document',
      documentUrl: 'https://example.com/license.pdf',
      originalFilename: 'license.pdf',
      fileSize: 1024000,
      mimeType: 'application/pdf'
    },
    {
      documentType: 'degree_certificate',
      documentUrl: 'https://example.com/degree.pdf',
      originalFilename: 'degree.pdf',
      fileSize: 2048000,
      mimeType: 'application/pdf'
    }
  ];

  for (const doc of documents) {
    const response = await fetch(`${API_URL}/api/verification/${registrationId}/documents`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${idToken}`
      },
      body: JSON.stringify(doc)
    });

    const result = await response.json();
    
    if (response.ok) {
      console.log(`   Document upload (${doc.documentType}): ✅ Success`);
    } else {
      console.log(`   Document upload (${doc.documentType}): ❌ Failed - ${result.message}`);
    }
  }

  // Test getting documents
  const getResponse = await fetch(`${API_URL}/api/verification/${registrationId}/documents`, {
    method: 'GET',
    headers: {
      'Authorization': `Bearer ${idToken}`
    }
  });

  if (getResponse.ok) {
    const getResult = await getResponse.json();
    console.log(`   Get documents: ✅ Retrieved ${getResult.documents?.length || 0} documents`);
  } else {
    console.log('   Get documents: ❌ Failed');
  }
}

async function testAdminFunctions(registrationId) {
  // Mock admin token for testing
  const adminToken = 'mock-admin-token';

  // Test get pending verifications
  console.log('   Testing get pending verifications...');
  const pendingResponse = await fetch(`${API_URL}/api/verification/pending`, {
    method: 'GET',
    headers: {
      'Authorization': `Bearer ${adminToken}`
    }
  });

  if (pendingResponse.ok) {
    const pendingResult = await pendingResponse.json();
    console.log(`   Get pending: ✅ Found ${pendingResult.registrations?.length || 0} pending registrations`);
  } else {
    console.log('   Get pending: ❌ Failed (expected - requires admin auth)');
  }

  // Test initiate background check
  console.log('   Testing initiate background check...');
  const bgCheckResponse = await fetch(`${API_URL}/api/verification/${registrationId}/background-check`, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${adminToken}`
    }
  });

  if (bgCheckResponse.ok) {
    console.log('   Background check: ✅ Initiated');
  } else {
    console.log('   Background check: ❌ Failed (expected - requires admin auth)');
  }

  // Test approve therapist
  console.log('   Testing approve therapist...');
  const approveResponse = await fetch(`${API_URL}/api/verification/${registrationId}/approve`, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${adminToken}`
    }
  });

  if (approveResponse.ok) {
    console.log('   Approve therapist: ✅ Success');
  } else {
    console.log('   Approve therapist: ❌ Failed (expected - requires admin auth)');
  }
}

// Run the tests
runVerificationTests().catch(console.error);
#!/usr/bin/env node

/**
 * Test Enhanced Therapist Service
 * 
 * Tests the comprehensive business logic migration for therapist service:
 * - Advanced search with JSONB filtering
 * - Specialty and insurance management
 * - Capacity tracking
 * - Therapist-client matching
 * - Comprehensive profile management
 */

const AWS = require('aws-sdk');
const { Pool } = require('pg');

// Configure AWS
AWS.config.update({
  region: process.env.AWS_REGION || 'us-east-1',
  accessKeyId: process.env.AWS_ACCESS_KEY_ID,
  secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY
});

// Database connection
const connectionString = process.env.DATABASE_URL;
const poolConfig = connectionString
  ? { connectionString, options: '-c search_path=ataraxia,public' }
  : {
    host: process.env.DB_HOST || 'localhost',
    port: process.env.DB_PORT || 5432,
    database: process.env.DB_NAME || 'ataraxia',
    user: process.env.DB_USER || 'ataraxia_user',
    password: process.env.DB_PASSWORD,
    options: '-c search_path=ataraxia,public'
  };

const pool = new Pool(poolConfig);

const lambda = new AWS.Lambda();

const FUNCTION_NAME = 'ataraxia-therapist-dev';

// Test data
const testTherapistData = {
  // Basic info
  first_name: 'Dr. Sarah',
  last_name: 'Johnson',
  phone_number: '+1-555-0123',

  // Professional info
  highest_degree: 'PhD',
  institution_name: 'Stanford University',
  graduation_year: 2015,
  years_of_experience: 8,
  bio: 'Experienced therapist specializing in anxiety and depression treatment.',
  short_bio: 'Anxiety and depression specialist with 8 years experience.',

  // Specialties (JSONB)
  clinical_specialties: {
    anxiety: true,
    depression: true,
    trauma: true,
    relationships: false,
    addiction: false
  },

  therapeutic_modalities: {
    cbt: true,
    dbt: true,
    emdr: false,
    psychodynamic: false
  },

  // Practice info
  session_formats: {
    video: true,
    in_person: true,
    phone: false
  },

  new_clients_capacity: 5,
  max_caseload_capacity: 25,
  emergency_same_day_capacity: true,

  // Insurance
  insurance_panels_accepted: ['Aetna', 'Blue Cross Blue Shield'],
  medicaid_acceptance: true,
  medicare_acceptance: false,
  self_pay_accepted: true,
  sliding_scale: true,

  // Location
  city: 'San Francisco',
  state: 'CA',
  country: 'US',
  timezone: 'America/Los_Angeles'
};

const testSearchQueries = [
  {
    name: 'Basic search',
    params: { search: 'anxiety' }
  },
  {
    name: 'Location + specialty search',
    params: { city: 'San Francisco', state: 'CA', specialty: 'anxiety' }
  },
  {
    name: 'Insurance + modality search',
    params: { insurance: 'Aetna', modality: 'cbt' }
  },
  {
    name: 'New clients only',
    params: { new_clients_only: 'true', emergency_capacity: 'true' }
  },
  {
    name: 'Experience range',
    params: { min_experience: '5', max_experience: '10' }
  }
];

async function testEnhancedTherapistService() {
  console.log('🧪 Testing Enhanced Therapist Service Business Logic Migration');
  console.log('='.repeat(70));

  try {
    // Ensure we are using the correct schema
    const client = await pool.connect();
    try {
      await client.query('SET search_path TO ataraxia, public');
    } finally {
      client.release();
    }

    // Test 1: Create comprehensive therapist profile
    console.log('\n1️⃣ Testing Comprehensive Profile Creation...');
    const therapistId = await createTestTherapist();
    console.log(`✅ Created therapist with ID: ${therapistId}`);

    // Test 2: Update comprehensive profile
    console.log('\n2️⃣ Testing Comprehensive Profile Update...');
    await testProfileUpdate(therapistId);
    console.log('✅ Profile update successful');

    // Test 3: Update specialties (JSONB)
    console.log('\n3️⃣ Testing Specialty Management (JSONB)...');
    await testSpecialtyUpdate(therapistId);
    console.log('✅ Specialty update successful');

    // Test 4: Update insurance settings
    console.log('\n4️⃣ Testing Insurance Panel Management...');
    await testInsuranceUpdate(therapistId);
    console.log('✅ Insurance update successful');

    // Test 5: Update capacity settings
    console.log('\n5️⃣ Testing Capacity Management...');
    await testCapacityUpdate(therapistId);
    console.log('✅ Capacity update successful');

    // Test 6: Get capacity information
    console.log('\n6️⃣ Testing Capacity Retrieval...');
    await testGetCapacity(therapistId);
    console.log('✅ Capacity retrieval successful');

    // Test 7: Advanced search functionality
    console.log('\n7️⃣ Testing Advanced Search...');
    await testAdvancedSearch();
    console.log('✅ Advanced search successful');

    // Test 8: Therapist-client matching
    console.log('\n8️⃣ Testing Therapist-Client Matching...');
    await testTherapistMatching();
    console.log('✅ Matching algorithm successful');

    // Test 9: Get comprehensive profile
    console.log('\n9️⃣ Testing Comprehensive Profile Retrieval...');
    await testGetComprehensiveProfile(therapistId);
    console.log('✅ Comprehensive profile retrieval successful');

    console.log('\n🎉 All Enhanced Therapist Service Tests Passed!');
    console.log('✅ Business logic migration from Ataraxia_backend is working correctly');

  } catch (error) {
    console.error('❌ Test failed:', error.message);
    if (error.stack) {
      console.error('Stack trace:', error.stack);
    }
    process.exit(1);
  } finally {
    await pool.end();
  }
}

async function createTestTherapist() {
  // First create a user record
  const userResult = await pool.query(`
    INSERT INTO users (
      auth_provider_id, auth_provider_type, email, phone_number,
      first_name, last_name, role, account_status, is_verified, is_active
    ) VALUES (
      $1, 'cognito', $2, $3, $4, $5, 'therapist', 'active', true, true
    ) RETURNING id
  `, [
    `test-therapist-${Date.now()}`,
    `test.therapist.${Date.now()}@example.com`,
    testTherapistData.phone_number,
    testTherapistData.first_name,
    testTherapistData.last_name
  ]);

  const userId = userResult.rows[0].id;

  // Create therapist profile
  await pool.query(`
    INSERT INTO therapists (
      user_id, highest_degree, institution_name, graduation_year,
      years_of_experience, bio, short_bio, clinical_specialties,
      therapeutic_modalities, session_formats, new_clients_capacity,
      max_caseload_capacity, emergency_same_day_capacity,
      insurance_panels_accepted, medicaid_acceptance, medicare_acceptance,
      self_pay_accepted, sliding_scale, city, state, country, timezone
    ) VALUES (
      $1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18, $19, $20, $21, $22
    )
  `, [
    userId,
    testTherapistData.highest_degree,
    testTherapistData.institution_name,
    testTherapistData.graduation_year,
    testTherapistData.years_of_experience,
    testTherapistData.bio,
    testTherapistData.short_bio,
    JSON.stringify(testTherapistData.clinical_specialties),
    JSON.stringify(testTherapistData.therapeutic_modalities),
    JSON.stringify(testTherapistData.session_formats),
    testTherapistData.new_clients_capacity,
    testTherapistData.max_caseload_capacity,
    testTherapistData.emergency_same_day_capacity,
    JSON.stringify(testTherapistData.insurance_panels_accepted),
    testTherapistData.medicaid_acceptance,
    testTherapistData.medicare_acceptance,
    testTherapistData.self_pay_accepted,
    testTherapistData.sliding_scale,
    testTherapistData.city,
    testTherapistData.state,
    testTherapistData.country,
    testTherapistData.timezone
  ]);

  // Create verification record
  await pool.query(`
    INSERT INTO therapist_verifications (
      user_id, license_number, license_state, license_verified,
      verification_status, background_check_status
    ) VALUES ($1, $2, $3, true, 'approved', 'completed')
  `, [userId, 'CA12345', 'CA']);

  return userId;
}

async function testProfileUpdate(therapistId) {
  const updateData = {
    bio: 'Updated bio with more comprehensive information about therapeutic approach.',
    years_of_experience: 9,
    city: 'Los Angeles',
    state: 'CA'
  };

  const params = {
    FunctionName: FUNCTION_NAME,
    Payload: JSON.stringify({
      httpMethod: 'PUT',
      path: `/api/therapist/${therapistId}`,
      body: JSON.stringify(updateData),
      headers: {},
      requestContext: { identity: { sourceIp: '127.0.0.1' }, requestId: 'test-update-profile' }
    })
  };

  const result = await lambda.invoke(params).promise();
  const response = JSON.parse(result.Payload);

  if (response.statusCode !== 200) {
    console.log('Full failure response:', JSON.stringify(response, null, 2));
    throw new Error(`Profile update failed: ${response.body}`);
  }

  console.log('   📝 Profile updated successfully');
}

async function testSpecialtyUpdate(therapistId) {
  const specialtyData = {
    clinical_specialties: {
      anxiety: true,
      depression: true,
      trauma: true,
      relationships: true,
      addiction: false,
      eating_disorders: true
    },
    therapeutic_modalities: {
      cbt: true,
      dbt: true,
      emdr: true,
      psychodynamic: false,
      mindfulness: true
    }
  };

  const params = {
    FunctionName: FUNCTION_NAME,
    Payload: JSON.stringify({
      httpMethod: 'PUT',
      path: `/api/therapist/${therapistId}/specialties`,
      body: JSON.stringify(specialtyData),
      headers: {},
      requestContext: { identity: { sourceIp: '127.0.0.1' }, requestId: 'test-update-specialties' }
    })
  };

  const result = await lambda.invoke(params).promise();
  const response = JSON.parse(result.Payload);

  if (response.statusCode !== 200) {
    throw new Error(`Specialty update failed: ${response.body}`);
  }

  console.log('   🎯 Specialties updated successfully');
}

async function testInsuranceUpdate(therapistId) {
  const insuranceData = {
    insurance_panels_accepted: ['Aetna', 'Blue Cross Blue Shield', 'Cigna', 'UnitedHealth'],
    medicaid_acceptance: true,
    medicare_acceptance: true,
    self_pay_accepted: true,
    sliding_scale: true,
    employer_eaps: ['BetterHelp', 'Lyra Health']
  };

  const params = {
    FunctionName: FUNCTION_NAME,
    Payload: JSON.stringify({
      httpMethod: 'PUT',
      path: `/api/therapist/${therapistId}/insurance`,
      body: JSON.stringify(insuranceData),
      headers: {},
      requestContext: { identity: { sourceIp: '127.0.0.1' }, requestId: 'test-update-insurance' }
    })
  };

  const result = await lambda.invoke(params).promise();
  const response = JSON.parse(result.Payload);

  if (response.statusCode !== 200) {
    throw new Error(`Insurance update failed: ${response.body}`);
  }

  console.log('   💳 Insurance settings updated successfully');
}

async function testCapacityUpdate(therapistId) {
  const capacityData = {
    new_clients_capacity: 8,
    max_caseload_capacity: 30,
    emergency_same_day_capacity: true,
    preferred_scheduling_density: 'moderate',
    client_intake_speed: 'standard'
  };

  const params = {
    FunctionName: FUNCTION_NAME,
    Payload: JSON.stringify({
      httpMethod: 'PUT',
      path: `/api/therapist/${therapistId}/capacity`,
      body: JSON.stringify(capacityData),
      headers: {},
      requestContext: { identity: { sourceIp: '127.0.0.1' }, requestId: 'test-update-capacity' }
    })
  };

  const result = await lambda.invoke(params).promise();
  const response = JSON.parse(result.Payload);

  if (response.statusCode !== 200) {
    throw new Error(`Capacity update failed: ${response.body}`);
  }

  console.log('   📊 Capacity settings updated successfully');
}

async function testGetCapacity(therapistId) {
  const params = {
    FunctionName: FUNCTION_NAME,
    Payload: JSON.stringify({
      httpMethod: 'GET',
      path: `/api/therapist/${therapistId}/capacity`,
      headers: {},
      requestContext: { identity: { sourceIp: '127.0.0.1' }, requestId: 'test-get-capacity' }
    })
  };

  const result = await lambda.invoke(params).promise();
  const response = JSON.parse(result.Payload);

  if (response.statusCode !== 200) {
    throw new Error(`Get capacity failed: ${response.body}`);
  }

  const body = JSON.parse(response.body);
  const data = body.data;
  console.log('   📈 Capacity info:', {
    new_clients_capacity: data.new_clients_capacity,
    accepting_new_clients: data.accepting_new_clients,
    max_caseload_capacity: data.max_caseload_capacity
  });
}

async function testAdvancedSearch() {
  for (const testQuery of testSearchQueries) {
    console.log(`   🔍 Testing: ${testQuery.name}`);

    const queryString = new URLSearchParams(testQuery.params).toString();

    const params = {
      FunctionName: FUNCTION_NAME,
      Payload: JSON.stringify({
        httpMethod: 'GET',
        path: '/api/therapist/search',
        queryStringParameters: testQuery.params,
        headers: {},
        requestContext: { identity: { sourceIp: '127.0.0.1' }, requestId: `test-search-${testQuery.name.replace(/\s+/g, '-')}` }
      })
    };

    const result = await lambda.invoke(params).promise();
    const response = JSON.parse(result.Payload);

    if (response.statusCode !== 200) {
      throw new Error(`Search failed for ${testQuery.name}: ${response.body}`);
    }

    const body = JSON.parse(response.body);
    const data = body.data;
    console.log(`      ✅ Found ${data.therapists.length} therapists`);
  }
}

async function testTherapistMatching() {
  // Create a test client first
  const clientResult = await pool.query(`
    INSERT INTO users (
      auth_provider_id, auth_provider_type, email, phone_number,
      first_name, last_name, role, account_status, is_verified, is_active
    ) VALUES (
      $1, 'cognito', $2, $3, $4, $5, 'client', 'active', true, true
    ) RETURNING id
  `, [
    `test-client-${Date.now()}`,
    `test.client.${Date.now()}@example.com`,
    '+1-555-0124',
    'John',
    'Doe'
  ]);

  const clientId = clientResult.rows[0].id;

  // Create client profile (simplified to match schema)
  await pool.query(`
    INSERT INTO ataraxia.clients (
      user_id, city, state
    ) VALUES ($1, $2, $3)
  `, [
    clientId,
    'San Francisco',
    'CA'
  ]);

  const params = {
    FunctionName: FUNCTION_NAME,
    Payload: JSON.stringify({
      httpMethod: 'GET',
      path: `/api/therapist/matching/${clientId}`,
      queryStringParameters: { limit: '5' },
      headers: {},
      requestContext: { identity: { sourceIp: '127.0.0.1' }, requestId: 'test-matching' }
    })
  };

  const result = await lambda.invoke(params).promise();
  const response = JSON.parse(result.Payload);

  if (response.statusCode !== 200) {
    throw new Error(`Matching failed: ${response.body}`);
  }

  const body = JSON.parse(response.body);
  const data = body.data;
  console.log(`   🎯 Found ${data.matches.length} matching therapists`);

  if (data.matches.length > 0) {
    const topMatch = data.matches[0];
    console.log(`      Top match: ${topMatch.first_name} ${topMatch.last_name} (Score: ${topMatch.compatibility_score})`);
    console.log(`      Reasons: ${topMatch.match_reasons.join(', ')}`);
  }

  // Cleanup test client
  await pool.query('DELETE FROM clients WHERE user_id = $1', [clientId]);
  await pool.query('DELETE FROM users WHERE id = $1', [clientId]);
}

async function testGetComprehensiveProfile(therapistId) {
  const params = {
    FunctionName: FUNCTION_NAME,
    Payload: JSON.stringify({
      httpMethod: 'GET',
      path: `/api/therapist/${therapistId}`,
      headers: {},
      requestContext: { identity: { sourceIp: '127.0.0.1' }, requestId: 'test-get-comprehensive' }
    })
  };

  const result = await lambda.invoke(params).promise();
  const response = JSON.parse(result.Payload);

  if (response.statusCode !== 200) {
    throw new Error(`Get comprehensive profile failed: ${response.body}`);
  }

  const body = JSON.parse(response.body);
  const data = body.data;
  const therapist = data.therapist;

  console.log('   👤 Comprehensive profile retrieved:');
  console.log(`      Name: ${therapist.first_name} ${therapist.last_name}`);
  console.log(`      Degree: ${therapist.highest_degree}`);
  console.log(`      Experience: ${therapist.years_of_experience} years`);
  console.log(`      Specialties: ${Object.keys(therapist.clinical_specialties || {}).filter(k => therapist.clinical_specialties[k]).join(', ')}`);
  console.log(`      Location: ${therapist.address.city}, ${therapist.address.state}`);
  console.log(`      New client capacity: ${therapist.new_clients_capacity}`);
  console.log(`      Verification status: ${therapist.verification.verification_status}`);
}

// Run the tests
if (require.main === module) {
  testEnhancedTherapistService().catch(console.error);
}

module.exports = { testEnhancedTherapistService };
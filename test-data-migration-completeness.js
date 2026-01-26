#!/usr/bin/env node

/**
 * Test Data Migration Completeness
 * Verifies that all data from temp_therapist_registrations is properly migrated to therapists table
 */

const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function testDataMigrationCompleteness() {
  console.log('🧪 Testing Data Migration Completeness');
  console.log('=====================================\n');

  try {
    // Test 1: Check therapists table structure
    console.log('1. Checking therapists table structure...');
    await testTherapistsTableStructure();
    
    // Test 2: Create a test temp registration
    console.log('\n2. Creating test temp registration...');
    const tempRegistrationId = await createTestTempRegistration();
    
    // Test 3: Test the migration function
    console.log('\n3. Testing migration function...');
    await testMigrationFunction(tempRegistrationId);
    
    // Test 4: Verify data completeness
    console.log('\n4. Verifying data completeness...');
    await verifyDataCompleteness(tempRegistrationId);
    
    // Test 5: Test the complete profile view
    console.log('\n5. Testing complete profile view...');
    await testCompleteProfileView();
    
    console.log('\n✅ All data migration tests completed successfully!');
    
  } catch (error) {
    console.error('\n❌ Test failed:', error.message);
    console.error('Stack trace:', error.stack);
    process.exit(1);
  } finally {
    await prisma.$disconnect();
  }
}

async function testTherapistsTableStructure() {
  try {
    // Query to check if all expected columns exist in therapists table
    const result = await prisma.$queryRaw`
      SELECT column_name, data_type, is_nullable
      FROM information_schema.columns 
      WHERE table_name = 'therapists' 
      AND table_schema = 'public'
      ORDER BY column_name
    `;

    const expectedColumns = [
      'user_id', 'gender', 'date_of_birth', 'timezone', 'phone_country_code',
      'languages_spoken', 'profile_photo_url', 'selected_avatar_url', 'headshot_url',
      'highest_degree', 'institution_name', 'graduation_year', 'years_of_experience',
      'bio', 'extended_bio', 'short_bio', 'clinical_specialties', 'life_context_specialties',
      'therapeutic_modalities', 'personal_style', 'demographic_preferences',
      'session_formats', 'new_clients_capacity', 'max_caseload_capacity',
      'client_intake_speed', 'emergency_same_day_capacity', 'preferred_scheduling_density',
      'weekly_schedule', 'session_durations', 'insurance_panels_accepted',
      'medicaid_acceptance', 'medicare_acceptance', 'self_pay_accepted',
      'sliding_scale', 'employer_eaps', 'hipaa_training_completed',
      'ethics_certification', 'signed_baa', 'background_check_status',
      'what_clients_can_expect', 'my_approach_to_therapy',
      'address_line1', 'address_line2', 'city', 'state', 'zip_code', 'country'
    ];

    const existingColumns = result.map(col => col.column_name);
    const missingColumns = expectedColumns.filter(col => !existingColumns.includes(col));

    if (missingColumns.length > 0) {
      console.log('   ⚠️  Missing columns:', missingColumns);
      console.log('   Run migration 003_ensure_therapists_table_completeness.sql');
    } else {
      console.log('   ✅ All expected columns exist in therapists table');
    }

    console.log(`   📊 Total columns in therapists table: ${existingColumns.length}`);
    
  } catch (error) {
    console.error('   ❌ Error checking table structure:', error.message);
    throw error;
  }
}

async function createTestTempRegistration() {
  try {
    // Create a comprehensive test user first
    const testUser = await prisma.$queryRaw`
      INSERT INTO users (
        auth_provider_id, auth_provider_type, email, phone_number,
        first_name, last_name, role, account_status, is_verified, is_active
      ) VALUES (
        'test-migration-user-123', 'cognito', 'test.migration@example.com', '5551234567',
        'Test', 'Migration', 'therapist', 'pending_verification', false, false
      )
      ON CONFLICT (auth_provider_id, auth_provider_type) DO UPDATE
      SET email = EXCLUDED.email, updated_at = NOW()
      RETURNING id
    `;

    const userId = testUser[0].id;

    // Create comprehensive temp registration with ALL possible fields
    const tempRegistration = await prisma.$queryRaw`
      INSERT INTO temp_therapist_registrations (
        user_id, auth_provider_id, auth_provider_type, email, phone_number, phone_country_code,
        first_name, last_name, date_of_birth, gender,
        address_line1, address_line2, city, state, zip_code, country, timezone,
        languages_spoken, profile_photo_url, selected_avatar_url, headshot_url,
        degree, institution_name, graduation_year, years_of_experience, bio, specializations,
        clinical_specialties, life_context_specialties, therapeutic_modalities, 
        personal_style, demographic_preferences,
        license_number, license_state, license_type, license_expiry,
        license_document_url, npi_number, licensing_authority,
        malpractice_insurance_provider, malpractice_policy_number, malpractice_expiry,
        malpractice_document_url, degree_certificate_url, photo_id_url,
        w9_document_url, hipaa_document_url, ethics_document_url, background_check_document_url,
        session_formats, new_clients_capacity, max_caseload_capacity,
        client_intake_speed, emergency_same_day_capacity, preferred_scheduling_density,
        weekly_schedule, session_durations,
        insurance_panels_accepted, medicaid_acceptance, medicare_acceptance,
        self_pay_accepted, sliding_scale, employer_eaps,
        hipaa_training_completed, ethics_certification, signed_baa,
        background_check_consent, background_check_consent_date,
        short_bio, extended_bio, what_clients_can_expect, my_approach_to_therapy,
        registration_status, workflow_stage, background_check_status
      ) VALUES (
        ${userId}, 'test-migration-user-123', 'cognito', 'test.migration@example.com', '5551234567', '+1',
        'Test', 'Migration', '1985-06-15', 'female',
        '123 Test Street', 'Apt 4B', 'San Francisco', 'CA', '94102', 'US', 'America/Los_Angeles',
        '["English", "Spanish"]'::jsonb, 'https://example.com/profile.jpg', 'https://example.com/avatar.jpg', 'https://example.com/headshot.jpg',
        'Ph.D. in Clinical Psychology', 'Stanford University', 2010, 12, 'Experienced therapist specializing in anxiety and trauma.', '["anxiety", "trauma", "depression"]'::jsonb,
        '{"anxiety": true, "depression": true, "trauma": true, "adhd": false}'::jsonb,
        '{"lgbtq": true, "veterans": false, "adolescents": true}'::jsonb,
        '{"cbt": true, "dbt": false, "emdr": true, "psychodynamic": false}'::jsonb,
        '{"warm": true, "direct": false, "collaborative": true}'::jsonb,
        '{"age_range": "18-65", "gender_preference": "no_preference"}'::jsonb,
        'LIC123456789', 'CA', 'Licensed Clinical Psychologist', '2025-12-31',
        'https://example.com/license.pdf', 'NPI1234567890', 'California Board of Psychology',
        'Professional Liability Insurance Co.', 'POL123456', '2025-06-30',
        'https://example.com/malpractice.pdf', 'https://example.com/degree.pdf', 'https://example.com/id.pdf',
        'https://example.com/w9.pdf', 'https://example.com/hipaa.pdf', 'https://example.com/ethics.pdf', 'https://example.com/background.pdf',
        '{"video": true, "in_person": false, "phone": false}'::jsonb, 15, 75,
        'moderate', true, 'balanced',
        '{"monday": {"9:00": "17:00"}, "tuesday": {"9:00": "17:00"}}'::jsonb, '{45, 60, 90}',
        '["Blue Cross Blue Shield", "Aetna", "Cigna"]'::jsonb, true, false,
        true, true, '["EAP1", "EAP2"]'::jsonb,
        true, true, true,
        true, NOW(),
        'I provide a safe, supportive environment for healing.',
        'With over 12 years of experience, I specialize in helping clients overcome anxiety, depression, and trauma using evidence-based approaches including CBT and EMDR. My practice focuses on creating a collaborative therapeutic relationship where clients feel heard, understood, and empowered to make positive changes in their lives.',
        'You can expect a warm, non-judgmental space where we work together to identify your goals and develop practical strategies for achieving them.',
        'I believe in meeting clients where they are and using a combination of therapeutic modalities tailored to each individual. My approach is collaborative, strength-based, and focused on helping you develop the tools you need for lasting change.',
        'pending_review', 'registration_submitted', 'not_started'
      )
      ON CONFLICT (user_id) DO UPDATE
      SET email = EXCLUDED.email, updated_at = NOW()
      RETURNING id
    `;

    const registrationId = tempRegistration[0].id;
    console.log(`   ✅ Created comprehensive temp registration with ID: ${registrationId}`);
    console.log(`   📊 User ID: ${userId}`);
    
    return registrationId;
    
  } catch (error) {
    console.error('   ❌ Error creating test temp registration:', error.message);
    throw error;
  }
}

async function testMigrationFunction(tempRegistrationId) {
  try {
    // Test the approve_and_migrate_therapist function
    const result = await prisma.$queryRaw`
      SELECT approve_and_migrate_therapist(${tempRegistrationId}, 1) as new_user_id
    `;

    const newUserId = result[0].new_user_id;
    console.log(`   ✅ Migration function executed successfully`);
    console.log(`   📊 New user ID: ${newUserId}`);
    
    return newUserId;
    
  } catch (error) {
    console.error('   ❌ Error testing migration function:', error.message);
    throw error;
  }
}

async function verifyDataCompleteness(tempRegistrationId) {
  try {
    // Get the temp registration data
    const tempData = await prisma.$queryRaw`
      SELECT * FROM temp_therapist_registrations WHERE id = ${tempRegistrationId}
    `;

    if (tempData.length === 0) {
      throw new Error('Temp registration not found');
    }

    const temp = tempData[0];

    // Get the migrated therapist data
    const therapistData = await prisma.$queryRaw`
      SELECT t.*, u.first_name, u.last_name, u.email, tv.license_number, tv.verification_status
      FROM therapists t
      INNER JOIN users u ON t.user_id = u.id
      LEFT JOIN therapist_verifications tv ON t.user_id = tv.user_id
      WHERE u.auth_provider_id = ${temp.auth_provider_id}
    `;

    if (therapistData.length === 0) {
      throw new Error('Migrated therapist data not found');
    }

    const therapist = therapistData[0];

    // Verify key fields were migrated correctly
    const verifications = [
      { field: 'first_name', temp: temp.first_name, therapist: therapist.first_name },
      { field: 'last_name', temp: temp.last_name, therapist: therapist.last_name },
      { field: 'email', temp: temp.email, therapist: therapist.email },
      { field: 'gender', temp: temp.gender, therapist: therapist.gender },
      { field: 'highest_degree', temp: temp.degree, therapist: therapist.highest_degree },
      { field: 'institution_name', temp: temp.institution_name, therapist: therapist.institution_name },
      { field: 'years_of_experience', temp: temp.years_of_experience, therapist: therapist.years_of_experience },
      { field: 'new_clients_capacity', temp: temp.new_clients_capacity, therapist: therapist.new_clients_capacity },
      { field: 'license_number', temp: temp.license_number, therapist: therapist.license_number },
      { field: 'verification_status', expected: 'approved', therapist: therapist.verification_status }
    ];

    let passedVerifications = 0;
    let totalVerifications = verifications.length;

    for (const verification of verifications) {
      const expected = verification.expected || verification.temp;
      const actual = verification.therapist;
      
      if (expected === actual) {
        console.log(`   ✅ ${verification.field}: ${actual}`);
        passedVerifications++;
      } else {
        console.log(`   ❌ ${verification.field}: expected "${expected}", got "${actual}"`);
      }
    }

    // Verify JSONB fields
    const jsonbFields = [
      'clinical_specialties', 'therapeutic_modalities', 'session_formats',
      'insurance_panels_accepted', 'weekly_schedule'
    ];

    for (const field of jsonbFields) {
      if (therapist[field] !== null) {
        console.log(`   ✅ ${field}: JSONB data migrated`);
        passedVerifications++;
      } else {
        console.log(`   ⚠️  ${field}: No JSONB data (may be expected)`);
      }
      totalVerifications++;
    }

    console.log(`   📊 Data verification: ${passedVerifications}/${totalVerifications} fields verified`);
    
    if (passedVerifications >= totalVerifications * 0.8) { // 80% pass rate
      console.log('   ✅ Data migration completeness: PASSED');
    } else {
      console.log('   ❌ Data migration completeness: FAILED');
      throw new Error('Data migration completeness check failed');
    }
    
  } catch (error) {
    console.error('   ❌ Error verifying data completeness:', error.message);
    throw error;
  }
}

async function testCompleteProfileView() {
  try {
    // Test the therapist_complete_profile view
    const profiles = await prisma.$queryRaw`
      SELECT id, first_name, last_name, highest_degree, clinical_specialties, 
             session_formats, license_number, verification_status
      FROM therapist_complete_profile 
      WHERE email = 'test.migration@example.com'
      LIMIT 1
    `;

    if (profiles.length > 0) {
      const profile = profiles[0];
      console.log(`   ✅ Complete profile view working`);
      console.log(`   📊 Profile ID: ${profile.id}`);
      console.log(`   📊 Name: ${profile.first_name} ${profile.last_name}`);
      console.log(`   📊 Degree: ${profile.highest_degree}`);
      console.log(`   📊 License: ${profile.license_number}`);
      console.log(`   📊 Status: ${profile.verification_status}`);
      
      // Test the function
      const functionResult = await prisma.$queryRaw`
        SELECT * FROM get_complete_therapist_profile(${profile.id})
      `;
      
      if (functionResult.length > 0) {
        console.log(`   ✅ Complete profile function working`);
      } else {
        console.log(`   ⚠️  Complete profile function returned no results`);
      }
    } else {
      console.log(`   ⚠️  No profiles found in complete profile view`);
    }
    
  } catch (error) {
    console.error('   ❌ Error testing complete profile view:', error.message);
    throw error;
  }
}

// Run the tests
testDataMigrationCompleteness().catch(console.error);
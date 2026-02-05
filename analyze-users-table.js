#!/usr/bin/env node

/**
 * Analyze users table structure and usage
 * Compare database schema with Prisma schema and identify unused columns
 */

const { PrismaClient } = require('@prisma/client');

async function analyzeUsersTable() {
  const prisma = new PrismaClient({
    datasources: {
      db: {
        url: 'postgresql://app_user:ChangeMe123!@dev-db-cluster.cluster-cliy2m6q8h4h.us-west-2.rds.amazonaws.com:5432/ataraxia_db?schema=ataraxia'
      }
    }
  });

  try {
    console.log('🔍 ANALYZING USERS TABLE STRUCTURE AND USAGE');
    console.log('==============================================');

    // 1. Get actual database schema for users table
    console.log('\n📊 1. ACTUAL DATABASE SCHEMA:');
    console.log('-----------------------------');
    
    const dbColumns = await prisma.$queryRaw`
      SELECT 
        column_name,
        data_type,
        is_nullable,
        column_default,
        character_maximum_length
      FROM information_schema.columns 
      WHERE table_name = 'users' 
        AND table_schema = 'ataraxia'
      ORDER BY ordinal_position;
    `;

    dbColumns.forEach(col => {
      console.log(`${col.column_name}: ${col.data_type}${col.character_maximum_length ? `(${col.character_maximum_length})` : ''} ${col.is_nullable === 'YES' ? 'NULL' : 'NOT NULL'}`);
    });

    // 2. Check which columns have actual data
    console.log('\n📈 2. COLUMNS WITH DATA (non-null values):');
    console.log('------------------------------------------');
    
    const sampleUsers = await prisma.users.findMany({
      take: 5,
      orderBy: { id: 'asc' }
    });

    if (sampleUsers.length > 0) {
      const firstUser = sampleUsers[0];
      const columnsWithData = [];
      const columnsEmpty = [];

      Object.keys(firstUser).forEach(key => {
        const hasData = sampleUsers.some(user => user[key] !== null && user[key] !== undefined && user[key] !== '');
        if (hasData) {
          columnsWithData.push(key);
        } else {
          columnsEmpty.push(key);
        }
      });

      console.log('\n✅ Columns with data:');
      columnsWithData.forEach(col => console.log(`  - ${col}`));

      console.log('\n❌ Columns always empty/null:');
      columnsEmpty.forEach(col => console.log(`  - ${col}`));
    }

    // 3. Analyze authentication-specific columns
    console.log('\n🔐 3. AUTHENTICATION COLUMNS ANALYSIS:');
    console.log('-------------------------------------');

    const authColumns = {
      'CORE_AUTH': [
        'id', 'email', 'password_hash', 'role', 'account_status', 'is_active'
      ],
      'FIREBASE_AUTH': [
        'firebase_uid', 'auth_provider_id', 'auth_provider_type', 'current_auth_provider'
      ],
      'COGNITO_AUTH': [
        'auth_provider_metadata'
      ],
      'MFA_AUTH': [
        'mfa_enabled'
      ],
      'SESSION_AUTH': [
        'last_login_at', 'last_login', 'login_count', 'failed_login_attempts', 
        'last_failed_login', 'account_locked_until', 'last_login_ip'
      ],
      'EMAIL_VERIFICATION': [
        'email_verified', 'email_verified_at'
      ],
      'PHONE_VERIFICATION': [
        'phone_number', 'country_code', 'phone_verified'
      ],
      'BASIC_PROFILE': [
        'first_name', 'last_name', 'preferred_name', 'display_name'
      ],
      'BUSINESS_LOGIC': [
        'organization_id', 'middle_name', 'profile_image_url', 'avatar_url',
        'onboarding_step', 'onboarding_status', 'onboarding_session_id',
        'marketing_consent', 'referral_source', 'signup_source', 'signup_platform',
        'signup_device_info', 'is_verified', 'verified_at', 'verified_by',
        'verification_stage', 'primary_user_id', 'user_timezone', 'language',
        'deleted_at', 'auth_methods', 'terms_accepted_at', 'terms_version',
        'is_org_owner', 'is_anonymized', 'anonymized_at', 'anonymization_reason'
      ]
    };

    Object.entries(authColumns).forEach(([category, columns]) => {
      console.log(`\n${category}:`);
      columns.forEach(col => {
        const hasData = sampleUsers.some(user => user[col] !== null && user[col] !== undefined && user[col] !== '');
        console.log(`  ${hasData ? '✅' : '❌'} ${col}`);
      });
    });

    // 4. Check foreign key relationships
    console.log('\n🔗 4. FOREIGN KEY RELATIONSHIPS:');
    console.log('-------------------------------');
    
    const fkQuery = await prisma.$queryRaw`
      SELECT 
        tc.constraint_name,
        kcu.column_name,
        ccu.table_name AS foreign_table_name,
        ccu.column_name AS foreign_column_name
      FROM information_schema.table_constraints AS tc
      JOIN information_schema.key_column_usage AS kcu
        ON tc.constraint_name = kcu.constraint_name
      JOIN information_schema.constraint_column_usage AS ccu
        ON ccu.constraint_name = tc.constraint_name
      WHERE tc.constraint_type = 'FOREIGN KEY'
        AND tc.table_name = 'users'
        AND tc.table_schema = 'ataraxia';
    `;

    fkQuery.forEach(fk => {
      console.log(`  ${fk.column_name} -> ${fk.foreign_table_name}.${fk.foreign_column_name}`);
    });

    // 5. Recommendations
    console.log('\n💡 5. RECOMMENDATIONS FOR USERS TABLE CLEANUP:');
    console.log('----------------------------------------------');

    console.log('\n🟢 KEEP (Essential for Authentication):');
    const keepColumns = [
      'id', 'email', 'password_hash', 'first_name', 'last_name', 'role',
      'firebase_uid', 'auth_provider_type', 'current_auth_provider', 'auth_provider_id',
      'mfa_enabled', 'email_verified', 'email_verified_at', 'phone_verified',
      'account_status', 'is_active', 'last_login_at', 'login_count',
      'failed_login_attempts', 'last_failed_login', 'account_locked_until',
      'created_at', 'updated_at'
    ];
    keepColumns.forEach(col => console.log(`  ✅ ${col}`));

    console.log('\n🟡 MOVE TO SEPARATE TABLES:');
    const moveColumns = {
      'user_profiles': [
        'middle_name', 'preferred_name', 'display_name', 'profile_image_url', 
        'avatar_url', 'user_timezone', 'language', 'phone_number', 'country_code'
      ],
      'user_onboarding': [
        'onboarding_step', 'onboarding_status', 'onboarding_session_id'
      ],
      'user_marketing': [
        'marketing_consent', 'referral_source', 'signup_source', 'signup_platform',
        'signup_device_info'
      ],
      'user_verification': [
        'is_verified', 'verified_at', 'verified_by', 'verification_stage'
      ],
      'user_organization': [
        'organization_id', 'is_org_owner', 'primary_user_id'
      ],
      'user_compliance': [
        'terms_accepted_at', 'terms_version', 'is_anonymized', 'anonymized_at',
        'anonymization_reason', 'deleted_at'
      ]
    };

    Object.entries(moveColumns).forEach(([table, columns]) => {
      console.log(`\n  📋 ${table}:`);
      columns.forEach(col => console.log(`    - ${col}`));
    });

    console.log('\n🔴 REMOVE (Redundant/Unused):');
    const removeColumns = [
      'auth_methods', 'auth_provider_metadata', 'last_login', 'last_login_ip'
    ];
    removeColumns.forEach(col => console.log(`  ❌ ${col}`));

  } catch (error) {
    console.error('❌ Analysis failed:', error.message);
  } finally {
    await prisma.$disconnect();
  }
}

analyzeUsersTable();
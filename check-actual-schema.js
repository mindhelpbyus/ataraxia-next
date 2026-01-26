#!/usr/bin/env node

/**
 * Check Actual Database Schema
 * 
 * This script connects to the database and shows the actual column structure
 * so we can create a handler that works with the real schema.
 */

const { Pool } = require('pg');

const DATABASE_URL = 'postgresql://app_user:ChangeMe123!@dev-db-cluster.cluster-cliy2m6q8h4h.us-west-2.rds.amazonaws.com:5432/ataraxia_db?schema=ataraxia';

async function checkSchema() {
  const pool = new Pool({
    connectionString: DATABASE_URL,
    ssl: { rejectUnauthorized: false }
  });

  try {
    console.log('🔍 Checking actual database schema...');
    console.log('');

    // Set search path to ataraxia schema
    await pool.query('SET search_path TO ataraxia, public');

    // Check users table columns
    console.log('📋 USERS table columns:');
    const usersColumns = await pool.query(`
      SELECT column_name, data_type, is_nullable 
      FROM information_schema.columns 
      WHERE table_name = 'users' AND table_schema = 'ataraxia'
      ORDER BY ordinal_position;
    `);
    usersColumns.rows.forEach(row => {
      console.log(`  • ${row.column_name} (${row.data_type}) ${row.is_nullable === 'YES' ? 'NULL' : 'NOT NULL'}`);
    });
    console.log('');

    // Check therapists table columns
    console.log('📋 THERAPISTS table columns:');
    const therapistsColumns = await pool.query(`
      SELECT column_name, data_type, is_nullable 
      FROM information_schema.columns 
      WHERE table_name = 'therapists' AND table_schema = 'ataraxia'
      ORDER BY ordinal_position;
    `);
    therapistsColumns.rows.forEach(row => {
      console.log(`  • ${row.column_name} (${row.data_type}) ${row.is_nullable === 'YES' ? 'NULL' : 'NOT NULL'}`);
    });
    console.log('');

    // Check organizations table columns
    console.log('📋 ORGANIZATIONS table columns:');
    const orgsColumns = await pool.query(`
      SELECT column_name, data_type, is_nullable 
      FROM information_schema.columns 
      WHERE table_name = 'organizations' AND table_schema = 'ataraxia'
      ORDER BY ordinal_position;
    `);
    orgsColumns.rows.forEach(row => {
      console.log(`  • ${row.column_name} (${row.data_type}) ${row.is_nullable === 'YES' ? 'NULL' : 'NOT NULL'}`);
    });
    console.log('');

    // Check therapist_verifications table columns
    console.log('📋 THERAPIST_VERIFICATIONS table columns:');
    const verificationsColumns = await pool.query(`
      SELECT column_name, data_type, is_nullable 
      FROM information_schema.columns 
      WHERE table_name = 'therapist_verifications' AND table_schema = 'ataraxia'
      ORDER BY ordinal_position;
    `);
    verificationsColumns.rows.forEach(row => {
      console.log(`  • ${row.column_name} (${row.data_type}) ${row.is_nullable === 'YES' ? 'NULL' : 'NOT NULL'}`);
    });
    console.log('');

    // Sample data from therapists table
    console.log('📊 Sample therapist data:');
    const sampleData = await pool.query(`
      SELECT u.id, u.first_name, u.last_name, u.email, 
             tp.* 
      FROM users u 
      INNER JOIN therapists tp ON u.id = tp.user_id 
      WHERE u.role = 'therapist' 
      LIMIT 1;
    `);
    
    if (sampleData.rows.length > 0) {
      const sample = sampleData.rows[0];
      console.log('  Available columns in actual data:');
      Object.keys(sample).forEach(key => {
        const value = sample[key];
        const type = typeof value;
        const preview = value ? String(value).substring(0, 50) : 'null';
        console.log(`    • ${key}: ${type} = "${preview}${String(value).length > 50 ? '...' : ''}"`);
      });
    }
    console.log('');

    console.log('✅ Schema analysis complete!');
    
  } catch (error) {
    console.error('❌ Schema check failed:', error.message);
  } finally {
    await pool.end();
  }
}

checkSchema().catch(console.error);
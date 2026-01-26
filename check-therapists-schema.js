#!/usr/bin/env node

/**
 * Check Therapists Table Schema
 * Verifies what columns exist in the therapists table
 */

const { Client } = require('pg');

const client = new Client({
  host: 'dev-db-cluster.cluster-cliy2m6q8h4h.us-west-2.rds.amazonaws.com',
  port: 5432,
  database: 'ataraxia_db',
  user: 'app_user',
  password: 'ChangeMe123!',
  ssl: { rejectUnauthorized: false }
});

async function checkSchema() {
  try {
    await client.connect();
    await client.query('SET search_path TO ataraxia, public');
    
    console.log('🔍 Checking therapists table columns...');
    const result = await client.query(`
      SELECT column_name, data_type, is_nullable 
      FROM information_schema.columns 
      WHERE table_schema = 'ataraxia' AND table_name = 'therapists'
      ORDER BY ordinal_position
    `);
    
    console.log('📊 Current therapists table columns:');
    result.rows.forEach(row => {
      console.log(`  - ${row.column_name} (${row.data_type})`);
    });
    
    // Check if gender column exists
    const hasGender = result.rows.some(row => row.column_name === 'gender');
    console.log(`\n🎯 Gender column exists: ${hasGender ? '✅ YES' : '❌ NO'}`);
    
    // Check for other critical columns
    const criticalColumns = ['bio_short', 'bio_extended', 'short_bio', 'extended_bio', 'approach_description', 'what_to_expect_description'];
    console.log('\n🔍 Critical columns check:');
    criticalColumns.forEach(col => {
      const exists = result.rows.some(row => row.column_name === col);
      console.log(`  - ${col}: ${exists ? '✅' : '❌'}`);
    });
    
  } catch (error) {
    console.error('❌ Error:', error.message);
  } finally {
    await client.end();
  }
}

checkSchema();
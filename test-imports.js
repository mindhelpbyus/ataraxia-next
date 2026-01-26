#!/usr/bin/env node

/**
 * Test imports to verify all modules are working correctly
 */

console.log('🔍 Testing imports...');

try {
  // Test auth module
  const auth = require('./dist/shared/auth');
  console.log('✅ Auth module imported successfully');
  console.log('   Available functions:', Object.keys(auth));

  // Test response module
  const response = require('./dist/shared/response');
  console.log('✅ Response module imported successfully');
  console.log('   Available functions:', Object.keys(response));

  // Test logger module
  const logger = require('./dist/shared/logger');
  console.log('✅ Logger module imported successfully');
  console.log('   Available functions:', Object.keys(logger));

  // Test database module
  const database = require('./dist/lib/database');
  console.log('✅ Database module imported successfully');
  console.log('   Available functions:', Object.keys(database));

  console.log('\n🎉 All imports working correctly!');

} catch (error) {
  console.error('❌ Import error:', error.message);
  process.exit(1);
}
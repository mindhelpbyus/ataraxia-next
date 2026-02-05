#!/usr/bin/env node

/**
 * Check which users table columns are actually used in authentication code
 */

const fs = require('fs');
const path = require('path');

function searchInFile(filePath, searchTerms) {
  try {
    const content = fs.readFileSync(filePath, 'utf8');
    const found = [];
    
    searchTerms.forEach(term => {
      if (content.includes(term)) {
        const lines = content.split('\n');
        lines.forEach((line, index) => {
          if (line.includes(term)) {
            found.push({
              term,
              line: index + 1,
              content: line.trim()
            });
          }
        });
      }
    });
    
    return found;
  } catch (error) {
    return [];
  }
}

function searchInDirectory(dir, searchTerms, extensions = ['.ts', '.js']) {
  const results = {};
  
  function walkDir(currentDir) {
    const files = fs.readdirSync(currentDir);
    
    files.forEach(file => {
      const filePath = path.join(currentDir, file);
      const stat = fs.statSync(filePath);
      
      if (stat.isDirectory() && !file.startsWith('.') && file !== 'node_modules') {
        walkDir(filePath);
      } else if (stat.isFile() && extensions.some(ext => file.endsWith(ext))) {
        const found = searchInFile(filePath, searchTerms);
        if (found.length > 0) {
          results[filePath] = found;
        }
      }
    });
  }
  
  walkDir(dir);
  return results;
}

function analyzeColumnUsage() {
  console.log('🔍 ANALYZING USERS TABLE COLUMN USAGE IN AUTH CODE');
  console.log('==================================================');

  // All users table columns from the database analysis
  const allColumns = [
    'id', 'organization_id', 'email', 'password_hash', 'first_name', 'middle_name',
    'last_name', 'preferred_name', 'role', 'phone_number', 'country_code',
    'profile_image_url', 'is_active', 'last_login_at', 'firebase_uid', 'mfa_enabled',
    'onboarding_step', 'onboarding_status', 'onboarding_session_id', 'marketing_consent',
    'referral_source', 'created_at', 'updated_at', 'email_verified', 'email_verified_at',
    'signup_source', 'signup_platform', 'signup_device_info', 'account_status',
    'is_verified', 'verified_at', 'verified_by', 'verification_stage', 'primary_user_id',
    'display_name', 'user_timezone', 'language', 'last_login_ip', 'deleted_at',
    'avatar_url', 'auth_methods', 'terms_accepted_at', 'terms_version', 'is_org_owner',
    'auth_provider_id', 'auth_provider_type', 'auth_provider_metadata',
    'current_auth_provider', 'phone_verified', 'last_login', 'login_count',
    'failed_login_attempts', 'last_failed_login', 'account_locked_until',
    'is_anonymized', 'anonymized_at', 'anonymization_reason'
  ];

  // Search in authentication-related directories
  const searchDirs = [
    'Ataraxia-Next/src/lib/auth',
    'Ataraxia-Next/src/lambdas/auth',
    'Ataraxia-Next/src/lib/prismaAuthService.ts'
  ];

  const usageResults = {};
  
  searchDirs.forEach(dir => {
    if (fs.existsSync(dir)) {
      console.log(`\n📂 Searching in: ${dir}`);
      const results = searchInDirectory(dir, allColumns);
      Object.assign(usageResults, results);
    }
  });

  // Analyze usage patterns
  const columnUsage = {};
  allColumns.forEach(col => {
    columnUsage[col] = {
      files: [],
      count: 0,
      contexts: []
    };
  });

  Object.entries(usageResults).forEach(([file, findings]) => {
    findings.forEach(finding => {
      const col = finding.term;
      if (columnUsage[col]) {
        columnUsage[col].files.push(file);
        columnUsage[col].count++;
        columnUsage[col].contexts.push({
          file: file.replace('Ataraxia-Next/', ''),
          line: finding.line,
          content: finding.content
        });
      }
    });
  });

  // Categorize columns by usage
  const categories = {
    'HEAVILY_USED': [],
    'MODERATELY_USED': [],
    'RARELY_USED': [],
    'NEVER_USED': []
  };

  Object.entries(columnUsage).forEach(([col, usage]) => {
    if (usage.count >= 10) {
      categories.HEAVILY_USED.push({ col, ...usage });
    } else if (usage.count >= 5) {
      categories.MODERATELY_USED.push({ col, ...usage });
    } else if (usage.count >= 1) {
      categories.RARELY_USED.push({ col, ...usage });
    } else {
      categories.NEVER_USED.push({ col, ...usage });
    }
  });

  // Display results
  console.log('\n📊 COLUMN USAGE ANALYSIS:');
  console.log('========================');

  Object.entries(categories).forEach(([category, columns]) => {
    console.log(`\n🏷️  ${category} (${columns.length} columns):`);
    
    columns.forEach(({ col, count, files, contexts }) => {
      console.log(`  ${col}: ${count} usages in ${[...new Set(files)].length} files`);
      
      if (count > 0 && count <= 3) {
        contexts.forEach(ctx => {
          console.log(`    - ${ctx.file}:${ctx.line}: ${ctx.content.substring(0, 80)}...`);
        });
      }
    });
  });

  // Final recommendations
  console.log('\n💡 FINAL RECOMMENDATIONS:');
  console.log('=========================');

  console.log('\n🟢 ESSENTIAL FOR AUTH (Keep in users table):');
  const essential = categories.HEAVILY_USED.concat(categories.MODERATELY_USED)
    .filter(({ col }) => [
      'id', 'email', 'password_hash', 'role', 'firebase_uid', 'auth_provider_type',
      'current_auth_provider', 'auth_provider_id', 'mfa_enabled', 'email_verified',
      'account_status', 'is_active', 'last_login_at', 'login_count',
      'failed_login_attempts', 'created_at', 'updated_at'
    ].includes(col))
    .map(({ col }) => col);

  essential.forEach(col => console.log(`  ✅ ${col}`));

  console.log('\n🟡 PROFILE DATA (Move to user_profiles table):');
  const profileCols = ['first_name', 'last_name', 'phone_number', 'country_code', 'profile_image_url'];
  profileCols.forEach(col => console.log(`  📋 ${col}`));

  console.log('\n🔴 UNUSED/BUSINESS LOGIC (Remove or move to other tables):');
  categories.NEVER_USED.concat(categories.RARELY_USED)
    .filter(({ col }) => !essential.includes(col) && !profileCols.includes(col))
    .forEach(({ col }) => console.log(`  ❌ ${col}`));
}

analyzeColumnUsage();
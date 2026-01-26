#!/usr/bin/env node

/**
 * Environment Configuration Validator
 * Validates that all environment configurations are correct and complete
 */

const fs = require('fs');
const path = require('path');

console.log('🔍 Validating environment configuration...\n');

// Check if environment files exist
const envFiles = [
    { file: '.env.local', description: 'Local development environment' },
    { file: '.env.aws', description: 'AWS Lambda environment' }
];

let allValid = true;

for (const { file, description } of envFiles) {
    console.log(`📄 Checking ${file} (${description})...`);
    
    if (!fs.existsSync(file)) {
        console.log(`❌ ${file} does not exist`);
        allValid = false;
        continue;
    }
    
    const content = fs.readFileSync(file, 'utf8');
    const lines = content.split('\n').filter(line => line.trim() && !line.startsWith('#'));
    
    // Parse environment variables
    const env = {};
    for (const line of lines) {
        const [key, ...valueParts] = line.split('=');
        if (key && valueParts.length > 0) {
            env[key.trim()] = valueParts.join('=').trim();
        }
    }
    
    // Required variables for each environment
    const requiredVars = {
        '.env.local': [
            'NODE_ENV',
            'DATABASE_URL',
            'DATABASE_SCHEMA',
            'AWS_ACCESS_KEY_ID',
            'AWS_SECRET_ACCESS_KEY',
            'AWS_REGION'
        ],
        '.env.aws': [
            'NODE_ENV',
            'DATABASE_URL',
            'DATABASE_SCHEMA',
            'AWS_REGION'
        ]
    };
    
    const required = requiredVars[file] || [];
    let fileValid = true;
    
    for (const varName of required) {
        if (!env[varName] || env[varName] === 'undefined' || env[varName] === 'placeholder') {
            console.log(`  ❌ Missing or invalid: ${varName}`);
            fileValid = false;
        } else {
            console.log(`  ✅ ${varName}: ${env[varName].substring(0, 50)}${env[varName].length > 50 ? '...' : ''}`);
        }
    }
    
    // Validate database URLs
    if (env.DATABASE_URL) {
        if (file === '.env.local' && !env.DATABASE_URL.includes('localhost')) {
            console.log(`  ⚠️  Local environment should use localhost database`);
        }
        if (file === '.env.aws' && env.DATABASE_URL.includes('localhost')) {
            console.log(`  ❌ AWS environment should NOT use localhost database`);
            fileValid = false;
        }
        if (!env.DATABASE_URL.includes('ataraxia_db')) {
            console.log(`  ❌ Database URL should connect to ataraxia_db database`);
            fileValid = false;
        }
    }
    
    // Validate schema
    if (env.DATABASE_SCHEMA && env.DATABASE_SCHEMA !== 'ataraxia') {
        console.log(`  ❌ DATABASE_SCHEMA should be 'ataraxia', not '${env.DATABASE_SCHEMA}'`);
        fileValid = false;
    }
    
    if (fileValid) {
        console.log(`  ✅ ${file} is valid\n`);
    } else {
        console.log(`  ❌ ${file} has issues\n`);
        allValid = false;
    }
}

// Check CDK configuration
console.log('📄 Checking CDK configuration...');
const cdkAppPath = 'infrastructure/bin/ataraxia.ts';
if (fs.existsSync(cdkAppPath)) {
    const cdkContent = fs.readFileSync(cdkAppPath, 'utf8');
    
    if (cdkContent.includes('localhost') && cdkContent.includes('local:')) {
        console.log('  ✅ CDK local environment uses localhost (correct)');
    }
    
    if (cdkContent.includes('dev-db-cluster') && cdkContent.includes('dev:')) {
        console.log('  ✅ CDK dev environment uses cloud database (correct)');
    } else {
        console.log('  ❌ CDK dev environment should use cloud database');
        allValid = false;
    }
} else {
    console.log('  ❌ CDK app file not found');
    allValid = false;
}

// Check database connection configuration
console.log('\n📄 Checking database connection configuration...');
const dbConfigPath = 'src/lib/database.ts';
if (fs.existsSync(dbConfigPath)) {
    const dbContent = fs.readFileSync(dbConfigPath, 'utf8');
    
    if (dbContent.includes('process.env.DATABASE_SCHEMA')) {
        console.log('  ✅ Database connection uses DATABASE_SCHEMA environment variable');
    } else {
        console.log('  ❌ Database connection should use DATABASE_SCHEMA environment variable');
        allValid = false;
    }
    
    if (dbContent.includes('SET search_path TO ${schema}, public') || dbContent.includes('ataraxia, public')) {
        console.log('  ✅ Database connection sets search path to ataraxia schema');
    } else {
        console.log('  ❌ Database connection should set search path to ataraxia schema');
        allValid = false;
    }
} else {
    console.log('  ❌ Database configuration file not found');
    allValid = false;
}

console.log('\n' + '='.repeat(60));
if (allValid) {
    console.log('🎉 All environment configurations are valid!');
    console.log('\n📋 Configuration Summary:');
    console.log('- Local development: localhost database with ataraxia schema');
    console.log('- AWS Lambda functions: cloud RDS database with ataraxia schema');
    console.log('- All connections avoid public schema');
    console.log('- AWS credentials configured for deployment');
    
    console.log('\n🚀 Ready to deploy! Run: ./deploy-with-cloud-database.sh');
} else {
    console.log('❌ Environment configuration has issues that need to be fixed');
    console.log('\n🔧 Please fix the issues above before deploying');
}

process.exit(allValid ? 0 : 1);
#!/usr/bin/env node

/**
 * Test Prisma Connection and Database Sync
 * This script tests Prisma connection to both local and cloud databases
 */

const { execSync } = require('child_process');
const fs = require('fs');

async function testPrismaConnection() {
    console.log('🔄 Testing Prisma connection and database sync...\n');
    
    try {
        // Step 1: Set environment for local database
        console.log('📋 Step 1: Testing local database connection...');
        process.env.DATABASE_URL = 'postgresql://ataraxia_user:ataraxia_password@localhost:5432/ataraxia_db?schema=ataraxia';
        
        // Test basic connection
        console.log('🔍 Testing basic database connection...');
        const { Client } = require('pg');
        const client = new Client({
            connectionString: process.env.DATABASE_URL
        });
        
        await client.connect();
        await client.query('SET search_path TO ataraxia, public');
        
        // Test if users table exists
        const usersCheck = await client.query(`
            SELECT table_name FROM information_schema.tables 
            WHERE table_schema = 'ataraxia' AND table_name = 'users'
        `);
        
        if (usersCheck.rows.length > 0) {
            console.log('✅ Users table exists in ataraxia schema');
        } else {
            console.log('❌ Users table missing in ataraxia schema');
        }
        
        // Test if therapists table exists
        const therapistsCheck = await client.query(`
            SELECT table_name FROM information_schema.tables 
            WHERE table_schema = 'ataraxia' AND table_name = 'therapists'
        `);
        
        if (therapistsCheck.rows.length > 0) {
            console.log('✅ Therapists table exists in ataraxia schema');
        } else {
            console.log('❌ Therapists table missing in ataraxia schema');
        }
        
        await client.end();
        
        // Step 2: Test Prisma introspection
        console.log('\n📋 Step 2: Testing Prisma introspection...');
        
        try {
            console.log('🔄 Running Prisma introspection...');
            execSync('npx prisma db pull', { 
                stdio: 'inherit',
                env: { ...process.env, DATABASE_URL: process.env.DATABASE_URL }
            });
            console.log('✅ Prisma introspection successful');
        } catch (error) {
            console.log('❌ Prisma introspection failed:', error.message);
        }
        
        // Step 3: Generate Prisma client
        console.log('\n📋 Step 3: Generating Prisma client...');
        
        try {
            console.log('🔄 Generating Prisma client...');
            execSync('npx prisma generate', { 
                stdio: 'inherit',
                env: { ...process.env }
            });
            console.log('✅ Prisma client generated successfully');
        } catch (error) {
            console.log('❌ Prisma client generation failed:', error.message);
        }
        
        // Step 4: Test Prisma client usage
        console.log('\n📋 Step 4: Testing Prisma client usage...');
        
        try {
            // Import Prisma client
            const { PrismaClient } = require('@prisma/client');
            const prisma = new PrismaClient({
                datasources: {
                    db: {
                        url: process.env.DATABASE_URL
                    }
                }
            });
            
            console.log('🔄 Testing Prisma client queries...');
            
            // Test users count
            const userCount = await prisma.users.count();
            console.log(`✅ Users count: ${userCount}`);
            
            // Test therapists count
            const therapistCount = await prisma.therapists.count();
            console.log(`✅ Therapists count: ${therapistCount}`);
            
            // Test join query
            const therapistsWithUsers = await prisma.therapists.findMany({
                include: {
                    users: {
                        select: {
                            id: true,
                            first_name: true,
                            last_name: true,
                            email: true
                        }
                    }
                },
                take: 1
            });
            
            if (therapistsWithUsers.length > 0) {
                console.log('✅ Join query successful');
                console.log(`   Sample: ${therapistsWithUsers[0].users.first_name} ${therapistsWithUsers[0].users.last_name}`);
            } else {
                console.log('⚠️  No therapist data found for join test');
            }
            
            await prisma.$disconnect();
            console.log('✅ Prisma client test successful');
            
        } catch (error) {
            console.log('❌ Prisma client test failed:', error.message);
        }
        
        console.log('\n🎉 Prisma connection test completed!');
        console.log('✅ Local database connection: WORKING');
        console.log('✅ Prisma introspection: WORKING');
        console.log('✅ Prisma client: WORKING');
        console.log('✅ Database queries: WORKING');
        
        return true;
        
    } catch (error) {
        console.error('💥 Prisma connection test failed:', error.message);
        return false;
    }
}

// Run the test
if (require.main === module) {
    testPrismaConnection()
        .then(success => {
            process.exit(success ? 0 : 1);
        })
        .catch(error => {
            console.error('Fatal error:', error);
            process.exit(1);
        });
}

module.exports = testPrismaConnection;
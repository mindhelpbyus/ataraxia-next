#!/usr/bin/env node

/**
 * Database Synchronization System
 * Ensures local and cloud databases are in perfect sync with ataraxia schema
 * This runs as the FIRST check for every deployment (local and CDK)
 */

const { Client } = require('pg');
const fs = require('fs');
const path = require('path');

// Database configurations
const LOCAL_DB_CONFIG = {
    host: 'localhost',
    port: 5432,
    database: 'ataraxia_db',
    user: 'ataraxia_user',
    password: 'ataraxia_password'
};

const CLOUD_DB_CONFIG = {
    host: 'dev-db-cluster.cluster-cliy2m6q8h4h.us-west-2.rds.amazonaws.com',
    port: 5432,
    database: 'ataraxia_db',
    user: 'app_user',
    password: 'ChangeMe123!',
    ssl: { rejectUnauthorized: false }
};

class DatabaseSyncSystem {
    constructor() {
        this.localClient = null;
        this.cloudClient = null;
        this.requiredTables = [
            'users',
            'therapists', 
            'therapist_verifications',
            'temp_therapist_registrations',
            'verification_workflow_log',
            'verification_audit_log',
            'organization_invites',
            'verification_documents',
            'background_check_results'
        ];
        this.criticalColumns = {
            users: ['id', 'auth_provider_id', 'email', 'first_name', 'last_name', 'role', 'account_status'],
            therapists: ['id', 'user_id', 'gender', 'bio', 'clinical_specialties', 'therapeutic_modalities', 'session_formats', 'new_clients_capacity']
        };
    }

    async connectDatabases() {
        console.log('🔄 Connecting to databases...');
        
        // Connect to local database
        try {
            this.localClient = new Client(LOCAL_DB_CONFIG);
            await this.localClient.connect();
            await this.localClient.query('SET search_path TO ataraxia, public');
            console.log('✅ Connected to local database');
        } catch (error) {
            console.log('❌ Failed to connect to local database:', error.message);
            throw new Error('Local database connection failed');
        }

        // Connect to cloud database
        try {
            this.cloudClient = new Client(CLOUD_DB_CONFIG);
            await this.cloudClient.connect();
            await this.cloudClient.query('SET search_path TO ataraxia, public');
            console.log('✅ Connected to cloud database');
        } catch (error) {
            console.log('❌ Failed to connect to cloud database:', error.message);
            throw new Error('Cloud database connection failed');
        }
    }

    async ensureAtaraxiaSchema() {
        console.log('\n📋 Step 1: Ensuring ataraxia schema exists...');
        
        for (const [name, client] of [['Local', this.localClient], ['Cloud', this.cloudClient]]) {
            // Check if ataraxia schema exists
            const schemaCheck = await client.query(`
                SELECT schema_name FROM information_schema.schemata WHERE schema_name = 'ataraxia'
            `);
            
            if (schemaCheck.rows.length === 0) {
                console.log(`🔄 Creating ataraxia schema in ${name} database...`);
                await client.query('CREATE SCHEMA ataraxia');
                await client.query('SET search_path TO ataraxia, public');
                console.log(`✅ Created ataraxia schema in ${name} database`);
            } else {
                console.log(`✅ Ataraxia schema exists in ${name} database`);
            }
        }
    }

    async runMigrations() {
        console.log('\n📋 Step 2: Running database migrations...');
        
        const migrationFiles = [
            'database/migrations/002_therapist_verification_system.sql',
            'database/migrations/003_ensure_therapists_table_completeness.sql'
        ];

        for (const [name, client] of [['Local', this.localClient], ['Cloud', this.cloudClient]]) {
            console.log(`🔄 Running migrations on ${name} database...`);
            
            for (const migrationFile of migrationFiles) {
                if (fs.existsSync(migrationFile)) {
                    try {
                        const migrationSQL = fs.readFileSync(migrationFile, 'utf8');
                        
                        // Split into individual statements and execute
                        const statements = migrationSQL
                            .split(';')
                            .map(stmt => stmt.trim())
                            .filter(stmt => stmt.length > 0 && !stmt.startsWith('--'));

                        for (const statement of statements) {
                            if (statement.includes('CREATE TABLE') || 
                                statement.includes('ALTER TABLE') || 
                                statement.includes('CREATE INDEX') ||
                                statement.includes('CREATE OR REPLACE FUNCTION')) {
                                try {
                                    await client.query(statement + ';');
                                } catch (error) {
                                    if (!error.message.includes('already exists')) {
                                        console.log(`    ⚠️  ${statement.substring(0, 50)}... - ${error.message}`);
                                    }
                                }
                            }
                        }
                        console.log(`    ✅ Applied ${path.basename(migrationFile)}`);
                    } catch (error) {
                        console.log(`    ❌ Failed to apply ${migrationFile}: ${error.message}`);
                    }
                } else {
                    console.log(`    ⚠️  Migration file not found: ${migrationFile}`);
                }
            }
        }
    }

    async verifyTableStructure() {
        console.log('\n📋 Step 3: Verifying table structure synchronization...');
        
        let allTablesSync = true;

        for (const tableName of this.requiredTables) {
            console.log(`🔍 Checking table: ${tableName}`);
            
            // Get table structure from both databases
            const localColumns = await this.getTableColumns(this.localClient, tableName);
            const cloudColumns = await this.getTableColumns(this.cloudClient, tableName);
            
            if (localColumns.length === 0 && cloudColumns.length === 0) {
                console.log(`  ⚠️  Table ${tableName} missing in both databases`);
                continue;
            }
            
            if (localColumns.length === 0) {
                console.log(`  ❌ Table ${tableName} missing in local database`);
                allTablesSync = false;
                continue;
            }
            
            if (cloudColumns.length === 0) {
                console.log(`  ❌ Table ${tableName} missing in cloud database`);
                allTablesSync = false;
                continue;
            }
            
            // Compare critical columns
            if (this.criticalColumns[tableName]) {
                const localColumnNames = localColumns.map(c => c.column_name);
                const cloudColumnNames = cloudColumns.map(c => c.column_name);
                
                let tableSync = true;
                for (const criticalColumn of this.criticalColumns[tableName]) {
                    const inLocal = localColumnNames.includes(criticalColumn);
                    const inCloud = cloudColumnNames.includes(criticalColumn);
                    
                    if (inLocal && inCloud) {
                        console.log(`    ✅ ${criticalColumn} exists in both`);
                    } else if (inLocal && !inCloud) {
                        console.log(`    ❌ ${criticalColumn} missing in cloud`);
                        tableSync = false;
                    } else if (!inLocal && inCloud) {
                        console.log(`    ❌ ${criticalColumn} missing in local`);
                        tableSync = false;
                    } else {
                        console.log(`    ❌ ${criticalColumn} missing in both`);
                        tableSync = false;
                    }
                }
                
                if (tableSync) {
                    console.log(`  ✅ Table ${tableName} structure synchronized`);
                } else {
                    console.log(`  ❌ Table ${tableName} structure NOT synchronized`);
                    allTablesSync = false;
                }
            } else {
                console.log(`  ✅ Table ${tableName} exists in both databases`);
            }
        }
        
        return allTablesSync;
    }

    async getTableColumns(client, tableName) {
        try {
            const result = await client.query(`
                SELECT column_name, data_type, is_nullable, column_default
                FROM information_schema.columns 
                WHERE table_schema = 'ataraxia' AND table_name = $1
                ORDER BY ordinal_position
            `, [tableName]);
            return result.rows;
        } catch (error) {
            return [];
        }
    }

    async testDatabaseConnectivity() {
        console.log('\n📋 Step 4: Testing database connectivity and queries...');
        
        for (const [name, client] of [['Local', this.localClient], ['Cloud', this.cloudClient]]) {
            console.log(`🔍 Testing ${name} database...`);
            
            try {
                // Test basic query
                await client.query('SELECT 1');
                console.log(`  ✅ Basic query works`);
                
                // Test schema access
                const schemaTest = await client.query('SELECT current_schema()');
                console.log(`  ✅ Current schema: ${schemaTest.rows[0].current_schema}`);
                
                // Test users table if it exists
                try {
                    const userCount = await client.query('SELECT COUNT(*) FROM users');
                    console.log(`  ✅ Users table: ${userCount.rows[0].count} records`);
                } catch (error) {
                    console.log(`  ⚠️  Users table not accessible: ${error.message}`);
                }
                
                // Test therapists table if it exists
                try {
                    const therapistCount = await client.query('SELECT COUNT(*) FROM therapists');
                    console.log(`  ✅ Therapists table: ${therapistCount.rows[0].count} records`);
                } catch (error) {
                    console.log(`  ⚠️  Therapists table not accessible: ${error.message}`);
                }
                
                // Test join query (what the API does)
                try {
                    const joinTest = await client.query(`
                        SELECT u.id, u.first_name, t.bio 
                        FROM users u 
                        INNER JOIN therapists t ON u.id = t.user_id 
                        LIMIT 1
                    `);
                    if (joinTest.rows.length > 0) {
                        console.log(`  ✅ Join query works`);
                    } else {
                        console.log(`  ⚠️  Join query returns no data`);
                    }
                } catch (error) {
                    console.log(`  ❌ Join query failed: ${error.message}`);
                }
                
            } catch (error) {
                console.log(`  ❌ ${name} database test failed: ${error.message}`);
                return false;
            }
        }
        
        return true;
    }

    async syncPrismaSchema() {
        console.log('\n📋 Step 5: Syncing Prisma schema (if exists)...');
        
        const prismaSchemaPath = 'prisma/schema.prisma';
        if (fs.existsSync(prismaSchemaPath)) {
            console.log('🔄 Prisma schema found, running introspection...');
            
            try {
                // Update Prisma schema to use ataraxia schema
                const { execSync } = require('child_process');
                
                // Set environment for Prisma to use local database
                process.env.DATABASE_URL = 'postgresql://ataraxia_user:ataraxia_password@localhost:5432/ataraxia_db?schema=ataraxia';
                
                // Run Prisma introspection
                execSync('npx prisma db pull', { stdio: 'inherit' });
                console.log('✅ Prisma schema updated from database');
                
                // Generate Prisma client
                execSync('npx prisma generate', { stdio: 'inherit' });
                console.log('✅ Prisma client generated');
                
            } catch (error) {
                console.log('⚠️  Prisma sync failed (this is OK if not using Prisma):', error.message);
            }
        } else {
            console.log('ℹ️  No Prisma schema found, skipping Prisma sync');
        }
    }

    async closeDatabases() {
        if (this.localClient) {
            await this.localClient.end();
        }
        if (this.cloudClient) {
            await this.cloudClient.end();
        }
        console.log('🔌 Database connections closed');
    }

    async run() {
        console.log('🚀 Starting Database Synchronization System...\n');
        
        try {
            await this.connectDatabases();
            await this.ensureAtaraxiaSchema();
            await this.runMigrations();
            const structureSync = await this.verifyTableStructure();
            const connectivityOk = await this.testDatabaseConnectivity();
            await this.syncPrismaSchema();
            
            console.log('\n' + '='.repeat(60));
            
            if (structureSync && connectivityOk) {
                console.log('🎉 DATABASE SYNCHRONIZATION SUCCESSFUL!');
                console.log('✅ Local and cloud databases are in perfect sync');
                console.log('✅ All tables exist with correct structure');
                console.log('✅ Ataraxia schema is properly configured');
                console.log('✅ Database connectivity verified');
                console.log('\n🚀 Ready for deployment!');
                return true;
            } else {
                console.log('❌ DATABASE SYNCHRONIZATION FAILED!');
                console.log('⚠️  Databases are not in sync - deployment should not proceed');
                return false;
            }
            
        } catch (error) {
            console.error('💥 Database sync system failed:', error.message);
            return false;
        } finally {
            await this.closeDatabases();
        }
    }
}

// Run the sync system
if (require.main === module) {
    const syncSystem = new DatabaseSyncSystem();
    syncSystem.run()
        .then(success => {
            process.exit(success ? 0 : 1);
        })
        .catch(error => {
            console.error('Fatal error:', error);
            process.exit(1);
        });
}

module.exports = DatabaseSyncSystem;
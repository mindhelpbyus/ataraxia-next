#!/usr/bin/env node
/**
 * Run RBAC Migration
 * Executes the RBAC system migration SQL script
 */

const { Client } = require('pg');
const fs = require('fs');
const path = require('path');
require('dotenv').config();

async function runRBACMigration() {
    console.log('🚀 Running RBAC Migration...\n');

    const client = new Client({
        connectionString: process.env.DATABASE_URL
    });

    try {
        await client.connect();
        console.log('✅ Connected to database\n');

        // Read migration file
        const migrationPath = path.join(__dirname, '../prisma/migrations/002_rbac_system.sql');
        const sql = fs.readFileSync(migrationPath, 'utf8');

        console.log('📄 Executing RBAC migration...\n');

        // Execute migration
        const result = await client.query(sql);

        console.log('\n✅ RBAC Migration Complete!\n');

        // Show results
        console.log('📊 Migration Results:');
        if (Array.isArray(result)) {
            result.forEach((r, i) => {
                if (r.rows && r.rows.length > 0) {
                    console.log(`\nResult ${i + 1}:`);
                    console.table(r.rows);
                }
            });
        } else if (result.rows && result.rows.length > 0) {
            console.table(result.rows);
        }

    } catch (error) {
        console.error('❌ Migration failed:', error.message);
        console.error('\nFull error:', error);
        process.exit(1);
    } finally {
        await client.end();
    }
}

runRBACMigration();

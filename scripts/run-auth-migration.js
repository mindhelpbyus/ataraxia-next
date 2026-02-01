const { Client } = require('pg');
const fs = require('fs');
const path = require('path');
require('dotenv').config();

async function runMigration() {
    const client = new Client({
        connectionString: process.env.DATABASE_URL
    });

    try {
        console.log('🔄 Connecting to database...');
        await client.connect();
        console.log('✅ Connected!');

        console.log('\n🔄 Running auth_provider_mapping migration...');
        const migrationSQL = fs.readFileSync(
            path.join(__dirname, '../prisma/migrations/001_auth_provider_mapping.sql'),
            'utf8'
        );

        await client.query(migrationSQL);
        console.log('✅ Migration completed successfully!');

    } catch (error) {
        console.error('❌ Migration failed:', error.message);
        throw error;
    } finally {
        await client.end();
    }
}

runMigration().catch(console.error);

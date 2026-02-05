
require('dotenv').config({ path: '../.env' });
const { Client } = require('pg');

const client = new Client({
    connectionString: process.env.DATABASE_URL,
});

async function inspect() {
    await client.connect();
    try {
        console.log('--- Roles Table ---');
        const resRoles = await client.query('SELECT * FROM ataraxia.roles');
        console.table(resRoles.rows);

        console.log('\n--- User Role Check Constraints ---');
        const resConstraints = await client.query(`
      SELECT conname, pg_get_constraintdef(c.oid)
      FROM pg_constraint c
      JOIN pg_namespace n ON n.oid = c.connamespace
      WHERE conname = 'users_role_check'
      AND n.nspname = 'ataraxia';
    `);
        console.table(resConstraints.rows);

    } catch (err) {
        console.error('Error executing query', err);
    } finally {
        await client.end();
    }
}

inspect();

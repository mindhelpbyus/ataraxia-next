"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.getDatabase = getDatabase;
exports.query = query;
exports.queryOne = queryOne;
exports.disconnect = disconnect;
/**
 * Simple Database Connection for Lambda
 * Lightweight alternative to Prisma for Lambda functions
 */
const pg_1 = require("pg");
let pool = null;
async function getDatabase() {
    if (!pool) {
        const connectionString = process.env.DATABASE_URL;
        if (!connectionString) {
            throw new Error('DATABASE_URL environment variable not set');
        }
        pool = new pg_1.Pool({
            connectionString,
            ssl: process.env.NODE_ENV === 'production' ? { rejectUnauthorized: false } : false,
            max: 1, // Lambda doesn't need connection pooling
            idleTimeoutMillis: 30000,
            connectionTimeoutMillis: 2000,
        });
        // Set the search path to use the specified schema (default to ataraxia)
        const schema = process.env.DATABASE_SCHEMA || 'ataraxia';
        try {
            await pool.query(`SET search_path TO ${schema}, public`);
            console.log(`Database search path set to: ${schema}, public`);
        }
        catch (error) {
            console.warn(`Failed to set search path to ${schema} schema:`, error);
        }
    }
    return pool;
}
async function query(text, params) {
    const db = await getDatabase();
    const result = await db.query(text, params);
    return result.rows;
}
async function queryOne(text, params) {
    const rows = await query(text, params);
    return rows[0] || null;
}
async function disconnect() {
    if (pool) {
        await pool.end();
        pool = null;
    }
}
//# sourceMappingURL=database-backup.js.map
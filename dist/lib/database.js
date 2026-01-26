"use strict";
/**
 * Enhanced Database Library
 * Ensures proper schema path configuration for Lambda functions
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.query = query;
exports.queryOne = queryOne;
exports.testConnection = testConnection;
exports.closePool = closePool;
const pg_1 = require("pg");
// Database configuration with schema enforcement
const pool = new pg_1.Pool({
    host: process.env.DB_HOST || 'dev-db-cluster.cluster-cliy2m6q8h4h.us-west-2.rds.amazonaws.com',
    port: parseInt(process.env.DB_PORT || '5432'),
    database: process.env.DB_NAME || 'ataraxia_db',
    user: process.env.DB_USER || 'app_user',
    password: process.env.DB_PASSWORD || 'ChangeMe123!',
    ssl: process.env.DB_SSL === 'false' ? false : { rejectUnauthorized: false },
    max: 20,
    idleTimeoutMillis: 30000,
    connectionTimeoutMillis: 2000,
});
// Enhanced query function with schema path enforcement
async function query(text, params) {
    const client = await pool.connect();
    try {
        // ALWAYS set search path before any query
        await client.query('SET search_path TO ataraxia, public');
        console.log('Database search path set to: ataraxia, public');
        const result = await client.query(text, params);
        return result.rows;
    }
    finally {
        client.release();
    }
}
// Enhanced queryOne function
async function queryOne(text, params) {
    const results = await query(text, params);
    return results.length > 0 ? results[0] : null;
}
// Connection test function
async function testConnection() {
    try {
        const client = await pool.connect();
        await client.query('SET search_path TO ataraxia, public');
        await client.query('SELECT 1');
        client.release();
        return true;
    }
    catch (error) {
        console.error('Database connection test failed:', error);
        return false;
    }
}
// Graceful shutdown
async function closePool() {
    await pool.end();
}
//# sourceMappingURL=database.js.map
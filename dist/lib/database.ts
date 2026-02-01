/**
 * Enhanced Database Library
 * Ensures proper schema path configuration for Lambda functions
 */

import { Pool, PoolClient } from 'pg';

// Database configuration with schema enforcement
const pool = new Pool({
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
export async function query(text: string, params?: any[]): Promise<any> {
  const client = await pool.connect();
  const schema = process.env.DATABASE_SCHEMA || 'ataraxia';

  try {
    // ALWAYS set search path before any query
    await client.query(`SET search_path TO ${schema}, public`);
    console.log(`Database search path set to: ${schema}, public`);

    const result = await client.query(text, params);
    return result.rows;
  } finally {
    client.release();
  }
}

// Enhanced queryOne function
export async function queryOne(text: string, params?: any[]): Promise<any> {
  const results = await query(text, params);
  return results.length > 0 ? results[0] : null;
}

// Connection test function
export async function testConnection(): Promise<boolean> {
  try {
    const client = await pool.connect();
    const schema = process.env.DATABASE_SCHEMA || 'ataraxia';
    await client.query(`SET search_path TO ${schema}, public`);
    await client.query('SELECT 1');
    client.release();
    return true;
  } catch (error) {
    console.error('Database connection test failed:', error);
    return false;
  }
}

// Graceful shutdown
export async function closePool(): Promise<void> {
  await pool.end();
}


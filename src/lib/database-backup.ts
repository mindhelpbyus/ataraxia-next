/**
 * Simple Database Connection for Lambda
 * Lightweight alternative to Prisma for Lambda functions
 */
import { Pool } from 'pg';

let pool: Pool | null = null;

export async function getDatabase(): Promise<Pool> {
  if (!pool) {
    const connectionString = process.env.DATABASE_URL;
    
    if (!connectionString) {
      throw new Error('DATABASE_URL environment variable not set');
    }
    
    pool = new Pool({
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
    } catch (error) {
      console.warn(`Failed to set search path to ${schema} schema:`, error);
    }
  }
  return pool;
}

export async function query(text: string, params?: any[]): Promise<any> {
  const db = await getDatabase();
  const result = await db.query(text, params);
  return result.rows;
}

export async function queryOne(text: string, params?: any[]): Promise<any> {
  const rows = await query(text, params);
  return rows[0] || null;
}

export async function disconnect(): Promise<void> {
  if (pool) {
    await pool.end();
    pool = null;
  }
}
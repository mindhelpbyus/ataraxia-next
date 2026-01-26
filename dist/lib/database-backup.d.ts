/**
 * Simple Database Connection for Lambda
 * Lightweight alternative to Prisma for Lambda functions
 */
import { Pool } from 'pg';
export declare function getDatabase(): Promise<Pool>;
export declare function query(text: string, params?: any[]): Promise<any>;
export declare function queryOne(text: string, params?: any[]): Promise<any>;
export declare function disconnect(): Promise<void>;
//# sourceMappingURL=database-backup.d.ts.map
/**
 * Enhanced Database Library
 * Ensures proper schema path configuration for Lambda functions
 */
export declare function query(text: string, params?: any[]): Promise<any>;
export declare function queryOne(text: string, params?: any[]): Promise<any>;
export declare function testConnection(): Promise<boolean>;
export declare function closePool(): Promise<void>;
//# sourceMappingURL=database.d.ts.map
/**
 * Shared Logging Utilities
 *
 * Provides structured logging and performance monitoring
 * for all Lambda functions
 */
export interface LogContext {
    requestId?: string;
    userId?: string;
    path?: string;
    method?: string;
    userAgent?: string;
    ip?: string;
    [key: string]: any;
}
export declare class Logger {
    private serviceName;
    constructor(serviceName: string);
    private formatMessage;
    info(message: string, context?: LogContext): void;
    warn(message: string, context?: LogContext): void;
    error(message: string, context?: LogContext, error?: any): void;
    debug(message: string, context?: LogContext): void;
}
/**
 * Create logger instance
 */
export declare function createLogger(serviceName: string): Logger;
/**
 * Performance monitoring utility
 */
export declare class PerformanceMonitor {
    private logger;
    private operation;
    private context;
    private startTime;
    constructor(logger: Logger, operation: string, context?: LogContext);
    end(success: boolean, additionalContext?: any): void;
    addContext(additionalContext: any): void;
}
/**
 * Request correlation ID generator
 */
export declare function generateCorrelationId(): string;
/**
 * Sanitize sensitive data from logs
 */
export declare function sanitizeLogData(data: any): any;
/**
 * Log API request/response
 */
export declare function logApiCall(logger: Logger, method: string, path: string, statusCode: number, duration: number, context?: LogContext): void;
/**
 * Log database query
 */
export declare function logDatabaseQuery(logger: Logger, query: string, duration: number, rowCount?: number, context?: LogContext): void;
/**
 * Log external API call
 */
export declare function logExternalApiCall(logger: Logger, service: string, endpoint: string, method: string, statusCode: number, duration: number, context?: LogContext): void;
//# sourceMappingURL=logger.d.ts.map
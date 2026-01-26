"use strict";
/**
 * Shared Logging Utilities
 *
 * Provides structured logging and performance monitoring
 * for all Lambda functions
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.PerformanceMonitor = exports.Logger = void 0;
exports.createLogger = createLogger;
exports.generateCorrelationId = generateCorrelationId;
exports.sanitizeLogData = sanitizeLogData;
exports.logApiCall = logApiCall;
exports.logDatabaseQuery = logDatabaseQuery;
exports.logExternalApiCall = logExternalApiCall;
class Logger {
    constructor(serviceName) {
        this.serviceName = serviceName;
    }
    formatMessage(level, message, context, error) {
        const logEntry = {
            timestamp: new Date().toISOString(),
            level,
            service: this.serviceName,
            message,
            ...(context && { context }),
            ...(error && {
                error: {
                    name: error.name,
                    message: error.message,
                    stack: error.stack
                }
            })
        };
        return JSON.stringify(logEntry);
    }
    info(message, context) {
        console.log(this.formatMessage('INFO', message, context));
    }
    warn(message, context) {
        console.warn(this.formatMessage('WARN', message, context));
    }
    error(message, context, error) {
        console.error(this.formatMessage('ERROR', message, context, error));
    }
    debug(message, context) {
        if (process.env.LOG_LEVEL === 'debug') {
            console.debug(this.formatMessage('DEBUG', message, context));
        }
    }
}
exports.Logger = Logger;
/**
 * Create logger instance
 */
function createLogger(serviceName) {
    return new Logger(serviceName);
}
/**
 * Performance monitoring utility
 */
class PerformanceMonitor {
    constructor(logger, operation, context = {}) {
        this.logger = logger;
        this.operation = operation;
        this.context = context;
        this.startTime = Date.now();
        this.logger.debug(`Starting operation: ${operation}`, context);
    }
    end(success, additionalContext) {
        const duration = Date.now() - this.startTime;
        const finalContext = {
            ...this.context,
            duration,
            success,
            ...(additionalContext && additionalContext)
        };
        if (success) {
            this.logger.info(`Operation completed: ${this.operation}`, finalContext);
        }
        else {
            this.logger.warn(`Operation failed: ${this.operation}`, finalContext);
        }
    }
    addContext(additionalContext) {
        this.context = { ...this.context, ...additionalContext };
    }
}
exports.PerformanceMonitor = PerformanceMonitor;
/**
 * Request correlation ID generator
 */
function generateCorrelationId() {
    return `${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
}
/**
 * Sanitize sensitive data from logs
 */
function sanitizeLogData(data) {
    if (!data || typeof data !== 'object') {
        return data;
    }
    const sensitiveFields = [
        'password', 'token', 'secret', 'key', 'authorization',
        'ssn', 'social_security_number', 'credit_card', 'cvv'
    ];
    const sanitized = { ...data };
    for (const field of sensitiveFields) {
        if (sanitized[field]) {
            sanitized[field] = '[REDACTED]';
        }
    }
    // Recursively sanitize nested objects
    for (const key in sanitized) {
        if (typeof sanitized[key] === 'object' && sanitized[key] !== null) {
            sanitized[key] = sanitizeLogData(sanitized[key]);
        }
    }
    return sanitized;
}
/**
 * Log API request/response
 */
function logApiCall(logger, method, path, statusCode, duration, context = {}) {
    const logContext = {
        ...context,
        method,
        path,
        statusCode,
        duration,
        type: 'api_call'
    };
    if (statusCode >= 400) {
        logger.warn('API call failed', logContext);
    }
    else {
        logger.info('API call completed', logContext);
    }
}
/**
 * Log database query
 */
function logDatabaseQuery(logger, query, duration, rowCount, context = {}) {
    const logContext = {
        ...context,
        query: query.substring(0, 200), // Truncate long queries
        duration,
        rowCount,
        type: 'database_query'
    };
    logger.debug('Database query executed', logContext);
}
/**
 * Log external API call
 */
function logExternalApiCall(logger, service, endpoint, method, statusCode, duration, context = {}) {
    const logContext = {
        ...context,
        service,
        endpoint,
        method,
        statusCode,
        duration,
        type: 'external_api_call'
    };
    if (statusCode >= 400) {
        logger.warn('External API call failed', logContext);
    }
    else {
        logger.info('External API call completed', logContext);
    }
}
//# sourceMappingURL=logger.js.map
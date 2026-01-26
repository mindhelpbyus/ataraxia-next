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

export class Logger {
  private serviceName: string;

  constructor(serviceName: string) {
    this.serviceName = serviceName;
  }

  private formatMessage(level: string, message: string, context?: LogContext, error?: any): string {
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

  info(message: string, context?: LogContext): void {
    console.log(this.formatMessage('INFO', message, context));
  }

  warn(message: string, context?: LogContext): void {
    console.warn(this.formatMessage('WARN', message, context));
  }

  error(message: string, context?: LogContext, error?: any): void {
    console.error(this.formatMessage('ERROR', message, context, error));
  }

  debug(message: string, context?: LogContext): void {
    if (process.env.LOG_LEVEL === 'debug') {
      console.debug(this.formatMessage('DEBUG', message, context));
    }
  }
}

/**
 * Create logger instance
 */
export function createLogger(serviceName: string): Logger {
  return new Logger(serviceName);
}

/**
 * Performance monitoring utility
 */
export class PerformanceMonitor {
  private logger: Logger;
  private operation: string;
  private context: LogContext;
  private startTime: number;

  constructor(logger: Logger, operation: string, context: LogContext = {}) {
    this.logger = logger;
    this.operation = operation;
    this.context = context;
    this.startTime = Date.now();
    
    this.logger.debug(`Starting operation: ${operation}`, context);
  }

  end(success: boolean, additionalContext?: any): void {
    const duration = Date.now() - this.startTime;
    const finalContext = {
      ...this.context,
      duration,
      success,
      ...(additionalContext && additionalContext)
    };

    if (success) {
      this.logger.info(`Operation completed: ${this.operation}`, finalContext);
    } else {
      this.logger.warn(`Operation failed: ${this.operation}`, finalContext);
    }
  }

  addContext(additionalContext: any): void {
    this.context = { ...this.context, ...additionalContext };
  }
}

/**
 * Request correlation ID generator
 */
export function generateCorrelationId(): string {
  return `${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
}

/**
 * Sanitize sensitive data from logs
 */
export function sanitizeLogData(data: any): any {
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
export function logApiCall(
  logger: Logger,
  method: string,
  path: string,
  statusCode: number,
  duration: number,
  context: LogContext = {}
): void {
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
  } else {
    logger.info('API call completed', logContext);
  }
}

/**
 * Log database query
 */
export function logDatabaseQuery(
  logger: Logger,
  query: string,
  duration: number,
  rowCount?: number,
  context: LogContext = {}
): void {
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
export function logExternalApiCall(
  logger: Logger,
  service: string,
  endpoint: string,
  method: string,
  statusCode: number,
  duration: number,
  context: LogContext = {}
): void {
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
  } else {
    logger.info('External API call completed', logContext);
  }
}
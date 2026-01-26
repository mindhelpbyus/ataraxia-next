/**
 * Shared Response Utilities
 *
 * Provides standardized response formatting for all Lambda functions
 */
import { APIGatewayProxyResult } from 'aws-lambda';
/**
 * Success response helper
 */
export declare function successResponse(data: any, message?: string, requestId?: string, pagination?: any): APIGatewayProxyResult;
/**
 * Error response helper
 */
export declare function errorResponse(statusCode: number, message: string, requestId?: string, details?: any): APIGatewayProxyResult;
/**
 * Validation error response helper
 */
export declare function validationErrorResponse(message: string, requestId?: string, validationErrors?: any[]): APIGatewayProxyResult;
/**
 * Unauthorized response helper
 */
export declare function unauthorizedResponse(message?: string, requestId?: string): APIGatewayProxyResult;
/**
 * Forbidden response helper
 */
export declare function forbiddenResponse(message?: string, requestId?: string): APIGatewayProxyResult;
/**
 * Not found response helper
 */
export declare function notFoundResponse(message?: string, requestId?: string): APIGatewayProxyResult;
/**
 * Internal server error response helper
 */
export declare function internalServerErrorResponse(message?: string, requestId?: string): APIGatewayProxyResult;
/**
 * Paginated response helper
 */
export declare function paginatedResponse(data: any[], total: number, limit: number, offset: number, message?: string, requestId?: string): APIGatewayProxyResult;
/**
 * Created response helper (201)
 */
export declare function createdResponse(data: any, message?: string, requestId?: string): APIGatewayProxyResult;
/**
 * No content response helper (204)
 */
export declare function noContentResponse(): APIGatewayProxyResult;
//# sourceMappingURL=response.d.ts.map
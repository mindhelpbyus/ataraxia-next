"use strict";
/**
 * Shared Response Utilities
 *
 * Provides standardized response formatting for all Lambda functions
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.successResponse = successResponse;
exports.errorResponse = errorResponse;
exports.validationErrorResponse = validationErrorResponse;
exports.unauthorizedResponse = unauthorizedResponse;
exports.forbiddenResponse = forbiddenResponse;
exports.notFoundResponse = notFoundResponse;
exports.internalServerErrorResponse = internalServerErrorResponse;
exports.paginatedResponse = paginatedResponse;
exports.createdResponse = createdResponse;
exports.noContentResponse = noContentResponse;
/**
 * Standard CORS headers
 */
const CORS_HEADERS = {
    'Content-Type': 'application/json',
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'Content-Type,X-Amz-Date,Authorization,X-Api-Key,X-Amz-Security-Token',
    'Access-Control-Allow-Methods': 'GET,POST,PUT,DELETE,OPTIONS'
};
/**
 * Success response helper
 */
function successResponse(data, message = 'Success', requestId, pagination) {
    const response = {
        success: true,
        data,
        message,
        timestamp: new Date().toISOString()
    };
    if (requestId) {
        response.requestId = requestId;
    }
    if (pagination) {
        response.pagination = pagination;
    }
    return {
        statusCode: 200,
        headers: CORS_HEADERS,
        body: JSON.stringify(response, null, 2)
    };
}
/**
 * Error response helper
 */
function errorResponse(statusCode, message, requestId, details) {
    const response = {
        success: false,
        error: getErrorCode(statusCode),
        message,
        timestamp: new Date().toISOString()
    };
    if (requestId) {
        response.requestId = requestId;
    }
    if (details) {
        response.details = details;
    }
    return {
        statusCode,
        headers: CORS_HEADERS,
        body: JSON.stringify(response, null, 2)
    };
}
/**
 * Validation error response helper
 */
function validationErrorResponse(message, requestId, validationErrors) {
    const response = {
        success: false,
        error: 'VALIDATION_ERROR',
        message,
        timestamp: new Date().toISOString()
    };
    if (requestId) {
        response.requestId = requestId;
    }
    if (validationErrors) {
        response.validationErrors = validationErrors;
    }
    return {
        statusCode: 400,
        headers: CORS_HEADERS,
        body: JSON.stringify(response, null, 2)
    };
}
/**
 * Unauthorized response helper
 */
function unauthorizedResponse(message = 'Unauthorized', requestId) {
    return errorResponse(401, message, requestId);
}
/**
 * Forbidden response helper
 */
function forbiddenResponse(message = 'Forbidden', requestId) {
    return errorResponse(403, message, requestId);
}
/**
 * Not found response helper
 */
function notFoundResponse(message = 'Not found', requestId) {
    return errorResponse(404, message, requestId);
}
/**
 * Internal server error response helper
 */
function internalServerErrorResponse(message = 'Internal server error', requestId) {
    return errorResponse(500, message, requestId);
}
/**
 * Get error code from status code
 */
function getErrorCode(statusCode) {
    switch (statusCode) {
        case 400:
            return 'BAD_REQUEST';
        case 401:
            return 'UNAUTHORIZED';
        case 403:
            return 'FORBIDDEN';
        case 404:
            return 'NOT_FOUND';
        case 409:
            return 'CONFLICT';
        case 422:
            return 'UNPROCESSABLE_ENTITY';
        case 429:
            return 'TOO_MANY_REQUESTS';
        case 500:
            return 'INTERNAL_SERVER_ERROR';
        case 502:
            return 'BAD_GATEWAY';
        case 503:
            return 'SERVICE_UNAVAILABLE';
        case 504:
            return 'GATEWAY_TIMEOUT';
        default:
            return 'UNKNOWN_ERROR';
    }
}
/**
 * Paginated response helper
 */
function paginatedResponse(data, total, limit, offset, message = 'Success', requestId) {
    const pagination = {
        total,
        limit,
        offset,
        hasMore: offset + data.length < total,
        currentPage: Math.floor(offset / limit) + 1,
        totalPages: Math.ceil(total / limit)
    };
    return successResponse(data, message, requestId, pagination);
}
/**
 * Created response helper (201)
 */
function createdResponse(data, message = 'Created successfully', requestId) {
    const response = {
        success: true,
        data,
        message,
        timestamp: new Date().toISOString()
    };
    if (requestId) {
        response.requestId = requestId;
    }
    return {
        statusCode: 201,
        headers: CORS_HEADERS,
        body: JSON.stringify(response, null, 2)
    };
}
/**
 * No content response helper (204)
 */
function noContentResponse() {
    return {
        statusCode: 204,
        headers: CORS_HEADERS,
        body: ''
    };
}
//# sourceMappingURL=response.js.map
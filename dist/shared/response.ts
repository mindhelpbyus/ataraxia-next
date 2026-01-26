/**
 * Shared Response Utilities
 * 
 * Provides standardized response formatting for all Lambda functions
 */

import { APIGatewayProxyResult } from 'aws-lambda';

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
export function successResponse(
  data: any, 
  message: string = 'Success', 
  requestId?: string,
  pagination?: any
): APIGatewayProxyResult {
  const response: any = {
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
export function errorResponse(
  statusCode: number, 
  message: string, 
  requestId?: string,
  details?: any
): APIGatewayProxyResult {
  const response: any = {
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
export function validationErrorResponse(
  message: string, 
  requestId?: string,
  validationErrors?: any[]
): APIGatewayProxyResult {
  const response: any = {
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
export function unauthorizedResponse(
  message: string = 'Unauthorized', 
  requestId?: string
): APIGatewayProxyResult {
  return errorResponse(401, message, requestId);
}

/**
 * Forbidden response helper
 */
export function forbiddenResponse(
  message: string = 'Forbidden', 
  requestId?: string
): APIGatewayProxyResult {
  return errorResponse(403, message, requestId);
}

/**
 * Not found response helper
 */
export function notFoundResponse(
  message: string = 'Not found', 
  requestId?: string
): APIGatewayProxyResult {
  return errorResponse(404, message, requestId);
}

/**
 * Internal server error response helper
 */
export function internalServerErrorResponse(
  message: string = 'Internal server error', 
  requestId?: string
): APIGatewayProxyResult {
  return errorResponse(500, message, requestId);
}

/**
 * Get error code from status code
 */
function getErrorCode(statusCode: number): string {
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
export function paginatedResponse(
  data: any[], 
  total: number, 
  limit: number, 
  offset: number,
  message: string = 'Success',
  requestId?: string
): APIGatewayProxyResult {
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
export function createdResponse(
  data: any, 
  message: string = 'Created successfully', 
  requestId?: string
): APIGatewayProxyResult {
  const response: any = {
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
export function noContentResponse(): APIGatewayProxyResult {
  return {
    statusCode: 204,
    headers: CORS_HEADERS,
    body: ''
  };
}
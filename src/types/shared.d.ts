/**
 * Type declarations for shared modules
 */

declare module '../../shared/auth' {
  export interface AuthResult {
    success: boolean;
    user?: {
      id: string;
      sub: string;
      email: string;
      firstName: string;
      lastName: string;
      role: string;
      accountStatus: string;
    };
    error?: string;
  }

  export function verifyJWT(authHeader?: string): Promise<AuthResult>;
  export function extractUserFromToken(payload: any): any;
  export function extractSubFromToken(token: string): string;
  export function hasRole(user: any, requiredRole: string | string[]): boolean;
  export function isAdmin(user: any): boolean;
  export function isTherapist(user: any): boolean;
  export function isClient(user: any): boolean;
}

declare module '../../shared/response' {
  import { APIGatewayProxyResult } from 'aws-lambda';

  export function successResponse(
    data: any, 
    message?: string, 
    requestId?: string,
    pagination?: any
  ): APIGatewayProxyResult;

  export function errorResponse(
    statusCode: number, 
    message: string, 
    requestId?: string,
    details?: any
  ): APIGatewayProxyResult;

  export function validationErrorResponse(
    message: string, 
    requestId?: string,
    validationErrors?: any[]
  ): APIGatewayProxyResult;

  export function unauthorizedResponse(
    message?: string, 
    requestId?: string
  ): APIGatewayProxyResult;

  export function forbiddenResponse(
    message?: string, 
    requestId?: string
  ): APIGatewayProxyResult;

  export function notFoundResponse(
    message?: string, 
    requestId?: string
  ): APIGatewayProxyResult;

  export function createdResponse(
    data: any, 
    message?: string, 
    requestId?: string
  ): APIGatewayProxyResult;
}

declare module '../../shared/logger' {
  export class Logger {
    constructor(service: string);
    info(message: string, context?: any, data?: any): void;
    error(message: string, context?: any, error?: any): void;
    warn(message: string, context?: any, data?: any): void;
    debug(message: string, context?: any, data?: any): void;
  }

  export class PerformanceMonitor {
    constructor(logger: Logger, operation: string, context?: any);
    end(success: boolean): void;
  }

  export function createLogger(service: string): Logger;
}
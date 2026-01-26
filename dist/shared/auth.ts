/**
 * Shared Authentication Utilities
 * 
 * Provides JWT verification and user extraction utilities
 * for use across all Lambda functions
 */

import { CognitoJwtVerifier } from 'aws-jwt-verify';

// JWT Verifier for token validation
const jwtVerifier = CognitoJwtVerifier.create({
  userPoolId: process.env.COGNITO_USER_POOL_ID || 'us-west-2_xeXlyFBMH',
  tokenUse: 'id',
  clientId: process.env.COGNITO_CLIENT_ID || '7ek8kg1td2ps985r21m7727q98',
});

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

/**
 * Verify JWT token and extract user information
 */
export async function verifyJWT(authHeader?: string): Promise<AuthResult> {
  try {
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return { success: false, error: 'Missing or invalid authorization header' };
    }

    const token = authHeader.substring(7); // Remove 'Bearer ' prefix
    
    // Verify token with Cognito
    const payload = await jwtVerifier.verify(token);
    
    return {
      success: true,
      user: {
        id: payload.sub,
        sub: payload.sub,
        email: String(payload.email || ''),
        firstName: String(payload.given_name || ''),
        lastName: String(payload.family_name || ''),
        role: String(payload['custom:role'] || 'client'),
        accountStatus: String(payload['custom:account_status'] || 'active')
      }
    };
  } catch (error: any) {
    return { 
      success: false, 
      error: error.name === 'JwtExpiredError' ? 'Token expired' : 'Invalid token' 
    };
  }
}

/**
 * Extract user from token payload (for database queries)
 */
export function extractUserFromToken(payload: any): any {
  return {
    id: payload.sub,
    sub: payload.sub,
    email: String(payload.email || ''),
    firstName: String(payload.given_name || ''),
    lastName: String(payload.family_name || ''),
    role: String(payload['custom:role'] || 'client'),
    accountStatus: String(payload['custom:account_status'] || 'active')
  };
}

/**
 * Extract sub from JWT token (without verification)
 */
export function extractSubFromToken(token: string): string {
  try {
    const payload = JSON.parse(Buffer.from(token.split('.')[1], 'base64').toString());
    return payload.sub;
  } catch (error) {
    throw new Error('Invalid token format');
  }
}

/**
 * Check if user has required role
 */
export function hasRole(user: any, requiredRole: string | string[]): boolean {
  if (Array.isArray(requiredRole)) {
    return requiredRole.includes(user.role);
  }
  return user.role === requiredRole;
}

/**
 * Check if user is admin
 */
export function isAdmin(user: any): boolean {
  return hasRole(user, ['admin', 'super_admin']);
}

/**
 * Check if user is therapist
 */
export function isTherapist(user: any): boolean {
  return hasRole(user, 'therapist');
}

/**
 * Check if user is client
 */
export function isClient(user: any): boolean {
  return hasRole(user, 'client');
}
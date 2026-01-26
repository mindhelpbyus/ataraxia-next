/**
 * Shared Authentication Utilities
 *
 * Provides JWT verification and user extraction utilities
 * for use across all Lambda functions
 */
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
export declare function verifyJWT(authHeader?: string): Promise<AuthResult>;
/**
 * Extract user from token payload (for database queries)
 */
export declare function extractUserFromToken(payload: any): any;
/**
 * Extract sub from JWT token (without verification)
 */
export declare function extractSubFromToken(token: string): string;
/**
 * Check if user has required role
 */
export declare function hasRole(user: any, requiredRole: string | string[]): boolean;
/**
 * Check if user is admin
 */
export declare function isAdmin(user: any): boolean;
/**
 * Check if user is therapist
 */
export declare function isTherapist(user: any): boolean;
/**
 * Check if user is client
 */
export declare function isClient(user: any): boolean;
//# sourceMappingURL=auth.d.ts.map
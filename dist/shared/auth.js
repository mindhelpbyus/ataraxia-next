"use strict";
/**
 * Shared Authentication Utilities
 *
 * Provides JWT verification and user extraction utilities
 * for use across all Lambda functions
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.verifyJWT = verifyJWT;
exports.extractUserFromToken = extractUserFromToken;
exports.extractSubFromToken = extractSubFromToken;
exports.hasRole = hasRole;
exports.isAdmin = isAdmin;
exports.isTherapist = isTherapist;
exports.isClient = isClient;
const aws_jwt_verify_1 = require("aws-jwt-verify");
// JWT Verifier for token validation
const jwtVerifier = aws_jwt_verify_1.CognitoJwtVerifier.create({
    userPoolId: process.env.COGNITO_USER_POOL_ID || 'us-west-2_xeXlyFBMH',
    tokenUse: 'id',
    clientId: process.env.COGNITO_CLIENT_ID || '7ek8kg1td2ps985r21m7727q98',
});
/**
 * Verify JWT token and extract user information
 */
async function verifyJWT(authHeader) {
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
    }
    catch (error) {
        return {
            success: false,
            error: error.name === 'JwtExpiredError' ? 'Token expired' : 'Invalid token'
        };
    }
}
/**
 * Extract user from token payload (for database queries)
 */
function extractUserFromToken(payload) {
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
function extractSubFromToken(token) {
    try {
        const payload = JSON.parse(Buffer.from(token.split('.')[1], 'base64').toString());
        return payload.sub;
    }
    catch (error) {
        throw new Error('Invalid token format');
    }
}
/**
 * Check if user has required role
 */
function hasRole(user, requiredRole) {
    if (Array.isArray(requiredRole)) {
        return requiredRole.includes(user.role);
    }
    return user.role === requiredRole;
}
/**
 * Check if user is admin
 */
function isAdmin(user) {
    return hasRole(user, ['admin', 'super_admin']);
}
/**
 * Check if user is therapist
 */
function isTherapist(user) {
    return hasRole(user, 'therapist');
}
/**
 * Check if user is client
 */
function isClient(user) {
    return hasRole(user, 'client');
}
//# sourceMappingURL=auth.js.map
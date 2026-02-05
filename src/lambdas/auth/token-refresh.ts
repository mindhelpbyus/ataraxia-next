/**
 * General Token Refresh Handler
 * 
 * Implements SECURE TOKEN ROTATION using the "Refresh Token Rotation" strategy.
 * 
 * Strategy:
 * 1. Client sends Refresh Token X.
 * 2. If X is already revoked -> THEFT DETECTED -> Revoke ALL tokens for this user -> 403.
 * 3. If X is valid:
 *    - Mark X as revoked (revoked_at = NOW).
 *    - Generate Request Token Y.
 *    - Generate Access Token.
 *    - Return Y + Access Token.
 * 
 * Result: If a refresh token is stolen, it can only be used ONCE.
 * If the attacker uses it, the legitimate user's next attempt will trigger theft detection,
 * locking out the attacker by invalidating everything.
 */

import { APIGatewayProxyEvent, APIGatewayProxyResult } from 'aws-lambda';
import { getPrisma } from '../../lib/prisma';
import { createLogger } from '../../shared/logger';
import { successResponse, errorResponse, validationErrorResponse } from '../../shared/response';
import jwt from 'jsonwebtoken';
import { v4 as uuidv4 } from 'uuid';

const logger = createLogger('token-refresh');

interface RefreshRequest {
    refreshToken: string;
}

export async function handleTokenRefresh(
    event: APIGatewayProxyEvent,
    requestId: string
): Promise<APIGatewayProxyResult> {
    const prisma = getPrisma();

    try {
        const body = JSON.parse(event.body || '{}') as RefreshRequest;
        const { refreshToken } = body;

        if (!refreshToken) {
            return validationErrorResponse('Refresh Token is required', requestId);
        }

        // 1. Lookup Token in Database
        const storedToken = await prisma.refresh_tokens.findUnique({
            where: { token: refreshToken },
            include: { users: true }
        });

        // 2. Token Not Found
        if (!storedToken) {
            // Could be a forged token, just specific 401
            return errorResponse(401, 'Invalid Refresh Token', requestId);
        }

        // 3. THEFT DETECTION: Token was already revoked!
        // This means someone (attacker or user) used this token before.
        if (storedToken.revoked_at) {
            logger.warn('🚨 SECURITY ALERT: Attempted reuse of revoked token! Potential token theft.', {
                userId: storedToken.user_id.toString(),
                tokenId: storedToken.id.toString(),
                revokedAt: storedToken.revoked_at
            });

            // REVOKE ALL TOKENS FOR THIS USER
            // This locks out both the attacker and the real user (forcing password reset/login)
            await prisma.refresh_tokens.updateMany({
                where: { user_id: storedToken.user_id, revoked_at: null },
                data: {
                    revoked_at: new Date(),
                    // We could store "reason: theft_detected" if we had a reason column
                }
            });

            return errorResponse(403, 'Security alert: Token reuse detected. All sessions have been terminated. Please log in again.', requestId);
        }

        // 4. Token Expired
        if (new Date() > storedToken.expires_at) {
            return errorResponse(401, 'Refresh Token expired. Please log in again.', requestId);
        }

        // 5. VALID TOKEN -> ROTATE IT
        const userId = storedToken.user_id;
        const now = new Date();

        // Transaction to rotate: Revoke Old -> Create New
        // Using transaction ensures we don't end up with used-but-not-revoked tokens
        const [revokedOld, newStoredToken] = await prisma.$transaction([
            // A. Revoke the used token
            prisma.refresh_tokens.update({
                where: { id: storedToken.id },
                data: { revoked_at: now }
            }),

            // B. Create a new Refresh Token (Sliding Window: another 12-24 hours)
            prisma.refresh_tokens.create({
                data: {
                    user_id: userId,
                    token: uuidv4(), // Secure random token
                    expires_at: new Date(Date.now() + 12 * 60 * 60 * 1000), // 12 hours (Shift length)
                    created_at: now,
                    device_info: storedToken.device_info || {}, // Preserve device info chain
                    ip_address: event.requestContext?.identity?.sourceIp || 'unknown'
                }
            })
        ]);

        // 6. Generate New Access Token (15 mins)
        const jwtSecret = process.env.JWT_SECRET;
        if (!jwtSecret) {
            throw new Error('JWT_SECRET environment variable is required');
        }

        const newAccessToken = jwt.sign(
            {
                userId: userId.toString(),
                email: storedToken.users.email,
                role: storedToken.users.role,
                authProvider: storedToken.users.current_auth_provider
            },
            jwtSecret,
            { expiresIn: '15m' }
        );

        logger.info('Token rotated successfully', {
            userId: userId.toString(),
            oldTokenId: storedToken.id.toString(),
            newTokenId: newStoredToken.id.toString()
        });

        // 7. Return New Pair
        return successResponse({
            success: true,
            accessToken: newAccessToken,
            refreshToken: newStoredToken.token, // New rotation token
            expiresIn: 900, // 15 min
            message: 'Token rotated and refreshed'
        }, 'Token refresh successful', requestId);

    } catch (error: any) {
        logger.error('Token refresh execution failed', { error: error.message });
        return errorResponse(500, 'Internal Server Error during token refresh', requestId);
    }
}

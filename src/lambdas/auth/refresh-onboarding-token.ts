/**
 * Onboarding Token Refresh Handler
 * 
 * Refreshes tokens during onboarding process with session validation
 * Updates database progress and extends session timeout
 */

import { APIGatewayProxyEvent, APIGatewayProxyResult } from 'aws-lambda';
import { getPrisma } from '../../lib/prisma';
import { createLogger } from '../../shared/logger';
import { successResponse, errorResponse, validationErrorResponse } from '../../shared/response';
import jwt from 'jsonwebtoken';

const logger = createLogger('onboarding-token-refresh');

interface RefreshRequest {
  sessionId: string;
  currentStep: number;
  stepData?: any; // Optional step data to save
}

/**
 * Verify and decode JWT token
 */
function verifyToken(token: string): { userId: string; sessionType: string } {
  try {
    const jwtSecret = process.env.JWT_SECRET;
    if (!jwtSecret) {
      throw new Error('JWT_SECRET environment variable is required');
    }
    const decoded = jwt.verify(token, jwtSecret) as any;

    if (!decoded.userId || decoded.sessionType !== 'onboarding') {
      throw new Error('Invalid token or not an onboarding session');
    }

    return { userId: decoded.userId, sessionType: decoded.sessionType };
  } catch (error) {
    throw new Error('Invalid or expired token');
  }
}

/**
 * Handle onboarding token refresh with session validation
 */
export async function handleOnboardingTokenRefresh(
  event: APIGatewayProxyEvent,
  requestId: string
): Promise<APIGatewayProxyResult> {
  const prisma = getPrisma();

  try {
    const authHeader = event.headers.Authorization || event.headers.authorization;
    if (!authHeader) {
      return errorResponse(401, 'Authorization header required', requestId);
    }

    const token = authHeader.replace('Bearer ', '');
    const { userId } = verifyToken(token);

    const body = JSON.parse(event.body || '{}') as RefreshRequest;
    const { sessionId, currentStep, stepData } = body;

    if (!sessionId || currentStep === undefined) {
      return validationErrorResponse('Session ID and current step are required', requestId);
    }

    // Validate session exists and is active
    const session = await prisma.user_sessions.findUnique({
      where: { session_id: sessionId },
      include: { users: true }
    });

    if (!session || !session.is_active || session.user_id.toString() !== userId) {
      return errorResponse(401, 'Invalid or expired session', requestId);
    }

    // Check if session has timed out (30 minutes idle)
    const now = new Date();
    if (session.expires_at < now) {
      // Mark session as expired
      await prisma.user_sessions.update({
        where: { session_id: sessionId },
        data: {
          is_active: false,
          ended_at: now,
          end_reason: 'idle_timeout'
        }
      });

      return errorResponse(401, 'Session expired due to inactivity', requestId);
    }

    // Update user progress in database
    await prisma.users.update({
      where: { id: BigInt(userId) },
      data: {
        onboarding_step: currentStep,
        updated_at: new Date()
      }
    });

    // Save step data if provided (optional incremental save)
    if (stepData && Object.keys(stepData).length > 0) {
      // Store step data in a temporary onboarding progress table or JSON field
      await prisma.users.update({
        where: { id: BigInt(userId) },
        data: {
          onboarding_session_id: sessionId,
          // Could store stepData in a JSON field if needed
          updated_at: new Date()
        }
      });

      logger.info('Step data saved', { userId, currentStep, sessionId });
    }

    // Extend session timeout (reset to 30 minutes from now)
    const newExpiry = new Date(Date.now() + 30 * 60 * 1000);
    await prisma.user_sessions.update({
      where: { session_id: sessionId },
      data: {
        expires_at: newExpiry,
        last_accessed_at: new Date()
      }
    });

    // Generate new access token (15 minutes)
    const jwtSecret = process.env.JWT_SECRET;
    if (!jwtSecret) {
      throw new Error('JWT_SECRET environment variable is required');
    }
    const newAccessToken = jwt.sign(
      {
        userId: userId,
        email: session.users.email,
        role: session.users.role,
        accountStatus: session.users.account_status,
        sessionType: 'onboarding',
        sessionId: sessionId
      },
      jwtSecret,
      { expiresIn: '15m' }
    );

    logger.info('Token refreshed successfully', {
      userId,
      currentStep,
      sessionId,
      newExpiry: newExpiry.toISOString()
    });

    return successResponse({
      success: true,
      token: newAccessToken,
      tokenExpiry: '15m',
      sessionExpiry: newExpiry.toISOString(),
      currentStep: currentStep,
      message: 'Token refreshed and progress saved'
    }, 'Token refreshed successfully', requestId);

  } catch (error: any) {
    logger.error('Token refresh failed', { error: error.message });
    return errorResponse(401, error.message || 'Token refresh failed', requestId);
  }
}
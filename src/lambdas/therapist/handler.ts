/**
 * Fixed Therapist Lambda Handler
 * 
 * This version uses only columns that actually exist in the database
 * and ensures proper schema path configuration.
 */

import { APIGatewayProxyEvent, APIGatewayProxyResult } from 'aws-lambda';
import { query, queryOne } from '../../lib/database';
import { createLogger, PerformanceMonitor } from '../../shared/logger';
import { successResponse, errorResponse, validationErrorResponse } from '../../shared/response';

const logger = createLogger('therapist-service');

export const handler = async (event: APIGatewayProxyEvent): Promise<APIGatewayProxyResult> => {
  const requestId = event.requestContext.requestId;
  const path = event.path;
  const method = event.httpMethod;
  
  const logContext = {
    requestId,
    path,
    method,
    userAgent: event.headers['User-Agent'],
    ip: event.requestContext.identity.sourceIp
  };

  logger.info('Therapist request received', logContext);

  try {
    // Handle CORS preflight
    if (method === 'OPTIONS') {
      return successResponse({}, 'CORS preflight', requestId);
    }

    // Route to appropriate handler
    if (path === '/api/therapist' && method === 'GET') {
      return await handleGetAllTherapists(event, requestId, logContext);
    }
    
    if (path === '/api/therapist/search' && method === 'GET') {
      return await handleAdvancedSearch(event, requestId, logContext);
    }
    
    if (path.match(/^\/api\/therapist\/\d+$/) && method === 'GET') {
      const therapistId = path.split('/').pop();
      return await handleGetTherapist(therapistId!, requestId, logContext);
    }

    return errorResponse(404, 'Route not found', requestId);

  } catch (error: any) {
    logger.error('Unhandled error in therapist handler', logContext, error);
    return errorResponse(500, 'Internal server error', requestId);
  }
};

/**
 * Get all therapists (verified and active only)
 */
async function handleGetAllTherapists(
  event: APIGatewayProxyEvent,
  requestId: string,
  logContext: any
): Promise<APIGatewayProxyResult> {
  const monitor = new PerformanceMonitor(logger, 'get_all_therapists', logContext);
  
  try {
    const { status, search } = event.queryStringParameters || {};

    // Simple, safe query that works with existing schema
    let sql = `
      SELECT 
        u.id, 
        u.first_name, 
        u.last_name, 
        u.email, 
        u.phone_number, 
        u.account_status, 
        u.profile_image_url,
        u.created_at,
        u.verification_stage,
        tp.bio_short,
        tp.highest_degree,
        tp.clinical_specialties,
        o.name as organization_name
      FROM users u
      INNER JOIN therapists tp ON u.id = tp.user_id
      LEFT JOIN organizations o ON u.organization_id = o.id
      WHERE u.role = 'therapist' AND u.account_status = 'active'
    `;

    const params: any[] = [];
    let paramIndex = 1;

    // Add search filter if provided
    if (search) {
      sql += ` AND (
        LOWER(u.first_name) LIKE LOWER($${paramIndex}) OR 
        LOWER(u.last_name) LIKE LOWER($${paramIndex}) OR 
        LOWER(u.email) LIKE LOWER($${paramIndex})
      )`;
      params.push(`%${search}%`);
      paramIndex++;
    }

    sql += ` ORDER BY u.created_at DESC`;

    const therapists = await query(sql, params);

    monitor.end(true, { count: therapists.length });
    
    return successResponse({
      therapists,
      total: therapists.length
    }, 'Therapists retrieved successfully', requestId);

  } catch (error: any) {
    logger.error('Get all therapists error', logContext, error);
    monitor.end(false);
    return errorResponse(500, 'Failed to retrieve therapists', requestId);
  }
}

/**
 * Get single therapist by ID - SAFE VERSION
 */
async function handleGetTherapist(
  therapistId: string,
  requestId: string,
  logContext: any
): Promise<APIGatewayProxyResult> {
  const monitor = new PerformanceMonitor(logger, 'get_therapist', { ...logContext, therapistId });
  
  try {
    // Use only columns that definitely exist
    const therapist = await queryOne(`
      SELECT 
        u.id, 
        u.first_name, 
        u.last_name, 
        u.email, 
        u.phone_number, 
        u.account_status, 
        u.profile_image_url,
        u.created_at,
        u.verification_stage,
        tp.bio_short,
        tp.bio_extended,
        tp.short_bio,
        tp.extended_bio,
        tp.highest_degree,
        tp.years_of_experience,
        tp.clinical_specialties,
        tp.therapeutic_modalities,
        tp.session_formats,
        tp.new_clients_capacity,
        tp.languages_spoken,
        tp.timezone,
        o.name as organization_name
      FROM users u
      INNER JOIN therapists tp ON u.id = tp.user_id
      LEFT JOIN organizations o ON u.organization_id = o.id
      WHERE u.id = $1 AND u.role = 'therapist'
    `, [therapistId]);

    if (!therapist) {
      monitor.end(false);
      return errorResponse(404, 'Therapist not found', requestId);
    }

    // Transform safely
    const transformedTherapist = {
      id: therapist.id,
      first_name: therapist.first_name,
      last_name: therapist.last_name,
      email: therapist.email,
      phone_number: therapist.phone_number,
      account_status: therapist.account_status,
      profile_image_url: therapist.profile_image_url,
      created_at: therapist.created_at,
      verification_stage: therapist.verification_stage,
      
      // Bio information (use what's available)
      bio: therapist.bio_extended || therapist.extended_bio || therapist.bio_short || therapist.short_bio || '',
      short_bio: therapist.bio_short || therapist.short_bio || '',
      extended_bio: therapist.bio_extended || therapist.extended_bio || '',
      
      // Professional information
      highest_degree: therapist.highest_degree || '',
      years_of_experience: therapist.years_of_experience || 0,
      
      // Specialties (safely parse JSONB)
      clinical_specialties: therapist.clinical_specialties || {},
      therapeutic_modalities: therapist.therapeutic_modalities || {},
      session_formats: therapist.session_formats || {},
      
      // Capacity and availability
      new_clients_capacity: therapist.new_clients_capacity || 0,
      accepting_new_clients: (therapist.new_clients_capacity || 0) > 0,
      
      // Other information
      languages_spoken: Array.isArray(therapist.languages_spoken) ? therapist.languages_spoken : 
                       (therapist.languages_spoken ? [therapist.languages_spoken] : []),
      timezone: therapist.timezone || 'UTC',
      organization_name: therapist.organization_name || ''
    };

    monitor.end(true);
    
    return successResponse({
      therapist: transformedTherapist
    }, 'Therapist retrieved successfully', requestId);

  } catch (error: any) {
    logger.error('Get therapist error', logContext, error);
    monitor.end(false);
    return errorResponse(500, 'Failed to retrieve therapist', requestId);
  }
}

/**
 * Advanced therapist search - SAFE VERSION
 */
async function handleAdvancedSearch(
  event: APIGatewayProxyEvent,
  requestId: string,
  logContext: any
): Promise<APIGatewayProxyResult> {
  const monitor = new PerformanceMonitor(logger, 'advanced_therapist_search', logContext);
  
  try {
    const {
      search,
      specialty,
      limit = '20',
      offset = '0'
    } = event.queryStringParameters || {};

    // Safe query using only existing columns
    let sql = `
      SELECT 
        u.id, 
        u.first_name, 
        u.last_name, 
        u.email, 
        u.profile_image_url,
        tp.bio_short,
        tp.bio_extended,
        tp.short_bio,
        tp.extended_bio,
        tp.clinical_specialties,
        tp.therapeutic_modalities,
        tp.highest_degree,
        tp.years_of_experience,
        tp.new_clients_capacity,
        tp.languages_spoken,
        tp.timezone,
        (COALESCE(tp.new_clients_capacity, 0) > 0) as accepting_new_clients
      FROM users u
      INNER JOIN therapists tp ON u.id = tp.user_id
      WHERE u.role = 'therapist' 
        AND COALESCE(u.account_status, 'active') = 'active'
    `;

    const params: any[] = [];
    let paramIndex = 1;

    // Text search
    if (search) {
      sql += ` AND (
        LOWER(u.first_name) LIKE LOWER($${paramIndex}) OR 
        LOWER(u.last_name) LIKE LOWER($${paramIndex}) OR 
        LOWER(COALESCE(tp.bio_short, '')) LIKE LOWER($${paramIndex}) OR
        LOWER(COALESCE(tp.bio_extended, '')) LIKE LOWER($${paramIndex})
      )`;
      params.push(`%${search}%`);
      paramIndex++;
    }

    // Specialty filter
    if (specialty) {
      sql += ` AND (
        tp.clinical_specialties IS NOT NULL AND 
        tp.clinical_specialties::text ILIKE $${paramIndex}
      )`;
      params.push(`%${specialty}%`);
      paramIndex++;
    }

    sql += ` ORDER BY accepting_new_clients DESC, u.created_at DESC`;
    sql += ` LIMIT $${paramIndex} OFFSET $${paramIndex + 1}`;
    params.push(parseInt(limit));
    params.push(parseInt(offset));

    const therapists = await query(sql, params);

    // Transform results safely
    const transformedTherapists = therapists.map((row: any) => {
      const bio = row.bio_extended || row.extended_bio || row.bio_short || row.short_bio || '';
      
      return {
        id: row.id,
        first_name: row.first_name,
        last_name: row.last_name,
        email: row.email,
        profile_image_url: row.profile_image_url,
        bio: bio,
        short_bio: row.bio_short || row.short_bio || '',
        highest_degree: row.highest_degree || '',
        years_of_experience: row.years_of_experience || 0,
        accepting_new_clients: row.accepting_new_clients || false,
        new_clients_capacity: row.new_clients_capacity || 0,
        languages_spoken: Array.isArray(row.languages_spoken) ? row.languages_spoken : 
                         (row.languages_spoken ? [row.languages_spoken] : []),
        timezone: row.timezone || 'UTC',
        created_at: row.created_at
      };
    });

    monitor.end(true, { count: transformedTherapists.length });
    
    return successResponse({
      therapists: transformedTherapists,
      total: transformedTherapists.length,
      pagination: {
        limit: parseInt(limit),
        offset: parseInt(offset),
        has_more: transformedTherapists.length === parseInt(limit)
      }
    }, 'Advanced therapist search completed', requestId);

  } catch (error: any) {
    logger.error('Advanced search error', logContext, error);
    monitor.end(false);
    return errorResponse(500, 'Failed to search therapists', requestId);
  }
}

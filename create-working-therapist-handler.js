#!/usr/bin/env node

/**
 * Create Working Therapist Handler
 * 
 * This script creates a simplified therapist handler that works with the actual database schema
 */

const fs = require('fs');

const workingHandler = `/**
 * Therapist Lambda Handler - Working Version
 * 
 * Simplified version that works with the actual ataraxia database schema
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
    
    if (path.match(/^\\/api\\/therapist\\/\\d+$/) && method === 'GET') {
      const therapistId = path.split('/').pop();
      return await handleGetTherapist(therapistId!, requestId, logContext);
    }
    
    if (path.match(/^\\/api\\/therapist\\/\\d+$/) && method === 'PUT') {
      const therapistId = path.split('/').pop();
      return await handleUpdateTherapist(therapistId!, event, requestId, logContext);
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
    const { search } = event.queryStringParameters || {};

    let sql = \`
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
        tp.clinical_specialties,
        tp.highest_degree,
        o.name as organization_name,
        tv.license_number,
        tv.license_state,
        tv.background_check_status,
        tv.license_verified,
        tv.verification_notes
      FROM users u
      INNER JOIN therapists tp ON u.id = tp.user_id
      LEFT JOIN organizations o ON u.organization_id = o.id
      LEFT JOIN therapist_verifications tv ON u.id = tv.user_id
      WHERE u.role = 'therapist' AND u.account_status = 'active'
    \`;

    const params: any[] = [];
    let paramIndex = 1;

    // Add search filter if provided
    if (search) {
      sql += \` AND (
        LOWER(u.first_name) LIKE LOWER($\${paramIndex}) OR 
        LOWER(u.last_name) LIKE LOWER($\${paramIndex}) OR 
        LOWER(u.email) LIKE LOWER($\${paramIndex})
      )\`;
      params.push(\`%\${search}%\`);
      paramIndex++;
    }

    sql += \` ORDER BY u.created_at DESC\`;

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
 * Get single therapist by ID with comprehensive profile data
 */
async function handleGetTherapist(
  therapistId: string,
  requestId: string,
  logContext: any
): Promise<APIGatewayProxyResult> {
  const monitor = new PerformanceMonitor(logger, 'get_therapist', { ...logContext, therapistId });
  
  try {
    const therapist = await queryOne(\`
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
        -- Therapist profile data (using actual field names)
        tp.bio_short,
        tp.bio_extended,
        tp.approach_description,
        tp.what_to_expect_description,
        tp.highest_degree,
        tp.institution_name,
        tp.graduation_year,
        tp.years_of_experience,
        tp.clinical_specialties,
        tp.therapeutic_modalities,
        tp.personal_style,
        tp.demographic_preferences,
        tp.session_formats,
        tp.new_clients_capacity,
        tp.max_caseload_capacity,
        tp.session_lengths_offered,
        tp.accepted_insurances,
        tp.languages_spoken,
        tp.weekly_schedule,
        tp.insurance_panels_accepted,
        tp.medicaid_acceptance,
        tp.medicare_acceptance,
        tp.self_pay_accepted,
        tp.sliding_scale,
        tp.what_clients_can_expect,
        tp.my_approach_to_therapy,
        tp.timezone,
        o.name as organization_name,
        -- Verification data
        tv.license_number,
        tv.license_state,
        tv.license_verified,
        tv.verification_status,
        tv.background_check_status,
        tv.verification_notes,
        tv.reviewed_at
      FROM users u
      INNER JOIN therapists tp ON u.id = tp.user_id
      LEFT JOIN organizations o ON u.organization_id = o.id
      LEFT JOIN therapist_verifications tv ON u.id = tv.user_id
      WHERE u.id = $1 AND u.role = 'therapist'
    \`, [therapistId]);

    if (!therapist) {
      monitor.end(false);
      return errorResponse(404, 'Therapist not found', requestId);
    }

    monitor.end(true);
    
    return successResponse({
      therapist
    }, 'Therapist retrieved successfully', requestId);

  } catch (error: any) {
    logger.error('Get therapist error', logContext, error);
    monitor.end(false);
    return errorResponse(500, 'Failed to retrieve therapist', requestId);
  }
}

/**
 * Advanced therapist search with actual database schema
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
      modality,
      language,
      new_clients_only,
      limit = '20',
      offset = '0'
    } = event.queryStringParameters || {};

    let sql = \`
      SELECT 
        u.id, 
        u.first_name, 
        u.last_name, 
        u.email, 
        u.profile_image_url,
        tp.bio_short,
        tp.bio_extended,
        tp.highest_degree,
        tp.years_of_experience,
        tp.clinical_specialties,
        tp.therapeutic_modalities,
        tp.session_formats,
        tp.new_clients_capacity,
        tp.max_caseload_capacity,
        tp.languages_spoken,
        tp.accepted_insurances,
        tp.medicaid_acceptance,
        tp.medicare_acceptance,
        tp.self_pay_accepted,
        tp.sliding_scale,
        o.name as organization_name,
        tv.license_verified,
        tv.verification_status,
        (tp.new_clients_capacity > 0) as accepting_new_clients
      FROM users u
      INNER JOIN therapists tp ON u.id = tp.user_id
      LEFT JOIN organizations o ON u.organization_id = o.id
      LEFT JOIN therapist_verifications tv ON u.id = tv.user_id
      WHERE u.role = 'therapist' 
        AND u.account_status = 'active' 
        AND u.is_verified = true
        AND tv.verification_status = 'approved'
    \`;

    const params: any[] = [];
    let paramIndex = 1;

    // Text search across name and bio
    if (search) {
      sql += \` AND (
        LOWER(u.first_name) LIKE LOWER($\${paramIndex}) OR 
        LOWER(u.last_name) LIKE LOWER($\${paramIndex}) OR 
        LOWER(tp.bio_short) LIKE LOWER($\${paramIndex}) OR
        LOWER(tp.bio_extended) LIKE LOWER($\${paramIndex})
      )\`;
      params.push(\`%\${search}%\`);
      paramIndex++;
    }

    // Specialty filter (JSONB)
    if (specialty) {
      sql += \` AND tp.clinical_specialties ? $\${paramIndex}\`;
      params.push(specialty);
      paramIndex++;
    }

    // Therapeutic modality filter (JSONB)
    if (modality) {
      sql += \` AND tp.therapeutic_modalities ? $\${paramIndex}\`;
      params.push(modality);
      paramIndex++;
    }

    // Language filter (array)
    if (language) {
      sql += \` AND $\${paramIndex} = ANY(tp.languages_spoken)\`;
      params.push(language);
      paramIndex++;
    }

    // New clients only
    if (new_clients_only === 'true') {
      sql += \` AND tp.new_clients_capacity > 0\`;
    }

    // Order by capacity and experience
    sql += \` ORDER BY 
      accepting_new_clients DESC,
      tp.years_of_experience DESC,
      u.created_at DESC
    \`;

    // Pagination
    sql += \` LIMIT $\${paramIndex} OFFSET $\${paramIndex + 1}\`;
    params.push(parseInt(limit));
    params.push(parseInt(offset));

    const therapists = await query(sql, params);

    // Transform results for display
    const transformedTherapists = therapists.map((row: any) => {
      // Parse JSONB specialties for display
      let specialties: string[] = [];
      if (row.clinical_specialties && typeof row.clinical_specialties === 'object') {
        specialties = Object.keys(row.clinical_specialties).filter(k => row.clinical_specialties[k]);
      }

      let modalities: string[] = [];
      if (row.therapeutic_modalities && typeof row.therapeutic_modalities === 'object') {
        modalities = Object.keys(row.therapeutic_modalities).filter(k => row.therapeutic_modalities[k]);
      }

      return {
        id: row.id,
        first_name: row.first_name,
        last_name: row.last_name,
        email: row.email,
        profile_image_url: row.profile_image_url,
        bio_short: row.bio_short,
        bio_extended: row.bio_extended,
        highest_degree: row.highest_degree,
        years_of_experience: row.years_of_experience,
        specialties: specialties.slice(0, 3), // Top 3 for display
        modalities: modalities.slice(0, 2), // Top 2 for display
        accepting_new_clients: row.accepting_new_clients,
        new_clients_capacity: row.new_clients_capacity,
        languages_spoken: row.languages_spoken || [],
        insurance_accepted: {
          panels: row.accepted_insurances || [],
          medicaid: row.medicaid_acceptance,
          medicare: row.medicare_acceptance,
          self_pay: row.self_pay_accepted,
          sliding_scale: row.sliding_scale
        },
        verification_status: row.verification_status,
        license_verified: row.license_verified,
        organization: row.organization_name
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

/**
 * Update therapist profile
 */
async function handleUpdateTherapist(
  therapistId: string,
  event: APIGatewayProxyEvent,
  requestId: string,
  logContext: any
): Promise<APIGatewayProxyResult> {
  const monitor = new PerformanceMonitor(logger, 'update_therapist', { ...logContext, therapistId });
  
  try {
    const body = JSON.parse(event.body || '{}');
    const {
      first_name,
      last_name,
      phone_number,
      bio_short,
      bio_extended,
      clinical_specialties,
      highest_degree,
      years_of_experience,
      profile_image_url
    } = body;

    // Update user table
    if (first_name || last_name || phone_number || profile_image_url) {
      const userUpdates: string[] = [];
      const userParams: any[] = [];
      let paramIndex = 1;

      if (first_name) {
        userUpdates.push(\`first_name = $\${paramIndex++}\`);
        userParams.push(first_name);
      }
      if (last_name) {
        userUpdates.push(\`last_name = $\${paramIndex++}\`);
        userParams.push(last_name);
      }
      if (phone_number) {
        userUpdates.push(\`phone_number = $\${paramIndex++}\`);
        userParams.push(phone_number);
      }
      if (profile_image_url) {
        userUpdates.push(\`profile_image_url = $\${paramIndex++}\`);
        userParams.push(profile_image_url);
      }

      userUpdates.push(\`updated_at = NOW()\`);
      userParams.push(therapistId);

      await query(\`
        UPDATE users 
        SET \${userUpdates.join(', ')}
        WHERE id = $\${paramIndex}
      \`, userParams);
    }

    // Update therapist profile
    if (bio_short || bio_extended || clinical_specialties || highest_degree || years_of_experience !== undefined) {
      const therapistUpdates: string[] = [];
      const therapistParams: any[] = [];
      let paramIndex = 1;

      if (bio_short) {
        therapistUpdates.push(\`bio_short = $\${paramIndex++}\`);
        therapistParams.push(bio_short);
      }
      if (bio_extended) {
        therapistUpdates.push(\`bio_extended = $\${paramIndex++}\`);
        therapistParams.push(bio_extended);
      }
      if (clinical_specialties) {
        therapistUpdates.push(\`clinical_specialties = $\${paramIndex++}\`);
        therapistParams.push(JSON.stringify(clinical_specialties));
      }
      if (highest_degree) {
        therapistUpdates.push(\`highest_degree = $\${paramIndex++}\`);
        therapistParams.push(highest_degree);
      }
      if (years_of_experience !== undefined) {
        therapistUpdates.push(\`years_of_experience = $\${paramIndex++}\`);
        therapistParams.push(years_of_experience);
      }

      therapistUpdates.push(\`updated_at = NOW()\`);
      therapistParams.push(therapistId);

      await query(\`
        UPDATE therapists 
        SET \${therapistUpdates.join(', ')}
        WHERE user_id = $\${paramIndex}
      \`, therapistParams);
    }

    monitor.end(true);
    
    return successResponse({
      message: 'Therapist profile updated successfully'
    }, 'Profile updated', requestId);

  } catch (error: any) {
    logger.error('Update therapist error', logContext, error);
    monitor.end(false);
    return errorResponse(500, 'Failed to update therapist profile', requestId);
  }
}
`;

console.log('Creating working therapist handler...');
fs.writeFileSync('../src/lambdas/therapist/handler.ts', workingHandler);
console.log('✅ Working therapist handler created');
console.log('');
console.log('🔧 Next steps:');
console.log('  1. npm run build');
console.log('  2. Deploy with CDK');
console.log('  3. Test the API endpoints');
/**
 * Therapist Lambda Handler
 * 
 * Comprehensive therapist service with complete business logic from Ataraxia_backend:
 * - Advanced profile management with 50+ fields
 * - JSONB specialty and modality handling
 * - Insurance panel management
 * - Capacity and caseload tracking
 * - Document management workflow
 * - Advanced search and filtering
 * - Therapist-client matching compatibility
 * - Compliance and verification tracking
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
    
    if (path.match(/^\/api\/therapist\/\d+$/) && method === 'PUT') {
      const therapistId = path.split('/').pop();
      return await handleUpdateTherapist(therapistId!, event, requestId, logContext);
    }
    
    if (path.match(/^\/api\/therapist\/\d+\/availability$/) && method === 'PUT') {
      const therapistId = path.split('/').pop()?.replace('/availability', '');
      return await handleUpdateAvailability(therapistId!, event, requestId, logContext);
    }

    if (path.match(/^\/api\/therapist\/\d+\/specialties$/) && method === 'PUT') {
      const therapistId = path.split('/').pop()?.replace('/specialties', '');
      return await handleUpdateSpecialties(therapistId!, event, requestId, logContext);
    }

    if (path.match(/^\/api\/therapist\/\d+\/insurance$/) && method === 'PUT') {
      const therapistId = path.split('/').pop()?.replace('/insurance', '');
      return await handleUpdateInsurance(therapistId!, event, requestId, logContext);
    }

    if (path.match(/^\/api\/therapist\/\d+\/capacity$/) && method === 'GET') {
      const therapistId = path.split('/').pop()?.replace('/capacity', '');
      return await handleGetCapacity(therapistId!, requestId, logContext);
    }

    if (path.match(/^\/api\/therapist\/\d+\/capacity$/) && method === 'PUT') {
      const therapistId = path.split('/').pop()?.replace('/capacity', '');
      return await handleUpdateCapacity(therapistId!, event, requestId, logContext);
    }

    if (path.match(/^\/api\/therapist\/matching\/\d+$/) && method === 'GET') {
      const clientId = path.split('/').pop();
      return await handleGetMatchingTherapists(clientId!, event, requestId, logContext);
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

    // Only show records from therapists table (verified, active therapists)
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
        tp.clinical_specialties,
        tp.highest_degree as degree,
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
 * Get single therapist by ID with comprehensive profile data
 */
async function handleGetTherapist(
  therapistId: string,
  requestId: string,
  logContext: any
): Promise<APIGatewayProxyResult> {
  const monitor = new PerformanceMonitor(logger, 'get_therapist', { ...logContext, therapistId });
  
  try {
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
        -- Comprehensive therapist profile data
        tp.gender,
        tp.date_of_birth,
        tp.timezone,
        tp.phone_country_code,
        tp.languages_spoken,
        tp.profile_photo_url,
        tp.selected_avatar_url,
        tp.headshot_url,
        tp.highest_degree,
        tp.institution_name,
        tp.graduation_year,
        tp.years_of_experience,
        tp.bio_short as bio,
        tp.bio_extended,
        tp.short_bio,
        tp.clinical_specialties,
        tp.life_context_specialties,
        tp.therapeutic_modalities,
        tp.personal_style,
        tp.demographic_preferences,
        tp.session_formats,
        tp.new_clients_capacity,
        tp.max_caseload_capacity,
        tp.client_intake_speed,
        tp.emergency_same_day_capacity,
        tp.preferred_scheduling_density,
        tp.weekly_schedule,
        tp.session_lengths_offered as session_durations,
        tp.insurance_panels_accepted,
        tp.medicaid_acceptance,
        tp.medicare_acceptance,
        tp.self_pay_accepted,
        tp.sliding_scale,
        tp.employer_eaps,
        tp.hipaa_training_completed,
        tp.ethics_certification,
        tp.signed_baa,
        tp.background_check_status,
        tp.what_clients_can_expect,
        tp.my_approach_to_therapy,
        tp.address_line1,
        tp.address_line2,
        tp.city,
        tp.state,
        tp.zip_code,
        tp.country,
        o.name as organization_name,
        -- Verification data
        tv.license_number,
        tv.license_state,
        tv.license_type,
        tv.license_expiry,
        tv.license_verified,
        tv.npi_number,
        tv.licensing_authority,
        tv.malpractice_insurance_provider,
        tv.malpractice_policy_number,
        tv.malpractice_expiry,
        tv.verification_status,
        tv.background_check_status as verification_bg_status,
        tv.background_check_result,
        tv.verification_notes,
        tv.reviewed_at
      FROM users u
      INNER JOIN therapists tp ON u.id = tp.user_id
      LEFT JOIN organizations o ON u.organization_id = o.id
      LEFT JOIN therapist_verifications tv ON u.id = tv.user_id
      WHERE u.id = $1 AND u.role = 'therapist'
    `, [therapistId]);

    if (!therapist) {
      monitor.end(false);
      return errorResponse(404, 'Therapist not found', requestId);
    }

    // Transform JSONB fields for easier consumption
    const transformedTherapist = {
      // Basic user info
      id: therapist.id,
      first_name: therapist.first_name,
      last_name: therapist.last_name,
      email: therapist.email,
      phone_number: therapist.phone_number,
      account_status: therapist.account_status,
      profile_image_url: therapist.profile_image_url,
      created_at: therapist.created_at,
      verification_stage: therapist.verification_stage,

      // Personal information
      gender: therapist.gender,
      date_of_birth: therapist.date_of_birth,
      timezone: therapist.timezone,
      phone_country_code: therapist.phone_country_code,
      languages_spoken: therapist.languages_spoken || [],

      // Profile images
      profile_photo_url: therapist.profile_photo_url,
      selected_avatar_url: therapist.selected_avatar_url,
      headshot_url: therapist.headshot_url,

      // Professional information
      highest_degree: therapist.highest_degree,
      institution_name: therapist.institution_name,
      graduation_year: therapist.graduation_year,
      years_of_experience: therapist.years_of_experience,
      bio: therapist.bio,
      extended_bio: therapist.extended_bio,
      short_bio: therapist.short_bio,

      // Specialties and modalities (parsed from JSONB)
      clinical_specialties: therapist.clinical_specialties || {},
      life_context_specialties: therapist.life_context_specialties || {},
      therapeutic_modalities: therapist.therapeutic_modalities || {},
      personal_style: therapist.personal_style || {},
      demographic_preferences: therapist.demographic_preferences || {},

      // Practice information
      session_formats: therapist.session_formats || {},
      new_clients_capacity: therapist.new_clients_capacity,
      max_caseload_capacity: therapist.max_caseload_capacity,
      client_intake_speed: therapist.client_intake_speed,
      emergency_same_day_capacity: therapist.emergency_same_day_capacity,
      preferred_scheduling_density: therapist.preferred_scheduling_density,
      weekly_schedule: therapist.weekly_schedule || {},
      session_durations: therapist.session_durations || [],

      // Insurance and compliance
      insurance_panels_accepted: therapist.insurance_panels_accepted || [],
      medicaid_acceptance: therapist.medicaid_acceptance,
      medicare_acceptance: therapist.medicare_acceptance,
      self_pay_accepted: therapist.self_pay_accepted,
      sliding_scale: therapist.sliding_scale,
      employer_eaps: therapist.employer_eaps || [],
      hipaa_training_completed: therapist.hipaa_training_completed,
      ethics_certification: therapist.ethics_certification,
      signed_baa: therapist.signed_baa,
      background_check_status: therapist.background_check_status,

      // Profile content
      what_clients_can_expect: therapist.what_clients_can_expect,
      my_approach_to_therapy: therapist.my_approach_to_therapy,

      // Address information
      address: {
        line1: therapist.address_line1,
        line2: therapist.address_line2,
        city: therapist.city,
        state: therapist.state,
        zip_code: therapist.zip_code,
        country: therapist.country
      },

      // Organization
      organization_name: therapist.organization_name,

      // Verification information
      verification: {
        license_number: therapist.license_number,
        license_state: therapist.license_state,
        license_type: therapist.license_type,
        license_expiry: therapist.license_expiry,
        license_verified: therapist.license_verified,
        npi_number: therapist.npi_number,
        licensing_authority: therapist.licensing_authority,
        malpractice_insurance_provider: therapist.malpractice_insurance_provider,
        malpractice_policy_number: therapist.malpractice_policy_number,
        malpractice_expiry: therapist.malpractice_expiry,
        verification_status: therapist.verification_status,
        background_check_status: therapist.verification_bg_status,
        background_check_result: therapist.background_check_result || {},
        verification_notes: therapist.verification_notes,
        reviewed_at: therapist.reviewed_at
      }
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
      clinical_specialties,
      highest_degree,
      years_of_experience,
      bio,
      profile_image_url
    } = body;

    // Update user table
    if (first_name || last_name || phone_number || profile_image_url) {
      const userUpdates: string[] = [];
      const userParams: any[] = [];
      let paramIndex = 1;

      if (first_name) {
        userUpdates.push(`first_name = $${paramIndex++}`);
        userParams.push(first_name);
      }
      if (last_name) {
        userUpdates.push(`last_name = $${paramIndex++}`);
        userParams.push(last_name);
      }
      if (phone_number) {
        userUpdates.push(`phone_number = $${paramIndex++}`);
        userParams.push(phone_number);
      }
      if (profile_image_url) {
        userUpdates.push(`profile_image_url = $${paramIndex++}`);
        userParams.push(profile_image_url);
      }

      userUpdates.push(`updated_at = NOW()`);
      userParams.push(therapistId);

      await query(`
        UPDATE users 
        SET ${userUpdates.join(', ')}
        WHERE id = $${paramIndex}
      `, userParams);
    }

    // Update therapist profile
    if (clinical_specialties || highest_degree || years_of_experience || bio) {
      const therapistUpdates: string[] = [];
      const therapistParams: any[] = [];
      let paramIndex = 1;

      if (clinical_specialties) {
        therapistUpdates.push(`clinical_specialties = $${paramIndex++}`);
        therapistParams.push(JSON.stringify(clinical_specialties));
      }
      if (highest_degree) {
        therapistUpdates.push(`highest_degree = $${paramIndex++}`);
        therapistParams.push(highest_degree);
      }
      if (years_of_experience !== undefined) {
        therapistUpdates.push(`years_of_experience = $${paramIndex++}`);
        therapistParams.push(years_of_experience);
      }
      if (bio) {
        therapistUpdates.push(`bio = $${paramIndex++}`);
        therapistParams.push(bio);
      }

      therapistUpdates.push(`updated_at = NOW()`);
      therapistParams.push(therapistId);

      await query(`
        UPDATE therapists 
        SET ${therapistUpdates.join(', ')}
        WHERE user_id = $${paramIndex}
      `, therapistParams);
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

/**
 * Advanced therapist search with comprehensive filtering
 * Supports location, specialty, insurance, availability, and capacity filters
 */

/**
 * Advanced therapist search with comprehensive filtering
 * Simplified version that works with existing database schema
 */

/**
 * Advanced therapist search - Compatible with actual database schema
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
      city,
      state,
      specialty,
      limit = '20',
      offset = '0'
    } = event.queryStringParameters || {};

    // Query using actual column names from the schema
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
        -- Actual therapist columns
        tp.bio_short,
        tp.bio_extended,
        tp.short_bio,
        tp.extended_bio,
        tp.approach_description,
        tp.what_to_expect_description,
        tp.clinical_specialties,
        tp.therapeutic_modalities,
        tp.personal_style,
        tp.demographic_preferences,
        tp.highest_degree,
        tp.years_of_experience,
        tp.session_formats,
        tp.new_clients_capacity,
        tp.max_caseload_capacity,
        tp.session_capacity_weekly,
        tp.emergency_same_day_capacity,
        tp.insurance_panels_accepted,
        tp.accepted_insurances,
        tp.medicaid_acceptance,
        tp.medicare_acceptance,
        tp.self_pay_accepted,
        tp.sliding_scale,
        tp.languages_spoken,
        tp.timezone,
        o.name as organization_name,
        tv.license_number,
        tv.license_state,
        tv.license_verified,
        tv.verification_status,
        (COALESCE(tp.new_clients_capacity, 0) > 0) as accepting_new_clients
      FROM users u
      INNER JOIN therapists tp ON u.id = tp.user_id
      LEFT JOIN organizations o ON u.organization_id = o.id
      LEFT JOIN therapist_verifications tv ON u.id = tv.user_id
      WHERE u.role = 'therapist' 
        AND COALESCE(u.account_status, 'active') = 'active'
        AND COALESCE(u.is_active, true) = true
    `;

    const params: any[] = [];
    let paramIndex = 1;

    // Text search across name and bio fields
    if (search) {
      sql += ` AND (
        LOWER(u.first_name) LIKE LOWER($${paramIndex}) OR 
        LOWER(u.last_name) LIKE LOWER($${paramIndex}) OR 
        LOWER(COALESCE(tp.bio_short, '')) LIKE LOWER($${paramIndex}) OR
        LOWER(COALESCE(tp.bio_extended, '')) LIKE LOWER($${paramIndex}) OR
        LOWER(COALESCE(tp.short_bio, '')) LIKE LOWER($${paramIndex}) OR
        LOWER(COALESCE(tp.extended_bio, '')) LIKE LOWER($${paramIndex})
      )`;
      params.push(`%${search}%`);
      paramIndex++;
    }

    // Specialty filter (JSONB check)
    if (specialty) {
      sql += ` AND (
        tp.clinical_specialties IS NOT NULL AND 
        tp.clinical_specialties::text ILIKE $${paramIndex}
      )`;
      params.push(`%${specialty}%`);
      paramIndex++;
    }

    // Order by relevance
    sql += ` ORDER BY 
      accepting_new_clients DESC,
      COALESCE(tp.years_of_experience, 0) DESC,
      u.created_at DESC
    `;

    // Pagination
    sql += ` LIMIT $${paramIndex} OFFSET $${paramIndex + 1}`;
    params.push(parseInt(limit));
    params.push(parseInt(offset));

    const therapists = await query(sql, params);

    // Transform results safely
    const transformedTherapists = therapists.map((row: any) => {
      // Parse specialties safely
      let specialties: string[] = [];
      try {
        if (row.clinical_specialties && typeof row.clinical_specialties === 'object') {
          specialties = Object.keys(row.clinical_specialties).filter(k => 
            row.clinical_specialties[k] === true || row.clinical_specialties[k] === 'true'
          );
        }
      } catch (e) {
        // Ignore parsing errors
      }

      // Parse modalities safely
      let modalities: string[] = [];
      try {
        if (row.therapeutic_modalities && typeof row.therapeutic_modalities === 'object') {
          modalities = Object.keys(row.therapeutic_modalities).filter(k => 
            row.therapeutic_modalities[k] === true || row.therapeutic_modalities[k] === 'true'
          );
        }
      } catch (e) {
        // Ignore parsing errors
      }

      // Parse session formats safely
      let sessionFormats: string[] = [];
      try {
        if (row.session_formats && typeof row.session_formats === 'object') {
          sessionFormats = Object.keys(row.session_formats).filter(k => 
            row.session_formats[k] === true || row.session_formats[k] === 'true'
          );
        }
      } catch (e) {
        // Ignore parsing errors
      }

      // Get the best available bio
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
        specialties: specialties.slice(0, 3),
        modalities: modalities.slice(0, 2),
        session_formats: sessionFormats,
        accepting_new_clients: row.accepting_new_clients || false,
        new_clients_capacity: row.new_clients_capacity || 0,
        session_capacity_weekly: row.session_capacity_weekly || 0,
        verification_status: row.verification_status || 'pending',
        license_verified: row.license_verified || false,
        organization: row.organization_name || '',
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
      },
      filters_applied: {
        search: search || null,
        specialty: specialty || null
      }
    }, 'Advanced therapist search completed', requestId);

  } catch (error: any) {
    logger.error('Advanced search error', logContext, error);
    monitor.end(false);
    return errorResponse(500, 'Failed to search therapists', requestId);
  }
}


/**
 * Update therapist specialties and modalities (JSONB management)
 */
async function handleUpdateSpecialties(
  therapistId: string,
  event: APIGatewayProxyEvent,
  requestId: string,
  logContext: any
): Promise<APIGatewayProxyResult> {
  const monitor = new PerformanceMonitor(logger, 'update_specialties', { ...logContext, therapistId });
  
  try {
    const body = JSON.parse(event.body || '{}');
    const {
      clinical_specialties,
      life_context_specialties,
      therapeutic_modalities,
      personal_style,
      demographic_preferences
    } = body;

    const updates: string[] = [];
    const params: any[] = [];
    let paramIndex = 1;

    if (clinical_specialties) {
      updates.push(`clinical_specialties = $${paramIndex++}`);
      params.push(JSON.stringify(clinical_specialties));
    }

    if (life_context_specialties) {
      updates.push(`life_context_specialties = $${paramIndex++}`);
      params.push(JSON.stringify(life_context_specialties));
    }

    if (therapeutic_modalities) {
      updates.push(`therapeutic_modalities = $${paramIndex++}`);
      params.push(JSON.stringify(therapeutic_modalities));
    }

    if (personal_style) {
      updates.push(`personal_style = $${paramIndex++}`);
      params.push(JSON.stringify(personal_style));
    }

    if (demographic_preferences) {
      updates.push(`demographic_preferences = $${paramIndex++}`);
      params.push(JSON.stringify(demographic_preferences));
    }

    if (updates.length === 0) {
      return validationErrorResponse('No specialty data provided', requestId);
    }

    updates.push(`updated_at = NOW()`);
    params.push(therapistId);

    await query(`
      UPDATE therapists 
      SET ${updates.join(', ')}
      WHERE user_id = $${paramIndex}
    `, params);

    monitor.end(true);
    
    return successResponse({
      message: 'Specialties updated successfully'
    }, 'Specialties updated', requestId);

  } catch (error: any) {
    logger.error('Update specialties error', logContext, error);
    monitor.end(false);
    return errorResponse(500, 'Failed to update specialties', requestId);
  }
}

/**
 * Update therapist insurance panel acceptance
 */
async function handleUpdateInsurance(
  therapistId: string,
  event: APIGatewayProxyEvent,
  requestId: string,
  logContext: any
): Promise<APIGatewayProxyResult> {
  const monitor = new PerformanceMonitor(logger, 'update_insurance', { ...logContext, therapistId });
  
  try {
    const body = JSON.parse(event.body || '{}');
    const {
      insurance_panels_accepted,
      medicaid_acceptance,
      medicare_acceptance,
      self_pay_accepted,
      sliding_scale,
      employer_eaps
    } = body;

    const updates: string[] = [];
    const params: any[] = [];
    let paramIndex = 1;

    if (insurance_panels_accepted !== undefined) {
      updates.push(`insurance_panels_accepted = $${paramIndex++}`);
      params.push(JSON.stringify(insurance_panels_accepted));
    }

    if (medicaid_acceptance !== undefined) {
      updates.push(`medicaid_acceptance = $${paramIndex++}`);
      params.push(medicaid_acceptance);
    }

    if (medicare_acceptance !== undefined) {
      updates.push(`medicare_acceptance = $${paramIndex++}`);
      params.push(medicare_acceptance);
    }

    if (self_pay_accepted !== undefined) {
      updates.push(`self_pay_accepted = $${paramIndex++}`);
      params.push(self_pay_accepted);
    }

    if (sliding_scale !== undefined) {
      updates.push(`sliding_scale = $${paramIndex++}`);
      params.push(sliding_scale);
    }

    if (employer_eaps !== undefined) {
      updates.push(`employer_eaps = $${paramIndex++}`);
      params.push(JSON.stringify(employer_eaps));
    }

    if (updates.length === 0) {
      return validationErrorResponse('No insurance data provided', requestId);
    }

    updates.push(`updated_at = NOW()`);
    params.push(therapistId);

    await query(`
      UPDATE therapists 
      SET ${updates.join(', ')}
      WHERE user_id = $${paramIndex}
    `, params);

    monitor.end(true);
    
    return successResponse({
      message: 'Insurance settings updated successfully'
    }, 'Insurance updated', requestId);

  } catch (error: any) {
    logger.error('Update insurance error', logContext, error);
    monitor.end(false);
    return errorResponse(500, 'Failed to update insurance settings', requestId);
  }
}

/**
 * Get therapist capacity and caseload information
 */
async function handleGetCapacity(
  therapistId: string,
  requestId: string,
  logContext: any
): Promise<APIGatewayProxyResult> {
  const monitor = new PerformanceMonitor(logger, 'get_capacity', { ...logContext, therapistId });
  
  try {
    const therapist = await queryOne(`
      SELECT 
        tp.new_clients_capacity,
        tp.max_caseload_capacity,
        tp.emergency_same_day_capacity,
        tp.preferred_scheduling_density,
        tp.client_intake_speed,
        -- Calculate current caseload (placeholder - would need appointments/clients table)
        0 as current_active_clients,
        0 as current_weekly_appointments,
        tp.weekly_schedule,
        tp.session_durations
      FROM therapists tp
      WHERE tp.user_id = $1
    `, [therapistId]);

    if (!therapist) {
      monitor.end(false);
      return errorResponse(404, 'Therapist not found', requestId);
    }

    // Calculate availability metrics
    const availableNewClientSlots = Math.max(0, therapist.new_clients_capacity - therapist.current_active_clients);
    const totalCapacityUsed = therapist.max_caseload_capacity > 0 
      ? (therapist.current_active_clients / therapist.max_caseload_capacity) * 100 
      : 0;

    monitor.end(true);
    
    return successResponse({
      capacity: {
        new_clients_capacity: therapist.new_clients_capacity,
        max_caseload_capacity: therapist.max_caseload_capacity,
        current_active_clients: therapist.current_active_clients,
        available_new_client_slots: availableNewClientSlots,
        capacity_utilization_percent: Math.round(totalCapacityUsed),
        emergency_same_day_capacity: therapist.emergency_same_day_capacity,
        preferred_scheduling_density: therapist.preferred_scheduling_density,
        client_intake_speed: therapist.client_intake_speed
      },
      schedule: {
        weekly_schedule: therapist.weekly_schedule,
        session_durations: therapist.session_durations,
        current_weekly_appointments: therapist.current_weekly_appointments
      }
    }, 'Capacity information retrieved', requestId);

  } catch (error: any) {
    logger.error('Get capacity error', logContext, error);
    monitor.end(false);
    return errorResponse(500, 'Failed to retrieve capacity information', requestId);
  }
}

/**
 * Update therapist capacity settings
 */
async function handleUpdateCapacity(
  therapistId: string,
  event: APIGatewayProxyEvent,
  requestId: string,
  logContext: any
): Promise<APIGatewayProxyResult> {
  const monitor = new PerformanceMonitor(logger, 'update_capacity', { ...logContext, therapistId });
  
  try {
    const body = JSON.parse(event.body || '{}');
    const {
      new_clients_capacity,
      max_caseload_capacity,
      emergency_same_day_capacity,
      preferred_scheduling_density,
      client_intake_speed
    } = body;

    const updates: string[] = [];
    const params: any[] = [];
    let paramIndex = 1;

    if (new_clients_capacity !== undefined) {
      updates.push(`new_clients_capacity = $${paramIndex++}`);
      params.push(new_clients_capacity);
    }

    if (max_caseload_capacity !== undefined) {
      updates.push(`max_caseload_capacity = $${paramIndex++}`);
      params.push(max_caseload_capacity);
    }

    if (emergency_same_day_capacity !== undefined) {
      updates.push(`emergency_same_day_capacity = $${paramIndex++}`);
      params.push(emergency_same_day_capacity);
    }

    if (preferred_scheduling_density) {
      updates.push(`preferred_scheduling_density = $${paramIndex++}`);
      params.push(preferred_scheduling_density);
    }

    if (client_intake_speed) {
      updates.push(`client_intake_speed = $${paramIndex++}`);
      params.push(client_intake_speed);
    }

    if (updates.length === 0) {
      return validationErrorResponse('No capacity data provided', requestId);
    }

    updates.push(`updated_at = NOW()`);
    params.push(therapistId);

    await query(`
      UPDATE therapists 
      SET ${updates.join(', ')}
      WHERE user_id = $${paramIndex}
    `, params);

    monitor.end(true);
    
    return successResponse({
      message: 'Capacity settings updated successfully'
    }, 'Capacity updated', requestId);

  } catch (error: any) {
    logger.error('Update capacity error', logContext, error);
    monitor.end(false);
    return errorResponse(500, 'Failed to update capacity settings', requestId);
  }
}

/**
 * Get matching therapists for a specific client
 * Implements compatibility scoring algorithm
 */
async function handleGetMatchingTherapists(
  clientId: string,
  event: APIGatewayProxyEvent,
  requestId: string,
  logContext: any
): Promise<APIGatewayProxyResult> {
  const monitor = new PerformanceMonitor(logger, 'get_matching_therapists', { ...logContext, clientId });
  
  try {
    const { limit = '10' } = event.queryStringParameters || {};

    // First, get client preferences and requirements
    const client = await queryOne(`
      SELECT 
        u.id,
        c.preferred_session_format,
        c.preferred_session_duration,
        c.preferred_therapist_gender,
        c.therapy_goals,
        c.insurance_provider,
        c.city,
        c.state,
        c.safety_risk_level
      FROM users u
      INNER JOIN clients c ON u.id = c.user_id
      WHERE u.id = $1 AND u.role = 'client'
    `, [clientId]);

    if (!client) {
      monitor.end(false);
      return errorResponse(404, 'Client not found', requestId);
    }

    // Find matching therapists with compatibility scoring
    const sql = `
      SELECT 
        u.id,
        u.first_name,
        u.last_name,
        u.profile_image_url,
        tp.bio,
        tp.short_bio,
        tp.highest_degree,
        tp.years_of_experience,
        tp.clinical_specialties,
        tp.therapeutic_modalities,
        tp.session_formats,
        tp.gender,
        tp.new_clients_capacity,
        tp.insurance_panels_accepted,
        tp.medicaid_acceptance,
        tp.medicare_acceptance,
        tp.self_pay_accepted,
        tp.city,
        tp.state,
        -- Compatibility scoring
        CASE 
          WHEN tp.gender = $2 OR $2 IS NULL THEN 20 
          ELSE 0 
        END +
        CASE 
          WHEN tp.session_formats ? $3 OR $3 IS NULL THEN 15 
          ELSE 0 
        END +
        CASE 
          WHEN tp.city = $4 AND tp.state = $5 THEN 10 
          WHEN tp.state = $5 THEN 5 
          ELSE 0 
        END +
        CASE 
          WHEN tp.new_clients_capacity > 0 THEN 25 
          ELSE 0 
        END +
        CASE 
          WHEN tp.years_of_experience >= 5 THEN 10 
          WHEN tp.years_of_experience >= 2 THEN 5 
          ELSE 0 
        END as compatibility_score
      FROM users u
      INNER JOIN therapists tp ON u.id = tp.user_id
      LEFT JOIN therapist_verifications tv ON u.id = tv.user_id
      WHERE u.role = 'therapist' 
        AND u.account_status = 'active' 
        AND u.is_verified = true
        AND tv.verification_status = 'approved'
        AND tp.new_clients_capacity > 0
      ORDER BY compatibility_score DESC, tp.years_of_experience DESC
      LIMIT $6
    `;

    const matchingTherapists = await query(sql, [
      clientId,
      client.preferred_therapist_gender,
      client.preferred_session_format,
      client.city,
      client.state,
      parseInt(limit)
    ]);

    // Transform results with detailed compatibility info
    const transformedMatches = matchingTherapists.map((row: any) => {
      const specialties = row.clinical_specialties && typeof row.clinical_specialties === 'object'
        ? Object.keys(row.clinical_specialties).filter(k => row.clinical_specialties[k])
        : [];

      const modalities = row.therapeutic_modalities && typeof row.therapeutic_modalities === 'object'
        ? Object.keys(row.therapeutic_modalities).filter(k => row.therapeutic_modalities[k])
        : [];

      const sessionFormats = row.session_formats && typeof row.session_formats === 'object'
        ? Object.keys(row.session_formats).filter(k => row.session_formats[k])
        : [];

      return {
        id: row.id,
        first_name: row.first_name,
        last_name: row.last_name,
        profile_image_url: row.profile_image_url,
        bio: row.bio,
        short_bio: row.short_bio,
        highest_degree: row.highest_degree,
        years_of_experience: row.years_of_experience,
        specialties: specialties.slice(0, 5),
        modalities: modalities.slice(0, 3),
        session_formats: sessionFormats,
        location: `${row.city || ''}, ${row.state || ''}`.replace(/^,\s*|,\s*$/g, ''),
        new_clients_capacity: row.new_clients_capacity,
        compatibility_score: row.compatibility_score,
        match_reasons: generateMatchReasons(row, client)
      };
    });

    monitor.end(true, { matches: transformedMatches.length });
    
    return successResponse({
      matches: transformedMatches,
      client_preferences: {
        preferred_session_format: client.preferred_session_format,
        preferred_therapist_gender: client.preferred_therapist_gender,
        therapy_goals: client.therapy_goals,
        location: `${client.city || ''}, ${client.state || ''}`.replace(/^,\s*|,\s*$/g, '')
      },
      total: transformedMatches.length
    }, 'Matching therapists found', requestId);

  } catch (error: any) {
    logger.error('Get matching therapists error', logContext, error);
    monitor.end(false);
    return errorResponse(500, 'Failed to find matching therapists', requestId);
  }
}

/**
 * Generate human-readable match reasons
 */
function generateMatchReasons(therapist: any, client: any): string[] {
  const reasons: string[] = [];

  if (therapist.gender === client.preferred_therapist_gender) {
    reasons.push(`Matches your gender preference (${therapist.gender})`);
  }

  if (therapist.session_formats && client.preferred_session_format && 
      typeof therapist.session_formats === 'object' && 
      therapist.session_formats[client.preferred_session_format]) {
    reasons.push(`Offers ${client.preferred_session_format} sessions`);
  }

  if (therapist.city === client.city && therapist.state === client.state) {
    reasons.push('Located in your area');
  } else if (therapist.state === client.state) {
    reasons.push('Located in your state');
  }

  if (therapist.new_clients_capacity > 0) {
    reasons.push('Currently accepting new clients');
  }

  if (therapist.years_of_experience >= 10) {
    reasons.push('Highly experienced (10+ years)');
  } else if (therapist.years_of_experience >= 5) {
    reasons.push('Experienced therapist (5+ years)');
  }

  return reasons.slice(0, 3); // Top 3 reasons
}

/**
 * Update therapist availability
 */
async function handleUpdateAvailability(
  therapistId: string,
  event: APIGatewayProxyEvent,
  requestId: string,
  logContext: any
): Promise<APIGatewayProxyResult> {
  const monitor = new PerformanceMonitor(logger, 'update_availability', { ...logContext, therapistId });
  
  try {
    const body = JSON.parse(event.body || '{}');
    const {
      weekly_schedule,
      session_durations,
      session_formats,
      timezone,
      new_clients_capacity,
      max_caseload_capacity,
      emergency_same_day_capacity,
      preferred_scheduling_density
    } = body;

    const updates: string[] = [];
    const params: any[] = [];
    let paramIndex = 1;

    if (weekly_schedule) {
      updates.push(`weekly_schedule = $${paramIndex++}`);
      params.push(JSON.stringify(weekly_schedule));
    }
    if (session_durations) {
      updates.push(`session_durations = $${paramIndex++}`);
      params.push(session_durations);
    }
    if (session_formats) {
      updates.push(`session_formats = $${paramIndex++}`);
      params.push(JSON.stringify(session_formats));
    }
    if (timezone) {
      updates.push(`timezone = $${paramIndex++}`);
      params.push(timezone);
    }
    if (new_clients_capacity !== undefined) {
      updates.push(`new_clients_capacity = $${paramIndex++}`);
      params.push(new_clients_capacity);
    }
    if (max_caseload_capacity !== undefined) {
      updates.push(`max_caseload_capacity = $${paramIndex++}`);
      params.push(max_caseload_capacity);
    }
    if (emergency_same_day_capacity !== undefined) {
      updates.push(`emergency_same_day_capacity = $${paramIndex++}`);
      params.push(emergency_same_day_capacity);
    }
    if (preferred_scheduling_density) {
      updates.push(`preferred_scheduling_density = $${paramIndex++}`);
      params.push(preferred_scheduling_density);
    }

    if (updates.length === 0) {
      return validationErrorResponse('No availability data provided', requestId);
    }

    updates.push(`updated_at = NOW()`);
    params.push(therapistId);

    await query(`
      UPDATE therapists 
      SET ${updates.join(', ')}
      WHERE user_id = $${paramIndex}
    `, params);

    monitor.end(true);
    
    return successResponse({
      message: 'Availability updated successfully'
    }, 'Availability updated', requestId);

  } catch (error: any) {
    logger.error('Update availability error', logContext, error);
    monitor.end(false);
    return errorResponse(500, 'Failed to update availability', requestId);
  }
}
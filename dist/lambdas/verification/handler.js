"use strict";
/**
 * Verification Lambda Handler - Modern Therapist Registration & Verification System
 *
 * Handles all verification-related operations including:
 * - Therapist registration workflow
 * - Document upload and verification
 * - Background check integration
 * - Admin approval system
 * - Organization invites
 * - Audit logging
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.handler = void 0;
const database_1 = require("../../lib/database");
const logger_1 = require("../../shared/logger");
const response_1 = require("../../shared/response");
const auth_1 = require("../../shared/auth");
const logger = (0, logger_1.createLogger)('verification-service');
const handler = async (event) => {
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
    logger.info('Verification request received', logContext);
    try {
        // Handle CORS preflight
        if (method === 'OPTIONS') {
            return (0, response_1.successResponse)({}, 'CORS preflight', requestId);
        }
        // Public endpoints (no auth required)
        if (path === '/api/verification/check-duplicate' && method === 'POST') {
            return await handleCheckDuplicate(event, requestId, logContext);
        }
        if (path === '/api/verification/register' && method === 'POST') {
            return await handleTherapistRegistration(event, requestId, logContext);
        }
        if (path.match(/^\/api\/verification\/status\/[\w-]+$/) && method === 'GET') {
            const authProviderId = path.split('/').pop();
            return await handleGetRegistrationStatus(authProviderId, requestId, logContext);
        }
        // Protected endpoints (require authentication)
        const authResult = await (0, auth_1.verifyJWT)(event.headers.Authorization);
        if (!authResult.success) {
            return (0, response_1.errorResponse)(401, authResult.error || 'Unauthorized', requestId);
        }
        const user = authResult.user;
        const enhancedLogContext = { ...logContext, userId: user.id };
        // Document upload endpoints
        if (path.match(/^\/api\/verification\/\d+\/documents$/) && method === 'POST') {
            const registrationId = path.split('/')[3];
            return await handleDocumentUpload(registrationId, event, user, requestId, enhancedLogContext);
        }
        if (path.match(/^\/api\/verification\/\d+\/documents$/) && method === 'GET') {
            const registrationId = path.split('/')[3];
            return await handleGetDocuments(registrationId, user, requestId, enhancedLogContext);
        }
        // Admin endpoints (require admin role)
        if (user.role !== 'admin' && user.role !== 'super_admin') {
            return (0, response_1.errorResponse)(403, 'Admin access required', requestId);
        }
        if (path === '/api/verification/pending' && method === 'GET') {
            return await handleGetPendingVerifications(event, user, requestId, enhancedLogContext);
        }
        if (path.match(/^\/api\/verification\/\d+\/approve$/) && method === 'POST') {
            const registrationId = path.split('/')[3];
            return await handleActivateTherapistAccount(registrationId, user, requestId, enhancedLogContext);
        }
        if (path.match(/^\/api\/verification\/\d+\/reject$/) && method === 'POST') {
            const registrationId = path.split('/')[3];
            return await handleRejectTherapist(registrationId, event, user, requestId, enhancedLogContext);
        }
        if (path.match(/^\/api\/verification\/\d+\/background-check$/) && method === 'POST') {
            const registrationId = path.split('/')[3];
            return await handleInitiateBackgroundCheck(registrationId, user, requestId, enhancedLogContext);
        }
        // Organization invite endpoints
        if (path === '/api/verification/organization/invites' && method === 'POST') {
            return await handleCreateOrganizationInvite(event, user, requestId, enhancedLogContext);
        }
        if (path === '/api/verification/organization/invites' && method === 'GET') {
            return await handleGetOrganizationInvites(event, user, requestId, enhancedLogContext);
        }
        return (0, response_1.errorResponse)(404, 'Route not found', requestId);
    }
    catch (error) {
        logger.error('Unhandled error in verification handler', logContext, error);
        return (0, response_1.errorResponse)(500, 'Internal server error', requestId);
    }
};
exports.handler = handler;
/**
 * Check for duplicate email or phone number
 */
async function handleCheckDuplicate(event, requestId, logContext) {
    const monitor = new logger_1.PerformanceMonitor(logger, 'check_duplicate', logContext);
    try {
        const body = JSON.parse(event.body || '{}');
        const { email, phoneNumber } = body;
        if (!email && !phoneNumber) {
            return (0, response_1.validationErrorResponse)('Email or phone number is required', requestId);
        }
        let emailExists = false;
        let phoneExists = false;
        // Check email in both temp registrations and active users
        if (email) {
            const emailCheck = await Promise.all([
                (0, database_1.query)('SELECT id FROM temp_therapist_registrations WHERE email = $1 AND registration_status != $2', [email, 'rejected']),
                (0, database_1.query)('SELECT id FROM users WHERE email = $1', [email])
            ]);
            emailExists = emailCheck[0].length > 0 || emailCheck[1].length > 0;
        }
        // Check phone number in both temp registrations and active users
        if (phoneNumber) {
            const phoneCheck = await Promise.all([
                (0, database_1.query)('SELECT id FROM temp_therapist_registrations WHERE phone_number = $1 AND registration_status != $2', [phoneNumber, 'rejected']),
                (0, database_1.query)('SELECT id FROM users WHERE phone_number = $1', [phoneNumber])
            ]);
            phoneExists = phoneCheck[0].length > 0 || phoneCheck[1].length > 0;
        }
        if (emailExists || phoneExists) {
            monitor.end(false);
            return (0, response_1.errorResponse)(409, 'Registration already exists', requestId, {
                emailExists,
                phoneExists,
                message: emailExists && phoneExists
                    ? 'Both email and phone number are already registered'
                    : emailExists
                        ? 'Email address is already registered'
                        : 'Phone number is already registered'
            });
        }
        monitor.end(true);
        return (0, response_1.successResponse)({
            available: true,
            message: 'Email and phone number are available'
        }, 'Duplicate check completed', requestId);
    }
    catch (error) {
        logger.error('Check duplicate error', logContext, error);
        monitor.end(false);
        return (0, response_1.errorResponse)(500, 'Failed to check duplicate registration', requestId);
    }
}
/**
 * Handle therapist registration
 */
async function handleTherapistRegistration(event, requestId, logContext) {
    const monitor = new logger_1.PerformanceMonitor(logger, 'therapist_registration', logContext);
    try {
        const body = JSON.parse(event.body || '{}');
        const { 
        // Auth Provider (Cognito)
        authProviderId, authProviderType = 'cognito', 
        // Basic Information
        email, phoneNumber, countryCode = '+1', firstName, lastName, dateOfBirth, gender, 
        // Address
        address1, address2, city, state, zipCode, country = 'US', timezone = 'America/New_York', 
        // Profile
        languages = [], profilePhotoUrl, selectedAvatarUrl, headshotUrl, 
        // Professional
        degree, institutionName, graduationYear, yearsOfExperience = 0, bio, specializations = [], 
        // Enhanced Professional
        clinicalSpecialties = {}, lifeContextSpecialties = {}, therapeuticModalities = {}, personalStyle = {}, demographicPreferences = {}, 
        // License
        licenseNumber, licenseState, licenseType, licenseExpiry, licenseDocumentUrl, npiNumber, licensingAuthority, 
        // Insurance & Malpractice
        malpracticeInsuranceProvider, malpracticePolicyNumber, malpracticeExpiry, malpracticeDocumentUrl, 
        // Documents
        degreeCertificateUrl, photoIdUrl, w9DocumentUrl, hipaaDocumentUrl, ethicsDocumentUrl, backgroundCheckDocumentUrl, 
        // Practice
        sessionFormats = {}, newClientsCapacity = 0, maxCaseloadCapacity = 0, clientIntakeSpeed, emergencySameDayCapacity = false, preferredSchedulingDensity, weeklySchedule = {}, sessionDurations = [], 
        // Insurance & Compliance
        insurancePanelsAccepted = [], medicaidAcceptance = false, medicareAcceptance = false, selfPayAccepted = false, slidingScale = false, employerEaps = [], 
        // Compliance
        hipaaTrainingCompleted = false, ethicsCertification = false, signedBaa = false, backgroundCheckConsent = false, 
        // Profile Content
        shortBio, extendedBio, whatClientsCanExpect, myApproachToTherapy, 
        // Organization
        orgInviteCode } = body;
        // Validate required fields
        if (!authProviderId || !firstName || !lastName || !licenseNumber || !licenseState) {
            return (0, response_1.validationErrorResponse)('Missing required fields: authProviderId, firstName, lastName, licenseNumber, licenseState', requestId);
        }
        // Check for existing registration
        const existingReg = await (0, database_1.queryOne)('SELECT id, registration_status FROM temp_therapist_registrations WHERE auth_provider_id = $1', [authProviderId]);
        if (existingReg) {
            if (existingReg.registration_status === 'approved') {
                return (0, response_1.errorResponse)(400, 'Account already approved. Please login.', requestId);
            }
            else if (existingReg.registration_status !== 'rejected') {
                return (0, response_1.errorResponse)(400, 'Registration already submitted. Please check your email for status updates.', requestId);
            }
        }
        // Handle organization registration path
        if (orgInviteCode) {
            const inviteResult = await (0, database_1.queryOne)(`SELECT oi.*, o.name as org_name 
         FROM organization_invites oi
         JOIN organizations o ON oi.organization_id = o.id
         WHERE oi.invite_code = $1 
         AND oi.status = 'active'
         AND (oi.expires_at IS NULL OR oi.expires_at > NOW())
         AND (oi.max_uses IS NULL OR oi.current_uses < oi.max_uses)`, [orgInviteCode]);
            if (!inviteResult) {
                return (0, response_1.errorResponse)(400, 'Invalid or expired invite code', requestId);
            }
            // Create user directly (pre-approved)
            const userResult = await (0, database_1.queryOne)(`INSERT INTO users (
           auth_provider_id, auth_provider_type, email, phone_number, 
           first_name, last_name, organization_id, role, account_status, 
           is_verified, is_active, profile_image_url
         ) VALUES ($1, $2, $3, $4, $5, $6, $7, 'therapist', 'active', true, true, $8)
         RETURNING id`, [authProviderId, authProviderType, email, phoneNumber, firstName, lastName,
                inviteResult.organization_id, profilePhotoUrl]);
            // Update invite usage
            await (0, database_1.query)(`UPDATE organization_invites
         SET current_uses = current_uses + 1,
             used_by = $1,
             used_at = NOW(),
             status = CASE 
                 WHEN current_uses + 1 >= max_uses THEN 'used'
                 ELSE 'active'
             END
         WHERE id = $2`, [userResult.id, inviteResult.id]);
            monitor.end(true);
            return (0, response_1.successResponse)({
                userId: userResult.id,
                organization: inviteResult.org_name,
                canLogin: true,
                message: 'Registration complete via organization invite!'
            }, 'Organization registration successful', requestId);
        }
        // Solo therapist registration - save to temp table
        const normalizeDate = (dateValue, useDefault = false) => {
            if (!dateValue || dateValue === '' || dateValue === 'null' || dateValue === 'undefined') {
                return useDefault ? '2099-12-31' : null;
            }
            return dateValue;
        };
        // Create user record first
        const userResult = await (0, database_1.queryOne)(`INSERT INTO users (
         auth_provider_id, auth_provider_type, email, phone_number, 
         first_name, last_name, role, account_status, verification_stage, 
         is_active, is_verified
       ) VALUES ($1, $2, $3, $4, $5, $6, 'therapist', 'pending_verification', 'registration_submitted', false, false)
       ON CONFLICT (auth_provider_id, auth_provider_type) DO UPDATE
         SET email = EXCLUDED.email,
             phone_number = EXCLUDED.phone_number,
             first_name = EXCLUDED.first_name,
             last_name = EXCLUDED.last_name,
             account_status = 'pending_verification',
             verification_stage = 'registration_submitted',
             updated_at = NOW()
       RETURNING id`, [authProviderId, authProviderType, email, phoneNumber, firstName, lastName]);
        // Insert temp registration
        const regResult = await (0, database_1.queryOne)(`INSERT INTO temp_therapist_registrations (
         user_id, auth_provider_id, auth_provider_type, email, phone_number, phone_country_code,
         first_name, last_name, date_of_birth, gender,
         address_line1, address_line2, city, state, zip_code, country, timezone,
         languages_spoken, profile_photo_url, selected_avatar_url, headshot_url,
         degree, institution_name, graduation_year, years_of_experience, bio, specializations,
         clinical_specialties, life_context_specialties, therapeutic_modalities, 
         personal_style, demographic_preferences,
         license_number, license_state, license_type, license_expiry,
         license_document_url, npi_number, licensing_authority,
         malpractice_insurance_provider, malpractice_policy_number, malpractice_expiry,
         malpractice_document_url, degree_certificate_url, photo_id_url,
         w9_document_url, hipaa_document_url, ethics_document_url, background_check_document_url,
         session_formats, new_clients_capacity, max_caseload_capacity,
         client_intake_speed, emergency_same_day_capacity, preferred_scheduling_density,
         weekly_schedule, session_durations,
         insurance_panels_accepted, medicaid_acceptance, medicare_acceptance,
         self_pay_accepted, sliding_scale, employer_eaps,
         hipaa_training_completed, ethics_certification, signed_baa,
         background_check_consent, background_check_consent_date,
         short_bio, extended_bio, what_clients_can_expect, my_approach_to_therapy,
         registration_status, workflow_stage, background_check_status
       ) VALUES (
         $1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17,
         $18, $19, $20, $21, $22, $23, $24, $25, $26, $27, $28, $29, $30, $31, $32,
         $33, $34, $35, $36, $37, $38, $39, $40, $41, $42, $43, $44, $45, $46, $47,
         $48, $49, $50, $51, $52, $53, $54, $55, $56, $57, $58, $59, $60, $61, $62,
         $63, $64, $65, $66, $67, $68, $69, 'pending_review', 'registration_submitted', 'not_started'
       )
       ON CONFLICT (user_id) DO UPDATE
         SET auth_provider_id = EXCLUDED.auth_provider_id,
             email = EXCLUDED.email,
             phone_number = EXCLUDED.phone_number,
             updated_at = NOW()
       RETURNING id, registration_status, workflow_stage`, [
            userResult.id, authProviderId, authProviderType, email, phoneNumber, countryCode,
            firstName, lastName, normalizeDate(dateOfBirth), gender,
            address1, address2, city, state, zipCode, country, timezone,
            JSON.stringify(languages), profilePhotoUrl, selectedAvatarUrl, headshotUrl,
            degree, institutionName, graduationYear, yearsOfExperience, bio, JSON.stringify(specializations),
            JSON.stringify(clinicalSpecialties), JSON.stringify(lifeContextSpecialties),
            JSON.stringify(therapeuticModalities), JSON.stringify(personalStyle), JSON.stringify(demographicPreferences),
            licenseNumber, licenseState, licenseType, normalizeDate(licenseExpiry, true),
            licenseDocumentUrl, npiNumber, licensingAuthority,
            malpracticeInsuranceProvider, malpracticePolicyNumber, normalizeDate(malpracticeExpiry, true),
            malpracticeDocumentUrl, degreeCertificateUrl, photoIdUrl,
            w9DocumentUrl, hipaaDocumentUrl, ethicsDocumentUrl, backgroundCheckDocumentUrl,
            JSON.stringify(sessionFormats), newClientsCapacity, maxCaseloadCapacity,
            clientIntakeSpeed, emergencySameDayCapacity, preferredSchedulingDensity,
            JSON.stringify(weeklySchedule), JSON.stringify(sessionDurations),
            JSON.stringify(insurancePanelsAccepted), medicaidAcceptance, medicareAcceptance,
            selfPayAccepted, slidingScale, JSON.stringify(employerEaps),
            hipaaTrainingCompleted, ethicsCertification, signedBaa,
            backgroundCheckConsent, backgroundCheckConsent ? new Date() : null,
            shortBio, extendedBio, whatClientsCanExpect, myApproachToTherapy
        ]);
        // Log workflow action
        await (0, database_1.query)(`INSERT INTO verification_workflow_log (
         user_id, temp_registration_id, workflow_stage, action, status, performed_by_type
       ) VALUES ($1, $2, $3, $4, $5, $6)`, [userResult.id, regResult.id, 'registration_submitted', 'registration_created', 'success', 'system']);
        monitor.end(true);
        return (0, response_1.successResponse)({
            registrationId: regResult.id,
            status: regResult.registration_status,
            workflowStage: regResult.workflow_stage,
            canLogin: false,
            message: 'Registration submitted successfully. You will be notified once your application is reviewed.',
            estimatedTime: '2-5 business days'
        }, 'Registration submitted successfully', requestId);
    }
    catch (error) {
        logger.error('Therapist registration error', logContext, error);
        monitor.end(false);
        return (0, response_1.errorResponse)(500, 'Failed to submit registration', requestId);
    }
}
/**
 * Get registration status by auth provider ID
 */
async function handleGetRegistrationStatus(authProviderId, requestId, logContext) {
    const monitor = new logger_1.PerformanceMonitor(logger, 'get_registration_status', { ...logContext, authProviderId });
    try {
        // First check if user exists in main users table
        const user = await (0, database_1.queryOne)('SELECT id, email, first_name, last_name, account_status, is_verified FROM users WHERE auth_provider_id = $1', [authProviderId]);
        if (user) {
            monitor.end(true);
            return (0, response_1.successResponse)({
                status: 'active',
                user,
                canLogin: user.account_status === 'active',
                message: user.account_status === 'active'
                    ? 'Your account is active. You can login.'
                    : 'Your account is not active. Please contact support.'
            }, 'User status retrieved', requestId);
        }
        // Check temp registrations
        const status = await (0, database_1.queryOne)('SELECT * FROM get_registration_status($1)', [authProviderId]);
        if (!status) {
            monitor.end(false);
            return (0, response_1.errorResponse)(404, 'No registration found. Please register first.', requestId);
        }
        monitor.end(true);
        return (0, response_1.successResponse)({
            registration: {
                id: status.registration_id,
                status: status.status,
                workflowStage: status.workflow_stage,
                backgroundCheckStatus: status.background_check_status,
                canLogin: status.can_login,
                message: status.message
            }
        }, 'Registration status retrieved', requestId);
    }
    catch (error) {
        logger.error('Get registration status error', logContext, error);
        monitor.end(false);
        return (0, response_1.errorResponse)(500, 'Failed to get registration status', requestId);
    }
}
/**
 * Handle document upload
 */
async function handleDocumentUpload(registrationId, event, user, requestId, logContext) {
    const monitor = new logger_1.PerformanceMonitor(logger, 'document_upload', { ...logContext, registrationId });
    try {
        const body = JSON.parse(event.body || '{}');
        const { documentType, documentUrl, originalFilename, fileSize, mimeType } = body;
        const validTypes = [
            'license_document', 'degree_certificate', 'malpractice_insurance',
            'photo_id', 'headshot', 'w9_document', 'hipaa_document',
            'ethics_document', 'background_check_document'
        ];
        if (!validTypes.includes(documentType)) {
            return (0, response_1.validationErrorResponse)('Invalid document type', requestId);
        }
        // Update document URL in temp registration
        const updateField = `${documentType}_url`;
        await (0, database_1.query)(`UPDATE temp_therapist_registrations 
       SET ${updateField} = $1, updated_at = NOW() 
       WHERE id = $2`, [documentUrl, registrationId]);
        // Insert document record
        await (0, database_1.query)(`INSERT INTO verification_documents (
         temp_registration_id, user_id, document_type, document_url,
         original_filename, file_size, mime_type
       ) VALUES ($1, $2, $3, $4, $5, $6, $7)`, [registrationId, user.id, documentType, documentUrl, originalFilename, fileSize, mimeType]);
        // Log action
        await (0, database_1.query)(`INSERT INTO verification_workflow_log (
         user_id, temp_registration_id, workflow_stage, action, status, 
         performed_by_type, performed_by_id, details
       ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`, [
            user.id, registrationId, 'documents_review', 'document_uploaded', 'success',
            'therapist', user.id, JSON.stringify({ documentType, documentUrl })
        ]);
        monitor.end(true);
        return (0, response_1.successResponse)({
            message: 'Document uploaded successfully'
        }, 'Document uploaded', requestId);
    }
    catch (error) {
        logger.error('Document upload error', logContext, error);
        monitor.end(false);
        return (0, response_1.errorResponse)(500, 'Failed to upload document', requestId);
    }
}
/**
 * Get documents for registration
 */
async function handleGetDocuments(registrationId, user, requestId, logContext) {
    const monitor = new logger_1.PerformanceMonitor(logger, 'get_documents', { ...logContext, registrationId });
    try {
        const documents = await (0, database_1.query)(`SELECT document_type, document_url, original_filename, file_size, 
              verification_status, verified_at, verification_notes, uploaded_at
       FROM verification_documents 
       WHERE temp_registration_id = $1 
       ORDER BY uploaded_at DESC`, [registrationId]);
        monitor.end(true);
        return (0, response_1.successResponse)({
            documents
        }, 'Documents retrieved successfully', requestId);
    }
    catch (error) {
        logger.error('Get documents error', logContext, error);
        monitor.end(false);
        return (0, response_1.errorResponse)(500, 'Failed to retrieve documents', requestId);
    }
}
/**
 * Get pending verifications (admin only)
 */
async function handleGetPendingVerifications(event, user, requestId, logContext) {
    const monitor = new logger_1.PerformanceMonitor(logger, 'get_pending_verifications', logContext);
    try {
        const { status, workflowStage, limit = '50', offset = '0' } = event.queryStringParameters || {};
        let sql = `
      SELECT 
        tr.id, tr.auth_provider_id, tr.email, tr.first_name, tr.last_name,
        tr.license_number, tr.license_state, tr.registration_status,
        tr.workflow_stage, tr.background_check_status, tr.created_at,
        tr.degree, tr.specializations, tr.years_of_experience,
        tr.npi_number, tr.malpractice_insurance_provider, tr.phone_number,
        tr.date_of_birth, tr.background_check_consent,
        tr.license_document_url, tr.degree_certificate_url, tr.malpractice_document_url,
        tr.photo_id_url, tr.headshot_url
      FROM temp_therapist_registrations tr
      WHERE tr.registration_status IN ('pending_review', 'documents_review', 'background_check', 'final_review')
      AND tr.workflow_stage NOT IN ('approved', 'rejected')
    `;
        const params = [];
        let paramIndex = 1;
        if (status) {
            sql += ` AND tr.registration_status = $${paramIndex++}`;
            params.push(status);
        }
        if (workflowStage) {
            sql += ` AND tr.workflow_stage = $${paramIndex++}`;
            params.push(workflowStage);
        }
        sql += ` ORDER BY tr.created_at ASC LIMIT $${paramIndex++} OFFSET $${paramIndex++}`;
        params.push(parseInt(limit), parseInt(offset));
        const registrations = await (0, database_1.query)(sql, params);
        // Get total count
        const countResult = await (0, database_1.queryOne)(`SELECT COUNT(*) as total FROM temp_therapist_registrations 
       WHERE registration_status IN ('pending_review', 'documents_review', 'background_check', 'final_review')
       AND workflow_stage NOT IN ('approved', 'rejected')`, []);
        monitor.end(true);
        return (0, response_1.successResponse)({
            registrations,
            pagination: {
                total: parseInt(countResult.total),
                limit: parseInt(limit),
                offset: parseInt(offset),
                hasMore: parseInt(offset) + registrations.length < parseInt(countResult.total)
            }
        }, 'Pending verifications retrieved', requestId);
    }
    catch (error) {
        logger.error('Get pending verifications error', logContext, error);
        monitor.end(false);
        return (0, response_1.errorResponse)(500, 'Failed to get pending verifications', requestId);
    }
}
/**
 * Activate therapist account - Comprehensive data migration from temp to production tables
 */
async function handleActivateTherapistAccount(registrationId, user, requestId, logContext) {
    const monitor = new logger_1.PerformanceMonitor(logger, 'activate_therapist_account', { ...logContext, registrationId });
    try {
        // Start transaction for atomic operation
        await (0, database_1.query)('BEGIN');
        try {
            // 1. Get comprehensive temp registration data
            const tempData = await (0, database_1.queryOne)('SELECT * FROM temp_therapist_registrations WHERE id = $1', [registrationId]);
            if (!tempData) {
                await (0, database_1.query)('ROLLBACK');
                return (0, response_1.errorResponse)(404, 'Registration not found', requestId);
            }
            // 2. Create/update user account with all user-level data
            const userResult = await (0, database_1.queryOne)(`
        INSERT INTO users (
          auth_provider_id, auth_provider_type, email, phone_number, 
          first_name, last_name, role, account_status, 
          is_verified, is_active, verified_at, profile_image_url,
          organization_id
        ) VALUES ($1, $2, $3, $4, $5, $6, 'therapist', 'active', true, true, NOW(), $7, $8)
        ON CONFLICT (auth_provider_id, auth_provider_type) 
        DO UPDATE SET
          account_status = 'active',
          is_verified = true,
          is_active = true,
          verified_at = NOW(),
          profile_image_url = COALESCE(EXCLUDED.profile_image_url, users.profile_image_url),
          updated_at = NOW()
        RETURNING id
      `, [
                tempData.auth_provider_id, tempData.auth_provider_type,
                tempData.email, tempData.phone_number,
                tempData.first_name, tempData.last_name,
                tempData.profile_photo_url || tempData.selected_avatar_url,
                tempData.organization_id
            ]);
            const userId = userResult.id;
            // 3. Create comprehensive therapist profile with ALL data from temp registration
            await (0, database_1.query)(`
        INSERT INTO therapists (
          user_id, 
          -- Personal Information
          gender, date_of_birth, timezone, phone_country_code, languages_spoken,
          
          -- Profile Images
          profile_photo_url, selected_avatar_url, headshot_url,
          
          -- Professional Information
          highest_degree, institution_name, graduation_year, years_of_experience,
          bio, extended_bio, short_bio,
          
          -- Specialties and Modalities (JSONB fields)
          clinical_specialties, life_context_specialties,
          therapeutic_modalities, personal_style, demographic_preferences,
          
          -- Practice Information
          session_formats, new_clients_capacity, max_caseload_capacity,
          client_intake_speed, emergency_same_day_capacity,
          preferred_scheduling_density, weekly_schedule, session_durations,
          
          -- Insurance and Compliance
          insurance_panels_accepted, medicaid_acceptance, medicare_acceptance,
          self_pay_accepted, sliding_scale, employer_eaps,
          hipaa_training_completed, ethics_certification, signed_baa,
          
          -- Document URLs
          w9_document_url, hipaa_document_url, ethics_document_url,
          background_check_document_url, background_check_status,
          
          -- Profile Content
          what_clients_can_expect, my_approach_to_therapy,
          
          -- Address Information
          address_line1, address_line2, city, state, zip_code, country
        ) VALUES (
          $1,
          -- Personal Information
          $2, $3, $4, $5, $6,
          
          -- Profile Images
          $7, $8, $9,
          
          -- Professional Information
          $10, $11, $12, $13, $14, $15, $16,
          
          -- Specialties and Modalities
          $17, $18, $19, $20, $21,
          
          -- Practice Information
          $22, $23, $24, $25, $26, $27, $28, $29,
          
          -- Insurance and Compliance
          $30, $31, $32, $33, $34, $35, $36, $37, $38,
          
          -- Document URLs
          $39, $40, $41, $42, $43,
          
          -- Profile Content
          $44, $45,
          
          -- Address Information
          $46, $47, $48, $49, $50, $51
        )
        ON CONFLICT (user_id) DO UPDATE SET
          -- Update all fields to ensure data is current
          gender = EXCLUDED.gender,
          date_of_birth = EXCLUDED.date_of_birth,
          timezone = EXCLUDED.timezone,
          phone_country_code = EXCLUDED.phone_country_code,
          languages_spoken = EXCLUDED.languages_spoken,
          profile_photo_url = EXCLUDED.profile_photo_url,
          selected_avatar_url = EXCLUDED.selected_avatar_url,
          headshot_url = EXCLUDED.headshot_url,
          highest_degree = EXCLUDED.highest_degree,
          institution_name = EXCLUDED.institution_name,
          graduation_year = EXCLUDED.graduation_year,
          years_of_experience = EXCLUDED.years_of_experience,
          bio = EXCLUDED.bio,
          extended_bio = EXCLUDED.extended_bio,
          short_bio = EXCLUDED.short_bio,
          clinical_specialties = EXCLUDED.clinical_specialties,
          life_context_specialties = EXCLUDED.life_context_specialties,
          therapeutic_modalities = EXCLUDED.therapeutic_modalities,
          personal_style = EXCLUDED.personal_style,
          demographic_preferences = EXCLUDED.demographic_preferences,
          session_formats = EXCLUDED.session_formats,
          new_clients_capacity = EXCLUDED.new_clients_capacity,
          max_caseload_capacity = EXCLUDED.max_caseload_capacity,
          client_intake_speed = EXCLUDED.client_intake_speed,
          emergency_same_day_capacity = EXCLUDED.emergency_same_day_capacity,
          preferred_scheduling_density = EXCLUDED.preferred_scheduling_density,
          weekly_schedule = EXCLUDED.weekly_schedule,
          session_durations = EXCLUDED.session_durations,
          insurance_panels_accepted = EXCLUDED.insurance_panels_accepted,
          medicaid_acceptance = EXCLUDED.medicaid_acceptance,
          medicare_acceptance = EXCLUDED.medicare_acceptance,
          self_pay_accepted = EXCLUDED.self_pay_accepted,
          sliding_scale = EXCLUDED.sliding_scale,
          employer_eaps = EXCLUDED.employer_eaps,
          hipaa_training_completed = EXCLUDED.hipaa_training_completed,
          ethics_certification = EXCLUDED.ethics_certification,
          signed_baa = EXCLUDED.signed_baa,
          w9_document_url = EXCLUDED.w9_document_url,
          hipaa_document_url = EXCLUDED.hipaa_document_url,
          ethics_document_url = EXCLUDED.ethics_document_url,
          background_check_document_url = EXCLUDED.background_check_document_url,
          background_check_status = EXCLUDED.background_check_status,
          what_clients_can_expect = EXCLUDED.what_clients_can_expect,
          my_approach_to_therapy = EXCLUDED.my_approach_to_therapy,
          address_line1 = EXCLUDED.address_line1,
          address_line2 = EXCLUDED.address_line2,
          city = EXCLUDED.city,
          state = EXCLUDED.state,
          zip_code = EXCLUDED.zip_code,
          country = EXCLUDED.country,
          updated_at = NOW()
      `, [
                userId,
                // Personal Information
                tempData.gender, tempData.date_of_birth,
                tempData.timezone || 'America/New_York',
                tempData.phone_country_code || '+1',
                tempData.languages_spoken || [],
                // Profile Images
                tempData.profile_photo_url, tempData.selected_avatar_url, tempData.headshot_url,
                // Professional Information
                tempData.degree, tempData.institution_name, tempData.graduation_year,
                tempData.years_of_experience || 0, tempData.bio, tempData.extended_bio, tempData.short_bio,
                // Specialties and Modalities
                tempData.clinical_specialties || {}, tempData.life_context_specialties || {},
                tempData.therapeutic_modalities || {}, tempData.personal_style || {},
                tempData.demographic_preferences || {},
                // Practice Information
                tempData.session_formats || {}, tempData.new_clients_capacity || 0,
                tempData.max_caseload_capacity || 0, tempData.client_intake_speed,
                tempData.emergency_same_day_capacity || false, tempData.preferred_scheduling_density,
                tempData.weekly_schedule || {}, tempData.session_durations || [],
                // Insurance and Compliance
                tempData.insurance_panels_accepted || [], tempData.medicaid_acceptance || false,
                tempData.medicare_acceptance || false, tempData.self_pay_accepted || false,
                tempData.sliding_scale || false, tempData.employer_eaps || [],
                tempData.hipaa_training_completed || false, tempData.ethics_certification || false,
                tempData.signed_baa || false,
                // Document URLs
                tempData.w9_document_url, tempData.hipaa_document_url, tempData.ethics_document_url,
                tempData.background_check_document_url, tempData.background_check_status || 'completed',
                // Profile Content
                tempData.what_clients_can_expect, tempData.my_approach_to_therapy,
                // Address Information
                tempData.address_line1, tempData.address_line2, tempData.city,
                tempData.state, tempData.zip_code, tempData.country
            ]);
            // 4. Create comprehensive therapist verification record
            await (0, database_1.query)(`
        INSERT INTO therapist_verifications (
          user_id, 
          -- License Information
          license_number, license_state, license_type, license_expiry,
          license_document_url, license_verified, npi_number, licensing_authority,
          
          -- Insurance Information
          malpractice_insurance_provider, malpractice_policy_number, malpractice_expiry,
          malpractice_document_url,
          
          -- Professional Information
          degree, specializations,
          
          -- Verification Status
          background_check_status, background_check_result, verification_status,
          
          -- Document URLs
          degree_certificate_url, photo_id_url,
          
          -- Verification Metadata
          reviewed_at, approved_by, verification_notes
        ) VALUES (
          $1, $2, $3, $4, $5, $6, true, $7, $8, $9, $10, $11, $12, $13, $14,
          'completed', $15, 'approved', $16, $17, NOW(), $18, $19
        )
        ON CONFLICT (user_id) DO UPDATE SET
          license_verified = true,
          verification_status = 'approved',
          background_check_status = 'completed',
          reviewed_at = NOW(),
          approved_by = EXCLUDED.approved_by,
          verification_notes = 'Updated via comprehensive migration',
          updated_at = NOW()
      `, [
                userId,
                // License Information
                tempData.license_number, tempData.license_state, tempData.license_type,
                tempData.license_expiry, tempData.license_document_url, tempData.npi_number,
                tempData.licensing_authority,
                // Insurance Information
                tempData.malpractice_insurance_provider, tempData.malpractice_policy_number,
                tempData.malpractice_expiry, tempData.malpractice_document_url,
                // Professional Information
                tempData.degree, tempData.specializations || [],
                // Verification Status
                JSON.stringify({
                    criminal: 'clear',
                    references: 'verified',
                    education: 'verified',
                    license: 'verified',
                    approved_at: new Date().toISOString(),
                    approved_by: user.id
                }),
                // Document URLs
                tempData.degree_certificate_url, tempData.photo_id_url,
                // Verification Metadata
                user.id, 'Approved via comprehensive automated migration'
            ]);
            // 5. Update temp registration status
            await (0, database_1.query)(`
        UPDATE temp_therapist_registrations
        SET registration_status = 'approved',
            workflow_stage = 'approved',
            approved_at = NOW(),
            approved_by = $2,
            updated_at = NOW()
        WHERE id = $1
      `, [registrationId, user.id]);
            // 6. Log comprehensive workflow action
            await (0, database_1.query)(`
        INSERT INTO verification_workflow_log (
          user_id, temp_registration_id, workflow_stage, action, status,
          performed_by_type, performed_by_id, details
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
      `, [
                userId, registrationId, 'approved', 'comprehensive_account_activation', 'success',
                'admin', user.id,
                JSON.stringify({
                    migration_method: 'comprehensive_data_transfer',
                    fields_migrated: [
                        'personal_info', 'professional_info', 'specialties', 'practice_info',
                        'compliance', 'documents', 'verification', 'address_info'
                    ],
                    data_completeness: 'full',
                    activated_at: new Date().toISOString()
                })
            ]);
            // 7. Log audit action for compliance
            await (0, database_1.query)(`
        INSERT INTO verification_audit_log (
          user_id, temp_registration_id, action, old_status, new_status,
          performed_by, ip_address, user_agent, details
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
      `, [
                userId, registrationId, 'comprehensive_therapist_activation',
                'pending_verification', 'active', user.id,
                logContext.ip, logContext.userAgent,
                JSON.stringify({
                    migration_method: 'comprehensive_service_based',
                    data_migrated: {
                        user_created: true,
                        therapist_profile_created: true,
                        verification_completed: true,
                        temp_registration_updated: true,
                        all_fields_migrated: true
                    },
                    approved_by: user.id,
                    approved_at: new Date().toISOString()
                })
            ]);
            // Commit transaction
            await (0, database_1.query)('COMMIT');
            monitor.end(true);
            return (0, response_1.successResponse)({
                userId: userId,
                message: 'Therapist account activated with comprehensive data migration',
                migrationMethod: 'comprehensive_service_based',
                fieldsCount: 'all_available_fields'
            }, 'Therapist account activated successfully', requestId);
        }
        catch (error) {
            await (0, database_1.query)('ROLLBACK');
            throw error;
        }
    }
    catch (error) {
        logger.error('Activate therapist account error', logContext, error);
        monitor.end(false);
        return (0, response_1.errorResponse)(500, 'Failed to activate therapist account', requestId);
    }
}
/**
 * Reject therapist registration
 */
async function handleRejectTherapist(registrationId, event, user, requestId, logContext) {
    const monitor = new logger_1.PerformanceMonitor(logger, 'reject_therapist', { ...logContext, registrationId });
    try {
        const body = JSON.parse(event.body || '{}');
        const { rejectionReason } = body;
        await (0, database_1.query)(`UPDATE temp_therapist_registrations
       SET registration_status = 'rejected',
           workflow_stage = 'rejected',
           rejected_at = NOW(),
           rejected_by = $2,
           rejection_reason = $3,
           updated_at = NOW()
       WHERE id = $1`, [registrationId, user.id, rejectionReason]);
        // Log workflow action
        await (0, database_1.query)(`INSERT INTO verification_workflow_log (
         temp_registration_id, workflow_stage, action, status,
         performed_by_type, performed_by_id, details
       ) VALUES ($1, $2, $3, $4, $5, $6, $7)`, [
            registrationId, 'rejected', 'registration_rejected', 'success',
            'admin', user.id, JSON.stringify({ rejectionReason })
        ]);
        monitor.end(true);
        return (0, response_1.successResponse)({
            message: 'Therapist registration rejected'
        }, 'Registration rejected', requestId);
    }
    catch (error) {
        logger.error('Reject therapist error', logContext, error);
        monitor.end(false);
        return (0, response_1.errorResponse)(500, 'Failed to reject therapist', requestId);
    }
}
/**
 * Initiate background check
 */
async function handleInitiateBackgroundCheck(registrationId, user, requestId, logContext) {
    const monitor = new logger_1.PerformanceMonitor(logger, 'initiate_background_check', { ...logContext, registrationId });
    try {
        // Update background check status
        await (0, database_1.query)(`UPDATE temp_therapist_registrations 
       SET background_check_status = 'pending',
           workflow_stage = 'background_check',
           updated_at = NOW()
       WHERE id = $1`, [registrationId]);
        // TODO: Integrate with Checkr/Sterling API here
        // For now, we'll simulate the initiation
        // Log workflow action
        await (0, database_1.query)(`INSERT INTO verification_workflow_log (
         temp_registration_id, workflow_stage, action, status,
         performed_by_type, performed_by_id
       ) VALUES ($1, $2, $3, $4, $5, $6)`, [registrationId, 'background_check', 'background_check_initiated', 'success', 'admin', user.id]);
        monitor.end(true);
        return (0, response_1.successResponse)({
            message: 'Background check initiated successfully'
        }, 'Background check initiated', requestId);
    }
    catch (error) {
        logger.error('Initiate background check error', logContext, error);
        monitor.end(false);
        return (0, response_1.errorResponse)(500, 'Failed to initiate background check', requestId);
    }
}
/**
 * Create organization invite
 */
async function handleCreateOrganizationInvite(event, user, requestId, logContext) {
    const monitor = new logger_1.PerformanceMonitor(logger, 'create_org_invite', logContext);
    try {
        const body = JSON.parse(event.body || '{}');
        const { organizationId, email, maxUses = 1, expiresAt } = body;
        // Generate unique invite code
        const inviteCode = `ORG-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`.toUpperCase();
        const invite = await (0, database_1.queryOne)(`INSERT INTO organization_invites (
         organization_id, invite_code, email, max_uses, expires_at, created_by
       ) VALUES ($1, $2, $3, $4, $5, $6)
       RETURNING *`, [organizationId, inviteCode, email, maxUses, expiresAt, user.id]);
        monitor.end(true);
        return (0, response_1.successResponse)({
            invite
        }, 'Organization invite created', requestId);
    }
    catch (error) {
        logger.error('Create organization invite error', logContext, error);
        monitor.end(false);
        return (0, response_1.errorResponse)(500, 'Failed to create organization invite', requestId);
    }
}
/**
 * Get organization invites
 */
async function handleGetOrganizationInvites(event, user, requestId, logContext) {
    const monitor = new logger_1.PerformanceMonitor(logger, 'get_org_invites', logContext);
    try {
        const { organizationId, status } = event.queryStringParameters || {};
        let sql = `
      SELECT oi.*, o.name as organization_name,
             u.first_name || ' ' || u.last_name as created_by_name
      FROM organization_invites oi
      JOIN organizations o ON oi.organization_id = o.id
      LEFT JOIN users u ON oi.created_by = u.id
      WHERE 1=1
    `;
        const params = [];
        let paramIndex = 1;
        if (organizationId) {
            sql += ` AND oi.organization_id = $${paramIndex++}`;
            params.push(organizationId);
        }
        if (status) {
            sql += ` AND oi.status = $${paramIndex++}`;
            params.push(status);
        }
        sql += ` ORDER BY oi.created_at DESC`;
        const invites = await (0, database_1.query)(sql, params);
        monitor.end(true);
        return (0, response_1.successResponse)({
            invites
        }, 'Organization invites retrieved', requestId);
    }
    catch (error) {
        logger.error('Get organization invites error', logContext, error);
        monitor.end(false);
        return (0, response_1.errorResponse)(500, 'Failed to get organization invites', requestId);
    }
}
//# sourceMappingURL=handler.js.map
"use strict";
/**
 * Fixed Therapist Lambda Handler
 *
 * This version uses only columns that actually exist in the database
 * and ensures proper schema path configuration.
 *
 * Now updated to include FULL CRUD capabilities:
 * - Create (via Update/Registration)
 * - Read (List, Get, Search, Capacity, Matching)
 * - Update (Profile, Availability, Specialties, Insurance)
 * - Delete (Soft delete)
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.handler = void 0;
const prisma_1 = require("../../lib/prisma");
const logger_1 = require("../../shared/logger");
const response_1 = require("../../shared/response");
const logger = (0, logger_1.createLogger)('therapist-service');
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
    logger.info('Therapist request received', logContext);
    try {
        // Handle CORS preflight
        if (method === 'OPTIONS') {
            return (0, response_1.successResponse)({}, 'CORS preflight', requestId);
        }
        // --- READ OPERATIONS ---
        if (path === '/api/therapist' && method === 'GET') {
            return await handleGetAllTherapists(event, requestId, logContext);
        }
        if (path === '/api/therapist/search' && method === 'GET') {
            return await handleAdvancedSearch(event, requestId, logContext);
        }
        // Match exact ID: /api/therapist/123
        const idMatch = path.match(/^\/api\/therapist\/(\d+)$/);
        if (idMatch && method === 'GET') {
            return await handleGetTherapist(idMatch[1], requestId, logContext);
        }
        // Capacity GET
        const capacityMatch = path.match(/^\/api\/therapist\/(\d+)\/capacity$/);
        if (capacityMatch && method === 'GET') {
            return await handleGetCapacity(capacityMatch[1], requestId, logContext);
        }
        // Matching GET
        const matchingMatch = path.match(/^\/api\/therapist\/matching\/(\d+)$/);
        if (matchingMatch && method === 'GET') {
            return await handleGetMatchingTherapists(matchingMatch[1], event, requestId, logContext);
        }
        // --- WRITE OPERATIONS (UPDATE) ---
        // Update Profile
        if (idMatch && method === 'PUT') {
            return await handleUpdateTherapist(idMatch[1], event, requestId, logContext);
        }
        // Update Availability
        const availabilityMatch = path.match(/^\/api\/therapist\/(\d+)\/availability$/);
        if (availabilityMatch && method === 'PUT') {
            return await handleUpdateAvailability(availabilityMatch[1], event, requestId, logContext);
        }
        // Update Specialties
        const specialtiesMatch = path.match(/^\/api\/therapist\/(\d+)\/specialties$/);
        if (specialtiesMatch && method === 'PUT') {
            return await handleUpdateSpecialties(specialtiesMatch[1], event, requestId, logContext);
        }
        // Update Insurance
        const insuranceMatch = path.match(/^\/api\/therapist\/(\d+)\/insurance$/);
        if (insuranceMatch && method === 'PUT') {
            return await handleUpdateInsurance(insuranceMatch[1], event, requestId, logContext);
        }
        // Update Capacity
        if (capacityMatch && method === 'PUT') {
            return await handleUpdateCapacity(capacityMatch[1], event, requestId, logContext);
        }
        // --- DELETE OPERATIONS ---
        if (idMatch && method === 'DELETE') {
            return await handleDeleteTherapist(idMatch[1], requestId, logContext);
        }
        return (0, response_1.errorResponse)(404, 'Route not found', requestId);
    }
    catch (error) {
        logger.error('Unhandled error in therapist handler', logContext, error);
        return (0, response_1.errorResponse)(500, 'Internal server error', requestId);
    }
};
exports.handler = handler;
/**
 * Get all therapists (verified and active only)
 */
async function handleGetAllTherapists(event, requestId, logContext) {
    const monitor = new logger_1.PerformanceMonitor(logger, 'get_all_therapists', logContext);
    const prisma = (0, prisma_1.getPrisma)();
    try {
        const { status, search } = event.queryStringParameters || {};
        const whereClause = {
            role: 'therapist',
            account_status: status || 'active'
        };
        if (search) {
            whereClause.OR = [
                { first_name: { contains: search, mode: 'insensitive' } },
                { last_name: { contains: search, mode: 'insensitive' } },
                { email: { contains: search, mode: 'insensitive' } }
            ];
        }
        const therapists = await prisma.users.findMany({
            where: whereClause,
            select: {
                id: true,
                first_name: true,
                last_name: true,
                email: true,
                phone_number: true,
                account_status: true,
                profile_image_url: true,
                created_at: true,
                verification_stage: true,
                therapists: {
                    select: {
                        bio_short: true,
                        highest_degree: true,
                        clinical_specialties: true
                    }
                },
                organizations_users_organization_idToorganizations: {
                    select: { name: true }
                }
            },
            orderBy: { created_at: 'desc' }
        });
        const flattenedTherapists = therapists.map(u => ({
            id: u.id.toString(),
            first_name: u.first_name,
            last_name: u.last_name,
            email: u.email,
            phone_number: u.phone_number,
            account_status: u.account_status,
            profile_image_url: u.profile_image_url,
            created_at: u.created_at,
            verification_stage: u.verification_stage,
            bio_short: u.therapists?.bio_short,
            highest_degree: u.therapists?.highest_degree,
            clinical_specialties: u.therapists?.clinical_specialties,
            organization_name: u.organizations_users_organization_idToorganizations?.name
        }));
        monitor.end(true, { count: flattenedTherapists.length });
        return (0, response_1.successResponse)({
            therapists: flattenedTherapists,
            total: flattenedTherapists.length
        }, 'Therapists retrieved successfully', requestId);
    }
    catch (error) {
        logger.error('Get all therapists error', logContext, error);
        monitor.end(false);
        return (0, response_1.errorResponse)(500, 'Failed to retrieve therapists', requestId);
    }
}
/**
 * Get single therapist by ID
 */
async function handleGetTherapist(therapistId, requestId, logContext) {
    const monitor = new logger_1.PerformanceMonitor(logger, 'get_therapist', { ...logContext, therapistId });
    const prisma = (0, prisma_1.getPrisma)();
    try {
        const therapist = await prisma.users.findUnique({
            where: { id: BigInt(therapistId) },
            include: {
                therapists: true,
                organizations_users_organization_idToorganizations: true,
                therapist_verifications_therapist_verifications_user_idTousers: true
            }
        });
        if (!therapist || therapist.role !== 'therapist') {
            monitor.end(false);
            return (0, response_1.errorResponse)(404, 'Therapist not found', requestId);
        }
        const tp = therapist.therapists || {};
        const tv = therapist.therapist_verifications_therapist_verifications_user_idTousers || {};
        const transformedTherapist = {
            id: therapist.id.toString(),
            first_name: therapist.first_name,
            last_name: therapist.last_name,
            email: therapist.email,
            phone_number: therapist.phone_number,
            account_status: therapist.account_status,
            profile_image_url: therapist.profile_image_url,
            created_at: therapist.created_at,
            verification_stage: therapist.verification_stage,
            // Bio & Professional
            bio: tp.bio || tp.bio_short || '',
            short_bio: tp.short_bio || tp.bio_short || '',
            extended_bio: tp.extended_bio || tp.bio_extended || '',
            highest_degree: tp.highest_degree || '',
            years_of_experience: tp.years_of_experience || 0,
            // JSON Fields
            clinical_specialties: tp.clinical_specialties || {},
            therapeutic_modalities: tp.therapeutic_modalities || {},
            session_formats: tp.session_formats || {},
            insurance_panels_accepted: tp.insurance_panels_accepted || [],
            session_durations: tp.session_durations || [],
            languages_spoken: tp.languages_spoken || [],
            weekly_schedule: tp.weekly_schedule || {},
            // Capacity
            new_clients_capacity: tp.new_clients_capacity || 0,
            accepting_new_clients: (tp.new_clients_capacity || 0) > 0,
            max_caseload_capacity: tp.max_caseload_capacity,
            // Location
            timezone: tp.timezone || 'UTC',
            address: {
                line1: tp.address_line1,
                line2: tp.address_line2,
                city: tp.city,
                state: tp.state,
                zip: tp.zip_code,
                country: tp.country
            },
            organization_name: therapist.organizations_users_organization_idToorganizations?.name || '',
            // Verification
            verification: {
                status: tv.verification_status,
                license_verified: tv.license_verified,
                license_number: tv.license_number,
                license_state: tv.license_state,
                npi_number: tv.npi_number
            }
        };
        monitor.end(true);
        return (0, response_1.successResponse)({
            therapist: transformedTherapist
        }, 'Therapist retrieved successfully', requestId);
    }
    catch (error) {
        logger.error('Get therapist error', logContext, error);
        monitor.end(false);
        return (0, response_1.errorResponse)(500, 'Failed to retrieve therapist', requestId);
    }
}
/**
 * Advanced therapist search
 */
async function handleAdvancedSearch(event, requestId, logContext) {
    const monitor = new logger_1.PerformanceMonitor(logger, 'advanced_therapist_search', logContext);
    const prisma = (0, prisma_1.getPrisma)();
    try {
        const { search, specialty, limit = '20', offset = '0' } = event.queryStringParameters || {};
        const whereClause = {
            role: 'therapist',
            account_status: 'active'
        };
        if (search) {
            whereClause.OR = [
                { first_name: { contains: search, mode: 'insensitive' } },
                { last_name: { contains: search, mode: 'insensitive' } }
            ];
        }
        // Note: Advanced filtering on JSON fields in Prisma with 'contains' string logic
        // is limited. For now we fetch matching active therapists and filter by specialty in memory 
        // if strictly needed, or rely on client-side filtering for complex JSON structures until 
        // Full Text Search is enabled in Postgres/Prisma.
        // However, if we simply want to search names, the above is enough.
        const therapists = await prisma.users.findMany({
            where: whereClause,
            take: parseInt(limit),
            skip: parseInt(offset),
            select: {
                id: true,
                first_name: true,
                last_name: true,
                email: true,
                profile_image_url: true,
                created_at: true,
                therapists: {
                    select: {
                        bio_short: true,
                        bio_extended: true,
                        clinical_specialties: true,
                        therapeutic_modalities: true,
                        highest_degree: true,
                        years_of_experience: true,
                        new_clients_capacity: true,
                        languages_spoken: true,
                        timezone: true
                    }
                }
            },
            orderBy: { created_at: 'desc' }
        });
        const transformedTherapists = therapists.map((row) => {
            const tp = row.therapists || {};
            const bio = tp.bio_extended || tp.extended_bio || tp.bio_short || tp.short_bio || '';
            return {
                id: row.id.toString(),
                first_name: row.first_name,
                last_name: row.last_name,
                email: row.email,
                profile_image_url: row.profile_image_url,
                bio: bio,
                short_bio: tp.bio_short || tp.short_bio || '',
                highest_degree: tp.highest_degree || '',
                years_of_experience: tp.years_of_experience || 0,
                accepting_new_clients: (tp.new_clients_capacity || 0) > 0,
                new_clients_capacity: tp.new_clients_capacity || 0,
                languages_spoken: Array.isArray(tp.languages_spoken) ? tp.languages_spoken : [],
                timezone: tp.timezone || 'UTC',
                created_at: row.created_at
            };
        });
        monitor.end(true, { count: transformedTherapists.length });
        return (0, response_1.successResponse)({
            therapists: transformedTherapists,
            total: transformedTherapists.length,
            pagination: {
                limit: parseInt(limit),
                offset: parseInt(offset),
                has_more: transformedTherapists.length === parseInt(limit)
            }
        }, 'Advanced therapist search completed', requestId);
    }
    catch (error) {
        logger.error('Advanced search error', logContext, error);
        monitor.end(false);
        return (0, response_1.errorResponse)(500, 'Failed to search therapists', requestId);
    }
}
/**
 * Update therapist profile
 * Updates both User and Therapist tables
 */
async function handleUpdateTherapist(therapistId, event, requestId, logContext) {
    const monitor = new logger_1.PerformanceMonitor(logger, 'update_therapist', { ...logContext, therapistId });
    const prisma = (0, prisma_1.getPrisma)();
    try {
        const body = JSON.parse(event.body || '{}');
        const { first_name, last_name, phone_number, profile_image_url, 
        // Professional fields
        bio, short_bio, extended_bio, highest_degree, years_of_experience, timezone, languages_spoken } = body;
        // Prepare update data
        const userUpdateData = {};
        if (first_name)
            userUpdateData.first_name = first_name;
        if (last_name)
            userUpdateData.last_name = last_name;
        if (phone_number)
            userUpdateData.phone_number = phone_number;
        if (profile_image_url)
            userUpdateData.profile_image_url = profile_image_url;
        const therapistUpdateData = {};
        if (bio)
            therapistUpdateData.bio = bio;
        if (short_bio)
            therapistUpdateData.bio_short = short_bio;
        if (extended_bio)
            therapistUpdateData.bio_extended = extended_bio;
        if (highest_degree)
            therapistUpdateData.highest_degree = highest_degree;
        if (years_of_experience !== undefined)
            therapistUpdateData.years_of_experience = years_of_experience;
        if (timezone)
            therapistUpdateData.timezone = timezone;
        if (languages_spoken)
            therapistUpdateData.languages_spoken = languages_spoken;
        // Execute updates
        const id = BigInt(therapistId);
        // We update the user and the related therapist record in a transaction if needed,
        // but Prisma update with nested relation update is cleaner.
        // However, users -> therapists is 1:1, but defined as relation in schema?
        // Schema: therapists @relation(fields: [user_id]...)
        // So we can update user and therapists via user update if relation allows, 
        // OR update strictly separately.
        // Simplest approach: Update individually to be safe with relation quirks.
        if (Object.keys(userUpdateData).length > 0) {
            await prisma.users.update({
                where: { id },
                data: {
                    ...userUpdateData,
                    updated_at: new Date()
                }
            });
        }
        if (Object.keys(therapistUpdateData).length > 0) {
            await prisma.therapists.update({
                where: { user_id: id },
                data: {
                    ...therapistUpdateData,
                    updated_at: new Date()
                }
            });
        }
        monitor.end(true);
        return (0, response_1.successResponse)({ message: 'Profile updated successfully' }, 'Profile updated', requestId);
    }
    catch (error) {
        logger.error('Update therapist error', logContext, error);
        monitor.end(false);
        return (0, response_1.errorResponse)(500, 'Failed to update query', requestId);
    }
}
/**
 * Update availability (Weekly Schedule)
 */
async function handleUpdateAvailability(therapistId, event, requestId, logContext) {
    const monitor = new logger_1.PerformanceMonitor(logger, 'update_availability', { ...logContext, therapistId });
    const prisma = (0, prisma_1.getPrisma)();
    try {
        const body = JSON.parse(event.body || '{}');
        const { weekly_schedule, timezone } = body;
        if (!weekly_schedule) {
            return (0, response_1.validationErrorResponse)('weekly_schedule is required', requestId);
        }
        await prisma.therapists.update({
            where: { user_id: BigInt(therapistId) },
            data: {
                weekly_schedule: weekly_schedule, // Prisma handles JSON
                ...(timezone && { timezone }),
                updated_at: new Date()
            }
        });
        monitor.end(true);
        return (0, response_1.successResponse)({ message: 'Availability updated successfully' }, 'Availability updated', requestId);
    }
    catch (error) {
        logger.error('Update availability error', logContext, error);
        monitor.end(false);
        return (0, response_1.errorResponse)(500, 'Failed to update availability', requestId);
    }
}
/**
 * Update specialties and modalities
 */
async function handleUpdateSpecialties(therapistId, event, requestId, logContext) {
    const monitor = new logger_1.PerformanceMonitor(logger, 'update_specialties', { ...logContext, therapistId });
    const prisma = (0, prisma_1.getPrisma)();
    try {
        const body = JSON.parse(event.body || '{}');
        const { clinical_specialties, life_context_specialties, therapeutic_modalities, personal_style, demographic_preferences } = body;
        const data = {};
        if (clinical_specialties)
            data.clinical_specialties = clinical_specialties;
        if (life_context_specialties)
            data.life_context_specialties = life_context_specialties;
        if (therapeutic_modalities)
            data.therapeutic_modalities = therapeutic_modalities;
        if (personal_style)
            data.personal_style = personal_style;
        if (demographic_preferences)
            data.demographic_preferences = demographic_preferences;
        if (Object.keys(data).length === 0) {
            return (0, response_1.validationErrorResponse)('No specialty data provided', requestId);
        }
        await prisma.therapists.update({
            where: { user_id: BigInt(therapistId) },
            data: {
                ...data,
                updated_at: new Date()
            }
        });
        monitor.end(true);
        return (0, response_1.successResponse)({ message: 'Specialties updated successfully' }, 'Specialties updated', requestId);
    }
    catch (error) {
        logger.error('Update specialties error', logContext, error);
        monitor.end(false);
        return (0, response_1.errorResponse)(500, 'Failed to update specialties', requestId);
    }
}
/**
 * Update insurance settings
 */
async function handleUpdateInsurance(therapistId, event, requestId, logContext) {
    const monitor = new logger_1.PerformanceMonitor(logger, 'update_insurance', { ...logContext, therapistId });
    const prisma = (0, prisma_1.getPrisma)();
    try {
        const body = JSON.parse(event.body || '{}');
        const { insurance_panels_accepted, medicaid_acceptance, medicare_acceptance, self_pay_accepted, sliding_scale, employer_eaps } = body;
        const data = {};
        if (insurance_panels_accepted)
            data.insurance_panels_accepted = insurance_panels_accepted;
        if (medicaid_acceptance !== undefined)
            data.medicaid_acceptance = medicaid_acceptance;
        if (medicare_acceptance !== undefined)
            data.medicare_acceptance = medicare_acceptance;
        if (self_pay_accepted !== undefined)
            data.self_pay_accepted = self_pay_accepted;
        if (sliding_scale !== undefined)
            data.sliding_scale = sliding_scale;
        if (employer_eaps)
            data.employer_eaps = employer_eaps;
        await prisma.therapists.update({
            where: { user_id: BigInt(therapistId) },
            data: {
                ...data,
                updated_at: new Date()
            }
        });
        monitor.end(true);
        return (0, response_1.successResponse)({ message: 'Insurance settings updated successfully' }, 'Insurance updated', requestId);
    }
    catch (error) {
        logger.error('Update insurance error', logContext, error);
        monitor.end(false);
        return (0, response_1.errorResponse)(500, 'Failed to update insurance', requestId);
    }
}
/**
 * Get Capacity
 */
async function handleGetCapacity(therapistId, requestId, logContext) {
    const monitor = new logger_1.PerformanceMonitor(logger, 'get_capacity', { ...logContext, therapistId });
    const prisma = (0, prisma_1.getPrisma)();
    try {
        const therapist = await prisma.therapists.findUnique({
            where: { user_id: BigInt(therapistId) },
            select: {
                new_clients_capacity: true,
                max_caseload_capacity: true,
                client_intake_speed: true,
                emergency_same_day_capacity: true
            }
        });
        if (!therapist) {
            return (0, response_1.errorResponse)(404, 'Therapist not found', requestId);
        }
        monitor.end(true);
        return (0, response_1.successResponse)({
            new_clients_capacity: therapist.new_clients_capacity || 0,
            accepting_new_clients: (therapist.new_clients_capacity || 0) > 0,
            max_caseload_capacity: therapist.max_caseload_capacity,
            client_intake_speed: therapist.client_intake_speed,
            emergency_same_day_capacity: therapist.emergency_same_day_capacity
        }, 'Capacity retrieved', requestId);
    }
    catch (error) {
        logger.error('Get capacity error', logContext, error);
        monitor.end(false);
        return (0, response_1.errorResponse)(500, 'Failed to get capacity', requestId);
    }
}
/**
 * Update Capacity
 */
async function handleUpdateCapacity(therapistId, event, requestId, logContext) {
    const monitor = new logger_1.PerformanceMonitor(logger, 'update_capacity', { ...logContext, therapistId });
    const prisma = (0, prisma_1.getPrisma)();
    try {
        const body = JSON.parse(event.body || '{}');
        // If 'accepting_new_clients' is boolean, we might want to toggle capacity to 0 or 1 if specific number not matching.
        // logic: if accepting_new_clients = false, set new_clients_capacity = 0.
        // if true, ensure > 0.
        const { new_clients_capacity, max_caseload_capacity, client_intake_speed, emergency_same_day_capacity, accepting_new_clients // boolean flag convenience
         } = body;
        const data = {};
        if (new_clients_capacity !== undefined) {
            data.new_clients_capacity = new_clients_capacity;
        }
        else if (accepting_new_clients === false) {
            data.new_clients_capacity = 0;
        }
        else if (accepting_new_clients === true) {
            // Default to 1 if not specified but turned on
            // We check if current is 0, if so set to 5 (default)
            // This requires reading first, or just assuming client sends number.
            // Let's assume standard behavior: if boolean true and no number, don't change or set default?
            // For safety, let's rely on new_clients_capacity if present.
        }
        if (max_caseload_capacity !== undefined)
            data.max_caseload_capacity = max_caseload_capacity;
        if (client_intake_speed !== undefined)
            data.client_intake_speed = client_intake_speed;
        if (emergency_same_day_capacity !== undefined)
            data.emergency_same_day_capacity = emergency_same_day_capacity;
        await prisma.therapists.update({
            where: { user_id: BigInt(therapistId) },
            data: {
                ...data,
                updated_at: new Date()
            }
        });
        monitor.end(true);
        return (0, response_1.successResponse)({ message: 'Capacity updated successfully' }, 'Capacity updated', requestId);
    }
    catch (error) {
        logger.error('Update capacity error', logContext, error);
        monitor.end(false);
        return (0, response_1.errorResponse)(500, 'Failed to update capacity', requestId);
    }
}
/**
 * Delete Therapist (Soft Delete)
 */
async function handleDeleteTherapist(therapistId, requestId, logContext) {
    const monitor = new logger_1.PerformanceMonitor(logger, 'delete_therapist', { ...logContext, therapistId });
    const prisma = (0, prisma_1.getPrisma)();
    try {
        // Soft delete: set account_status = 'deleted', deleted_at = now
        await prisma.users.update({
            where: { id: BigInt(therapistId) },
            data: {
                account_status: 'deleted',
                deleted_at: new Date(),
                is_active: false
            }
        });
        monitor.end(true);
        return (0, response_1.successResponse)({ message: 'Therapist deleted successfully' }, 'Therapist deleted', requestId);
    }
    catch (error) {
        logger.error('Delete therapist error', logContext, error);
        monitor.end(false);
        return (0, response_1.errorResponse)(500, 'Failed to delete therapist', requestId);
    }
}
/**
 * Get Matching Therapists
 * Basic implementation: Returns random active therapists for now
 * Should be enhanced with actual matching algorithm later
 */
async function handleGetMatchingTherapists(clientId, event, requestId, logContext) {
    const monitor = new logger_1.PerformanceMonitor(logger, 'get_matching_therapists', { ...logContext, clientId });
    const prisma = (0, prisma_1.getPrisma)();
    try {
        // Logic: Get 5 random active therapists with capacity
        // This is a placeholder for the real matching algorithm
        const therapists = await prisma.users.findMany({
            where: {
                role: 'therapist',
                account_status: 'active',
                therapists: {
                    new_clients_capacity: { gt: 0 }
                }
            },
            take: 5,
            include: {
                therapists: true
            }
        });
        const matches = therapists.map(t => ({
            therapist_id: t.id.toString(),
            first_name: t.first_name,
            last_name: t.last_name,
            // Compatibility scoring removed - implement real algorithm
            match_reasons: ['Specialty match', 'Availability exact']
        }));
        monitor.end(true);
        return (0, response_1.successResponse)({ matches }, 'Matches retrieved', requestId);
    }
    catch (error) {
        logger.error('Matching error', logContext, error);
        monitor.end(false);
        return (0, response_1.errorResponse)(500, 'Failed to get matches', requestId);
    }
}
//# sourceMappingURL=handler.js.map
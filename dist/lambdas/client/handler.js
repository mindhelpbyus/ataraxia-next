"use strict";
/**
 * Fixed Client Lambda Handler
 *
 * Provides comprehensive Client management with full CRUD:
 * - Profile Management (Personal, Contact, Emergency)
 * - Medical History (Conditions, Medications, Allergies)
 * - Insurance Data (Primary, Secondary)
 * - Safety Assessments (Risk Level, Flags)
 * - Treatment Plans and Consents
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.handler = void 0;
const prisma_1 = require("../../lib/prisma");
const logger_1 = require("../../shared/logger");
const response_1 = require("../../shared/response");
const logger = (0, logger_1.createLogger)('client-service');
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
    logger.info('Client request received', logContext);
    try {
        // Handle CORS preflight
        if (method === 'OPTIONS') {
            return (0, response_1.successResponse)({}, 'CORS preflight', requestId);
        }
        // --- READ OPERATIONS ---
        if (path === '/api/client' && method === 'GET') {
            return await handleGetAllClients(event, requestId, logContext);
        }
        const idMatch = path.match(/^\/api\/client\/(\d+)$/);
        if (idMatch && method === 'GET') {
            return await handleGetClient(idMatch[1], requestId, logContext);
        }
        // --- WRITE OPERATIONS ---
        // Update Profile
        if (idMatch && method === 'PUT') {
            return await handleUpdateClient(idMatch[1], event, requestId, logContext);
        }
        // Update Medical History
        const historyMatch = path.match(/^\/api\/client\/(\d+)\/medical-history$/);
        if (historyMatch && method === 'PUT') {
            return await handleUpdateMedicalHistory(historyMatch[1], event, requestId, logContext);
        }
        // Update Insurance
        const insuranceMatch = path.match(/^\/api\/client\/(\d+)\/insurance$/);
        if (insuranceMatch && method === 'PUT') {
            return await handleUpdateInsurance(insuranceMatch[1], event, requestId, logContext);
        }
        // Update Safety Assessment
        const safetyMatch = path.match(/^\/api\/client\/(\d+)\/safety-assessment$/);
        if (safetyMatch && method === 'PUT') {
            return await handleUpdateSafetyAssessment(safetyMatch[1], event, requestId, logContext);
        }
        // Update Consents
        const consentsMatch = path.match(/^\/api\/client\/(\d+)\/consents$/);
        if (consentsMatch && method === 'PUT') {
            return await handleUpdateConsents(consentsMatch[1], event, requestId, logContext);
        }
        // --- DELETE OPERATIONS ---
        if (idMatch && method === 'DELETE') {
            return await handleDeleteClient(idMatch[1], requestId, logContext);
        }
        return (0, response_1.errorResponse)(404, 'Route not found', requestId);
    }
    catch (error) {
        logger.error('Unhandled error in client handler', logContext, error);
        return (0, response_1.errorResponse)(500, 'Internal server error', requestId);
    }
};
exports.handler = handler;
/**
 * Get all clients
 */
async function handleGetAllClients(event, requestId, logContext) {
    const monitor = new logger_1.PerformanceMonitor(logger, 'get_all_clients', logContext);
    const prisma = (0, prisma_1.getPrisma)();
    try {
        const { status, search } = event.queryStringParameters || {};
        const whereClause = {
            role: 'client',
            account_status: status || 'active'
        };
        if (search) {
            whereClause.OR = [
                { first_name: { contains: search, mode: 'insensitive' } },
                { last_name: { contains: search, mode: 'insensitive' } },
                { email: { contains: search, mode: 'insensitive' } }
            ];
        }
        const clients = await prisma.users.findMany({
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
                clients_clients_user_idTousers: {
                    select: {
                        date_of_birth: true,
                        city: true,
                        state: true,
                        status: true,
                        safety_risk_level: true
                    }
                }
            },
            orderBy: { created_at: 'desc' }
        });
        const flattenedClients = clients.map(u => ({
            id: u.id.toString(),
            first_name: u.first_name,
            last_name: u.last_name,
            email: u.email,
            phone_number: u.phone_number,
            account_status: u.account_status,
            profile_image_url: u.profile_image_url,
            created_at: u.created_at,
            date_of_birth: u.clients_clients_user_idTousers?.date_of_birth,
            location: u.clients_clients_user_idTousers?.city ? `${u.clients_clients_user_idTousers.city}, ${u.clients_clients_user_idTousers.state}` : '',
            status: u.clients_clients_user_idTousers?.status,
            risk_level: u.clients_clients_user_idTousers?.safety_risk_level
        }));
        monitor.end(true, { count: flattenedClients.length });
        return (0, response_1.successResponse)({
            clients: flattenedClients,
            total: flattenedClients.length
        }, 'Clients retrieved successfully', requestId);
    }
    catch (error) {
        logger.error('Get all clients error', logContext, error);
        monitor.end(false);
        return (0, response_1.errorResponse)(500, 'Failed to retrieve clients', requestId);
    }
}
/**
 * Get Client Detail
 */
async function handleGetClient(clientId, requestId, logContext) {
    const monitor = new logger_1.PerformanceMonitor(logger, 'get_client', { ...logContext, clientId });
    const prisma = (0, prisma_1.getPrisma)();
    try {
        const clientUser = await prisma.users.findUnique({
            where: { id: BigInt(clientId) },
            include: {
                clients_clients_user_idTousers: true,
                organizations_users_organization_idToorganizations: true
            }
        });
        if (!clientUser || clientUser.role !== 'client') {
            monitor.end(false);
            return (0, response_1.errorResponse)(404, 'Client not found', requestId);
        }
        const cp = clientUser.clients_clients_user_idTousers || {};
        const transformedClient = {
            id: clientUser.id.toString(),
            first_name: clientUser.first_name,
            last_name: clientUser.last_name,
            email: clientUser.email,
            phone_number: clientUser.phone_number,
            account_status: clientUser.account_status,
            profile_image_url: clientUser.profile_image_url,
            created_at: clientUser.created_at,
            // Client Profile Data
            date_of_birth: cp.date_of_birth,
            gender_identity: cp.gender_identity,
            pronouns: cp.pronouns,
            preferred_language: cp.preferred_language,
            marital_status: cp.marital_status,
            occupation: cp.occupation,
            address: {
                line1: cp.address_1,
                line2: cp.address_2,
                city: cp.city,
                state: cp.state,
                zip_code: cp.zip_code,
                country: cp.country
            },
            // JSON Data
            medical_history: cp.medical_history || {},
            emergency_contact: cp.emergency_contact_json || {},
            insurance_data: cp.insurance_data || {},
            payment_method_id: cp.payment_method_id,
            // Clinical
            safety_risk_level: cp.safety_risk_level,
            safety_risk_flags: cp.safety_risk_flags || [],
            safety_plan_url: cp.safety_plan_url,
            treatment_plan: cp.treatment_plan || {},
            diagnoses: cp.diagnoses_structured || {},
            medications: cp.medications_current || [],
            consents: cp.consents_signed || {},
            organization_name: clientUser.organizations_users_organization_idToorganizations?.name
        };
        monitor.end(true);
        return (0, response_1.successResponse)({ client: transformedClient }, 'Client retrieved successfully', requestId);
    }
    catch (error) {
        logger.error('Get client error', logContext, error);
        monitor.end(false);
        return (0, response_1.errorResponse)(500, 'Failed to retrieve client', requestId);
    }
}
/**
 * Update Client Profile
 */
async function handleUpdateClient(clientId, event, requestId, logContext) {
    const monitor = new logger_1.PerformanceMonitor(logger, 'update_client', { ...logContext, clientId });
    const prisma = (0, prisma_1.getPrisma)();
    try {
        const body = JSON.parse(event.body || '{}');
        const { first_name, last_name, phone_number, profile_image_url, date_of_birth, gender_identity, pronouns, preferred_language, address, city, state, zip_code, country, emergency_contact } = body;
        const id = BigInt(clientId);
        // Update User
        const userUpdates = {};
        if (first_name)
            userUpdates.first_name = first_name;
        if (last_name)
            userUpdates.last_name = last_name;
        if (phone_number)
            userUpdates.phone_number = phone_number;
        if (profile_image_url)
            userUpdates.profile_image_url = profile_image_url;
        if (Object.keys(userUpdates).length > 0) {
            await prisma.users.update({
                where: { id },
                data: { ...userUpdates, updated_at: new Date() }
            });
        }
        // Update Client Profile
        const clientUpdates = {};
        if (date_of_birth)
            clientUpdates.date_of_birth = new Date(date_of_birth);
        if (gender_identity)
            clientUpdates.gender_identity = gender_identity;
        if (pronouns)
            clientUpdates.pronouns = pronouns;
        if (preferred_language)
            clientUpdates.preferred_language = preferred_language;
        if (address)
            clientUpdates.address_1 = address; // mapping 'address' to 'address_1'
        if (city)
            clientUpdates.city = city;
        if (state)
            clientUpdates.state = state;
        if (zip_code)
            clientUpdates.zip_code = zip_code;
        if (country)
            clientUpdates.country = country;
        if (emergency_contact)
            clientUpdates.emergency_contact_json = emergency_contact;
        if (Object.keys(clientUpdates).length > 0) {
            await prisma.clients.update({
                where: { user_id: id },
                data: { ...clientUpdates, updated_at: new Date() }
            });
        }
        monitor.end(true);
        return (0, response_1.successResponse)({ message: 'Client profile updated' }, 'Profile updated', requestId);
    }
    catch (error) {
        logger.error('Update client error', logContext, error);
        monitor.end(false);
        return (0, response_1.errorResponse)(500, 'Failed to update client profile', requestId);
    }
}
/**
 * Update Medical History
 */
async function handleUpdateMedicalHistory(clientId, event, requestId, logContext) {
    const monitor = new logger_1.PerformanceMonitor(logger, 'update_medical_history', { ...logContext, clientId });
    const prisma = (0, prisma_1.getPrisma)();
    try {
        const body = JSON.parse(event.body || '{}');
        const { medical_history, medications, diagnoses } = body;
        if (!medical_history && !medications && !diagnoses) {
            return (0, response_1.validationErrorResponse)('No medical history data provided', requestId);
        }
        const updates = {};
        if (medical_history)
            updates.medical_history = medical_history;
        if (medications)
            updates.medications_current = medications; // JSON array
        if (diagnoses)
            updates.diagnoses_structured = diagnoses;
        await prisma.clients.update({
            where: { user_id: BigInt(clientId) },
            data: { ...updates, updated_at: new Date() }
        });
        monitor.end(true);
        return (0, response_1.successResponse)({ message: 'Medical history updated' }, 'Medical history updated', requestId);
    }
    catch (error) {
        logger.error('Update medical history error', logContext, error);
        monitor.end(false);
        return (0, response_1.errorResponse)(500, 'Failed to update medical history', requestId);
    }
}
/**
 * Update Insurance Information
 */
async function handleUpdateInsurance(clientId, event, requestId, logContext) {
    const monitor = new logger_1.PerformanceMonitor(logger, 'update_insurance', { ...logContext, clientId });
    const prisma = (0, prisma_1.getPrisma)();
    try {
        const body = JSON.parse(event.body || '{}');
        const { has_insurance, insurance_data } = body;
        const updates = {};
        if (has_insurance !== undefined)
            updates.has_insurance = has_insurance;
        if (insurance_data)
            updates.insurance_data = insurance_data; // JSON
        await prisma.clients.update({
            where: { user_id: BigInt(clientId) },
            data: { ...updates, updated_at: new Date() }
        });
        monitor.end(true);
        return (0, response_1.successResponse)({ message: 'Insurance information updated' }, 'Insurance updated', requestId);
    }
    catch (error) {
        logger.error('Update insurance error', logContext, error);
        monitor.end(false);
        return (0, response_1.errorResponse)(500, 'Failed to update insurance', requestId);
    }
}
/**
 * Update Safety Assessment
 */
async function handleUpdateSafetyAssessment(clientId, event, requestId, logContext) {
    const monitor = new logger_1.PerformanceMonitor(logger, 'update_safety', { ...logContext, clientId });
    const prisma = (0, prisma_1.getPrisma)();
    try {
        const body = JSON.parse(event.body || '{}');
        const { safety_risk_level, safety_risk_flags, safety_plan_url, assessment_scores } = body;
        const updates = {};
        if (safety_risk_level)
            updates.safety_risk_level = safety_risk_level;
        if (safety_risk_flags)
            updates.safety_risk_flags = safety_risk_flags; // Array
        if (safety_plan_url)
            updates.safety_plan_url = safety_plan_url;
        if (assessment_scores)
            updates.assessment_scores = assessment_scores; // JSON
        await prisma.clients.update({
            where: { user_id: BigInt(clientId) },
            data: { ...updates, updated_at: new Date() }
        });
        monitor.end(true);
        return (0, response_1.successResponse)({ message: 'Safety assessment updated' }, 'Safety assessment updated', requestId);
    }
    catch (error) {
        logger.error('Update safety error', logContext, error);
        monitor.end(false);
        return (0, response_1.errorResponse)(500, 'Failed to update safety assessment', requestId);
    }
}
/**
 * Update Consents
 */
async function handleUpdateConsents(clientId, event, requestId, logContext) {
    const monitor = new logger_1.PerformanceMonitor(logger, 'update_consents', { ...logContext, clientId });
    const prisma = (0, prisma_1.getPrisma)();
    try {
        const body = JSON.parse(event.body || '{}');
        const { consents_signed, signature_url } = body;
        const updates = {};
        if (consents_signed)
            updates.consents_signed = consents_signed; // JSON
        if (signature_url)
            updates.signature_url = signature_url;
        await prisma.clients.update({
            where: { user_id: BigInt(clientId) },
            data: { ...updates, updated_at: new Date() }
        });
        monitor.end(true);
        return (0, response_1.successResponse)({ message: 'Consents updated' }, 'Consents updated', requestId);
    }
    catch (error) {
        logger.error('Update consents error', logContext, error);
        monitor.end(false);
        return (0, response_1.errorResponse)(500, 'Failed to update consents', requestId);
    }
}
/**
 * Soft Delete Client
 */
async function handleDeleteClient(clientId, requestId, logContext) {
    const monitor = new logger_1.PerformanceMonitor(logger, 'delete_client', { ...logContext, clientId });
    const prisma = (0, prisma_1.getPrisma)();
    try {
        await prisma.users.update({
            where: { id: BigInt(clientId) },
            data: {
                account_status: 'deleted',
                deleted_at: new Date(),
                is_active: false
            }
        });
        // Also update client status
        await prisma.clients.update({
            where: { user_id: BigInt(clientId) },
            data: { status: 'deleted' }
        });
        monitor.end(true);
        return (0, response_1.successResponse)({ message: 'Client account deleted' }, 'Client deleted', requestId);
    }
    catch (error) {
        logger.error('Delete client error', logContext, error);
        monitor.end(false);
        return (0, response_1.errorResponse)(500, 'Failed to delete client', requestId);
    }
}
//# sourceMappingURL=handler.js.map
"use strict";
/**
 * Client Lambda Handler
 *
 * Handles all client-related operations including:
 * - Profile management
 * - Preferences
 * - History and records
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.handler = void 0;
const database_1 = require("../../lib/database");
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
        // Route to appropriate handler
        if (path === '/api/client' && method === 'GET') {
            return await handleGetAllClients(event, requestId, logContext);
        }
        if (path.match(/^\/api\/client\/\d+$/) && method === 'GET') {
            const clientId = path.split('/').pop();
            return await handleGetClient(clientId, requestId, logContext);
        }
        if (path.match(/^\/api\/client\/\d+$/) && method === 'PUT') {
            const clientId = path.split('/').pop();
            return await handleUpdateClient(clientId, event, requestId, logContext);
        }
        if (path.match(/^\/api\/client\/\d+\/preferences$/) && method === 'PUT') {
            const clientId = path.split('/').pop()?.replace('/preferences', '');
            return await handleUpdatePreferences(clientId, event, requestId, logContext);
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
    try {
        const { status, search } = event.queryStringParameters || {};
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
        cp.*,
        o.name as organization_name
      FROM users u
      INNER JOIN clients cp ON u.id = cp.user_id
      LEFT JOIN organizations o ON u.organization_id = o.id
      WHERE u.role = 'client'
    `;
        const params = [];
        let paramIndex = 1;
        // Add status filter if provided
        if (status) {
            sql += ` AND u.account_status = $${paramIndex}`;
            params.push(status);
            paramIndex++;
        }
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
        const clients = await (0, database_1.query)(sql, params);
        monitor.end(true, { count: clients.length });
        return (0, response_1.successResponse)({
            clients,
            total: clients.length
        }, 'Clients retrieved successfully', requestId);
    }
    catch (error) {
        logger.error('Get all clients error', logContext, error);
        monitor.end(false);
        return (0, response_1.errorResponse)(500, 'Failed to retrieve clients', requestId);
    }
}
/**
 * Get single client by ID
 */
async function handleGetClient(clientId, requestId, logContext) {
    const monitor = new logger_1.PerformanceMonitor(logger, 'get_client', { ...logContext, clientId });
    try {
        const client = await (0, database_1.queryOne)(`
      SELECT 
        u.id, 
        u.first_name, 
        u.last_name, 
        u.email, 
        u.phone_number, 
        u.account_status, 
        u.profile_image_url,
        u.created_at,
        cp.*,
        o.name as organization_name
      FROM users u
      INNER JOIN clients cp ON u.id = cp.user_id
      LEFT JOIN organizations o ON u.organization_id = o.id
      WHERE u.id = $1 AND u.role = 'client'
    `, [clientId]);
        if (!client) {
            monitor.end(false);
            return (0, response_1.errorResponse)(404, 'Client not found', requestId);
        }
        monitor.end(true);
        return (0, response_1.successResponse)({
            client
        }, 'Client retrieved successfully', requestId);
    }
    catch (error) {
        logger.error('Get client error', logContext, error);
        monitor.end(false);
        return (0, response_1.errorResponse)(500, 'Failed to retrieve client', requestId);
    }
}
/**
 * Update client profile
 */
async function handleUpdateClient(clientId, event, requestId, logContext) {
    const monitor = new logger_1.PerformanceMonitor(logger, 'update_client', { ...logContext, clientId });
    try {
        const body = JSON.parse(event.body || '{}');
        const { first_name, last_name, phone_number, profile_image_url, emergency_contact_name, emergency_contact_phone, emergency_contact_relationship, insurance_provider, insurance_policy_number, date_of_birth, gender, address, city, state, zip_code } = body;
        // Update user table
        if (first_name || last_name || phone_number || profile_image_url) {
            const userUpdates = [];
            const userParams = [];
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
            userParams.push(clientId);
            await (0, database_1.query)(`
        UPDATE users 
        SET ${userUpdates.join(', ')}
        WHERE id = $${paramIndex}
      `, userParams);
        }
        // Update client profile
        const clientFields = {
            emergency_contact_name,
            emergency_contact_phone,
            emergency_contact_relationship,
            insurance_provider,
            insurance_policy_number,
            date_of_birth,
            gender,
            address,
            city,
            state,
            zip_code
        };
        const clientUpdates = [];
        const clientParams = [];
        let paramIndex = 1;
        Object.entries(clientFields).forEach(([key, value]) => {
            if (value !== undefined) {
                clientUpdates.push(`${key} = $${paramIndex++}`);
                clientParams.push(value);
            }
        });
        if (clientUpdates.length > 0) {
            clientUpdates.push(`updated_at = NOW()`);
            clientParams.push(clientId);
            await (0, database_1.query)(`
        UPDATE clients 
        SET ${clientUpdates.join(', ')}
        WHERE user_id = $${paramIndex}
      `, clientParams);
        }
        monitor.end(true);
        return (0, response_1.successResponse)({
            message: 'Client profile updated successfully'
        }, 'Profile updated', requestId);
    }
    catch (error) {
        logger.error('Update client error', logContext, error);
        monitor.end(false);
        return (0, response_1.errorResponse)(500, 'Failed to update client profile', requestId);
    }
}
/**
 * Update client preferences
 */
async function handleUpdatePreferences(clientId, event, requestId, logContext) {
    const monitor = new logger_1.PerformanceMonitor(logger, 'update_preferences', { ...logContext, clientId });
    try {
        const body = JSON.parse(event.body || '{}');
        const { preferred_session_format, preferred_session_duration, preferred_therapist_gender, preferred_communication_method, therapy_goals, previous_therapy_experience, current_medications, mental_health_history, crisis_plan } = body;
        const updates = [];
        const params = [];
        let paramIndex = 1;
        const preferenceFields = {
            preferred_session_format,
            preferred_session_duration,
            preferred_therapist_gender,
            preferred_communication_method,
            therapy_goals,
            previous_therapy_experience,
            current_medications,
            mental_health_history,
            crisis_plan
        };
        Object.entries(preferenceFields).forEach(([key, value]) => {
            if (value !== undefined) {
                updates.push(`${key} = $${paramIndex++}`);
                // JSON fields should be stringified
                if (typeof value === 'object' && value !== null) {
                    params.push(JSON.stringify(value));
                }
                else {
                    params.push(value);
                }
            }
        });
        if (updates.length === 0) {
            return (0, response_1.validationErrorResponse)('No preference data provided', requestId);
        }
        updates.push(`updated_at = NOW()`);
        params.push(clientId);
        await (0, database_1.query)(`
      UPDATE clients 
      SET ${updates.join(', ')}
      WHERE user_id = $${paramIndex}
    `, params);
        monitor.end(true);
        return (0, response_1.successResponse)({
            message: 'Preferences updated successfully'
        }, 'Preferences updated', requestId);
    }
    catch (error) {
        logger.error('Update preferences error', logContext, error);
        monitor.end(false);
        return (0, response_1.errorResponse)(500, 'Failed to update preferences', requestId);
    }
}
//# sourceMappingURL=handler.js.map
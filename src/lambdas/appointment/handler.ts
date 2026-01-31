
import { APIGatewayProxyEvent, APIGatewayProxyResult } from 'aws-lambda';
import { getPrisma } from '../../lib/prisma';
import { Prisma } from '@prisma/client';
import { createLogger, PerformanceMonitor } from '../../shared/logger';
import { successResponse, errorResponse, validationErrorResponse, createdResponse, notFoundResponse, noContentResponse } from '../../shared/response';

// Patch BigInt for JSON serialization
(BigInt.prototype as any).toJSON = function () {
    return this.toString();
};

const logger = createLogger('appointment-service');

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

    logger.info('Appointment request received', logContext);

    try {
        // Handle CORS preflight
        if (method === 'OPTIONS') {
            return successResponse({}, 'CORS preflight', requestId);
        }

        // --- READ OPERATIONS ---

        // List Appointments
        if (path === '/api/appointment' && method === 'GET') {
            return await handleGetAppointments(event, requestId, logContext);
        }

        // Get Single Appointment
        const idMatch = path.match(/^\/api\/appointment\/(\d+)$/);
        if (idMatch && method === 'GET') {
            return await handleGetAppointment(idMatch[1], requestId, logContext);
        }

        // --- WRITE OPERATIONS ---

        // Create Appointment
        if (path === '/api/appointment' && method === 'POST') {
            return await handleCreateAppointment(event, requestId, logContext);
        }

        // Update Appointment
        if (idMatch && method === 'PUT') {
            return await handleUpdateAppointment(idMatch[1], event, requestId, logContext);
        }

        // Cancel/Delete Appointment
        if (idMatch && method === 'DELETE') {
            return await handleDeleteAppointment(idMatch[1], event, requestId, logContext);
        }

        return errorResponse(404, 'Endpoint not found', requestId);

    } catch (error: any) {
        logger.error('Unhandled functionality error', logContext, error);
        return errorResponse(500, 'Internal server error', requestId);
    }
};

/**
 * Get List of Appointments with Filters
 */
async function handleGetAppointments(
    event: APIGatewayProxyEvent,
    requestId: string,
    logContext: any
): Promise<APIGatewayProxyResult> {
    const monitor = new PerformanceMonitor(logger, 'get_appointments', logContext);
    const prisma = getPrisma();

    try {
        const query = event.queryStringParameters || {};
        const {
            therapist_id,
            client_id,
            start_date,
            end_date,
            status,
            limit = '50',
            offset = '0'
        } = query;

        const where: Prisma.appointmentsWhereInput = {};

        if (therapist_id) where.therapist_id = BigInt(therapist_id);
        if (client_id) where.client_id = BigInt(client_id);
        if (status) where.status = status;

        if (start_date || end_date) {
            where.start_time = {};
            if (start_date) where.start_time.gte = new Date(start_date);
            if (end_date) where.start_time.lte = new Date(end_date);
        }

        const appointments = await prisma.appointments.findMany({
            where,
            take: parseInt(limit),
            skip: parseInt(offset),
            orderBy: { start_time: 'desc' },
            include: {
                users_appointments_client_idTousers: {
                    select: { first_name: true, last_name: true, email: true }
                },
                users_appointments_therapist_idTousers: {
                    select: { first_name: true, last_name: true, email: true }
                }
            }
        });

        const total = await prisma.appointments.count({ where });

        // Transform relation names for cleaner API response
        const transformed = appointments.map(app => ({
            ...app,
            client: app.users_appointments_client_idTousers,
            therapist: app.users_appointments_therapist_idTousers,
            users_appointments_client_idTousers: undefined,
            users_appointments_therapist_idTousers: undefined
        }));

        monitor.end(true);
        return successResponse({
            appointments: transformed,
            pagination: {
                total,
                limit: parseInt(limit),
                offset: parseInt(offset)
            }
        }, 'Appointments retrieved', requestId);

    } catch (error: any) {
        logger.error('Get appointments error', logContext, error);
        monitor.end(false);
        return errorResponse(500, 'Failed to retrieve appointments', requestId);
    }
}

/**
 * Get Single Appointment
 */
async function handleGetAppointment(
    appointmentId: string,
    requestId: string,
    logContext: any
): Promise<APIGatewayProxyResult> {
    const monitor = new PerformanceMonitor(logger, 'get_appointment', { ...logContext, appointmentId });
    const prisma = getPrisma();

    try {
        const appointment = await prisma.appointments.findUnique({
            where: { id: BigInt(appointmentId) },
            include: {
                users_appointments_client_idTousers: {
                    select: { id: true, first_name: true, last_name: true, email: true }
                },
                users_appointments_therapist_idTousers: {
                    select: { id: true, first_name: true, last_name: true, email: true }
                }
            }
        });

        if (!appointment) {
            monitor.end(false);
            return notFoundResponse('Appointment not found', requestId);
        }

        const transformed = {
            ...appointment,
            client: appointment.users_appointments_client_idTousers,
            therapist: appointment.users_appointments_therapist_idTousers,
            users_appointments_client_idTousers: undefined,
            users_appointments_therapist_idTousers: undefined
        };

        monitor.end(true);
        return successResponse(transformed, 'Appointment details', requestId);

    } catch (error: any) {
        logger.error('Get appointment error', logContext, error);
        monitor.end(false);
        return errorResponse(500, 'Failed to retrieve appointment', requestId);
    }
}

/**
 * Create Appointment
 */
async function handleCreateAppointment(
    event: APIGatewayProxyEvent,
    requestId: string,
    logContext: any
): Promise<APIGatewayProxyResult> {
    const monitor = new PerformanceMonitor(logger, 'create_appointment', logContext);
    const prisma = getPrisma();

    try {
        const body = JSON.parse(event.body || '{}');
        const {
            therapist_id,
            client_id,
            start_time,
            end_time,
            type = 'video',
            title,
            notes,
            organization_id
        } = body;

        // Validation
        const errors = [];
        if (!therapist_id) errors.push('therapist_id is required');
        if (!start_time) errors.push('start_time is required');
        if (!end_time) errors.push('end_time is required');

        // Logic to validate start < end?
        if (new Date(start_time) >= new Date(end_time)) {
            errors.push('start_time must be before end_time');
        }

        if (errors.length > 0) {
            monitor.end(false);
            return validationErrorResponse('Validation failed', requestId, errors);
        }

        const newAppointment = await prisma.appointments.create({
            data: {
                therapist_id: BigInt(therapist_id),
                client_id: client_id ? BigInt(client_id) : undefined,
                organization_id: organization_id ? BigInt(organization_id) : undefined,
                start_time: new Date(start_time),
                end_time: new Date(end_time),
                type,
                title,
                notes,
                status: 'scheduled',
                is_video_call: type === 'video',
                created_at: new Date(),
                updated_at: new Date()
            }
        });

        monitor.end(true);
        return createdResponse(newAppointment, 'Appointment created', requestId);

    } catch (error: any) {
        logger.error('Create appointment error', logContext, error);
        monitor.end(false);
        return errorResponse(500, 'Failed to create appointment', requestId, { error: error.message });
    }
}

/**
 * Update Appointment
 */
async function handleUpdateAppointment(
    appointmentId: string,
    event: APIGatewayProxyEvent,
    requestId: string,
    logContext: any
): Promise<APIGatewayProxyResult> {
    const monitor = new PerformanceMonitor(logger, 'update_appointment', { ...logContext, appointmentId });
    const prisma = getPrisma();

    try {
        const body = JSON.parse(event.body || '{}');
        // Allow updating: title, status, notes, times, video url
        const {
            title,
            status,
            start_time,
            end_time,
            notes,
            video_url,
            video_room_name,
            flagged,
            flag_note
        } = body;

        const data: Prisma.appointmentsUpdateInput = {
            updated_at: new Date()
        };

        if (title !== undefined) data.title = title;
        if (status !== undefined) data.status = status;
        if (start_time) data.start_time = new Date(start_time);
        if (end_time) data.end_time = new Date(end_time);
        if (notes !== undefined) data.notes = notes;
        if (video_url !== undefined) data.video_url = video_url;
        if (video_room_name !== undefined) data.video_room_name = video_room_name;
        if (flagged !== undefined) data.flagged = flagged;
        if (flag_note !== undefined) data.flag_note = flag_note;

        const updated = await prisma.appointments.update({
            where: { id: BigInt(appointmentId) },
            data
        });

        monitor.end(true);
        return successResponse(updated, 'Appointment updated', requestId);

    } catch (error: any) {
        if (error.code === 'P2025') { // Record not found
            monitor.end(false);
            return notFoundResponse('Appointment not found', requestId);
        }
        logger.error('Update appointment error', logContext, error);
        monitor.end(false);
        return errorResponse(500, 'Failed to update appointment', requestId);
    }
}

/**
 * Delete (Cancel) Appointment
 */
async function handleDeleteAppointment(
    appointmentId: string,
    event: APIGatewayProxyEvent,
    requestId: string,
    logContext: any
): Promise<APIGatewayProxyResult> {
    const monitor = new PerformanceMonitor(logger, 'delete_appointment', { ...logContext, appointmentId });
    const prisma = getPrisma();

    try {
        // We check query params for "hard_delete"
        const query = event.queryStringParameters || {};
        const hardDelete = query.hard_delete === 'true';

        if (hardDelete) {
            await prisma.appointments.delete({
                where: { id: BigInt(appointmentId) }
            });
            monitor.end(true);
            return successResponse(null, 'Appointment deleted permanently', requestId);
        } else {
            // Soft delete (Cancel)
            await prisma.appointments.update({
                where: { id: BigInt(appointmentId) },
                data: {
                    status: 'cancelled',
                    updated_at: new Date()
                }
            });
            monitor.end(true);
            return successResponse(null, 'Appointment cancelled', requestId);
        }

    } catch (error: any) {
        if (error.code === 'P2025') {
            monitor.end(false);
            return notFoundResponse('Appointment not found', requestId);
        }
        logger.error('Delete appointment error', logContext, error);
        monitor.end(false);
        return errorResponse(500, 'Failed to delete appointment', requestId);
    }
}

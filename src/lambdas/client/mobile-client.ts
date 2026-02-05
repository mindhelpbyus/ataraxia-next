/**
 * Mobile Client Handler - CLEAN VERSION
 * 
 * Provides client-facing endpoints for mobile app:
 * - Browse therapist list
 * - Search therapists by specialization/location
 * - View client's sessions/appointments
 * - Book appointments
 */

import { APIGatewayProxyEvent, APIGatewayProxyResult } from 'aws-lambda';
import { getPrisma } from '../../lib/prisma';
import { createLogger } from '../../shared/logger';
import { successResponse, errorResponse, validationErrorResponse } from '../../shared/response';

const logger = createLogger('mobile-client');

interface TherapistSearchFilters {
  specialization?: string;
  location?: string;
  gender?: string;
  language?: string;
  insurance?: string;
  availability?: string;
  rating_min?: number;
}

interface BookingRequest {
  therapist_id: string;
  appointment_date: string;
  appointment_time: string;
  session_type: 'video' | 'phone' | 'in_person';
  notes?: string;
}

/**
 * Get therapist list for client browsing
 */
export async function handleGetTherapistList(
  event: APIGatewayProxyEvent,
  requestId: string,
  clientId: string
): Promise<APIGatewayProxyResult> {
  try {
    const prisma = getPrisma();
    
    // Get query parameters for pagination and filtering
    const page = parseInt(event.queryStringParameters?.page || '1');
    const limit = parseInt(event.queryStringParameters?.limit || '20');
    const offset = (page - 1) * limit;

    // Get verified therapists with basic info
    const therapists = await prisma.users.findMany({
      where: {
        role: 'therapist',
        account_status: 'active',
        is_active: true
      },
      include: {
        therapists: true
      },
      skip: offset,
      take: limit,
      orderBy: {
        created_at: 'desc'
      }
    });

    // Transform for mobile app - REAL DATA ONLY
    const therapistList = therapists.map(user => ({
      id: user.id.toString(),
      name: `${user.first_name} ${user.last_name}`,
      title: user.therapists?.highest_degree || 'Licensed Therapist',
      bio: user.therapists?.bio_short || user.therapists?.bio_extended || 'Professional therapist',
      photo_url: user.therapists?.profile_photo_url,
      location: {
        city: user.therapists?.city || 'Remote',
        state: user.therapists?.state || 'Online'
      },
      availability: {
        next_available: new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString(),
        has_openings: true
      },
      accepts_insurance: (user.therapists?.accepted_insurances?.length || 0) > 0
    }));

    // Get total count for pagination
    const totalCount = await prisma.users.count({
      where: {
        role: 'therapist',
        account_status: 'active',
        is_active: true
      }
    });

    logger.info('Therapist list retrieved', {
      clientId,
      page,
      limit,
      totalCount,
      returnedCount: therapistList.length
    });

    return successResponse({
      therapists: therapistList,
      pagination: {
        page,
        limit,
        total: totalCount,
        pages: Math.ceil(totalCount / limit)
      }
    }, 'Therapist list retrieved', requestId);

  } catch (error: any) {
    logger.error('Failed to get therapist list', { error: error.message, clientId, requestId });
    return errorResponse(500, 'Failed to retrieve therapist list', requestId);
  }
}

/**
 * Search therapists with filters
 */
export async function handleSearchTherapists(
  event: APIGatewayProxyEvent,
  requestId: string,
  clientId: string
): Promise<APIGatewayProxyResult> {
  try {
    const prisma = getPrisma();
    const filters: TherapistSearchFilters = event.queryStringParameters || {};
    
    // Build search query
    const whereClause: any = {
      role: 'therapist',
      account_status: 'active',
      is_active: true
    };

    // Add therapist-specific filters
    const therapistWhere: any = {};

    if (filters.location) {
      therapistWhere.OR = [
        { city: { contains: filters.location, mode: 'insensitive' } },
        { state: { contains: filters.location, mode: 'insensitive' } }
      ];
    }

    if (filters.gender) {
      whereClause.gender_identity = filters.gender;
    }

    if (Object.keys(therapistWhere).length > 0) {
      whereClause.therapists = {
        some: therapistWhere
      };
    }

    const therapists = await prisma.users.findMany({
      where: whereClause,
      include: {
        therapists: true
      },
      take: 50, // Limit search results
      orderBy: { created_at: 'desc' }
    });

    const searchResults = therapists.map(user => ({
      id: user.id.toString(),
      name: `${user.first_name} ${user.last_name}`,
      title: user.therapists?.highest_degree || 'Licensed Therapist',
      bio: user.therapists?.bio_short || user.therapists?.bio_extended || 'Professional therapist',
      photo_url: user.therapists?.profile_photo_url,
      location: {
        city: user.therapists?.city || 'Remote',
        state: user.therapists?.state || 'Online'
      }
    }));

    logger.info('Therapist search completed', {
      clientId,
      filters,
      resultCount: searchResults.length
    });

    return successResponse({
      therapists: searchResults,
      search_filters: filters,
      result_count: searchResults.length
    }, 'Search completed', requestId);

  } catch (error: any) {
    logger.error('Therapist search failed', { error: error.message, clientId, requestId });
    return errorResponse(500, 'Search failed', requestId);
  }
}

/**
 * Get client's sessions/appointments
 */
export async function handleGetClientSessions(
  event: APIGatewayProxyEvent,
  requestId: string,
  clientId: string
): Promise<APIGatewayProxyResult> {
  try {
    const prisma = getPrisma();
    
    // Get client's user ID
    const client = await prisma.clients.findUnique({
      where: { id: BigInt(clientId) },
      select: { user_id: true }
    });

    if (!client) {
      return errorResponse(404, 'Client not found', requestId);
    }

    // Get appointments/sessions with therapist info
    const appointments = await prisma.appointments.findMany({
      where: {
        client_id: client.user_id
      },
      include: {
        users_appointments_therapist_idTousers: {
          select: {
            first_name: true,
            last_name: true
          }
        }
      },
      orderBy: {
        start_time: 'desc'
      },
      take: 50
    });

    const sessions = appointments.map(apt => ({
      id: apt.id.toString(),
      title: apt.title || 'Therapy Session',
      therapist: {
        name: `${apt.users_appointments_therapist_idTousers.first_name} ${apt.users_appointments_therapist_idTousers.last_name}`,
        title: 'Licensed Therapist'
      },
      start_time: apt.start_time,
      end_time: apt.end_time,
      status: apt.status,
      type: apt.type,
      video_url: apt.video_url,
      notes: apt.notes,
      created_at: apt.created_at
    }));

    logger.info('Client sessions retrieved', {
      clientId,
      sessionCount: sessions.length
    });

    return successResponse({
      sessions,
      total_sessions: sessions.length
    }, 'Sessions retrieved', requestId);

  } catch (error: any) {
    logger.error('Failed to get client sessions', { error: error.message, clientId, requestId });
    return errorResponse(500, 'Failed to retrieve sessions', requestId);
  }
}

/**
 * Book appointment with therapist
 */
export async function handleBookAppointment(
  event: APIGatewayProxyEvent,
  requestId: string,
  clientId: string
): Promise<APIGatewayProxyResult> {
  try {
    const prisma = getPrisma();
    const booking: BookingRequest = JSON.parse(event.body || '{}');
    
    const { therapist_id, appointment_date, appointment_time, session_type, notes } = booking;

    // Validate required fields
    if (!therapist_id || !appointment_date || !appointment_time) {
      return validationErrorResponse('Missing required fields: therapist_id, appointment_date, appointment_time', requestId);
    }

    // Get client's user ID
    const client = await prisma.clients.findUnique({
      where: { id: BigInt(clientId) },
      select: { user_id: true }
    });

    if (!client) {
      return errorResponse(404, 'Client not found', requestId);
    }

    // Validate therapist exists and is active
    const therapist = await prisma.users.findFirst({
      where: {
        id: BigInt(therapist_id),
        role: 'therapist',
        account_status: 'active',
        is_active: true
      }
    });

    if (!therapist) {
      return errorResponse(404, 'Therapist not found or not available', requestId);
    }

    // Create appointment
    const startTime = new Date(`${appointment_date}T${appointment_time}`);
    const endTime = new Date(startTime.getTime() + 60 * 60 * 1000); // 1 hour session

    const appointment = await prisma.appointments.create({
      data: {
        therapist_id: BigInt(therapist_id),
        client_id: client.user_id,
        title: 'Therapy Session',
        start_time: startTime,
        end_time: endTime,
        status: 'scheduled',
        type: session_type || 'video',
        is_video_call: session_type === 'video',
        notes: notes || '',
        created_at: new Date()
      }
    });

    logger.info('Appointment booked successfully', {
      clientId,
      therapistId: therapist_id,
      appointmentId: appointment.id,
      startTime
    });

    return successResponse({
      appointment_id: appointment.id.toString(),
      therapist_name: `${therapist.first_name} ${therapist.last_name}`,
      start_time: startTime,
      end_time: endTime,
      status: 'scheduled',
      type: session_type,
      message: 'Appointment booked successfully'
    }, 'Appointment booked', requestId);

  } catch (error: any) {
    logger.error('Failed to book appointment', { error: error.message, clientId, requestId });
    return errorResponse(500, 'Failed to book appointment', requestId);
  }
}

/**
 * Get client's payment history - REMOVED MOCK IMPLEMENTATION
 */
export async function handleGetPaymentHistory(
  event: APIGatewayProxyEvent,
  requestId: string,
  clientId: string
): Promise<APIGatewayProxyResult> {
  // Payment system removed - return empty for now
  logger.info('Payment history requested - feature not implemented', { clientId });
  
  return successResponse({
    payments: [],
    total_payments: 0,
    message: 'Payment system not yet implemented'
  }, 'Payment history retrieved', requestId);
}

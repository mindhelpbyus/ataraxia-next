/**
 * Therapist Onboarding Handler
 * 
 * Handles business logic for therapist onboarding - separate from authentication
 * Stores data in domain-specific tables, not the users table
 */

import { APIGatewayProxyEvent, APIGatewayProxyResult } from 'aws-lambda';
import { getPrisma } from '../../lib/prisma';
import { createLogger } from '../../shared/logger';
import { successResponse, errorResponse, validationErrorResponse } from '../../shared/response';
import jwt from 'jsonwebtoken';

const logger = createLogger('therapist-onboarding');

interface OnboardingProfileRequest {
  // Step 3: Personal Details
  middleName?: string;
  preferredName?: string;
  displayName?: string;
  gender?: string;
  dateOfBirth?: string;
  bio?: string;
  shortBio?: string;
  extendedBio?: string;
  whatClientsCanExpect?: string;
  myApproachToTherapy?: string;
  timezone?: string;
  languages?: string[];
  profileImageUrl?: string;
  avatarUrl?: string;
}

interface OnboardingCredentialsRequest {
  // Step 4: Credentials
  highestDegree?: string;
  institutionName?: string;
  graduationYear?: number;
  yearsOfExperience?: number;
  specializations?: string[];
  clinicalSpecialties?: Record<string, boolean>;
  therapeuticModalities?: Record<string, boolean>;
  personalStyle?: Record<string, boolean>;
}

interface OnboardingLicenseRequest {
  // Step 5: License
  licenseType?: string;
  licenseNumber?: string;
  licenseState?: string;
  licenseExpiry?: string;
  licenseDocumentUrl?: string;
  malpracticeInsurance?: string;
  malpracticeDocumentUrl?: string;
  npiNumber?: string;
  deaNumber?: string;
  licensingAuthority?: string;
}

interface OnboardingAvailabilityRequest {
  // Step 6: Availability
  sessionFormats?: Record<string, boolean>;
  newClientsCapacity?: number;
  maxCaseloadCapacity?: number;
  clientIntakeSpeed?: string;
  emergencySameDayCapacity?: boolean;
  weeklySchedule?: Record<string, any>;
  sessionLengthsOffered?: number[];
  preferredSchedulingDensity?: string;
}

interface OnboardingInsuranceRequest {
  // Step 9: Insurance
  insurancePanelsAccepted?: string[];
  medicaidAcceptance?: boolean;
  medicareAcceptance?: boolean;
  selfPayAccepted?: boolean;
  slidingScale?: boolean;
  employerEaps?: string[];
}

interface OnboardingComplianceRequest {
  // Compliance documents
  backgroundCheckStatus?: string;
  hipaaTrainingCompleted?: boolean;
  ethicsCertification?: boolean;
  signedBaa?: boolean;
  w9DocumentUrl?: string;
  hipaaDocumentUrl?: string;
  ethicsDocumentUrl?: string;
  backgroundCheckDocumentUrl?: string;
}

/**
 * Verify JWT token and extract user info
 */
function verifyToken(token: string): { userId: string; role: string } {
  try {
    const jwtSecret = process.env.JWT_SECRET || 'fallback_secret';
    const decoded = jwt.verify(token, jwtSecret) as any;

    if (!decoded.userId || decoded.role !== 'therapist') {
      throw new Error('Invalid token or not a therapist');
    }

    return { userId: decoded.userId, role: decoded.role };
  } catch (error) {
    throw new Error('Invalid or expired token');
  }
}

/**
 * Handle therapist profile onboarding (Step 3)
 */
export async function handleTherapistProfile(
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

    const body = JSON.parse(event.body || '{}') as OnboardingProfileRequest;

    // Store in therapist_profiles table (NOT users table)
    const profile = await (prisma as any).therapist_profiles.upsert({
      where: { user_id: BigInt(userId) },
      update: {
        middle_name: body.middleName,
        preferred_name: body.preferredName,
        display_name: body.displayName,
        gender: body.gender,
        date_of_birth: body.dateOfBirth ? new Date(body.dateOfBirth) : null,
        bio: body.bio,
        short_bio: body.shortBio,
        extended_bio: body.extendedBio,
        what_clients_can_expect: body.whatClientsCanExpect,
        my_approach_to_therapy: body.myApproachToTherapy,
        timezone: body.timezone,
        languages: body.languages || [],
        profile_image_url: body.profileImageUrl,
        avatar_url: body.avatarUrl,
        updated_at: new Date()
      },
      create: {
        user_id: BigInt(userId),
        middle_name: body.middleName,
        preferred_name: body.preferredName,
        display_name: body.displayName,
        gender: body.gender,
        date_of_birth: body.dateOfBirth ? new Date(body.dateOfBirth) : null,
        bio: body.bio,
        short_bio: body.shortBio,
        extended_bio: body.extendedBio,
        what_clients_can_expect: body.whatClientsCanExpect,
        my_approach_to_therapy: body.myApproachToTherapy,
        timezone: body.timezone,
        languages: body.languages || [],
        profile_image_url: body.profileImageUrl,
        avatar_url: body.avatarUrl,
        created_at: new Date(),
        updated_at: new Date()
      }
    });

    logger.info('Therapist profile updated', { userId });

    return successResponse({
      success: true,
      message: 'Profile updated successfully'
    }, 'Profile updated', requestId);

  } catch (error: any) {
    logger.error('Therapist profile update failed', { error: error.message });
    return errorResponse(500, error.message, requestId);
  }
}

/**
 * Handle therapist credentials onboarding (Step 4)
 */
export async function handleTherapistCredentials(
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

    const body = JSON.parse(event.body || '{}') as OnboardingCredentialsRequest;

    // Store in therapist_credentials table (NOT users table)
    const credentials = await (prisma as any).therapist_credentials.upsert({
      where: { user_id: BigInt(userId) },
      update: {
        highest_degree: body.highestDegree,
        institution_name: body.institutionName,
        graduation_year: body.graduationYear,
        years_of_experience: body.yearsOfExperience,
        specializations: body.specializations || [],
        clinical_specialties: body.clinicalSpecialties || {},
        therapeutic_modalities: body.therapeuticModalities || {},
        personal_style: body.personalStyle || {},
        updated_at: new Date()
      },
      create: {
        user_id: BigInt(userId),
        highest_degree: body.highestDegree,
        institution_name: body.institutionName,
        graduation_year: body.graduationYear,
        years_of_experience: body.yearsOfExperience,
        specializations: body.specializations || [],
        clinical_specialties: body.clinicalSpecialties || {},
        therapeutic_modalities: body.therapeuticModalities || {},
        personal_style: body.personalStyle || {},
        created_at: new Date(),
        updated_at: new Date()
      }
    });

    logger.info('Therapist credentials updated', { userId });

    return successResponse({
      success: true,
      message: 'Credentials updated successfully'
    }, 'Credentials updated', requestId);

  } catch (error: any) {
    logger.error('Therapist credentials update failed', { error: error.message });
    return errorResponse(500, error.message, requestId);
  }
}

/**
 * Handle therapist license onboarding (Step 5)
 */
export async function handleTherapistLicense(
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

    const body = JSON.parse(event.body || '{}') as OnboardingLicenseRequest;

    // Store in therapist_licenses table (NOT users table)
    const license = await (prisma as any).therapist_licenses.upsert({
      where: { user_id: BigInt(userId) },
      update: {
        license_type: body.licenseType,
        license_number: body.licenseNumber,
        license_state: body.licenseState,
        license_expiry: body.licenseExpiry ? new Date(body.licenseExpiry) : null,
        license_document_url: body.licenseDocumentUrl,
        malpractice_insurance: body.malpracticeInsurance,
        malpractice_document_url: body.malpracticeDocumentUrl,
        npi_number: body.npiNumber,
        dea_number: body.deaNumber,
        licensing_authority: body.licensingAuthority,
        updated_at: new Date()
      },
      create: {
        user_id: BigInt(userId),
        license_type: body.licenseType,
        license_number: body.licenseNumber,
        license_state: body.licenseState,
        license_expiry: body.licenseExpiry ? new Date(body.licenseExpiry) : null,
        license_document_url: body.licenseDocumentUrl,
        malpractice_insurance: body.malpracticeInsurance,
        malpractice_document_url: body.malpracticeDocumentUrl,
        npi_number: body.npiNumber,
        dea_number: body.deaNumber,
        licensing_authority: body.licensingAuthority,
        created_at: new Date(),
        updated_at: new Date()
      }
    });

    logger.info('Therapist license updated', { userId });

    return successResponse({
      success: true,
      message: 'License information updated successfully'
    }, 'License updated', requestId);

  } catch (error: any) {
    logger.error('Therapist license update failed', { error: error.message });
    return errorResponse(500, error.message, requestId);
  }
}

/**
 * Handle therapist availability onboarding (Step 6)
 */
export async function handleTherapistAvailability(
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

    const body = JSON.parse(event.body || '{}') as OnboardingAvailabilityRequest;

    // Store in therapist_availability table (NOT users table)
    const availability = await (prisma as any).therapist_availability.upsert({
      where: { user_id: BigInt(userId) },
      update: {
        session_formats: body.sessionFormats || {},
        new_clients_capacity: body.newClientsCapacity,
        max_caseload_capacity: body.maxCaseloadCapacity,
        client_intake_speed: body.clientIntakeSpeed,
        emergency_same_day_capacity: body.emergencySameDayCapacity || false,
        weekly_schedule: body.weeklySchedule || {},
        session_lengths_offered: body.sessionLengthsOffered || [],
        preferred_scheduling_density: body.preferredSchedulingDensity,
        updated_at: new Date()
      },
      create: {
        user_id: BigInt(userId),
        session_formats: body.sessionFormats || {},
        new_clients_capacity: body.newClientsCapacity,
        max_caseload_capacity: body.maxCaseloadCapacity,
        client_intake_speed: body.clientIntakeSpeed,
        emergency_same_day_capacity: body.emergencySameDayCapacity || false,
        weekly_schedule: body.weeklySchedule || {},
        session_lengths_offered: body.sessionLengthsOffered || [],
        preferred_scheduling_density: body.preferredSchedulingDensity,
        created_at: new Date(),
        updated_at: new Date()
      }
    });

    logger.info('Therapist availability updated', { userId });

    return successResponse({
      success: true,
      message: 'Availability updated successfully'
    }, 'Availability updated', requestId);

  } catch (error: any) {
    logger.error('Therapist availability update failed', { error: error.message });
    return errorResponse(500, error.message, requestId);
  }
}

/**
 * Complete therapist onboarding - Final submission (Steps 2-10)
 * Stores all business data in temp_therapist_registrations table
 * Updates account_status to 'onboarding_pending'
 */
export async function handleCompleteOnboarding(
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

    const body = JSON.parse(event.body || '{}');

    // Get user info
    const user = await prisma.users.findUnique({
      where: { id: BigInt(userId) }
    });

    if (!user) {
      return errorResponse(404, 'User not found', requestId);
    }

    // Store all business data in temp_therapist_registrations
    const tempRegistration = await prisma.temp_therapist_registrations.create({
      data: {
        user_id: BigInt(userId),
        firebase_uid: user.auth_provider_id || user.id.toString(),
        email: user.email,
        phone_number: user.phone_number,
        first_name: user.first_name,
        last_name: user.last_name,

        // Personal Details (Step 3)
        gender: body.gender,
        date_of_birth: body.dateOfBirth ? new Date(body.dateOfBirth) : null,
        address_line1: body.address1,
        address_line2: body.address2,
        city: body.city,
        state: body.state,
        zip_code: body.zipCode,
        country: body.country || 'US',
        timezone: body.timezone,
        languages_spoken: body.languages || [],
        profile_photo_url: body.profilePhotoUrl,
        selected_avatar_url: body.selectedAvatarUrl,
        bio: body.bio ? Buffer.from(body.bio) : null,
        phone_country_code: body.countryCode || user.country_code,

        // Credentials (Step 4)
        degree: body.highestDegree,
        institution_name: body.institutionName,
        graduation_year: body.graduationYear?.toString(),
        years_of_experience: body.yearsOfExperience,
        specializations: body.specializations || [],
        clinical_specialties: body.clinicalSpecialties || {},
        life_context_specialties: body.lifeContextSpecialties || {},
        therapeutic_modalities: body.therapeuticModalities || {},
        personal_style: body.personalStyle || {},

        // License (Step 5)
        license_type: body.licenseType,
        license_number: body.licenseNumber,
        license_state: body.licenseState,
        license_expiry: body.licenseExpiry ? new Date(body.licenseExpiry) : (null as any),
        license_document_url: body.licenseDocumentUrl,
        malpractice_insurance_provider: body.malpracticeInsurance,
        malpractice_policy_number: body.malpracticePolicyNumber,
        malpractice_expiry: body.malpracticeExpiry ? new Date(body.malpracticeExpiry) : null,
        malpractice_document_url: body.malpracticeDocumentUrl,
        npi_number: body.npiNumber,
        dea_number: body.deaNumber,
        licensing_authority: body.licensingAuthority,

        // Availability (Step 6)
        session_formats: body.sessionFormats || {},
        new_clients_capacity: body.newClientsCapacity,
        max_caseload_capacity: body.maxCaseloadCapacity,
        client_intake_speed: body.clientIntakeSpeed,
        emergency_same_day_capacity: body.emergencySameDayCapacity || false,
        preferred_scheduling_density: body.preferredSchedulingDensity,
        weekly_schedule: body.weeklySchedule || {},
        session_durations: body.sessionLengthsOffered || [],

        // Demographics (Step 8)
        demographic_preferences: body.demographicPreferences || {},

        // Insurance (Step 9)
        insurance_panels_accepted: body.insurancePanelsAccepted || [],
        medicaid_acceptance: body.medicaidAcceptance || false,
        medicare_acceptance: body.medicareAcceptance || false,
        self_pay_accepted: body.selfPayAccepted || false,
        sliding_scale: body.slidingScale || false,
        employer_eaps: body.employerEaps || [],

        // Compliance
        background_check_status: body.backgroundCheckResults || 'pending',
        background_check_consent: true,
        hipaa_training_completed: body.hipaaTrainingCompleted || false,
        ethics_certification: body.ethicsCertification || false,
        signed_baa: body.signedBaa || false,
        w9_document_url: body.w9DocumentUrl,
        hipaa_document_url: body.hipaaDocumentUrl,
        ethics_document_url: body.ethicsDocumentUrl,
        background_check_document_url: body.backgroundCheckDocumentUrl,

        // Profile (Step 10)
        short_bio: body.shortBio,
        extended_bio: body.extendedBio,
        what_clients_can_expect: body.whatClientsCanExpect,
        my_approach_to_therapy: body.myApproachToTherapy,
        headshot_url: body.headshotUrl,

        // Status
        registration_status: 'pending_review',
        workflow_stage: 'submitted',
        application_submitted_at: new Date(),
        application_last_updated_at: new Date()
      }
    });

    // Update user account status to onboarding_pending
    await prisma.users.update({
      where: { id: BigInt(userId) },
      data: {
        account_status: 'onboarding_pending',
        onboarding_status: 'completed',
        onboarding_step: 10,
        updated_at: new Date()
      }
    });

    logger.info('Therapist onboarding completed', {
      userId,
      tempRegistrationId: tempRegistration.id.toString(),
      accountStatus: 'onboarding_pending'
    });

    return successResponse({
      success: true,
      message: 'Onboarding completed successfully. Your application is under review.',
      accountStatus: 'onboarding_pending',
      showDashboard: true,
      showVerificationBanner: true
    }, 'Onboarding completed', requestId);

  } catch (error: any) {
    logger.error('Complete onboarding failed', { error: error.message });
    return errorResponse(500, error.message, requestId);
  }
}

/**
 * Get onboarding status for a therapist
 */
export async function handleGetOnboardingStatus(
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

    // Check completion status of each onboarding step
    const profile = await (prisma as any).therapist_profiles.findUnique({
      where: { user_id: BigInt(userId) }
    });

    const credentials = await (prisma as any).therapist_credentials.findUnique({
      where: { user_id: BigInt(userId) }
    });

    const license = await (prisma as any).therapist_licenses.findUnique({
      where: { user_id: BigInt(userId) }
    });

    const availability = await (prisma as any).therapist_availability.findUnique({
      where: { user_id: BigInt(userId) }
    });

    const onboardingStatus = {
      profileCompleted: !!profile,
      credentialsCompleted: !!credentials,
      licenseCompleted: !!license,
      availabilityCompleted: !!availability,
      overallCompleted: !!(profile && credentials && license && availability)
    };

    return successResponse({
      success: true,
      onboardingStatus
    }, 'Onboarding status retrieved', requestId);

  } catch (error: any) {
    logger.error('Get onboarding status failed', { error: error.message });
    return errorResponse(500, error.message, requestId);
  }
}
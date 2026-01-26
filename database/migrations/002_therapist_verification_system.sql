-- ============================================================================
-- Therapist Verification System Migration
-- Modern Cognito-based verification workflow with comprehensive audit logging
-- ============================================================================

-- Create temp_therapist_registrations table for pending applications
CREATE TABLE IF NOT EXISTS temp_therapist_registrations (
    id BIGSERIAL PRIMARY KEY,
    user_id BIGINT REFERENCES users(id) ON DELETE CASCADE,
    
    -- Auth Provider Fields (Cognito-based)
    auth_provider_id VARCHAR(255) NOT NULL, -- Cognito sub
    auth_provider_type VARCHAR(50) DEFAULT 'cognito',
    
    -- Basic Information
    email VARCHAR(255) NOT NULL,
    phone_number VARCHAR(20),
    phone_country_code VARCHAR(10) DEFAULT '+1',
    first_name VARCHAR(100) NOT NULL,
    last_name VARCHAR(100) NOT NULL,
    date_of_birth DATE,
    gender VARCHAR(50),
    
    -- Address Information
    address_line1 VARCHAR(255),
    address_line2 VARCHAR(255),
    city VARCHAR(100),
    state VARCHAR(100),
    zip_code VARCHAR(20),
    country VARCHAR(100) DEFAULT 'US',
    timezone VARCHAR(100) DEFAULT 'America/New_York',
    
    -- Profile Information
    languages_spoken JSONB DEFAULT '[]',
    profile_photo_url TEXT,
    selected_avatar_url TEXT,
    headshot_url TEXT,
    
    -- Professional Information
    degree VARCHAR(100),
    institution_name VARCHAR(255),
    graduation_year INTEGER,
    years_of_experience INTEGER DEFAULT 0,
    bio TEXT,
    specializations JSONB DEFAULT '[]',
    
    -- Enhanced Professional Fields
    clinical_specialties JSONB DEFAULT '{}',
    life_context_specialties JSONB DEFAULT '{}',
    therapeutic_modalities JSONB DEFAULT '{}',
    personal_style JSONB DEFAULT '{}',
    demographic_preferences JSONB DEFAULT '{}',
    
    -- License Information
    license_number VARCHAR(100) NOT NULL,
    license_state VARCHAR(50),
    license_type VARCHAR(100),
    license_expiry DATE DEFAULT '2099-12-31',
    license_document_url TEXT,
    npi_number VARCHAR(20),
    licensing_authority VARCHAR(255),
    
    -- Insurance & Malpractice
    malpractice_insurance_provider VARCHAR(255),
    malpractice_policy_number VARCHAR(100),
    malpractice_expiry DATE DEFAULT '2099-12-31',
    malpractice_document_url TEXT,
    
    -- Additional Documents
    degree_certificate_url TEXT,
    photo_id_url TEXT,
    w9_document_url TEXT,
    hipaa_document_url TEXT,
    ethics_document_url TEXT,
    background_check_document_url TEXT,
    
    -- Practice Information
    session_formats JSONB DEFAULT '{}',
    new_clients_capacity INTEGER DEFAULT 0,
    max_caseload_capacity INTEGER DEFAULT 0,
    client_intake_speed VARCHAR(50),
    emergency_same_day_capacity BOOLEAN DEFAULT false,
    preferred_scheduling_density VARCHAR(50),
    weekly_schedule JSONB DEFAULT '{}',
    session_durations INTEGER[] DEFAULT '{}',
    
    -- Insurance & Compliance
    insurance_panels_accepted JSONB DEFAULT '[]',
    medicaid_acceptance BOOLEAN DEFAULT false,
    medicare_acceptance BOOLEAN DEFAULT false,
    self_pay_accepted BOOLEAN DEFAULT false,
    sliding_scale BOOLEAN DEFAULT false,
    employer_eaps JSONB DEFAULT '[]',
    
    -- Compliance & Training
    hipaa_training_completed BOOLEAN DEFAULT false,
    ethics_certification BOOLEAN DEFAULT false,
    signed_baa BOOLEAN DEFAULT false,
    background_check_consent BOOLEAN DEFAULT false,
    background_check_consent_date TIMESTAMP,
    
    -- Profile Content
    short_bio TEXT,
    extended_bio TEXT,
    what_clients_can_expect TEXT,
    my_approach_to_therapy TEXT,
    
    -- Workflow Status
    registration_status VARCHAR(50) DEFAULT 'pending_review',
    workflow_stage VARCHAR(50) DEFAULT 'registration_submitted',
    background_check_status VARCHAR(50) DEFAULT 'not_started',
    
    -- Organization Support
    org_invite_code VARCHAR(100),
    
    -- Timestamps
    created_at TIMESTAMP DEFAULT NOW(),
    updated_at TIMESTAMP DEFAULT NOW(),
    application_submitted_at TIMESTAMP DEFAULT NOW(),
    application_last_updated_at TIMESTAMP DEFAULT NOW(),
    approved_at TIMESTAMP,
    approved_by BIGINT REFERENCES users(id),
    rejected_at TIMESTAMP,
    rejected_by BIGINT REFERENCES users(id),
    rejection_reason TEXT,
    
    -- Constraints
    UNIQUE(auth_provider_id, auth_provider_type),
    UNIQUE(email),
    UNIQUE(phone_number),
    UNIQUE(license_number, license_state)
);

-- Create verification workflow log table
CREATE TABLE IF NOT EXISTS verification_workflow_log (
    id BIGSERIAL PRIMARY KEY,
    user_id BIGINT REFERENCES users(id) ON DELETE CASCADE,
    temp_registration_id BIGINT REFERENCES temp_therapist_registrations(id) ON DELETE CASCADE,
    
    -- Workflow Information
    workflow_stage VARCHAR(50) NOT NULL,
    action VARCHAR(100) NOT NULL,
    status VARCHAR(50) NOT NULL, -- success, failed, pending
    
    -- Performer Information
    performed_by_type VARCHAR(50) NOT NULL, -- system, admin, therapist
    performed_by_id BIGINT REFERENCES users(id),
    
    -- Additional Details
    details JSONB DEFAULT '{}',
    error_message TEXT,
    
    -- Timestamps
    created_at TIMESTAMP DEFAULT NOW(),
    
    -- Indexes
    INDEX idx_workflow_log_user_id (user_id),
    INDEX idx_workflow_log_temp_reg (temp_registration_id),
    INDEX idx_workflow_log_stage (workflow_stage),
    INDEX idx_workflow_log_created (created_at)
);

-- Create verification audit log table
CREATE TABLE IF NOT EXISTS verification_audit_log (
    id BIGSERIAL PRIMARY KEY,
    user_id BIGINT REFERENCES users(id) ON DELETE CASCADE,
    temp_registration_id BIGINT REFERENCES temp_therapist_registrations(id) ON DELETE CASCADE,
    
    -- Audit Information
    action VARCHAR(100) NOT NULL,
    old_status VARCHAR(50),
    new_status VARCHAR(50),
    
    -- Performer Information
    performed_by BIGINT REFERENCES users(id),
    ip_address INET,
    user_agent TEXT,
    
    -- Additional Details
    details JSONB DEFAULT '{}',
    
    -- Timestamps
    created_at TIMESTAMP DEFAULT NOW(),
    
    -- Indexes
    INDEX idx_audit_log_user_id (user_id),
    INDEX idx_audit_log_action (action),
    INDEX idx_audit_log_created (created_at)
);

-- Create organization invites table
CREATE TABLE IF NOT EXISTS organization_invites (
    id BIGSERIAL PRIMARY KEY,
    organization_id BIGINT REFERENCES organizations(id) ON DELETE CASCADE,
    
    -- Invite Information
    invite_code VARCHAR(100) UNIQUE NOT NULL,
    email VARCHAR(255), -- Optional: specific email invite
    role VARCHAR(50) DEFAULT 'therapist',
    
    -- Usage Limits
    max_uses INTEGER DEFAULT 1,
    current_uses INTEGER DEFAULT 0,
    
    -- Status
    status VARCHAR(50) DEFAULT 'active', -- active, used, expired, disabled
    
    -- Usage Tracking
    used_by BIGINT REFERENCES users(id),
    used_at TIMESTAMP,
    
    -- Timestamps
    created_at TIMESTAMP DEFAULT NOW(),
    expires_at TIMESTAMP,
    created_by BIGINT REFERENCES users(id),
    
    -- Indexes
    INDEX idx_org_invites_code (invite_code),
    INDEX idx_org_invites_org (organization_id),
    INDEX idx_org_invites_status (status)
);

-- Create document uploads table
CREATE TABLE IF NOT EXISTS verification_documents (
    id BIGSERIAL PRIMARY KEY,
    temp_registration_id BIGINT REFERENCES temp_therapist_registrations(id) ON DELETE CASCADE,
    user_id BIGINT REFERENCES users(id) ON DELETE CASCADE,
    
    -- Document Information
    document_type VARCHAR(100) NOT NULL, -- license, degree, malpractice, photo_id, headshot, etc.
    document_url TEXT NOT NULL,
    original_filename VARCHAR(255),
    file_size BIGINT,
    mime_type VARCHAR(100),
    
    -- Verification Status
    verification_status VARCHAR(50) DEFAULT 'pending', -- pending, approved, rejected
    verified_by BIGINT REFERENCES users(id),
    verified_at TIMESTAMP,
    verification_notes TEXT,
    
    -- Timestamps
    uploaded_at TIMESTAMP DEFAULT NOW(),
    
    -- Indexes
    INDEX idx_docs_temp_reg (temp_registration_id),
    INDEX idx_docs_user (user_id),
    INDEX idx_docs_type (document_type),
    INDEX idx_docs_status (verification_status)
);

-- Create background check results table
CREATE TABLE IF NOT EXISTS background_check_results (
    id BIGSERIAL PRIMARY KEY,
    temp_registration_id BIGINT REFERENCES temp_therapist_registrations(id) ON DELETE CASCADE,
    user_id BIGINT REFERENCES users(id) ON DELETE CASCADE,
    
    -- Background Check Information
    provider VARCHAR(100), -- checkr, sterling, etc.
    external_id VARCHAR(255), -- Provider's check ID
    
    -- Results
    overall_status VARCHAR(50), -- clear, consider, suspended
    criminal_check_status VARCHAR(50),
    reference_check_status VARCHAR(50),
    education_verification_status VARCHAR(50),
    
    -- Detailed Results
    results_data JSONB DEFAULT '{}',
    
    -- Timestamps
    initiated_at TIMESTAMP DEFAULT NOW(),
    completed_at TIMESTAMP,
    
    -- Indexes
    INDEX idx_bg_check_temp_reg (temp_registration_id),
    INDEX idx_bg_check_user (user_id),
    INDEX idx_bg_check_status (overall_status)
);

-- Add indexes for performance
CREATE INDEX IF NOT EXISTS idx_temp_reg_auth_provider ON temp_therapist_registrations(auth_provider_id, auth_provider_type);
CREATE INDEX IF NOT EXISTS idx_temp_reg_email ON temp_therapist_registrations(email);
CREATE INDEX IF NOT EXISTS idx_temp_reg_status ON temp_therapist_registrations(registration_status);
CREATE INDEX IF NOT EXISTS idx_temp_reg_workflow ON temp_therapist_registrations(workflow_stage);
CREATE INDEX IF NOT EXISTS idx_temp_reg_created ON temp_therapist_registrations(created_at);

-- Create function to get registration status
CREATE OR REPLACE FUNCTION get_registration_status(p_auth_provider_id VARCHAR)
RETURNS TABLE (
    registration_id BIGINT,
    status VARCHAR,
    workflow_stage VARCHAR,
    background_check_status VARCHAR,
    can_login BOOLEAN,
    message TEXT
) AS $$
BEGIN
    RETURN QUERY
    SELECT 
        tr.id,
        tr.registration_status,
        tr.workflow_stage,
        tr.background_check_status,
        CASE 
            WHEN tr.registration_status = 'approved' THEN true
            ELSE false
        END as can_login,
        CASE 
            WHEN tr.registration_status = 'approved' THEN 'Your account has been approved. You can now login.'
            WHEN tr.registration_status = 'rejected' THEN 'Your application was not approved. Please contact support.'
            WHEN tr.workflow_stage = 'background_check' THEN 'Background check in progress. This may take 2-5 business days.'
            WHEN tr.workflow_stage = 'documents_review' THEN 'Our team is reviewing your documents.'
            WHEN tr.workflow_stage = 'final_review' THEN 'Final review in progress.'
            ELSE 'Your application is under review. We will notify you once it is processed.'
        END as message
    FROM temp_therapist_registrations tr
    WHERE tr.auth_provider_id = p_auth_provider_id
    ORDER BY tr.created_at DESC
    LIMIT 1;
END;
$$ LANGUAGE plpgsql;

-- Create function to approve and migrate therapist
CREATE OR REPLACE FUNCTION approve_and_migrate_therapist(
    p_registration_id BIGINT,
    p_approved_by BIGINT
) RETURNS BIGINT AS $$
DECLARE
    v_user_id BIGINT;
    v_temp_data RECORD;
BEGIN
    -- Get temp registration data
    SELECT * INTO v_temp_data 
    FROM temp_therapist_registrations 
    WHERE id = p_registration_id;
    
    IF NOT FOUND THEN
        RAISE EXCEPTION 'Registration not found';
    END IF;
    
    -- Create or update user account
    INSERT INTO users (
        auth_provider_id, auth_provider_type, email, phone_number, 
        first_name, last_name, role, account_status, 
        is_verified, is_active, verified_at, profile_image_url
    ) VALUES (
        v_temp_data.auth_provider_id, v_temp_data.auth_provider_type,
        v_temp_data.email, v_temp_data.phone_number,
        v_temp_data.first_name, v_temp_data.last_name,
        'therapist', 'active', true, true, NOW(),
        COALESCE(v_temp_data.profile_photo_url, v_temp_data.selected_avatar_url)
    )
    ON CONFLICT (auth_provider_id, auth_provider_type) 
    DO UPDATE SET
        account_status = 'active',
        is_verified = true,
        is_active = true,
        verified_at = NOW(),
        updated_at = NOW()
    RETURNING id INTO v_user_id;
    
    -- Create comprehensive therapist profile with ALL fields from temp registration
    INSERT INTO therapists (
        user_id, 
        -- Personal Information
        gender, date_of_birth, timezone, 
        phone_country_code, languages_spoken,
        
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
        background_check_document_url,
        
        -- Status
        background_check_status,
        
        -- Profile Content
        what_clients_can_expect, my_approach_to_therapy,
        
        -- Address Information (if therapists table has these fields)
        address_line1, address_line2, city, state, zip_code, country
    ) VALUES (
        v_user_id,
        -- Personal Information
        v_temp_data.gender, v_temp_data.date_of_birth, 
        COALESCE(v_temp_data.timezone, 'America/New_York'),
        COALESCE(v_temp_data.phone_country_code, '+1'), 
        COALESCE(v_temp_data.languages_spoken, '[]'::jsonb),
        
        -- Profile Images
        v_temp_data.profile_photo_url, v_temp_data.selected_avatar_url, v_temp_data.headshot_url,
        
        -- Professional Information
        v_temp_data.degree, v_temp_data.institution_name, v_temp_data.graduation_year, 
        COALESCE(v_temp_data.years_of_experience, 0),
        v_temp_data.bio, v_temp_data.extended_bio, v_temp_data.short_bio,
        
        -- Specialties and Modalities (JSONB fields)
        COALESCE(v_temp_data.clinical_specialties, '{}'::jsonb),
        COALESCE(v_temp_data.life_context_specialties, '{}'::jsonb),
        COALESCE(v_temp_data.therapeutic_modalities, '{}'::jsonb),
        COALESCE(v_temp_data.personal_style, '{}'::jsonb),
        COALESCE(v_temp_data.demographic_preferences, '{}'::jsonb),
        
        -- Practice Information
        COALESCE(v_temp_data.session_formats, '{}'::jsonb),
        COALESCE(v_temp_data.new_clients_capacity, 0),
        COALESCE(v_temp_data.max_caseload_capacity, 0),
        v_temp_data.client_intake_speed,
        COALESCE(v_temp_data.emergency_same_day_capacity, false),
        v_temp_data.preferred_scheduling_density,
        COALESCE(v_temp_data.weekly_schedule, '{}'::jsonb),
        COALESCE(v_temp_data.session_durations, ARRAY[]::integer[]),
        
        -- Insurance and Compliance
        COALESCE(v_temp_data.insurance_panels_accepted, '[]'::jsonb),
        COALESCE(v_temp_data.medicaid_acceptance, false),
        COALESCE(v_temp_data.medicare_acceptance, false),
        COALESCE(v_temp_data.self_pay_accepted, false),
        COALESCE(v_temp_data.sliding_scale, false),
        COALESCE(v_temp_data.employer_eaps, '[]'::jsonb),
        COALESCE(v_temp_data.hipaa_training_completed, false),
        COALESCE(v_temp_data.ethics_certification, false),
        COALESCE(v_temp_data.signed_baa, false),
        
        -- Document URLs
        v_temp_data.w9_document_url, v_temp_data.hipaa_document_url, 
        v_temp_data.ethics_document_url, v_temp_data.background_check_document_url,
        
        -- Status
        COALESCE(v_temp_data.background_check_status, 'completed'),
        
        -- Profile Content
        v_temp_data.what_clients_can_expect, v_temp_data.my_approach_to_therapy,
        
        -- Address Information
        v_temp_data.address_line1, v_temp_data.address_line2, 
        v_temp_data.city, v_temp_data.state, v_temp_data.zip_code, v_temp_data.country
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
        updated_at = NOW();
    
    -- Create comprehensive therapist verification record with ALL license and verification data
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
        v_user_id,
        -- License Information
        v_temp_data.license_number, v_temp_data.license_state, 
        v_temp_data.license_type, v_temp_data.license_expiry,
        v_temp_data.license_document_url, true, v_temp_data.npi_number,
        v_temp_data.licensing_authority,
        
        -- Insurance Information
        v_temp_data.malpractice_insurance_provider, v_temp_data.malpractice_policy_number,
        v_temp_data.malpractice_expiry, v_temp_data.malpractice_document_url,
        
        -- Professional Information
        v_temp_data.degree, 
        CASE 
            WHEN v_temp_data.specializations IS NOT NULL THEN v_temp_data.specializations
            ELSE '[]'::jsonb
        END,
        
        -- Verification Status
        'completed', 
        jsonb_build_object(
            'criminal', 'clear',
            'references', 'verified', 
            'education', 'verified',
            'license', 'verified',
            'approved_at', NOW()::text,
            'approved_by', p_approved_by
        ),
        'approved',
        
        -- Document URLs
        v_temp_data.degree_certificate_url, v_temp_data.photo_id_url,
        
        -- Verification Metadata
        NOW(), p_approved_by, 
        'Approved via automated migration from temp registration'
    )
    ON CONFLICT (user_id) DO UPDATE SET
        license_verified = true,
        verification_status = 'approved',
        background_check_status = 'completed',
        reviewed_at = NOW(),
        approved_by = p_approved_by,
        verification_notes = 'Updated via automated migration',
        updated_at = NOW();
    
    -- Update temp registration status
    UPDATE temp_therapist_registrations
    SET registration_status = 'approved',
        workflow_stage = 'approved',
        approved_at = NOW(),
        approved_by = p_approved_by,
        updated_at = NOW()
    WHERE id = p_registration_id;
    
    -- Log workflow action
    INSERT INTO verification_workflow_log (
        user_id, temp_registration_id, workflow_stage, action, status,
        performed_by_type, performed_by_id, details
    ) VALUES (
        v_user_id, p_registration_id, 'approved', 'account_activated', 'success',
        'admin', p_approved_by,
        jsonb_build_object(
            'migration_method', 'comprehensive_data_transfer',
            'fields_migrated', jsonb_build_array(
                'personal_info', 'professional_info', 'specialties', 
                'practice_info', 'compliance', 'documents', 'verification'
            ),
            'approved_at', NOW()::text
        )
    );
    
    RETURN v_user_id;
END;
$$ LANGUAGE plpgsql;

-- Grant permissions
GRANT SELECT, INSERT, UPDATE, DELETE ON temp_therapist_registrations TO ataraxia_user;
GRANT SELECT, INSERT, UPDATE, DELETE ON verification_workflow_log TO ataraxia_user;
GRANT SELECT, INSERT, UPDATE, DELETE ON verification_audit_log TO ataraxia_user;
GRANT SELECT, INSERT, UPDATE, DELETE ON organization_invites TO ataraxia_user;
GRANT SELECT, INSERT, UPDATE, DELETE ON verification_documents TO ataraxia_user;
GRANT SELECT, INSERT, UPDATE, DELETE ON background_check_results TO ataraxia_user;

GRANT USAGE, SELECT ON SEQUENCE temp_therapist_registrations_id_seq TO ataraxia_user;
GRANT USAGE, SELECT ON SEQUENCE verification_workflow_log_id_seq TO ataraxia_user;
GRANT USAGE, SELECT ON SEQUENCE verification_audit_log_id_seq TO ataraxia_user;
GRANT USAGE, SELECT ON SEQUENCE organization_invites_id_seq TO ataraxia_user;
GRANT USAGE, SELECT ON SEQUENCE verification_documents_id_seq TO ataraxia_user;
GRANT USAGE, SELECT ON SEQUENCE background_check_results_id_seq TO ataraxia_user;

-- Add comments for documentation
COMMENT ON TABLE temp_therapist_registrations IS 'Temporary storage for therapist registration applications pending verification';
COMMENT ON TABLE verification_workflow_log IS 'Audit log for all verification workflow actions';
COMMENT ON TABLE verification_audit_log IS 'Comprehensive audit log for compliance and security';
COMMENT ON TABLE organization_invites IS 'Invite codes for organization-based therapist registration';
COMMENT ON TABLE verification_documents IS 'Document uploads for verification process';
COMMENT ON TABLE background_check_results IS 'Background check results from external providers';
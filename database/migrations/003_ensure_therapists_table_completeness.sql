-- ============================================================================
-- Ensure Therapists Table Completeness
-- Adds any missing fields to the therapists table to match temp_therapist_registrations
-- ============================================================================

-- Add missing fields to therapists table if they don't exist
-- This ensures the therapists table can store all data from temp_therapist_registrations

-- Personal Information Fields
ALTER TABLE therapists ADD COLUMN IF NOT EXISTS gender VARCHAR(50);
ALTER TABLE therapists ADD COLUMN IF NOT EXISTS date_of_birth DATE;
ALTER TABLE therapists ADD COLUMN IF NOT EXISTS timezone VARCHAR(100) DEFAULT 'America/New_York';
ALTER TABLE therapists ADD COLUMN IF NOT EXISTS phone_country_code VARCHAR(10) DEFAULT '+1';
ALTER TABLE therapists ADD COLUMN IF NOT EXISTS languages_spoken JSONB DEFAULT '[]';

-- Profile Images
ALTER TABLE therapists ADD COLUMN IF NOT EXISTS profile_photo_url TEXT;
ALTER TABLE therapists ADD COLUMN IF NOT EXISTS selected_avatar_url TEXT;
ALTER TABLE therapists ADD COLUMN IF NOT EXISTS headshot_url TEXT;

-- Professional Information
ALTER TABLE therapists ADD COLUMN IF NOT EXISTS highest_degree VARCHAR(100);
ALTER TABLE therapists ADD COLUMN IF NOT EXISTS institution_name VARCHAR(255);
ALTER TABLE therapists ADD COLUMN IF NOT EXISTS graduation_year INTEGER;
ALTER TABLE therapists ADD COLUMN IF NOT EXISTS years_of_experience INTEGER DEFAULT 0;
ALTER TABLE therapists ADD COLUMN IF NOT EXISTS bio TEXT;
ALTER TABLE therapists ADD COLUMN IF NOT EXISTS extended_bio TEXT;
ALTER TABLE therapists ADD COLUMN IF NOT EXISTS short_bio TEXT;

-- Specialties and Modalities (JSONB fields for flexibility)
ALTER TABLE therapists ADD COLUMN IF NOT EXISTS clinical_specialties JSONB DEFAULT '{}';
ALTER TABLE therapists ADD COLUMN IF NOT EXISTS life_context_specialties JSONB DEFAULT '{}';
ALTER TABLE therapists ADD COLUMN IF NOT EXISTS therapeutic_modalities JSONB DEFAULT '{}';
ALTER TABLE therapists ADD COLUMN IF NOT EXISTS personal_style JSONB DEFAULT '{}';
ALTER TABLE therapists ADD COLUMN IF NOT EXISTS demographic_preferences JSONB DEFAULT '{}';

-- Practice Information
ALTER TABLE therapists ADD COLUMN IF NOT EXISTS session_formats JSONB DEFAULT '{}';
ALTER TABLE therapists ADD COLUMN IF NOT EXISTS new_clients_capacity INTEGER DEFAULT 0;
ALTER TABLE therapists ADD COLUMN IF NOT EXISTS max_caseload_capacity INTEGER DEFAULT 0;
ALTER TABLE therapists ADD COLUMN IF NOT EXISTS client_intake_speed VARCHAR(50);
ALTER TABLE therapists ADD COLUMN IF NOT EXISTS emergency_same_day_capacity BOOLEAN DEFAULT false;
ALTER TABLE therapists ADD COLUMN IF NOT EXISTS preferred_scheduling_density VARCHAR(50);
ALTER TABLE therapists ADD COLUMN IF NOT EXISTS weekly_schedule JSONB DEFAULT '{}';
ALTER TABLE therapists ADD COLUMN IF NOT EXISTS session_durations INTEGER[] DEFAULT '{}';

-- Insurance and Compliance
ALTER TABLE therapists ADD COLUMN IF NOT EXISTS insurance_panels_accepted JSONB DEFAULT '[]';
ALTER TABLE therapists ADD COLUMN IF NOT EXISTS medicaid_acceptance BOOLEAN DEFAULT false;
ALTER TABLE therapists ADD COLUMN IF NOT EXISTS medicare_acceptance BOOLEAN DEFAULT false;
ALTER TABLE therapists ADD COLUMN IF NOT EXISTS self_pay_accepted BOOLEAN DEFAULT false;
ALTER TABLE therapists ADD COLUMN IF NOT EXISTS sliding_scale BOOLEAN DEFAULT false;
ALTER TABLE therapists ADD COLUMN IF NOT EXISTS employer_eaps JSONB DEFAULT '[]';

-- Compliance and Training
ALTER TABLE therapists ADD COLUMN IF NOT EXISTS hipaa_training_completed BOOLEAN DEFAULT false;
ALTER TABLE therapists ADD COLUMN IF NOT EXISTS ethics_certification BOOLEAN DEFAULT false;
ALTER TABLE therapists ADD COLUMN IF NOT EXISTS signed_baa BOOLEAN DEFAULT false;

-- Document URLs
ALTER TABLE therapists ADD COLUMN IF NOT EXISTS w9_document_url TEXT;
ALTER TABLE therapists ADD COLUMN IF NOT EXISTS hipaa_document_url TEXT;
ALTER TABLE therapists ADD COLUMN IF NOT EXISTS ethics_document_url TEXT;
ALTER TABLE therapists ADD COLUMN IF NOT EXISTS background_check_document_url TEXT;

-- Status Fields
ALTER TABLE therapists ADD COLUMN IF NOT EXISTS background_check_status VARCHAR(50) DEFAULT 'not_started';

-- Profile Content
ALTER TABLE therapists ADD COLUMN IF NOT EXISTS what_clients_can_expect TEXT;
ALTER TABLE therapists ADD COLUMN IF NOT EXISTS my_approach_to_therapy TEXT;

-- Address Information (for therapists who provide in-person services)
ALTER TABLE therapists ADD COLUMN IF NOT EXISTS address_line1 VARCHAR(255);
ALTER TABLE therapists ADD COLUMN IF NOT EXISTS address_line2 VARCHAR(255);
ALTER TABLE therapists ADD COLUMN IF NOT EXISTS city VARCHAR(100);
ALTER TABLE therapists ADD COLUMN IF NOT EXISTS state VARCHAR(100);
ALTER TABLE therapists ADD COLUMN IF NOT EXISTS zip_code VARCHAR(20);
ALTER TABLE therapists ADD COLUMN IF NOT EXISTS country VARCHAR(100) DEFAULT 'US';

-- Ensure therapist_verifications table has all necessary fields
ALTER TABLE therapist_verifications ADD COLUMN IF NOT EXISTS licensing_authority VARCHAR(255);
ALTER TABLE therapist_verifications ADD COLUMN IF NOT EXISTS degree_certificate_url TEXT;
ALTER TABLE therapist_verifications ADD COLUMN IF NOT EXISTS photo_id_url TEXT;
ALTER TABLE therapist_verifications ADD COLUMN IF NOT EXISTS verification_notes TEXT;
ALTER TABLE therapist_verifications ADD COLUMN IF NOT EXISTS background_check_result JSONB DEFAULT '{}';

-- Add indexes for performance on commonly queried fields
CREATE INDEX IF NOT EXISTS idx_therapists_clinical_specialties ON therapists USING GIN (clinical_specialties);
CREATE INDEX IF NOT EXISTS idx_therapists_session_formats ON therapists USING GIN (session_formats);
CREATE INDEX IF NOT EXISTS idx_therapists_location ON therapists (city, state, country);
CREATE INDEX IF NOT EXISTS idx_therapists_capacity ON therapists (new_clients_capacity) WHERE new_clients_capacity > 0;
CREATE INDEX IF NOT EXISTS idx_therapists_insurance ON therapists USING GIN (insurance_panels_accepted);

-- Add comments for documentation
COMMENT ON COLUMN therapists.clinical_specialties IS 'JSONB object containing clinical specialties like anxiety, depression, trauma, etc.';
COMMENT ON COLUMN therapists.therapeutic_modalities IS 'JSONB object containing therapeutic approaches like CBT, DBT, EMDR, etc.';
COMMENT ON COLUMN therapists.session_formats IS 'JSONB object indicating supported session formats: video, in_person, phone, etc.';
COMMENT ON COLUMN therapists.weekly_schedule IS 'JSONB object containing weekly availability schedule';
COMMENT ON COLUMN therapists.insurance_panels_accepted IS 'JSONB array of accepted insurance providers';
COMMENT ON COLUMN therapists.demographic_preferences IS 'JSONB object containing preferred client demographics';

-- Create a view for complete therapist information (useful for mobile/web apps)
CREATE OR REPLACE VIEW therapist_complete_profile AS
SELECT 
    u.id,
    u.auth_provider_id,
    u.email,
    u.phone_number,
    u.first_name,
    u.last_name,
    u.account_status,
    u.is_verified,
    u.is_active,
    u.profile_image_url,
    u.created_at,
    u.updated_at,
    
    -- Therapist profile data
    t.gender,
    t.date_of_birth,
    t.timezone,
    t.phone_country_code,
    t.languages_spoken,
    t.profile_photo_url,
    t.selected_avatar_url,
    t.headshot_url,
    t.highest_degree,
    t.institution_name,
    t.graduation_year,
    t.years_of_experience,
    t.bio,
    t.extended_bio,
    t.short_bio,
    t.clinical_specialties,
    t.life_context_specialties,
    t.therapeutic_modalities,
    t.personal_style,
    t.demographic_preferences,
    t.session_formats,
    t.new_clients_capacity,
    t.max_caseload_capacity,
    t.client_intake_speed,
    t.emergency_same_day_capacity,
    t.preferred_scheduling_density,
    t.weekly_schedule,
    t.session_durations,
    t.insurance_panels_accepted,
    t.medicaid_acceptance,
    t.medicare_acceptance,
    t.self_pay_accepted,
    t.sliding_scale,
    t.employer_eaps,
    t.hipaa_training_completed,
    t.ethics_certification,
    t.signed_baa,
    t.background_check_status,
    t.what_clients_can_expect,
    t.my_approach_to_therapy,
    t.address_line1,
    t.address_line2,
    t.city,
    t.state,
    t.zip_code,
    t.country,
    
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
    tv.reviewed_at,
    tv.background_check_result,
    
    -- Organization data
    o.name as organization_name,
    o.id as organization_id
    
FROM users u
INNER JOIN therapists t ON u.id = t.user_id
LEFT JOIN therapist_verifications tv ON u.id = tv.user_id
LEFT JOIN organizations o ON u.organization_id = o.id
WHERE u.role = 'therapist' AND u.account_status = 'active';

-- Grant permissions on the view
GRANT SELECT ON therapist_complete_profile TO ataraxia_user;

-- Create function to get therapist profile with all data
CREATE OR REPLACE FUNCTION get_complete_therapist_profile(p_therapist_id BIGINT)
RETURNS TABLE (
    -- User information
    id BIGINT,
    auth_provider_id VARCHAR,
    email VARCHAR,
    phone_number VARCHAR,
    first_name VARCHAR,
    last_name VARCHAR,
    account_status VARCHAR,
    is_verified BOOLEAN,
    is_active BOOLEAN,
    
    -- Professional information
    highest_degree VARCHAR,
    institution_name VARCHAR,
    graduation_year INTEGER,
    years_of_experience INTEGER,
    bio TEXT,
    extended_bio TEXT,
    short_bio TEXT,
    
    -- Specialties (as JSON strings for easy parsing)
    clinical_specialties_json TEXT,
    therapeutic_modalities_json TEXT,
    session_formats_json TEXT,
    
    -- Practice information
    new_clients_capacity INTEGER,
    max_caseload_capacity INTEGER,
    emergency_same_day_capacity BOOLEAN,
    
    -- Verification status
    license_number VARCHAR,
    license_state VARCHAR,
    license_verified BOOLEAN,
    verification_status VARCHAR,
    
    -- Organization
    organization_name VARCHAR
) AS $$
BEGIN
    RETURN QUERY
    SELECT 
        tcp.id,
        tcp.auth_provider_id,
        tcp.email,
        tcp.phone_number,
        tcp.first_name,
        tcp.last_name,
        tcp.account_status,
        tcp.is_verified,
        tcp.is_active,
        tcp.highest_degree,
        tcp.institution_name,
        tcp.graduation_year,
        tcp.years_of_experience,
        tcp.bio,
        tcp.extended_bio,
        tcp.short_bio,
        tcp.clinical_specialties::text,
        tcp.therapeutic_modalities::text,
        tcp.session_formats::text,
        tcp.new_clients_capacity,
        tcp.max_caseload_capacity,
        tcp.emergency_same_day_capacity,
        tcp.license_number,
        tcp.license_state,
        tcp.license_verified,
        tcp.verification_status,
        tcp.organization_name
    FROM therapist_complete_profile tcp
    WHERE tcp.id = p_therapist_id;
END;
$$ LANGUAGE plpgsql;

-- Grant permissions
GRANT EXECUTE ON FUNCTION get_complete_therapist_profile(BIGINT) TO ataraxia_user;

-- Add final comment
COMMENT ON TABLE therapists IS 'Complete therapist profiles with all professional, practice, and compliance information migrated from temp_therapist_registrations';
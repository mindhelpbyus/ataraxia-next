-- REGISTRATION vs ONBOARDING SEPARATION MIGRATION
-- This migration separates authentication from business logic

-- Step 1: Create new minimal users table structure
CREATE TABLE users_new (
  -- Core Identity & Authentication
  id BIGSERIAL PRIMARY KEY,
  email TEXT UNIQUE NOT NULL,
  password_hash TEXT NULL, -- Only for local auth
  
  -- Provider Authentication
  auth_provider_type VARCHAR(50) NOT NULL DEFAULT 'local',
  current_auth_provider VARCHAR(50) NOT NULL DEFAULT 'local',
  auth_provider_id VARCHAR(255) NULL, -- Firebase UID, Cognito sub, etc.
  
  -- Authorization
  role TEXT NOT NULL,
  account_status VARCHAR(50) NOT NULL DEFAULT 'registered',
  is_active BOOLEAN NOT NULL DEFAULT true,
  
  -- Security & MFA
  mfa_enabled BOOLEAN NOT NULL DEFAULT false,
  email_verified BOOLEAN NOT NULL DEFAULT false,
  phone_verified BOOLEAN NOT NULL DEFAULT false,
  failed_login_attempts INTEGER NOT NULL DEFAULT 0,
  account_locked_until TIMESTAMPTZ NULL,
  last_login_at TIMESTAMPTZ NULL,
  login_count INTEGER NOT NULL DEFAULT 0,
  
  -- Minimal Profile (needed for auth display only)
  first_name TEXT NOT NULL,
  last_name TEXT NOT NULL,
  phone_number TEXT NULL,
  country_code VARCHAR(10) DEFAULT '+1',
  
  -- Timestamps
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Step 2: Create business logic tables for therapist data

-- Therapist profiles (personal information)
CREATE TABLE therapist_profiles (
  user_id BIGINT PRIMARY KEY REFERENCES users_new(id) ON DELETE CASCADE,
  middle_name TEXT,
  preferred_name TEXT,
  display_name TEXT,
  profile_image_url TEXT,
  avatar_url TEXT,
  gender VARCHAR(20),
  date_of_birth DATE,
  bio TEXT,
  short_bio TEXT,
  extended_bio TEXT,
  what_clients_can_expect TEXT,
  my_approach_to_therapy TEXT,
  timezone VARCHAR(100),
  languages TEXT[],
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Therapist credentials (education and experience)
CREATE TABLE therapist_credentials (
  user_id BIGINT PRIMARY KEY REFERENCES users_new(id) ON DELETE CASCADE,
  highest_degree VARCHAR(100),
  institution_name VARCHAR(255),
  graduation_year INTEGER,
  years_of_experience INTEGER,
  specializations TEXT[],
  clinical_specialties JSONB DEFAULT '{}',
  therapeutic_modalities JSONB DEFAULT '{}',
  personal_style JSONB DEFAULT '{}',
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Therapist licenses (professional licensing)
CREATE TABLE therapist_licenses (
  user_id BIGINT PRIMARY KEY REFERENCES users_new(id) ON DELETE CASCADE,
  license_type VARCHAR(100),
  license_number VARCHAR(100),
  license_state VARCHAR(50),
  license_expiry DATE,
  license_document_url TEXT,
  malpractice_insurance VARCHAR(255),
  malpractice_document_url TEXT,
  npi_number VARCHAR(20),
  dea_number VARCHAR(50),
  licensing_authority VARCHAR(255),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Therapist availability (scheduling and capacity)
CREATE TABLE therapist_availability (
  user_id BIGINT PRIMARY KEY REFERENCES users_new(id) ON DELETE CASCADE,
  session_formats JSONB DEFAULT '{}',
  new_clients_capacity INTEGER,
  max_caseload_capacity INTEGER,
  client_intake_speed VARCHAR(20),
  emergency_same_day_capacity BOOLEAN DEFAULT false,
  weekly_schedule JSONB DEFAULT '{}',
  session_lengths_offered INTEGER[],
  preferred_scheduling_density VARCHAR(20),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Therapist insurance and billing
CREATE TABLE therapist_insurance (
  user_id BIGINT PRIMARY KEY REFERENCES users_new(id) ON DELETE CASCADE,
  insurance_panels_accepted JSONB DEFAULT '[]',
  medicaid_acceptance BOOLEAN DEFAULT false,
  medicare_acceptance BOOLEAN DEFAULT false,
  self_pay_accepted BOOLEAN DEFAULT false,
  sliding_scale BOOLEAN DEFAULT false,
  employer_eaps JSONB DEFAULT '[]',
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Therapist compliance and documents
CREATE TABLE therapist_compliance (
  user_id BIGINT PRIMARY KEY REFERENCES users_new(id) ON DELETE CASCADE,
  background_check_status VARCHAR(50) DEFAULT 'pending',
  hipaa_training_completed BOOLEAN DEFAULT false,
  ethics_certification BOOLEAN DEFAULT false,
  signed_baa BOOLEAN DEFAULT false,
  w9_document_url TEXT,
  hipaa_document_url TEXT,
  ethics_document_url TEXT,
  background_check_document_url TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- User addresses (separate from auth)
CREATE TABLE user_addresses (
  user_id BIGINT PRIMARY KEY REFERENCES users_new(id) ON DELETE CASCADE,
  address_line1 VARCHAR(255),
  address_line2 VARCHAR(255),
  city VARCHAR(100),
  state VARCHAR(50),
  zip_code VARCHAR(20),
  country VARCHAR(50) DEFAULT 'US',
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- User onboarding tracking (separate from auth)
CREATE TABLE user_onboarding (
  user_id BIGINT PRIMARY KEY REFERENCES users_new(id) ON DELETE CASCADE,
  onboarding_step INTEGER DEFAULT 0,
  onboarding_status VARCHAR(50) DEFAULT 'pending',
  onboarding_session_id TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- User marketing data (separate from auth)
CREATE TABLE user_marketing (
  user_id BIGINT PRIMARY KEY REFERENCES users_new(id) ON DELETE CASCADE,
  marketing_consent BOOLEAN DEFAULT false,
  referral_source TEXT,
  signup_source VARCHAR(50),
  signup_platform VARCHAR(50),
  signup_device_info JSONB,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- User organization relationships (separate from auth)
CREATE TABLE user_organization (
  user_id BIGINT PRIMARY KEY REFERENCES users_new(id) ON DELETE CASCADE,
  organization_id BIGINT REFERENCES organizations(id),
  is_org_owner BOOLEAN DEFAULT false,
  primary_user_id BIGINT REFERENCES users_new(id),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- User compliance tracking (separate from auth)
CREATE TABLE user_compliance (
  user_id BIGINT PRIMARY KEY REFERENCES users_new(id) ON DELETE CASCADE,
  terms_accepted_at TIMESTAMPTZ,
  terms_version VARCHAR(20),
  is_anonymized BOOLEAN DEFAULT false,
  anonymized_at TIMESTAMPTZ,
  anonymization_reason TEXT,
  deleted_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Step 3: Create indexes for performance
CREATE INDEX idx_users_new_email ON users_new(email);
CREATE INDEX idx_users_new_auth_provider ON users_new(auth_provider_type, auth_provider_id);
CREATE INDEX idx_users_new_role ON users_new(role);
CREATE INDEX idx_users_new_account_status ON users_new(account_status);
CREATE INDEX idx_users_new_created_at ON users_new(created_at);

CREATE INDEX idx_therapist_profiles_timezone ON therapist_profiles(timezone);
CREATE INDEX idx_therapist_credentials_specializations ON therapist_credentials USING GIN(specializations);
CREATE INDEX idx_therapist_licenses_license_state ON therapist_licenses(license_state);
CREATE INDEX idx_therapist_availability_session_formats ON therapist_availability USING GIN(session_formats);
CREATE INDEX idx_user_addresses_location ON user_addresses(city, state, country);

-- Step 4: Add comments for documentation
COMMENT ON TABLE users_new IS 'Minimal authentication-focused users table - contains only auth and authorization data';
COMMENT ON TABLE therapist_profiles IS 'Therapist personal information and profile data';
COMMENT ON TABLE therapist_credentials IS 'Therapist education, experience, and specializations';
COMMENT ON TABLE therapist_licenses IS 'Therapist professional licensing and certifications';
COMMENT ON TABLE therapist_availability IS 'Therapist scheduling and capacity preferences';
COMMENT ON TABLE therapist_insurance IS 'Therapist insurance and billing preferences';
COMMENT ON TABLE therapist_compliance IS 'Therapist compliance documents and certifications';
COMMENT ON TABLE user_addresses IS 'User address information';
COMMENT ON TABLE user_onboarding IS 'User onboarding progress tracking';
COMMENT ON TABLE user_marketing IS 'User marketing consent and attribution data';
COMMENT ON TABLE user_organization IS 'User organization relationships';
COMMENT ON TABLE user_compliance IS 'User compliance and privacy tracking';
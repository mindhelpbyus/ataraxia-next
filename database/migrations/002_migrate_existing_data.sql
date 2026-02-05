-- DATA MIGRATION SCRIPT
-- Migrates existing users table data to new separated architecture

-- Step 1: Backup existing users table
CREATE TABLE users_backup AS SELECT * FROM users;

-- Step 2: Migrate core authentication data to new users table
INSERT INTO users_new (
  id,
  email,
  password_hash,
  auth_provider_type,
  current_auth_provider,
  auth_provider_id,
  role,
  account_status,
  is_active,
  mfa_enabled,
  email_verified,
  phone_verified,
  failed_login_attempts,
  account_locked_until,
  last_login_at,
  login_count,
  first_name,
  last_name,
  phone_number,
  country_code,
  created_at,
  updated_at
)
SELECT 
  id,
  email,
  password_hash,
  COALESCE(auth_provider_type, 'local'),
  COALESCE(current_auth_provider, 'local'),
  auth_provider_id,
  role,
  COALESCE(account_status, 'active'),
  COALESCE(is_active, true),
  COALESCE(mfa_enabled, false),
  COALESCE(email_verified, false),
  COALESCE(phone_verified, false),
  COALESCE(failed_login_attempts, 0),
  account_locked_until,
  last_login_at,
  COALESCE(login_count, 0),
  first_name,
  last_name,
  phone_number,
  COALESCE(country_code, '+1'),
  COALESCE(created_at, NOW()),
  COALESCE(updated_at, NOW())
FROM users
WHERE email IS NOT NULL AND first_name IS NOT NULL AND last_name IS NOT NULL;

-- Step 3: Migrate therapist profile data
INSERT INTO therapist_profiles (
  user_id,
  middle_name,
  preferred_name,
  display_name,
  profile_image_url,
  avatar_url,
  gender,
  date_of_birth,
  bio,
  timezone,
  languages,
  created_at,
  updated_at
)
SELECT 
  u.id,
  u.middle_name,
  u.preferred_name,
  u.display_name,
  u.profile_image_url,
  u.avatar_url,
  -- Extract gender from existing data if available
  NULL as gender,
  -- Extract date_of_birth from existing data if available  
  NULL as date_of_birth,
  -- Extract bio from existing therapist data if available
  NULL as bio,
  u.user_timezone,
  CASE 
    WHEN u.language IS NOT NULL THEN ARRAY[u.language]
    ELSE ARRAY[]::text[]
  END as languages,
  COALESCE(u.created_at, NOW()),
  COALESCE(u.updated_at, NOW())
FROM users u
WHERE u.role = 'therapist'
AND u.id IN (SELECT id FROM users_new);

-- Step 4: Migrate therapist credentials (from temp_therapist_registrations if available)
INSERT INTO therapist_credentials (
  user_id,
  highest_degree,
  institution_name,
  graduation_year,
  years_of_experience,
  specializations,
  clinical_specialties,
  therapeutic_modalities,
  personal_style,
  created_at,
  updated_at
)
SELECT DISTINCT
  u.id,
  ttr.degree,
  ttr.institution_name,
  CASE 
    WHEN ttr.graduation_year ~ '^[0-9]+$' THEN ttr.graduation_year::integer
    ELSE NULL
  END,
  ttr.years_of_experience,
  COALESCE(ttr.specializations, ARRAY[]::text[]),
  COALESCE(ttr.clinical_specialties, '{}'::jsonb),
  COALESCE(ttr.therapeutic_modalities, '{}'::jsonb),
  COALESCE(ttr.personal_style, '{}'::jsonb),
  COALESCE(ttr.created_at, NOW()),
  COALESCE(ttr.updated_at, NOW())
FROM users_new u
LEFT JOIN temp_therapist_registrations ttr ON u.auth_provider_id = ttr.firebase_uid
WHERE u.role = 'therapist'
AND ttr.id IS NOT NULL;

-- Step 5: Migrate therapist licenses
INSERT INTO therapist_licenses (
  user_id,
  license_type,
  license_number,
  license_state,
  license_expiry,
  license_document_url,
  malpractice_insurance,
  malpractice_document_url,
  npi_number,
  dea_number,
  licensing_authority,
  created_at,
  updated_at
)
SELECT DISTINCT
  u.id,
  ttr.license_type,
  ttr.license_number,
  ttr.license_state,
  ttr.license_expiry,
  ttr.license_document_url,
  ttr.malpractice_insurance_provider,
  ttr.malpractice_document_url,
  ttr.npi_number,
  ttr.dea_number,
  ttr.licensing_authority,
  COALESCE(ttr.created_at, NOW()),
  COALESCE(ttr.updated_at, NOW())
FROM users_new u
LEFT JOIN temp_therapist_registrations ttr ON u.auth_provider_id = ttr.firebase_uid
WHERE u.role = 'therapist'
AND ttr.id IS NOT NULL
AND ttr.license_number IS NOT NULL;

-- Step 6: Migrate therapist availability
INSERT INTO therapist_availability (
  user_id,
  session_formats,
  new_clients_capacity,
  max_caseload_capacity,
  client_intake_speed,
  emergency_same_day_capacity,
  weekly_schedule,
  session_lengths_offered,
  preferred_scheduling_density,
  created_at,
  updated_at
)
SELECT DISTINCT
  u.id,
  COALESCE(ttr.session_formats, '{}'::jsonb),
  ttr.new_clients_capacity,
  ttr.max_caseload_capacity,
  ttr.client_intake_speed,
  COALESCE(ttr.emergency_same_day_capacity, false),
  COALESCE(ttr.weekly_schedule, '{}'::jsonb),
  COALESCE(ttr.session_durations, ARRAY[]::integer[]),
  ttr.preferred_scheduling_density,
  COALESCE(ttr.created_at, NOW()),
  COALESCE(ttr.updated_at, NOW())
FROM users_new u
LEFT JOIN temp_therapist_registrations ttr ON u.auth_provider_id = ttr.firebase_uid
WHERE u.role = 'therapist'
AND ttr.id IS NOT NULL;

-- Step 7: Migrate therapist insurance
INSERT INTO therapist_insurance (
  user_id,
  insurance_panels_accepted,
  medicaid_acceptance,
  medicare_acceptance,
  self_pay_accepted,
  sliding_scale,
  employer_eaps,
  created_at,
  updated_at
)
SELECT DISTINCT
  u.id,
  COALESCE(ttr.insurance_panels_accepted, '[]'::jsonb),
  COALESCE(ttr.medicaid_acceptance, false),
  COALESCE(ttr.medicare_acceptance, false),
  COALESCE(ttr.self_pay_accepted, false),
  COALESCE(ttr.sliding_scale, false),
  COALESCE(ttr.employer_eaps, '[]'::jsonb),
  COALESCE(ttr.created_at, NOW()),
  COALESCE(ttr.updated_at, NOW())
FROM users_new u
LEFT JOIN temp_therapist_registrations ttr ON u.auth_provider_id = ttr.firebase_uid
WHERE u.role = 'therapist'
AND ttr.id IS NOT NULL;

-- Step 8: Migrate therapist compliance
INSERT INTO therapist_compliance (
  user_id,
  background_check_status,
  hipaa_training_completed,
  ethics_certification,
  signed_baa,
  w9_document_url,
  hipaa_document_url,
  ethics_document_url,
  background_check_document_url,
  created_at,
  updated_at
)
SELECT DISTINCT
  u.id,
  COALESCE(ttr.background_check_status, 'pending'),
  COALESCE(ttr.hipaa_training_completed, false),
  COALESCE(ttr.ethics_certification, false),
  COALESCE(ttr.signed_baa, false),
  ttr.w9_document_url,
  ttr.hipaa_document_url,
  ttr.ethics_document_url,
  ttr.background_check_document_url,
  COALESCE(ttr.created_at, NOW()),
  COALESCE(ttr.updated_at, NOW())
FROM users_new u
LEFT JOIN temp_therapist_registrations ttr ON u.auth_provider_id = ttr.firebase_uid
WHERE u.role = 'therapist'
AND ttr.id IS NOT NULL;

-- Step 9: Migrate user addresses
INSERT INTO user_addresses (
  user_id,
  address_line1,
  address_line2,
  city,
  state,
  zip_code,
  country,
  created_at,
  updated_at
)
SELECT DISTINCT
  u.id,
  ttr.address_line1,
  ttr.address_line2,
  ttr.city,
  ttr.state,
  ttr.zip_code,
  COALESCE(ttr.country, 'US'),
  COALESCE(ttr.created_at, NOW()),
  COALESCE(ttr.updated_at, NOW())
FROM users_new u
LEFT JOIN temp_therapist_registrations ttr ON u.auth_provider_id = ttr.firebase_uid
WHERE ttr.id IS NOT NULL
AND (ttr.address_line1 IS NOT NULL OR ttr.city IS NOT NULL);

-- Step 10: Migrate user onboarding status
INSERT INTO user_onboarding (
  user_id,
  onboarding_step,
  onboarding_status,
  onboarding_session_id,
  created_at,
  updated_at
)
SELECT 
  u.id,
  COALESCE(old_u.onboarding_step, 0),
  COALESCE(old_u.onboarding_status, 'pending'),
  old_u.onboarding_session_id,
  COALESCE(old_u.created_at, NOW()),
  COALESCE(old_u.updated_at, NOW())
FROM users_new u
JOIN users old_u ON u.id = old_u.id
WHERE old_u.onboarding_step IS NOT NULL OR old_u.onboarding_status IS NOT NULL;

-- Step 11: Migrate user marketing data
INSERT INTO user_marketing (
  user_id,
  marketing_consent,
  referral_source,
  signup_source,
  signup_platform,
  signup_device_info,
  created_at
)
SELECT 
  u.id,
  COALESCE(old_u.marketing_consent, false),
  old_u.referral_source,
  old_u.signup_source,
  old_u.signup_platform,
  old_u.signup_device_info,
  COALESCE(old_u.created_at, NOW())
FROM users_new u
JOIN users old_u ON u.id = old_u.id
WHERE old_u.marketing_consent IS NOT NULL 
   OR old_u.referral_source IS NOT NULL 
   OR old_u.signup_source IS NOT NULL;

-- Step 12: Migrate user organization relationships
INSERT INTO user_organization (
  user_id,
  organization_id,
  is_org_owner,
  primary_user_id,
  created_at,
  updated_at
)
SELECT 
  u.id,
  old_u.organization_id,
  COALESCE(old_u.is_org_owner, false),
  old_u.primary_user_id,
  COALESCE(old_u.created_at, NOW()),
  COALESCE(old_u.updated_at, NOW())
FROM users_new u
JOIN users old_u ON u.id = old_u.id
WHERE old_u.organization_id IS NOT NULL OR old_u.is_org_owner IS NOT NULL;

-- Step 13: Migrate user compliance data
INSERT INTO user_compliance (
  user_id,
  terms_accepted_at,
  terms_version,
  is_anonymized,
  anonymized_at,
  anonymization_reason,
  deleted_at,
  created_at,
  updated_at
)
SELECT 
  u.id,
  old_u.terms_accepted_at,
  old_u.terms_version,
  COALESCE(old_u.is_anonymized, false),
  old_u.anonymized_at,
  old_u.anonymization_reason,
  old_u.deleted_at,
  COALESCE(old_u.created_at, NOW()),
  COALESCE(old_u.updated_at, NOW())
FROM users_new u
JOIN users old_u ON u.id = old_u.id
WHERE old_u.terms_accepted_at IS NOT NULL 
   OR old_u.is_anonymized IS NOT NULL 
   OR old_u.deleted_at IS NOT NULL;

-- Step 14: Update foreign key references
-- Update appointments table
UPDATE appointments SET therapist_id = u_new.id 
FROM users_new u_new, users u_old 
WHERE appointments.therapist_id = u_old.id AND u_new.email = u_old.email;

UPDATE appointments SET client_id = u_new.id 
FROM users_new u_new, users u_old 
WHERE appointments.client_id = u_old.id AND u_new.email = u_old.email;

-- Update clients table
UPDATE clients SET user_id = u_new.id 
FROM users_new u_new, users u_old 
WHERE clients.user_id = u_old.id AND u_new.email = u_old.email;

UPDATE clients SET assigned_therapist_id = u_new.id 
FROM users_new u_new, users u_old 
WHERE clients.assigned_therapist_id = u_old.id AND u_new.email = u_old.email;

-- Update clinical_notes table
UPDATE clinical_notes SET therapist_id = u_new.id 
FROM users_new u_new, users u_old 
WHERE clinical_notes.therapist_id = u_old.id AND u_new.email = u_old.email;

UPDATE clinical_notes SET client_id = u_new.id 
FROM users_new u_new, users u_old 
WHERE clinical_notes.client_id = u_old.id AND u_new.email = u_old.email;

-- Update auth_provider_mapping table
UPDATE auth_provider_mapping SET user_id = u_new.id 
FROM users_new u_new, users u_old 
WHERE auth_provider_mapping.user_id = u_old.id AND u_new.email = u_old.email;

-- Step 15: Verification queries
SELECT 'Migration Summary:' as status;
SELECT COUNT(*) as total_users_migrated FROM users_new;
SELECT COUNT(*) as therapist_profiles_created FROM therapist_profiles;
SELECT COUNT(*) as therapist_credentials_created FROM therapist_credentials;
SELECT COUNT(*) as therapist_licenses_created FROM therapist_licenses;
SELECT COUNT(*) as therapist_availability_created FROM therapist_availability;
SELECT COUNT(*) as user_addresses_created FROM user_addresses;
SELECT COUNT(*) as user_onboarding_created FROM user_onboarding;

-- Verification: Check that all users have been migrated
SELECT 
  'Users missing from new table:' as check_type,
  COUNT(*) as count
FROM users old_u
LEFT JOIN users_new new_u ON old_u.id = new_u.id
WHERE new_u.id IS NULL;

-- Verification: Check therapist data completeness
SELECT 
  'Therapists without profiles:' as check_type,
  COUNT(*) as count
FROM users_new u
LEFT JOIN therapist_profiles tp ON u.id = tp.user_id
WHERE u.role = 'therapist' AND tp.user_id IS NULL;

COMMIT;
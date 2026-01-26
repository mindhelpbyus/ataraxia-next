-- Migration: Add Universal Auth Provider Fields
-- This migration adds provider-agnostic authentication fields to support
-- Firebase, Cognito, or any future auth provider seamlessly

BEGIN;

-- Add new auth provider fields to users table
ALTER TABLE users 
ADD COLUMN IF NOT EXISTS auth_provider_id VARCHAR(255),
ADD COLUMN IF NOT EXISTS auth_provider_type VARCHAR(50) DEFAULT 'firebase',
ADD COLUMN IF NOT EXISTS auth_provider_metadata JSONB DEFAULT '{}';

-- Create index for fast auth provider lookups
CREATE INDEX IF NOT EXISTS idx_users_auth_provider_id ON users(auth_provider_id);
CREATE INDEX IF NOT EXISTS idx_users_auth_provider_type ON users(auth_provider_type);

-- Migrate existing firebase_uid data to new auth_provider_id field
UPDATE users 
SET 
    auth_provider_id = firebase_uid,
    auth_provider_type = 'firebase',
    auth_provider_metadata = jsonb_build_object(
        'migrated_from', 'firebase_uid',
        'migration_date', NOW()
    )
WHERE firebase_uid IS NOT NULL AND auth_provider_id IS NULL;

-- Add the same fields to temp_therapist_registrations table
ALTER TABLE temp_therapist_registrations 
ADD COLUMN IF NOT EXISTS auth_provider_id VARCHAR(255),
ADD COLUMN IF NOT EXISTS auth_provider_type VARCHAR(50) DEFAULT 'firebase';

-- Create index for temp registrations
CREATE INDEX IF NOT EXISTS idx_temp_therapist_auth_provider_id ON temp_therapist_registrations(auth_provider_id);

-- Migrate existing firebase_uid data in temp registrations
UPDATE temp_therapist_registrations 
SET 
    auth_provider_id = firebase_uid,
    auth_provider_type = 'firebase'
WHERE firebase_uid IS NOT NULL AND auth_provider_id IS NULL;

-- Add constraints to ensure data integrity
ALTER TABLE users 
ADD CONSTRAINT chk_users_auth_provider_type 
CHECK (auth_provider_type IN ('firebase', 'cognito', 'auth0', 'okta', 'custom'));

ALTER TABLE temp_therapist_registrations 
ADD CONSTRAINT chk_temp_auth_provider_type 
CHECK (auth_provider_type IN ('firebase', 'cognito', 'auth0', 'okta', 'custom'));

-- Create unique constraint on auth_provider_id + auth_provider_type
-- This allows same ID from different providers (edge case)
CREATE UNIQUE INDEX IF NOT EXISTS idx_users_unique_auth_provider 
ON users(auth_provider_id, auth_provider_type) 
WHERE auth_provider_id IS NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS idx_temp_unique_auth_provider 
ON temp_therapist_registrations(auth_provider_id, auth_provider_type) 
WHERE auth_provider_id IS NOT NULL;

-- Add comments for documentation
COMMENT ON COLUMN users.auth_provider_id IS 'Universal auth provider user ID (Firebase UID, Cognito sub, etc.)';
COMMENT ON COLUMN users.auth_provider_type IS 'Type of auth provider: firebase, cognito, auth0, okta, custom';
COMMENT ON COLUMN users.auth_provider_metadata IS 'Additional metadata from auth provider (JSON)';

COMMENT ON COLUMN temp_therapist_registrations.auth_provider_id IS 'Universal auth provider user ID for temp registrations';
COMMENT ON COLUMN temp_therapist_registrations.auth_provider_type IS 'Type of auth provider for temp registrations';

COMMIT;
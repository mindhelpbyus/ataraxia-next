-- Migration: Auth Provider Mapping (Provider-Agnostic Architecture)
-- Purpose: Enable seamless switching between Firebase and Cognito
-- Database: ataraxia_db, Schema: ataraxia

-- ============================================================================
-- 1. CREATE AUTH_PROVIDER_MAPPING TABLE
-- ============================================================================

CREATE TABLE IF NOT EXISTS ataraxia.auth_provider_mapping (
    id SERIAL PRIMARY KEY,
    user_id INTEGER NOT NULL REFERENCES ataraxia.users(id) ON DELETE CASCADE,
    provider_type VARCHAR(50) NOT NULL CHECK (provider_type IN ('firebase', 'cognito')),
    provider_uid VARCHAR(255) NOT NULL,
    provider_email VARCHAR(255),
    is_primary BOOLEAN DEFAULT false,
    metadata JSONB DEFAULT '{}',
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    
    -- Ensure one unique mapping per provider per user
    UNIQUE(provider_type, provider_uid),
    UNIQUE(user_id, provider_type)
);

-- Indexes for fast lookups
CREATE INDEX IF NOT EXISTS idx_auth_provider_user 
    ON ataraxia.auth_provider_mapping(user_id);
    
CREATE INDEX IF NOT EXISTS idx_auth_provider_lookup 
    ON ataraxia.auth_provider_mapping(provider_type, provider_uid);
    
CREATE INDEX IF NOT EXISTS idx_auth_provider_email 
    ON ataraxia.auth_provider_mapping(provider_email);

COMMENT ON TABLE ataraxia.auth_provider_mapping IS 
    'Maps external auth provider UIDs to internal user IDs. Enables provider switching without data loss.';

-- ============================================================================
-- 2. UPDATE USERS TABLE
-- ============================================================================

-- Add auth provider tracking columns
ALTER TABLE ataraxia.users 
ADD COLUMN IF NOT EXISTS current_auth_provider VARCHAR(50) DEFAULT 'firebase',
ADD COLUMN IF NOT EXISTS email_verified BOOLEAN DEFAULT false,
ADD COLUMN IF NOT EXISTS phone_verified BOOLEAN DEFAULT false,
ADD COLUMN IF NOT EXISTS last_login TIMESTAMP,
ADD COLUMN IF NOT EXISTS login_count INTEGER DEFAULT 0;

-- Add check constraint (using DO block to handle if exists)
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint 
        WHERE conname = 'check_auth_provider' 
        AND conrelid = 'ataraxia.users'::regclass
    ) THEN
        ALTER TABLE ataraxia.users 
        ADD CONSTRAINT check_auth_provider 
            CHECK (current_auth_provider IN ('firebase', 'cognito', 'local'));
    END IF;
END $$;

COMMENT ON COLUMN ataraxia.users.current_auth_provider IS 
    'Current active auth provider for this user';

-- ============================================================================
-- 3. MIGRATE EXISTING USERS TO MAPPING TABLE
-- ============================================================================

-- Migrate existing Firebase users (if firebase_uid exists)
INSERT INTO ataraxia.auth_provider_mapping (user_id, provider_type, provider_uid, provider_email, is_primary)
SELECT 
    id,
    'firebase' as provider_type,
    firebase_uid as provider_uid,
    email as provider_email,
    true as is_primary
FROM ataraxia.users
WHERE firebase_uid IS NOT NULL
ON CONFLICT (provider_type, provider_uid) DO NOTHING;

-- Migrate existing Cognito users (if cognito_sub column exists)
DO $$
BEGIN
    IF EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_schema = 'ataraxia' 
        AND table_name = 'users' 
        AND column_name = 'cognito_sub'
    ) THEN
        INSERT INTO ataraxia.auth_provider_mapping (user_id, provider_type, provider_uid, provider_email, is_primary)
        SELECT 
            id,
            'cognito' as provider_type,
            cognito_sub as provider_uid,
            email as provider_email,
            CASE WHEN firebase_uid IS NULL THEN true ELSE false END as is_primary
        FROM ataraxia.users
        WHERE cognito_sub IS NOT NULL
        ON CONFLICT (provider_type, provider_uid) DO NOTHING;
    END IF;
END $$;

-- ============================================================================
-- 4. CREATE HELPER FUNCTIONS
-- ============================================================================

-- Function: Get user by provider UID
CREATE OR REPLACE FUNCTION ataraxia.get_user_by_provider(
    p_provider_type VARCHAR(50),
    p_provider_uid VARCHAR(255)
)
RETURNS TABLE (
    user_id INTEGER,
    email VARCHAR(255),
    first_name VARCHAR(100),
    last_name VARCHAR(100),
    role VARCHAR(50),
    current_provider VARCHAR(50),
    email_verified BOOLEAN,
    phone_verified BOOLEAN,
    account_status VARCHAR(50)
) AS $$
BEGIN
    RETURN QUERY
    SELECT 
        u.id,
        u.email,
        u.first_name,
        u.last_name,
        u.role,
        u.current_auth_provider,
        u.email_verified,
        u.phone_verified,
        u.account_status
    FROM ataraxia.users u
    INNER JOIN ataraxia.auth_provider_mapping apm ON u.id = apm.user_id
    WHERE apm.provider_type = p_provider_type
      AND apm.provider_uid = p_provider_uid;
END;
$$ LANGUAGE plpgsql;

-- Function: Add provider mapping for existing user
CREATE OR REPLACE FUNCTION ataraxia.add_provider_mapping(
    p_user_id INTEGER,
    p_provider_type VARCHAR(50),
    p_provider_uid VARCHAR(255),
    p_provider_email VARCHAR(255),
    p_is_primary BOOLEAN DEFAULT false
)
RETURNS INTEGER AS $$
DECLARE
    v_mapping_id INTEGER;
BEGIN
    -- Insert new mapping
    INSERT INTO ataraxia.auth_provider_mapping (
        user_id, provider_type, provider_uid, provider_email, is_primary
    ) VALUES (
        p_user_id, p_provider_type, p_provider_uid, p_provider_email, p_is_primary
    )
    ON CONFLICT (user_id, provider_type) 
    DO UPDATE SET 
        provider_uid = EXCLUDED.provider_uid,
        provider_email = EXCLUDED.provider_email,
        is_primary = EXCLUDED.is_primary,
        updated_at = CURRENT_TIMESTAMP
    RETURNING id INTO v_mapping_id;
    
    -- Update user's current provider if this is primary
    IF p_is_primary THEN
        UPDATE ataraxia.users 
        SET current_auth_provider = p_provider_type,
            updated_at = CURRENT_TIMESTAMP
        WHERE id = p_user_id;
    END IF;
    
    RETURN v_mapping_id;
END;
$$ LANGUAGE plpgsql;

-- Function: Switch user's primary provider
CREATE OR REPLACE FUNCTION ataraxia.switch_primary_provider(
    p_user_id INTEGER,
    p_new_provider_type VARCHAR(50)
)
RETURNS BOOLEAN AS $$
BEGIN
    -- Unset all primary flags for this user
    UPDATE ataraxia.auth_provider_mapping
    SET is_primary = false
    WHERE user_id = p_user_id;
    
    -- Set new primary
    UPDATE ataraxia.auth_provider_mapping
    SET is_primary = true,
        updated_at = CURRENT_TIMESTAMP
    WHERE user_id = p_user_id
      AND provider_type = p_new_provider_type;
    
    -- Update user's current provider
    UPDATE ataraxia.users
    SET current_auth_provider = p_new_provider_type,
        updated_at = CURRENT_TIMESTAMP
    WHERE id = p_user_id;
    
    RETURN true;
END;
$$ LANGUAGE plpgsql;

-- Function: Get all provider mappings for a user
CREATE OR REPLACE FUNCTION ataraxia.get_user_providers(p_user_id INTEGER)
RETURNS TABLE (
    provider_type VARCHAR(50),
    provider_uid VARCHAR(255),
    provider_email VARCHAR(255),
    is_primary BOOLEAN,
    created_at TIMESTAMP
) AS $$
BEGIN
    RETURN QUERY
    SELECT 
        apm.provider_type,
        apm.provider_uid,
        apm.provider_email,
        apm.is_primary,
        apm.created_at
    FROM ataraxia.auth_provider_mapping apm
    WHERE apm.user_id = p_user_id
    ORDER BY apm.is_primary DESC, apm.created_at ASC;
END;
$$ LANGUAGE plpgsql;

-- ============================================================================
-- 5. CREATE AUDIT TRIGGER
-- ============================================================================

-- Update timestamp trigger
CREATE OR REPLACE FUNCTION ataraxia.update_auth_provider_mapping_timestamp()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = CURRENT_TIMESTAMP;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trigger_update_auth_provider_mapping_timestamp
    BEFORE UPDATE ON ataraxia.auth_provider_mapping
    FOR EACH ROW
    EXECUTE FUNCTION ataraxia.update_auth_provider_mapping_timestamp();

-- ============================================================================
-- 6. GRANT PERMISSIONS (if role exists)
-- ============================================================================

DO $$
BEGIN
    IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'ataraxia_user') THEN
        GRANT SELECT, INSERT, UPDATE ON ataraxia.auth_provider_mapping TO ataraxia_user;
        GRANT USAGE, SELECT ON SEQUENCE ataraxia.auth_provider_mapping_id_seq TO ataraxia_user;
        RAISE NOTICE '✅ Permissions granted to ataraxia_user';
    ELSE
        RAISE NOTICE '⚠️  Role ataraxia_user does not exist, skipping permissions';
    END IF;
END $$;

-- ============================================================================
-- 7. VERIFICATION QUERIES
-- ============================================================================

-- Verify migration
DO $$
DECLARE
    v_mapping_count INTEGER;
    v_user_count INTEGER;
BEGIN
    SELECT COUNT(*) INTO v_mapping_count FROM ataraxia.auth_provider_mapping;
    SELECT COUNT(*) INTO v_user_count FROM ataraxia.users WHERE firebase_uid IS NOT NULL;
    
    RAISE NOTICE 'Migration Summary:';
    RAISE NOTICE '  - Users with Firebase UIDs: %', v_user_count;
    RAISE NOTICE '  - Provider mappings created: %', v_mapping_count;
    
    IF v_mapping_count > 0 THEN
        RAISE NOTICE '✅ Migration successful!';
    ELSE
        RAISE NOTICE '⚠️  No mappings created (this is OK if no users exist yet)';
    END IF;
END $$;

-- Show sample mappings
SELECT 
    u.id,
    u.email,
    u.role,
    apm.provider_type,
    apm.is_primary,
    apm.created_at
FROM ataraxia.users u
LEFT JOIN ataraxia.auth_provider_mapping apm ON u.id = apm.user_id
LIMIT 5;

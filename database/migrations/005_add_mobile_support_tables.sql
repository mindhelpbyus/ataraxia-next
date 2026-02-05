-- Migration: Add Mobile App Support Tables
-- Description: Creates tables for mobile app features including profile completion tokens
-- Date: 2026-02-01

-- Profile Completion Tokens Table (for mobile app secure profile completion)
CREATE TABLE IF NOT EXISTS profile_completion_tokens (
    id BIGSERIAL PRIMARY KEY,
    token VARCHAR(64) UNIQUE NOT NULL,
    user_id BIGINT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    expires_at TIMESTAMPTZ NOT NULL,
    completed BOOLEAN DEFAULT FALSE,
    used_at TIMESTAMPTZ NULL,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    
    -- Constraints
    CHECK (expires_at > created_at),
    CHECK (used_at IS NULL OR used_at >= created_at)
);

-- Indexes for profile completion tokens
CREATE INDEX IF NOT EXISTS idx_profile_completion_tokens_token ON profile_completion_tokens(token);
CREATE INDEX IF NOT EXISTS idx_profile_completion_tokens_user_id ON profile_completion_tokens(user_id);
CREATE INDEX IF NOT EXISTS idx_profile_completion_tokens_expires ON profile_completion_tokens(expires_at);
CREATE INDEX IF NOT EXISTS idx_profile_completion_tokens_completed ON profile_completion_tokens(completed);

-- Update phone_verification_codes table to support mobile app requirements
-- Add attempts column if it doesn't exist
DO $ 
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_name = 'phone_verification_codes' AND column_name = 'attempts'
    ) THEN
        ALTER TABLE phone_verification_codes ADD COLUMN attempts INTEGER DEFAULT 0;
    END IF;
END $;

-- Add index for attempts
CREATE INDEX IF NOT EXISTS idx_phone_verification_attempts ON phone_verification_codes(attempts);

-- Update users table to support mobile signup tracking
-- Add signup_source and signup_platform if they don't exist
DO $ 
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_name = 'users' AND column_name = 'signup_source'
    ) THEN
        ALTER TABLE users ADD COLUMN signup_source VARCHAR(50) NULL;
        ALTER TABLE users ADD COLUMN signup_platform VARCHAR(50) NULL;
    END IF;
END $;

-- Add indexes for signup tracking
CREATE INDEX IF NOT EXISTS idx_users_signup_source ON users(signup_source);
CREATE INDEX IF NOT EXISTS idx_users_signup_platform ON users(signup_platform);

-- Update existing users to have default signup source (web_app for existing users)
UPDATE users 
SET signup_source = 'web_app', signup_platform = 'web'
WHERE signup_source IS NULL;

-- Function to clean up expired profile completion tokens
CREATE OR REPLACE FUNCTION cleanup_expired_profile_tokens()
RETURNS INTEGER AS $
DECLARE
    deleted_count INTEGER := 0;
BEGIN
    -- Clean up expired profile completion tokens (older than 7 days)
    DELETE FROM profile_completion_tokens 
    WHERE expires_at < NOW() OR (completed = TRUE AND used_at < NOW() - INTERVAL '7 days');
    
    GET DIAGNOSTICS deleted_count = ROW_COUNT;
    
    RETURN deleted_count;
END;
$ LANGUAGE plpgsql;

-- Grant permissions to app_user
GRANT SELECT, INSERT, UPDATE, DELETE ON profile_completion_tokens TO app_user;
GRANT USAGE, SELECT ON SEQUENCE profile_completion_tokens_id_seq TO app_user;
GRANT EXECUTE ON FUNCTION cleanup_expired_profile_tokens() TO app_user;

-- Update the cleanup function to include profile tokens
CREATE OR REPLACE FUNCTION cleanup_expired_auth_tokens()
RETURNS INTEGER AS $
DECLARE
    deleted_count INTEGER := 0;
    profile_deleted INTEGER := 0;
BEGIN
    -- Clean up expired phone verification codes
    DELETE FROM phone_verification_codes 
    WHERE expires_at < NOW() - INTERVAL '1 day';
    
    GET DIAGNOSTICS deleted_count = ROW_COUNT;
    
    -- Clean up expired profile completion tokens
    SELECT cleanup_expired_profile_tokens() INTO profile_deleted;
    
    -- Clean up expired session tokens
    DELETE FROM session_tokens 
    WHERE expires_at < NOW();
    
    -- Clean up old audit logs (keep 1 year)
    DELETE FROM auth_audit_log 
    WHERE created_at < NOW() - INTERVAL '1 year';
    
    -- Clean up old login history (keep 2 years)
    DELETE FROM user_login_history 
    WHERE login_at < NOW() - INTERVAL '2 years';
    
    RETURN deleted_count + profile_deleted;
END;
$ LANGUAGE plpgsql;

-- Create a view for mobile app user status
CREATE OR REPLACE VIEW mobile_user_status AS
SELECT 
    u.id,
    u.email,
    u.first_name,
    u.last_name,
    u.phone_number,
    u.role,
    u.account_status,
    u.is_verified,
    u.email_verified,
    u.phone_verified,
    u.signup_source,
    u.signup_platform,
    u.current_auth_provider,
    CASE 
        WHEN pct.token IS NOT NULL AND pct.completed = FALSE THEN 'profile_completion_pending'
        WHEN u.email_verified AND u.phone_verified THEN 'fully_verified'
        WHEN u.email_verified THEN 'email_verified'
        WHEN u.phone_verified THEN 'phone_verified'
        ELSE 'unverified'
    END as verification_status,
    pct.token as profile_completion_token,
    pct.expires_at as profile_completion_expires,
    u.created_at,
    u.last_login_at
FROM users u
LEFT JOIN profile_completion_tokens pct ON u.id = pct.user_id AND pct.completed = FALSE AND pct.expires_at > NOW()
WHERE u.signup_platform IN ('mobile', 'web') OR u.signup_platform IS NULL;

-- Grant access to the view
GRANT SELECT ON mobile_user_status TO app_user;

-- Insert mobile-specific system configs
INSERT INTO system_configs (config_key, config_value, description) VALUES
('mobile_profile_completion_enabled', 'true', 'Enable mobile profile completion via secure tokens')
ON CONFLICT (config_key) DO NOTHING;

INSERT INTO system_configs (config_key, config_value, description) VALUES
('mobile_phone_verification_required', 'false', 'Require phone verification for mobile users')
ON CONFLICT (config_key) DO NOTHING;

INSERT INTO system_configs (config_key, config_value, description) VALUES
('profile_completion_token_expiry_days', '7', 'Profile completion token expiry in days')
ON CONFLICT (config_key) DO NOTHING;

-- Add comments for documentation
COMMENT ON TABLE profile_completion_tokens IS 'Secure tokens for mobile app profile completion flow';
COMMENT ON VIEW mobile_user_status IS 'Mobile app specific user status and verification information';
COMMENT ON FUNCTION cleanup_expired_profile_tokens() IS 'Cleans up expired profile completion tokens';

-- Success message
DO $
BEGIN
    RAISE NOTICE 'Migration 005: Mobile app support tables created successfully';
    RAISE NOTICE 'Added tables: profile_completion_tokens';
    RAISE NOTICE 'Updated tables: phone_verification_codes (attempts), users (signup_source, signup_platform)';
    RAISE NOTICE 'Added view: mobile_user_status';
    RAISE NOTICE 'Added function: cleanup_expired_profile_tokens';
    RAISE NOTICE 'Updated function: cleanup_expired_auth_tokens';
END $;
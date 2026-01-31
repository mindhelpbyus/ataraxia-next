-- Migration: Add Authentication Support Tables
-- Description: Creates tables for phone verification, onboarding sessions, and auth audit logging
-- Date: 2026-01-31

-- Phone Verification Codes Table
CREATE TABLE IF NOT EXISTS phone_verification_codes (
    id BIGSERIAL PRIMARY KEY,
    user_id BIGINT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    phone_number VARCHAR(20) NOT NULL,
    code VARCHAR(10) NOT NULL,
    expires_at TIMESTAMPTZ NOT NULL,
    verified_at TIMESTAMPTZ NULL,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    
    -- Constraints
    UNIQUE(user_id, phone_number)
);

-- Indexes for phone verification
CREATE INDEX IF NOT EXISTS idx_phone_verification_user_id ON phone_verification_codes(user_id);
CREATE INDEX IF NOT EXISTS idx_phone_verification_phone ON phone_verification_codes(phone_number);
CREATE INDEX IF NOT EXISTS idx_phone_verification_expires ON phone_verification_codes(expires_at);

-- Onboarding Sessions Table
CREATE TABLE IF NOT EXISTS onboarding_sessions (
    id BIGSERIAL PRIMARY KEY,
    session_id VARCHAR(100) UNIQUE NOT NULL,
    user_id BIGINT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    current_step INTEGER DEFAULT 1,
    total_steps INTEGER DEFAULT 10,
    step_data JSONB DEFAULT '{}',
    verification_status JSONB DEFAULT '{"email": {"isVerified": false}, "phone": {"isVerified": false}}',
    is_completed BOOLEAN DEFAULT FALSE,
    completed_at TIMESTAMPTZ NULL,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW(),
    
    -- Constraints
    UNIQUE(user_id),
    CHECK (current_step >= 1 AND current_step <= total_steps),
    CHECK (total_steps > 0)
);

-- Indexes for onboarding sessions
CREATE INDEX IF NOT EXISTS idx_onboarding_sessions_user_id ON onboarding_sessions(user_id);
CREATE INDEX IF NOT EXISTS idx_onboarding_sessions_session_id ON onboarding_sessions(session_id);
CREATE INDEX IF NOT EXISTS idx_onboarding_sessions_status ON onboarding_sessions(is_completed);
CREATE INDEX IF NOT EXISTS idx_onboarding_sessions_updated ON onboarding_sessions(updated_at);

-- Auth Audit Log Table
CREATE TABLE IF NOT EXISTS auth_audit_log (
    id BIGSERIAL PRIMARY KEY,
    user_id BIGINT NULL REFERENCES users(id) ON DELETE SET NULL,
    action VARCHAR(100) NOT NULL,
    metadata JSONB DEFAULT '{}',
    ip_address INET NULL,
    user_agent TEXT NULL,
    success BOOLEAN DEFAULT TRUE,
    error_message TEXT NULL,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Indexes for auth audit log
CREATE INDEX IF NOT EXISTS idx_auth_audit_user_id ON auth_audit_log(user_id);
CREATE INDEX IF NOT EXISTS idx_auth_audit_action ON auth_audit_log(action);
CREATE INDEX IF NOT EXISTS idx_auth_audit_created_at ON auth_audit_log(created_at);
CREATE INDEX IF NOT EXISTS idx_auth_audit_success ON auth_audit_log(success);

-- Session Tokens Table (for additional session management)
CREATE TABLE IF NOT EXISTS session_tokens (
    id BIGSERIAL PRIMARY KEY,
    user_id BIGINT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    token_hash VARCHAR(255) UNIQUE NOT NULL,
    session_data JSONB DEFAULT '{}',
    expires_at TIMESTAMPTZ NOT NULL,
    last_accessed_at TIMESTAMPTZ DEFAULT NOW(),
    created_at TIMESTAMPTZ DEFAULT NOW(),
    
    -- Constraints
    CHECK (expires_at > created_at)
);

-- Indexes for session tokens
CREATE INDEX IF NOT EXISTS idx_session_tokens_user_id ON session_tokens(user_id);
CREATE INDEX IF NOT EXISTS idx_session_tokens_hash ON session_tokens(token_hash);
CREATE INDEX IF NOT EXISTS idx_session_tokens_expires ON session_tokens(expires_at);
CREATE INDEX IF NOT EXISTS idx_session_tokens_accessed ON session_tokens(last_accessed_at);

-- User Login History Table
CREATE TABLE IF NOT EXISTS user_login_history (
    id BIGSERIAL PRIMARY KEY,
    user_id BIGINT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    login_at TIMESTAMPTZ DEFAULT NOW(),
    logout_at TIMESTAMPTZ NULL,
    ip_address INET NULL,
    user_agent TEXT NULL,
    device_info JSONB DEFAULT '{}',
    auth_provider VARCHAR(50) DEFAULT 'cognito',
    login_method VARCHAR(50) DEFAULT 'email_password',
    success BOOLEAN DEFAULT TRUE,
    failure_reason TEXT NULL,
    session_duration_minutes INTEGER NULL,
    
    -- Computed session duration on logout
    CHECK (logout_at IS NULL OR logout_at >= login_at)
);

-- Indexes for login history
CREATE INDEX IF NOT EXISTS idx_login_history_user_id ON user_login_history(user_id);
CREATE INDEX IF NOT EXISTS idx_login_history_login_at ON user_login_history(login_at);
CREATE INDEX IF NOT EXISTS idx_login_history_success ON user_login_history(success);
CREATE INDEX IF NOT EXISTS idx_login_history_provider ON user_login_history(auth_provider);

-- Add phone_verified column to users table if it doesn't exist
DO $$ 
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_name = 'users' AND column_name = 'phone_verified'
    ) THEN
        ALTER TABLE users ADD COLUMN phone_verified BOOLEAN DEFAULT FALSE;
        ALTER TABLE users ADD COLUMN phone_verified_at TIMESTAMPTZ NULL;
    END IF;
END $$;

-- Add indexes for new user columns
CREATE INDEX IF NOT EXISTS idx_users_phone_verified ON users(phone_verified);
CREATE INDEX IF NOT EXISTS idx_users_onboarding_session ON users(onboarding_session_id);

-- Update existing users to have proper auth provider metadata
UPDATE users 
SET auth_provider_metadata = COALESCE(auth_provider_metadata, '{}')
WHERE auth_provider_metadata IS NULL;

-- Function to automatically update onboarding session timestamp
CREATE OR REPLACE FUNCTION update_onboarding_session_timestamp()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Trigger for onboarding sessions
DROP TRIGGER IF EXISTS trigger_update_onboarding_session_timestamp ON onboarding_sessions;
CREATE TRIGGER trigger_update_onboarding_session_timestamp
    BEFORE UPDATE ON onboarding_sessions
    FOR EACH ROW
    EXECUTE FUNCTION update_onboarding_session_timestamp();

-- Function to clean up expired tokens (run periodically)
CREATE OR REPLACE FUNCTION cleanup_expired_auth_tokens()
RETURNS INTEGER AS $$
DECLARE
    deleted_count INTEGER := 0;
BEGIN
    -- Clean up expired phone verification codes
    DELETE FROM phone_verification_codes 
    WHERE expires_at < NOW() - INTERVAL '1 day';
    
    GET DIAGNOSTICS deleted_count = ROW_COUNT;
    
    -- Clean up expired session tokens
    DELETE FROM session_tokens 
    WHERE expires_at < NOW();
    
    -- Clean up old audit logs (keep 1 year)
    DELETE FROM auth_audit_log 
    WHERE created_at < NOW() - INTERVAL '1 year';
    
    -- Clean up old login history (keep 2 years)
    DELETE FROM user_login_history 
    WHERE login_at < NOW() - INTERVAL '2 years';
    
    RETURN deleted_count;
END;
$$ LANGUAGE plpgsql;

-- Grant permissions to app_user
GRANT SELECT, INSERT, UPDATE, DELETE ON phone_verification_codes TO app_user;
GRANT SELECT, INSERT, UPDATE, DELETE ON onboarding_sessions TO app_user;
GRANT SELECT, INSERT, UPDATE, DELETE ON auth_audit_log TO app_user;
GRANT SELECT, INSERT, UPDATE, DELETE ON session_tokens TO app_user;
GRANT SELECT, INSERT, UPDATE, DELETE ON user_login_history TO app_user;

GRANT USAGE, SELECT ON SEQUENCE phone_verification_codes_id_seq TO app_user;
GRANT USAGE, SELECT ON SEQUENCE onboarding_sessions_id_seq TO app_user;
GRANT USAGE, SELECT ON SEQUENCE auth_audit_log_id_seq TO app_user;
GRANT USAGE, SELECT ON SEQUENCE session_tokens_id_seq TO app_user;
GRANT USAGE, SELECT ON SEQUENCE user_login_history_id_seq TO app_user;

-- Grant execute permission on functions
GRANT EXECUTE ON FUNCTION cleanup_expired_auth_tokens() TO app_user;
GRANT EXECUTE ON FUNCTION update_onboarding_session_timestamp() TO app_user;

-- Create a view for user authentication status
CREATE OR REPLACE VIEW user_auth_status AS
SELECT 
    u.id,
    u.email,
    u.first_name,
    u.last_name,
    u.role,
    u.account_status,
    u.is_verified,
    u.email_verified,
    u.phone_verified,
    u.auth_provider_type,
    u.onboarding_status,
    u.onboarding_step,
    os.session_id as onboarding_session_id,
    os.current_step as onboarding_current_step,
    os.is_completed as onboarding_completed,
    CASE 
        WHEN u.email_verified AND u.phone_verified THEN 'fully_verified'
        WHEN u.email_verified THEN 'email_verified'
        WHEN u.phone_verified THEN 'phone_verified'
        ELSE 'unverified'
    END as verification_status,
    u.last_login_at,
    u.created_at
FROM users u
LEFT JOIN onboarding_sessions os ON u.id = os.user_id;

-- Grant access to the view
GRANT SELECT ON user_auth_status TO app_user;

-- Insert initial system config for auth settings
INSERT INTO system_configs (config_key, config_value, description) VALUES
('auth_provider_default', 'cognito', 'Default authentication provider')
ON CONFLICT (config_key) DO NOTHING;

INSERT INTO system_configs (config_key, config_value, description) VALUES
('phone_verification_enabled', 'true', 'Enable phone number verification')
ON CONFLICT (config_key) DO NOTHING;

INSERT INTO system_configs (config_key, config_value, description) VALUES
('email_verification_required', 'true', 'Require email verification for all users')
ON CONFLICT (config_key) DO NOTHING;

INSERT INTO system_configs (config_key, config_value, description) VALUES
('onboarding_steps_total', '10', 'Total number of onboarding steps')
ON CONFLICT (config_key) DO NOTHING;

-- Add comments for documentation
COMMENT ON TABLE phone_verification_codes IS 'Stores phone verification codes for SMS-based verification';
COMMENT ON TABLE onboarding_sessions IS 'Tracks user onboarding progress and session data';
COMMENT ON TABLE auth_audit_log IS 'Audit log for all authentication-related events';
COMMENT ON TABLE session_tokens IS 'Additional session management tokens';
COMMENT ON TABLE user_login_history IS 'Complete history of user login/logout events';
COMMENT ON VIEW user_auth_status IS 'Consolidated view of user authentication and verification status';

-- Success message
DO $$
BEGIN
    RAISE NOTICE 'Migration 004: Authentication support tables created successfully';
    RAISE NOTICE 'Added tables: phone_verification_codes, onboarding_sessions, auth_audit_log, session_tokens, user_login_history';
    RAISE NOTICE 'Added view: user_auth_status';
    RAISE NOTICE 'Added functions: cleanup_expired_auth_tokens, update_onboarding_session_timestamp';
END $$;
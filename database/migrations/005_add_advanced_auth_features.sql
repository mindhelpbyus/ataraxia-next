-- Migration: Add Advanced Authentication Features
-- Description: Creates tables for MFA, Security, Session Management, and Compliance
-- Date: 2026-01-31

-- Set search path to ataraxia schema
SET search_path TO ataraxia;

-- ============================================================================
-- MFA (Multi-Factor Authentication) Tables
-- ============================================================================

-- User MFA Settings
CREATE TABLE IF NOT EXISTS user_mfa_settings (
    id BIGSERIAL PRIMARY KEY,
    user_id BIGINT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    totp_secret TEXT NULL, -- Encrypted TOTP secret
    sms_phone_number VARCHAR(20) NULL,
    backup_codes TEXT[] DEFAULT '{}', -- Array of hashed backup codes
    is_totp_enabled BOOLEAN DEFAULT FALSE,
    is_sms_enabled BOOLEAN DEFAULT FALSE,
    failed_attempts INTEGER DEFAULT 0,
    last_used_at TIMESTAMPTZ NULL,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW(),
    
    -- Constraints
    UNIQUE(user_id),
    CHECK (failed_attempts >= 0)
);

-- MFA SMS Codes
CREATE TABLE IF NOT EXISTS mfa_sms_codes (
    id BIGSERIAL PRIMARY KEY,
    user_id BIGINT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    phone_number VARCHAR(20) NOT NULL,
    code VARCHAR(255) NOT NULL, -- Hashed code
    expires_at TIMESTAMPTZ NOT NULL,
    verified_at TIMESTAMPTZ NULL,
    purpose VARCHAR(20) NOT NULL CHECK (purpose IN ('setup', 'login')),
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- MFA Audit Log
CREATE TABLE IF NOT EXISTS mfa_audit_log (
    id BIGSERIAL PRIMARY KEY,
    user_id BIGINT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    action VARCHAR(100) NOT NULL,
    metadata JSONB DEFAULT '{}',
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- ============================================================================
-- Security Tables
-- ============================================================================

-- Security Events (Rate limiting, failed attempts, etc.)
CREATE TABLE IF NOT EXISTS security_events (
    id BIGSERIAL PRIMARY KEY,
    identifier VARCHAR(255) NOT NULL, -- User ID, IP, email, etc.
    action VARCHAR(100) NOT NULL,
    ip_address INET NULL,
    user_agent TEXT NULL,
    metadata JSONB DEFAULT '{}',
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- User Devices (Device fingerprinting)
CREATE TABLE IF NOT EXISTS user_devices (
    id BIGSERIAL PRIMARY KEY,
    user_id BIGINT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    device_hash VARCHAR(255) NOT NULL,
    device_id VARCHAR(50) NOT NULL,
    user_agent TEXT NOT NULL,
    ip_address INET NOT NULL,
    device_info JSONB DEFAULT '{}',
    is_trusted BOOLEAN DEFAULT FALSE,
    trusted_at TIMESTAMPTZ NULL,
    first_seen_at TIMESTAMPTZ DEFAULT NOW(),
    last_seen_at TIMESTAMPTZ DEFAULT NOW(),
    created_at TIMESTAMPTZ DEFAULT NOW(),
    
    -- Constraints
    UNIQUE(user_id, device_hash)
);

-- ============================================================================
-- Session Management Tables
-- ============================================================================

-- User Sessions
CREATE TABLE IF NOT EXISTS user_sessions (
    id BIGSERIAL PRIMARY KEY,
    session_id VARCHAR(255) UNIQUE NOT NULL,
    user_id BIGINT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    device_info JSONB DEFAULT '{}',
    ip_address INET NOT NULL,
    user_agent TEXT NOT NULL,
    expires_at TIMESTAMPTZ NOT NULL,
    is_active BOOLEAN DEFAULT TRUE,
    remember_me BOOLEAN DEFAULT FALSE,
    ended_at TIMESTAMPTZ NULL,
    end_reason VARCHAR(50) NULL,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    last_accessed_at TIMESTAMPTZ DEFAULT NOW(),
    
    -- Constraints
    CHECK (expires_at > created_at),
    CHECK (ended_at IS NULL OR ended_at >= created_at)
);

-- Session Audit Log
CREATE TABLE IF NOT EXISTS session_audit_log (
    id BIGSERIAL PRIMARY KEY,
    user_id BIGINT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    action VARCHAR(100) NOT NULL,
    metadata JSONB DEFAULT '{}',
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- ============================================================================
-- Compliance Tables
-- ============================================================================

-- Compliance Audit Log (Enhanced audit trails)
CREATE TABLE IF NOT EXISTS compliance_audit_log (
    id BIGSERIAL PRIMARY KEY,
    audit_id VARCHAR(255) UNIQUE NOT NULL,
    user_id BIGINT NOT NULL REFERENCES users(id) ON DELETE SET NULL,
    action VARCHAR(100) NOT NULL,
    resource_type VARCHAR(100) NOT NULL,
    resource_id VARCHAR(255) NULL,
    old_values JSONB DEFAULT '{}',
    new_values JSONB DEFAULT '{}',
    ip_address INET NULL,
    user_agent TEXT NULL,
    compliance_level VARCHAR(20) NOT NULL CHECK (compliance_level IN ('low', 'medium', 'high', 'critical')),
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Privacy Consents
CREATE TABLE IF NOT EXISTS privacy_consents (
    id BIGSERIAL PRIMARY KEY,
    user_id BIGINT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    consent_type VARCHAR(100) NOT NULL,
    granted BOOLEAN NOT NULL,
    version VARCHAR(20) NOT NULL,
    granted_at TIMESTAMPTZ NULL,
    revoked_at TIMESTAMPTZ NULL,
    ip_address INET NULL,
    consent_details JSONB DEFAULT '{}',
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW(),
    
    -- Constraints
    UNIQUE(user_id, consent_type),
    CHECK ((granted = TRUE AND granted_at IS NOT NULL) OR (granted = FALSE AND revoked_at IS NOT NULL))
);

-- Breach Alerts
CREATE TABLE IF NOT EXISTS breach_alerts (
    id BIGSERIAL PRIMARY KEY,
    alert_id VARCHAR(255) UNIQUE NOT NULL,
    severity VARCHAR(20) NOT NULL CHECK (severity IN ('low', 'medium', 'high', 'critical')),
    alert_type VARCHAR(100) NOT NULL,
    description TEXT NOT NULL,
    affected_users INTEGER DEFAULT 0,
    detected_at TIMESTAMPTZ DEFAULT NOW(),
    resolved BOOLEAN DEFAULT FALSE,
    resolved_at TIMESTAMPTZ NULL,
    metadata JSONB DEFAULT '{}',
    
    -- Constraints
    CHECK (affected_users >= 0),
    CHECK (resolved_at IS NULL OR resolved_at >= detected_at)
);

-- Data Requests (Export, deletion, etc.)
CREATE TABLE IF NOT EXISTS data_requests (
    id BIGSERIAL PRIMARY KEY,
    request_id VARCHAR(255) UNIQUE NOT NULL,
    user_id BIGINT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    requested_by BIGINT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    request_type VARCHAR(50) NOT NULL CHECK (request_type IN ('export', 'delete', 'anonymize')),
    reason TEXT NOT NULL,
    status VARCHAR(50) DEFAULT 'pending' CHECK (status IN ('pending', 'processing', 'completed', 'failed')),
    completed_at TIMESTAMPTZ NULL,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    
    -- Constraints
    CHECK (completed_at IS NULL OR completed_at >= created_at)
);

-- ============================================================================
-- Add new columns to existing users table
-- ============================================================================

-- Add security and compliance columns to users table
DO $$ 
BEGIN
    -- MFA enabled flag
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_name = 'users' AND column_name = 'mfa_enabled'
    ) THEN
        ALTER TABLE users ADD COLUMN mfa_enabled BOOLEAN DEFAULT FALSE;
    END IF;
    
    -- Account lockout fields
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_name = 'users' AND column_name = 'failed_login_attempts'
    ) THEN
        ALTER TABLE users ADD COLUMN failed_login_attempts INTEGER DEFAULT 0;
        ALTER TABLE users ADD COLUMN last_failed_login TIMESTAMPTZ NULL;
        ALTER TABLE users ADD COLUMN account_locked_until TIMESTAMPTZ NULL;
    END IF;
    
    -- Data anonymization fields
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_name = 'users' AND column_name = 'is_anonymized'
    ) THEN
        ALTER TABLE users ADD COLUMN is_anonymized BOOLEAN DEFAULT FALSE;
        ALTER TABLE users ADD COLUMN anonymized_at TIMESTAMPTZ NULL;
        ALTER TABLE users ADD COLUMN anonymization_reason TEXT NULL;
    END IF;
END $$;

-- ============================================================================
-- Indexes for Performance
-- ============================================================================

-- MFA Indexes
CREATE INDEX IF NOT EXISTS idx_user_mfa_settings_user_id ON user_mfa_settings(user_id);
CREATE INDEX IF NOT EXISTS idx_mfa_sms_codes_user_id ON mfa_sms_codes(user_id);
CREATE INDEX IF NOT EXISTS idx_mfa_sms_codes_expires ON mfa_sms_codes(expires_at);
CREATE INDEX IF NOT EXISTS idx_mfa_audit_log_user_id ON mfa_audit_log(user_id);
CREATE INDEX IF NOT EXISTS idx_mfa_audit_log_created_at ON mfa_audit_log(created_at);

-- Security Indexes
CREATE INDEX IF NOT EXISTS idx_security_events_identifier ON security_events(identifier);
CREATE INDEX IF NOT EXISTS idx_security_events_action ON security_events(action);
CREATE INDEX IF NOT EXISTS idx_security_events_created_at ON security_events(created_at);
CREATE INDEX IF NOT EXISTS idx_security_events_ip_address ON security_events(ip_address);
CREATE INDEX IF NOT EXISTS idx_user_devices_user_id ON user_devices(user_id);
CREATE INDEX IF NOT EXISTS idx_user_devices_device_hash ON user_devices(device_hash);
CREATE INDEX IF NOT EXISTS idx_user_devices_last_seen ON user_devices(last_seen_at);

-- Session Indexes
CREATE INDEX IF NOT EXISTS idx_user_sessions_session_id ON user_sessions(session_id);
CREATE INDEX IF NOT EXISTS idx_user_sessions_user_id ON user_sessions(user_id);
CREATE INDEX IF NOT EXISTS idx_user_sessions_expires_at ON user_sessions(expires_at);
CREATE INDEX IF NOT EXISTS idx_user_sessions_is_active ON user_sessions(is_active);
CREATE INDEX IF NOT EXISTS idx_user_sessions_last_accessed ON user_sessions(last_accessed_at);
CREATE INDEX IF NOT EXISTS idx_session_audit_log_user_id ON session_audit_log(user_id);
CREATE INDEX IF NOT EXISTS idx_session_audit_log_created_at ON session_audit_log(created_at);

-- Compliance Indexes
CREATE INDEX IF NOT EXISTS idx_compliance_audit_log_audit_id ON compliance_audit_log(audit_id);
CREATE INDEX IF NOT EXISTS idx_compliance_audit_log_user_id ON compliance_audit_log(user_id);
CREATE INDEX IF NOT EXISTS idx_compliance_audit_log_action ON compliance_audit_log(action);
CREATE INDEX IF NOT EXISTS idx_compliance_audit_log_resource_type ON compliance_audit_log(resource_type);
CREATE INDEX IF NOT EXISTS idx_compliance_audit_log_compliance_level ON compliance_audit_log(compliance_level);
CREATE INDEX IF NOT EXISTS idx_compliance_audit_log_created_at ON compliance_audit_log(created_at);
CREATE INDEX IF NOT EXISTS idx_privacy_consents_user_id ON privacy_consents(user_id);
CREATE INDEX IF NOT EXISTS idx_privacy_consents_consent_type ON privacy_consents(consent_type);
CREATE INDEX IF NOT EXISTS idx_breach_alerts_alert_id ON breach_alerts(alert_id);
CREATE INDEX IF NOT EXISTS idx_breach_alerts_severity ON breach_alerts(severity);
CREATE INDEX IF NOT EXISTS idx_breach_alerts_detected_at ON breach_alerts(detected_at);
CREATE INDEX IF NOT EXISTS idx_data_requests_request_id ON data_requests(request_id);
CREATE INDEX IF NOT EXISTS idx_data_requests_user_id ON data_requests(user_id);
CREATE INDEX IF NOT EXISTS idx_data_requests_status ON data_requests(status);

-- User table indexes for new columns
CREATE INDEX IF NOT EXISTS idx_users_mfa_enabled ON users(mfa_enabled);
CREATE INDEX IF NOT EXISTS idx_users_failed_login_attempts ON users(failed_login_attempts);
CREATE INDEX IF NOT EXISTS idx_users_account_locked_until ON users(account_locked_until);
CREATE INDEX IF NOT EXISTS idx_users_is_anonymized ON users(is_anonymized);

-- ============================================================================
-- Functions and Triggers
-- ============================================================================

-- Function to update MFA settings timestamp
CREATE OR REPLACE FUNCTION update_mfa_settings_timestamp()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Trigger for MFA settings
DROP TRIGGER IF EXISTS trigger_update_mfa_settings_timestamp ON user_mfa_settings;
CREATE TRIGGER trigger_update_mfa_settings_timestamp
    BEFORE UPDATE ON user_mfa_settings
    FOR EACH ROW
    EXECUTE FUNCTION update_mfa_settings_timestamp();

-- Function to update privacy consents timestamp
CREATE OR REPLACE FUNCTION update_privacy_consents_timestamp()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Trigger for privacy consents
DROP TRIGGER IF EXISTS trigger_update_privacy_consents_timestamp ON privacy_consents;
CREATE TRIGGER trigger_update_privacy_consents_timestamp
    BEFORE UPDATE ON privacy_consents
    FOR EACH ROW
    EXECUTE FUNCTION update_privacy_consents_timestamp();

-- Function to clean up expired security data
CREATE OR REPLACE FUNCTION cleanup_expired_security_data()
RETURNS INTEGER AS $$
DECLARE
    deleted_count INTEGER := 0;
BEGIN
    -- Clean up expired MFA SMS codes
    DELETE FROM mfa_sms_codes 
    WHERE expires_at < NOW() - INTERVAL '1 day';
    
    GET DIAGNOSTICS deleted_count = ROW_COUNT;
    
    -- Clean up old security events (keep 30 days)
    DELETE FROM security_events 
    WHERE created_at < NOW() - INTERVAL '30 days';
    
    -- Clean up expired sessions
    UPDATE user_sessions 
    SET is_active = FALSE, ended_at = NOW(), end_reason = 'expired'
    WHERE is_active = TRUE AND expires_at < NOW();
    
    -- Clean up old session records (keep 1 year)
    DELETE FROM user_sessions 
    WHERE created_at < NOW() - INTERVAL '1 year';
    
    -- Clean up old audit logs (keep 7 years for compliance)
    DELETE FROM compliance_audit_log 
    WHERE created_at < NOW() - INTERVAL '7 years';
    
    -- Clean up old MFA audit logs (keep 1 year)
    DELETE FROM mfa_audit_log 
    WHERE created_at < NOW() - INTERVAL '1 year';
    
    -- Clean up old session audit logs (keep 1 year)
    DELETE FROM session_audit_log 
    WHERE created_at < NOW() - INTERVAL '1 year';
    
    RETURN deleted_count;
END;
$$ LANGUAGE plpgsql;

-- ============================================================================
-- Grant Permissions
-- ============================================================================

-- Grant permissions to app_user for all new tables
GRANT SELECT, INSERT, UPDATE, DELETE ON user_mfa_settings TO app_user;
GRANT SELECT, INSERT, UPDATE, DELETE ON mfa_sms_codes TO app_user;
GRANT SELECT, INSERT, UPDATE, DELETE ON mfa_audit_log TO app_user;
GRANT SELECT, INSERT, UPDATE, DELETE ON security_events TO app_user;
GRANT SELECT, INSERT, UPDATE, DELETE ON user_devices TO app_user;
GRANT SELECT, INSERT, UPDATE, DELETE ON user_sessions TO app_user;
GRANT SELECT, INSERT, UPDATE, DELETE ON session_audit_log TO app_user;
GRANT SELECT, INSERT, UPDATE, DELETE ON compliance_audit_log TO app_user;
GRANT SELECT, INSERT, UPDATE, DELETE ON privacy_consents TO app_user;
GRANT SELECT, INSERT, UPDATE, DELETE ON breach_alerts TO app_user;
GRANT SELECT, INSERT, UPDATE, DELETE ON data_requests TO app_user;

-- Grant sequence permissions
GRANT USAGE, SELECT ON SEQUENCE user_mfa_settings_id_seq TO app_user;
GRANT USAGE, SELECT ON SEQUENCE mfa_sms_codes_id_seq TO app_user;
GRANT USAGE, SELECT ON SEQUENCE mfa_audit_log_id_seq TO app_user;
GRANT USAGE, SELECT ON SEQUENCE security_events_id_seq TO app_user;
GRANT USAGE, SELECT ON SEQUENCE user_devices_id_seq TO app_user;
GRANT USAGE, SELECT ON SEQUENCE user_sessions_id_seq TO app_user;
GRANT USAGE, SELECT ON SEQUENCE session_audit_log_id_seq TO app_user;
GRANT USAGE, SELECT ON SEQUENCE compliance_audit_log_id_seq TO app_user;
GRANT USAGE, SELECT ON SEQUENCE privacy_consents_id_seq TO app_user;
GRANT USAGE, SELECT ON SEQUENCE breach_alerts_id_seq TO app_user;
GRANT USAGE, SELECT ON SEQUENCE data_requests_id_seq TO app_user;

-- Grant execute permission on functions
GRANT EXECUTE ON FUNCTION cleanup_expired_security_data() TO app_user;
GRANT EXECUTE ON FUNCTION update_mfa_settings_timestamp() TO app_user;
GRANT EXECUTE ON FUNCTION update_privacy_consents_timestamp() TO app_user;

-- ============================================================================
-- Views for Enhanced Reporting
-- ============================================================================

-- Enhanced User Security Status View
CREATE OR REPLACE VIEW user_security_status AS
SELECT 
    u.id,
    u.email,
    u.first_name,
    u.last_name,
    u.role,
    u.account_status,
    u.mfa_enabled,
    u.failed_login_attempts,
    u.account_locked_until,
    u.last_login_at,
    u.is_anonymized,
    mfa.is_totp_enabled,
    mfa.is_sms_enabled,
    mfa.last_used_at as mfa_last_used_at,
    COUNT(DISTINCT us.id) FILTER (WHERE us.is_active = TRUE AND us.expires_at > NOW()) as active_sessions,
    COUNT(DISTINCT ud.id) as registered_devices,
    COUNT(DISTINCT ud.id) FILTER (WHERE ud.is_trusted = TRUE) as trusted_devices,
    u.created_at
FROM users u
LEFT JOIN user_mfa_settings mfa ON u.id = mfa.user_id
LEFT JOIN user_sessions us ON u.id = us.user_id
LEFT JOIN user_devices ud ON u.id = ud.user_id
GROUP BY u.id, mfa.is_totp_enabled, mfa.is_sms_enabled, mfa.last_used_at;

-- Grant access to the view
GRANT SELECT ON user_security_status TO app_user;

-- ============================================================================
-- Initial System Configuration
-- ============================================================================

-- Insert system configurations for new features
INSERT INTO system_configs (config_key, config_value, description) VALUES
('mfa_enabled', 'false', 'Enable multi-factor authentication system-wide')
ON CONFLICT (config_key) DO NOTHING;

INSERT INTO system_configs (config_key, config_value, description) VALUES
('mfa_totp_enabled', 'true', 'Enable TOTP-based MFA')
ON CONFLICT (config_key) DO NOTHING;

INSERT INTO system_configs (config_key, config_value, description) VALUES
('mfa_sms_enabled', 'true', 'Enable SMS-based MFA')
ON CONFLICT (config_key) DO NOTHING;

INSERT INTO system_configs (config_key, config_value, description) VALUES
('security_rate_limit_enabled', 'true', 'Enable rate limiting')
ON CONFLICT (config_key) DO NOTHING;

INSERT INTO system_configs (config_key, config_value, description) VALUES
('security_max_login_attempts', '5', 'Maximum failed login attempts before lockout')
ON CONFLICT (config_key) DO NOTHING;

INSERT INTO system_configs (config_key, config_value, description) VALUES
('security_lockout_duration_minutes', '30', 'Account lockout duration in minutes')
ON CONFLICT (config_key) DO NOTHING;

INSERT INTO system_configs (config_key, config_value, description) VALUES
('session_max_concurrent', '5', 'Maximum concurrent sessions per user')
ON CONFLICT (config_key) DO NOTHING;

INSERT INTO system_configs (config_key, config_value, description) VALUES
('session_timeout_hours', '24', 'Session timeout in hours')
ON CONFLICT (config_key) DO NOTHING;

INSERT INTO system_configs (config_key, config_value, description) VALUES
('compliance_audit_enabled', 'true', 'Enable compliance audit logging')
ON CONFLICT (config_key) DO NOTHING;

INSERT INTO system_configs (config_key, config_value, description) VALUES
('compliance_data_retention_years', '7', 'Data retention period in years')
ON CONFLICT (config_key) DO NOTHING;

-- ============================================================================
-- Comments for Documentation
-- ============================================================================

COMMENT ON TABLE user_mfa_settings IS 'Multi-factor authentication settings for users';
COMMENT ON TABLE mfa_sms_codes IS 'SMS verification codes for MFA setup and login';
COMMENT ON TABLE mfa_audit_log IS 'Audit log for MFA-related events';
COMMENT ON TABLE security_events IS 'Security events including rate limiting and failed attempts';
COMMENT ON TABLE user_devices IS 'Device fingerprinting and trust management';
COMMENT ON TABLE user_sessions IS 'Advanced session management with multi-device support';
COMMENT ON TABLE session_audit_log IS 'Audit log for session-related events';
COMMENT ON TABLE compliance_audit_log IS 'Enhanced audit trails for HIPAA compliance';
COMMENT ON TABLE privacy_consents IS 'Privacy consent management for GDPR/HIPAA compliance';
COMMENT ON TABLE breach_alerts IS 'Security breach detection and alerting';
COMMENT ON TABLE data_requests IS 'Data export, deletion, and anonymization requests';
COMMENT ON VIEW user_security_status IS 'Comprehensive view of user security and authentication status';

-- Success message
DO $$
BEGIN
    RAISE NOTICE 'Migration 005: Advanced authentication features created successfully';
    RAISE NOTICE 'Added MFA tables: user_mfa_settings, mfa_sms_codes, mfa_audit_log';
    RAISE NOTICE 'Added Security tables: security_events, user_devices';
    RAISE NOTICE 'Added Session tables: user_sessions, session_audit_log';
    RAISE NOTICE 'Added Compliance tables: compliance_audit_log, privacy_consents, breach_alerts, data_requests';
    RAISE NOTICE 'Added view: user_security_status';
    RAISE NOTICE 'Added functions: cleanup_expired_security_data, update_mfa_settings_timestamp, update_privacy_consents_timestamp';
    RAISE NOTICE 'Enhanced users table with MFA, security, and compliance columns';
END $$;
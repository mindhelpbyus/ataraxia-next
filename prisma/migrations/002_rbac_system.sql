-- ============================================================================
-- RBAC (Role-Based Access Control) System Migration
-- ============================================================================
-- This migration creates the complete RBAC system for Ataraxia
-- Based on: Ataraxia_backend/RBAC_SYSTEM_GUIDE.md
-- ============================================================================

-- Set schema
SET search_path TO ataraxia;

-- ============================================================================
-- 1. ROLES TABLE
-- ============================================================================
CREATE TABLE IF NOT EXISTS roles (
    id SERIAL PRIMARY KEY,
    name VARCHAR(50) UNIQUE NOT NULL,
    display_name VARCHAR(100) NOT NULL,
    description TEXT,
    is_system_role BOOLEAN DEFAULT FALSE,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

COMMENT ON TABLE roles IS 'Defines all available roles in the system';
COMMENT ON COLUMN roles.is_system_role IS 'System roles cannot be deleted';

-- ============================================================================
-- 2. PERMISSIONS TABLE
-- ============================================================================
CREATE TABLE IF NOT EXISTS permissions (
    id SERIAL PRIMARY KEY,
    name VARCHAR(100) UNIQUE NOT NULL,
    resource VARCHAR(50) NOT NULL,
    action VARCHAR(50) NOT NULL,
    description TEXT,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

COMMENT ON TABLE permissions IS 'Defines all available permissions in the system';
COMMENT ON COLUMN permissions.resource IS 'The resource this permission applies to (e.g., clients, appointments)';
COMMENT ON COLUMN permissions.action IS 'The action allowed (e.g., read, create, update, delete)';

-- ============================================================================
-- 3. ROLE_PERMISSIONS TABLE (Many-to-Many)
-- ============================================================================
CREATE TABLE IF NOT EXISTS role_permissions (
    id SERIAL PRIMARY KEY,
    role_id INTEGER NOT NULL REFERENCES roles(id) ON DELETE CASCADE,
    permission_id INTEGER NOT NULL REFERENCES permissions(id) ON DELETE CASCADE,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(role_id, permission_id)
);

COMMENT ON TABLE role_permissions IS 'Maps permissions to roles';

CREATE INDEX IF NOT EXISTS idx_role_permissions_role ON role_permissions(role_id);
CREATE INDEX IF NOT EXISTS idx_role_permissions_permission ON role_permissions(permission_id);

-- ============================================================================
-- 4. USER_ROLES TABLE (Many-to-Many)
-- ============================================================================
CREATE TABLE IF NOT EXISTS user_roles (
    id SERIAL PRIMARY KEY,
    user_id BIGINT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    role_id INTEGER NOT NULL REFERENCES roles(id) ON DELETE CASCADE,
    is_primary BOOLEAN DEFAULT FALSE,
    granted_by BIGINT REFERENCES users(id),
    granted_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    expires_at TIMESTAMP,
    UNIQUE(user_id, role_id)
);

COMMENT ON TABLE user_roles IS 'Maps users to their roles';
COMMENT ON COLUMN user_roles.is_primary IS 'Indicates the user''s primary role';
COMMENT ON COLUMN user_roles.granted_by IS 'User ID who granted this role';
COMMENT ON COLUMN user_roles.expires_at IS 'Optional expiration date for temporary roles';

CREATE INDEX IF NOT EXISTS idx_user_roles_user ON user_roles(user_id);
CREATE INDEX IF NOT EXISTS idx_user_roles_role ON user_roles(role_id);
CREATE INDEX IF NOT EXISTS idx_user_roles_primary ON user_roles(user_id, is_primary);

-- ============================================================================
-- 5. ROLE_CHANGE_AUDIT TABLE
-- ============================================================================
CREATE TABLE IF NOT EXISTS role_change_audit (
    id SERIAL PRIMARY KEY,
    user_id BIGINT NOT NULL REFERENCES users(id),
    role_id INTEGER NOT NULL REFERENCES roles(id),
    action VARCHAR(20) NOT NULL CHECK (action IN ('granted', 'revoked', 'updated')),
    changed_by BIGINT REFERENCES users(id),
    reason TEXT,
    metadata JSONB DEFAULT '{}',
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

COMMENT ON TABLE role_change_audit IS 'Audit log for all role changes';

CREATE INDEX IF NOT EXISTS idx_role_audit_user ON role_change_audit(user_id);
CREATE INDEX IF NOT EXISTS idx_role_audit_changed_by ON role_change_audit(changed_by);
CREATE INDEX IF NOT EXISTS idx_role_audit_created ON role_change_audit(created_at);

-- ============================================================================
-- 6. SEED DEFAULT ROLES
-- ============================================================================
INSERT INTO roles (name, display_name, description, is_system_role) VALUES
    ('super_admin', 'Super Administrator', 'Full system access with all permissions', TRUE),
    ('admin', 'Administrator', 'Administrative access to manage users and settings', TRUE),
    ('therapist', 'Therapist', 'Licensed therapist providing mental health services', TRUE),
    ('client', 'Client', 'Client receiving mental health services', TRUE),
    ('clinical_supervisor', 'Clinical Supervisor', 'Supervises therapists and reviews clinical work', TRUE),
    ('billing_admin', 'Billing Administrator', 'Manages billing, payments, and insurance', FALSE),
    ('support_staff', 'Support Staff', 'Customer support and administrative assistance', FALSE)
ON CONFLICT (name) DO NOTHING;

-- ============================================================================
-- 7. SEED DEFAULT PERMISSIONS
-- ============================================================================

-- Client Permissions
INSERT INTO permissions (name, resource, action, description) VALUES
    ('clients.read', 'clients', 'read', 'View client information'),
    ('clients.create', 'clients', 'create', 'Create new clients'),
    ('clients.update', 'clients', 'update', 'Update client information'),
    ('clients.delete', 'clients', 'delete', 'Delete clients'),
    ('clients.assign', 'clients', 'assign', 'Assign clients to therapists')
ON CONFLICT (name) DO NOTHING;

-- Appointment Permissions
INSERT INTO permissions (name, resource, action, description) VALUES
    ('appointments.read', 'appointments', 'read', 'View appointments'),
    ('appointments.create', 'appointments', 'create', 'Create appointments'),
    ('appointments.update', 'appointments', 'update', 'Update appointments'),
    ('appointments.delete', 'appointments', 'delete', 'Cancel appointments'),
    ('appointments.manage_all', 'appointments', 'manage_all', 'Manage all appointments in system')
ON CONFLICT (name) DO NOTHING;

-- Clinical Notes Permissions
INSERT INTO permissions (name, resource, action, description) VALUES
    ('notes.read', 'notes', 'read', 'View clinical notes'),
    ('notes.create', 'notes', 'create', 'Create clinical notes'),
    ('notes.update', 'notes', 'update', 'Update clinical notes'),
    ('notes.delete', 'notes', 'delete', 'Delete clinical notes'),
    ('notes.review', 'notes', 'review', 'Review and approve clinical notes')
ON CONFLICT (name) DO NOTHING;

-- User Management Permissions
INSERT INTO permissions (name, resource, action, description) VALUES
    ('users.read', 'users', 'read', 'View user information'),
    ('users.create', 'users', 'create', 'Create new users'),
    ('users.update', 'users', 'update', 'Update user information'),
    ('users.delete', 'users', 'delete', 'Delete users'),
    ('users.manage_roles', 'users', 'manage_roles', 'Assign and revoke user roles')
ON CONFLICT (name) DO NOTHING;

-- Therapist Permissions
INSERT INTO permissions (name, resource, action, description) VALUES
    ('therapists.read', 'therapists', 'read', 'View therapist information'),
    ('therapists.update', 'therapists', 'update', 'Update therapist profiles'),
    ('therapists.approve', 'therapists', 'approve', 'Approve therapist applications'),
    ('therapists.manage_all', 'therapists', 'manage_all', 'Full therapist management')
ON CONFLICT (name) DO NOTHING;

-- Billing Permissions
INSERT INTO permissions (name, resource, action, description) VALUES
    ('billing.read', 'billing', 'read', 'View billing information'),
    ('billing.create', 'billing', 'create', 'Create invoices and charges'),
    ('billing.update', 'billing', 'update', 'Update billing information'),
    ('billing.process', 'billing', 'process', 'Process payments')
ON CONFLICT (name) DO NOTHING;

-- Organization Permissions
INSERT INTO permissions (name, resource, action, description) VALUES
    ('organizations.read', 'organizations', 'read', 'View organization information'),
    ('organizations.create', 'organizations', 'create', 'Create organizations'),
    ('organizations.update', 'organizations', 'update', 'Update organization information'),
    ('organizations.delete', 'organizations', 'delete', 'Delete organizations')
ON CONFLICT (name) DO NOTHING;

-- System Permissions
INSERT INTO permissions (name, resource, action, description) VALUES
    ('system.settings', 'system', 'settings', 'Manage system settings'),
    ('system.audit', 'system', 'audit', 'View audit logs'),
    ('system.reports', 'system', 'reports', 'Generate system reports')
ON CONFLICT (name) DO NOTHING;

-- ============================================================================
-- 8. ASSIGN PERMISSIONS TO ROLES
-- ============================================================================

-- Super Admin: ALL PERMISSIONS
INSERT INTO role_permissions (role_id, permission_id)
SELECT r.id, p.id
FROM roles r
CROSS JOIN permissions p
WHERE r.name = 'super_admin'
ON CONFLICT (role_id, permission_id) DO NOTHING;

-- Admin: Most permissions except system-critical ones
INSERT INTO role_permissions (role_id, permission_id)
SELECT r.id, p.id
FROM roles r
CROSS JOIN permissions p
WHERE r.name = 'admin'
  AND p.name NOT IN ('system.settings', 'users.delete')
ON CONFLICT (role_id, permission_id) DO NOTHING;

-- Therapist: Client and appointment management
INSERT INTO role_permissions (role_id, permission_id)
SELECT r.id, p.id
FROM roles r
CROSS JOIN permissions p
WHERE r.name = 'therapist'
  AND p.name IN (
    'clients.read', 'clients.update',
    'appointments.read', 'appointments.create', 'appointments.update', 'appointments.delete',
    'notes.read', 'notes.create', 'notes.update'
  )
ON CONFLICT (role_id, permission_id) DO NOTHING;

-- Client: Read-only access to own data
INSERT INTO role_permissions (role_id, permission_id)
SELECT r.id, p.id
FROM roles r
CROSS JOIN permissions p
WHERE r.name = 'client'
  AND p.name IN (
    'appointments.read', 'appointments.create'
  )
ON CONFLICT (role_id, permission_id) DO NOTHING;

-- Clinical Supervisor: Review and approve clinical work
INSERT INTO role_permissions (role_id, permission_id)
SELECT r.id, p.id
FROM roles r
CROSS JOIN permissions p
WHERE r.name = 'clinical_supervisor'
  AND p.name IN (
    'clients.read',
    'appointments.read', 'appointments.manage_all',
    'notes.read', 'notes.review',
    'therapists.read'
  )
ON CONFLICT (role_id, permission_id) DO NOTHING;

-- Billing Admin: Billing and payment management
INSERT INTO role_permissions (role_id, permission_id)
SELECT r.id, p.id
FROM roles r
CROSS JOIN permissions p
WHERE r.name = 'billing_admin'
  AND p.name LIKE 'billing.%'
ON CONFLICT (role_id, permission_id) DO NOTHING;

-- Support Staff: Read access to help users
INSERT INTO role_permissions (role_id, permission_id)
SELECT r.id, p.id
FROM roles r
CROSS JOIN permissions p
WHERE r.name = 'support_staff'
  AND p.name IN (
    'clients.read',
    'appointments.read',
    'therapists.read',
    'users.read'
  )
ON CONFLICT (role_id, permission_id) DO NOTHING;

-- ============================================================================
-- 9. MIGRATE EXISTING USERS TO RBAC
-- ============================================================================

-- Assign roles based on existing user.role column
INSERT INTO user_roles (user_id, role_id, is_primary, granted_by, granted_at)
SELECT 
    u.id,
    r.id,
    TRUE,
    NULL,
    u.created_at
FROM users u
JOIN roles r ON LOWER(u.role) = r.name
WHERE NOT EXISTS (
    SELECT 1 FROM user_roles ur 
    WHERE ur.user_id = u.id AND ur.role_id = r.id
);

-- ============================================================================
-- 10. HELPER FUNCTIONS
-- ============================================================================

-- Function to get all permissions for a user
CREATE OR REPLACE FUNCTION get_user_permissions(p_user_id BIGINT)
RETURNS TABLE (
    permission_name VARCHAR,
    resource VARCHAR,
    action VARCHAR
) AS $$
BEGIN
    RETURN QUERY
    SELECT DISTINCT 
        p.name,
        p.resource,
        p.action
    FROM user_roles ur
    JOIN role_permissions rp ON ur.role_id = rp.role_id
    JOIN permissions p ON rp.permission_id = p.id
    WHERE ur.user_id = p_user_id
      AND (ur.expires_at IS NULL OR ur.expires_at > CURRENT_TIMESTAMP);
END;
$$ LANGUAGE plpgsql;

-- Function to check if user has specific permission
CREATE OR REPLACE FUNCTION user_has_permission(p_user_id BIGINT, p_permission_name VARCHAR)
RETURNS BOOLEAN AS $$
BEGIN
    RETURN EXISTS (
        SELECT 1
        FROM user_roles ur
        JOIN role_permissions rp ON ur.role_id = rp.role_id
        JOIN permissions p ON rp.permission_id = p.id
        WHERE ur.user_id = p_user_id
          AND p.name = p_permission_name
          AND (ur.expires_at IS NULL OR ur.expires_at > CURRENT_TIMESTAMP)
    );
END;
$$ LANGUAGE plpgsql;

-- Function to get all roles for a user
CREATE OR REPLACE FUNCTION get_user_roles(p_user_id BIGINT)
RETURNS TABLE (
    role_id INTEGER,
    role_name VARCHAR,
    display_name VARCHAR,
    is_primary BOOLEAN
) AS $$
BEGIN
    RETURN QUERY
    SELECT 
        r.id,
        r.name,
        r.display_name,
        ur.is_primary
    FROM user_roles ur
    JOIN roles r ON ur.role_id = r.id
    WHERE ur.user_id = p_user_id
      AND (ur.expires_at IS NULL OR ur.expires_at > CURRENT_TIMESTAMP)
    ORDER BY ur.is_primary DESC, r.name;
END;
$$ LANGUAGE plpgsql;

-- ============================================================================
-- 11. GRANT PERMISSIONS
-- ============================================================================

DO $$
BEGIN
    IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'app_user') THEN
        GRANT SELECT, INSERT, UPDATE, DELETE ON roles TO app_user;
        GRANT SELECT, INSERT, UPDATE, DELETE ON permissions TO app_user;
        GRANT SELECT, INSERT, UPDATE, DELETE ON role_permissions TO app_user;
        GRANT SELECT, INSERT, UPDATE, DELETE ON user_roles TO app_user;
        GRANT SELECT, INSERT ON role_change_audit TO app_user;
        
        GRANT USAGE, SELECT ON SEQUENCE roles_id_seq TO app_user;
        GRANT USAGE, SELECT ON SEQUENCE permissions_id_seq TO app_user;
        GRANT USAGE, SELECT ON SEQUENCE role_permissions_id_seq TO app_user;
        GRANT USAGE, SELECT ON SEQUENCE user_roles_id_seq TO app_user;
        GRANT USAGE, SELECT ON SEQUENCE role_change_audit_id_seq TO app_user;
        
        GRANT EXECUTE ON FUNCTION get_user_permissions(BIGINT) TO app_user;
        GRANT EXECUTE ON FUNCTION user_has_permission(BIGINT, VARCHAR) TO app_user;
        GRANT EXECUTE ON FUNCTION get_user_roles(BIGINT) TO app_user;
    END IF;
END $$;

-- ============================================================================
-- 12. VERIFICATION
-- ============================================================================

-- Verify roles created
SELECT 'Roles created:' AS status, COUNT(*) AS count FROM roles;

-- Verify permissions created
SELECT 'Permissions created:' AS status, COUNT(*) AS count FROM permissions;

-- Verify role-permission mappings
SELECT 'Role-Permission mappings:' AS status, COUNT(*) AS count FROM role_permissions;

-- Verify user-role assignments
SELECT 'User-Role assignments:' AS status, COUNT(*) AS count FROM user_roles;

-- Show role breakdown
SELECT 
    r.name AS role,
    r.display_name,
    COUNT(DISTINCT ur.user_id) AS user_count,
    COUNT(DISTINCT rp.permission_id) AS permission_count
FROM roles r
LEFT JOIN user_roles ur ON r.id = ur.role_id
LEFT JOIN role_permissions rp ON r.id = rp.role_id
GROUP BY r.id, r.name, r.display_name
ORDER BY r.name;

COMMENT ON TABLE roles IS 'RBAC Migration Complete - All roles, permissions, and assignments created';

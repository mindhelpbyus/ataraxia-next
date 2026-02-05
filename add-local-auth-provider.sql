-- Add 'local' as a valid auth provider type
-- This allows super admin and other direct database users to have proper auth provider mappings

-- Update the users table constraint to allow 'local'
ALTER TABLE ataraxia.users 
DROP CONSTRAINT IF EXISTS check_auth_provider;

ALTER TABLE ataraxia.users 
ADD CONSTRAINT check_auth_provider 
CHECK (current_auth_provider IN ('firebase', 'cognito', 'local'));

-- Update the auth_provider_mapping table constraint to allow 'local'
ALTER TABLE ataraxia.auth_provider_mapping 
DROP CONSTRAINT IF EXISTS auth_provider_mapping_provider_type_check;

ALTER TABLE ataraxia.auth_provider_mapping 
ADD CONSTRAINT auth_provider_mapping_provider_type_check 
CHECK (provider_type IN ('firebase', 'cognito', 'local'));

-- Verify the constraints
SELECT 
    conname as constraint_name,
    pg_get_constraintdef(oid) as constraint_definition
FROM pg_constraint 
WHERE conname IN ('check_auth_provider', 'auth_provider_mapping_provider_type_check');
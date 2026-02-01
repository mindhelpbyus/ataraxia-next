# Enhanced Therapist Service Validation Report

## Summary
- **Total Tests**: 28
- **Passed**: 14 ✅
- **Failed**: 14 ❌
- **Success Rate**: 50%
- **Environment**: development
- **Deployment Status**: ❌ INVALID
- **Timestamp**: 2026-02-01T03:55:51.602Z

## Category Results

### Infrastructure
- **Passed**: 0
- **Failed**: 6
- **Success Rate**: 0%

#### Test Details
- ❌ **Lambda Function: development-ataraxia-auth**: Function not found: Missing credentials in config, if using AWS_CONFIG_FILE, set AWS_SDK_LOAD_CONFIG=1
- ❌ **Lambda Function: development-ataraxia-therapist**: Function not found: Missing credentials in config, if using AWS_CONFIG_FILE, set AWS_SDK_LOAD_CONFIG=1
- ❌ **Lambda Function: development-ataraxia-client**: Function not found: Missing credentials in config, if using AWS_CONFIG_FILE, set AWS_SDK_LOAD_CONFIG=1
- ❌ **Lambda Function: development-ataraxia-verification**: Function not found: Missing credentials in config, if using AWS_CONFIG_FILE, set AWS_SDK_LOAD_CONFIG=1
- ❌ **Cognito User Pool**: User pool validation failed: Missing credentials in config, if using AWS_CONFIG_FILE, set AWS_SDK_LOAD_CONFIG=1
- ❌ **API Gateway**: API Gateway responding with status 403

### Database
- **Passed**: 2
- **Failed**: 4
- **Success Rate**: 33%

#### Test Details
- ✅ **Database Connection**: Successfully connected to database
- ❌ **Enhanced Therapist Schema**: Missing columns: clinical_specialties, therapeutic_modalities, session_formats, insurance_panels_accepted, new_clients_capacity, max_caseload_capacity, emergency_same_day_capacity, weekly_schedule, session_durations
  - Details: {"existingColumns":0,"expectedColumns":9}
- ✅ **JSONB Indexes**: Found 2 GIN indexes for JSONB fields
- ❌ **Table: temp_therapist_registrations**: Table missing
- ❌ **Table: verification_workflow_log**: Table missing
- ❌ **Table: therapist_verifications**: Table missing

### Api
- **Passed**: 3
- **Failed**: 2
- **Success Rate**: 60%

#### Test Details
- ✅ **GET /api/therapist**: Responded with status 200 (expected)
- ✅ **GET /api/therapist/search**: Responded with status 200 (expected)
- ❌ **POST /api/auth/login**: Responded with status 502 (unexpected)
- ❌ **POST /api/auth/register**: Responded with status 502 (unexpected)
- ✅ **GET /api/verification/status/test**: Responded with status 404 (expected)

### Features
- **Passed**: 4
- **Failed**: 0
- **Success Rate**: 100%

#### Test Details
- ✅ **JSONB Specialty Query**: JSONB specialty queries working correctly
- ✅ **Complex Search Query**: Complex search query executed successfully (10 results)
- ✅ **Insurance Panel Query**: Insurance panel queries working correctly
- ✅ **Capacity Calculations**: Capacity tracking working: 10/14 accepting new clients

### Performance
- **Passed**: 4
- **Failed**: 0
- **Success Rate**: 100%

#### Test Details
- ✅ **Basic Therapist List**: Response time: 53ms (max: 2000ms)
  - Details: {"responseTime":53,"maxTime":2000}
- ✅ **Advanced Search**: Response time: 70ms (max: 3000ms)
  - Details: {"responseTime":70,"maxTime":3000}
- ✅ **Auth Endpoint**: Response time: 30ms (max: 1000ms)
  - Details: {"responseTime":30,"maxTime":1000}
- ✅ **Database Query Performance**: JSONB query time: 25ms (max: 500ms)
  - Details: {"queryTime":25,"maxTime":500}

### Security
- **Passed**: 1
- **Failed**: 2
- **Success Rate**: 33%

#### Test Details
- ✅ **CORS Configuration**: CORS headers present
- ❌ **Authentication Requirement**: Endpoints may be unprotected
- ❌ **Password Policy**: Password policy check failed: Missing credentials in config, if using AWS_CONFIG_FILE, set AWS_SDK_LOAD_CONFIG=1

## Configuration
```json
{
  "environment": "development",
  "apiBaseUrl": "https://zojyvoao3c.execute-api.us-west-2.amazonaws.com/dev/",
  "cognitoUserPoolId": "us-west-2_xeXlyFBMH",
  "cognitoClientId": "7ek8kg1td2ps985r21m7727q98",
  "region": "us-west-2"
}
```

## Recommendations

❌ **Deployment validation failed. Please address the following issues:**

### Infrastructure Issues:
- Lambda Function: development-ataraxia-auth: Function not found: Missing credentials in config, if using AWS_CONFIG_FILE, set AWS_SDK_LOAD_CONFIG=1
- Lambda Function: development-ataraxia-therapist: Function not found: Missing credentials in config, if using AWS_CONFIG_FILE, set AWS_SDK_LOAD_CONFIG=1
- Lambda Function: development-ataraxia-client: Function not found: Missing credentials in config, if using AWS_CONFIG_FILE, set AWS_SDK_LOAD_CONFIG=1
- Lambda Function: development-ataraxia-verification: Function not found: Missing credentials in config, if using AWS_CONFIG_FILE, set AWS_SDK_LOAD_CONFIG=1
- Cognito User Pool: User pool validation failed: Missing credentials in config, if using AWS_CONFIG_FILE, set AWS_SDK_LOAD_CONFIG=1
- API Gateway: API Gateway responding with status 403

### Database Issues:
- Enhanced Therapist Schema: Missing columns: clinical_specialties, therapeutic_modalities, session_formats, insurance_panels_accepted, new_clients_capacity, max_caseload_capacity, emergency_same_day_capacity, weekly_schedule, session_durations
- Table: temp_therapist_registrations: Table missing
- Table: verification_workflow_log: Table missing
- Table: therapist_verifications: Table missing

### Api Issues:
- POST /api/auth/login: Responded with status 502 (unexpected)
- POST /api/auth/register: Responded with status 502 (unexpected)

### Security Issues:
- Authentication Requirement: Endpoints may be unprotected
- Password Policy: Password policy check failed: Missing credentials in config, if using AWS_CONFIG_FILE, set AWS_SDK_LOAD_CONFIG=1


# Enhanced Therapist Service Validation Report

## Summary
- **Total Tests**: 25
- **Passed**: 11 ✅
- **Failed**: 14 ❌
- **Success Rate**: 44%
- **Environment**: development
- **Deployment Status**: ❌ INVALID
- **Timestamp**: 2026-02-01T03:39:41.546Z

## Category Results

### Infrastructure
- **Passed**: 1
- **Failed**: 5
- **Success Rate**: 17%

#### Test Details
- ❌ **Lambda Function: ataraxia-auth-development**: Function not found: Function not found: arn:aws:lambda:us-west-2:121775527089:function:ataraxia-auth-development
- ❌ **Lambda Function: ataraxia-therapist-development**: Function not found: Function not found: arn:aws:lambda:us-west-2:121775527089:function:ataraxia-therapist-development
- ❌ **Lambda Function: ataraxia-client-development**: Function not found: Function not found: arn:aws:lambda:us-west-2:121775527089:function:ataraxia-client-development
- ❌ **Lambda Function: ataraxia-verification-development**: Function not found: Function not found: arn:aws:lambda:us-west-2:121775527089:function:ataraxia-verification-development
- ✅ **Cognito User Pool**: User pool exists: ataraxia-healthcare-dev
- ❌ **API Gateway**: API Gateway not accessible: Invalid URL

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
- **Passed**: 4
- **Failed**: 1
- **Success Rate**: 80%

#### Test Details
- ✅ **GET /api/therapist**: Responded with status 200 (expected)
- ❌ **GET /api/therapist/search**: Responded with status 404 (unexpected)
- ✅ **POST /api/auth/login**: Responded with status 401 (expected)
- ✅ **POST /api/auth/register**: Responded with status 400 (expected)
- ✅ **GET /api/verification/status/test**: Responded with status 404 (expected)

### Features
- **Passed**: 0
- **Failed**: 1
- **Success Rate**: 0%

#### Test Details
- ❌ **Enhanced Features**: Feature validation failed: relation "therapists" does not exist

### Performance
- **Passed**: 3
- **Failed**: 1
- **Success Rate**: 75%

#### Test Details
- ✅ **Basic Therapist List**: Response time: 54ms (max: 2000ms)
  - Details: {"responseTime":54,"maxTime":2000}
- ✅ **Advanced Search**: Response time: 33ms (max: 3000ms)
  - Details: {"responseTime":33,"maxTime":3000}
- ✅ **Auth Endpoint**: Response time: 3ms (max: 1000ms)
  - Details: {"responseTime":3,"maxTime":1000}
- ❌ **Database Query Performance**: Database performance test failed: relation "users" does not exist

### Security
- **Passed**: 1
- **Failed**: 2
- **Success Rate**: 33%

#### Test Details
- ❌ **CORS Configuration**: CORS test failed: Invalid URL
- ❌ **Authentication Requirement**: Auth test failed: Invalid URL
- ✅ **Password Policy**: Strong password policy configured

## Configuration
```json
{
  "environment": "development",
  "apiBaseUrl": "http://localhost:3010",
  "cognitoUserPoolId": "us-west-2_xeXlyFBMH",
  "cognitoClientId": "7ek8kg1td2ps985r21m7727q98",
  "region": "us-west-2"
}
```

## Recommendations

❌ **Deployment validation failed. Please address the following issues:**

### Infrastructure Issues:
- Lambda Function: ataraxia-auth-development: Function not found: Function not found: arn:aws:lambda:us-west-2:121775527089:function:ataraxia-auth-development
- Lambda Function: ataraxia-therapist-development: Function not found: Function not found: arn:aws:lambda:us-west-2:121775527089:function:ataraxia-therapist-development
- Lambda Function: ataraxia-client-development: Function not found: Function not found: arn:aws:lambda:us-west-2:121775527089:function:ataraxia-client-development
- Lambda Function: ataraxia-verification-development: Function not found: Function not found: arn:aws:lambda:us-west-2:121775527089:function:ataraxia-verification-development
- API Gateway: API Gateway not accessible: Invalid URL

### Database Issues:
- Enhanced Therapist Schema: Missing columns: clinical_specialties, therapeutic_modalities, session_formats, insurance_panels_accepted, new_clients_capacity, max_caseload_capacity, emergency_same_day_capacity, weekly_schedule, session_durations
- Table: temp_therapist_registrations: Table missing
- Table: verification_workflow_log: Table missing
- Table: therapist_verifications: Table missing

### Api Issues:
- GET /api/therapist/search: Responded with status 404 (unexpected)

### Features Issues:
- Enhanced Features: Feature validation failed: relation "therapists" does not exist

### Performance Issues:
- Database Query Performance: Database performance test failed: relation "users" does not exist

### Security Issues:
- CORS Configuration: CORS test failed: Invalid URL
- Authentication Requirement: Auth test failed: Invalid URL


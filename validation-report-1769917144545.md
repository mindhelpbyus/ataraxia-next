# Enhanced Therapist Service Validation Report

## Summary
- **Total Tests**: 8
- **Passed**: 0 ✅
- **Failed**: 8 ❌
- **Success Rate**: 0%
- **Environment**: dev
- **Deployment Status**: ❌ INVALID
- **Timestamp**: 2026-02-01T03:39:04.544Z

## Category Results

### Infrastructure
- **Passed**: 0
- **Failed**: 4
- **Success Rate**: 0%

#### Test Details
- ❌ **Lambda Function: ataraxia-auth-dev**: Function not found: Missing credentials in config, if using AWS_CONFIG_FILE, set AWS_SDK_LOAD_CONFIG=1
- ❌ **Lambda Function: ataraxia-therapist-dev**: Function not found: Missing credentials in config, if using AWS_CONFIG_FILE, set AWS_SDK_LOAD_CONFIG=1
- ❌ **Lambda Function: ataraxia-client-dev**: Function not found: Missing credentials in config, if using AWS_CONFIG_FILE, set AWS_SDK_LOAD_CONFIG=1
- ❌ **Lambda Function: ataraxia-verification-dev**: Function not found: Missing credentials in config, if using AWS_CONFIG_FILE, set AWS_SDK_LOAD_CONFIG=1

### Database
- **Passed**: 0
- **Failed**: 1
- **Success Rate**: 0%

#### Test Details
- ❌ **Database Connection**: Database validation failed: 

### Api
- **Passed**: 0
- **Failed**: 1
- **Success Rate**: 0%

#### Test Details
- ❌ **API Base URL**: API base URL not configured

### Features
- **Passed**: 0
- **Failed**: 1
- **Success Rate**: 0%

#### Test Details
- ❌ **Enhanced Features**: Feature validation failed: 

### Performance
- **Passed**: 0
- **Failed**: 1
- **Success Rate**: 0%

#### Test Details
- ❌ **API Performance**: API base URL not configured

### Security
- **Passed**: 0
- **Failed**: 0
- **Success Rate**: NaN%

#### Test Details

## Configuration
```json
{
  "environment": "dev",
  "region": "us-west-2"
}
```

## Recommendations

❌ **Deployment validation failed. Please address the following issues:**

### Infrastructure Issues:
- Lambda Function: ataraxia-auth-dev: Function not found: Missing credentials in config, if using AWS_CONFIG_FILE, set AWS_SDK_LOAD_CONFIG=1
- Lambda Function: ataraxia-therapist-dev: Function not found: Missing credentials in config, if using AWS_CONFIG_FILE, set AWS_SDK_LOAD_CONFIG=1
- Lambda Function: ataraxia-client-dev: Function not found: Missing credentials in config, if using AWS_CONFIG_FILE, set AWS_SDK_LOAD_CONFIG=1
- Lambda Function: ataraxia-verification-dev: Function not found: Missing credentials in config, if using AWS_CONFIG_FILE, set AWS_SDK_LOAD_CONFIG=1

### Database Issues:
- Database Connection: Database validation failed: 

### Api Issues:
- API Base URL: API base URL not configured

### Features Issues:
- Enhanced Features: Feature validation failed: 

### Performance Issues:
- API Performance: API base URL not configured


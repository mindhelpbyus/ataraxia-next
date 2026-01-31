# Configuration Guide

This directory contains configuration templates for the Ataraxia healthcare platform.

## Quick Start

1. **Copy templates to actual files:**
   ```bash
   cp .env.template .env
   cp .env.production.template .env.production
   cp .env.development.template .env.development
   ```

2. **Fill in your actual values** in the copied files

3. **Validate configuration:**
   ```bash
   node validate-config.js
   ```

4. **Run pre-deployment check:**
   ```bash
   ./scripts/pre-deploy-check.sh
   ```

## Configuration Categories

### Required Variables
- **DATABASE_URL**: PostgreSQL connection string
- **JWT_SECRET**: JWT signing secret (32+ characters)
- **AWS_REGION**: AWS region for all services
- **COGNITO_USER_POOL_ID**: Cognito User Pool ID
- **COGNITO_CLIENT_ID**: Cognito App Client ID
- **AUTH_PROVIDER_TYPE**: Authentication provider type

### Optional Variables
- **API_PORT**: Local development port
- **SESSION_TIMEOUT_MINUTES**: Session timeout
- **ENABLE_DETAILED_ERRORS**: Error detail level

## Security Notes

- Never commit actual .env files to version control
- Use strong, unique values for JWT_SECRET
- Rotate credentials regularly
- Use different values for different environments

## Validation

The validation script checks:
- All required variables are present
- Variable formats are correct
- AWS credentials are valid
- Database connection works

## Troubleshooting

If validation fails:
1. Check that all required variables are set
2. Verify AWS credentials are correct
3. Test database connection manually
4. Check variable formats match examples

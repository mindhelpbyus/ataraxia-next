#!/bin/bash

# Complete Cognito Migration Script
# This script performs a full migration from Firebase to Cognito

set -e

echo "🚀 Starting Complete Cognito Migration"
echo "======================================"

# Colors for output
GREEN='\033[0;32m'
BLUE='\033[0;34m'
RED='\033[0;31m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

print_status() {
    echo -e "${BLUE}[INFO]${NC} $1"
}

print_success() {
    echo -e "${GREEN}[SUCCESS]${NC} $1"
}

print_warning() {
    echo -e "${YELLOW}[WARNING]${NC} $1"
}

print_error() {
    echo -e "${RED}[ERROR]${NC} $1"
}

# Step 1: Check prerequisites
print_status "Checking prerequisites..."

if [ -z "$DATABASE_URL" ]; then
    export DATABASE_URL="postgresql://app_user:ChangeMe123!@dev-db-cluster.cluster-cliy2m6q8h4h.us-west-2.rds.amazonaws.com:5432/ataraxia_db?schema=ataraxia"
    print_warning "DATABASE_URL not set, using default"
fi

# Check AWS credentials
if ! aws sts get-caller-identity >/dev/null 2>&1; then
    print_error "AWS credentials not configured. Please run 'aws configure' first."
    exit 1
fi

print_success "Prerequisites checked"

# Step 2: Deploy Cognito infrastructure
print_status "Deploying Cognito infrastructure..."

cd infrastructure
if npx cdk deploy --context environment=dev --require-approval never; then
    print_success "Cognito infrastructure deployed"
else
    print_error "Failed to deploy Cognito infrastructure"
    exit 1
fi

cd ..

# Step 3: Get Cognito configuration from CDK outputs
print_status "Extracting Cognito configuration..."

if [ -f "infrastructure/cdk-outputs.json" ]; then
    USER_POOL_ID=$(cat infrastructure/cdk-outputs.json | jq -r '.["AtaraxiaStack-dev"].OutputUserPoolId // empty')
    CLIENT_ID=$(cat infrastructure/cdk-outputs.json | jq -r '.["AtaraxiaStack-dev"].OutputUserPoolClientId // empty')
    
    if [ -n "$USER_POOL_ID" ] && [ -n "$CLIENT_ID" ]; then
        export COGNITO_USER_POOL_ID=$USER_POOL_ID
        export COGNITO_CLIENT_ID=$CLIENT_ID
        export COGNITO_REGION=${AWS_REGION:-us-west-2}
        
        print_success "Cognito configuration extracted"
        echo "  User Pool ID: $USER_POOL_ID"
        echo "  Client ID: $CLIENT_ID"
    else
        print_error "Failed to extract Cognito configuration from CDK outputs"
        exit 1
    fi
else
    print_error "CDK outputs file not found"
    exit 1
fi

# Step 4: Run dry run first
print_status "Running migration dry run..."

if npm run migrate:universal-auth -- --provider=cognito --dry-run; then
    print_success "Dry run completed successfully"
else
    print_error "Dry run failed"
    exit 1
fi

# Step 5: Confirm migration
echo ""
print_warning "⚠️  IMPORTANT: This will migrate ALL users from Firebase to Cognito"
print_warning "   - All users will be created in Cognito"
print_warning "   - Database will be updated with Cognito IDs"
print_warning "   - Users will need to use Cognito for login"
echo ""
read -p "Do you want to proceed with the migration? (yes/no): " confirm

if [ "$confirm" != "yes" ]; then
    print_warning "Migration cancelled by user"
    exit 0
fi

# Step 6: Run actual migration
print_status "Running complete Cognito migration..."

if npm run migrate:universal-auth -- --provider=cognito; then
    print_success "Migration completed successfully"
else
    print_error "Migration failed"
    exit 1
fi

# Step 7: Update frontend configuration
print_status "Updating frontend configuration..."

FRONTEND_ENV_FILE="../Ataraxia/.env.local"
cat > ${FRONTEND_ENV_FILE} << EOF
# Ataraxia Frontend Configuration - Cognito Migration
# Generated on $(date)

# Authentication Configuration
VITE_USE_COGNITO=true
VITE_ENABLE_AUTH_FALLBACK=false
VITE_AUTH_PROVIDER_TYPE=cognito

# AWS Cognito Configuration
VITE_AWS_REGION=${COGNITO_REGION}
VITE_COGNITO_USER_POOL_ID=${USER_POOL_ID}
VITE_COGNITO_CLIENT_ID=${CLIENT_ID}

# API Configuration
VITE_API_BASE_URL=https://api.ataraxia.health
VITE_API_TIMEOUT=30000

# Environment Configuration
VITE_NODE_ENV=development
VITE_LOG_LEVEL=debug

# Feature Flags
VITE_ENABLE_MIGRATION_MODE=false
VITE_SHOW_AUTH_DEBUG=true
VITE_ENABLE_UNIVERSAL_AUTH=true

# Healthcare Platform Configuration
VITE_PLATFORM_NAME="Ataraxia Healthcare"
VITE_PLATFORM_VERSION="2.0.0"
VITE_COMPLIANCE_MODE="HIPAA"
EOF

print_success "Frontend configuration updated"

# Step 8: Generate migration summary
print_status "Generating migration summary..."

cat > migration-summary.md << EOF
# Complete Cognito Migration - Summary

## Migration Completed: $(date)

### Infrastructure
- **Cognito User Pool**: ${USER_POOL_ID}
- **Cognito Client**: ${CLIENT_ID}
- **AWS Region**: ${COGNITO_REGION}

### Migration Results
- **Status**: Complete
- **Provider**: Firebase → Cognito
- **Database**: Updated with universal auth fields
- **Frontend**: Configured for Cognito

### User Impact
- All users migrated to Cognito
- Users will need to reset passwords on first login
- All user data preserved and migrated
- Role-based groups created in Cognito

### Next Steps
1. **Test Authentication**: Verify users can login with Cognito
2. **Update Documentation**: Inform users about password reset
3. **Monitor System**: Check CloudWatch logs for any issues
4. **Cleanup**: Remove Firebase configuration when stable

### Rollback Plan
If issues occur:
1. Restore from backup files in /backups directory
2. Update frontend to use Firebase fallback
3. Switch auth_provider_type back to 'firebase' in database

### Support
- Migration reports: Check universal-auth-migration-report-*.md files
- CloudWatch logs: /aws/lambda/ataraxia-auth-dev
- Database backups: /backups directory

Generated by: complete-cognito-migration.sh
EOF

print_success "Migration summary generated: migration-summary.md"

# Final status
echo ""
echo "🎉 Complete Cognito Migration Finished!"
echo ""
echo "📋 Summary:"
echo "  ✅ Cognito User Pool: ${USER_POOL_ID}"
echo "  ✅ All users migrated to Cognito"
echo "  ✅ Database updated with universal auth fields"
echo "  ✅ Frontend configured for Cognito"
echo ""
echo "🚀 Next Steps:"
echo "  1. Test login: cd ../Ataraxia && npm run dev"
echo "  2. Check migration report: cat migration-summary.md"
echo "  3. Monitor CloudWatch logs for any issues"
echo ""
print_success "Migration completed successfully!"
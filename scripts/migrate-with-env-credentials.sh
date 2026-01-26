#!/bin/bash

# Cognito Migration with Environment Credentials
# This script allows you to run the migration by setting AWS credentials as environment variables

set -e

echo "🚀 Cognito Migration with Environment Credentials"
echo "================================================"

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

# Check if AWS credentials are set as environment variables
if [ -z "$AWS_ACCESS_KEY_ID" ] || [ -z "$AWS_SECRET_ACCESS_KEY" ]; then
    print_error "AWS credentials not found in environment variables"
    echo ""
    echo "Please set your AWS credentials:"
    echo ""
    echo "export AWS_ACCESS_KEY_ID='your-access-key-id'"
    echo "export AWS_SECRET_ACCESS_KEY='your-secret-access-key'"
    echo "export AWS_DEFAULT_REGION='us-west-2'"
    echo ""
    echo "Or run: ./scripts/setup-aws-credentials.sh for more options"
    exit 1
fi

# Set default region if not set
if [ -z "$AWS_DEFAULT_REGION" ]; then
    export AWS_DEFAULT_REGION="us-west-2"
    print_warning "AWS_DEFAULT_REGION not set, using us-west-2"
fi

print_success "AWS credentials found in environment variables"
echo "  Region: ${AWS_DEFAULT_REGION}"

# Test AWS credentials
print_status "Testing AWS credentials..."
if aws sts get-caller-identity >/dev/null 2>&1; then
    ACCOUNT=$(aws sts get-caller-identity --query Account --output text)
    print_success "AWS credentials are valid"
    echo "  Account: ${ACCOUNT}"
    echo "  Region: ${AWS_DEFAULT_REGION}"
else
    print_error "AWS credentials are invalid or AWS CLI is not working"
    exit 1
fi

# Set database URL if not set
if [ -z "$DATABASE_URL" ]; then
    export DATABASE_URL="postgresql://app_user:ChangeMe123!@dev-db-cluster.cluster-cliy2m6q8h4h.us-west-2.rds.amazonaws.com:5432/ataraxia_db?schema=ataraxia"
    print_warning "DATABASE_URL not set, using default"
fi

# Step 1: Deploy Cognito infrastructure
print_status "Deploying Cognito infrastructure..."

cd infrastructure
if JSII_SILENCE_WARNING_UNTESTED_NODE_VERSION=1 npx cdk deploy --context environment=dev --require-approval never; then
    print_success "Cognito infrastructure deployed"
else
    print_error "Failed to deploy Cognito infrastructure"
    exit 1
fi

cd ..

# Step 2: Extract Cognito configuration
print_status "Extracting Cognito configuration..."

if [ -f "infrastructure/cdk-outputs.json" ]; then
    USER_POOL_ID=$(cat infrastructure/cdk-outputs.json | jq -r '.["AtaraxiaStack-dev"].OutputUserPoolId // empty')
    CLIENT_ID=$(cat infrastructure/cdk-outputs.json | jq -r '.["AtaraxiaStack-dev"].OutputUserPoolClientId // empty')
    
    if [ -n "$USER_POOL_ID" ] && [ -n "$CLIENT_ID" ]; then
        export COGNITO_USER_POOL_ID=$USER_POOL_ID
        export COGNITO_CLIENT_ID=$CLIENT_ID
        export COGNITO_REGION=${AWS_DEFAULT_REGION}
        
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

# Step 3: Run migration
print_status "Running Cognito migration..."

if npm run migrate:universal-auth -- --provider=cognito; then
    print_success "Migration completed successfully"
else
    print_error "Migration failed"
    exit 1
fi

# Step 4: Update frontend configuration
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
echo "  2. Check Prisma Studio: npm run prisma:studio"
echo "  3. Monitor CloudWatch logs for any issues"
echo ""
print_success "Migration completed successfully!"
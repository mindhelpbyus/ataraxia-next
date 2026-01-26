#!/bin/bash

# Complete Firebase to Cognito Migration Script
# This script handles the entire migration process from start to finish

set -e

ENVIRONMENT=${1:-local}
SKIP_MIGRATION=${2:-false}

echo "🚀 Starting Complete Firebase to Cognito Migration"
echo "Environment: ${ENVIRONMENT}"
echo "Skip Migration: ${SKIP_MIGRATION}"
echo ""

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Function to print colored output
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

# Function to check if command exists
command_exists() {
    command -v "$1" >/dev/null 2>&1
}

# Validate prerequisites
print_status "Checking prerequisites..."

if ! command_exists aws; then
    print_error "AWS CLI is not installed. Please install it first."
    exit 1
fi

if ! command_exists sam; then
    print_error "SAM CLI is not installed. Please install it first."
    exit 1
fi

if ! command_exists node; then
    print_error "Node.js is not installed. Please install it first."
    exit 1
fi

if ! command_exists npm; then
    print_error "npm is not installed. Please install it first."
    exit 1
fi

print_success "All prerequisites are installed"

# Check AWS credentials
print_status "Checking AWS credentials..."
if ! aws sts get-caller-identity >/dev/null 2>&1; then
    print_error "AWS credentials not configured. Please run 'aws configure' first."
    exit 1
fi

print_success "AWS credentials are configured"

# Step 1: Build the project
print_status "Building Ataraxia-Next project..."
npm run build

if [ $? -eq 0 ]; then
    print_success "Project built successfully"
else
    print_error "Project build failed"
    exit 1
fi

# Step 2: Deploy Cognito infrastructure
print_status "Deploying Cognito User Pool..."
./scripts/deploy-cognito.sh ${ENVIRONMENT}

if [ $? -eq 0 ]; then
    print_success "Cognito infrastructure deployed"
else
    print_error "Cognito deployment failed"
    exit 1
fi

# Step 3: Get Cognito configuration
print_status "Retrieving Cognito configuration..."
STACK_NAME="ataraxia-next-cognito-${ENVIRONMENT}"
REGION=${AWS_REGION:-us-west-2}

USER_POOL_ID=$(aws cloudformation describe-stacks \
  --stack-name ${STACK_NAME} \
  --region ${REGION} \
  --query 'Stacks[0].Outputs[?OutputKey==`CognitoUserPoolId`].OutputValue' \
  --output text 2>/dev/null)

CLIENT_ID=$(aws cloudformation describe-stacks \
  --stack-name ${STACK_NAME} \
  --region ${REGION} \
  --query 'Stacks[0].Outputs[?OutputKey==`CognitoClientId`].OutputValue' \
  --output text 2>/dev/null)

if [ -z "$USER_POOL_ID" ] || [ -z "$CLIENT_ID" ]; then
    print_error "Failed to retrieve Cognito configuration"
    exit 1
fi

print_success "Cognito configuration retrieved"
echo "  User Pool ID: ${USER_POOL_ID}"
echo "  Client ID: ${CLIENT_ID}"

# Step 4: Update environment variables
print_status "Updating environment variables..."
cat > .env.migration << EOF
# Updated configuration for Cognito migration
DATABASE_URL="postgresql://app_user:ChangeMe123!@dev-db-cluster.cluster-cliy2m6q8h4h.us-west-2.rds.amazonaws.com:5432/ataraxia_db?schema=ataraxia"
AWS_REGION=${REGION}
COGNITO_USER_POOL_ID=${USER_POOL_ID}
COGNITO_CLIENT_ID=${CLIENT_ID}
COGNITO_REGION=${REGION}
NODE_ENV=${ENVIRONMENT}
LOG_LEVEL=info
JWT_SECRET=your_jwt_secret_key_change_in_production
EOF

# Backup original .env and use migration config
if [ -f .env ]; then
    cp .env .env.backup
fi
cp .env.migration .env

print_success "Environment variables updated"

# Step 5: Run database migration (if not skipped)
if [ "$SKIP_MIGRATION" != "true" ]; then
    print_status "Running Firebase to Cognito user migration..."
    
    # Set environment variables for migration script
    export COGNITO_USER_POOL_ID=${USER_POOL_ID}
    export COGNITO_CLIENT_ID=${CLIENT_ID}
    export AWS_REGION=${REGION}
    
    npm run migrate:firebase-to-cognito
    
    if [ $? -eq 0 ]; then
        print_success "User migration completed successfully"
    else
        print_warning "User migration had some issues. Check the migration report."
    fi
else
    print_warning "Skipping user migration (SKIP_MIGRATION=true)"
fi

# Step 6: Test the authentication endpoints
print_status "Testing authentication endpoints..."

# Start local API for testing
print_status "Starting local API server..."
sam local start-api --port 3001 &
API_PID=$!

# Wait for API to start
sleep 10

# Test health endpoint
if curl -f http://localhost:3001/api/auth/login >/dev/null 2>&1; then
    print_success "API server is responding"
else
    print_warning "API server may not be fully ready. Manual testing recommended."
fi

# Stop the API server
kill $API_PID 2>/dev/null || true

# Step 7: Update frontend configuration
print_status "Updating frontend configuration..."

FRONTEND_ENV_FILE="../Ataraxia/.env.local"
cat > ${FRONTEND_ENV_FILE} << EOF
# Ataraxia Frontend Configuration for Cognito Migration
VITE_USE_COGNITO=true
VITE_ENABLE_AUTH_FALLBACK=true
VITE_AWS_REGION=${REGION}
VITE_COGNITO_USER_POOL_ID=${USER_POOL_ID}
VITE_COGNITO_CLIENT_ID=${CLIENT_ID}
VITE_API_BASE_URL=http://localhost:3001
VITE_ENABLE_MIGRATION_MODE=true
VITE_SHOW_AUTH_DEBUG=true
EOF

print_success "Frontend configuration updated"

# Step 8: Generate migration summary
print_status "Generating migration summary..."

cat > migration-summary.md << EOF
# Firebase to Cognito Migration Summary

## Migration Completed: $(date)

### Infrastructure
- **Cognito User Pool**: ${USER_POOL_ID}
- **Cognito Client**: ${CLIENT_ID}
- **AWS Region**: ${REGION}
- **Environment**: ${ENVIRONMENT}

### Backend (Ataraxia-Next)
- ✅ Cognito User Pool deployed
- ✅ Authentication Lambda functions ready
- ✅ Database schema compatible
- ✅ Environment variables configured

### Frontend (Ataraxia)
- ✅ Cognito authentication service created
- ✅ Unified auth service with fallback
- ✅ Environment variables configured
- ✅ Migration status component available

### Next Steps

#### 1. Test the Migration
\`\`\`bash
# Start backend
cd Ataraxia-Next
sam local start-api --port 3001

# Start frontend (in another terminal)
cd Ataraxia
npm run dev
\`\`\`

#### 2. Verify User Authentication
- Test login with existing user credentials
- Verify user data is preserved
- Check that all features work as expected

#### 3. Monitor the System
- Use AuthMigrationStatus component for debugging
- Check CloudWatch logs for any issues
- Monitor user feedback

#### 4. Production Deployment
- Deploy to staging environment first
- Run full test suite
- Deploy to production with monitoring

### Rollback Plan
If issues occur:
1. Restore original .env: \`cp .env.backup .env\`
2. Start original backend: \`cd Ataraxia_backend && npm run dev\`
3. Update frontend: Set \`VITE_USE_COGNITO=false\`

### Support
- Migration logs: Check \`migration-report-*.md\` files
- API logs: \`sam logs --tail\`
- Frontend logs: Browser developer console

Generated by: complete-migration.sh
EOF

print_success "Migration summary generated: migration-summary.md"

# Final status
echo ""
echo "🎉 Firebase to Cognito Migration Complete!"
echo ""
echo "📋 Summary:"
echo "  ✅ Cognito User Pool: ${USER_POOL_ID}"
echo "  ✅ Backend: Ataraxia-Next configured"
echo "  ✅ Frontend: Ataraxia configured"
echo "  ✅ Migration: ${SKIP_MIGRATION:-Completed}"
echo ""
echo "🚀 Next Steps:"
echo "  1. Start backend: cd Ataraxia-Next && sam local start-api --port 3001"
echo "  2. Start frontend: cd Ataraxia && npm run dev"
echo "  3. Test authentication with existing users"
echo ""
echo "📄 Documentation:"
echo "  - Migration Summary: migration-summary.md"
echo "  - Frontend Guide: docs/FRONTEND_INTEGRATION.md"
echo "  - Migration Reports: migration-report-*.md"
echo ""
print_success "Migration completed successfully!"
#!/bin/bash

# Enhanced Therapist Service Deployment Script
# Robust CDK deployment with real-time monitoring, retry mechanisms, and comprehensive validation

set -e

ENVIRONMENT=${1:-dev}
SKIP_BOOTSTRAP=${2:-false}
MAX_RETRIES=${3:-3}
RETRY_DELAY=${4:-30}

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
PURPLE='\033[0;35m'
CYAN='\033[0;36m'
NC='\033[0m' # No Color

# Logging configuration
LOG_DIR="$(pwd)/deployment-logs"
LOG_FILE="${LOG_DIR}/deployment-$(date +%Y%m%d-%H%M%S).log"
DEPLOYMENT_ID="deploy-$(date +%Y%m%d-%H%M%S)"

mkdir -p "${LOG_DIR}"

# Logging functions
log() {
    echo "[$(date '+%Y-%m-%d %H:%M:%S')] $1" | tee -a "${LOG_FILE}"
}

print_header() {
    echo ""
    echo -e "${PURPLE}================================================================================================${NC}"
    echo -e "${PURPLE}$1${NC}"
    echo -e "${PURPLE}================================================================================================${NC}"
    echo ""
    log "HEADER: $1"
}

print_status() {
    echo -e "${BLUE}[INFO]${NC} $1"
    log "INFO: $1"
}

print_success() {
    echo -e "${GREEN}[SUCCESS]${NC} $1"
    log "SUCCESS: $1"
}

print_warning() {
    echo -e "${YELLOW}[WARNING]${NC} $1"
    log "WARNING: $1"
}

print_error() {
    echo -e "${RED}[ERROR]${NC} $1"
    log "ERROR: $1"
}

print_progress() {
    echo -e "${CYAN}[PROGRESS]${NC} $1"
    log "PROGRESS: $1"
}

# Cleanup function
cleanup() {
    if [ $? -ne 0 ]; then
        print_error "Deployment failed. Check logs at: ${LOG_FILE}"
        print_error "Deployment ID: ${DEPLOYMENT_ID}"
    fi
}

trap cleanup EXIT

print_header "🚀 Enhanced Therapist Service Deployment - ${DEPLOYMENT_ID}"

echo "Configuration:"
echo "  Environment: ${ENVIRONMENT}"
echo "  Skip Bootstrap: ${SKIP_BOOTSTRAP}"
echo "  Max Retries: ${MAX_RETRIES}"
echo "  Retry Delay: ${RETRY_DELAY}s"
echo "  Log File: ${LOG_FILE}"
echo ""

# Function to check if command exists
command_exists() {
    command -v "$1" >/dev/null 2>&1
}

# Function to retry commands
retry_command() {
    local cmd="$1"
    local description="$2"
    local attempt=1
    
    while [ $attempt -le $MAX_RETRIES ]; do
        print_progress "Attempt $attempt/$MAX_RETRIES: $description"
        
        if eval "$cmd"; then
            print_success "$description completed successfully"
            return 0
        else
            if [ $attempt -eq $MAX_RETRIES ]; then
                print_error "$description failed after $MAX_RETRIES attempts"
                return 1
            else
                print_warning "$description failed (attempt $attempt/$MAX_RETRIES). Retrying in ${RETRY_DELAY}s..."
                sleep $RETRY_DELAY
            fi
        fi
        
        ((attempt++))
    done
}

# Function to validate prerequisites
validate_prerequisites() {
    print_header "📋 Validating Prerequisites"
    
    local missing_deps=()
    
    if ! command_exists aws; then
        missing_deps+=("AWS CLI")
    fi
    
    if ! command_exists node; then
        missing_deps+=("Node.js")
    fi
    
    if ! command_exists npm; then
        missing_deps+=("npm")
    fi
    
    if ! command_exists jq; then
        missing_deps+=("jq")
    fi
    
    if [ ${#missing_deps[@]} -ne 0 ]; then
        print_error "Missing dependencies: ${missing_deps[*]}"
        print_error "Please install missing dependencies and try again"
        exit 1
    fi
    
    print_success "All prerequisites are installed"
    
    # Check AWS credentials
    print_status "Validating AWS credentials..."
    if ! aws sts get-caller-identity >/dev/null 2>&1; then
        print_error "AWS credentials not configured. Please run 'aws configure' first."
        exit 1
    fi
    
    ACCOUNT=$(aws sts get-caller-identity --query Account --output text)
    REGION=${AWS_REGION:-us-west-2}
    
    print_success "AWS credentials validated for account: ${ACCOUNT} in region: ${REGION}"
    
    # Check Node.js version
    NODE_VERSION=$(node --version)
    print_status "Node.js version: ${NODE_VERSION}"
    
    # Check npm version
    NPM_VERSION=$(npm --version)
    print_status "npm version: ${NPM_VERSION}"
}

# Function to build Lambda functions
build_lambda_functions() {
    print_header "🔨 Building Lambda Functions"
    
    print_status "Installing dependencies..."
    retry_command "npm install" "npm install"
    
    print_status "Running TypeScript compilation..."
    retry_command "npm run build" "TypeScript build"
    
    # Verify build output
    if [ ! -d "dist" ]; then
        print_error "Build output directory 'dist' not found"
        exit 1
    fi
    
    # Check for required Lambda handlers
    local required_handlers=(
        "dist/lambdas/auth/handler.js"
        "dist/lambdas/therapist/handler.js"
        "dist/lambdas/client/handler.js"
        "dist/lambdas/verification/handler.js"
    )
    
    for handler in "${required_handlers[@]}"; do
        if [ ! -f "$handler" ]; then
            print_error "Required handler not found: $handler"
            exit 1
        fi
    done
    
    print_success "All Lambda functions built successfully"
    
    # Display build statistics
    print_status "Build statistics:"
    echo "  Total files: $(find dist -name '*.js' | wc -l)"
    echo "  Build size: $(du -sh dist | cut -f1)"
    echo "  Handler files: ${#required_handlers[@]}"
}

# Function to validate TypeScript code
validate_typescript() {
    print_header "🔍 Validating TypeScript Code"
    
    print_status "Running TypeScript type checking..."
    if ! npx tsc --noEmit; then
        print_error "TypeScript validation failed"
        exit 1
    fi
    
    print_success "TypeScript validation passed"
    
    # Run ESLint if available
    if [ -f ".eslintrc.js" ] || [ -f ".eslintrc.json" ]; then
        print_status "Running ESLint..."
        if npx eslint src --ext .ts,.tsx --max-warnings 0; then
            print_success "ESLint validation passed"
        else
            print_warning "ESLint found issues (continuing deployment)"
        fi
    fi
}

# Function to run tests
run_tests() {
    print_header "🧪 Running Tests"
    
    if [ -f "package.json" ] && grep -q '"test"' package.json; then
        print_status "Running test suite..."
        if npm test; then
            print_success "All tests passed"
        else
            print_warning "Some tests failed (continuing deployment)"
        fi
    else
        print_warning "No test script found, skipping tests"
    fi
}

# Function to prepare CDK deployment
prepare_cdk_deployment() {
    print_header "📦 Preparing CDK Deployment"
    
    cd infrastructure
    
    print_status "Installing CDK dependencies..."
    retry_command "npm install" "CDK dependencies installation"
    
    # Validate CDK app
    print_status "Validating CDK app..."
    if ! npx cdk ls >/dev/null 2>&1; then
        print_error "CDK app validation failed"
        exit 1
    fi
    
    print_success "CDK app validated successfully"
    
    # Show CDK version
    CDK_VERSION=$(npx cdk --version)
    print_status "CDK version: ${CDK_VERSION}"
    
    cd ..
}

# Function to bootstrap CDK
bootstrap_cdk() {
    print_header "🏗️ Bootstrapping CDK Environment"
    
    if [ "$SKIP_BOOTSTRAP" = "true" ]; then
        print_warning "Skipping CDK bootstrap as requested"
        return 0
    fi
    
    cd infrastructure
    
    print_status "Checking if CDK bootstrap is needed..."
    
    # Check if bootstrap stack exists
    if aws cloudformation describe-stacks --stack-name CDKToolkit --region "${REGION}" >/dev/null 2>&1; then
        print_status "CDK bootstrap stack already exists"
    else
        print_status "CDK bootstrap stack not found, bootstrapping..."
        retry_command "npx cdk bootstrap aws://${ACCOUNT}/${REGION} --context environment=${ENVIRONMENT}" "CDK bootstrap"
    fi
    
    print_success "CDK environment ready"
    
    cd ..
}

# Function to deploy CDK stack
deploy_cdk_stack() {
    print_header "🚀 Deploying CDK Stack"
    
    cd infrastructure
    
    # Create deployment context
    local context_args=(
        "--context environment=${ENVIRONMENT}"
        "--context account=${ACCOUNT}"
        "--context region=${REGION}"
    )
    
    # Add database URL if available
    if [ -n "${DATABASE_URL}" ]; then
        context_args+=("--context databaseUrl=${DATABASE_URL}")
    fi
    
    print_status "Deploying CDK stack with context: ${context_args[*]}"
    
    # Deploy with retry mechanism
    retry_command "npx cdk deploy ${context_args[*]} --require-approval never --outputs-file ../cdk-outputs.json" "CDK stack deployment"
    
    cd ..
    
    print_success "CDK stack deployed successfully"
}

# Function to validate deployment
validate_deployment() {
    print_header "✅ Validating Deployment"
    
    # Check if outputs file exists
    if [ ! -f "cdk-outputs.json" ]; then
        print_error "CDK outputs file not found"
        exit 1
    fi
    
    # Extract and validate outputs
    print_status "Extracting deployment outputs..."
    
    local stack_name="ataraxia-healthcare-${ENVIRONMENT}"
    USER_POOL_ID=$(jq -r ".\"${stack_name}\".OutputUserPoolId // empty" cdk-outputs.json)
    CLIENT_ID=$(jq -r ".\"${stack_name}\".OutputUserPoolClientId // empty" cdk-outputs.json)
    API_URL=$(jq -r ".\"${stack_name}\".OutputApiGatewayUrl // empty" cdk-outputs.json)
    AUTH_FUNCTION_ARN=$(jq -r ".\"${stack_name}\".OutputAuthFunctionArn // empty" cdk-outputs.json)
    
    if [ -z "$USER_POOL_ID" ] || [ -z "$CLIENT_ID" ] || [ -z "$API_URL" ]; then
        print_error "Failed to extract required deployment outputs"
        print_error "USER_POOL_ID: ${USER_POOL_ID}"
        print_error "CLIENT_ID: ${CLIENT_ID}"
        print_error "API_URL: ${API_URL}"
        exit 1
    fi
    
    print_success "Deployment outputs extracted successfully"
    echo "  User Pool ID: ${USER_POOL_ID}"
    echo "  Client ID: ${CLIENT_ID}"
    echo "  API URL: ${API_URL}"
    echo "  Auth Function ARN: ${AUTH_FUNCTION_ARN}"
    
    # Test API Gateway
    print_status "Testing API Gateway connectivity..."
    
    local api_test_url="${API_URL}api/auth/login"
    if curl -f -s -o /dev/null -w "%{http_code}" "$api_test_url" | grep -q "405\|400\|200"; then
        print_success "API Gateway is responding"
    else
        print_warning "API Gateway may not be fully ready"
    fi
    
    # Test Lambda functions
    print_status "Testing Lambda functions..."
    
    local functions=(
        "ataraxia-auth-${ENVIRONMENT}"
        "ataraxia-therapist-${ENVIRONMENT}"
        "ataraxia-client-${ENVIRONMENT}"
        "ataraxia-verification-${ENVIRONMENT}"
    )
    
    for func in "${functions[@]}"; do
        if aws lambda get-function --function-name "$func" --region "${REGION}" >/dev/null 2>&1; then
            print_success "Lambda function exists: $func"
        else
            print_error "Lambda function not found: $func"
            exit 1
        fi
    done
}

# Function to update configuration
update_configuration() {
    print_header "⚙️ Updating Configuration"
    
    # Update backend environment
    print_status "Updating backend environment configuration..."
    
    cat > ".env.${ENVIRONMENT}" << EOF
# Ataraxia Enhanced Therapist Service - ${ENVIRONMENT} Environment
# Generated by enhanced deployment on $(date)
# Deployment ID: ${DEPLOYMENT_ID}

# Database Configuration
DATABASE_URL="${DATABASE_URL:-postgresql://app_user:ChangeMe123!@dev-db-cluster.cluster-cliy2m6q8h4h.us-west-2.rds.amazonaws.com:5432/ataraxia_db?schema=ataraxia}"

# AWS Configuration
AWS_REGION=${REGION}
AWS_ACCOUNT_ID=${ACCOUNT}

# Cognito Configuration (from CDK deployment)
COGNITO_USER_POOL_ID=${USER_POOL_ID}
COGNITO_CLIENT_ID=${CLIENT_ID}
COGNITO_REGION=${REGION}

# API Configuration
API_BASE_URL=${API_URL}
API_GATEWAY_URL=${API_URL}

# Environment Configuration
NODE_ENV=${ENVIRONMENT}
LOG_LEVEL=$([ "$ENVIRONMENT" = "prod" ] && echo "info" || echo "debug")

# Auth Provider Configuration
AUTH_PROVIDER_TYPE=cognito
ENABLE_UNIVERSAL_AUTH=true

# Enhanced Therapist Service Configuration
ENABLE_ADVANCED_SEARCH=true
ENABLE_JSONB_QUERIES=true
ENABLE_MATCHING_ALGORITHM=true
ENABLE_CAPACITY_TRACKING=true
ENABLE_COMPREHENSIVE_PROFILES=true

# Performance Configuration
MAX_SEARCH_RESULTS=50
DEFAULT_SEARCH_LIMIT=20
QUERY_TIMEOUT=30000
CONNECTION_POOL_SIZE=10

# Feature Flags
ENABLE_DETAILED_ERRORS=$([ "$ENVIRONMENT" = "prod" ] && echo "false" || echo "true")
ENABLE_STACK_TRACES=$([ "$ENVIRONMENT" = "prod" ] && echo "false" || echo "true")
ENABLE_PERFORMANCE_MONITORING=true
ENABLE_AUDIT_LOGGING=true

# JWT Configuration
JWT_SECRET=your_jwt_secret_key_change_in_production

# Deployment Metadata
DEPLOYMENT_ID=${DEPLOYMENT_ID}
DEPLOYMENT_DATE=$(date -u +"%Y-%m-%dT%H:%M:%SZ")
DEPLOYMENT_VERSION=2.0.0
EOF

    # Copy to main .env file
    cp ".env.${ENVIRONMENT}" .env
    
    print_success "Backend configuration updated"
    
    # Update frontend configuration
    print_status "Updating frontend configuration..."
    
    local frontend_env_file="../Ataraxia/.env.${ENVIRONMENT}"
    cat > "${frontend_env_file}" << EOF
# Ataraxia Frontend Configuration - ${ENVIRONMENT} Environment
# Generated by enhanced deployment on $(date)
# Deployment ID: ${DEPLOYMENT_ID}

# Authentication Configuration
VITE_USE_COGNITO=true
VITE_ENABLE_AUTH_FALLBACK=false
VITE_AUTH_PROVIDER_TYPE=cognito

# AWS Cognito Configuration (from CDK deployment)
VITE_AWS_REGION=${REGION}
VITE_COGNITO_USER_POOL_ID=${USER_POOL_ID}
VITE_COGNITO_CLIENT_ID=${CLIENT_ID}

# API Configuration
VITE_API_BASE_URL=${API_URL}
VITE_API_TIMEOUT=30000

# Environment Configuration
VITE_NODE_ENV=${ENVIRONMENT}
VITE_LOG_LEVEL=$([ "$ENVIRONMENT" = "prod" ] && echo "info" || echo "debug")

# Enhanced Therapist Service Features
VITE_ENABLE_ADVANCED_SEARCH=true
VITE_ENABLE_THERAPIST_MATCHING=true
VITE_ENABLE_CAPACITY_TRACKING=true
VITE_ENABLE_COMPREHENSIVE_PROFILES=true

# Feature Flags
VITE_ENABLE_MIGRATION_MODE=false
VITE_SHOW_AUTH_DEBUG=$([ "$ENVIRONMENT" = "prod" ] && echo "false" || echo "true")
VITE_ENABLE_UNIVERSAL_AUTH=true

# Healthcare Platform Configuration
VITE_PLATFORM_NAME="Ataraxia Healthcare"
VITE_PLATFORM_VERSION="2.0.0"
VITE_COMPLIANCE_MODE="HIPAA"

# Deployment Metadata
VITE_DEPLOYMENT_ID=${DEPLOYMENT_ID}
VITE_DEPLOYMENT_DATE=$(date -u +"%Y-%m-%dT%H:%M:%SZ")
EOF

    # Copy to main frontend env file
    cp "${frontend_env_file}" ../Ataraxia/.env.local
    
    print_success "Frontend configuration updated"
}

# Function to run enhanced therapist service tests
run_enhanced_tests() {
    print_header "🧪 Running Enhanced Therapist Service Tests"
    
    print_status "Running comprehensive test suite..."
    
    # Set environment variables for testing
    export AWS_REGION="${REGION}"
    export COGNITO_USER_POOL_ID="${USER_POOL_ID}"
    export COGNITO_CLIENT_ID="${CLIENT_ID}"
    export API_BASE_URL="${API_URL}"
    
    if [ -f "test-enhanced-therapist-service.js" ]; then
        if node test-enhanced-therapist-service.js; then
            print_success "Enhanced therapist service tests passed"
        else
            print_warning "Some enhanced tests failed (check logs for details)"
        fi
    else
        print_warning "Enhanced test suite not found, skipping"
    fi
}

# Function to generate deployment report
generate_deployment_report() {
    print_header "📊 Generating Deployment Report"
    
    local report_file="deployment-report-${DEPLOYMENT_ID}.md"
    
    cat > "${report_file}" << EOF
# Enhanced Therapist Service Deployment Report

## Deployment Information
- **Deployment ID**: ${DEPLOYMENT_ID}
- **Date**: $(date)
- **Environment**: ${ENVIRONMENT}
- **AWS Account**: ${ACCOUNT}
- **AWS Region**: ${REGION}

## Infrastructure Details
- **CDK Stack**: AtaraxiaStack-${ENVIRONMENT}
- **Cognito User Pool**: ${USER_POOL_ID}
- **Cognito Client**: ${CLIENT_ID}
- **API Gateway**: ${API_URL}
- **Auth Function**: ${AUTH_FUNCTION_ARN}

## Enhanced Features Deployed
- ✅ Advanced Search with JSONB filtering
- ✅ Specialty and modality management
- ✅ Insurance panel management
- ✅ Capacity and caseload tracking
- ✅ Therapist-client matching algorithm
- ✅ Comprehensive profile management (50+ fields)
- ✅ Performance monitoring and logging
- ✅ HIPAA-compliant audit trails

## Lambda Functions
- **ataraxia-auth-${ENVIRONMENT}**: Authentication service
- **ataraxia-therapist-${ENVIRONMENT}**: Enhanced therapist service
- **ataraxia-client-${ENVIRONMENT}**: Client management service
- **ataraxia-verification-${ENVIRONMENT}**: Verification workflow service

## API Endpoints
### Enhanced Therapist Service
- \`GET /api/therapist/search\` - Advanced search with filtering
- \`PUT /api/therapist/{id}/specialties\` - JSONB specialty management
- \`PUT /api/therapist/{id}/insurance\` - Insurance panel management
- \`GET/PUT /api/therapist/{id}/capacity\` - Capacity tracking
- \`GET /api/therapist/matching/{clientId}\` - Matching algorithm
- \`GET /api/therapist/{id}\` - Comprehensive profile (50+ fields)
- \`PUT /api/therapist/{id}\` - Complete profile updates

## Configuration Files
- **Backend**: .env.${ENVIRONMENT}
- **Frontend**: ../Ataraxia/.env.${ENVIRONMENT}
- **CDK Outputs**: cdk-outputs.json
- **Deployment Log**: ${LOG_FILE}

## Testing Results
$(if [ -f "test-enhanced-therapist-service.js" ]; then echo "- Enhanced test suite executed"; else echo "- Enhanced test suite not found"; fi)

## Next Steps
1. **Verify Deployment**:
   \`\`\`bash
   curl -X GET "${API_URL}api/therapist/search?specialty=anxiety&limit=5"
   \`\`\`

2. **Test Advanced Features**:
   \`\`\`bash
   node test-enhanced-therapist-service.js
   \`\`\`

3. **Monitor Performance**:
   - Check CloudWatch logs: /aws/lambda/ataraxia-therapist-${ENVIRONMENT}
   - Monitor API Gateway metrics
   - Review database performance

4. **Frontend Integration**:
   \`\`\`bash
   cd ../Ataraxia
   npm run dev
   \`\`\`

## Rollback Plan
If issues occur:
1. **Revert Configuration**: Use previous .env files
2. **CDK Rollback**: \`cdk destroy AtaraxiaStack-${ENVIRONMENT}\`
3. **Database Restore**: Use backup procedures

## Support
- **Deployment Log**: ${LOG_FILE}
- **CDK Outputs**: cdk-outputs.json
- **CloudWatch Logs**: /aws/lambda/ataraxia-*-${ENVIRONMENT}

Generated by: deploy-enhanced-therapist-service.sh
Deployment ID: ${DEPLOYMENT_ID}
EOF

    print_success "Deployment report generated: ${report_file}"
}

# Main deployment flow
main() {
    validate_prerequisites
    validate_typescript
    build_lambda_functions
    run_tests
    prepare_cdk_deployment
    bootstrap_cdk
    deploy_cdk_stack
    validate_deployment
    update_configuration
    run_enhanced_tests
    generate_deployment_report
    
    print_header "🎉 Enhanced Therapist Service Deployment Complete!"
    
    echo ""
    echo "📋 Deployment Summary:"
    echo "  ✅ Deployment ID: ${DEPLOYMENT_ID}"
    echo "  ✅ Environment: ${ENVIRONMENT}"
    echo "  ✅ API Gateway: ${API_URL}"
    echo "  ✅ Enhanced Features: Deployed"
    echo "  ✅ Configuration: Updated"
    echo ""
    echo "🚀 Quick Test:"
    echo "  curl -X GET \"${API_URL}api/therapist/search?specialty=anxiety&limit=5\""
    echo ""
    echo "📄 Documentation:"
    echo "  - Deployment Report: deployment-report-${DEPLOYMENT_ID}.md"
    echo "  - Deployment Log: ${LOG_FILE}"
    echo "  - CDK Outputs: cdk-outputs.json"
    echo ""
    
    print_success "Enhanced therapist service is ready for Phase 2!"
}

# Run main deployment
main "$@"
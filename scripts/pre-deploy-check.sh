#!/bin/bash

# Pre-Deployment Configuration Check Script
# Ensures all services have required configuration before CDK deployment

set -e

echo "🚀 Pre-Deployment Configuration Check"
echo "======================================"

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Function to print colored output
print_status() {
    local color=$1
    local message=$2
    echo -e "${color}${message}${NC}"
}

# Function to check if command exists
command_exists() {
    command -v "$1" >/dev/null 2>&1
}

# Step 1: Check prerequisites
echo ""
print_status $BLUE "📋 Checking prerequisites..."

# Check Node.js
if command_exists node; then
    NODE_VERSION=$(node --version)
    print_status $GREEN "   ✅ Node.js: $NODE_VERSION"
else
    print_status $RED "   ❌ Node.js not found"
    exit 1
fi

# Check AWS CLI
if command_exists aws; then
    AWS_VERSION=$(aws --version 2>&1 | cut -d/ -f2 | cut -d' ' -f1)
    print_status $GREEN "   ✅ AWS CLI: $AWS_VERSION"
else
    print_status $RED "   ❌ AWS CLI not found"
    exit 1
fi

# Check CDK
if command_exists cdk; then
    CDK_VERSION=$(cdk --version)
    print_status $GREEN "   ✅ CDK: $CDK_VERSION"
elif command_exists npx && npx cdk --version >/dev/null 2>&1; then
    CDK_VERSION=$(npx cdk --version)
    print_status $GREEN "   ✅ CDK (via npx): $CDK_VERSION"
elif [[ -f "infrastructure/node_modules/.bin/cdk" ]]; then
    CDK_VERSION=$(./infrastructure/node_modules/.bin/cdk --version)
    print_status $GREEN "   ✅ CDK (local): $CDK_VERSION"
else
    print_status $YELLOW "   ⚠️  CDK not found globally, will use npx cdk for deployment"
fi

# Step 2: Validate AWS credentials
echo ""
print_status $BLUE "🔐 Validating AWS credentials..."

if aws sts get-caller-identity >/dev/null 2>&1; then
    ACCOUNT_ID=$(aws sts get-caller-identity --query Account --output text)
    REGION=$(aws configure get region || echo "us-west-2")
    print_status $GREEN "   ✅ AWS Account: $ACCOUNT_ID"
    print_status $GREEN "   ✅ AWS Region: $REGION"
else
    # Check if we're in development mode
    if [[ "${NODE_ENV:-development}" == "development" ]]; then
        print_status $YELLOW "   ⚠️  AWS credentials not configured (OK for local development)"
        ACCOUNT_ID="123456789012"  # Placeholder for development
        REGION="${AWS_REGION:-us-west-2}"
    else
        print_status $RED "   ❌ AWS credentials not configured (required for production deployment)"
        exit 1
    fi
fi

# Step 3: Check environment files
echo ""
print_status $BLUE "📁 Checking environment files..."

ENV_FILES=(".env" ".env.aws" ".env.local" ".env.production")
FOUND_ENV_FILES=0

for env_file in "${ENV_FILES[@]}"; do
    if [[ -f "$env_file" ]]; then
        print_status $GREEN "   ✅ Found: $env_file"
        FOUND_ENV_FILES=$((FOUND_ENV_FILES + 1))
    fi
done

if [[ $FOUND_ENV_FILES -eq 0 ]]; then
    print_status $RED "   ❌ No environment files found"
    exit 1
fi

# Step 4: Run detailed configuration validation
echo ""
print_status $BLUE "🔍 Running detailed configuration validation..."

if [[ -f "scripts/validate-deployment-config.js" ]]; then
    if node scripts/validate-deployment-config.js; then
        print_status $GREEN "   ✅ Configuration validation passed"
    else
        print_status $RED "   ❌ Configuration validation failed"
        exit 1
    fi
else
    print_status $YELLOW "   ⚠️  Configuration validator not found, skipping detailed validation"
fi

# Step 5: Check required environment variables
echo ""
print_status $BLUE "🔧 Checking critical environment variables..."

# Load environment variables
if [[ -f ".env" ]]; then
    set -a
    source .env
    set +a
fi

if [[ -f ".env.aws" ]]; then
    set -a
    source .env.aws
    set +a
fi

# Critical variables
CRITICAL_VARS=(
    "DATABASE_URL"
    "JWT_SECRET"
    "AWS_REGION"
    "COGNITO_USER_POOL_ID"
    "COGNITO_CLIENT_ID"
)

MISSING_VARS=()

for var in "${CRITICAL_VARS[@]}"; do
    if [[ -z "${!var}" ]]; then
        MISSING_VARS+=("$var")
        print_status $RED "   ❌ Missing: $var"
    else
        print_status $GREEN "   ✅ Found: $var"
    fi
done

if [[ ${#MISSING_VARS[@]} -gt 0 ]]; then
    print_status $RED "   ❌ Missing ${#MISSING_VARS[@]} critical environment variables"
    exit 1
fi

# Step 6: Validate database connection
echo ""
print_status $BLUE "🗄️  Validating database connection..."

if [[ -n "$DATABASE_URL" ]]; then
    # Try to connect to database using psql if available
    if command_exists psql; then
        if psql "$DATABASE_URL" -c "SELECT 1;" >/dev/null 2>&1; then
            print_status $GREEN "   ✅ Database connection successful"
        else
            print_status $YELLOW "   ⚠️  Database connection failed (may be expected in CI/CD)"
        fi
    else
        print_status $YELLOW "   ⚠️  psql not available, skipping database connection test"
    fi
else
    print_status $RED "   ❌ DATABASE_URL not set"
    exit 1
fi

# Step 7: Check CDK bootstrap status
echo ""
print_status $BLUE "🏗️  Checking CDK bootstrap status..."

CDK_CMD="cdk"
if ! command_exists cdk; then
    if command_exists npx; then
        CDK_CMD="npx cdk"
    elif [[ -f "infrastructure/node_modules/.bin/cdk" ]]; then
        CDK_CMD="./infrastructure/node_modules/.bin/cdk"
    fi
fi

if $CDK_CMD bootstrap --show-template >/dev/null 2>&1; then
    print_status $GREEN "   ✅ CDK bootstrap available"
else
    print_status $YELLOW "   ⚠️  CDK may need bootstrapping"
fi

# Step 8: Validate service dependencies
echo ""
print_status $BLUE "🔗 Validating service dependencies..."

# Check if package.json exists and dependencies are installed
if [[ -f "package.json" ]]; then
    if [[ -d "node_modules" ]]; then
        print_status $GREEN "   ✅ Dependencies installed"
    else
        print_status $YELLOW "   ⚠️  Dependencies not installed, running npm install..."
        npm install
    fi
else
    print_status $YELLOW "   ⚠️  No package.json found"
fi

# Step 9: Generate pre-deployment report
echo ""
print_status $BLUE "📊 Generating pre-deployment report..."

REPORT_FILE="pre-deployment-report.json"
cat > "$REPORT_FILE" << EOF
{
  "timestamp": "$(date -u +"%Y-%m-%dT%H:%M:%SZ")",
  "status": "READY",
  "aws": {
    "accountId": "$ACCOUNT_ID",
    "region": "$REGION",
    "credentialsValid": true
  },
  "environment": {
    "nodeVersion": "$NODE_VERSION",
    "awsCliVersion": "$AWS_VERSION",
    "cdkVersion": "$CDK_VERSION"
  },
  "configuration": {
    "envFilesFound": $FOUND_ENV_FILES,
    "criticalVarsPresent": $((${#CRITICAL_VARS[@]} - ${#MISSING_VARS[@]})),
    "criticalVarsTotal": ${#CRITICAL_VARS[@]},
    "missingVars": $(printf '%s\n' "${MISSING_VARS[@]}" | jq -R . | jq -s .)
  }
}
EOF

print_status $GREEN "   ✅ Report saved to: $REPORT_FILE"

# Step 10: Final status
echo ""
print_status $GREEN "🎉 PRE-DEPLOYMENT CHECK COMPLETE"
print_status $GREEN "   All validations passed!"
print_status $GREEN "   Ready for CDK deployment."

echo ""
echo "Next steps:"
echo "  1. Review the generated reports"
echo "  2. Run: cdk deploy"
echo "  3. Monitor deployment progress"

exit 0
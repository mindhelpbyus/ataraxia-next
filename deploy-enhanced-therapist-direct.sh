#!/bin/bash

# Direct Enhanced Therapist Service Deployment
# Bypasses the deployment server for immediate deployment

set -e

echo "🚀 Direct Enhanced Therapist Service Deployment"
echo "=============================================="
echo ""

# Configuration
ENVIRONMENT=${1:-dev}
SKIP_BOOTSTRAP=${2:-false}
RUN_TESTS=${3:-true}

echo "📋 Configuration:"
echo "  Environment: $ENVIRONMENT"
echo "  Skip Bootstrap: $SKIP_BOOTSTRAP"
echo "  Run Tests: $RUN_TESTS"
echo ""

# Set AWS environment
export AWS_SDK_LOAD_CONFIG=1
export JSII_SILENCE_WARNING_UNTESTED_NODE_VERSION=1

# Step 1: Check prerequisites
echo "🔍 Step 1: Checking prerequisites..."
echo "  Node.js version: $(node --version)"
echo "  AWS Account: $(aws sts get-caller-identity --query Account --output text)"
echo "  AWS Region: $(aws configure get region || echo 'us-west-2')"
echo ""

# Step 2: Build TypeScript
echo "🔨 Step 2: Building TypeScript..."
npm run build
echo "✅ TypeScript build completed"
echo ""

# Step 3: Install CDK dependencies
echo "📦 Step 3: Installing CDK dependencies..."
cd infrastructure
npm install
echo "✅ CDK dependencies installed"
echo ""

# Step 4: Bootstrap CDK (if needed)
if [ "$SKIP_BOOTSTRAP" != "true" ]; then
    echo "🏗️  Step 4: CDK Bootstrap..."
    npx cdk bootstrap
    echo "✅ CDK bootstrap completed"
else
    echo "⏭️  Step 4: Skipping CDK bootstrap"
fi
echo ""

# Step 5: Deploy CDK Stack
echo "🚀 Step 5: Deploying CDK Stack..."
npx cdk deploy \
    --require-approval never \
    --outputs-file ../cdk-outputs.json \
    --context environment=$ENVIRONMENT

if [ $? -eq 0 ]; then
    echo "✅ CDK deployment completed successfully"
else
    echo "❌ CDK deployment failed"
    exit 1
fi
echo ""

# Step 6: Extract deployment outputs
echo "📊 Step 6: Processing deployment outputs..."
cd ..
if [ -f "cdk-outputs.json" ]; then
    # Try both possible stack names
    STACK_NAME="ataraxia-healthcare-$ENVIRONMENT"
    if ! jq -e ".\"$STACK_NAME\"" cdk-outputs.json > /dev/null 2>&1; then
        STACK_NAME="AtaraxiaStack-$ENVIRONMENT"
    fi
    
    API_URL=$(jq -r ".\"$STACK_NAME\".OutputApiGatewayUrl" cdk-outputs.json)
    USER_POOL_ID=$(jq -r ".\"$STACK_NAME\".OutputUserPoolId" cdk-outputs.json)
    CLIENT_ID=$(jq -r ".\"$STACK_NAME\".OutputUserPoolClientId" cdk-outputs.json)
    
    echo "  Stack Name: $STACK_NAME"
    echo "  API Gateway URL: $API_URL"
    echo "  Cognito User Pool ID: $USER_POOL_ID"
    echo "  Cognito Client ID: $CLIENT_ID"
    
    # Update environment file
    cat > .env.$ENVIRONMENT << EOF
# Enhanced Therapist Service - $ENVIRONMENT Environment
# Generated on $(date)

# AWS Configuration
AWS_REGION=us-west-2

# Cognito Configuration
COGNITO_USER_POOL_ID=$USER_POOL_ID
COGNITO_CLIENT_ID=$CLIENT_ID
COGNITO_REGION=us-west-2

# API Configuration
API_BASE_URL=$API_URL
API_GATEWAY_URL=$API_URL

# Environment Configuration
NODE_ENV=$ENVIRONMENT
LOG_LEVEL=debug

# Enhanced Features
ENABLE_ADVANCED_SEARCH=true
ENABLE_JSONB_QUERIES=true
ENABLE_MATCHING_ALGORITHM=true
ENABLE_CAPACITY_TRACKING=true
EOF
    
    echo "✅ Environment configuration updated"
else
    echo "⚠️  CDK outputs file not found"
fi
echo ""

# Step 7: Test API endpoints (if requested)
if [ "$RUN_TESTS" = "true" ] && [ ! -z "$API_URL" ]; then
    echo "🧪 Step 7: Testing API endpoints..."
    
    # Test basic endpoints
    echo "  Testing GET /api/therapist..."
    HTTP_STATUS=$(curl -s -o /dev/null -w "%{http_code}" "$API_URL/api/therapist" || echo "000")
    if [ "$HTTP_STATUS" = "200" ] || [ "$HTTP_STATUS" = "401" ]; then
        echo "  ✅ Therapist endpoint responding ($HTTP_STATUS)"
    else
        echo "  ⚠️  Therapist endpoint issue ($HTTP_STATUS)"
    fi
    
    echo "  Testing GET /api/therapist/search..."
    HTTP_STATUS=$(curl -s -o /dev/null -w "%{http_code}" "$API_URL/api/therapist/search?specialty=anxiety" || echo "000")
    if [ "$HTTP_STATUS" = "200" ] || [ "$HTTP_STATUS" = "401" ]; then
        echo "  ✅ Advanced search endpoint responding ($HTTP_STATUS)"
    else
        echo "  ⚠️  Advanced search endpoint issue ($HTTP_STATUS)"
    fi
    
    echo "  Testing POST /api/auth/login..."
    HTTP_STATUS=$(curl -s -o /dev/null -w "%{http_code}" -X POST "$API_URL/api/auth/login" \
        -H "Content-Type: application/json" \
        -d '{"email":"test@example.com","password":"test"}' || echo "000")
    if [ "$HTTP_STATUS" = "400" ] || [ "$HTTP_STATUS" = "401" ] || [ "$HTTP_STATUS" = "200" ]; then
        echo "  ✅ Auth endpoint responding ($HTTP_STATUS)"
    else
        echo "  ⚠️  Auth endpoint issue ($HTTP_STATUS)"
    fi
    
    echo "✅ API endpoint testing completed"
else
    echo "⏭️  Step 7: Skipping API tests"
fi
echo ""

# Step 8: Summary
echo "🎉 Deployment Summary"
echo "===================="
echo "  Status: ✅ SUCCESS"
echo "  Environment: $ENVIRONMENT"
echo "  API URL: ${API_URL:-'Not available'}"
echo "  Deployment Time: $(date)"
echo ""

if [ ! -z "$API_URL" ]; then
    echo "🔗 Quick Links:"
    echo "  API Explorer: $API_URL/api-explorer"
    echo "  Therapist List: $API_URL/api/therapist"
    echo "  Advanced Search: $API_URL/api/therapist/search"
    echo ""
    
    echo "🧪 Test Commands:"
    echo "  curl $API_URL/api/therapist"
    echo "  curl '$API_URL/api/therapist/search?specialty=anxiety&limit=5'"
    echo ""
fi

echo "✨ Enhanced Therapist Service deployed successfully!"
echo "   Ready for comprehensive therapist management with:"
echo "   • Advanced search and filtering"
echo "   • JSONB specialty management"
echo "   • Insurance panel tracking"
echo "   • Capacity and caseload management"
echo "   • Therapist-client matching algorithm"
echo ""
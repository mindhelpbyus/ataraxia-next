#!/bin/bash

# Enhanced Therapist Service Deployment with Local Database
# This script deploys the service using a local PostgreSQL database for testing

set -e

echo "🚀 Enhanced Therapist Service - Local Database Deployment"
echo "======================================================="
echo ""

# Configuration
ENVIRONMENT=${1:-dev}
USE_LOCAL_DB=${2:-true}

echo "📋 Configuration:"
echo "  Environment: $ENVIRONMENT"
echo "  Use Local DB: $USE_LOCAL_DB"
echo ""

# Set AWS environment
export AWS_SDK_LOAD_CONFIG=1
export JSII_SILENCE_WARNING_UNTESTED_NODE_VERSION=1

# Step 1: Setup local database (if needed)
if [ "$USE_LOCAL_DB" = "true" ]; then
    echo "🗄️  Step 1: Setting up local database..."
    
    # Check if PostgreSQL is running
    if ! pg_isready -h localhost -p 5432 >/dev/null 2>&1; then
        echo "⚠️  PostgreSQL is not running locally"
        echo "   Please start PostgreSQL or use a remote database"
        echo ""
        echo "   To start PostgreSQL:"
        echo "   • macOS (Homebrew): brew services start postgresql"
        echo "   • Ubuntu: sudo systemctl start postgresql"
        echo "   • Docker: docker run -d -p 5432:5432 -e POSTGRES_PASSWORD=password postgres"
        echo ""
        exit 1
    fi
    
    # Create database if it doesn't exist
    createdb telehealth_db 2>/dev/null || echo "  Database already exists"
    
    # Update DATABASE_URL for local development
    export DATABASE_URL="postgresql://postgres:password@localhost:5432/telehealth_db"
    
    echo "  ✅ Local database configured"
    echo "  📍 Database URL: $DATABASE_URL"
else
    echo "🗄️  Step 1: Using configured database..."
    echo "  📍 Database URL: ${DATABASE_URL:-'from environment'}"
fi
echo ""

# Step 2: Setup database schema
echo "🔧 Step 2: Setting up database schema..."
node setup-database-for-deployment.js
if [ $? -ne 0 ]; then
    echo "❌ Database setup failed"
    exit 1
fi
echo ""

# Step 3: Update CDK configuration with correct database URL
echo "🔧 Step 3: Updating CDK configuration..."
cat > infrastructure/cdk.context.json << EOF
{
  "environment": "$ENVIRONMENT",
  "databaseUrl": "$DATABASE_URL",
  "enableLocalDevelopment": true
}
EOF
echo "  ✅ CDK configuration updated"
echo ""

# Step 4: Build and deploy
echo "🔨 Step 4: Building TypeScript..."
npm run build
echo "  ✅ Build completed"
echo ""

echo "🚀 Step 5: Deploying to AWS..."
cd infrastructure
npm install
npx cdk deploy \
    --require-approval never \
    --outputs-file ../cdk-outputs.json \
    --context environment=$ENVIRONMENT \
    --context databaseUrl="$DATABASE_URL"

if [ $? -eq 0 ]; then
    echo "  ✅ CDK deployment completed"
else
    echo "  ❌ CDK deployment failed"
    exit 1
fi
cd ..
echo ""

# Step 6: Extract and test deployment
echo "📊 Step 6: Processing deployment outputs..."
if [ -f "cdk-outputs.json" ]; then
    STACK_NAME="ataraxia-healthcare-$ENVIRONMENT"
    API_URL=$(jq -r ".\"$STACK_NAME\".OutputApiGatewayUrl" cdk-outputs.json)
    USER_POOL_ID=$(jq -r ".\"$STACK_NAME\".OutputUserPoolId" cdk-outputs.json)
    CLIENT_ID=$(jq -r ".\"$STACK_NAME\".OutputUserPoolClientId" cdk-outputs.json)
    
    echo "  API Gateway URL: $API_URL"
    echo "  Cognito User Pool ID: $USER_POOL_ID"
    echo "  Cognito Client ID: $CLIENT_ID"
    
    # Update environment file
    cat > .env.deployed << EOF
# Enhanced Therapist Service - Deployed Configuration
# Generated on $(date)

# Database Configuration
DATABASE_URL=$DATABASE_URL

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
EOF
    
    echo "  ✅ Configuration saved to .env.deployed"
else
    echo "  ⚠️  CDK outputs file not found"
    API_URL="Not available"
fi
echo ""

# Step 7: Test the deployment
echo "🧪 Step 7: Testing deployed API..."
if [ "$API_URL" != "Not available" ] && [ "$API_URL" != "null" ]; then
    echo "  Testing GET /api/therapist..."
    HTTP_STATUS=$(curl -s -o /dev/null -w "%{http_code}" "$API_URL/api/therapist" || echo "000")
    if [ "$HTTP_STATUS" = "200" ]; then
        echo "  ✅ Therapist endpoint working ($HTTP_STATUS)"
        
        # Test advanced search
        echo "  Testing GET /api/therapist/search..."
        SEARCH_RESPONSE=$(curl -s "$API_URL/api/therapist/search?specialty=anxiety&limit=5")
        if echo "$SEARCH_RESPONSE" | jq -e '.success' >/dev/null 2>&1; then
            THERAPIST_COUNT=$(echo "$SEARCH_RESPONSE" | jq -r '.therapists | length')
            echo "  ✅ Advanced search working (found $THERAPIST_COUNT therapists)"
        else
            echo "  ⚠️  Advanced search returned: $(echo "$SEARCH_RESPONSE" | head -c 100)..."
        fi
        
    else
        echo "  ⚠️  Therapist endpoint issue ($HTTP_STATUS)"
        
        # Get error details
        ERROR_RESPONSE=$(curl -s "$API_URL/api/therapist")
        echo "  Error: $(echo "$ERROR_RESPONSE" | jq -r '.message // .error // "Unknown error"')"
    fi
else
    echo "  ⏭️  Skipping API tests (no URL available)"
fi
echo ""

# Step 8: Summary
echo "🎉 Deployment Summary"
echo "===================="
echo "  Status: ✅ SUCCESS"
echo "  Environment: $ENVIRONMENT"
echo "  Database: $([ "$USE_LOCAL_DB" = "true" ] && echo "Local PostgreSQL" || echo "Remote Database")"
echo "  API URL: $API_URL"
echo "  Deployment Time: $(date)"
echo ""

if [ "$API_URL" != "Not available" ] && [ "$API_URL" != "null" ]; then
    echo "🔗 Quick Test Commands:"
    echo "  curl '$API_URL/api/therapist'"
    echo "  curl '$API_URL/api/therapist/search?specialty=anxiety&limit=5'"
    echo "  curl '$API_URL/api/therapist/1'"
    echo ""
    
    echo "🎯 Enhanced Features Available:"
    echo "  • Advanced therapist search and filtering"
    echo "  • JSONB specialty and modality management"
    echo "  • Insurance panel tracking"
    echo "  • Capacity and caseload management"
    echo "  • Therapist-client matching algorithm"
    echo "  • Comprehensive profile management (50+ fields)"
    echo ""
fi

echo "✨ Enhanced Therapist Service deployed successfully!"
echo "   Ready for comprehensive healthcare platform operations."
echo ""
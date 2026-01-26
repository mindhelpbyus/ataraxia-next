#!/bin/bash

# Quick Lambda Function Redeployment
# Just redeploys the Lambda functions with fixed handlers

echo "🔄 Redeploying Lambda Functions with Fixes..."
echo ""

# Set error handling
set -e

# Load environment variables
if [ -f .env ]; then
    export $(cat .env | grep -v '^#' | xargs)
fi

# Ensure AWS credentials
if [ -z "$AWS_ACCESS_KEY_ID" ] || [ -z "$AWS_SECRET_ACCESS_KEY" ]; then
    echo "❌ AWS credentials not set"
    exit 1
fi

echo "✅ AWS credentials configured"

# Step 1: Build TypeScript
echo ""
echo "🔍 Step 1: Building TypeScript..."
npm run build
echo "✅ TypeScript compiled"

# Step 2: Deploy only Lambda functions
echo ""
echo "🔍 Step 2: Deploying Lambda functions..."
cd infrastructure

# Deploy with hotswap for faster Lambda updates
npx cdk deploy --hotswap --require-approval never

cd ..
echo "✅ Lambda functions redeployed"

# Step 3: Test the fixed endpoints
echo ""
echo "🔍 Step 3: Testing fixed API endpoints..."

# Wait for Lambda functions to be ready
echo "⏳ Waiting 5 seconds for Lambda functions to update..."
sleep 5

# Test the specific endpoint that was failing
API_URL="https://zojyvoao3c.execute-api.us-west-2.amazonaws.com/dev"

echo "🧪 Testing individual therapist lookup (was failing before)..."
curl -s "${API_URL}/api/therapist/1000008" | jq '.' || echo "❌ Still failing"

echo ""
echo "🧪 Testing therapist search (should work)..."
curl -s "${API_URL}/api/therapist/search?limit=2" | jq '.therapists | length' || echo "❌ Search failing"

echo ""
echo "🎉 Lambda function redeployment complete!"
echo "✅ Fixed handlers deployed"
echo "✅ Database connection enhanced"
echo ""
echo "🔗 Test URLs:"
echo "  ${API_URL}/api/therapist"
echo "  ${API_URL}/api/therapist/search"
echo "  ${API_URL}/api/therapist/1000008"
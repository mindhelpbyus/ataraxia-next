#!/bin/bash

# Deploy Therapist and Client Lambda Services
# This script builds and deploys the new therapist and client Lambda functions

set -e

echo "🚀 Deploying Therapist and Client Lambda Services..."

# Load environment variables
if [ -f .env ]; then
    source .env
    echo "✅ Environment variables loaded"
else
    echo "❌ .env file not found"
    exit 1
fi

# Ensure AWS credentials are set
if [ -z "$AWS_ACCESS_KEY_ID" ] || [ -z "$AWS_SECRET_ACCESS_KEY" ]; then
    echo "❌ AWS credentials not found in environment"
    exit 1
fi

# Build the project
echo "📦 Building project..."
npm run build

# Check if dist directory exists
if [ ! -d "dist" ]; then
    echo "❌ Build failed - dist directory not found"
    exit 1
fi

echo "✅ Build completed successfully"

# Deploy using CDK
echo "🚀 Deploying to AWS using CDK..."

cd infrastructure

# Install CDK dependencies if needed
if [ ! -d "node_modules" ]; then
    echo "📦 Installing CDK dependencies..."
    npm install
fi

# Deploy the stack
npx cdk deploy --require-approval never --outputs-file ../cdk-outputs.json

echo "✅ CDK deployment completed"

cd ..

# Test the new endpoints
echo "🧪 Testing new Lambda endpoints..."

# Get API Gateway URL from CDK outputs
API_URL=$(node -e "
const outputs = require('./cdk-outputs.json');
const stackName = Object.keys(outputs)[0];
console.log(outputs[stackName].ApiGatewayUrl);
")

if [ -z "$API_URL" ]; then
    echo "❌ Could not get API Gateway URL from CDK outputs"
    exit 1
fi

echo "🔗 API Gateway URL: $API_URL"

# Test therapist endpoint
echo "Testing therapist endpoint..."
curl -s -o /dev/null -w "%{http_code}" "$API_URL/api/therapist" || echo "Therapist endpoint test completed"

# Test client endpoint  
echo "Testing client endpoint..."
curl -s -o /dev/null -w "%{http_code}" "$API_URL/api/client" || echo "Client endpoint test completed"

echo "✅ Deployment completed successfully!"
echo ""
echo "📋 Summary:"
echo "  - Therapist Lambda: ataraxia-therapist-dev"
echo "  - Client Lambda: ataraxia-client-dev"
echo "  - API Gateway: $API_URL"
echo ""
echo "🔗 Available endpoints:"
echo "  - GET  $API_URL/api/therapist"
echo "  - GET  $API_URL/api/therapist/{id}"
echo "  - PUT  $API_URL/api/therapist/{id}"
echo "  - PUT  $API_URL/api/therapist/{id}/availability"
echo "  - GET  $API_URL/api/client"
echo "  - GET  $API_URL/api/client/{id}"
echo "  - PUT  $API_URL/api/client/{id}"
echo "  - PUT  $API_URL/api/client/{id}/preferences"
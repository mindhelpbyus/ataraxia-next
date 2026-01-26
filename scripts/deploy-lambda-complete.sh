#!/bin/bash

# Complete Lambda Deployment Script
# Builds, packages, and deploys the Lambda function with all dependencies

set -e

echo "🚀 Starting complete Lambda deployment..."

# Set AWS credentials from .env
source .env

# 1. Clean previous builds
echo "🧹 Cleaning previous builds..."
rm -rf dist/lambdas/auth/node_modules
rm -rf dist/lambdas/auth/package.json
rm -f lambda-complete-*.zip

# 2. Build TypeScript
echo "📦 Building TypeScript..."
npx tsc --project tsconfig.json

# 3. Copy shared dependencies to Lambda directory (fix relative imports)
echo "📄 Copying shared modules to Lambda directory..."
cp dist/lib/database.js dist/lambdas/auth/lib/
cp dist/lib/database.d.ts dist/lambdas/auth/lib/ 2>/dev/null || true
cp dist/shared/logger.js dist/lambdas/auth/shared/
cp dist/shared/logger.d.ts dist/lambdas/auth/shared/ 2>/dev/null || true
cp dist/shared/response.js dist/lambdas/auth/shared/
cp dist/shared/response.d.ts dist/lambdas/auth/shared/ 2>/dev/null || true

# 4. Create minimal package.json for Lambda
echo "📄 Creating Lambda package.json..."
cat > dist/lambdas/auth/package.json << 'EOF'
{
  "name": "ataraxia-auth-lambda",
  "version": "1.0.0",
  "main": "handler.js",
  "dependencies": {
    "pg": "^8.11.3",
    "jsonwebtoken": "^9.0.2",
    "@aws-sdk/client-cognito-identity-provider": "^3.0.0",
    "@aws-sdk/client-secrets-manager": "^3.0.0"
  }
}
EOF

# 5. Install dependencies in Lambda directory
echo "📦 Installing Lambda dependencies..."
cd dist/lambdas/auth
npm install --production --no-package-lock --no-optional
cd ../../..

# 6. Create deployment package
echo "📦 Creating deployment package..."
cd dist/lambdas/auth
zip -r ../../../lambda-complete-v3.zip . -x "*.d.ts" "*.map"
cd ../../..

# 7. Deploy to AWS Lambda
echo "🚀 Deploying to AWS Lambda..."
aws lambda update-function-code \
    --function-name ataraxia-auth-dev \
    --zip-file fileb://lambda-complete-v3.zip

echo "✅ Lambda deployment completed successfully!"

# 8. Test the deployment
echo "🧪 Testing Lambda function..."
aws lambda invoke \
    --function-name ataraxia-auth-dev \
    --payload '{"httpMethod":"GET","path":"/api/auth/test","requestContext":{"requestId":"test-123"}}' \
    test-response.json

echo "📋 Lambda response:"
cat test-response.json
rm test-response.json

echo "🎉 Deployment and test completed!"
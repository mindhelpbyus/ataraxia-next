#!/bin/bash

# Deploy Cognito User Pool for Ataraxia Healthcare Platform
# This script deploys only the Cognito resources for initial setup

set -e

ENVIRONMENT=${1:-local}
STACK_NAME="ataraxia-next-cognito-${ENVIRONMENT}"
REGION=${AWS_REGION:-us-west-2}

echo "🚀 Deploying Cognito User Pool for Ataraxia Healthcare Platform"
echo "Environment: ${ENVIRONMENT}"
echo "Region: ${REGION}"
echo "Stack: ${STACK_NAME}"

# Build the project first
echo "📦 Building project..."
npm run build

# Deploy using SAM
echo "🏗️  Deploying Cognito infrastructure..."
sam deploy \
  --template-file template.yaml \
  --stack-name ${STACK_NAME} \
  --parameter-overrides Environment=${ENVIRONMENT} \
  --capabilities CAPABILITY_IAM \
  --region ${REGION} \
  --no-fail-on-empty-changeset

# Get the outputs
echo "📋 Getting Cognito configuration..."
USER_POOL_ID=$(aws cloudformation describe-stacks \
  --stack-name ${STACK_NAME} \
  --region ${REGION} \
  --query 'Stacks[0].Outputs[?OutputKey==`CognitoUserPoolId`].OutputValue' \
  --output text)

CLIENT_ID=$(aws cloudformation describe-stacks \
  --stack-name ${STACK_NAME} \
  --region ${REGION} \
  --query 'Stacks[0].Outputs[?OutputKey==`CognitoClientId`].OutputValue' \
  --output text)

API_ENDPOINT=$(aws cloudformation describe-stacks \
  --stack-name ${STACK_NAME} \
  --region ${REGION} \
  --query 'Stacks[0].Outputs[?OutputKey==`ApiGatewayEndpoint`].OutputValue' \
  --output text)

echo ""
echo "✅ Deployment complete!"
echo ""
echo "🔐 Cognito Configuration:"
echo "User Pool ID: ${USER_POOL_ID}"
echo "Client ID: ${CLIENT_ID}"
echo "Region: ${REGION}"
echo ""
echo "🌐 API Endpoint:"
echo "${API_ENDPOINT}"
echo ""
echo "📝 Update your .env file with these values:"
echo "COGNITO_USER_POOL_ID=${USER_POOL_ID}"
echo "COGNITO_CLIENT_ID=${CLIENT_ID}"
echo "COGNITO_REGION=${REGION}"
echo "API_BASE_URL=${API_ENDPOINT}"
echo ""
echo "🎯 Next steps:"
echo "1. Update your .env file with the values above"
echo "2. Test the auth endpoints with your frontend"
echo "3. Create admin users if needed"
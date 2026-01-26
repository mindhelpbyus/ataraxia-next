#!/bin/bash

# AWS Credentials Setup Script
# This script helps you set up AWS credentials for the Cognito migration

echo "🔧 AWS Credentials Setup for Ataraxia Cognito Migration"
echo "======================================================"

# Check if AWS CLI is installed
if ! command -v aws &> /dev/null; then
    echo "❌ AWS CLI is not installed. Please install it first:"
    echo "   brew install awscli"
    exit 1
fi

echo "✅ AWS CLI is installed"

# Option 1: Use environment variables
echo ""
echo "📋 Option 1: Set AWS credentials as environment variables"
echo "You can set these in your terminal:"
echo ""
echo "export AWS_ACCESS_KEY_ID='your-access-key-id'"
echo "export AWS_SECRET_ACCESS_KEY='your-secret-access-key'"
echo "export AWS_DEFAULT_REGION='us-west-2'"
echo ""

# Option 2: Use aws configure
echo "📋 Option 2: Use AWS configure command"
echo "Run this command and enter your credentials:"
echo ""
echo "aws configure"
echo ""
echo "You'll need:"
echo "  - AWS Access Key ID"
echo "  - AWS Secret Access Key"
echo "  - Default region: us-west-2"
echo "  - Default output format: json"
echo ""

# Option 3: Create credentials file manually
echo "📋 Option 3: Create credentials file manually"
echo ""
echo "Create ~/.aws/credentials file with:"
echo ""
echo "[default]"
echo "aws_access_key_id = your-access-key-id"
echo "aws_secret_access_key = your-secret-access-key"
echo ""
echo "Create ~/.aws/config file with:"
echo ""
echo "[default]"
echo "region = us-west-2"
echo "output = json"
echo ""

# Test current configuration
echo "🔍 Current AWS Configuration:"
aws configure list 2>/dev/null || echo "No AWS credentials configured"

echo ""
echo "💡 To get AWS credentials:"
echo "  1. Go to AWS Console: https://console.aws.amazon.com"
echo "  2. Navigate to IAM → Users → Your User → Security credentials"
echo "  3. Click 'Create access key'"
echo "  4. Copy the Access Key ID and Secret Access Key"
echo ""

echo "🚀 After setting up credentials, run:"
echo "  ./scripts/complete-cognito-migration.sh"
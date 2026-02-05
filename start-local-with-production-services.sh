#!/bin/bash

# Ataraxia-Next Local Development with REAL Production Services
# Uses real AWS database, Firebase, and Cognito for comprehensive testing

set -e

echo "🚀 Starting Ataraxia-Next Local Development with REAL Production Services..."
echo "📊 Database: Real AWS RDS PostgreSQL"
echo "🔥 Firebase: Real Production Firebase (ataraxia-c150f)"
echo "🔐 Cognito: Real Production Cognito (us-west-2_xeXlyFBMH)"
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

# Check prerequisites
print_status "Checking prerequisites..."

# Check if AWS CLI is configured
if ! aws sts get-caller-identity &>/dev/null; then
    print_error "AWS CLI not configured or credentials invalid"
    print_status "Please run: aws configure"
    exit 1
fi

print_success "AWS CLI configured"

# Check if SAM CLI is installed
if ! command -v sam &> /dev/null; then
    print_error "SAM CLI not installed"
    print_status "Please install SAM CLI: https://docs.aws.amazon.com/serverless-application-model/latest/developerguide/serverless-sam-cli-install.html"
    exit 1
fi

print_success "SAM CLI found"

# Check if Node.js and npm are available
if ! command -v node &> /dev/null; then
    print_error "Node.js not installed"
    exit 1
fi

if ! command -v npm &> /dev/null; then
    print_error "npm not installed"
    exit 1
fi

print_success "Node.js and npm found"

# Use production environment configuration
print_status "Using production services configuration..."
cp .env.local.production .env.local

# Install dependencies
print_status "Installing dependencies..."
npm install

# Generate Prisma client
print_status "Generating Prisma client..."
npm run prisma:generate

# Build the project
print_status "Building TypeScript..."
npm run build

if [ $? -ne 0 ]; then
    print_error "Build failed. Please fix TypeScript errors."
    exit 1
fi

print_success "Build completed successfully"

# Create logs directory
mkdir -p logs

# Test database connection
print_status "Testing database connection..."
if npm run prisma:pull &>/dev/null; then
    print_success "Database connection successful"
else
    print_warning "Database connection test failed, but continuing..."
fi

# Start SAM local with production services
print_status "Starting SAM Local API with production services..."
print_status "🌐 API will be available at: http://localhost:3001"
print_status "📊 Using real AWS RDS database"
print_status "🔥 Using real Firebase authentication"
print_status "🔐 Using real Cognito authentication"
print_status ""
print_warning "⚠️  This will interact with REAL production data!"
print_status ""

# Create a comprehensive template override for local development
cat > template.local.yaml << EOF
AWSTemplateFormatVersion: '2010-09-09'
Transform: AWS::Serverless-2016-10-31
Description: Ataraxia-Next Local Development with Production Services

Globals:
  Function:
    Timeout: 30
    MemorySize: 512
    Runtime: nodejs18.x
    Environment:
      Variables:
        NODE_ENV: development
        LOG_LEVEL: debug
        # Real Production Database
        DATABASE_URL: "postgresql://app_user:ChangeMe123!@dev-db-cluster.cluster-cliy2m6q8h4h.us-west-2.rds.amazonaws.com:5432/ataraxia_db?schema=ataraxia"
        # Real Cognito
        COGNITO_USER_POOL_ID: "us-west-2_xeXlyFBMH"
        COGNITO_CLIENT_ID: "7ek8kg1td2ps985r21m7727q98"
        COGNITO_REGION: "us-west-2"
        # Real Firebase
        FIREBASE_PROJECT_ID: "ataraxia-c150f"
        FIREBASE_CLIENT_EMAIL: "firebase-adminsdk-fbsvc@ataraxia-c150f.iam.gserviceaccount.com"
        FIREBASE_API_KEY: "AIzaSyCM2W8UE5gJekK2vV2d-UE5fVe3ZXzk1vQ"
        # Auth Configuration
        AUTH_PROVIDER_TYPE: "firebase"
        ENABLE_UNIVERSAL_AUTH: "true"
        JWT_SECRET: "your_jwt_secret_key_change_in_production"
        # Local API
        API_BASE_URL: "http://localhost:3001"
        FRONTEND_URL: "http://localhost:3000"
        # Security
        ENABLE_DETAILED_ERRORS: "true"
        ENABLE_MFA: "true"
        # AWS Region
        AWS_REGION: "us-west-2"
  
  Api:
    Cors:
      AllowMethods: "'GET,POST,PUT,DELETE,OPTIONS'"
      AllowHeaders: "'Content-Type,X-Amz-Date,Authorization,X-Api-Key,X-Amz-Security-Token,X-Request-ID'"
      AllowOrigin: "'*'"

Resources:
  AtaraxiaApi:
    Type: AWS::Serverless::Api
    Properties:
      StageName: local
      Name: ataraxia-next-api-local

  AuthFunction:
    Type: AWS::Serverless::Function
    Properties:
      FunctionName: local-ataraxia-auth
      CodeUri: dist/lambdas/auth/
      Handler: handler.handler
      Description: Auth service with real production services
      Events:
        # Authentication endpoints
        Login:
          Type: Api
          Properties:
            RestApiId: !Ref AtaraxiaApi
            Path: /auth/login
            Method: POST
        FirebaseLogin:
          Type: Api
          Properties:
            RestApiId: !Ref AtaraxiaApi
            Path: /auth/firebase-login
            Method: POST
        Register:
          Type: Api
          Properties:
            RestApiId: !Ref AtaraxiaApi
            Path: /auth/register
            Method: POST
        Confirm:
          Type: Api
          Properties:
            RestApiId: !Ref AtaraxiaApi
            Path: /auth/confirm
            Method: POST
        ResendCode:
          Type: Api
          Properties:
            RestApiId: !Ref AtaraxiaApi
            Path: /auth/resend-code
            Method: POST
        ForgotPassword:
          Type: Api
          Properties:
            RestApiId: !Ref AtaraxiaApi
            Path: /auth/forgot-password
            Method: POST
        RequestPasswordReset:
          Type: Api
          Properties:
            RestApiId: !Ref AtaraxiaApi
            Path: /auth/request-password-reset
            Method: POST
        ResetPassword:
          Type: Api
          Properties:
            RestApiId: !Ref AtaraxiaApi
            Path: /auth/reset-password
            Method: POST
        ConfirmNewPassword:
          Type: Api
          Properties:
            RestApiId: !Ref AtaraxiaApi
            Path: /auth/confirm-new-password
            Method: POST
        Refresh:
          Type: Api
          Properties:
            RestApiId: !Ref AtaraxiaApi
            Path: /auth/refresh
            Method: POST
        Logout:
          Type: Api
          Properties:
            RestApiId: !Ref AtaraxiaApi
            Path: /auth/logout
            Method: POST
        
        # MFA endpoints
        SetupTOTP:
          Type: Api
          Properties:
            RestApiId: !Ref AtaraxiaApi
            Path: /auth/mfa/setup-totp
            Method: POST
        VerifyTOTP:
          Type: Api
          Properties:
            RestApiId: !Ref AtaraxiaApi
            Path: /auth/mfa/verify-totp
            Method: POST
        SetupSMS:
          Type: Api
          Properties:
            RestApiId: !Ref AtaraxiaApi
            Path: /auth/mfa/setup-sms
            Method: POST
        VerifySMS:
          Type: Api
          Properties:
            RestApiId: !Ref AtaraxiaApi
            Path: /auth/mfa/verify-sms
            Method: POST
        SendSMSCode:
          Type: Api
          Properties:
            RestApiId: !Ref AtaraxiaApi
            Path: /auth/mfa/send-sms-code
            Method: POST
        RegenerateBackupCodes:
          Type: Api
          Properties:
            RestApiId: !Ref AtaraxiaApi
            Path: /auth/mfa/regenerate-backup-codes
            Method: POST
        DisableMFA:
          Type: Api
          Properties:
            RestApiId: !Ref AtaraxiaApi
            Path: /auth/mfa/disable
            Method: POST
        GetMFAStatus:
          Type: Api
          Properties:
            RestApiId: !Ref AtaraxiaApi
            Path: /auth/mfa/status
            Method: GET
        
        # Session management
        InvalidateAllSessions:
          Type: Api
          Properties:
            RestApiId: !Ref AtaraxiaApi
            Path: /auth/sessions/invalidate-all
            Method: POST
        TrustDevice:
          Type: Api
          Properties:
            RestApiId: !Ref AtaraxiaApi
            Path: /auth/sessions/trust-device
            Method: POST
        GetActiveSessions:
          Type: Api
          Properties:
            RestApiId: !Ref AtaraxiaApi
            Path: /auth/sessions/active
            Method: GET
        GetSessionAnalytics:
          Type: Api
          Properties:
            RestApiId: !Ref AtaraxiaApi
            Path: /auth/sessions/analytics
            Method: GET
        
        # Compliance endpoints
        RecordConsent:
          Type: Api
          Properties:
            RestApiId: !Ref AtaraxiaApi
            Path: /auth/compliance/consent
            Method: POST
        DataExportRequest:
          Type: Api
          Properties:
            RestApiId: !Ref AtaraxiaApi
            Path: /auth/compliance/data-export-request
            Method: POST
        GetUserConsents:
          Type: Api
          Properties:
            RestApiId: !Ref AtaraxiaApi
            Path: /auth/compliance/consents
            Method: GET
        GetAuditTrail:
          Type: Api
          Properties:
            RestApiId: !Ref AtaraxiaApi
            Path: /auth/compliance/audit-trail
            Method: GET
        
        # Mobile registration
        MobileRegister:
          Type: Api
          Properties:
            RestApiId: !Ref AtaraxiaApi
            Path: /auth/mobile/register
            Method: POST
        MobileSendPhoneCode:
          Type: Api
          Properties:
            RestApiId: !Ref AtaraxiaApi
            Path: /auth/mobile/send-phone-code
            Method: POST
        MobileVerifyPhone:
          Type: Api
          Properties:
            RestApiId: !Ref AtaraxiaApi
            Path: /auth/mobile/verify-phone
            Method: POST
        MobileCompleteProfile:
          Type: Api
          Properties:
            RestApiId: !Ref AtaraxiaApi
            Path: /auth/mobile/complete-profile
            Method: POST
        
        # Therapist status
        TherapistStatus:
          Type: Api
          Properties:
            RestApiId: !Ref AtaraxiaApi
            Path: /auth/therapist/status/{id}
            Method: GET
        
        # Client services
        ClientTherapists:
          Type: Api
          Properties:
            RestApiId: !Ref AtaraxiaApi
            Path: /client/therapists
            Method: GET
        ClientSearch:
          Type: Api
          Properties:
            RestApiId: !Ref AtaraxiaApi
            Path: /client/search
            Method: GET
        ClientSessions:
          Type: Api
          Properties:
            RestApiId: !Ref AtaraxiaApi
            Path: /client/sessions
            Method: GET
        ClientPayments:
          Type: Api
          Properties:
            RestApiId: !Ref AtaraxiaApi
            Path: /client/payments
            Method: GET
        BookAppointment:
          Type: Api
          Properties:
            RestApiId: !Ref AtaraxiaApi
            Path: /client/book-appointment
            Method: POST
        
        # CORS preflight
        AuthOptions:
          Type: Api
          Properties:
            RestApiId: !Ref AtaraxiaApi
            Path: /auth/{proxy+}
            Method: OPTIONS
        ClientOptions:
          Type: Api
          Properties:
            RestApiId: !Ref AtaraxiaApi
            Path: /client/{proxy+}
            Method: OPTIONS

Outputs:
  ApiGatewayEndpoint:
    Description: "API Gateway endpoint URL for local development"
    Value: !Sub "https://\${AtaraxiaApi}.execute-api.\${AWS::Region}.amazonaws.com/local"
  
  LocalEndpoint:
    Description: "Local development endpoint"
    Value: "http://localhost:3001"
EOF

print_status "Starting SAM Local API..."

# Start SAM local with the custom template
sam local start-api \
  --template-file template.local.yaml \
  --port 3001 \
  --host 0.0.0.0 \
  --warm-containers EAGER \
  --log-file logs/sam-local-production.log \
  --env-vars .env.local &

# Store the PID
SAM_PID=$!
echo $SAM_PID > .sam-local.pid

# Wait a moment for SAM to start
sleep 5

# Test if SAM started successfully
if kill -0 $SAM_PID 2>/dev/null; then
    print_success "SAM Local started successfully!"
    print_status "🌐 API available at: http://localhost:3001"
    print_status "📊 Using real AWS RDS database"
    print_status "🔥 Using real Firebase (ataraxia-c150f)"
    print_status "🔐 Using real Cognito (us-west-2_xeXlyFBMH)"
    print_status ""
    print_status "📋 Available endpoints:"
    print_status "  POST http://localhost:3001/auth/login"
    print_status "  POST http://localhost:3001/auth/register"
    print_status "  POST http://localhost:3001/auth/mfa/setup-totp"
    print_status "  GET  http://localhost:3001/auth/mfa/status"
    print_status "  GET  http://localhost:3001/client/therapists"
    print_status "  ... and 30+ more endpoints"
    print_status ""
    print_status "📝 Logs: tail -f logs/sam-local-production.log"
    print_status "🛑 Stop: ./stop-local.sh"
    print_status ""
    print_warning "⚠️  Remember: This uses REAL production data!"
    
    # Wait for SAM process
    wait $SAM_PID
else
    print_error "Failed to start SAM Local"
    exit 1
fi
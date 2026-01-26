# Ataraxia-Next - Modern Serverless Backend

Modern serverless backend system built with AWS Lambda, CDK, and comprehensive deployment automation for the Ataraxia healthcare platform.

## 🚀 Features

- **Serverless Architecture**: AWS Lambda functions with API Gateway
- **Enhanced Therapist Service**: 50+ profile fields, advanced search, JSONB specialties
- **Deployment Dashboard**: Interactive UI at `http://localhost:3012`
- **Service-Specific Deployment**: Deploy individual services or complete stack
- **Real-time Monitoring**: WebSocket-based live updates and logs
- **Database Integration**: Cloud RDS PostgreSQL with proper schema management
- **API Testing**: Automated endpoint testing with comprehensive results
- **Process Management**: Start/stop services with proper cleanup

## 🛠️ Technology Stack

- **Runtime**: Node.js, TypeScript
- **Cloud**: AWS Lambda, API Gateway, CDK
- **Database**: PostgreSQL (Cloud RDS)
- **Authentication**: AWS Cognito
- **Infrastructure**: AWS CDK (Infrastructure as Code)
- **Deployment**: Custom dashboard with WebSocket updates
- **Testing**: Automated API endpoint testing

## 📦 Quick Start

```bash
# Install dependencies
npm install

# Start deployment dashboard
node deployment-api-server.js
# Open http://localhost:3012

# Or use command line deployment
./deploy-fixed-system.sh
```

## 🎯 Deployment Dashboard

Access the interactive deployment dashboard at **http://localhost:3012**

### Features:
- **Local Development**: Start/stop local API servers
- **AWS CDK Deployment**: Deploy to AWS with real-time logs
- **Service Selection**: Deploy specific services or complete stack
- **API Testing**: Test all endpoints with live results
- **Process Monitoring**: View active processes and logs
- **WebSocket Updates**: Real-time status and log streaming

### Available Services:
- `all` - Complete stack deployment
- `therapist` - Therapist service only
- `auth` - Authentication service only
- `client` - Client service only
- `verification` - Verification service only
- `api-explorer` - API explorer only

## 🔧 Configuration

The system uses a unified `.env` configuration:

```env
# Cloud RDS Database (SINGLE SOURCE OF TRUTH)
DATABASE_URL=postgresql://app_user:password@host:5432/ataraxia_db?schema=ataraxia
DATABASE_SCHEMA=ataraxia

# AWS Configuration
AWS_REGION=us-west-2
AWS_ACCESS_KEY_ID=your-access-key
AWS_SECRET_ACCESS_KEY=your-secret-key

# Cognito Configuration
COGNITO_USER_POOL_ID=us-west-2_xxxxxxxxx
COGNITO_CLIENT_ID=xxxxxxxxxxxxxxxxxx

# API Configuration
API_BASE_URL=https://your-api-gateway-url.amazonaws.com/dev/
```

## 📁 Project Structure

```
src/
├── lambdas/           # Lambda function handlers
│   ├── auth/          # Authentication service
│   ├── therapist/     # Therapist service (enhanced)
│   ├── client/        # Client service
│   └── verification/  # Verification service
├── lib/               # Shared database utilities
├── shared/            # Shared utilities and types
infrastructure/
├── lib/               # CDK stack definitions
database/
├── migrations/        # Database schema migrations
scripts/               # Deployment and utility scripts
```

## 🌐 API Endpoints

All endpoints are fully functional and tested:

- `GET /api/therapist` - List all therapists ✅
- `GET /api/therapist/search` - Advanced search ✅  
- `GET /api/therapist/{id}` - Get specific therapist ✅
- `POST /api/auth/login` - Authentication ✅
- `GET /api/verification/status/{id}` - Verification status ✅

**Live API**: https://zojyvoao3c.execute-api.us-west-2.amazonaws.com/dev/

## 🚀 Deployment Options

### 1. Interactive Dashboard (Recommended)
```bash
node deployment-api-server.js
# Open http://localhost:3012
```

### 2. Command Line Deployment
```bash
# Complete system deployment
./deploy-fixed-system.sh

# Quick Lambda redeployment
./redeploy-lambda-functions.sh
```

### 3. Manual CDK Deployment
```bash
cd infrastructure
npx cdk deploy --require-approval never
```

## 🧪 Testing

```bash
# Test all API endpoints
node test-current-api-endpoints.js

# Test deployment system
node test-complete-deployment-system.js

# Test database connectivity
node fix-database-schema-issues.js
```

## 🔗 Related Repositories

- **Frontend**: [Ataraxia](../Ataraxia) - React frontend application
- **Legacy Backend**: [Ataraxia-Backend](../Ataraxia_backend) - Original backend system

## 📚 Key Achievements

- ✅ Complete business logic migration from legacy backend
- ✅ Enhanced therapist service with comprehensive profiles
- ✅ Working deployment dashboard with UI
- ✅ All API endpoints functional and tested
- ✅ Unified database configuration
- ✅ Production-ready Lambda functions
- ✅ Real-time monitoring and logging

## 🆘 Support

- **Deployment Dashboard**: http://localhost:3012
- **API Documentation**: Available in deployment dashboard
- **Database Schema**: Documented in migration files
- **Error Logs**: Available through AWS CloudWatch and dashboard
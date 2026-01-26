# 🚀 Ataraxia-Next API Explorer Guide

## Overview

The Ataraxia-Next API Explorer is a comprehensive, interactive web interface for testing and exploring all API endpoints with **real Cognito authentication** and **PostgreSQL database** integration. Unlike backend-initial's basic explorer, this is a full-featured testing environment.

## 🎯 **Why We Built This**

You asked why Ataraxia-Next doesn't have the API explorer mechanism that backend-initial had. The answer is: **Now it does, and it's even better!**

### **What backend-initial had:**
- Basic HTML interface at `localhost:8080/api-explorer-normalized.html`
- Simple form-based testing
- Limited endpoint coverage
- Basic authentication handling

### **What Ataraxia-Next now has:**
- **Advanced API Explorer** at `http://localhost:3010/api-explorer`
- **Real Cognito Integration** - No mock data
- **Interactive Interface** - Modern, responsive design
- **Complete Endpoint Coverage** - All authentication, verification, and user management endpoints
- **Smart Token Management** - Automatic token storage and reuse
- **System Health Monitoring** - Real-time status of API, database, and Cognito
- **Multiple Input Methods** - Forms, JSON payloads, and quick-fill options

## 🚀 **Getting Started**

### 1. Start the Local API Server
```bash
cd Ataraxia-Next
./start-local-api.sh
```

### 2. Open the API Explorer
Navigate to: **http://localhost:3010/api-explorer**

### 3. Quick Test
1. Click **"Quick Login"** to test authentication
2. Explore endpoints from the sidebar
3. Test real API calls with live data

## 🔍 **Features Overview**

### **🎛️ Interactive Dashboard**
- **System Status Bar** - Real-time health monitoring
  - ✅ API Server connectivity
  - ✅ PostgreSQL database status  
  - ✅ AWS Cognito configuration
- **Token Management** - Automatic JWT token handling
- **Quick Actions** - One-click test operations

### **🔐 Authentication Testing**
- **Real Cognito Login** - Test with actual AWS Cognito
- **User Registration** - Create real users in the system
- **Token Verification** - Automatic token storage and reuse
- **Phone Authentication** - SMS verification testing
- **Google OAuth** - Social login integration
- **Password Reset** - Complete forgot password flow

### **👨‍⚕️ Therapist Registration Workflow**
- **Complete Registration** - Full 10-step therapist onboarding
- **Professional Details** - License, specialties, practice information
- **Document Upload** - Test document verification workflow
- **Status Tracking** - Real-time registration status
- **Admin Approval** - Test admin verification process

### **📋 Verification System**
- **Registration Status** - Check application progress
- **Document Management** - Upload and verify documents
- **Background Checks** - Test background check integration
- **Admin Dashboard** - Pending verifications management
- **Audit Logging** - Complete compliance tracking

### **👥 User Management**
- **Therapist Profiles** - Complete therapist data management
- **Client Profiles** - Client information and preferences
- **Role-Based Access** - Test different user permissions
- **Organization Management** - Multi-tenant functionality

## 📱 **User Interface**

### **Sidebar Navigation**
Organized by functional areas:
- 🔐 **Authentication** - Login, register, token management
- 👨‍⚕️ **Therapist Registration** - Professional onboarding
- 📋 **Verification System** - Document and status management
- 👥 **User Management** - Profile and data management
- 🔧 **System** - Health checks and diagnostics

### **Main Content Area**
- **Endpoint Details** - Complete documentation for each endpoint
- **Interactive Forms** - Easy-to-use input forms
- **JSON Editor** - Advanced payload editing with formatting
- **Response Viewer** - Formatted JSON responses with syntax highlighting
- **Loading States** - Visual feedback during API calls

### **Smart Features**
- **Auto-fill Test Data** - Quick population of test values
- **Token Persistence** - Automatic token storage across sessions
- **Response History** - Track previous API calls
- **Error Handling** - Clear error messages and debugging info

## 🛠️ **Advanced Usage**

### **Testing Authentication Flow**
1. **Register New User**:
   ```
   POST /api/auth/register
   - Fill in user details
   - Choose role (therapist/client/admin)
   - Test email verification
   ```

2. **Login with Credentials**:
   ```
   POST /api/auth/login
   - Use registered credentials
   - Receive JWT token
   - Token automatically stored
   ```

3. **Access Protected Endpoints**:
   ```
   GET /api/auth/me
   - Uses stored token
   - Returns user profile
   - Tests token validation
   ```

### **Testing Therapist Registration**
1. **Complete Registration**:
   ```
   POST /api/auth/therapist/register
   - Professional details
   - License information
   - Specialties and modalities
   - Practice information
   ```

2. **Check Status**:
   ```
   GET /api/auth/therapist/status/:id
   - Registration progress
   - Verification status
   - Admin approval state
   ```

3. **Document Upload**:
   ```
   POST /api/verification/:id/documents
   - License documents
   - Professional certificates
   - Compliance documents
   ```

### **JSON Payload Testing**
For complex endpoints, use the JSON editor:
```json
{
  "firstName": "Dr. Jane",
  "lastName": "Smith",
  "email": "dr.smith@example.com",
  "licenseNumber": "PSY12345",
  "licenseState": "CA",
  "specializations": ["anxiety", "depression", "trauma"],
  "degree": "PhD in Clinical Psychology",
  "institutionName": "Stanford University",
  "graduationYear": 2015,
  "yearsOfExperience": 8,
  "hipaaTrainingCompleted": true,
  "ethicsCertification": true,
  "backgroundCheckConsent": true
}
```

## 🔧 **Configuration**

### **Environment Variables**
The API Explorer automatically detects:
- `API_PORT` - Local API server port (default: 3010)
- `COGNITO_USER_POOL_ID` - AWS Cognito User Pool
- `COGNITO_CLIENT_ID` - Cognito App Client ID
- `DATABASE_URL` - PostgreSQL connection string

### **Base URL Configuration**
Default: `http://localhost:3010`
- Automatically configured based on server port
- Can be modified in the explorer interface
- Supports both local and deployed environments

## 📊 **System Monitoring**

### **Real-time Status Indicators**
- 🟢 **Green Dot** - Service healthy and responding
- 🔴 **Red Dot** - Service unavailable or error
- **Status Text** - Detailed status information

### **Health Check Details**
```json
{
  "status": "healthy",
  "service": "ataraxia-real-api",
  "database": "postgresql",
  "cognito": "configured",
  "timestamp": "2024-01-26T10:30:00.000Z",
  "version": "2.0.0-real"
}
```

## 🚀 **Advantages Over backend-initial**

| Feature | backend-initial | Ataraxia-Next |
|---------|-----------------|---------------|
| **Interface** | Basic HTML forms | Modern, responsive UI |
| **Authentication** | Mock/basic | Real Cognito integration |
| **Database** | Limited testing | Full PostgreSQL integration |
| **Endpoints** | Basic CRUD | Complete healthcare workflow |
| **Token Management** | Manual | Automatic storage/reuse |
| **System Status** | None | Real-time monitoring |
| **Documentation** | Minimal | Complete inline docs |
| **Mobile Support** | None | Responsive design |
| **Error Handling** | Basic | Comprehensive feedback |
| **Test Data** | Manual entry | Smart auto-fill |

## 🎯 **Use Cases**

### **For Developers**
- **API Development** - Test endpoints during development
- **Integration Testing** - Verify frontend integration
- **Debugging** - Troubleshoot API issues
- **Documentation** - Understand API behavior

### **For QA Testing**
- **Functional Testing** - Verify all endpoints work
- **Authentication Testing** - Test login/registration flows
- **Data Validation** - Verify input/output formats
- **Error Scenarios** - Test error handling

### **For Product Managers**
- **Feature Validation** - Verify implemented features
- **User Flow Testing** - Test complete user journeys
- **Demo Preparation** - Prepare for stakeholder demos
- **Requirements Verification** - Confirm feature completeness

### **For DevOps**
- **Health Monitoring** - Check system status
- **Deployment Validation** - Verify deployments
- **Performance Testing** - Monitor response times
- **Configuration Testing** - Verify environment setup

## 🔒 **Security Features**

### **Token Security**
- JWT tokens stored securely in localStorage
- Automatic token expiration handling
- Clear token functionality for security
- No sensitive data logged

### **HTTPS Support**
- Ready for HTTPS deployment
- Secure cookie handling
- CORS configuration for security
- CSP headers support

### **Data Protection**
- No sensitive data in URLs
- Secure form handling
- Input validation and sanitization
- Error message sanitization

## 📱 **Mobile Responsiveness**

The API Explorer is fully responsive and works on:
- **Desktop** - Full-featured interface
- **Tablet** - Optimized layout
- **Mobile** - Touch-friendly controls
- **Different Screen Sizes** - Adaptive design

## 🔄 **Integration with Development Workflow**

### **Local Development**
```bash
# Start API server with explorer
./start-local-api.sh

# Open explorer
open http://localhost:3010/api-explorer

# Test endpoints during development
# Make changes to API
# Refresh explorer to test changes
```

### **CI/CD Integration**
- Use explorer for automated API testing
- Generate test reports from explorer results
- Validate deployments with explorer health checks
- Document API changes with explorer screenshots

## 🎉 **Conclusion**

The Ataraxia-Next API Explorer provides a **superior testing experience** compared to backend-initial's basic interface. It offers:

✅ **Real Integration** - No mock data, real Cognito + PostgreSQL  
✅ **Complete Coverage** - All endpoints documented and testable  
✅ **Modern Interface** - Responsive, intuitive design  
✅ **Smart Features** - Auto-fill, token management, status monitoring  
✅ **Production Ready** - Suitable for development, testing, and demos  

**Access it now at: http://localhost:3010/api-explorer**

This addresses your question about why Ataraxia-Next didn't have the API explorer mechanism - now it has an even better one! 🚀
# 🔗 Frontend Integration Guide - Cognito Migration

## Overview

Ataraxia-Next maintains **100% API compatibility** with your existing Ataraxia frontend while migrating from Firebase to AWS Cognito for enhanced healthcare security and compliance.

## Migration Status: ✅ READY FOR TESTING

### What's Changed
- **Backend**: Migrated from Firebase to AWS Cognito
- **Frontend**: New unified authentication service with automatic fallback
- **Database**: Using `firebase_uid` field to store Cognito sub (seamless migration)
- **API**: Exact same endpoints and response formats

### What Stays the Same
- All existing API endpoints work unchanged
- Same response structures and error handling
- Same JWT token format for internal APIs
- All user data and relationships preserved

## Quick Start

### 1. Update Environment Configuration

Create or update `Ataraxia/.env.local`:

```bash
# Authentication Configuration
VITE_USE_COGNITO=true
VITE_ENABLE_AUTH_FALLBACK=true

# AWS Cognito Configuration  
VITE_AWS_REGION=us-west-2
VITE_COGNITO_USER_POOL_ID=us-west-2_AtaraxiaPool
VITE_COGNITO_CLIENT_ID=ataraxia-therapy-client

# API Configuration (points to Ataraxia-Next)
VITE_API_BASE_URL=http://localhost:3001

# Migration Features
VITE_ENABLE_MIGRATION_MODE=true
VITE_SHOW_AUTH_DEBUG=true
```

### 2. Start the New Backend

```bash
# Start Ataraxia-Next (Cognito backend)
cd Ataraxia-Next
npm run build
npm run deploy:cognito  # Deploy Cognito User Pool
# OR for local development:
sam local start-api --port 3001
```

### 3. Start Frontend (No Changes Required!)

```bash
# Your existing frontend works unchanged
cd Ataraxia
npm run dev
```

## Authentication Migration

### New Authentication Methods

The frontend now supports both Firebase and Cognito with automatic fallback:

```typescript
import { useAuth } from '../hooks/useAuth';

function LoginComponent() {
  const { 
    signInWithCognito,    // New Cognito method
    signUpWithCognito,    // New Cognito method
    confirmEmail,         // New email verification
    resetPassword,        // New password reset
    authSystem,           // Shows current system (cognito/firebase)
    authSystemStatus      // Shows configuration status
  } = useAuth();

  // Cognito login (recommended)
  const handleCognitoLogin = async (email: string, password: string) => {
    try {
      await signInWithCognito(email, password);
    } catch (error) {
      console.error('Login failed:', error.message);
    }
  };

  // Legacy login still works (automatic system detection)
  const handleLegacyLogin = async () => {
    try {
      await login(userId, email, role);
    } catch (error) {
      console.error('Login failed:', error.message);
    }
  };
}
```

### Migration Status Component

Add the migration status component for debugging:

```typescript
import AuthMigrationStatus from '../components/AuthMigrationStatus';

function DashboardLayout() {
  return (
    <div>
      {/* Your existing layout */}
      
      {/* Add this for migration monitoring */}
      <AuthMigrationStatus showDetails={true} />
    </div>
  );
}
```

## API Endpoints

### Unchanged Endpoints ✅

All your existing API calls work exactly the same:

```typescript
// These work unchanged with Cognito backend
const response = await fetch('/api/auth/login', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({ email, password })
});

// Same response format
const data = await response.json();
// { token: "...", user: { id, email, role, ... } }
```

### New Cognito Endpoints ✅

Additional endpoints for Cognito-specific features:

```typescript
// Email verification (new)
POST /api/auth/confirm
{
  "email": "user@example.com",
  "confirmationCode": "123456"
}

// Resend verification code (new)
POST /api/auth/resend-code
{
  "email": "user@example.com"
}

// Password reset (enhanced)
POST /api/auth/forgot-password
{
  "email": "user@example.com"
}

POST /api/auth/reset-password
{
  "email": "user@example.com",
  "confirmationCode": "123456",
  "newPassword": "NewSecurePass123!"
}
```

## User Data Migration

### Automatic Migration ✅

The migration script handles all user data automatically:

1. **Existing Users**: Migrated to Cognito with same email/data
2. **Database**: `firebase_uid` field now stores Cognito sub
3. **Relationships**: All therapist-client relationships preserved
4. **Permissions**: All roles and permissions maintained

### Migration Script

Run the migration script to move all users:

```bash
cd Ataraxia-Next
npm run migrate:firebase-to-cognito
```

This will:
- Create Cognito users for all existing database users
- Update database records with Cognito sub
- Preserve all user data and relationships
- Generate detailed migration report

## Testing the Migration

### 1. Test Authentication Flow

```bash
# Test login with existing user
curl -X POST http://localhost:3001/api/auth/login \
  -H "Content-Type: application/json" \
  -d '{"email":"therapist@example.com","password":"password123"}'
```

### 2. Test Frontend Integration

```typescript
// Test in browser console
const auth = useAuth();
console.log('Auth System:', auth.authSystem);
console.log('Status:', auth.authSystemStatus);

// Test Cognito login
await auth.signInWithCognito('user@example.com', 'password');
```

### 3. Verify User Data

```bash
# Check user data is preserved
curl -H "Authorization: Bearer YOUR_TOKEN" \
  http://localhost:3001/api/auth/me
```

## Rollback Plan

If issues occur, you can rollback quickly:

### 1. Switch Backend

```bash
# Stop Ataraxia-Next
cd Ataraxia-Next && sam local stop-api

# Start original backend
cd Ataraxia_backend/auth-service && npm run dev
```

### 2. Switch Frontend

```bash
# Update .env.local
VITE_USE_COGNITO=false
VITE_ENABLE_AUTH_FALLBACK=false
VITE_API_BASE_URL=http://localhost:3001  # Original backend
```

### 3. Revert Database (if needed)

```sql
-- Restore original firebase_uid values from backup
-- (Migration script creates backup before changes)
```

## Benefits of Migration

### ✅ Enhanced Security
- Healthcare-grade authentication
- Advanced password policies
- MFA support built-in
- Compliance with HIPAA requirements

### ✅ Better Performance  
- Serverless auto-scaling
- Faster authentication
- Reduced latency
- Better error handling

### ✅ Improved Monitoring
- CloudWatch integration
- Detailed audit logs
- Performance metrics
- Security event tracking

### ✅ Cost Optimization
- Pay-per-use pricing
- No Firebase costs
- Reduced infrastructure overhead
- Better resource utilization

## Troubleshooting

### Frontend Can't Connect

```bash
# Check if Ataraxia-Next is running
curl http://localhost:3001/api/auth/login

# Check environment variables
echo $VITE_API_BASE_URL
echo $VITE_USE_COGNITO
```

### Authentication Errors

```typescript
// Check auth system status
const { authSystemStatus } = useAuth();
console.log('Cognito configured:', authSystemStatus.cognitoConfigured);
console.log('Fallback enabled:', authSystemStatus.fallbackEnabled);
```

### CORS Issues

```bash
# Update CORS in Ataraxia-Next/.env
CORS_ORIGINS=http://localhost:3000,http://localhost:3001
```

### Migration Issues

```bash
# Check migration logs
cd Ataraxia-Next
npm run migrate:firebase-to-cognito --dry-run

# View detailed logs
tail -f logs/migration.log
```

## Next Steps

### Phase 1: Authentication ✅ COMPLETE
- [x] Cognito User Pool deployed
- [x] Auth endpoints working
- [x] Frontend integration ready
- [x] Migration script ready

### Phase 2: User Migration 🔄 IN PROGRESS
- [ ] Run migration script
- [ ] Test all user logins
- [ ] Verify data integrity
- [ ] Update user documentation

### Phase 3: Production Deployment 📋 PLANNED
- [ ] Deploy to staging environment
- [ ] Performance testing
- [ ] Security audit
- [ ] Production rollout

### Phase 4: Cleanup 📋 PLANNED
- [ ] Remove Firebase dependencies
- [ ] Clean up legacy code
- [ ] Update documentation
- [ ] Team training

## Support

### Development Team
- **Backend**: Ataraxia-Next with Cognito integration
- **Frontend**: Unified auth service with fallback
- **Database**: Seamless migration using existing fields

### Monitoring
- **Auth System**: Real-time status in AuthMigrationStatus component
- **API Health**: Standard health check endpoints
- **User Experience**: Same login flow, enhanced security

### Documentation
- **API Docs**: Same endpoints, enhanced with Cognito features
- **Migration Guide**: This document
- **Troubleshooting**: Common issues and solutions

---

**🎉 Your frontend will work seamlessly throughout the entire migration!**

The migration is designed to be transparent to users while providing enhanced security and compliance for your healthcare platform.
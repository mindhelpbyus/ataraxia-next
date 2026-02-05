# 🚀 Enhanced Frontend Integration Guide

## Overview

This guide covers how to integrate the new enhanced authentication features into your Ataraxia frontend, including MFA, advanced security, session management, and compliance features.

## 🆕 New Authentication Features

### 1. Multi-Factor Authentication (MFA)
- **TOTP-based 2FA**: Authenticator app support (Google Authenticator, Authy, etc.)
- **SMS-based 2FA**: SMS verification codes
- **Backup Codes**: Emergency access codes
- **MFA Management**: Enable, disable, regenerate codes

### 2. Advanced Security
- **Rate Limiting**: Automatic protection against brute force attacks
- **Account Lockout**: Temporary lockout after failed attempts
- **Device Fingerprinting**: Track and trust user devices
- **Suspicious Activity Detection**: Monitor unusual login patterns

### 3. Session Management
- **Multi-Device Sessions**: Track sessions across all devices
- **Session Analytics**: Detailed usage statistics
- **Force Logout**: Invalidate sessions remotely
- **Device Trust**: Mark devices as trusted

### 4. Compliance Features
- **Privacy Consent Management**: HIPAA/GDPR compliance
- **Enhanced Audit Trails**: Comprehensive logging
- **Data Export Requests**: User data portability
- **Breach Detection**: Security monitoring

## 📡 API Endpoints

### Authentication Endpoints (Enhanced)

```typescript
// Basic Authentication (existing)
POST /api/auth/login
POST /api/auth/register
POST /api/auth/confirm
POST /api/auth/forgot-password
POST /api/auth/reset-password
POST /api/auth/refresh
POST /api/auth/logout

// MFA Endpoints (new)
GET  /api/auth/mfa/status
POST /api/auth/mfa/setup-totp
POST /api/auth/mfa/verify-totp
POST /api/auth/mfa/setup-sms
POST /api/auth/mfa/verify-sms
POST /api/auth/mfa/send-sms-code
POST /api/auth/mfa/regenerate-backup-codes
POST /api/auth/mfa/disable

// Session Management (new)
GET  /api/auth/sessions/active
GET  /api/auth/sessions/analytics
POST /api/auth/sessions/invalidate-all
POST /api/auth/sessions/trust-device

// Compliance & Privacy (new)
POST /api/auth/compliance/consent
GET  /api/auth/compliance/consents
GET  /api/auth/compliance/audit-trail
POST /api/auth/compliance/data-export-request
```

## 🔐 Frontend Implementation

### 1. Enhanced Login Flow

```typescript
// Enhanced login with MFA support
interface LoginResponse {
  user?: User;
  tokens?: AuthTokens;
  requiresMFA?: boolean;
  mfaEnabled?: boolean;
  sessionId?: string;
  suspiciousActivity?: boolean;
}

const handleLogin = async (email: string, password: string, deviceInfo?: DeviceInfo) => {
  try {
    const response = await fetch('/api/auth/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        email,
        password,
        deviceInfo: {
          userAgent: navigator.userAgent,
          platform: navigator.platform,
          language: navigator.language,
          timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
          screenResolution: `${screen.width}x${screen.height}`,
          rememberMe: false
        }
      })
    });

    const data: LoginResponse = await response.json();

    if (data.requiresMFA) {
      // Redirect to MFA verification
      setShowMFAPrompt(true);
      setUserId(data.user?.id);
    } else if (data.suspiciousActivity) {
      // Show security warning
      setShowSecurityWarning(true);
    } else {
      // Normal login success
      setUser(data.user);
      setTokens(data.tokens);
    }
  } catch (error) {
    console.error('Login failed:', error);
  }
};
```

### 2. MFA Setup Component

```typescript
import { useState } from 'react';
import QRCode from 'qrcode.react';

interface MFASetupProps {
  userId: string;
  onComplete: () => void;
}

const MFASetup: React.FC<MFASetupProps> = ({ userId, onComplete }) => {
  const [step, setStep] = useState<'choose' | 'totp' | 'sms'>('choose');
  const [qrCodeUrl, setQrCodeUrl] = useState('');
  const [backupCodes, setBackupCodes] = useState<string[]>([]);
  const [verificationCode, setVerificationCode] = useState('');

  const setupTOTP = async () => {
    const response = await fetch('/api/auth/mfa/setup-totp', {
      method: 'POST',
      headers: { 
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${getAuthToken()}`
      },
      body: JSON.stringify({ userId, userEmail: user.email })
    });

    const data = await response.json();
    setQrCodeUrl(data.qrCodeUrl);
    setBackupCodes(data.backupCodes);
    setStep('totp');
  };

  const verifyTOTP = async () => {
    const response = await fetch('/api/auth/mfa/verify-totp', {
      method: 'POST',
      headers: { 
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${getAuthToken()}`
      },
      body: JSON.stringify({ userId, token: verificationCode })
    });

    const data = await response.json();
    if (data.verified) {
      onComplete();
    }
  };

  return (
    <div className="mfa-setup">
      {step === 'choose' && (
        <div>
          <h3>Choose 2FA Method</h3>
          <button onClick={setupTOTP}>Authenticator App (Recommended)</button>
          <button onClick={() => setStep('sms')}>SMS Text Message</button>
        </div>
      )}

      {step === 'totp' && (
        <div>
          <h3>Setup Authenticator App</h3>
          <p>Scan this QR code with your authenticator app:</p>
          <QRCode value={qrCodeUrl} />
          
          <div>
            <h4>Backup Codes (Save These!)</h4>
            {backupCodes.map((code, index) => (
              <code key={index}>{code}</code>
            ))}
          </div>

          <input
            type="text"
            placeholder="Enter verification code"
            value={verificationCode}
            onChange={(e) => setVerificationCode(e.target.value)}
          />
          <button onClick={verifyTOTP}>Verify & Enable</button>
        </div>
      )}
    </div>
  );
};
```

### 3. Session Management Component

```typescript
interface SessionInfo {
  id: string;
  deviceInfo: {
    userAgent: string;
    ipAddress: string;
    platform?: string;
    browser?: string;
    os?: string;
  };
  createdAt: Date;
  lastAccessedAt: Date;
  isActive: boolean;
  isCurrent?: boolean;
}

const SessionManager: React.FC = () => {
  const [sessions, setSessions] = useState<SessionInfo[]>([]);
  const [analytics, setAnalytics] = useState<any>(null);

  const loadSessions = async () => {
    const response = await fetch(`/api/auth/sessions/active?userId=${user.id}`, {
      headers: { 'Authorization': `Bearer ${getAuthToken()}` }
    });
    const data = await response.json();
    setSessions(data.sessions);
  };

  const loadAnalytics = async () => {
    const response = await fetch(`/api/auth/sessions/analytics?userId=${user.id}&days=30`, {
      headers: { 'Authorization': `Bearer ${getAuthToken()}` }
    });
    const data = await response.json();
    setAnalytics(data.analytics);
  };

  const invalidateAllSessions = async () => {
    await fetch('/api/auth/sessions/invalidate-all', {
      method: 'POST',
      headers: { 
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${getAuthToken()}`
      },
      body: JSON.stringify({ 
        userId: user.id,
        excludeSessionId: currentSessionId 
      })
    });
    loadSessions();
  };

  return (
    <div className="session-manager">
      <h3>Active Sessions</h3>
      {sessions.map(session => (
        <div key={session.id} className={`session ${session.isCurrent ? 'current' : ''}`}>
          <div>
            <strong>{session.deviceInfo.browser} on {session.deviceInfo.os}</strong>
            {session.isCurrent && <span className="badge">Current</span>}
          </div>
          <div>IP: {session.deviceInfo.ipAddress}</div>
          <div>Last active: {new Date(session.lastAccessedAt).toLocaleString()}</div>
        </div>
      ))}
      
      <button onClick={invalidateAllSessions} className="danger">
        Logout All Other Devices
      </button>

      {analytics && (
        <div className="session-analytics">
          <h4>Usage Analytics (Last 30 Days)</h4>
          <p>Total Sessions: {analytics.totalSessions}</p>
          <p>Active Sessions: {analytics.activeSessions}</p>
          <p>Average Duration: {analytics.averageSessionDuration} minutes</p>
        </div>
      )}
    </div>
  );
};
```

### 4. Privacy Consent Component

```typescript
interface ConsentType {
  type: string;
  title: string;
  description: string;
  required: boolean;
  version: string;
}

const PrivacyConsent: React.FC = () => {
  const [consents, setConsents] = useState<ConsentType[]>([
    {
      type: 'data_processing',
      title: 'Data Processing',
      description: 'Allow processing of health data for treatment purposes',
      required: true,
      version: '1.0'
    },
    {
      type: 'marketing',
      title: 'Marketing Communications',
      description: 'Receive updates about new features and services',
      required: false,
      version: '1.0'
    }
  ]);

  const [userConsents, setUserConsents] = useState<Record<string, boolean>>({});

  const recordConsent = async (consentType: string, granted: boolean) => {
    await fetch('/api/auth/compliance/consent', {
      method: 'POST',
      headers: { 
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${getAuthToken()}`
      },
      body: JSON.stringify({
        userId: user.id,
        consentType,
        granted,
        version: consents.find(c => c.type === consentType)?.version,
        details: {
          timestamp: new Date().toISOString(),
          userAgent: navigator.userAgent
        }
      })
    });

    setUserConsents(prev => ({ ...prev, [consentType]: granted }));
  };

  return (
    <div className="privacy-consent">
      <h3>Privacy Preferences</h3>
      {consents.map(consent => (
        <div key={consent.type} className="consent-item">
          <div>
            <h4>{consent.title} {consent.required && <span className="required">*</span>}</h4>
            <p>{consent.description}</p>
          </div>
          <label className="switch">
            <input
              type="checkbox"
              checked={userConsents[consent.type] || false}
              onChange={(e) => recordConsent(consent.type, e.target.checked)}
              disabled={consent.required && userConsents[consent.type]}
            />
            <span className="slider"></span>
          </label>
        </div>
      ))}
    </div>
  );
};
```

### 5. Enhanced Auth Hook

```typescript
import { useState, useEffect, useContext } from 'react';

interface EnhancedAuthState {
  user: User | null;
  isAuthenticated: boolean;
  mfaEnabled: boolean;
  sessionId: string | null;
  securityStatus: {
    trustedDevice: boolean;
    suspiciousActivity: boolean;
    accountLocked: boolean;
  };
}

export const useEnhancedAuth = () => {
  const [authState, setAuthState] = useState<EnhancedAuthState>({
    user: null,
    isAuthenticated: false,
    mfaEnabled: false,
    sessionId: null,
    securityStatus: {
      trustedDevice: false,
      suspiciousActivity: false,
      accountLocked: false
    }
  });

  const login = async (email: string, password: string, mfaToken?: string) => {
    const deviceInfo = {
      userAgent: navigator.userAgent,
      platform: navigator.platform,
      language: navigator.language,
      timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
      screenResolution: `${screen.width}x${screen.height}`
    };

    const response = await fetch('/api/auth/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email, password, mfaToken, deviceInfo })
    });

    const data = await response.json();

    if (data.requiresMFA) {
      return { requiresMFA: true, userId: data.userId };
    }

    if (data.user) {
      setAuthState({
        user: data.user,
        isAuthenticated: true,
        mfaEnabled: data.user.mfaEnabled,
        sessionId: data.sessionId,
        securityStatus: {
          trustedDevice: !data.suspiciousActivity,
          suspiciousActivity: data.suspiciousActivity,
          accountLocked: false
        }
      });

      // Store tokens
      localStorage.setItem('authToken', data.tokens.accessToken);
      localStorage.setItem('refreshToken', data.tokens.refreshToken);
    }

    return data;
  };

  const setupMFA = async (method: 'totp' | 'sms', phoneNumber?: string) => {
    const endpoint = method === 'totp' ? '/api/auth/mfa/setup-totp' : '/api/auth/mfa/setup-sms';
    const body = method === 'totp' 
      ? { userId: authState.user?.id, userEmail: authState.user?.email }
      : { userId: authState.user?.id, phoneNumber };

    const response = await fetch(endpoint, {
      method: 'POST',
      headers: { 
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${localStorage.getItem('authToken')}`
      },
      body: JSON.stringify(body)
    });

    return response.json();
  };

  const getMFAStatus = async () => {
    const response = await fetch(`/api/auth/mfa/status?userId=${authState.user?.id}`, {
      headers: { 'Authorization': `Bearer ${localStorage.getItem('authToken')}` }
    });
    return response.json();
  };

  const getActiveSessions = async () => {
    const response = await fetch(`/api/auth/sessions/active?userId=${authState.user?.id}`, {
      headers: { 'Authorization': `Bearer ${localStorage.getItem('authToken')}` }
    });
    return response.json();
  };

  const requestDataExport = async () => {
    const response = await fetch('/api/auth/compliance/data-export-request', {
      method: 'POST',
      headers: { 
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${localStorage.getItem('authToken')}`
      },
      body: JSON.stringify({
        userId: authState.user?.id,
        requestedBy: authState.user?.id,
        reason: 'User requested data export'
      })
    });
    return response.json();
  };

  return {
    ...authState,
    login,
    setupMFA,
    getMFAStatus,
    getActiveSessions,
    requestDataExport
  };
};
```

## 🔧 Environment Configuration

Update your `.env.local` file:

```bash
# Enhanced Authentication Features
VITE_MFA_ENABLED=true
VITE_SESSION_MANAGEMENT_ENABLED=true
VITE_COMPLIANCE_MODE=true

# Security Settings
VITE_DEVICE_FINGERPRINTING=true
VITE_SUSPICIOUS_ACTIVITY_DETECTION=true

# API Configuration
VITE_API_BASE_URL=http://localhost:3010
VITE_AUTH_API_VERSION=v2

# Development Settings
VITE_SHOW_SECURITY_WARNINGS=true
VITE_ENABLE_SESSION_ANALYTICS=true
```

## 🎨 UI Components

### Security Status Indicator

```typescript
const SecurityStatus: React.FC = () => {
  const { securityStatus, user } = useEnhancedAuth();

  return (
    <div className="security-status">
      <div className={`status-indicator ${securityStatus.trustedDevice ? 'trusted' : 'untrusted'}`}>
        {securityStatus.trustedDevice ? '🔒 Trusted Device' : '⚠️ New Device'}
      </div>
      
      {securityStatus.suspiciousActivity && (
        <div className="security-warning">
          ⚠️ Unusual activity detected. Please verify your identity.
        </div>
      )}
      
      {user?.mfaEnabled && (
        <div className="mfa-status">
          ✅ Two-factor authentication enabled
        </div>
      )}
    </div>
  );
};
```

### MFA Verification Modal

```typescript
const MFAVerificationModal: React.FC<{ isOpen: boolean; onVerify: (token: string) => void }> = ({ isOpen, onVerify }) => {
  const [token, setToken] = useState('');
  const [method, setMethod] = useState<'totp' | 'sms' | 'backup'>('totp');

  if (!isOpen) return null;

  return (
    <div className="modal-overlay">
      <div className="mfa-modal">
        <h3>Two-Factor Authentication Required</h3>
        
        <div className="mfa-methods">
          <button 
            className={method === 'totp' ? 'active' : ''}
            onClick={() => setMethod('totp')}
          >
            Authenticator App
          </button>
          <button 
            className={method === 'sms' ? 'active' : ''}
            onClick={() => setMethod('sms')}
          >
            SMS Code
          </button>
          <button 
            className={method === 'backup' ? 'active' : ''}
            onClick={() => setMethod('backup')}
          >
            Backup Code
          </button>
        </div>

        <input
          type="text"
          placeholder={
            method === 'totp' ? 'Enter 6-digit code' :
            method === 'sms' ? 'Enter SMS code' :
            'Enter backup code'
          }
          value={token}
          onChange={(e) => setToken(e.target.value)}
          maxLength={method === 'backup' ? 8 : 6}
        />

        <button onClick={() => onVerify(token)} disabled={!token}>
          Verify
        </button>
      </div>
    </div>
  );
};
```

## 📱 Mobile Considerations

### Device Registration

```typescript
const registerDevice = async () => {
  const deviceInfo = {
    userAgent: navigator.userAgent,
    platform: navigator.platform,
    language: navigator.language,
    timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
    screenResolution: `${screen.width}x${screen.height}`,
    cookiesEnabled: navigator.cookieEnabled
  };

  // Generate device fingerprint
  const fingerprint = await generateDeviceFingerprint(deviceInfo);

  await fetch('/api/auth/sessions/trust-device', {
    method: 'POST',
    headers: { 
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${getAuthToken()}`
    },
    body: JSON.stringify({
      userId: user.id,
      deviceHash: fingerprint.hash
    })
  });
};
```

## 🚀 Testing the Integration

### 1. Start the API Explorer
```bash
cd Ataraxia-Next
npm run local:start
# Visit http://localhost:3010/api-explorer
```

### 2. Test New Endpoints
- Try the MFA setup flow
- Test session management
- Verify compliance features
- Check security monitoring

### 3. Frontend Integration Testing
```typescript
// Test MFA setup
const testMFASetup = async () => {
  const setup = await setupMFA('totp');
  console.log('QR Code:', setup.qrCodeUrl);
  console.log('Backup Codes:', setup.backupCodes);
};

// Test session management
const testSessions = async () => {
  const sessions = await getActiveSessions();
  console.log('Active Sessions:', sessions);
};

// Test compliance features
const testCompliance = async () => {
  const exportRequest = await requestDataExport();
  console.log('Export Request ID:', exportRequest.requestId);
};
```

## 🔒 Security Best Practices

1. **Always use HTTPS** in production
2. **Store tokens securely** (consider using secure HTTP-only cookies)
3. **Implement proper error handling** for security events
4. **Show clear security indicators** to users
5. **Provide easy MFA recovery options**
6. **Log security events** for monitoring
7. **Implement proper session timeout** handling
8. **Use device fingerprinting** responsibly (privacy considerations)

## 📊 Monitoring & Analytics

The enhanced auth system provides detailed analytics:

- **Login patterns** and success rates
- **MFA usage** statistics
- **Session duration** and device breakdown
- **Security events** and suspicious activity
- **Compliance audit trails**

Access these through the session analytics endpoints and compliance audit trails.

## 🎯 Next Steps

1. **Implement the UI components** shown above
2. **Test the MFA flow** end-to-end
3. **Set up session management** UI
4. **Add privacy consent** forms
5. **Implement security monitoring** alerts
6. **Test compliance features**
7. **Deploy and monitor** in production

The enhanced authentication system is fully backward compatible while providing enterprise-grade security features for your healthcare application.
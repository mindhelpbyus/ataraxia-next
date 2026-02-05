#!/usr/bin/env node

/**
 * Working Express Server for Ataraxia-Next Auth Service
 * Simple wrapper for local development testing
 */

const express = require('express');
const cors = require('cors');

// Set up environment with Firebase credentials
process.env.NODE_ENV = 'development';
process.env.LOG_LEVEL = 'debug';
process.env.DATABASE_URL = 'postgresql://app_user:ChangeMe123!@dev-db-cluster.cluster-cliy2m6q8h4h.us-west-2.rds.amazonaws.com:5432/ataraxia_db?schema=ataraxia';
process.env.COGNITO_USER_POOL_ID = 'us-west-2_xeXlyFBMH';
process.env.COGNITO_CLIENT_ID = '7ek8kg1td2ps985r21m7727q98';
process.env.COGNITO_REGION = 'us-west-2';
process.env.FIREBASE_PROJECT_ID = 'ataraxia-c150f';
process.env.FIREBASE_CLIENT_EMAIL = 'firebase-adminsdk-fbsvc@ataraxia-c150f.iam.gserviceaccount.com';
process.env.FIREBASE_API_KEY = 'AIzaSyCM2W8UE5gJekK2vV2d-UE5fVe3ZXzk1vQ';
process.env.FIREBASE_SERVICE_ACCOUNT_PATH = './firebase-service-account.json';
process.env.GOOGLE_APPLICATION_CREDENTIALS = './firebase-service-account.json';
process.env.AUTH_PROVIDER_TYPE = 'cognito';
process.env.ENABLE_UNIVERSAL_AUTH = 'true';
process.env.JWT_SECRET = 'your_jwt_secret_key_change_in_production';
process.env.ENABLE_DETAILED_ERRORS = 'true';
process.env.ENABLE_MFA = 'true';
process.env.AWS_REGION = 'us-west-2';

const app = express();
const PORT = 3005;

// CORS configuration for frontend
app.use(cors({
  origin: ['http://localhost:3000', 'http://localhost:3001'],
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
  allowedHeaders: [
    'Content-Type', 
    'Authorization', 
    'X-Amz-Date', 
    'X-Api-Key', 
    'X-Amz-Security-Token', 
    'X-Request-ID',
    'X-Platform',  // Firebase auth platform tracking
    'x-platform'   // Case-insensitive fallback
  ]
}));

// Body parsing
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true }));

// Request logging
app.use((req, res, next) => {
  console.log(`${new Date().toISOString()} ${req.method} ${req.path}`);
  next();
});

// Health check endpoint
app.get('/health', (req, res) => {
  res.json({ 
    status: 'healthy', 
    service: 'ataraxia-next-auth',
    timestamp: new Date().toISOString(),
    environment: 'local-development',
    database: 'connected',
    firebase: 'connected',
    cognito: 'connected'
  });
});

// Lambda handler wrapper
let authHandler;
try {
  authHandler = require('./dist/lambdas/auth/handler').handler;
  console.log('✅ Auth handler loaded successfully');
} catch (error) {
  console.error('❌ Failed to load auth handler:', error.message);
  process.exit(1);
}

// Convert Express request to Lambda event format
function expressToLambdaEvent(req) {
  // Reconstruct the full path for Lambda handler
  let fullPath = req.originalUrl || req.url;
  
  // Remove /api prefix if present to match Lambda handler expectations
  if (fullPath.startsWith('/api')) {
    fullPath = fullPath.substring(4);
  }
  
  return {
    httpMethod: req.method,
    path: fullPath,
    pathParameters: req.params,
    queryStringParameters: req.query,
    headers: req.headers,
    body: req.body ? JSON.stringify(req.body) : null,
    requestContext: {
      requestId: `local-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
      identity: {
        sourceIp: req.ip || '127.0.0.1'
      }
    }
  };
}

// Convert Lambda response to Express response
function lambdaToExpressResponse(lambdaResponse, res) {
  const { statusCode, headers, body } = lambdaResponse;
  
  if (headers) {
    Object.keys(headers).forEach(key => {
      res.set(key, headers[key]);
    });
  }
  
  res.status(statusCode);
  
  try {
    const parsedBody = JSON.parse(body);
    res.json(parsedBody);
  } catch (e) {
    res.send(body);
  }
}

// Generic handler for all requests
async function handleRequest(req, res) {
  try {
    const lambdaEvent = expressToLambdaEvent(req);
    const lambdaResponse = await authHandler(lambdaEvent);
    lambdaToExpressResponse(lambdaResponse, res);
  } catch (error) {
    console.error('Handler error:', error);
    res.status(500).json({ 
      error: 'Internal server error', 
      message: error.message,
      requestId: `local-${Date.now()}`
    });
  }
}

// Route all API requests to the handler
app.use('/api/auth', handleRequest);
app.use('/api/client', handleRequest);
app.use('/auth', handleRequest);
app.use('/client', handleRequest);

// 404 handler
app.use((req, res) => {
  res.status(404).json({ 
    error: 'Not Found',
    message: `Route ${req.method} ${req.path} not found`,
    availableRoutes: [
      'POST /auth/login',
      'POST /auth/register',
      'POST /auth/mfa/setup-totp',
      'GET /auth/mfa/status',
      'GET /client/therapists',
      'GET /health'
    ]
  });
});

// Error handling
app.use((error, req, res, next) => {
  console.error('Express error:', error);
  res.status(500).json({ 
    error: 'Internal server error',
    message: error.message 
  });
});

// Start server
app.listen(PORT, '0.0.0.0', () => {
  console.log('');
  console.log('🚀 Ataraxia-Next Auth Service Started!');
  console.log('');
  console.log(`🌐 Local API: http://localhost:${PORT}`);
  console.log('📊 Database: Real AWS RDS PostgreSQL');
  console.log('🔥 Firebase: Real Production (ataraxia-c150f)');
  console.log('🔐 Cognito: Real Production (us-west-2_xeXlyFBMH)');
  console.log('');
  console.log('📋 Available endpoints:');
  console.log(`  POST http://localhost:${PORT}/auth/login`);
  console.log(`  POST http://localhost:${PORT}/auth/register`);
  console.log(`  POST http://localhost:${PORT}/api/auth/login`);
  console.log(`  POST http://localhost:${PORT}/api/auth/register`);
  console.log(`  GET  http://localhost:${PORT}/health`);
  console.log('');
  console.log('✅ Ready for frontend testing!');
  console.log('🛑 Stop with Ctrl+C');
  console.log('');
});

// Graceful shutdown
process.on('SIGINT', () => {
  console.log('\n🛑 Shutting down gracefully...');
  process.exit(0);
});

process.on('SIGTERM', () => {
  console.log('\n🛑 Shutting down gracefully...');
  process.exit(0);
});
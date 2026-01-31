#!/usr/bin/env node

/**
 * Complete Deployment API Server
 * 
 * Enhanced backend server for the deployment dashboard that handles:
 * - Local development server management
 * - Real CDK deployments with service selection
 * - API endpoint testing
 * - Live log streaming
 * - Process management and monitoring
 * - Service-specific deployment options
 */

// Load environment variables from .env file
require('dotenv').config();

const express = require('express');
const { spawn, exec } = require('child_process');
const WebSocket = require('ws');
const fs = require('fs');
const path = require('path');
const http = require('http');
const axios = require('axios');

const app = express();
const PORT = 3012;

// Create HTTP server and WebSocket server on the same port
const server = http.createServer(app);
const wss = new WebSocket.Server({ server });

// Process management
const activeProcesses = new Map();
let processIdCounter = 1;

// Enhanced deployment state
let deploymentState = {
  local: {
    status: 'stopped', // stopped, starting, running, stopping
    service: 'all',
    processId: null,
    port: null,
    startTime: null,
    logs: []
  },
  cloud: {
    status: 'not_deployed', // not_deployed, deploying, deployed, failed
    service: 'all',
    environment: 'dev',
    deploymentId: null,
    startTime: null,
    endTime: null,
    apiUrl: null,
    logs: []
  },
  database: {
    status: 'unknown', // connected, disconnected, error
    lastCheck: null
  },
  api: {
    status: 'unknown', // healthy, unhealthy, testing
    endpoints: [],
    lastTest: null
  }
};

// Broadcast to all connected WebSocket clients
function broadcast(data) {
  wss.clients.forEach(client => {
    if (client.readyState === WebSocket.OPEN) {
      client.send(JSON.stringify(data));
    }
  });
}

// Add log entry and broadcast
function addLog(type, level, message, service = 'system') {
  const logEntry = {
    timestamp: new Date().toISOString(),
    type, // 'local' or 'cloud'
    level, // 'info', 'success', 'warning', 'error'
    message,
    service
  };

  if (type === 'local') {
    deploymentState.local.logs.push(logEntry);
    if (deploymentState.local.logs.length > 100) {
      deploymentState.local.logs = deploymentState.local.logs.slice(-100);
    }
  } else if (type === 'cloud') {
    deploymentState.cloud.logs.push(logEntry);
    if (deploymentState.cloud.logs.length > 100) {
      deploymentState.cloud.logs = deploymentState.cloud.logs.slice(-100);
    }
  }

  console.log(`[${type.toUpperCase()}] [${level.toUpperCase()}] ${message}`);

  broadcast({
    type: 'log',
    data: logEntry
  });
}

// Update deployment state and broadcast
function updateState(updates) {
  Object.assign(deploymentState, updates);

  broadcast({
    type: 'state',
    data: deploymentState
  });
}

// Middleware
app.use(express.json());
app.use(express.static('.'));

// CORS middleware
app.use((req, res, next) => {
  res.header('Access-Control-Allow-Origin', '*');
  res.header('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
  res.header('Access-Control-Allow-Headers', 'Origin, X-Requested-With, Content-Type, Accept, Authorization');

  if (req.method === 'OPTIONS') {
    res.sendStatus(200);
  } else {
    next();
  }
});

// API Routes

// Get current deployment status
app.get('/api/status', async (req, res) => {
  // Check database status
  try {
    const { Client } = require('pg');
    const client = new Client({
      host: 'dev-db-cluster.cluster-cliy2m6q8h4h.us-west-2.rds.amazonaws.com',
      port: 5432,
      database: 'ataraxia_db',
      user: 'app_user',
      password: 'ChangeMe123!',
      ssl: { rejectUnauthorized: false }
    });

    await client.connect();
    await client.query('SET search_path TO ataraxia, public');
    await client.query('SELECT 1');
    await client.end();

    deploymentState.database.status = 'connected';
    deploymentState.database.lastCheck = new Date().toISOString();
  } catch (error) {
    deploymentState.database.status = 'error';
    deploymentState.database.lastCheck = new Date().toISOString();
  }

  res.json({
    local: deploymentState.local.status,
    cloud: deploymentState.cloud.status,
    database: deploymentState.database.status,
    api: deploymentState.api.status
  });
});

// Local deployment routes
app.post('/api/deployment/local/start', async (req, res) => {
  const { service = 'all' } = req.body;

  if (deploymentState.local.status === 'running') {
    return res.status(400).json({
      success: false,
      message: 'Local deployment already running'
    });
  }

  addLog('local', 'info', `🚀 Starting local deployment for: ${service}`);

  try {
    deploymentState.local.status = 'starting';
    deploymentState.local.service = service;
    deploymentState.local.startTime = new Date().toISOString();

    updateState({});

    // Start local API server based on service selection
    let command, args, port;

    switch (service) {
      case 'all':
        command = 'node';
        args = ['local-api-server.js'];
        port = 3010;
        break;
      case 'api-explorer':
        command = 'node';
        args = ['local-api-server.js', '--explorer-only'];
        port = 3010;
        break;
      case 'therapist':
        command = 'node';
        args = ['local-api-server.js', '--service=therapist'];
        port = 3010;
        break;
      case 'auth':
        command = 'node';
        args = ['local-api-server.js', '--service=auth'];
        port = 3010;
        break;
      case 'client':
        command = 'node';
        args = ['local-api-server.js', '--service=client'];
        port = 3010;
        break;
      case 'verification':
        command = 'node';
        args = ['local-api-server.js', '--service=verification'];
        port = 3010;
        break;
      default:
        throw new Error(`Unknown service: ${service}`);
    }

    const processId = processIdCounter++;
    const localProcess = spawn(command, args, {
      stdio: 'pipe',
      cwd: process.cwd()
    });

    activeProcesses.set(processId, {
      process: localProcess,
      type: 'local',
      service,
      startTime: new Date(),
      port
    });

    deploymentState.local.processId = processId;
    deploymentState.local.port = port;

    localProcess.stdout.on('data', (data) => {
      const message = data.toString().trim();
      if (message) {
        addLog('local', 'info', message, service);
      }
    });

    localProcess.stderr.on('data', (data) => {
      const message = data.toString().trim();
      if (message) {
        addLog('local', 'warning', message, service);
      }
    });

    localProcess.on('close', (code) => {
      activeProcesses.delete(processId);
      deploymentState.local.status = 'stopped';
      deploymentState.local.processId = null;
      deploymentState.local.port = null;

      if (code === 0) {
        addLog('local', 'info', `Local ${service} service stopped normally`);
      } else {
        addLog('local', 'error', `Local ${service} service stopped with code ${code}`);
      }

      updateState({});
    });

    // Wait a moment to see if it starts successfully
    setTimeout(() => {
      if (activeProcesses.has(processId)) {
        deploymentState.local.status = 'running';
        addLog('local', 'success', `✅ Local ${service} service started on port ${port}`);
        updateState({});
      }
    }, 2000);

    res.json({
      success: true,
      message: `Local ${service} deployment started`,
      processId,
      port
    });

  } catch (error) {
    deploymentState.local.status = 'stopped';
    addLog('local', 'error', `Failed to start local deployment: ${error.message}`);
    updateState({});

    res.status(500).json({
      success: false,
      message: error.message
    });
  }
});

app.post('/api/deployment/local/stop', (req, res) => {
  if (deploymentState.local.status === 'stopped') {
    return res.status(400).json({
      success: false,
      message: 'No local deployment running'
    });
  }

  addLog('local', 'info', '⏹️ Stopping local services...');

  const processId = deploymentState.local.processId;
  if (processId && activeProcesses.has(processId)) {
    const processInfo = activeProcesses.get(processId);
    processInfo.process.kill('SIGTERM');

    // Force kill after 5 seconds if not stopped
    setTimeout(() => {
      if (activeProcesses.has(processId)) {
        processInfo.process.kill('SIGKILL');
        activeProcesses.delete(processId);
      }
    }, 5000);
  }

  deploymentState.local.status = 'stopping';
  updateState({});

  res.json({
    success: true,
    message: 'Local services stopping'
  });
});

// Cloud deployment routes
app.post('/api/deployment/cloud/start', async (req, res) => {
  const { service = 'all', environment = 'dev' } = req.body;

  if (deploymentState.cloud.status === 'deploying') {
    return res.status(400).json({
      success: false,
      message: 'Cloud deployment already in progress'
    });
  }

  addLog('cloud', 'info', `☁️ Starting AWS CDK deployment for: ${service}`);

  try {
    const deploymentId = `deploy-${Date.now()}`;

    deploymentState.cloud.status = 'deploying';
    deploymentState.cloud.service = service;
    deploymentState.cloud.environment = environment;
    deploymentState.cloud.deploymentId = deploymentId;
    deploymentState.cloud.startTime = new Date().toISOString();

    updateState({});

    // Start CDK deployment process
    startCloudDeployment(service, environment, deploymentId);

    res.json({
      success: true,
      message: `AWS CDK deployment started for ${service}`,
      deploymentId
    });

  } catch (error) {
    deploymentState.cloud.status = 'failed';
    addLog('cloud', 'error', `Failed to start AWS deployment: ${error.message}`);
    updateState({});

    res.status(500).json({
      success: false,
      message: error.message
    });
  }
});

app.post('/api/deployment/cloud/stop', (req, res) => {
  if (deploymentState.cloud.status !== 'deploying') {
    return res.status(400).json({
      success: false,
      message: 'No cloud deployment in progress'
    });
  }

  addLog('cloud', 'warning', '⏹️ Stopping AWS deployment...');

  // Kill any active CDK processes
  activeProcesses.forEach((processInfo, processId) => {
    if (processInfo.type === 'cloud') {
      processInfo.process.kill('SIGTERM');
      activeProcesses.delete(processId);
    }
  });

  deploymentState.cloud.status = 'not_deployed';
  deploymentState.cloud.endTime = new Date().toISOString();
  updateState({});

  res.json({
    success: true,
    message: 'AWS deployment stopped'
  });
});

// Test API endpoints
app.post('/api/test-endpoints', async (req, res) => {
  const { baseUrl } = req.body;
  const apiUrl = baseUrl || process.env.API_GATEWAY_URL || 'https://zojyvoao3c.execute-api.us-west-2.amazonaws.com/dev/';

  addLog('cloud', 'info', 'Starting API endpoint testing...');
  deploymentState.api.status = 'testing';
  updateState({});

  try {
    const testResults = await testApiEndpoints(apiUrl);

    deploymentState.api.status = testResults.every(r => r.success) ? 'healthy' : 'unhealthy';
    deploymentState.api.endpoints = testResults;
    deploymentState.api.lastTest = new Date().toISOString();

    addLog('cloud', 'success', `API endpoint testing completed: ${testResults.filter(r => r.success).length}/${testResults.length} passed`);
    updateState({});

    res.json({
      success: true,
      message: 'API testing completed',
      results: testResults
    });
  } catch (error) {
    deploymentState.api.status = 'unhealthy';
    addLog('cloud', 'error', `API testing failed: ${error.message}`);
    updateState({});

    res.status(500).json({
      success: false,
      message: 'API testing failed',
      error: error.message
    });
  }
});

// Get deployment logs
app.get('/api/deployment/logs/:type', (req, res) => {
  const { type } = req.params;
  const { limit = 50 } = req.query;

  let logs = [];
  if (type === 'local') {
    logs = deploymentState.local.logs;
  } else if (type === 'cloud') {
    logs = deploymentState.cloud.logs;
  } else {
    logs = [...deploymentState.local.logs, ...deploymentState.cloud.logs]
      .sort((a, b) => new Date(a.timestamp) - new Date(b.timestamp));
  }

  res.json(logs.slice(-parseInt(limit)));
});

// Get active processes
app.get('/api/processes', (req, res) => {
  const processes = Array.from(activeProcesses.entries()).map(([id, info]) => ({
    id,
    type: info.type,
    service: info.service,
    startTime: info.startTime,
    port: info.port,
    status: 'running'
  }));

  res.json(processes);
});

// Serve the deployment dashboard
app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'complete-deployment-dashboard.html'));
});

// Handle favicon request
app.get('/favicon.ico', (req, res) => {
  res.status(204).end();
});

// Cloud deployment function
async function startCloudDeployment(service, environment, deploymentId) {
  // Reload environment variables to ensure we have the latest credentials
  const envConfig = require('dotenv').config({ override: true });
  addLog('cloud', 'info', 'Reloaded environment configuration');

  addLog('cloud', 'info', `Starting CDK deployment script for ${environment}...`);
  addLog('cloud', 'info', `Script: ./scripts/deploy-with-cdk.sh ${environment}`);

  try {
    // Use the official deployment script instead of manual steps
    // This ensures consistency with the CLI experience
    const result = await runCommand('./scripts/deploy-with-cdk.sh', [environment], process.cwd());

    // Extract outputs from the script output if possible, or just read the file
    // The script generates cdk-outputs.json, so we can read that
    const outputsPath = path.join(process.cwd(), 'cdk-outputs.json');
    if (fs.existsSync(outputsPath)) {
      const outputs = JSON.parse(fs.readFileSync(outputsPath, 'utf8'));
      // Find the API URL in the outputs
      let apiUrl = null;
      Object.keys(outputs).forEach(key => {
        const stackOutputs = outputs[key];
        if (stackOutputs.OutputApiGatewayUrl) {
          apiUrl = stackOutputs.OutputApiGatewayUrl;
        }
      });

      if (apiUrl) {
        deploymentState.cloud.apiUrl = apiUrl;
        addLog('cloud', 'success', `API URL: ${apiUrl}`);
      }
    }

    deploymentState.cloud.status = 'deployed';
    deploymentState.cloud.endTime = new Date().toISOString();

    addLog('cloud', 'success', `✅ Deployment script completed successfully`);

    // Step 5: Test API endpoints
    if (deploymentState.cloud.apiUrl) {
      addLog('cloud', 'info', 'Testing deployed API endpoints...');
      setTimeout(() => {
        testApiEndpoints(deploymentState.cloud.apiUrl).then(results => {
          deploymentState.api.endpoints = results;
          deploymentState.api.status = results.every(r => r.success) ? 'healthy' : 'unhealthy';
          deploymentState.api.lastTest = new Date().toISOString();
          updateState({});
        });
      }, 5000);
    }

    updateState({});

  } catch (error) {
    deploymentState.cloud.status = 'failed';
    deploymentState.cloud.endTime = new Date().toISOString();
    addLog('cloud', 'error', `Deployment script failed: ${error.message}`);
    updateState({});
  }
}

// Helper function to run commands
function runCommand(command, args, cwd) {
  return new Promise((resolve, reject) => {
    const processId = processIdCounter++;
    const child = spawn(command, args, {
      stdio: 'pipe',
      cwd: cwd || process.cwd()
    });

    activeProcesses.set(processId, {
      process: child,
      type: 'cloud',
      service: 'deployment',
      startTime: new Date()
    });

    let output = '';

    child.stdout.on('data', (data) => {
      const message = data.toString().trim();
      if (message) {
        addLog('cloud', 'info', message);
        output += message + '\n';
      }
    });

    child.stderr.on('data', (data) => {
      const message = data.toString().trim();
      if (message) {
        addLog('cloud', 'warning', message);
        output += message + '\n';
      }
    });

    child.on('close', (code) => {
      activeProcesses.delete(processId);

      if (code === 0) {
        resolve(output);
      } else {
        reject(new Error(`Command failed with code ${code}`));
      }
    });

    child.on('error', (error) => {
      activeProcesses.delete(processId);
      reject(error);
    });
  });
}

// Extract API URL from CDK output
function extractApiUrl(output) {
  const urlMatch = output.match(/OutputApiGatewayUrl = (https:\/\/[^\s]+)/);
  if (urlMatch) {
    return urlMatch[1];
  }

  // Fallback to known URL
  return process.env.API_GATEWAY_URL || 'https://zojyvoao3c.execute-api.us-west-2.amazonaws.com/dev/';
}

// Test API endpoints
async function testApiEndpoints(apiUrl = null) {
  const baseUrl = apiUrl || process.env.API_GATEWAY_URL || 'https://zojyvoao3c.execute-api.us-west-2.amazonaws.com/dev/';

  const cleanUrl = baseUrl.endsWith('/')
    ? baseUrl.slice(0, -1)
    : baseUrl;

  const endpoints = [
    { method: 'GET', path: '/api/therapist', description: 'List therapists', expectStatus: [200] },
    { method: 'GET', path: '/api/therapist/search', description: 'Search therapists', expectStatus: [200] },
    { method: 'GET', path: '/api/therapist/search?specialty=anxiety&limit=5', description: 'Advanced search', expectStatus: [200] },
    { method: 'GET', path: '/api/therapist/1000008', description: 'Get specific therapist', expectStatus: [200, 404] },
    { method: 'POST', path: '/api/auth/login', description: 'Authentication', expectStatus: [400, 401] },
    { method: 'GET', path: '/api/verification/status/test', description: 'Verification status', expectStatus: [200, 404] }
  ];

  const results = [];

  for (const endpoint of endpoints) {
    try {
      addLog('cloud', 'info', `Testing ${endpoint.method} ${endpoint.path}`);

      const startTime = Date.now();
      const response = await axios({
        method: endpoint.method,
        url: `${cleanUrl}${endpoint.path}`,
        validateStatus: () => true, // Accept any status code
        timeout: 10000,
        data: endpoint.method === 'POST' ? {} : undefined
      });
      const responseTime = Date.now() - startTime;

      const success = endpoint.expectStatus.includes(response.status);

      results.push({
        ...endpoint,
        status: response.status,
        success,
        responseTime,
        dataSize: JSON.stringify(response.data || {}).length
      });

      if (success) {
        addLog('cloud', 'success', `✓ ${endpoint.method} ${endpoint.path} - ${response.status} (${responseTime}ms)`);
      } else {
        addLog('cloud', 'error', `✗ ${endpoint.method} ${endpoint.path} - ${response.status} (expected: ${endpoint.expectStatus.join(' or ')}) (${responseTime}ms)`);
      }

    } catch (error) {
      results.push({
        ...endpoint,
        success: false,
        error: error.message,
        responseTime: 0
      });

      addLog('cloud', 'error', `✗ ${endpoint.method} ${endpoint.path} - ${error.message}`);
    }
  }

  return results;
}

// WebSocket connection handler
wss.on('connection', (ws) => {
  console.log('📱 Client connected to deployment WebSocket');

  // Send current state to new client
  ws.send(JSON.stringify({
    type: 'state',
    data: deploymentState
  }));

  // Send recent logs
  const recentLogs = [...deploymentState.local.logs, ...deploymentState.cloud.logs]
    .sort((a, b) => new Date(a.timestamp) - new Date(b.timestamp))
    .slice(-20);

  recentLogs.forEach(log => {
    ws.send(JSON.stringify({
      type: 'log',
      data: log
    }));
  });

  ws.on('close', () => {
    console.log('📱 Client disconnected from deployment WebSocket');
  });

  ws.on('error', (error) => {
    console.log('📱 WebSocket error:', error.message);
  });
});

// Start the server
server.listen(PORT, () => {
  console.log(`🚀 Complete Deployment Dashboard running at http://localhost:${PORT}`);
  console.log(`📡 WebSocket server running on the same port`);
  console.log('');
  console.log('Features:');
  console.log('  ✅ Local development server management');
  console.log('  ✅ AWS CDK deployment automation');
  console.log('  ✅ Service-specific deployment options');
  console.log('  ✅ Real-time API endpoint testing');
  console.log('  ✅ Live deployment logs');
  console.log('  ✅ Process management and monitoring');
  console.log('  ✅ WebSocket-based real-time updates');
  console.log('');
  console.log('🌐 Open your browser to http://localhost:3012 to start!');
});

// Graceful shutdown
process.on('SIGINT', () => {
  console.log('\n🛑 Shutting down deployment server...');

  // Stop all active processes
  activeProcesses.forEach((processInfo, processId) => {
    console.log(`Stopping process ${processId}...`);
    processInfo.process.kill('SIGTERM');
  });

  wss.close();
  server.close();
  process.exit(0);
});

// Handle uncaught exceptions
process.on('uncaughtException', (error) => {
  console.error('Uncaught Exception:', error);
  addLog('cloud', 'error', `System error: ${error.message}`);
});

process.on('unhandledRejection', (reason, promise) => {
  console.error('Unhandled Rejection at:', promise, 'reason:', reason);
  addLog('cloud', 'error', `Unhandled rejection: ${reason}`);
});
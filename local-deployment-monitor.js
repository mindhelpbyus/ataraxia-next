#!/usr/bin/env node

/**
 * Local Deployment Monitor
 * 
 * Real-time deployment monitoring dashboard with:
 * - Live deployment progress tracking
 * - Retry mechanism monitoring
 * - Build failure detection and recovery
 * - Performance metrics
 * - Interactive deployment controls
 */

const express = require('express');
const { spawn } = require('child_process');
const fs = require('fs');
const path = require('path');
const WebSocket = require('ws');
const chokidar = require('chokidar');

const app = express();
const PORT = 3011;

// Deployment state
let deploymentState = {
  status: 'idle', // idle, running, success, failed
  currentStep: '',
  progress: 0,
  startTime: null,
  endTime: null,
  logs: [],
  metrics: {
    buildTime: 0,
    deployTime: 0,
    testTime: 0,
    totalTime: 0
  },
  retries: {
    current: 0,
    max: 3,
    failures: []
  },
  environment: 'dev',
  deploymentId: null
};

// WebSocket server for real-time updates
const wss = new WebSocket.Server({ port: 8080 });

// Broadcast to all connected clients
function broadcast(data) {
  wss.clients.forEach(client => {
    if (client.readyState === WebSocket.OPEN) {
      client.send(JSON.stringify(data));
    }
  });
}

// Add log entry
function addLog(level, message, step = null) {
  const logEntry = {
    timestamp: new Date().toISOString(),
    level,
    message,
    step: step || deploymentState.currentStep
  };
  
  deploymentState.logs.push(logEntry);
  
  // Keep only last 1000 log entries
  if (deploymentState.logs.length > 1000) {
    deploymentState.logs = deploymentState.logs.slice(-1000);
  }
  
  console.log(`[${level.toUpperCase()}] ${message}`);
  
  broadcast({
    type: 'log',
    data: logEntry
  });
}

// Update deployment state
function updateState(updates) {
  Object.assign(deploymentState, updates);
  
  broadcast({
    type: 'state',
    data: deploymentState
  });
}

// Deployment steps configuration
const deploymentSteps = [
  { name: 'Prerequisites', weight: 5 },
  { name: 'TypeScript Validation', weight: 10 },
  { name: 'Build Lambda Functions', weight: 20 },
  { name: 'Run Tests', weight: 15 },
  { name: 'Prepare CDK', weight: 10 },
  { name: 'Bootstrap CDK', weight: 10 },
  { name: 'Deploy CDK Stack', weight: 25 },
  { name: 'Validate Deployment', weight: 10 },
  { name: 'Update Configuration', weight: 5 },
  { name: 'Run Enhanced Tests', weight: 15 },
  { name: 'Generate Report', weight: 5 }
];

// Calculate progress based on current step
function calculateProgress(stepName) {
  let totalWeight = 0;
  let completedWeight = 0;
  
  for (const step of deploymentSteps) {
    totalWeight += step.weight;
    if (step.name === stepName) {
      break;
    }
    completedWeight += step.weight;
  }
  
  return Math.round((completedWeight / totalWeight) * 100);
}

// Start deployment
function startDeployment(environment = 'dev', skipBootstrap = false) {
  if (deploymentState.status === 'running') {
    addLog('warning', 'Deployment already in progress');
    return false;
  }
  
  const deploymentId = `deploy-${Date.now()}`;
  
  updateState({
    status: 'running',
    startTime: new Date(),
    endTime: null,
    deploymentId,
    environment,
    progress: 0,
    logs: [],
    retries: { current: 0, max: 3, failures: [] }
  });
  
  addLog('info', `Starting enhanced therapist service deployment`, 'Initialization');
  addLog('info', `Deployment ID: ${deploymentId}`);
  addLog('info', `Environment: ${environment}`);
  addLog('info', `Skip Bootstrap: ${skipBootstrap}`);
  
  // Start deployment script
  const scriptPath = './scripts/deploy-enhanced-therapist-service.sh';
  const args = [environment, skipBootstrap.toString()];
  
  const deployment = spawn('bash', [scriptPath, ...args], {
    cwd: process.cwd(),
    env: { ...process.env, FORCE_COLOR: '1' }
  });
  
  let currentStep = 'Prerequisites';
  updateState({ currentStep, progress: calculateProgress(currentStep) });
  
  // Parse deployment output
  deployment.stdout.on('data', (data) => {
    const output = data.toString();
    const lines = output.split('\n').filter(line => line.trim());
    
    lines.forEach(line => {
      // Parse step headers
      if (line.includes('================================================================================================')) {
        return; // Skip separator lines
      }
      
      // Detect step changes
      const stepMatch = line.match(/🔍|📋|🔨|🧪|📦|🏗️|🚀|✅|⚙️|📊/);
      if (stepMatch) {
        const stepName = extractStepName(line);
        if (stepName) {
          currentStep = stepName;
          updateState({ 
            currentStep, 
            progress: calculateProgress(currentStep) 
          });
          addLog('info', `Starting step: ${stepName}`, stepName);
        }
      }
      
      // Parse log levels
      if (line.includes('[INFO]')) {
        addLog('info', line.replace(/.*\[INFO\]\s*/, ''));
      } else if (line.includes('[SUCCESS]')) {
        addLog('success', line.replace(/.*\[SUCCESS\]\s*/, ''));
      } else if (line.includes('[WARNING]')) {
        addLog('warning', line.replace(/.*\[WARNING\]\s*/, ''));
      } else if (line.includes('[ERROR]')) {
        addLog('error', line.replace(/.*\[ERROR\]\s*/, ''));
      } else if (line.includes('[PROGRESS]')) {
        addLog('progress', line.replace(/.*\[PROGRESS\]\s*/, ''));
      } else if (line.trim()) {
        addLog('info', line);
      }
    });
  });
  
  deployment.stderr.on('data', (data) => {
    const output = data.toString();
    addLog('error', output);
  });
  
  deployment.on('close', (code) => {
    const endTime = new Date();
    const totalTime = endTime - deploymentState.startTime;
    
    if (code === 0) {
      updateState({
        status: 'success',
        endTime,
        progress: 100,
        currentStep: 'Complete',
        metrics: { ...deploymentState.metrics, totalTime }
      });
      addLog('success', `Deployment completed successfully in ${Math.round(totalTime / 1000)}s`);
    } else {
      updateState({
        status: 'failed',
        endTime,
        currentStep: 'Failed'
      });
      addLog('error', `Deployment failed with exit code ${code}`);
      
      // Handle retry logic
      if (deploymentState.retries.current < deploymentState.retries.max) {
        const retryDelay = 30000; // 30 seconds
        addLog('warning', `Retrying deployment in ${retryDelay / 1000}s...`);
        
        setTimeout(() => {
          deploymentState.retries.current++;
          deploymentState.retries.failures.push({
            timestamp: new Date(),
            exitCode: code,
            step: currentStep
          });
          
          startDeployment(environment, skipBootstrap);
        }, retryDelay);
      }
    }
  });
  
  return true;
}

// Extract step name from log line
function extractStepName(line) {
  const stepMappings = {
    '📋': 'Prerequisites',
    '🔍': 'TypeScript Validation',
    '🔨': 'Build Lambda Functions',
    '🧪': 'Run Tests',
    '📦': 'Prepare CDK',
    '🏗️': 'Bootstrap CDK',
    '🚀': 'Deploy CDK Stack',
    '✅': 'Validate Deployment',
    '⚙️': 'Update Configuration',
    '📊': 'Generate Report'
  };
  
  for (const [emoji, stepName] of Object.entries(stepMappings)) {
    if (line.includes(emoji)) {
      return stepName;
    }
  }
  
  return null;
}

// Watch for log file changes
function watchLogFiles() {
  const logDir = './deployment-logs';
  
  if (!fs.existsSync(logDir)) {
    fs.mkdirSync(logDir, { recursive: true });
  }
  
  const watcher = chokidar.watch(`${logDir}/*.log`, {
    ignored: /^\./, 
    persistent: true
  });
  
  watcher.on('change', (filePath) => {
    addLog('info', `Log file updated: ${path.basename(filePath)}`);
  });
}

// Serve static files
app.use(express.static('public'));
app.use(express.json());

// API endpoints
app.get('/api/status', (req, res) => {
  res.json(deploymentState);
});

app.post('/api/deploy', (req, res) => {
  const { environment = 'dev', skipBootstrap = false } = req.body;
  
  if (startDeployment(environment, skipBootstrap)) {
    res.json({ success: true, message: 'Deployment started' });
  } else {
    res.json({ success: false, message: 'Deployment already in progress' });
  }
});

app.post('/api/stop', (req, res) => {
  if (deploymentState.status === 'running') {
    updateState({ status: 'stopped' });
    addLog('warning', 'Deployment stopped by user');
    res.json({ success: true, message: 'Deployment stopped' });
  } else {
    res.json({ success: false, message: 'No deployment in progress' });
  }
});

app.get('/api/logs', (req, res) => {
  const { level, limit = 100 } = req.query;
  
  let logs = deploymentState.logs;
  
  if (level) {
    logs = logs.filter(log => log.level === level);
  }
  
  res.json(logs.slice(-parseInt(limit)));
});

// Serve the monitoring dashboard
app.get('/', (req, res) => {
  res.send(`
<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Ataraxia Deployment Monitor</title>
    <style>
        * { margin: 0; padding: 0; box-sizing: border-box; }
        body { 
            font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif; 
            background: #1a1a1a; 
            color: #fff; 
            line-height: 1.6;
        }
        .container { max-width: 1400px; margin: 0 auto; padding: 20px; }
        .header { 
            background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); 
            padding: 20px; 
            border-radius: 10px; 
            margin-bottom: 20px; 
            text-align: center;
        }
        .header h1 { font-size: 2.5em; margin-bottom: 10px; }
        .header p { font-size: 1.2em; opacity: 0.9; }
        
        .dashboard { display: grid; grid-template-columns: 1fr 1fr; gap: 20px; margin-bottom: 20px; }
        .card { 
            background: #2d2d2d; 
            border-radius: 10px; 
            padding: 20px; 
            border: 1px solid #444;
        }
        .card h3 { margin-bottom: 15px; color: #4CAF50; }
        
        .status-indicator {
            display: inline-block;
            width: 12px;
            height: 12px;
            border-radius: 50%;
            margin-right: 8px;
        }
        .status-idle { background: #666; }
        .status-running { background: #2196F3; animation: pulse 1s infinite; }
        .status-success { background: #4CAF50; }
        .status-failed { background: #f44336; }
        
        @keyframes pulse {
            0% { opacity: 1; }
            50% { opacity: 0.5; }
            100% { opacity: 1; }
        }
        
        .progress-bar {
            width: 100%;
            height: 20px;
            background: #444;
            border-radius: 10px;
            overflow: hidden;
            margin: 10px 0;
        }
        .progress-fill {
            height: 100%;
            background: linear-gradient(90deg, #4CAF50, #45a049);
            transition: width 0.3s ease;
        }
        
        .controls { margin-bottom: 20px; }
        .btn {
            background: #4CAF50;
            color: white;
            border: none;
            padding: 12px 24px;
            border-radius: 5px;
            cursor: pointer;
            margin-right: 10px;
            font-size: 16px;
        }
        .btn:hover { background: #45a049; }
        .btn:disabled { background: #666; cursor: not-allowed; }
        .btn-danger { background: #f44336; }
        .btn-danger:hover { background: #da190b; }
        
        .logs-container {
            background: #1e1e1e;
            border-radius: 10px;
            padding: 20px;
            height: 400px;
            overflow-y: auto;
            font-family: 'Courier New', monospace;
            border: 1px solid #444;
        }
        .log-entry {
            margin-bottom: 5px;
            padding: 5px;
            border-radius: 3px;
        }
        .log-info { color: #2196F3; }
        .log-success { color: #4CAF50; }
        .log-warning { color: #FF9800; }
        .log-error { color: #f44336; background: rgba(244, 67, 54, 0.1); }
        .log-progress { color: #9C27B0; }
        
        .metrics { display: grid; grid-template-columns: repeat(auto-fit, minmax(200px, 1fr)); gap: 15px; }
        .metric {
            background: #333;
            padding: 15px;
            border-radius: 8px;
            text-align: center;
        }
        .metric-value { font-size: 2em; font-weight: bold; color: #4CAF50; }
        .metric-label { color: #ccc; margin-top: 5px; }
        
        .step-progress {
            margin: 15px 0;
        }
        .step {
            display: flex;
            align-items: center;
            padding: 8px 0;
            border-bottom: 1px solid #444;
        }
        .step:last-child { border-bottom: none; }
        .step-icon {
            width: 20px;
            height: 20px;
            border-radius: 50%;
            margin-right: 10px;
            display: flex;
            align-items: center;
            justify-content: center;
            font-size: 12px;
        }
        .step-completed { background: #4CAF50; }
        .step-current { background: #2196F3; animation: pulse 1s infinite; }
        .step-pending { background: #666; }
    </style>
</head>
<body>
    <div class="container">
        <div class="header">
            <h1>🚀 Ataraxia Deployment Monitor</h1>
            <p>Enhanced Therapist Service Deployment Dashboard</p>
        </div>
        
        <div class="controls">
            <button class="btn" onclick="startDeployment()">Start Deployment</button>
            <button class="btn btn-danger" onclick="stopDeployment()">Stop Deployment</button>
            <select id="environment">
                <option value="dev">Development</option>
                <option value="staging">Staging</option>
                <option value="prod">Production</option>
            </select>
            <label>
                <input type="checkbox" id="skipBootstrap"> Skip Bootstrap
            </label>
        </div>
        
        <div class="dashboard">
            <div class="card">
                <h3>Deployment Status</h3>
                <div id="status">
                    <span class="status-indicator status-idle"></span>
                    <span id="statusText">Idle</span>
                </div>
                <div id="currentStep">Ready to deploy</div>
                <div class="progress-bar">
                    <div class="progress-fill" id="progressFill" style="width: 0%"></div>
                </div>
                <div id="progressText">0%</div>
            </div>
            
            <div class="card">
                <h3>Deployment Metrics</h3>
                <div class="metrics">
                    <div class="metric">
                        <div class="metric-value" id="totalTime">0s</div>
                        <div class="metric-label">Total Time</div>
                    </div>
                    <div class="metric">
                        <div class="metric-value" id="currentRetry">0</div>
                        <div class="metric-label">Retries</div>
                    </div>
                </div>
            </div>
        </div>
        
        <div class="card">
            <h3>Deployment Steps</h3>
            <div class="step-progress" id="stepProgress">
                <!-- Steps will be populated by JavaScript -->
            </div>
        </div>
        
        <div class="card">
            <h3>Live Logs</h3>
            <div class="logs-container" id="logs">
                <div class="log-entry log-info">Waiting for deployment to start...</div>
            </div>
        </div>
    </div>

    <script>
        const ws = new WebSocket('ws://localhost:8080');
        let deploymentState = {};
        
        const steps = [
            'Prerequisites', 'TypeScript Validation', 'Build Lambda Functions', 
            'Run Tests', 'Prepare CDK', 'Bootstrap CDK', 'Deploy CDK Stack',
            'Validate Deployment', 'Update Configuration', 'Run Enhanced Tests', 'Generate Report'
        ];
        
        // Initialize step progress
        function initializeSteps() {
            const stepProgress = document.getElementById('stepProgress');
            stepProgress.innerHTML = steps.map((step, index) => 
                \`<div class="step">
                    <div class="step-icon step-pending" id="step-\${index}">⏳</div>
                    <div>\${step}</div>
                </div>\`
            ).join('');
        }
        
        // Update step progress
        function updateStepProgress(currentStep) {
            const currentIndex = steps.indexOf(currentStep);
            
            steps.forEach((step, index) => {
                const stepIcon = document.getElementById(\`step-\${index}\`);
                if (index < currentIndex) {
                    stepIcon.className = 'step-icon step-completed';
                    stepIcon.textContent = '✅';
                } else if (index === currentIndex) {
                    stepIcon.className = 'step-icon step-current';
                    stepIcon.textContent = '🔄';
                } else {
                    stepIcon.className = 'step-icon step-pending';
                    stepIcon.textContent = '⏳';
                }
            });
        }
        
        ws.onmessage = function(event) {
            const message = JSON.parse(event.data);
            
            if (message.type === 'state') {
                deploymentState = message.data;
                updateUI();
            } else if (message.type === 'log') {
                addLogEntry(message.data);
            }
        };
        
        function updateUI() {
            const statusIndicator = document.querySelector('.status-indicator');
            const statusText = document.getElementById('statusText');
            const currentStep = document.getElementById('currentStep');
            const progressFill = document.getElementById('progressFill');
            const progressText = document.getElementById('progressText');
            const totalTime = document.getElementById('totalTime');
            const currentRetry = document.getElementById('currentRetry');
            
            // Update status
            statusIndicator.className = \`status-indicator status-\${deploymentState.status}\`;
            statusText.textContent = deploymentState.status.charAt(0).toUpperCase() + deploymentState.status.slice(1);
            
            // Update current step
            currentStep.textContent = deploymentState.currentStep || 'Ready to deploy';
            
            // Update progress
            progressFill.style.width = \`\${deploymentState.progress || 0}%\`;
            progressText.textContent = \`\${deploymentState.progress || 0}%\`;
            
            // Update metrics
            if (deploymentState.startTime) {
                const elapsed = deploymentState.endTime 
                    ? new Date(deploymentState.endTime) - new Date(deploymentState.startTime)
                    : Date.now() - new Date(deploymentState.startTime);
                totalTime.textContent = \`\${Math.round(elapsed / 1000)}s\`;
            }
            
            currentRetry.textContent = deploymentState.retries?.current || 0;
            
            // Update step progress
            if (deploymentState.currentStep) {
                updateStepProgress(deploymentState.currentStep);
            }
        }
        
        function addLogEntry(logEntry) {
            const logsContainer = document.getElementById('logs');
            const logDiv = document.createElement('div');
            logDiv.className = \`log-entry log-\${logEntry.level}\`;
            
            const timestamp = new Date(logEntry.timestamp).toLocaleTimeString();
            logDiv.innerHTML = \`[\${timestamp}] \${logEntry.message}\`;
            
            logsContainer.appendChild(logDiv);
            logsContainer.scrollTop = logsContainer.scrollHeight;
            
            // Keep only last 100 log entries
            while (logsContainer.children.length > 100) {
                logsContainer.removeChild(logsContainer.firstChild);
            }
        }
        
        async function startDeployment() {
            const environment = document.getElementById('environment').value;
            const skipBootstrap = document.getElementById('skipBootstrap').checked;
            
            const response = await fetch('/api/deploy', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ environment, skipBootstrap })
            });
            
            const result = await response.json();
            if (!result.success) {
                alert(result.message);
            }
        }
        
        async function stopDeployment() {
            const response = await fetch('/api/stop', { method: 'POST' });
            const result = await response.json();
            if (!result.success) {
                alert(result.message);
            }
        }
        
        // Initialize
        initializeSteps();
        
        // Load initial state
        fetch('/api/status')
            .then(response => response.json())
            .then(state => {
                deploymentState = state;
                updateUI();
            });
    </script>
</body>
</html>
  `);
});

// Start the server
app.listen(PORT, () => {
  console.log(`🖥️  Deployment Monitor running at http://localhost:${PORT}`);
  console.log(`📡 WebSocket server running on port 8080`);
  console.log('');
  console.log('Features:');
  console.log('  ✅ Real-time deployment progress');
  console.log('  ✅ Retry mechanism monitoring');
  console.log('  ✅ Build failure detection');
  console.log('  ✅ Interactive deployment controls');
  console.log('  ✅ Live log streaming');
  console.log('');
  console.log('Open your browser to start monitoring deployments!');
});

// Watch log files
watchLogFiles();

// Handle WebSocket connections
wss.on('connection', (ws) => {
  console.log('📱 Client connected to deployment monitor');
  
  // Send current state to new client
  ws.send(JSON.stringify({
    type: 'state',
    data: deploymentState
  }));
  
  ws.on('close', () => {
    console.log('📱 Client disconnected from deployment monitor');
  });
});

// Graceful shutdown
process.on('SIGINT', () => {
  console.log('\n🛑 Shutting down deployment monitor...');
  wss.close();
  process.exit(0);
});
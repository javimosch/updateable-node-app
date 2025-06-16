const express = require('express');
const basicAuth = require('express-basic-auth');
const { spawn } = require('child_process');
const multer = require('multer');
const unzipper = require('unzipper');
const fs = require('fs');
const path = require('path');
const WebSocket = require('ws');

const app = express();
const upload = multer({ dest: 'uploads/' });
const port = 3000;

// Configuration from web UI (default values)
let config = {
  command: 'npm run start',
  basePath: '/userapp'
};

// Child process for running the app
let appProcess = null;

// WebSocket server for real-time logs
const wss = new WebSocket.Server({ noServer: true });

// Basic auth middleware
// Support both WEBUI_ and UI_ env variable prefixes for backward compatibility
const usernameEnv = process.env.WEBUI_USER || process.env.UI_USER || 'admin';
const passwordEnv = process.env.WEBUI_PASSWORD || process.env.UI_PASSWORD || 'password';

const auth = basicAuth({
  users: { [usernameEnv]: passwordEnv },
  challenge: true
});

app.use(express.json());
app.use(express.static('public')); // Serve static files (e.g., HTML)

// Apply basic auth to all routes
app.use(auth);

// Web UI endpoint to set config
app.post('/config', (req, res) => {
  config.command = req.body.command || config.command;
  config.basePath = req.body.basePath || config.basePath;
  res.json({ message: 'Configuration updated', config });
});

// API to upload app zip
app.post('/upload', upload.single('file'), (req, res) => {
  const zipPath = req.file.path;
  const extractPath = config.basePath;

  // Stop running app if any
  if (appProcess) {
    appProcess.kill();
    appProcess = null;
  }

  // Clear and extract new app
  fs.rmSync(extractPath, { recursive: true, force: true });
  fs.mkdirSync(extractPath, { recursive: true });
  fs.createReadStream(zipPath)
    .pipe(unzipper.Extract({ path: extractPath }))
    .on('close', () => {
      fs.unlinkSync(zipPath); // Clean up zip
      startApp();
      res.json({ message: 'App uploaded and started' });
    })
    .on('error', (err) => res.status(500).json({ error: 'Failed to extract zip' }));
});

// Start the app with configured command
function startApp() {
  const [cmd, ...args] = config.command.split(' ');
  appProcess = spawn(cmd, args, { cwd: config.basePath, shell: true });

  appProcess.stdout.on('data', (data) => broadcastLog(data.toString()));
  appProcess.stderr.on('data', (data) => broadcastLog(data.toString()));
  appProcess.on('close', () => {
    appProcess = null;
    broadcastLog('App stopped');
  });
}

// Broadcast logs to WebSocket clients
function broadcastLog(message) {
  wss.clients.forEach((client) => {
    if (client.readyState === WebSocket.OPEN) {
      client.send(message);
    }
  });
}

// Stop the running application
app.post('/stop', (req, res) => {
  if (appProcess) {
    appProcess.kill();
    appProcess = null;
    broadcastLog('App stopped by user');
    return res.json({ message: 'App stopped' });
  }
  res.status(400).json({ error: 'No app is currently running' });
});

// Start the application manually (if not running)
app.post('/start', (req, res) => {
  if (appProcess) {
    return res.status(400).json({ error: 'App already running' });
  }
  startApp();
  res.json({ message: 'App started' });
});

// Status endpoint
app.get('/status', (req, res) => {
  res.json({ running: !!appProcess });
});

const server = app.listen(port, () => {
  console.log(`Server running on port ${port}`);
});

// Upgrade HTTP server for WebSockets
server.on('upgrade', (request, socket, head) => {
  wss.handleUpgrade(request, socket, head, (ws) => {
    wss.emit('connection', ws, request);
  });
});
const express = require('express');
const basicAuth = require('express-basic-auth');
const { spawn } = require('child_process');
const multer = require('multer');
const unzipper = require('unzipper');
const fs = require('fs');
const path = require('path');
const WebSocket = require('ws');

const app = express();
const port = 3000;

// --- Constants ---
const CONFIG_PATH = path.join(__dirname, 'config.json');
const DEPLOYMENTS_DIR = path.join(__dirname, 'deployments');
const MAX_DEPLOYMENTS = 5;

// --- Configuration Management ---
let config = {};

function saveConfig() {
  fs.writeFileSync(CONFIG_PATH, JSON.stringify(config, null, 2));
}

function loadConfig() {
  if (fs.existsSync(CONFIG_PATH)) {
    config = JSON.parse(fs.readFileSync(CONFIG_PATH));
  } else {
    config = {
      command: 'npm run start',
      basePath: '', // Will be set on first upload
      lastUploadDate: null,
    };
    saveConfig();
  }
}

// --- App Process Management ---
let appProcess = null;

// --- WebSocket Server ---
const wss = new WebSocket.Server({ noServer: true });

// --- Middleware ---
const upload = multer({ dest: 'uploads/' });
const usernameEnv = process.env.WEBUI_USER || process.env.UI_USER || 'admin';
const passwordEnv = process.env.WEBUI_PASSWORD || process.env.UI_PASSWORD || 'password';
const auth = basicAuth({
  users: { [usernameEnv]: passwordEnv },
  challenge: true,
});

app.use(express.json());
app.use(express.static('public'));
app.use(auth);

// --- API Endpoints ---

// Get status and config
app.get('/status', (req, res) => {
  res.json({ ...config, running: !!appProcess });
});

// Update config
app.post('/config', (req, res) => {
  config.command = req.body.command || config.command;
  saveConfig();
  res.json({ message: 'Configuration updated', config });
});

// Upload new app version
app.post('/upload', upload.single('file'), (req, res) => {
  if (appProcess) {
    appProcess.kill();
    appProcess = null;
  }

  const zipPath = req.file.path;
  const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
  const extractPath = path.join(DEPLOYMENTS_DIR, timestamp);

  fs.mkdirSync(extractPath, { recursive: true });
  fs.createReadStream(zipPath)
    .pipe(unzipper.Extract({ path: extractPath }))
    .on('close', () => {
      fs.unlinkSync(zipPath); // Clean up zip
      config.basePath = extractPath;
      config.lastUploadDate = new Date().toISOString();
      saveConfig();
      pruneDeployments();
      startApp();
      res.json({ message: 'App uploaded and started' });
    })
    .on('error', (err) => res.status(500).json({ error: 'Failed to extract zip' }));
});

// Stop the app
app.post('/stop', (req, res) => {
  if (appProcess) {
    appProcess.kill();
    appProcess = null;
    broadcastLog('App stopped by user');
    return res.json({ message: 'App stopped' });
  }
  res.status(400).json({ error: 'No app is currently running' });
});

// Start the app
app.post('/start', (req, res) => {
  if (appProcess) {
    return res.status(400).json({ error: 'App already running' });
  }
  if (!config.basePath || !fs.existsSync(config.basePath)) {
    return res.status(400).json({ error: 'No app has been uploaded yet' });
  }
  startApp();
  res.json({ message: 'App started' });
});

// --- Helper Functions ---

function startApp() {
  if (!config.basePath || !fs.existsSync(config.basePath)) {
    broadcastLog('Cannot start app: basePath is not set or does not exist.');
    return;
  }
  const [cmd, ...args] = config.command.split(' ');
  appProcess = spawn(cmd, args, { cwd: config.basePath, shell: true });

  appProcess.stdout.on('data', (data) => broadcastLog(data.toString()));
  appProcess.stderr.on('data', (data) => broadcastLog(data.toString()));
  appProcess.on('close', () => {
    appProcess = null;
    broadcastLog('App stopped');
  });
}

function broadcastLog(message) {
  wss.clients.forEach((client) => {
    if (client.readyState === WebSocket.OPEN) {
      client.send(message);
    }
  });
}

function pruneDeployments() {
  const deployments = fs.readdirSync(DEPLOYMENTS_DIR)
    .map(name => ({ name, path: path.join(DEPLOYMENTS_DIR, name) }))
    .filter(item => fs.statSync(item.path).isDirectory())
    .sort((a, b) => b.name.localeCompare(a.name)); // Sort descending by name (newest first)

  if (deployments.length > MAX_DEPLOYMENTS) {
    const toDelete = deployments.slice(MAX_DEPLOYMENTS);
    toDelete.forEach(dir => {
      fs.rmSync(dir.path, { recursive: true, force: true });
      broadcastLog(`Pruned old deployment: ${dir.name}`);
    });
  }
}

// --- Server Initialization ---

function initializeServer() {
  if (!fs.existsSync('uploads')) fs.mkdirSync('uploads');
  if (!fs.existsSync(DEPLOYMENTS_DIR)) fs.mkdirSync(DEPLOYMENTS_DIR);
  loadConfig();

  const server = app.listen(port, () => {
    console.log(`Server running on port ${port}`);
  });

  server.on('upgrade', (request, socket, head) => {
    wss.handleUpgrade(request, socket, head, (ws) => {
      wss.emit('connection', ws, request);
    });
  });
}

initializeServer();
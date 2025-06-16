const express = require('express');
const http = require('http');
const WebSocket = require('ws');
const { spawn } = require('child_process');
const multer = require('multer');
const fs = require('fs').promises;
const fsSync = require('fs');
const path = require('path');
const basicAuth = require('express-basic-auth');
const unzip = require('unzipper');
const { extractZip } = require('./utils/unzip');
const dotenv = require('dotenv');

const app = express();
const server = http.createServer(app);
const wss = new WebSocket.Server({ server });

// Debug server setup
console.debug('Server and WebSocket server created');

const port = process.env.PORT||3888;
const uploadsDir = path.join(__dirname, 'uploads');
const deploymentsDir = path.join(__dirname, 'deployments');
const envsDir = path.join(__dirname, 'env-configs');
const configPath = path.join(__dirname, 'config.json');

// --- Configuration ---
let config = {
  command: 'npm run start',
  basePath: null,
  lastUploadDate: null,
  selectedEnv: null,
};

async function loadConfig() {
  if (fsSync.existsSync(configPath)) {
    const rawData = await fs.readFile(configPath);
    const savedConfig = JSON.parse(rawData);
    config = { ...config, ...savedConfig };
  } else {
    await saveConfig();
  }
}

async function saveConfig() {
  await fs.writeFile(configPath, JSON.stringify(config, null, 2));
}

// --- Child Process Management ---
let appProcess = null;

async function startApp() {
  if (appProcess) {
    console.log('App is already running.');
    return;
  }
  if (!config.command || !config.basePath) {
    console.log('Command or basePath not configured.');
    return;
  }

  // 1. Load environment variables if a config is selected
  let envVars = { ...process.env };
  if (config.selectedEnv) {
    const envPath = path.join(envsDir, `.env.${config.selectedEnv}`);
    try {
      const envFileContent = await fs.readFile(envPath);
      const parsedEnv = dotenv.parse(envFileContent);
      envVars = { ...envVars, ...parsedEnv };
      console.log(`Loaded environment variables from ${config.selectedEnv}`);
    } catch (err) {
      console.error(`Could not load env file ${envPath}:`, err);
      // Decide if you want to proceed without the env file or stop
    }
  }

  // 2. Spawn the process
  const [cmd, ...args] = config.command.split(/\s+/);

  console.log(`Starting app with command: ${config.command}`,{
    cwd: config.basePath,
    envVars,
  });

  appProcess = spawn(cmd, args, {
    cwd: config.basePath,
    shell: true,
    stdio: ['pipe', 'pipe', 'pipe'],
    env: envVars, // Inject environment variables
  });

  const broadcast = (data) => {
    const message = data.toString();
    wss.clients.forEach((client) => {
      if (client.readyState === WebSocket.OPEN) {
        client.send(message);
      }
    });
  };

  appProcess.stdout.on('data', broadcast);
  appProcess.stderr.on('data', broadcast);

  appProcess.on('close', (code) => {
    console.log(`Child process exited with code ${code}`);
    // Do not broadcast system message to UI, only log to server console
    // broadcast(`[SYSTEM] Process exited with code ${code}.\n`);
    appProcess = null;
  });

  appProcess.on('error', (err) => {
    console.error('Failed to start subprocess.', err);
    // Do not broadcast system error to UI, only log to server console
    // broadcast(`[SYSTEM] Error: ${err.message}.\n`);
    appProcess = null;
  });
}

function stopApp() {
  if (appProcess) {
    console.log('Stopping app...');
    appProcess.kill('SIGTERM');
    appProcess = null;
    return true;
  }
  return false;
}

// --- Middleware ---
app.use(express.json());
app.use(express.static('public'));

const authUser = process.env.WEBUI_USER || process.env.UI_USER || 'admin';
const authPass = process.env.WEBUI_PASSWORD || process.env.UI_PASSWORD || 'password';

app.use(basicAuth({
  users: { [authUser]: authPass },
  challenge: true,
}));

const upload = multer({ dest: uploadsDir });

// --- API Routes ---

app.post('/config', async (req, res) => {
  const { command, selectedEnv } = req.body;
  let updated = false;
  if (typeof command !== 'undefined') {
    config.command = command;
    updated = true;
  }
  if (typeof selectedEnv !== 'undefined') {
    config.selectedEnv = selectedEnv || null; // Allow unsetting
    updated = true;
  }

  if (updated) {
    await saveConfig();
    res.json({ message: 'Config updated' });
  } else {
    res.status(400).json({ error: 'Invalid config payload' });
  }
});

app.post('/upload', upload.single('file'), async (req, res) => {
  if (!req.file) {
    return res.status(400).json({ error: 'No file uploaded' });
  }

  stopApp();

  const deploymentPath = path.join(deploymentsDir, new Date().toISOString().replace(/[:.]/g, '-'));

  try {
    await fs.mkdir(deploymentPath, { recursive: true });
    const zipPath = req.file.path;

    // Unzip the file using shared utility
    console.log(`Unzipping ${zipPath} to ${deploymentPath}`);
    await extractZip(zipPath, deploymentPath);
    console.log('Unzip operation completed successfully.');

    // Clean up the uploaded zip file
    await fs.unlink(zipPath);

    // Log all extracted files and directories
    console.log(`Contents of ${deploymentPath} after extraction:`);
    const listDirRecursive = async (dir, indent = '') => {
      try {
        const entries = await fs.readdir(dir, { withFileTypes: true });
        for (const entry of entries) {
          const fullPath = path.join(dir, entry.name);
          console.log(`${indent}- ${entry.name} ${entry.isDirectory() ? '(dir)' : '(file)'}`);
          if (entry.isDirectory()) {
            await listDirRecursive(fullPath, indent + '  ');
          }
        }
      } catch (listError) {
        console.error(`Error listing directory ${dir}:`, listError);
      }
    };
    await listDirRecursive(deploymentPath);

    // With the new flat zip structure, the app root is the deployment path
    console.log(`Setting app root to: ${deploymentPath}`);
    config.basePath = deploymentPath;
    config.lastUploadDate = new Date().toISOString();
    await saveConfig();
    await startApp();

    res.json({ message: 'Upload successful, app started.' });
  } catch (err) {
    console.error('Upload/unzip failed:', err);
    res.status(500).json({ error: 'Failed to process upload' });
  }
});

app.get('/status', (req, res) => {
  res.json({ running: !!appProcess, ...config });
});

app.post('/start', async (req, res) => {
  if (appProcess) {
    return res.status(400).json({ error: 'App already running' });
  }
  await startApp();
  res.json({ message: 'App started' });
});

app.post('/stop', (req, res) => {
  if (!stopApp()) {
    return res.status(400).json({ error: 'App not running' });
  }
  res.json({ message: 'App stopped' });
});

// --- API Routes for ENVs ---

// List all env configs
app.get('/api/envs', async (req, res) => {
  try {
    const files = await fs.readdir(envsDir);
    const envNames = files
      .filter(file => file.startsWith('.env.'))
      .map(file => file.substring(5)); // remove '.env.'
    res.json(envNames);
  } catch (err) {
    if (err.code === 'ENOENT') {
      return res.json([]); // Directory doesn't exist yet, return empty array
    }
    res.status(500).json({ error: 'Could not list envs' });
  }
});

// Get a specific env config
app.get('/api/envs/:name', async (req, res) => {
  const { name } = req.params;
  if (!/^[a-zA-Z0-9_-]+$/.test(name)) {
    return res.status(400).json({ error: 'Invalid env name' });
  }
  const filePath = path.join(envsDir, `.env.${name}`);
  try {
    const content = await fs.readFile(filePath, 'utf-8');
    res.json({ name, content });
  } catch (err) {
    res.status(404).json({ error: 'Env not found' });
  }
});

// Create/Update an env config
app.post('/api/envs', async (req, res) => {
  const { name, content } = req.body;
  if (!name || !/^[a-zA-Z0-9_-]+$/.test(name)) {
    return res.status(400).json({ error: 'Invalid env name' });
  }
  const filePath = path.join(envsDir, `.env.${name}`);
  try {
    await fs.writeFile(filePath, content || '');
    res.status(201).json({ message: 'Env saved' });
  } catch (err) {
    res.status(500).json({ error: 'Could not save env' });
  }
});

// Delete an env config
app.delete('/api/envs/:name', async (req, res) => {
  const { name } = req.params;
  if (!/^[a-zA-Z0-9_-]+$/.test(name)) {
    return res.status(400).json({ error: 'Invalid env name' });
  }
  const filePath = path.join(envsDir, `.env.${name}`);
  try {
    await fs.unlink(filePath);
    // If the deleted env was the selected one, unset it
    if (config.selectedEnv === name) {
      config.selectedEnv = null;
      await saveConfig();
    }
    res.json({ message: 'Env deleted' });
  } catch (err) {
    res.status(500).json({ error: 'Could not delete env' });
  }
});

// --- Initialization ---
async function main() {
  try {
    console.debug('Starting server initialization...');
    
    // Create essential directories
    for (const dir of [uploadsDir, deploymentsDir, envsDir]) {
      if (!fsSync.existsSync(dir)) {
        console.debug(`Creating directory: ${dir}`);
        fsSync.mkdirSync(dir, { recursive: true });
      }
    }

    console.debug('Loading configuration...');
    await loadConfig();
    console.debug('Configuration loaded:', config);

    // Auto-start on launch if configured
    if (config.basePath && fsSync.existsSync(config.basePath)) {
      console.debug(`Auto-starting app from ${config.basePath}`);
      await startApp();
    }

    // Log all registered routes for debugging
    const routes = app._router.stack
      .filter(r => r.route)
      .map(r => ({ 
        path: r.route.path, 
        methods: Object.keys(r.route.methods) 
      }));
    
    console.debug('Registered routes:', JSON.stringify(routes, null, 2));

    // Add error handler for the server before calling listen
    server.on('error', (err) => {
      if (err.code === 'EADDRINUSE') {
        const currentPort = parseInt(port, 10);
        // Ensure suggestedPort is a valid number and different from currentPort
        const suggestedPort = Number.isFinite(currentPort) ? currentPort + 1 : (parseInt(process.env.PORT, 10) || 3888) + 1;
        console.error(`\n[FATAL ERROR] Port ${port} is already in use.`);
        console.error(`Another application is currently using this port. Please stop the other application or specify a different port for this server.`);
        console.error(`To use a different port, set the PORT environment variable (e.g., 'PORT=${suggestedPort} node server.js').\n`);
        process.exit(1); // Exit immediately for this critical startup failure.
      } else {
        // For other server errors during startup, re-throw to be caught by the main try/catch block
        console.error('HTTP server error during startup:', err);
        throw err;
      }
    });
    
    // Use the server instance created at the top of the file
    server.listen(port, () => {
      console.log(`Server listening on http://localhost:${port}`);
    });
    
    console.debug('WebSocket server is attached and ready');
  } catch (error) {
    console.error('Server initialization failed:', error); // Catches errors from setup or re-thrown by server.on('error')
    process.exit(1); // Exit on any initialization failure
  }
}

main().catch(finalError => {
    console.error("Critical unhandled error during main execution:", finalError);
    process.exit(1);
});

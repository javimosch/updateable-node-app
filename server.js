const dotenv = require('dotenv');

dotenv.config()

const express = require('express');
const http = require('http');
const WebSocket = require('ws');
const { spawn } = require('child_process');
const multer = require('multer');
const fs = require('fs').promises;
const fsSync = require('fs');
const path = require('path');
const basicAuth = require('express-basic-auth');
const { extractZip } = require('./utils/unzip');
const { backupPersistentFolders, restorePersistentFolders } = require('./utils/persistentFolders');

// Function to restart the application (handles both nodemon and production environments)
function restartApplication() {
  console.log('=== Restart Application Debug ===');
  console.log('NODE_ENV:', process.env.NODE_ENV);
  console.log('npm_lifecycle_event:', process.env.npm_lifecycle_event);
  console.log('process.argv:', process.argv);
  console.log('process.title:', process.title);
  console.log('process.env._:', process.env._);
  console.log('process.pid:', process.pid);
  console.log('process.ppid:', process.ppid);
  
  const isProduction = process.env.NODE_ENV === 'production';
  
  if (!isProduction) {
    console.log('Non-production environment detected, trying nodemon SIGUSR2 restart...');
    
    try {
      // Try to signal nodemon directly with SIGUSR2
      // This is the cleanest way to restart nodemon from within the app
      console.log('Sending SIGUSR2 signal to restart nodemon...');
      process.kill(process.pid, 'SIGUSR2');
      
      console.log('SIGUSR2 signal sent successfully');
      
      // Fallback to process.exit after a short delay if SIGUSR2 doesn't work
      setTimeout(() => {
        console.log('SIGUSR2 restart timeout reached, falling back to process.exit()...');
        process.exit(1);
      }, 3000); // 3 second timeout
      
    } catch (err) {
      console.error('Failed to send SIGUSR2 signal:', err.message);
      console.log('Falling back to process.exit()...');
      process.exit(1);
    }
  } else {
    console.log('Production environment detected, using process.exit()...');
    process.exit(1);
  }
}

const app = express();
const server = http.createServer(app);
const wss = new WebSocket.Server({ server });

// Debug server setup
console.debug('Server and WebSocket server created');

// Debug startup environment
console.log('=== Startup Environment Debug ===');
console.log('NODE_ENV:', process.env.NODE_ENV);
console.log('npm_lifecycle_event:', process.env.npm_lifecycle_event);
console.log('process.argv:', process.argv);
console.log('process.title:', process.title);
console.log('process.env._:', process.env._);
console.log('NODEMON_WATCHING:', process.env.NODEMON_WATCHING);

// Using SIGUSR2 signal for nodemon restart - no file cleanup needed

console.log('================================');

const port = process.env.PORT||3888;

// Use current working directory for data paths to support both Docker and local development
// In Docker, the working directory is /app, locally it's the project root
const dataDir = path.join(process.cwd(), 'data');
const uploadsDir = path.join(dataDir, 'uploads');
const deploymentsDir = path.join(dataDir, 'deployments');
const envsDir = path.join(dataDir, 'env-configs');
const persistentDir = path.join(dataDir, 'persistent');
const configPath = path.join(dataDir, 'config.json');

// --- Configuration ---
let config = {
  command: 'npm run start',
  basePath: null,
  lastUploadDate: null,
  selectedEnv: null,
  persistentFoldersUI: null, // UI configuration for persistent folders (comma-separated string)
};

async function loadConfig() {
  if (fsSync.existsSync(configPath)) {
    const rawData = await fs.readFile(configPath);
    const savedConfig = JSON.parse(rawData);
    config = { ...config, ...savedConfig };
    
    // Fix basePath if it's using Docker paths (/app) but we're running locally
    if (config.basePath && config.basePath.startsWith('/app/')) {
      // Convert Docker path to local path
      const relativePath = config.basePath.replace('/app/', '');
      const localPath = path.join(process.cwd(), relativePath);
      
      // Check if the local path exists
      if (fsSync.existsSync(localPath)) {
        console.log(`Converting Docker path to local path: ${config.basePath} -> ${localPath}`);
        config.basePath = localPath;
        await saveConfig(); // Save the corrected path
      } else {
        console.warn(`Path not found locally: ${localPath}. Keeping original path: ${config.basePath}`);
      }
    }
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

  // Create a truncated version of envVars for logging (hide sensitive values)
  const truncatedEnvVars = Object.keys(envVars).reduce((acc, key) => {
    const value = envVars[key];
    // Truncate values longer than 20 characters, showing first 10 and last 4 characters
    if (typeof value === 'string' && value.length > 20) {
      acc[key] = `${value.substring(0, 10)}...${value.substring(value.length - 4)}`;
    } else if (typeof value === 'string' && value.length > 0) {
      // For shorter values, show first few characters
      acc[key] = `${value.substring(0, Math.min(6, value.length))}${value.length > 6 ? '...' : ''}`;
    } else {
      acc[key] = value;
    }
    return acc;
  }, {});

  console.log(`Starting app with command: ${config.command}`,{
    cwd: config.basePath,
    envVars: truncatedEnvVars,
  });

  const broadcast = (data) => {
    const message = data.toString();
    wss.clients.forEach((client) => {
      if (client.readyState === WebSocket.OPEN) {
        client.send(message);
      }
    });
  };

  // Determine the shell to use - try multiple options for better compatibility
  let shellPath, shellArgs;
  
  if (process.platform === 'win32') {
    shellPath = 'cmd.exe';
    shellArgs = ['/c'];
  } else {
    // Try to find an available shell on Unix-like systems
    const possibleShells = ['/bin/sh', '/bin/bash', '/bin/ash', '/usr/bin/sh'];
    shellPath = possibleShells.find(shell => fsSync.existsSync(shell));
    shellArgs = ['-c'];
    
    if (!shellPath) {
      const errorMsg = `[SYSTEM] ERROR: No shell found. Tried: ${possibleShells.join(', ')}\n`;
      console.error(errorMsg);
      broadcast(errorMsg);
      return;
    }
  }

  // Broadcast startup information to UI
  broadcast(`[SYSTEM] Starting application...\n`);
  broadcast(`[SYSTEM] Command: ${config.command}\n`);
  broadcast(`[SYSTEM] Working directory: ${config.basePath}\n`);
  broadcast(`[SYSTEM] Shell: ${shellPath}\n`);
  
  // Additional validation
  if (!fsSync.existsSync(config.basePath)) {
    const errorMsg = `[SYSTEM] ERROR: Working directory does not exist: ${config.basePath}\n`;
    console.error(errorMsg);
    broadcast(errorMsg);
    return;
  }
  
  // Check if package.json exists for npm commands
  if (config.command.includes('npm')) {
    const packageJsonPath = path.join(config.basePath, 'package.json');
    if (!fsSync.existsSync(packageJsonPath)) {
      broadcast(`[SYSTEM] WARNING: package.json not found in working directory. npm commands may fail.\n`);
    } else {
      broadcast(`[SYSTEM] package.json found in working directory\n`);
    }
  }
  
  // For better compatibility, especially in Alpine Linux, use explicit shell execution
  appProcess = spawn(shellPath, [...shellArgs, config.command], {
    cwd: config.basePath,
    stdio: ['pipe', 'pipe', 'pipe'],
    env: envVars, // Inject environment variables
  });

  appProcess.stdout.on('data', (data) => {
    clearTimeout(startupTimeout);
    broadcast(data);
  });
  appProcess.stderr.on('data', (data) => {
    clearTimeout(startupTimeout);
    broadcast(data);
  });

  // Handle successful spawn
  appProcess.on('spawn', () => {
    console.log('Subprocess started successfully');
    broadcast(`[SYSTEM] Subprocess started successfully (PID: ${appProcess.pid})\n`);
    clearTimeout(startupTimeout);
  });

  // Set a timeout to detect startup failures
  const startupTimeout = setTimeout(() => {
    if (appProcess && !appProcess.killed) {
      broadcast(`[SYSTEM] WARNING: Process started but no output received within 10 seconds. This might indicate a startup issue.\n`);
    }
  }, 10000);

  appProcess.on('close', (code) => {
    console.log(`Child process exited with code ${code}`);
    const message = `[SYSTEM] Process exited with code ${code}.\n`;
    broadcast(message);
    clearTimeout(startupTimeout);
    appProcess = null;
  });

  appProcess.on('error', (err) => {
    console.error('Failed to start subprocess.', err);
    const errorMessage = `[SYSTEM] Error starting subprocess: ${err.message}\n`;
    const diagnosticInfo = `[SYSTEM] Command: ${config.command}\n[SYSTEM] Working directory: ${config.basePath}\n[SYSTEM] Shell: ${shellPath}\n`;
    broadcast(errorMessage);
    broadcast(diagnosticInfo);
    
    // Additional diagnostic information
    if (err.code === 'ENOENT') {
      broadcast(`[SYSTEM] ENOENT error suggests the shell or command was not found.\n`);
      broadcast(`[SYSTEM] Checking if working directory exists...\n`);
      if (fsSync.existsSync(config.basePath)) {
        broadcast(`[SYSTEM] Working directory exists: ${config.basePath}\n`);
        // Check if package.json exists
        const packageJsonPath = path.join(config.basePath, 'package.json');
        if (fsSync.existsSync(packageJsonPath)) {
          broadcast(`[SYSTEM] package.json found in working directory\n`);
        } else {
          broadcast(`[SYSTEM] WARNING: package.json not found in working directory\n`);
        }
      } else {
        broadcast(`[SYSTEM] ERROR: Working directory does not exist: ${config.basePath}\n`);
      }
    }
    
    clearTimeout(startupTimeout);
    appProcess = null;
  });
}

async function stopApp() {
  if (appProcess) {
    console.log('Stopping app...');
    
    // Broadcast stopping message to UI
    const broadcast = (data) => {
      const message = data.toString();
      wss.clients.forEach((client) => {
        if (client.readyState === WebSocket.OPEN) {
          client.send(message);
        }
      });
    };
    
    broadcast(`[SYSTEM] Stopping previous application (PID: ${appProcess.pid})...\n`);
    
    // Create a promise that resolves when the process exits
    const processExitPromise = new Promise((resolve) => {
      appProcess.once('close', (code) => {
        console.log(`Previous app process exited with code ${code}`);
        broadcast(`[SYSTEM] Previous application stopped (exit code: ${code})\n`);
        resolve();
      });
    });
    
    // Create a timeout promise for graceful shutdown
    const timeoutPromise = new Promise((resolve) => {
      setTimeout(() => {
        console.log('Process did not exit gracefully within 10 seconds, forcing termination...');
        broadcast(`[SYSTEM] Process did not exit gracefully, forcing termination...\n`);
        if (appProcess && !appProcess.killed) {
          appProcess.kill('SIGKILL');
        }
        resolve();
      }, 10000); // 10 second timeout
    });
    
    // Create a failsafe promise for complete restart if SIGKILL fails
    const failsafePromise = new Promise((resolve) => {
      setTimeout(() => {
        console.log('CRITICAL: Process still running after SIGKILL, restarting main application...');
        broadcast(`[SYSTEM] CRITICAL: Subprocess failed to terminate. Restarting main application...\n`);
        broadcast(`[SYSTEM] UI will refresh automatically in 3 seconds...\n`);
        
        // Tell UI to refresh after a short delay
        setTimeout(() => {
          broadcast(`[REFRESH]`); // Special message to trigger UI refresh
        }, 3000);
        
        // Restart the main application after giving UI time to receive the message
        setTimeout(() => {
          console.log('Restarting main application due to stuck subprocess...');
          restartApplication();
        }, 4000);
        
        resolve();
      }, 15000); // 15 second total timeout (5 seconds after SIGKILL)
    });
    
    // Send termination signal
    appProcess.kill('SIGTERM');
    
    // Wait for process to exit, timeout, or failsafe
    await Promise.race([processExitPromise, timeoutPromise, failsafePromise]);
    
    // Only set to null if process actually exited (not if we're restarting)
    if (appProcess && appProcess.killed) {
      appProcess = null;
    }
    return true;
  }
  return false;
}

// --- Middleware ---
app.use(express.json());

const authUser = process.env.WEBUI_USER || process.env.UI_USER || 'admin';
const authPass = process.env.WEBUI_PASSWORD || process.env.UI_PASSWORD || 'password';

// Basic auth middleware - applied to all routes except specific bypasses
app.use((req, res, next) => {
  // Skip auth for upload endpoint (has its own Bearer auth)
  if (req.url === '/upload') {
    return next();
  }
  
  // Skip auth if request has valid Bearer token
  if (req.headers.authorization?.startsWith('Bearer ')) {
    return next();
  }
  
  // Apply basic auth to all other requests
  basicAuth({
    users: { [authUser]: authPass },
    challenge: true,
  })(req, res, next);
});

// Serve static files AFTER authentication
app.use(express.static('public'));

const upload = multer({ dest: uploadsDir });

// --- Deployment Rotation Helper ---
async function rotateDeployments() {
  const entries = await fs.readdir(deploymentsDir, { withFileTypes: true });
  const dirs = entries.filter(e => e.isDirectory()).map(e => e.name);
  dirs.sort((a, b) => b.localeCompare(a)); // Descending, newest first
  if (dirs.length > 5) {
    const toDelete = dirs.slice(5);
    for (const dir of toDelete) {
      const fullPath = path.join(deploymentsDir, dir);
      await fs.rm(fullPath, { recursive: true, force: true });
      console.debug(`[DeploymentRotation] Deleted old deployment: ${fullPath}`);
    }
  }
}

// --- API Routes ---

app.post('/config', async (req, res) => {
  const { command, selectedEnv, persistentFoldersUI } = req.body;
  let updated = false;
  if (typeof command !== 'undefined') {
    config.command = command;
    updated = true;
  }
  if (typeof selectedEnv !== 'undefined') {
    config.selectedEnv = selectedEnv || null; // Allow unsetting
    updated = true;
  }
  if (typeof persistentFoldersUI !== 'undefined') {
    config.persistentFoldersUI = persistentFoldersUI || null; // Allow unsetting
    updated = true;
    console.debug(`Updated persistentFoldersUI: ${persistentFoldersUI}`);
  }

  if (updated) {
    await saveConfig();
    res.json({ message: 'Config updated' });
  } else {
    res.status(400).json({ error: 'Invalid config payload' });
  }
});

// Bearer token authentication middleware for /upload
function bearerAuth(req, res, next) {
  const keysRaw = process.env.BEARER_KEYS;
  if (!keysRaw) return next(); // No bearer auth required
  
  const validKeys = keysRaw.split(',').map(k => k.trim()).filter(Boolean);
  const authHeader = req.headers['authorization'] || '';
  if (!authHeader.startsWith('Bearer ')) {
    console.debug('Bearer auth: Missing or malformed Authorization header');
    return res.status(401).json({ error: 'Missing or invalid Bearer token' });
  }
  const token = authHeader.slice(7);
  if (!validKeys.includes(token)) {
    console.debug('Bearer auth: Invalid token provided');
    return res.status(403).json({ error: 'Invalid Bearer token' });
  }
  console.debug('Bearer auth: Token accepted');
  next();
}

// Add bearerAuth middleware before upload.single for /upload
app.post('/upload', bearerAuth, upload.single('file'), async (req, res) => {
  // On upload, deployment version is the deploymentPath's basename (timestamp)

  if (!req.file) {
    return res.status(400).json({ error: 'No file uploaded' });
  }

  await stopApp();
  
  // Backup persistent folders from current deployment before starting the new one
  if (config.basePath) {
    console.debug('Backing up persistent folders from current deployment');
    await backupPersistentFolders(config.basePath, persistentDir, config);
  }

  const deploymentPath = path.join(deploymentsDir, new Date().toISOString().replace(/[:.]/g, '-'));

  try {
    await fs.mkdir(deploymentPath, { recursive: true });
    const zipPath = req.file.path;

    // Check uploaded file size and magic header before unzipping
    const stat = await fs.stat(zipPath);
    console.log('Uploaded zip file size:', stat.size);
    if (stat.size < 4) {
      return res.status(400).json({ error: 'Uploaded file is too small to be a valid zip.' });
    }
    const fd = await fs.open(zipPath, 'r');
    const headerBuf = Buffer.alloc(4);
    await fd.read(headerBuf, 0, 4, 0);
    await fd.close();
    const magic = headerBuf.toString('hex');
    console.log('Zip file magic header:', magic);
    // ZIP files start with 504b0304 or 504b0506 or 504b0708
    if (!['504b0304', '504b0506', '504b0708'].includes(magic)) {
      return res.status(400).json({ error: 'Uploaded file is not a valid zip archive.' });
    }
    // Unzip the file using shared utility
    console.log(`Unzipping ${zipPath} to ${deploymentPath}`);
    await extractZip(zipPath, deploymentPath);
    console.log('Unzip operation completed successfully.');

    // Rotate deployments (keep only last 5)
    await rotateDeployments();

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
    
    // Restore persistent folders to the new deployment
    console.debug('Restoring persistent folders to new deployment');
    await restorePersistentFolders(deploymentPath, persistentDir, config);
    
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

app.post('/stop', async (req, res) => {
  if (!(await stopApp())) {
    return res.status(400).json({ error: 'App not running' });
  }
  res.json({ message: 'App stopped' });
});

// Test endpoint to trigger restart mechanism (development only)
app.post('/test-restart', (req, res) => {
  if (process.env.NODE_ENV === 'production') {
    return res.status(403).json({ error: 'Test endpoint not available in production' });
  }
  
  res.json({ message: 'Triggering restart test...' });
  
  // Trigger restart after sending response
  setTimeout(() => {
    console.log('TEST: Triggering restart mechanism...');
    restartApplication();
  }, 1000);
});

// --- Deployment Management Endpoints ---

// List all deployments (sorted by newest first)
app.get('/api/deployments', async (req, res) => {
  try {
    const entries = await fs.readdir(deploymentsDir, { withFileTypes: true });
    const dirs = entries.filter(e => e.isDirectory()).map(e => e.name);
    dirs.sort((a, b) => b.localeCompare(a));
    res.json(dirs);
  } catch (err) {
    res.status(500).json({ error: 'Could not list deployments' });
  }
});

// Get current deployment version (basename of config.basePath)
app.get('/api/deployment/current', (req, res) => {
  const current = config.basePath ? path.basename(config.basePath) : null;
  res.json({ current });
});

// Rollback to a previous deployment
app.post('/api/deployments/rollback/:version', async (req, res) => {
  const { version } = req.params;
  const targetPath = path.join(deploymentsDir, version);
  try {
    if (!fsSync.existsSync(targetPath)) {
      return res.status(404).json({ error: 'Deployment version not found' });
    }
    
    await stopApp();
    
    // Backup persistent folders from the current deployment before rolling back
    if (config.basePath) {
      console.debug('Backing up persistent folders before rollback');
      await backupPersistentFolders(config.basePath, persistentDir, config);
    }
    
    config.basePath = targetPath;
    config.lastUploadDate = new Date().toISOString();
    await saveConfig();
    
    // Restore persistent folders to the rollback deployment
    console.debug('Restoring persistent folders to rollback deployment');
    await restorePersistentFolders(targetPath, persistentDir, config);
    
    await startApp();
    res.json({ message: `Rolled back to deployment: ${version}` });
  } catch (err) {
    res.status(500).json({ error: 'Failed to rollback', details: err.message });
  }
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
    console.debug(`Current working directory: ${process.cwd()}`);
    console.debug(`Server script directory: ${__dirname}`);
    console.debug(`Data directory: ${dataDir}`);
    
    // Create essential directories
    for (const dir of [uploadsDir, deploymentsDir, envsDir, persistentDir]) {
      if (!fsSync.existsSync(dir)) {
        console.debug(`Creating directory: ${dir}`);
        fsSync.mkdirSync(dir, { recursive: true });
      } else {
        console.debug(`Directory exists: ${dir}`);
      }
    }

    console.debug('Loading configuration...');
    await loadConfig();
    console.debug('Configuration loaded successfully');
    console.debug(`Current config: ${JSON.stringify(config, null, 2)}`);

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

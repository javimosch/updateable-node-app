const path = require('path');
const fs = require('fs').promises;
const archiver = require('archiver');
const config = require('../utils/config');
const ui = require('../utils/ui');
const APIClient = require('../utils/api');

async function deployCommand(appFolder, options = {}) {
  try {
    // Load existing config
    await config.load();

    // Determine project name from folder
    const projectName = path.basename(path.resolve(appFolder));
    const projectConfig = config.getProjectConfig(projectName);

    ui.showHeader(`🚀 UPN CLI Deploy - ${projectName}`);

    // Validate app folder exists
    try {
      await fs.access(appFolder);
      ui.logSuccess(`App folder found: ${appFolder}`);
    } catch (error) {
      ui.showErrorWithSuggestions(
        `App folder not found: ${appFolder}`,
        [
          'Check if the folder path is correct',
          'Make sure you\'re in the right directory',
          `Run 'upncli setup ${appFolder}' first`
        ]
      );
      process.exit(1);
    }

    // Check if setup is required
    if (!projectConfig.serverUrl) {
      ui.showErrorWithSuggestions(
        'Project not configured. Server URL is required.',
        [
          `Run 'upncli setup ${appFolder}' to configure the project`,
          'Set the server URL and bearer token if required'
        ]
      );
      process.exit(1);
    }

    // Create API client
    const api = new APIClient(projectConfig.serverUrl, projectConfig.bearerToken);

    // Test connection first
    ui.logLoading('Testing connection to server...');
    try {
      const isConnected = await api.testConnection();
      if (!isConnected) {
        throw new Error('Connection test failed');
      }
      ui.logSuccess('Connected to server successfully');
    } catch (error) {
      ui.showErrorWithSuggestions(
        `Cannot connect to server: ${error.message}`,
        [
          'Check if the server is running',
          'Verify the server URL is correct',
          'Check your network connection',
          `Run 'upncli setup ${appFolder}' to update configuration`
        ]
      );
      process.exit(1);
    }

    // Create optimized zip package
    ui.logLoading('Creating deployment package...');
    const zipPath = await createZipPackage(appFolder, projectConfig.blacklist);
    ui.logSuccess('Deployment package created');

    // Show package info
    const stats = await fs.stat(zipPath);
    const sizeInMB = (stats.size / 1024 / 1024).toFixed(2);
    ui.logInfo(`Package size: ${sizeInMB} MB`);

    // Upload with progress
    ui.logUploading('Uploading deployment package...');
    const progressBar = ui.createProgressBar(100);

    try {
      const result = await api.uploadFile(zipPath, (percent, loaded, total) => {
        ui.updateProgress(percent);
      });

      ui.stopProgress();
      ui.logSuccess('Deployment uploaded successfully!');
      ui.logInfo(result.message || 'Application deployed and started');

      // Get deployment status
      try {
        const status = await api.getStatus();
        if (status.running) {
          ui.logSuccess('Application is running');
        } else {
          ui.logWarning('Application is not running');
        }
      } catch (statusError) {
        ui.logWarning('Could not get application status');
      }

    } catch (uploadError) {
      ui.stopProgress();
      
      // Handle specific error cases
      if (uploadError.message.includes('Bearer token')) {
        ui.showErrorWithSuggestions(
          'Authentication failed',
          [
            `Run 'upncli setup ${appFolder}' to set/update bearer token`,
            'Check if the bearer token is correct',
            'Contact your administrator for the correct token'
          ]
        );
      } else if (uploadError.message.includes('zip')) {
        ui.showErrorWithSuggestions(
          'Invalid package format',
          [
            'Check if the app folder contains valid files',
            'Verify blacklist patterns are not excluding everything',
            'Try creating the package manually to test'
          ]
        );
      } else {
        ui.showErrorWithSuggestions(
          `Upload failed: ${uploadError.message}`,
          [
            'Check your network connection',
            'Verify server is running and accessible',
            'Check server logs for more details'
          ]
        );
      }
      process.exit(1);
    } finally {
      // Clean up temporary zip file
      try {
        await fs.unlink(zipPath);
      } catch (cleanupError) {
        // Ignore cleanup errors
      }
    }

  } catch (error) {
    ui.logError(`Deploy failed: ${error.message}`);
    process.exit(1);
  }
}

async function createZipPackage(appFolder, blacklistPatterns = []) {
  const tempDir = require('os').tmpdir();
  const zipPath = path.join(tempDir, `upn-deploy-${Date.now()}.zip`);

  return new Promise((resolve, reject) => {
    const output = require('fs').createWriteStream(zipPath);
    const archive = archiver('zip', {
      zlib: { level: 9 } // Maximum compression
    });

    output.on('close', () => {
      resolve(zipPath);
    });

    archive.on('error', (err) => {
      reject(err);
    });

    archive.pipe(output);

    // Add all files from app folder with exclusions
    const globOptions = {
      cwd: appFolder,
      ignore: [
        // Default exclusions (always applied)
        '**/.git/**',
        '**/.DS_Store',
        '**/Thumbs.db',
        // User-defined blacklist patterns
        ...blacklistPatterns.map(pattern => {
          // Ensure pattern works with glob
          if (pattern.endsWith('*')) {
            return `**/${pattern}`;
          } else {
            return `**/${pattern}/**`;
          }
        })
      ]
    };

    archive.glob('**/*', globOptions);
    archive.finalize();
  });
}

module.exports = deployCommand;
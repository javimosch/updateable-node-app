/**
 * Utility functions for handling persistent folders during deployment/rollback
 */
const fs = require('fs').promises;
const fsSync = require('fs');
const path = require('path');

/**
 * Read and parse persistent folders configuration
 * @param {Object} [config] - Optional config object containing persistentFoldersUI
 * @returns {string[]} Array of folder names to be persisted
 */
function getPersistentFolders(config) {
  // UI configuration takes priority over environment variable
  const folders = config?.persistentFoldersUI || process.env.PERSISTENT_FOLDERS || '';
  console.debug(`Using persistent folders: ${folders}`);
  return folders.split(',').map(folder => folder.trim()).filter(Boolean);
}

/**
 * Ensure the persistent data directory exists
 * @param {string} persistentDir - Path to the persistent data directory
 */
async function ensurePersistentDir(persistentDir) {
  if (!fsSync.existsSync(persistentDir)) {
    console.debug(`Creating persistent data directory: ${persistentDir}`);
    await fs.mkdir(persistentDir, { recursive: true });
  }
}

/**
 * Back up persistent folders from the current deployment to the persistent data directory
 * @param {string} currentDeploymentPath - Path to the current deployment
 * @param {string} persistentDir - Path to the persistent data directory
 * @param {Object} [config] - Optional config object containing persistentFoldersUI
 */
async function backupPersistentFolders(currentDeploymentPath, persistentDir, config) {
  console.debug('Starting backup of persistent folders');
  
  if (!currentDeploymentPath || !fsSync.existsSync(currentDeploymentPath)) {
    console.debug('No current deployment to backup persistent folders from');
    return;
  }

  const persistentFolders = getPersistentFolders(config);
  if (persistentFolders.length === 0) {
    console.debug('No persistent folders configured');
    return;
  }
  
  await ensurePersistentDir(persistentDir);
  
  // Clear existing persistent folders in the persistent directory
  for (const folder of persistentFolders) {
    const persistentFolderPath = path.join(persistentDir, folder);
    if (fsSync.existsSync(persistentFolderPath)) {
      console.debug(`Removing existing persistent folder: ${persistentFolderPath}`);
      await fs.rm(persistentFolderPath, { recursive: true, force: true });
    }
  }
  
  // Copy persistent folders from current deployment to persistent directory
  for (const folder of persistentFolders) {
    const sourcePath = path.join(currentDeploymentPath, folder);
    const targetPath = path.join(persistentDir, folder);
    
    if (fsSync.existsSync(sourcePath)) {
      console.debug(`Backing up persistent folder: ${folder}`);
      await copyDirectory(sourcePath, targetPath);
    } else {
      console.debug(`Persistent folder not found in current deployment: ${folder}`);
    }
  }
  
  console.debug('Completed backup of persistent folders');
}

/**
 * Restore persistent folders from the persistent data directory to a new deployment
 * @param {string} newDeploymentPath - Path to the new deployment
 * @param {string} persistentDir - Path to the persistent data directory
 * @param {Object} [config] - Optional config object containing persistentFoldersUI
 */
async function restorePersistentFolders(newDeploymentPath, persistentDir, config) {
  console.debug('Starting restoration of persistent folders');
  
  if (!newDeploymentPath || !fsSync.existsSync(newDeploymentPath)) {
    console.debug('No new deployment to restore persistent folders to');
    return;
  }
  
  const persistentFolders = getPersistentFolders(config);
  if (persistentFolders.length === 0) {
    console.debug('No persistent folders configured');
    return;
  }
  
  // Remove any existing persistent folders in the new deployment
  for (const folder of persistentFolders) {
    const deploymentFolderPath = path.join(newDeploymentPath, folder);
    if (fsSync.existsSync(deploymentFolderPath)) {
      console.debug(`Removing existing persistent folder in new deployment: ${deploymentFolderPath}`);
      await fs.rm(deploymentFolderPath, { recursive: true, force: true });
    }
  }
  
  // Copy persistent folders from persistent directory to new deployment
  for (const folder of persistentFolders) {
    const sourcePath = path.join(persistentDir, folder);
    const targetPath = path.join(newDeploymentPath, folder);
    
    if (fsSync.existsSync(sourcePath)) {
      console.debug(`Restoring persistent folder: ${folder}`);
      await copyDirectory(sourcePath, targetPath);
    } else {
      console.debug(`No persistent folder to restore: ${folder}`);
    }
  }
  
  console.debug('Completed restoration of persistent folders');
}

/**
 * Helper function to recursively copy a directory
 * @param {string} sourceDir - Source directory
 * @param {string} targetDir - Target directory
 */
async function copyDirectory(sourceDir, targetDir) {
  await fs.mkdir(targetDir, { recursive: true });
  
  const entries = await fs.readdir(sourceDir, { withFileTypes: true });
  
  for (const entry of entries) {
    const sourcePath = path.join(sourceDir, entry.name);
    const targetPath = path.join(targetDir, entry.name);
    
    if (entry.isDirectory()) {
      await copyDirectory(sourcePath, targetPath);
    } else {
      await fs.copyFile(sourcePath, targetPath);
    }
  }
}

module.exports = {
  getPersistentFolders,
  backupPersistentFolders,
  restorePersistentFolders,
  ensurePersistentDir
};

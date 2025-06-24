const path = require('path');
const fs = require('fs').promises;
const fsSync = require('fs');
const os = require('os');
const { backupPersistentFolders, restorePersistentFolders } = require('../utils/persistentFolders');

describe('Persistent Folders Move Operations', () => {
  let tempDir;
  let currentDeploymentPath;
  let newDeploymentPath;
  let persistentDir;

  beforeEach(async () => {
    // Create temporary directory structure
    tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'persistent-test-'));
    currentDeploymentPath = path.join(tempDir, 'current-deployment');
    newDeploymentPath = path.join(tempDir, 'new-deployment');
    persistentDir = path.join(tempDir, 'persistent');

    // Create directories
    await fs.mkdir(currentDeploymentPath, { recursive: true });
    await fs.mkdir(newDeploymentPath, { recursive: true });
    await fs.mkdir(persistentDir, { recursive: true });

    // Create test persistent folders with content
    const uploadsDir = path.join(currentDeploymentPath, 'uploads');
    const dataDir = path.join(currentDeploymentPath, 'data');
    
    await fs.mkdir(uploadsDir, { recursive: true });
    await fs.mkdir(dataDir, { recursive: true });
    
    await fs.writeFile(path.join(uploadsDir, 'test-file.txt'), 'test content');
    await fs.writeFile(path.join(dataDir, 'config.json'), '{"test": true}');
  });

  afterEach(async () => {
    // Clean up temporary directory
    if (tempDir && fsSync.existsSync(tempDir)) {
      await fs.rm(tempDir, { recursive: true, force: true });
    }
  });

  it('should move persistent folders during backup and restore', async () => {
    const config = { persistentFoldersUI: 'uploads,data' };

    // Verify initial state
    expect(fsSync.existsSync(path.join(currentDeploymentPath, 'uploads'))).toBe(true);
    expect(fsSync.existsSync(path.join(currentDeploymentPath, 'data'))).toBe(true);

    // Backup persistent folders (should move them)
    await backupPersistentFolders(currentDeploymentPath, persistentDir, config);

    // Verify folders were moved (no longer in current deployment)
    expect(fsSync.existsSync(path.join(currentDeploymentPath, 'uploads'))).toBe(false);
    expect(fsSync.existsSync(path.join(currentDeploymentPath, 'data'))).toBe(false);

    // Verify folders are in persistent directory
    expect(fsSync.existsSync(path.join(persistentDir, 'uploads'))).toBe(true);
    expect(fsSync.existsSync(path.join(persistentDir, 'data'))).toBe(true);

    // Verify content is preserved
    const testFileContent = await fs.readFile(path.join(persistentDir, 'uploads', 'test-file.txt'), 'utf-8');
    expect(testFileContent).toBe('test content');

    // Restore persistent folders (should move them to new deployment)
    await restorePersistentFolders(newDeploymentPath, persistentDir, config);

    // Verify folders were moved to new deployment
    expect(fsSync.existsSync(path.join(newDeploymentPath, 'uploads'))).toBe(true);
    expect(fsSync.existsSync(path.join(newDeploymentPath, 'data'))).toBe(true);

    // Verify folders are no longer in persistent directory
    expect(fsSync.existsSync(path.join(persistentDir, 'uploads'))).toBe(false);
    expect(fsSync.existsSync(path.join(persistentDir, 'data'))).toBe(false);

    // Verify content is still preserved
    const restoredFileContent = await fs.readFile(path.join(newDeploymentPath, 'uploads', 'test-file.txt'), 'utf-8');
    expect(restoredFileContent).toBe('test content');
  });

  it('should handle non-existent persistent folders gracefully', async () => {
    const config = { persistentFoldersUI: 'nonexistent,uploads' };

    // Only create uploads folder
    const uploadsDir = path.join(currentDeploymentPath, 'uploads');
    await fs.mkdir(uploadsDir, { recursive: true });
    await fs.writeFile(path.join(uploadsDir, 'test.txt'), 'content');

    // Should not throw error for non-existent folder
    await expect(backupPersistentFolders(currentDeploymentPath, persistentDir, config)).resolves.not.toThrow();

    // Should only move the existing folder
    expect(fsSync.existsSync(path.join(persistentDir, 'uploads'))).toBe(true);
    expect(fsSync.existsSync(path.join(persistentDir, 'nonexistent'))).toBe(false);
  });
});
const path = require('path');
const fs = require('fs').promises;
const fsSync = require('fs');
const os = require('os');
const { backupPersistentFolders, restorePersistentFolders, validateFolderPath } = require('../utils/persistentFolders');

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

  it('should handle nested paths correctly', async () => {
    const config = { persistentFoldersUI: 'frontend/node_modules,backend/uploads,data/cache' };

    // Create nested directory structure
    const frontendNodeModules = path.join(currentDeploymentPath, 'frontend', 'node_modules');
    const backendUploads = path.join(currentDeploymentPath, 'backend', 'uploads');
    const dataCache = path.join(currentDeploymentPath, 'data', 'cache');
    
    await fs.mkdir(frontendNodeModules, { recursive: true });
    await fs.mkdir(backendUploads, { recursive: true });
    await fs.mkdir(dataCache, { recursive: true });
    
    // Add content to nested folders
    await fs.writeFile(path.join(frontendNodeModules, 'package.json'), '{"name": "test"}');
    await fs.writeFile(path.join(backendUploads, 'image.jpg'), 'fake image data');
    await fs.writeFile(path.join(dataCache, 'cache.db'), 'cache data');

    // Verify initial state
    expect(fsSync.existsSync(frontendNodeModules)).toBe(true);
    expect(fsSync.existsSync(backendUploads)).toBe(true);
    expect(fsSync.existsSync(dataCache)).toBe(true);

    // Backup persistent folders
    await backupPersistentFolders(currentDeploymentPath, persistentDir, config);

    // Verify folders were moved from current deployment
    expect(fsSync.existsSync(frontendNodeModules)).toBe(false);
    expect(fsSync.existsSync(backendUploads)).toBe(false);
    expect(fsSync.existsSync(dataCache)).toBe(false);

    // Verify folders are in persistent directory with correct structure
    expect(fsSync.existsSync(path.join(persistentDir, 'frontend', 'node_modules'))).toBe(true);
    expect(fsSync.existsSync(path.join(persistentDir, 'backend', 'uploads'))).toBe(true);
    expect(fsSync.existsSync(path.join(persistentDir, 'data', 'cache'))).toBe(true);

    // Verify content is preserved
    const packageContent = await fs.readFile(path.join(persistentDir, 'frontend', 'node_modules', 'package.json'), 'utf-8');
    expect(packageContent).toBe('{"name": "test"}');

    // Restore persistent folders to new deployment
    await restorePersistentFolders(newDeploymentPath, persistentDir, config);

    // Verify folders were moved to new deployment
    expect(fsSync.existsSync(path.join(newDeploymentPath, 'frontend', 'node_modules'))).toBe(true);
    expect(fsSync.existsSync(path.join(newDeploymentPath, 'backend', 'uploads'))).toBe(true);
    expect(fsSync.existsSync(path.join(newDeploymentPath, 'data', 'cache'))).toBe(true);

    // Verify folders are no longer in persistent directory
    expect(fsSync.existsSync(path.join(persistentDir, 'frontend', 'node_modules'))).toBe(false);
    expect(fsSync.existsSync(path.join(persistentDir, 'backend', 'uploads'))).toBe(false);
    expect(fsSync.existsSync(path.join(persistentDir, 'data', 'cache'))).toBe(false);

    // Verify content is still preserved
    const restoredPackageContent = await fs.readFile(path.join(newDeploymentPath, 'frontend', 'node_modules', 'package.json'), 'utf-8');
    expect(restoredPackageContent).toBe('{"name": "test"}');
  });

  it('should handle mixed simple and nested paths', async () => {
    const config = { persistentFoldersUI: 'uploads,frontend/dist,data' };

    // Create mixed directory structure
    const uploadsDir = path.join(currentDeploymentPath, 'uploads');
    const frontendDist = path.join(currentDeploymentPath, 'frontend', 'dist');
    const dataDir = path.join(currentDeploymentPath, 'data');
    
    await fs.mkdir(uploadsDir, { recursive: true });
    await fs.mkdir(frontendDist, { recursive: true });
    await fs.mkdir(dataDir, { recursive: true });
    
    await fs.writeFile(path.join(uploadsDir, 'file1.txt'), 'content1');
    await fs.writeFile(path.join(frontendDist, 'index.html'), '<html></html>');
    await fs.writeFile(path.join(dataDir, 'config.json'), '{}');

    // Backup and restore
    await backupPersistentFolders(currentDeploymentPath, persistentDir, config);
    await restorePersistentFolders(newDeploymentPath, persistentDir, config);

    // Verify all folders are in new deployment
    expect(fsSync.existsSync(path.join(newDeploymentPath, 'uploads'))).toBe(true);
    expect(fsSync.existsSync(path.join(newDeploymentPath, 'frontend', 'dist'))).toBe(true);
    expect(fsSync.existsSync(path.join(newDeploymentPath, 'data'))).toBe(true);

    // Verify content
    const htmlContent = await fs.readFile(path.join(newDeploymentPath, 'frontend', 'dist', 'index.html'), 'utf-8');
    expect(htmlContent).toBe('<html></html>');
  });
});

describe('Path Validation', () => {
  it('should validate simple folder names', () => {
    expect(validateFolderPath('uploads')).toBe('uploads');
    expect(validateFolderPath('data')).toBe('data');
    expect(validateFolderPath('node_modules')).toBe('node_modules');
  });

  it('should validate nested paths', () => {
    expect(validateFolderPath('frontend/node_modules')).toBe('frontend/node_modules');
    expect(validateFolderPath('backend/uploads')).toBe('backend/uploads');
    expect(validateFolderPath('src/assets/images')).toBe('src/assets/images');
  });

  it('should normalize paths with different separators', () => {
    expect(validateFolderPath('frontend\\node_modules')).toBe('frontend/node_modules');
    expect(validateFolderPath('backend\\uploads\\temp')).toBe('backend/uploads/temp');
  });

  it('should handle leading and trailing slashes', () => {
    expect(validateFolderPath('/uploads/')).toBe('uploads');
    expect(validateFolderPath('\\frontend\\dist\\')).toBe('frontend/dist');
    expect(validateFolderPath('/src/assets/')).toBe('src/assets');
  });

  it('should reject directory traversal attempts', () => {
    expect(() => validateFolderPath('../uploads')).toThrow('Invalid folder path');
    expect(() => validateFolderPath('uploads/../data')).toThrow('Invalid folder path');
    expect(() => validateFolderPath('../../etc/passwd')).toThrow('Invalid folder path');
    expect(() => validateFolderPath('uploads/../../data')).toThrow('Invalid folder path');
  });

  it('should reject absolute paths', () => {
    expect(() => validateFolderPath('/etc/passwd')).toThrow('Invalid folder path');
    expect(() => validateFolderPath('C:\\Windows\\System32')).toThrow('Invalid folder path');
    expect(() => validateFolderPath('/home/user/uploads')).toThrow('Invalid folder path');
  });

  it('should reject empty or invalid paths', () => {
    expect(() => validateFolderPath('')).toThrow('Folder path must be a non-empty string');
    expect(() => validateFolderPath('   ')).toThrow('Path cannot be empty after normalization');
    expect(() => validateFolderPath(null)).toThrow('Folder path must be a non-empty string');
    expect(() => validateFolderPath(undefined)).toThrow('Folder path must be a non-empty string');
    expect(() => validateFolderPath('/')).toThrow('Path cannot be empty after normalization');
    expect(() => validateFolderPath('\\')).toThrow('Path cannot be empty after normalization');
  });

  it('should handle current directory references', () => {
    expect(validateFolderPath('./uploads')).toBe('uploads');
    expect(validateFolderPath('frontend/./dist')).toBe('frontend/dist');
    expect(validateFolderPath('./src/./assets')).toBe('src/assets');
  });
});
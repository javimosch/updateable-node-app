// Test the persistent folders functionality with nested paths
const fs = require('fs').promises;
const path = require('path');
const os = require('os');
const { backupPersistentFolders, restorePersistentFolders, validateFolderPath } = require('./utils/persistentFolders');

async function testPersistentFolders() {
  console.log('Testing persistent folders with nested paths...\n');
  
  // Create temporary directories
  const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'persistent-test-'));
  const currentDeployment = path.join(tempDir, 'current');
  const newDeployment = path.join(tempDir, 'new');
  const persistentDir = path.join(tempDir, 'persistent');
  
  try {
    // Create directory structure
    await fs.mkdir(currentDeployment, { recursive: true });
    await fs.mkdir(newDeployment, { recursive: true });
    await fs.mkdir(persistentDir, { recursive: true });
    
    // Test configuration with nested paths
    const config = { 
      persistentFoldersUI: 'uploads,frontend/node_modules,backend/data/cache' 
    };
    
    console.log('Creating test directory structure...');
    
    // Create nested directories with content
    const uploadsDir = path.join(currentDeployment, 'uploads');
    const frontendNodeModules = path.join(currentDeployment, 'frontend', 'node_modules');
    const backendDataCache = path.join(currentDeployment, 'backend', 'data', 'cache');
    
    await fs.mkdir(uploadsDir, { recursive: true });
    await fs.mkdir(frontendNodeModules, { recursive: true });
    await fs.mkdir(backendDataCache, { recursive: true });
    
    // Add test files
    await fs.writeFile(path.join(uploadsDir, 'image.jpg'), 'fake image data');
    await fs.writeFile(path.join(frontendNodeModules, 'package.json'), '{"name": "test"}');
    await fs.writeFile(path.join(backendDataCache, 'cache.db'), 'cache data');
    
    console.log('✅ Created test directories and files');
    
    // Test backup
    console.log('\nTesting backup...');
    await backupPersistentFolders(currentDeployment, persistentDir, config);
    
    // Verify backup worked
    const backupExists = [
      await fs.access(path.join(persistentDir, 'uploads')).then(() => true).catch(() => false),
      await fs.access(path.join(persistentDir, 'frontend', 'node_modules')).then(() => true).catch(() => false),
      await fs.access(path.join(persistentDir, 'backend', 'data', 'cache')).then(() => true).catch(() => false),
    ];
    
    if (backupExists.every(exists => exists)) {
      console.log('✅ Backup successful - all folders moved to persistent directory');
    } else {
      console.log('❌ Backup failed - some folders missing');
      return;
    }
    
    // Test restore
    console.log('\nTesting restore...');
    await restorePersistentFolders(newDeployment, persistentDir, config);
    
    // Verify restore worked
    const restoreExists = [
      await fs.access(path.join(newDeployment, 'uploads')).then(() => true).catch(() => false),
      await fs.access(path.join(newDeployment, 'frontend', 'node_modules')).then(() => true).catch(() => false),
      await fs.access(path.join(newDeployment, 'backend', 'data', 'cache')).then(() => true).catch(() => false),
    ];
    
    if (restoreExists.every(exists => exists)) {
      console.log('✅ Restore successful - all folders moved to new deployment');
    } else {
      console.log('❌ Restore failed - some folders missing');
      return;
    }
    
    // Verify content integrity
    const packageContent = await fs.readFile(path.join(newDeployment, 'frontend', 'node_modules', 'package.json'), 'utf-8');
    if (packageContent === '{"name": "test"}') {
      console.log('✅ Content integrity verified');
    } else {
      console.log('❌ Content integrity check failed');
    }
    
    console.log('\n🎉 All tests passed! Nested path support is working correctly.');
    
  } catch (error) {
    console.error('❌ Test failed:', error.message);
    console.error(error.stack);
  } finally {
    // Cleanup
    try {
      await fs.rm(tempDir, { recursive: true, force: true });
      console.log('\n🧹 Cleanup completed');
    } catch (cleanupError) {
      console.warn('Warning: Cleanup failed:', cleanupError.message);
    }
  }
}

// Run the test
testPersistentFolders().catch(console.error);
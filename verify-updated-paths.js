// Manual verification of updated path validation logic
const path = require('path');

function validateFolderPath(folderPath) {
  if (!folderPath || typeof folderPath !== 'string') {
    throw new Error('Folder path must be a non-empty string');
  }
  
  // Trim whitespace
  const trimmed = folderPath.trim();
  if (!trimmed) {
    throw new Error('Folder path must be a non-empty string');
  }
  
  // Check for absolute paths before normalization (including Windows paths)
  if (path.isAbsolute(trimmed) || /^[a-zA-Z]:[\/\\]/.test(trimmed)) {
    throw new Error(`Invalid folder path: ${folderPath}. Paths must be relative and cannot contain '..' components.`);
  }
  
  // Remove leading/trailing slashes first to avoid absolute path detection issues
  const withoutSlashes = trimmed.replace(/^[\/\\]+|[\/\\]+$/g, '');
  
  if (!withoutSlashes) {
    throw new Error(`Invalid folder path: ${folderPath}. Path cannot be empty after normalization.`);
  }
  
  // Normalize the path to resolve any '..' or '.' components
  const normalized = path.normalize(withoutSlashes);
  
  // Check for directory traversal attempts after normalization
  if (normalized.includes('..')) {
    throw new Error(`Invalid folder path: ${folderPath}. Paths must be relative and cannot contain '..' components.`);
  }
  
  // Final check for absolute paths after normalization
  if (path.isAbsolute(normalized)) {
    throw new Error(`Invalid folder path: ${folderPath}. Paths must be relative and cannot contain '..' components.`);
  }
  
  // Convert backslashes to forward slashes for consistency
  const cleaned = normalized.replace(/\\/g, '/');
  
  if (!cleaned) {
    throw new Error(`Invalid folder path: ${folderPath}. Path cannot be empty after normalization.`);
  }
  
  return cleaned;
}

// Test cases from the failing tests
const testCases = [
  // Should pass - leading/trailing slashes
  { input: '/uploads/', expected: 'uploads', desc: 'leading/trailing slashes' },
  { input: '\\frontend\\dist\\', expected: 'frontend/dist', desc: 'Windows-style slashes' },
  { input: '/src/assets/', expected: 'src/assets', desc: 'nested path with slashes' },
  
  // Should pass - current directory references
  { input: './uploads', expected: 'uploads', desc: 'current directory reference' },
  { input: 'frontend/./dist', expected: 'frontend/dist', desc: 'nested current directory' },
  
  // Should fail - directory traversal
  { input: '../uploads', shouldFail: true, desc: 'parent directory traversal' },
  { input: 'uploads/../data', shouldFail: true, desc: 'nested parent directory traversal' },
  { input: '../../etc/passwd', shouldFail: true, desc: 'multiple parent directory traversal' },
  { input: 'uploads/../../data', shouldFail: true, desc: 'complex parent directory traversal' },
  
  // Should fail - absolute paths
  { input: '/etc/passwd', shouldFail: true, desc: 'Unix absolute path' },
  { input: 'C:\\Windows\\System32', shouldFail: true, desc: 'Windows absolute path' },
  { input: '/home/user/uploads', shouldFail: true, desc: 'Unix home path' },
  
  // Should fail - empty paths
  { input: '   ', shouldFail: true, desc: 'whitespace only' },
  { input: '/', shouldFail: true, desc: 'root slash only' },
  { input: '\\', shouldFail: true, desc: 'backslash only' },
  { input: '', shouldFail: true, desc: 'empty string' },
  { input: null, shouldFail: true, desc: 'null value' },
  { input: undefined, shouldFail: true, desc: 'undefined value' },
];

console.log('Testing updated path validation logic...\n');

let passed = 0;
let failed = 0;

testCases.forEach(({ input, expected, shouldFail, desc }) => {
  try {
    const result = validateFolderPath(input);
    if (shouldFail) {
      console.log(`❌ "${input}" (${desc}) should have failed but returned: "${result}"`);
      failed++;
    } else if (expected && result !== expected) {
      console.log(`❌ "${input}" (${desc}) expected "${expected}" but got "${result}"`);
      failed++;
    } else {
      console.log(`✅ "${input}" (${desc}) -> "${result}"`);
      passed++;
    }
  } catch (error) {
    if (shouldFail) {
      console.log(`✅ "${input}" (${desc}) correctly failed: ${error.message}`);
      passed++;
    } else {
      console.log(`❌ "${input}" (${desc}) unexpectedly failed: ${error.message}`);
      failed++;
    }
  }
});

console.log(`\nResults: ${passed} passed, ${failed} failed`);
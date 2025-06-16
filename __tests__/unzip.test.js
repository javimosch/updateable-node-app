const path = require('path');
const fs = require('fs');
const fsPromises = require('fs').promises;
const os = require('os');
const AdmZip = require('adm-zip');
const { extractZip } = require('../utils/unzip');

describe('extractZip', () => {
  const assetsDir = path.join(__dirname, '..', '__tests__');
  const zipPath = path.join(assetsDir, 'debug_upload.zip');
  const filesToInclude = {
    'index.js': "console.log('hello');\n",
    'package.json': '{ "name": "dummy" }\n',
    'package-lock.json': '{ "lock": true }\n',
  };

  // Ensure the asset zip exists (create programmatically for deterministic test)
  beforeAll(() => {
    if (!fs.existsSync(assetsDir)) {
      fs.mkdirSync(assetsDir, { recursive: true });
    }

    const zip = new AdmZip();
    for (const [filename, content] of Object.entries(filesToInclude)) {
      if (filename.endsWith('/')) {
        //addFolder is not a function
        //zip.addFolder(filename.split('/').join(''));
        zip.addFile(filename, Buffer.from(content, 'utf8'));
      } else {
        zip.addFile(filename, Buffer.from(content, 'utf8'));
      }
    }
    zip.writeZip(zipPath);
  });

  afterAll(() => {
    // Clean up the generated zip file
    if (fs.existsSync(zipPath)) {
      fs.unlinkSync(zipPath);
    }
  });

  it('should extract zip to folder containing required files', async () => {
    // Create a temporary directory for extraction
    const tmpDir = await fsPromises.mkdtemp(path.join(os.tmpdir(), 'unzip-test-'));

    // Perform extraction
    await extractZip(zipPath, tmpDir);

    // Assert required files exist
    for (const filename of Object.keys(filesToInclude)) {
      const filePath = path.join(tmpDir, filename);
      const exists = fs.existsSync(filePath);
      console.log(filePath);
      expect(exists).toBe(true);
    }

    // Clean up extracted directory
    await fsPromises.rm(tmpDir, { recursive: true, force: true });
  });
});

const fs = require('fs');
const fsPromises = require('fs').promises;
const AdmZip = require('adm-zip'); // Switched to adm-zip for better compatibility with zip files created by upload.sh and other tools
const path = require('path');

/**
 * Extract a zip file to a destination directory.
 * Resolves when the extraction completes.
 *
 * @param {string} zipPath - Absolute path to the zip file.
 * @param {string} destPath - Destination directory where contents will be extracted.
 * @returns {Promise<void>}
 */
async function extractZip(zipPath, destPath) {
  if (!path.isAbsolute(zipPath)) {
    zipPath = path.resolve(zipPath);
  }
  if (!path.isAbsolute(destPath)) {
    destPath = path.resolve(destPath);
  }

  await fsPromises.mkdir(destPath, { recursive: true });
  // Implementation switched to adm-zip for robust compatibility with zip files from upload.sh and Docker environments
  console.debug('extractZip: Starting extraction (adm-zip)', { zipPath, destPath });
  try {
    const zip = new AdmZip(zipPath);
    const zipEntries = zip.getEntries();
    console.debug(`extractZip: Found ${zipEntries.length} entries in zip`);
    for (const entry of zipEntries) {
      const entryPath = path.join(destPath, entry.entryName);
      if (entry.isDirectory) {
        await fsPromises.mkdir(entryPath, { recursive: true });
        console.debug('Created directory:', entryPath);
      } else {
        await fsPromises.mkdir(path.dirname(entryPath), { recursive: true });
        zip.extractEntryTo(entry, path.dirname(entryPath), false, true);
        console.debug('Extracted file:', entryPath);
      }
    }
    console.debug('extractZip: Extraction complete (adm-zip)');
  } catch (err) {
    console.debug('extractZip: adm-zip extraction error:', err);
    throw err;
  }
}

module.exports = {
  extractZip,
};

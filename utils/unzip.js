const fs = require('fs');
const fsPromises = require('fs').promises;
const unzip = require('unzipper');
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
  return new Promise((resolve, reject) => {
    fs.createReadStream(zipPath)
      .pipe(unzip.Extract({ path: destPath }))
      .on('close', resolve)
      .on('error', reject);
  });
}

module.exports = {
  extractZip,
};

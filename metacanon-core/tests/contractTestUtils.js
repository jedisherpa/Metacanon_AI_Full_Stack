const fs = require('node:fs');
const path = require('node:path');

const REPO_ROOT = path.resolve(__dirname, '..');

function absoluteFromRoot(relativePath) {
  return path.join(REPO_ROOT, relativePath);
}

function fileExists(relativePath) {
  return fs.existsSync(absoluteFromRoot(relativePath));
}

function readFile(relativePath) {
  return fs.readFileSync(absoluteFromRoot(relativePath), 'utf8');
}

function readSrc(relativePath) {
  return readFile(path.join('src', relativePath));
}

module.exports = {
  REPO_ROOT,
  absoluteFromRoot,
  fileExists,
  readFile,
  readSrc,
};

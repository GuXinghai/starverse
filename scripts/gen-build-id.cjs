const fs = require('node:fs');
const path = require('node:path');
const { execSync } = require('node:child_process');

function getGitCommit() {
  try {
    const out = execSync('git rev-parse --short HEAD', { stdio: ['ignore', 'pipe', 'ignore'] });
    const commit = String(out).trim();
    return commit.length > 0 ? commit : null;
  } catch {
    return null;
  }
}

const commit = getGitCommit();
const timestamp = new Date().toISOString();
const buildId = commit ? `${commit}-${timestamp}` : timestamp;

const payload = {
  buildId,
  commit,
  timestamp,
};

const root = path.join(__dirname, '..');
const target = path.join(root, 'public', 'build-id.json');

fs.mkdirSync(path.dirname(target), { recursive: true });
fs.writeFileSync(target, JSON.stringify(payload, null, 2), 'utf8');

console.log(`[build-id] ${buildId} -> ${target}`);

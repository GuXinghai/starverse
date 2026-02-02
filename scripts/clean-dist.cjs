const fs = require('node:fs');
const path = require('node:path');

const ROOT = path.join(__dirname, '..');
const targets = ['dist', 'dist-electron'].map((dir) => path.join(ROOT, dir));

for (const target of targets) {
  try {
    fs.rmSync(target, { recursive: true, force: true });
    console.log(`[clean-dist] removed: ${target}`);
  } catch (err) {
    console.error(`[clean-dist] failed to remove: ${target}`, err);
    process.exitCode = 1;
  }
}

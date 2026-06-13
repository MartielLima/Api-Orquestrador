#!/usr/bin/env node
// Build the sascar-sdk if it was installed from GitHub and has no dist/.
// This is the postinstall hook for the api-orquestrador project.
// It is idempotent: a no-op if dist already exists.
const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

const sdkDir = path.join(__dirname, '..', '..', 'node_modules', 'sascar-sdk');
const distEntry = path.join(sdkDir, 'dist', 'index.js');

if (fs.existsSync(distEntry)) {
  process.exit(0);
}

if (!fs.existsSync(path.join(sdkDir, 'package.json'))) {
  console.log('[postinstall] sascar-sdk not installed, skipping build');
  process.exit(0);
}

console.log('[postinstall] building sascar-sdk (dist/ missing)');
try {
  execSync('npm install --no-audit --no-fund', { cwd: sdkDir, stdio: 'inherit' });
  execSync('npm run build', { cwd: sdkDir, stdio: 'inherit' });
  console.log('[postinstall] sascar-sdk built');
} catch (err) {
  console.error('[postinstall] failed to build sascar-sdk:', err.message);
  process.exit(1);
}

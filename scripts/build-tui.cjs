#!/usr/bin/env node
/* eslint-disable */
/**
 * scripts/build-tui.cjs
 *
 * Compiles the TUI as a standalone ESM package into dist-tui/:
 *   1. Run `tsc` with tsconfig.tui.json (module: ESNext, outDir: dist-tui).
 *   2. Post-process every emitted .js to add `.js` to relative imports
 *      (needed because Node's ESM resolver requires file extensions).
 *   3. Write dist-tui/package.json with {"type":"module"} so Node treats
 *      the output as ESM regardless of the project root's type field.
 */
const { execFileSync } = require('node:child_process');
const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(__dirname, '..');
const tscBin = path.join(root, 'node_modules', '.bin', 'tsc');
const distDir = path.join(root, 'dist-tui');

function log(msg) {
  process.stdout.write(`[build-tui] ${msg}\n`);
}

function runTsc() {
  log('running tsc with tsconfig.tui.json');
  execFileSync(tscBin, ['--project', path.join(root, 'tsconfig.tui.json')], {
    stdio: 'inherit',
  });
}

function resolveRelativeImport(fromFile, importPath) {
  if (importPath.endsWith('.js') || importPath.endsWith('.json')) return importPath;
  const fromDir = path.dirname(fromFile);
  const targetNoExt = path.resolve(fromDir, importPath);
  if (fs.existsSync(targetNoExt + '.js')) return importPath + '.js';
  if (fs.existsSync(targetNoExt + '.json')) return importPath + '.json';
  try {
    const stat = fs.statSync(targetNoExt);
    if (stat.isDirectory()) {
      if (fs.existsSync(path.join(targetNoExt, 'index.js'))) return importPath + '/index.js';
      if (fs.existsSync(path.join(targetNoExt, 'index.json'))) return importPath + '/index.json';
    }
  } catch {
    // path doesn't exist; fall through
  }
  return importPath + '.js';
}

function addJsToRelativeImports(fromFile, source) {
  const replacer = (_m, p1, p2, p3) => `${p1}${resolveRelativeImport(fromFile, p2)}${p3}`;
  let out = source;
  out = out.replace(
    /((?:^|\n)\s*(?:import|export)\b[^'"\n;]*?\bfrom\s*['"])(\.\.?\/[^'"]+?)(['"])/g,
    replacer,
  );
  out = out.replace(
    /(\bimport\s*\(\s*['"])(\.\.?\/[^'"]+?)(['"])/g,
    replacer,
  );
  return out;
}

function processJsFiles(dir) {
  const entries = fs.readdirSync(dir, { withFileTypes: true });
  for (const entry of entries) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      processJsFiles(full);
      continue;
    }
    if (!entry.name.endsWith('.js')) continue;
    const src = fs.readFileSync(full, 'utf8');
    const patched = addJsToRelativeImports(full, src);
    if (patched !== src) {
      fs.writeFileSync(full, patched);
      log(`patched imports: ${path.relative(root, full)}`);
    }
  }
}

function writeEsmMarker() {
  const markerPath = path.join(distDir, 'package.json');
  fs.writeFileSync(markerPath, JSON.stringify({ type: 'module' }, null, 2) + '\n');
  log(`wrote ESM marker: ${path.relative(root, markerPath)}`);
}

function main() {
  runTsc();
  processJsFiles(distDir);
  writeEsmMarker();
  log('done');
}

main();

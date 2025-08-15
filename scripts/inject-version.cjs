#!/usr/bin/env node

const fs = require('fs');
const path = require('path');

// Read package.json
const packageJson = JSON.parse(fs.readFileSync(path.join(__dirname, '../package.json'), 'utf8'));
const version = packageJson.version;

// Path to AboutModal.tsx
const aboutModalPath = path.join(__dirname, '../src/renderer/components/About/AboutModal.tsx');

// Read the file
let content = fs.readFileSync(aboutModalPath, 'utf8');

// Replace the version
content = content.replace(
  /version:\s*['"][\d.]+['"]/,
  `version: '${version}'`
);

// Write back
fs.writeFileSync(aboutModalPath, content, 'utf8');

console.log(`✅ Injected version ${version} into AboutModal.tsx`);
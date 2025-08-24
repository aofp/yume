#!/usr/bin/env node

const fs = require('fs');
const path = require('path');

// Read the file
const filePath = path.join(__dirname, '..', 'src-tauri', 'src', 'logged_server.rs');
let content = fs.readFileSync(filePath, 'utf8');

// Find the start and end of EMBEDDED_SERVER
const startMarker = 'const EMBEDDED_SERVER: &str = r#"';
const endMarker = '"#;';

const startIndex = content.indexOf(startMarker);
const endIndex = content.indexOf(endMarker, startIndex) + endMarker.length;

if (startIndex === -1 || endIndex === -1) {
  console.error('Could not find EMBEDDED_SERVER markers');
  process.exit(1);
}

// Replace the entire EMBEDDED_SERVER with a comment
const replacement = '// EMBEDDED_SERVER removed - now using external server file';
content = content.substring(0, startIndex) + replacement + content.substring(endIndex);

// Write back
fs.writeFileSync(filePath, content);
console.log('✅ Removed EMBEDDED_SERVER constant from logged_server.rs');
#!/usr/bin/env node

/**
 * Syncs the server-claude-macos.js file into the Rust embedded server constant
 * This ensures Windows uses the same server code as macOS
 */

const fs = require('fs');
const path = require('path');

const serverPath = path.join(__dirname, '..', 'src-tauri', 'resources', 'server-claude-macos.cjs');
const rustPath = path.join(__dirname, '..', 'src-tauri', 'src', 'logged_server.rs');

// Read the server file
const serverContent = fs.readFileSync(serverPath, 'utf8');

// Read the Rust file
let rustContent = fs.readFileSync(rustPath, 'utf8');

// Find the embedded server constant
const startMarker = 'const EMBEDDED_SERVER: &str = r#"';
const endMarker = '"#;';

const startIndex = rustContent.indexOf(startMarker);
const endIndex = rustContent.indexOf(endMarker, startIndex);

if (startIndex === -1 || endIndex === -1) {
    console.error('Could not find EMBEDDED_SERVER constant in Rust file');
    process.exit(1);
}

// Replace the embedded server content
const before = rustContent.substring(0, startIndex + startMarker.length);
const after = rustContent.substring(endIndex);

// Escape the server content for Rust raw string
// In raw strings, we only need to escape the "#; sequence
const escapedServer = serverContent.replace(/"#/g, '"##');

const newRustContent = before + '\n' + escapedServer + '\n' + after;

// Write back the Rust file
fs.writeFileSync(rustPath, newRustContent);

console.log('✅ Synced server-claude-macos.js into Rust embedded server');
console.log('📦 Now rebuild with: npm run tauri:build');
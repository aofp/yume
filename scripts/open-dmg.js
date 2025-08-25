#!/usr/bin/env node

const { execSync } = require('child_process');
const fs = require('fs');
const path = require('path');

// Possible locations for the DMG
const possiblePaths = [
  'src-tauri/target/aarch64-apple-darwin/release/bundle/dmg',
  'src-tauri/target/release/bundle/dmg',
  'src-tauri/target/universal-apple-darwin/release/bundle/dmg'
];

// Find the DMG file
let dmgPath = null;
for (const dir of possiblePaths) {
  const fullPath = path.join(process.cwd(), dir);
  if (fs.existsSync(fullPath)) {
    const files = fs.readdirSync(fullPath);
    const dmgFile = files.find(f => f.endsWith('.dmg'));
    if (dmgFile) {
      dmgPath = path.join(fullPath, dmgFile);
      break;
    }
  }
}

if (dmgPath) {
  console.log(`📦 Opening DMG: ${dmgPath}`);
  try {
    execSync(`open "${dmgPath}"`, { stdio: 'inherit' });
  } catch (error) {
    console.error('Failed to open DMG:', error.message);
  }
} else {
  console.log('⚠️  No DMG file found. Build might have failed or bundle not created.');
  console.log('Checking for .app bundle...');
  
  // Try to find .app bundle
  const appPaths = [
    'src-tauri/target/aarch64-apple-darwin/release/bundle/macos',
    'src-tauri/target/release/bundle/macos',
    'src-tauri/target/universal-apple-darwin/release/bundle/macos'
  ];
  
  for (const dir of appPaths) {
    const fullPath = path.join(process.cwd(), dir);
    if (fs.existsSync(fullPath)) {
      const files = fs.readdirSync(fullPath);
      const appFile = files.find(f => f.endsWith('.app'));
      if (appFile) {
        const appPath = path.join(fullPath, appFile);
        console.log(`📱 Opening app: ${appPath}`);
        try {
          execSync(`open "${appPath}"`, { stdio: 'inherit' });
        } catch (error) {
          console.error('Failed to open app:', error.message);
        }
        break;
      }
    }
  }
}
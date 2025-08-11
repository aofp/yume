#!/usr/bin/env node

const fs = require('fs');
const path = require('path');

console.log('Fixing macOS app name...');

// During development, fix the Electron app name
const electronAppPath = path.join(__dirname, '../node_modules/electron/dist/Electron.app');
const electronInfoPlistPath = path.join(electronAppPath, 'Contents/Info.plist');

if (fs.existsSync(electronInfoPlistPath)) {
  console.log('Found Electron Info.plist, updating CFBundleName and CFBundleDisplayName...');
  
  let content = fs.readFileSync(electronInfoPlistPath, 'utf8');
  
  // Update CFBundleName
  content = content.replace(
    /<key>CFBundleName<\/key>\s*<string>Electron<\/string>/,
    '<key>CFBundleName</key>\n\t<string>yurucode</string>'
  );
  
  // Update CFBundleDisplayName if it exists, or add it
  if (content.includes('<key>CFBundleDisplayName</key>')) {
    content = content.replace(
      /<key>CFBundleDisplayName<\/key>\s*<string>[^<]*<\/string>/,
      '<key>CFBundleDisplayName</key>\n\t<string>yurucode</string>'
    );
  } else {
    // Add CFBundleDisplayName after CFBundleName
    content = content.replace(
      /<key>CFBundleName<\/key>\s*<string>yurucode<\/string>/,
      '<key>CFBundleName</key>\n\t<string>yurucode</string>\n\t<key>CFBundleDisplayName</key>\n\t<string>yurucode</string>'
    );
  }
  
  fs.writeFileSync(electronInfoPlistPath, content);
  console.log('✅ Updated Electron Info.plist with yurucode name');
} else {
  console.log('❌ Electron Info.plist not found at:', electronInfoPlistPath);
}

console.log('Done!');
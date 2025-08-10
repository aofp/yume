const path = require('path');
const fs = require('fs');

// This script uses rcedit to manually set the icon on the exe after build
const exePath = path.join(__dirname, '..', 'release', 'win-unpacked', 'yurucode.exe');
const iconPath = path.join(__dirname, '..', 'build', 'icon.ico');

console.log('Setting icon on exe file...');
console.log('Exe path:', exePath);
console.log('Icon path:', iconPath);

if (!fs.existsSync(exePath)) {
  console.error('Exe file not found! Build the app first.');
  process.exit(1);
}

if (!fs.existsSync(iconPath)) {
  console.error('Icon file not found!');
  process.exit(1);
}

try {
  // Use rcedit directly
  const rcedit = require('rcedit');
  
  console.log('Using rcedit to set icon...');
  rcedit(exePath, {
    icon: iconPath
  }, (err) => {
    if (err) {
      console.error('Failed to set icon:', err);
      process.exit(1);
    }
    console.log('✅ Icon set successfully!');
  });
} catch (err) {
  console.error('Failed to load rcedit:', err.message);
  console.error('Make sure rcedit is installed: npm install rcedit');
  process.exit(1);
}
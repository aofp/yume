const fs = require('fs');
const path = require('path');
const pngToIco = require('png-to-ico');

async function createIcon() {
  console.log('Creating proper Windows icon with multiple resolutions...');
  
  // Use the available PNG files to create a proper ico
  const pngFiles = [
    'assets/icons/png/256x256.png',
    'assets/icons/png/128x128.png', 
    'assets/icons/png/64x64.png',
    'assets/icons/png/48x48.png',
    'assets/icons/png/32x32.png',
    'assets/icons/png/16x16.png'
  ].filter(f => fs.existsSync(f));
  
  if (pngFiles.length === 0) {
    console.error('No PNG files found!');
    return;
  }
  
  console.log('Found PNG files:', pngFiles);
  
  try {
    // Read the PNG files
    const buffers = pngFiles.map(file => fs.readFileSync(file));
    
    // Convert to ICO with multiple resolutions
    const ico = await pngToIco(buffers);
    
    // Save to build directory
    if (!fs.existsSync('build')) {
      fs.mkdirSync('build');
    }
    
    fs.writeFileSync('build/icon.ico', ico);
    console.log('✅ Created build/icon.ico with multiple resolutions');
    
    // Also copy the largest PNG for other uses
    const largestPng = pngFiles[0];
    fs.copyFileSync(largestPng, 'build/icon.png');
    console.log('✅ Copied icon.png to build directory');
    
  } catch (err) {
    console.error('Error creating icon:', err);
  }
}

createIcon();
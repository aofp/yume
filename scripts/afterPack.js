const path = require('path');
const { execSync } = require('child_process');
const fs = require('fs');

exports.default = async function(context) {
  console.log('===== AFTERPACK HOOK: SETTING ICON =====');
  
  const { appOutDir, packager } = context;
  const { productFilename } = packager.appInfo;
  
  // Only process Windows builds
  if (process.platform !== 'win32') {
    console.log('Not Windows, skipping icon fix');
    return;
  }
  
  const exePath = path.join(appOutDir, `${productFilename}.exe`);
  const iconPath = path.join(context.packager.projectDir, 'build', 'icon.ico');
  
  console.log('Exe path:', exePath);
  console.log('Icon path:', iconPath);
  console.log('Exe exists:', fs.existsSync(exePath));
  console.log('Icon exists:', fs.existsSync(iconPath));
  
  if (!fs.existsSync(exePath)) {
    console.error('EXE not found:', exePath);
    return;
  }
  
  if (!fs.existsSync(iconPath)) {
    console.error('Icon not found:', iconPath);
    return;
  }
  
  // Wait a moment for file to be fully written
  await new Promise(resolve => setTimeout(resolve, 1000));
  
  try {
    // Method 1: Direct rcedit with full path
    const rceditPath = path.join(context.packager.projectDir, 'node_modules', 'rcedit', 'bin', 'rcedit-x64.exe');
    
    if (fs.existsSync(rceditPath)) {
      console.log('Using rcedit at:', rceditPath);
      
      // Use absolute paths and proper escaping
      const cmd = `"${rceditPath}" "${exePath}" --set-icon "${iconPath}"`;
      console.log('Executing command:', cmd);
      
      execSync(cmd, { 
        stdio: 'inherit',
        cwd: context.packager.projectDir
      });
      
      console.log('✅ Icon command executed!');
      
      // Verify the file was modified
      const stats = fs.statSync(exePath);
      console.log('Exe modified time after:', stats.mtime);
      
    } else {
      console.error('rcedit not found at expected location');
      
      // Try downloading it directly
      const rceditUrl = 'https://github.com/electron/rcedit/releases/download/v2.0.0/rcedit-x64.exe';
      const localRcedit = path.join(context.packager.projectDir, 'rcedit.exe');
      
      if (!fs.existsSync(localRcedit)) {
        console.log('Downloading rcedit...');
        execSync(`curl -L -o "${localRcedit}" ${rceditUrl}`, { stdio: 'inherit' });
      }
      
      if (fs.existsSync(localRcedit)) {
        console.log('Using downloaded rcedit');
        execSync(`"${localRcedit}" "${exePath}" --set-icon "${iconPath}"`, { 
          stdio: 'inherit',
          cwd: context.packager.projectDir
        });
        console.log('✅ Icon set with downloaded rcedit!');
      }
    }
    
  } catch (err) {
    console.error('Failed to set icon:', err.message);
    console.error('Stack:', err.stack);
    
    // Don't fail the build
    console.warn('WARNING: Could not set custom icon');
  }
  
  console.log('=========================================');
};
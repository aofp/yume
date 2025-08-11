const path = require('path');
const { execSync } = require('child_process');
const fs = require('fs');

exports.default = async function(context) {
  console.log('===== AFTERPACK HOOK: OPTIMIZATIONS & ICON =====');
  
  const { appOutDir, packager } = context;
  const { productFilename } = packager.appInfo;
  const resourcesDir = path.join(appOutDir, 'resources');
  
  // Perform size optimizations first
  console.log('Performing size optimizations...');
  
  // Remove unnecessary Electron locales (keep only English)
  const localesDir = path.join(appOutDir, 'locales');
  if (fs.existsSync(localesDir)) {
    const files = fs.readdirSync(localesDir);
    let removedSize = 0;
    for (const file of files) {
      if (!file.startsWith('en-') && file !== 'en-US.pak') {
        const filePath = path.join(localesDir, file);
        const stats = fs.statSync(filePath);
        removedSize += stats.size;
        fs.unlinkSync(filePath);
        console.log(`  Removed locale: ${file} (${(stats.size / 1024).toFixed(1)}KB)`);
      }
    }
    console.log(`  Total locales removed: ${(removedSize / 1024 / 1024).toFixed(2)}MB`);
  }
  
  // Remove unnecessary Chromium files for features we don't use
  const unnecessaryFiles = [
    'vk_swiftshader_icd.json',
    'vk_swiftshader.dll',
    'vulkan-1.dll',
    'chrome_100_percent.pak',
    'chrome_200_percent.pak',
    'd3dcompiler_47.dll',
    'libEGL.dll',
    'libGLESv2.dll',
    'ffmpeg.dll',
    'LICENSES.chromium.html',
    'pdf.dll',
    'pdf_viewer_resources.pak'
  ];
  
  let totalRemoved = 0;
  for (const file of unnecessaryFiles) {
    const filePath = path.join(appOutDir, file);
    if (fs.existsSync(filePath)) {
      const stats = fs.statSync(filePath);
      totalRemoved += stats.size;
      fs.unlinkSync(filePath);
      console.log(`  Removed: ${file} (${(stats.size / 1024 / 1024).toFixed(2)}MB)`);
    }
  }
  console.log(`  Total files removed: ${(totalRemoved / 1024 / 1024).toFixed(2)}MB`);
  
  // Clean up app.asar.unpacked if it exists
  const asarUnpacked = path.join(resourcesDir, 'app.asar.unpacked');
  if (fs.existsSync(asarUnpacked)) {
    cleanupDirectory(asarUnpacked);
  }
  
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

// Helper function to clean up unnecessary files in directories
function cleanupDirectory(dir) {
  const unnecessaryPatterns = [
    '.md', '.markdown', '.yml', '.yaml', '.txt',
    '.eslintrc', '.prettierrc', '.babelrc', '.gitignore',
    'LICENSE', 'CHANGELOG', 'README', 'AUTHORS',
    '.map', '.ts', '.flow', '.coffee'
  ];
  
  const walkSync = (currentPath) => {
    try {
      const files = fs.readdirSync(currentPath);
      for (const file of files) {
        const filePath = path.join(currentPath, file);
        const stat = fs.statSync(filePath);
        
        if (stat.isDirectory()) {
          // Skip critical directories
          if (file === 'dist' || file === 'lib' || file === 'build') {
            continue;
          }
          // Clean test/example directories entirely
          if (file === 'test' || file === 'tests' || file === 'example' || file === 'examples' || file === 'docs') {
            removeDirectory(filePath);
            console.log(`  Removed directory: ${path.relative(dir, filePath)}`);
            continue;
          }
          walkSync(filePath);
        } else {
          // Check if file should be removed
          for (const pattern of unnecessaryPatterns) {
            if (file.endsWith(pattern) || file.toUpperCase().startsWith(pattern.toUpperCase())) {
              fs.unlinkSync(filePath);
              console.log(`  Cleaned: ${path.relative(dir, filePath)}`);
              break;
            }
          }
        }
      }
    } catch (err) {
      console.error(`Error cleaning ${currentPath}:`, err.message);
    }
  };
  
  walkSync(dir);
}

function removeDirectory(dir) {
  if (fs.existsSync(dir)) {
    fs.readdirSync(dir).forEach((file) => {
      const curPath = path.join(dir, file);
      if (fs.lstatSync(curPath).isDirectory()) {
        removeDirectory(curPath);
      } else {
        fs.unlinkSync(curPath);
      }
    });
    fs.rmdirSync(dir);
  }
}
const { execSync } = require('child_process');
const fs = require('fs');
const path = require('path');

// Create dist directories
const dirs = ['dist', 'dist/main', 'dist/renderer'];
dirs.forEach(dir => {
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
});

// Compile TypeScript for main process
console.log('Building main process...');
try {
  execSync('npx tsc src/main/index.ts --outDir dist/main --module commonjs --target es2022 --esModuleInterop', { stdio: 'inherit' });
  execSync('npx tsc src/main/preload.ts --outDir dist/main --module commonjs --target es2022 --esModuleInterop', { stdio: 'inherit' });
  
  // Fix import statements for CommonJS
  const mainPath = path.join(__dirname, 'dist/main/index.js');
  if (fs.existsSync(mainPath)) {
    let content = fs.readFileSync(mainPath, 'utf8');
    content = content.replace(/from 'url'/g, "from 'node:url'");
    content = content.replace(/from 'path'/g, "from 'node:path'");
    content = content.replace(/import\.meta\.url/g, "__filename");
    fs.writeFileSync(mainPath, content);
  }
} catch (error) {
  console.error('Build failed:', error);
  process.exit(1);
}

console.log('Build complete!');
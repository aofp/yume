#!/usr/bin/env node

/**
 * Recursively find ALL dependencies for our main packages
 */

const fs = require('fs');
const path = require('path');

const allDeps = new Set();
const visited = new Set();

function findAllDependencies(moduleName, depth = 0) {
  if (visited.has(moduleName) || depth > 20) return;
  visited.add(moduleName);
  
  // Skip built-in modules and type definitions
  if (moduleName.startsWith('@types/') || moduleName.includes('/')) {
    return;
  }
  
  const modulePath = path.join(__dirname, '..', 'node_modules', moduleName);
  
  try {
    if (!fs.existsSync(modulePath)) {
      console.log(`  Warning: ${moduleName} not found`);
      return;
    }
    
    allDeps.add(moduleName);
    
    const packageJsonPath = path.join(modulePath, 'package.json');
    if (fs.existsSync(packageJsonPath)) {
      const packageJson = JSON.parse(fs.readFileSync(packageJsonPath, 'utf8'));
      
      // Get ALL types of dependencies
      const deps = {
        ...packageJson.dependencies,
        ...packageJson.optionalDependencies,
        // Skip devDependencies and peerDependencies as they're not needed at runtime
      };
      
      for (const dep of Object.keys(deps)) {
        findAllDependencies(dep, depth + 1);
      }
    }
  } catch (e) {
    console.error(`Error processing ${moduleName}: ${e.message}`);
  }
}

// Start with our main runtime dependencies
const mainDeps = [
  'express',
  'cors', 
  'socket.io',
  'body-parser'
];

console.log('Finding all dependencies recursively...\n');

for (const dep of mainDeps) {
  console.log(`Processing ${dep}...`);
  findAllDependencies(dep);
}

// Convert to sorted array
const sortedDeps = Array.from(allDeps).sort();

console.log('\n✅ All dependencies found:\n');
console.log(sortedDeps.map(d => `    '${d}',`).join('\n'));
console.log(`\nTotal: ${sortedDeps.length} modules`);

// Write to file for easy copy-paste
const output = sortedDeps.map(d => `    '${d}',`).join('\n');
fs.writeFileSync(path.join(__dirname, 'all-dependencies.txt'), output);
console.log('\nSaved to scripts/all-dependencies.txt');
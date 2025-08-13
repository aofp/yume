#!/usr/bin/env node

/**
 * Find all dependencies recursively for our bundled modules
 */

import { readdirSync, statSync, existsSync } from 'fs';
import { join } from 'path';

const visited = new Set();
const allDeps = new Set();

function findDependencies(moduleName, depth = 0) {
  if (visited.has(moduleName) || depth > 10) return;
  visited.add(moduleName);
  
  const modulePath = join('node_modules', moduleName);
  if (!existsSync(modulePath)) {
    console.log(`  ${'  '.repeat(depth)}⚠️  ${moduleName} - NOT FOUND`);
    return;
  }
  
  allDeps.add(moduleName);
  
  try {
    const packagePath = join(modulePath, 'package.json');
    if (existsSync(packagePath)) {
      const pkg = JSON.parse(require('fs').readFileSync(packagePath, 'utf8'));
      const deps = { ...pkg.dependencies, ...pkg.peerDependencies };
      
      for (const dep of Object.keys(deps || {})) {
        if (!dep.startsWith('@types/')) {
          findDependencies(dep, depth + 1);
        }
      }
    }
    
    // Also check node_modules within the module (scoped packages)
    const subModulesPath = join(modulePath, 'node_modules');
    if (existsSync(subModulesPath)) {
      const subModules = readdirSync(subModulesPath);
      for (const subModule of subModules) {
        if (subModule.startsWith('@')) {
          const scopedPath = join(subModulesPath, subModule);
          const scopedModules = readdirSync(scopedPath);
          for (const scopedModule of scopedModules) {
            findDependencies(`${subModule}/${scopedModule}`, depth + 1);
          }
        } else if (!subModule.startsWith('.')) {
          findDependencies(subModule, depth + 1);
        }
      }
    }
  } catch (e) {
    console.log(`  ${'  '.repeat(depth)}❌ Error reading ${moduleName}: ${e.message}`);
  }
}

// Start with our main dependencies
const mainDeps = ['express', 'cors', 'socket.io', 'body-parser'];

console.log('Finding all dependencies...\n');
for (const dep of mainDeps) {
  console.log(`📦 ${dep}`);
  findDependencies(dep);
}

console.log('\n✅ All dependencies found:');
const sortedDeps = Array.from(allDeps).sort();
console.log(sortedDeps.map(d => `    '${d}',`).join('\n'));
console.log(`\nTotal: ${sortedDeps.length} modules`);
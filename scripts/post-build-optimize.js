#!/usr/bin/env node

import { fileURLToPath } from 'url';
import { dirname } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

console.log('\n🚀 Running post-build optimizations...\n');

// Import and run optimization scripts
async function runOptimizations() {
  try {
    // Run CSS optimization
    console.log('1️⃣  Optimizing CSS...');
    await import('./optimize-css.js');
    
    console.log('\n✨ Post-build optimizations complete!\n');
  } catch (error) {
    console.error('❌ Error during post-build optimization:', error);
    process.exit(1);
  }
}

runOptimizations();
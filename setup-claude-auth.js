#!/usr/bin/env node

/**
 * Setup script to authenticate Claude Code SDK
 */

const { execSync } = require('child_process');
const path = require('path');
const fs = require('fs');
const os = require('os');

console.log('🔐 Setting up Claude Code authentication...\n');

// Check if already authenticated
const configPath = path.join(os.homedir(), '.claude-code', 'config.json');
if (fs.existsSync(configPath)) {
  console.log('✅ Claude Code configuration found at:', configPath);
  console.log('📝 You appear to be already authenticated.');
  console.log('\nIf you\'re still having issues, try running:');
  console.log('  npx claude-code login\n');
} else {
  console.log('⚠️  No Claude Code configuration found.');
  console.log('\n📝 To authenticate, please run:');
  console.log('  npx claude-code login\n');
  console.log('This will open your browser to authenticate with your Claude subscription.');
  console.log('\nAfter authenticating, restart the yurucode app.\n');
  
  // Try to run the login command
  console.log('Attempting to open authentication...\n');
  try {
    execSync('npx claude-code login', { stdio: 'inherit' });
  } catch (error) {
    console.error('Could not automatically start login. Please run manually:');
    console.error('  npx claude-code login');
  }
}
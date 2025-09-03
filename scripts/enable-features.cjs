#!/usr/bin/env node

/**
 * Script to enable/disable feature flags for testing
 * Usage: node scripts/enable-features.js [all|none|virtualization|checkpoints|timeline|agents]
 */

const fs = require('fs');
const path = require('path');

const featuresPath = path.join(__dirname, '../src/renderer/config/features.ts');

const args = process.argv.slice(2);
const command = args[0] || 'status';

// Read current features file
let content = fs.readFileSync(featuresPath, 'utf-8');

function setFeature(feature, value) {
  const regex = new RegExp(`(${feature}:\\s*)\\w+`, 'g');
  content = content.replace(regex, `$1${value}`);
}

function enableAll() {
  console.log('🚀 Enabling all features...');
  setFeature('USE_VIRTUALIZATION', 'true');
  setFeature('ENABLE_CHECKPOINTS', 'true');
  setFeature('SHOW_TIMELINE', 'true');
  setFeature('ENABLE_AGENT_EXECUTION', 'true');
  // Never auto-enable native Rust
  // setFeature('USE_NATIVE_RUST', 'true');
}

function disableAll() {
  console.log('🔒 Disabling all features...');
  setFeature('USE_VIRTUALIZATION', 'false');
  setFeature('ENABLE_CHECKPOINTS', 'false');
  setFeature('SHOW_TIMELINE', 'false');
  setFeature('ENABLE_AGENT_EXECUTION', 'false');
  setFeature('USE_NATIVE_RUST', 'false');
}

function enableSafe() {
  console.log('✅ Enabling safe features for testing...');
  setFeature('USE_VIRTUALIZATION', 'true');
  setFeature('ENABLE_CHECKPOINTS', 'true');
  setFeature('SHOW_TIMELINE', 'true');
  setFeature('ENABLE_AGENT_EXECUTION', 'false'); // Agents need more testing
  setFeature('USE_NATIVE_RUST', 'false'); // Never enable without extensive testing
}

function showStatus() {
  console.log('📊 Current feature flags:');
  const matches = content.matchAll(/(\w+):\s*(\w+),/g);
  for (const match of matches) {
    const [, flag, value] = match;
    const icon = value === 'true' ? '✅' : '❌';
    console.log(`  ${icon} ${flag}: ${value}`);
  }
}

switch (command) {
  case 'all':
    enableAll();
    break;
  case 'none':
    disableAll();
    break;
  case 'safe':
    enableSafe();
    break;
  case 'virtualization':
    setFeature('USE_VIRTUALIZATION', 'true');
    console.log('✅ Enabled virtualization');
    break;
  case 'checkpoints':
    setFeature('ENABLE_CHECKPOINTS', 'true');
    console.log('✅ Enabled checkpoints');
    break;
  case 'timeline':
    setFeature('SHOW_TIMELINE', 'true');
    console.log('✅ Enabled timeline');
    break;
  case 'agents':
    setFeature('ENABLE_AGENT_EXECUTION', 'true');
    console.log('✅ Enabled agent execution');
    break;
  case 'status':
  default:
    showStatus();
    console.log('\n📝 Usage:');
    console.log('  node scripts/enable-features.js all       - Enable all features');
    console.log('  node scripts/enable-features.js none      - Disable all features');
    console.log('  node scripts/enable-features.js safe      - Enable safe features only');
    console.log('  node scripts/enable-features.js status    - Show current status');
    console.log('\n  Individual features:');
    console.log('  node scripts/enable-features.js virtualization');
    console.log('  node scripts/enable-features.js checkpoints');
    console.log('  node scripts/enable-features.js timeline');
    console.log('  node scripts/enable-features.js agents');
    process.exit(0);
}

// Write back to file
fs.writeFileSync(featuresPath, content);
console.log(`\n💾 Updated ${featuresPath}`);

// Show new status
showStatus();

console.log('\n⚠️  Remember to restart the application for changes to take effect!');
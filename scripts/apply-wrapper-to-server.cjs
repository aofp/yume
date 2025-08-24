#!/usr/bin/env node

/**
 * Apply wrapper integration to server-claude-macos.js
 * 
 * This script modifies the server to integrate the wrapper
 */

const fs = require('fs');
const path = require('path');

const SERVER_FILE = path.join(__dirname, '..', 'server-claude-macos.js');
const WRAPPER_CODE = fs.readFileSync(path.join(__dirname, 'wrapper-server-integration.cjs'), 'utf8');

// Backup original
const backupFile = SERVER_FILE + '.backup-' + Date.now();
fs.copyFileSync(SERVER_FILE, backupFile);
console.log(`✅ Backed up server to: ${backupFile}`);

// Read current server
let serverCode = fs.readFileSync(SERVER_FILE, 'utf8');

// Check if wrapper already integrated
if (serverCode.includes('UniversalClaudeWrapper')) {
  console.log('⚠️ Wrapper already integrated');
  process.exit(0);
}

// Find the right place to insert wrapper (after imports)
const importEndMatch = serverCode.match(/import[^;]+from[^;]+;[\s\n]*(?!import)/);
if (!importEndMatch) {
  console.error('❌ Could not find import section');
  process.exit(1);
}

const insertPosition = importEndMatch.index + importEndMatch[0].length;

// Convert wrapper code for ES modules
const wrapperForESM = `
// ============================================
// UNIVERSAL CLAUDE WRAPPER INTEGRATION
// ============================================

${WRAPPER_CODE.replace(/const readline = require\('readline'\);/g, "import readline from 'readline';")}

// Make wrapper available globally
const wrapperInstance = global.wrapperInstance;

`;

// Insert wrapper code
serverCode = serverCode.slice(0, insertPosition) + wrapperForESM + serverCode.slice(insertPosition);

// Now modify the spawn logic
// Find the spawn section
const spawnMatch = serverCode.match(/const claudeProcess = .*spawn\(.*?\);/s);
if (!spawnMatch) {
  console.error('❌ Could not find spawn section');
  process.exit(1);
}

// Create replacement spawn logic
const replacementSpawn = `
      // Use wrapper for stream processing
      const claudeProcess = isWindows && CLAUDE_PATH === 'WSL_CLAUDE' ? 
        (() => {
          // Convert Windows path to WSL path if needed
          let wslWorkingDir = processWorkingDir;
          if (processWorkingDir && processWorkingDir.match(/^[A-Z]:\\\\/)) {
            const driveLetter = processWorkingDir[0].toLowerCase();
            const pathWithoutDrive = processWorkingDir.substring(2).replace(/\\\\/g, '/');
            wslWorkingDir = \`/mnt/\${driveLetter}\${pathWithoutDrive}\`;
            console.log(\`📂 Converted Windows path to WSL: \${processWorkingDir} -> \${wslWorkingDir}\`);
          }
          
          const [wslCommand, wslArgs] = createWslClaudeCommand(args, wslWorkingDir);
          console.log(\`🚀 Running WSL command: wsl.exe -e bash -c\`);
          console.log(\`🚀 WSL bash command (first 500 chars):\`, wslArgs[2].substring(0, 500));
          
          const proc = spawn(wslCommand, wslArgs, spawnOptions);
          // Set up wrapper stream processing
          if (wrapperInstance) {
            wrapperInstance.setupStreamProcessing(proc, sessionId);
            console.log('✅ [WRAPPER] Stream processing enabled for', sessionId);
          }
          return proc;
        })() :
        (() => {
          const proc = spawn(CLAUDE_PATH, args, spawnOptions);
          // Set up wrapper stream processing
          if (wrapperInstance) {
            wrapperInstance.setupStreamProcessing(proc, sessionId);
            console.log('✅ [WRAPPER] Stream processing enabled for', sessionId);
          }
          return proc;
        })();`;

// Replace spawn logic
serverCode = serverCode.replace(spawnMatch[0], replacementSpawn);

// Add Socket.IO event handlers for wrapper
const socketHandlers = `
      // Wrapper statistics endpoint
      socket.on('wrapper:get-stats', (sessionId, callback) => {
        if (wrapperInstance) {
          const stats = wrapperInstance.getStats(sessionId);
          console.log('📊 [WRAPPER] Stats requested:', stats);
          callback({ success: true, stats });
        } else {
          callback({ success: false, error: 'Wrapper not available' });
        }
      });
      
      socket.on('wrapper:get-api-responses', (sessionId, callback) => {
        if (wrapperInstance && wrapperInstance.apiResponses.has(sessionId)) {
          const responses = wrapperInstance.apiResponses.get(sessionId);
          console.log(\`📊 [WRAPPER] Returning \${responses.length} API responses for \${sessionId}\`);
          callback({ 
            success: true, 
            responses 
          });
        } else {
          callback({ success: false, error: 'No API responses found' });
        }
      });`;

// Find socket.on('sendMessage' and add handlers after it
const socketOnMatch = serverCode.match(/socket\.on\('sendMessage'[^}]+}\);/s);
if (socketOnMatch) {
  const insertPos = socketOnMatch.index + socketOnMatch[0].length;
  serverCode = serverCode.slice(0, insertPos) + '\n' + socketHandlers + serverCode.slice(insertPos);
}

// Write modified server
fs.writeFileSync(SERVER_FILE, serverCode);
console.log('✅ Wrapper integrated into server');
console.log('🎯 Wrapper features:');
console.log('  • Always-on debug logging');
console.log('  • Complete API response capture');
console.log('  • Token tracking with accumulation');
console.log('  • Compaction detection with summaries');
console.log('  • Socket.IO endpoints for stats');
console.log('\n📝 Restart the server to see wrapper logs');
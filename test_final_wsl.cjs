#!/usr/bin/env node

const { spawn } = require('child_process');

console.log('=== FINAL WSL TEST - EXACT SERVER FLOW ===\n');

// This simulates EXACTLY what the server does
const sessionId = 'test-session';
const message = 'echo test';
const args = [
  '--print',
  '--output-format', 'stream-json',
  '--verbose',
  '--dangerously-skip-permissions',
  '--append-system-prompt', 'CRITICAL: you are in yurucode ui. ALWAYS: use all lowercase (no capitals ever), be extremely concise, never use formal language, no greetings/pleasantries, straight to the point, code/variables keep proper case, one line answers preferred',
  '--model', 'claude-sonnet-4-20250514'
];

// Simulate createWslClaudeCommand function
function createWslClaudeCommand(args, workingDir, message) {
  const wslPath = 'wsl.exe';
  const wslWorkingDir = workingDir || '/mnt/c/Users/muuko/Desktop/yurucode';
  
  if (message) {
    const wslUser = 'yuru';
    const claudePath = `/home/${wslUser}/.claude/local/node_modules/.bin/claude`;
    
    // Build the command with all the args - quote ones that need it
    const argsStr = args.map(arg => {
      // Only quote args that contain spaces or special characters
      if (arg.includes(' ') || arg.includes(':') || arg.includes('(') || arg.includes(')') || arg.includes(',')) {
        return `'${arg.replace(/'/g, "'\\''")}'`;
      }
      return arg;
    }).join(' ');
    
    // Simple message escaping - just replace single quotes
    const messageEscaped = message.replace(/'/g, "'\\''");
    
    // Build the main script using echo instead of printf for simplicity
    const script = `cd ${wslWorkingDir} && echo '${messageEscaped}' | ${claudePath} ${argsStr} 2>&1`;
    
    console.log('🔍 WSL script (main message):');
    console.log('  Working dir:', wslWorkingDir);
    console.log('  Claude path:', claudePath);
    console.log('  Args:', argsStr);
    console.log('  Full script:', script);
    
    return [wslPath, ['-e', 'bash', '-c', script], true];
  }
}

// Get the WSL command
const [wslCommand, wslArgs, inputHandled] = createWslClaudeCommand(args, '/mnt/c/Users/muuko/Desktop/yurucode', message);

console.log('\n🚀 Running WSL command:', wslCommand);
console.log('🚀 WSL args:', JSON.stringify(wslArgs, null, 2));
console.log('🚀 Input handled in script:', inputHandled);

// Spawn the process EXACTLY like the server does
const claudeProcess = spawn(wslCommand, wslArgs, {
  cwd: 'C:\\Users\\muuko\\Desktop\\yurucode',
  stdio: ['pipe', 'pipe', 'pipe'],
  windowsHide: true,
  detached: false
});

console.log(`\n🔍 Process spawned with PID: ${claudeProcess.pid}`);

// Track output
let bytesReceived = 0;
let lineBuffer = '';
let stderrBuffer = '';
let messageCount = 0;

// Handle stderr
claudeProcess.stderr.on('data', (chunk) => {
  const str = chunk.toString();
  stderrBuffer += str;
  console.error(`❌ STDERR output: ${str}`);
});

// Handle stdout
claudeProcess.stdout.on('data', (data) => {
  const str = data.toString();
  bytesReceived += data.length;
  
  console.log(`📥 STDOUT received: ${str.length} bytes (total: ${bytesReceived})`);
  console.log(`📥 Data preview: ${str.substring(0, 200).replace(/\n/g, '\\n')}...`);
  
  lineBuffer += str;
  const lines = lineBuffer.split('\n');
  lineBuffer = lines.pop() || '';
  
  for (const line of lines) {
    if (line.trim()) {
      try {
        const parsed = JSON.parse(line);
        messageCount++;
        console.log(`✅ Parsed JSON message #${messageCount}:`, parsed.type || 'unknown');
      } catch (e) {
        console.log(`⚠️ Non-JSON line: ${line.substring(0, 100)}`);
      }
    }
  }
});

// Handle process exit
claudeProcess.on('close', (code) => {
  console.log(`\n👋 Claude process exited with code ${code}`);
  console.log('📊 STREAM SUMMARY:');
  console.log(`   ├─ Total bytes: ${bytesReceived}`);
  console.log(`   ├─ Messages: ${messageCount}`);
  console.log(`   ├─ Exit code: ${code}`);
  console.log(`   ├─ Stderr: ${stderrBuffer || '(empty)'}`);
  console.log(`   └─ Line buffer: ${lineBuffer || '(empty)'}`);
  
  if (bytesReceived === 0) {
    console.error('\n❌ NO OUTPUT RECEIVED FROM CLAUDE!');
    console.error('This test FAILED - the command did not work');
    process.exit(1);
  } else {
    console.log('\n✅ SUCCESS! Got output from Claude');
    console.log('This test PASSED - the command works correctly');
    process.exit(0);
  }
});

claudeProcess.on('error', (err) => {
  console.error('❌ Process error:', err);
  process.exit(1);
});

// Set a timeout
setTimeout(() => {
  console.error('\n❌ TIMEOUT - Test took too long');
  claudeProcess.kill();
  process.exit(1);
}, 15000);
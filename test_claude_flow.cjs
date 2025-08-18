#!/usr/bin/env node

const { spawn, execSync } = require('child_process');
const path = require('path');
const os = require('os');

console.log('===== CLAUDE FLOW TEST =====');
console.log('Platform:', process.platform);
console.log('CWD:', process.cwd());

// Test 1: Detect if we're in WSL or Windows
const isRealWindows = process.platform === 'win32';
const isWSL = process.platform === 'linux' && /microsoft/i.test(os.release());

console.log('Is Real Windows:', isRealWindows);
console.log('Is WSL:', isWSL);

// Test 2: Find the correct Claude path
let claudePath = '';
let useWSL = false;

if (isRealWindows) {
  console.log('\n=== RUNNING ON WINDOWS - NEED WSL ===');
  useWSL = true;
  
  // Test if WSL is available
  try {
    const wslTest = execSync('wsl.exe echo "WSL_WORKS"', { encoding: 'utf8', windowsHide: true });
    console.log('WSL test result:', wslTest.trim());
    
    // Get WSL user
    const wslUser = execSync('wsl.exe whoami', { encoding: 'utf8', windowsHide: true }).trim();
    console.log('WSL user:', wslUser);
    
    // Check if Claude exists in WSL
    claudePath = `/home/${wslUser}/.claude/local/node_modules/.bin/claude`;
    const claudeExists = execSync(`wsl.exe test -f ${claudePath} && echo EXISTS || echo NOT_FOUND`, { 
      encoding: 'utf8',
      windowsHide: true 
    }).trim();
    console.log(`Claude at ${claudePath}:`, claudeExists);
    
    if (claudeExists === 'NOT_FOUND') {
      // Try the wrapper script
      claudePath = `/home/${wslUser}/.claude/local/claude`;
      const wrapperExists = execSync(`wsl.exe test -f ${claudePath} && echo EXISTS || echo NOT_FOUND`, { 
        encoding: 'utf8',
        windowsHide: true 
      }).trim();
      console.log(`Claude wrapper at ${claudePath}:`, wrapperExists);
    }
  } catch (e) {
    console.error('WSL test failed:', e.message);
    process.exit(1);
  }
} else if (isWSL || process.platform === 'linux' || process.platform === 'darwin') {
  console.log('\n=== RUNNING ON LINUX/WSL/MAC ===');
  
  // Try to find Claude directly
  const possiblePaths = [
    `${os.homedir()}/.claude/local/node_modules/.bin/claude`,
    `${os.homedir()}/.claude/local/claude`,
    '/usr/local/bin/claude',
    '/opt/homebrew/bin/claude'
  ];
  
  for (const path of possiblePaths) {
    try {
      execSync(`test -f ${path}`);
      claudePath = path;
      console.log('Found Claude at:', claudePath);
      break;
    } catch (e) {
      // Continue searching
    }
  }
  
  if (!claudePath) {
    try {
      claudePath = execSync('which claude', { encoding: 'utf8' }).trim();
      console.log('Found Claude via which:', claudePath);
    } catch (e) {
      console.error('Claude not found!');
      process.exit(1);
    }
  }
}

// Test 3: Run a simple Claude command
console.log('\n=== TESTING CLAUDE EXECUTION ===');

const testMessage = 'test message';
const args = [
  '--print',
  '--output-format', 'stream-json',
  '--verbose',
  '--model', 'claude-sonnet-4-20250514'
];

console.log('Claude path:', claudePath);
console.log('Args:', args);
console.log('Test message:', testMessage);

// Test 4: Execute Claude
if (useWSL && isRealWindows) {
  console.log('\n=== EXECUTING VIA WSL FROM WINDOWS ===');
  
  // Build WSL command
  const argsStr = args.join(' ');
  const wslCommand = `cd /mnt/c/Users/muuko/Desktop/yurucode && echo '${testMessage}' | ${claudePath} ${argsStr} 2>&1`;
  
  console.log('WSL command:', wslCommand);
  
  // Method 1: Using execSync (blocking)
  console.log('\n--- Method 1: execSync ---');
  try {
    const result = execSync(`wsl.exe -e bash -c "${wslCommand}" | head -5`, {
      encoding: 'utf8',
      windowsHide: true,
      maxBuffer: 10 * 1024 * 1024
    });
    console.log('Success! Output:', result.substring(0, 500));
  } catch (e) {
    console.error('execSync failed:', e.message);
  }
  
  // Method 2: Using spawn (streaming)
  console.log('\n--- Method 2: spawn ---');
  const proc = spawn('wsl.exe', ['-e', 'bash', '-c', wslCommand], {
    stdio: ['pipe', 'pipe', 'pipe'],
    windowsHide: true
  });
  
  let stdout = '';
  let stderr = '';
  
  proc.stdout.on('data', (data) => {
    const str = data.toString();
    stdout += str;
    console.log('STDOUT chunk:', str.substring(0, 100));
  });
  
  proc.stderr.on('data', (data) => {
    const str = data.toString();
    stderr += str;
    console.log('STDERR:', str);
  });
  
  proc.on('close', (code) => {
    console.log('\nProcess exited with code:', code);
    console.log('Total stdout bytes:', stdout.length);
    console.log('Total stderr bytes:', stderr.length);
    
    if (stdout.length > 0) {
      console.log('✅ SUCCESS! Got output from Claude');
      console.log('First 200 chars:', stdout.substring(0, 200));
    } else {
      console.log('❌ FAILED! No output from Claude');
    }
    
    if (stderr.length > 0) {
      console.log('Stderr content:', stderr);
    }
  });
  
  proc.on('error', (err) => {
    console.error('Spawn error:', err);
  });
  
} else {
  console.log('\n=== EXECUTING DIRECTLY ===');
  
  // Direct execution on Linux/WSL/Mac
  const proc = spawn(claudePath, args, {
    stdio: ['pipe', 'pipe', 'pipe']
  });
  
  // Send input
  proc.stdin.write(testMessage + '\n');
  proc.stdin.end();
  
  let stdout = '';
  
  proc.stdout.on('data', (data) => {
    const str = data.toString();
    stdout += str;
    console.log('STDOUT chunk:', str.substring(0, 100));
  });
  
  proc.stderr.on('data', (data) => {
    console.log('STDERR:', data.toString());
  });
  
  proc.on('close', (code) => {
    console.log('\nProcess exited with code:', code);
    console.log('Total stdout bytes:', stdout.length);
    
    if (stdout.length > 0) {
      console.log('✅ SUCCESS! Got output from Claude');
      console.log('First 200 chars:', stdout.substring(0, 200));
    } else {
      console.log('❌ FAILED! No output from Claude');
    }
  });
}
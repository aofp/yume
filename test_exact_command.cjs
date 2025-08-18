const { spawn, execSync } = require('child_process');

console.log('Testing exact command from server log...\n');

const wslPath = 'C:\\Windows\\System32\\wsl.exe';
const script = "cd /mnt/c/Users/muuko/Desktop/yurucode && echo 'echo test' | /home/yuru/.claude/local/node_modules/.bin/claude --print --output-format stream-json --verbose --dangerously-skip-permissions --append-system-prompt 'CRITICAL: you are in yurucode ui. ALWAYS: use all lowercase (no capitals ever), be extremely concise, never use formal language, no greetings/pleasantries, straight to the point, code/variables keep proper case, one line answers preferred' --model claude-sonnet-4-20250514 2>&1";

console.log('Script:', script.substring(0, 200) + '...\n');

// First test with execSync to see immediate output
console.log('=== Test 1: execSync ===');
try {
  const result = execSync(`"${wslPath}" -e bash -c "${script}"`, {
    encoding: 'utf8',
    maxBuffer: 10 * 1024 * 1024,
    cwd: 'C:\\Users\\muuko\\Desktop\\yurucode'
  });
  console.log('Success! Got', result.length, 'bytes');
  console.log('First 200 chars:', result.substring(0, 200));
} catch (e) {
  console.error('execSync failed:', e.message);
  if (e.stdout) console.log('Stdout:', e.stdout);
  if (e.stderr) console.log('Stderr:', e.stderr);
}

// Now test with spawn like the server does
console.log('\n=== Test 2: spawn (like server) ===');
const proc = spawn(wslPath, ['-e', 'bash', '-c', script], {
  cwd: 'C:\\Users\\muuko\\Desktop\\yurucode',
  stdio: ['pipe', 'pipe', 'pipe'],
  windowsHide: true,
  detached: false
});

console.log('Process spawned with PID:', proc.pid);

let bytesReceived = 0;
let output = '';
let stderr = '';

proc.stdout.on('data', (data) => {
  bytesReceived += data.length;
  output += data.toString();
  console.log(`Received ${data.length} bytes (total: ${bytesReceived})`);
  console.log('Data preview:', data.toString().substring(0, 100));
});

proc.stderr.on('data', (data) => {
  stderr += data.toString();
  console.error('STDERR:', data.toString());
});

proc.on('close', (code) => {
  console.log('\nProcess exited with code:', code);
  console.log('Total bytes received:', bytesReceived);
  
  if (bytesReceived === 0) {
    console.log('❌ NO OUTPUT - This matches the server issue!');
    
    // Try to debug why
    console.log('\n=== Debugging ===');
    
    // Test if WSL works at all
    try {
      const testResult = execSync(`"${wslPath}" -e bash -c "echo test"`, { encoding: 'utf8' });
      console.log('Basic WSL test works:', testResult.trim());
    } catch (e) {
      console.error('Basic WSL test failed:', e.message);
    }
    
    // Test if Claude exists
    try {
      const testResult = execSync(`"${wslPath}" -e bash -c "test -f /home/yuru/.claude/local/node_modules/.bin/claude && echo EXISTS || echo NOT_FOUND"`, { encoding: 'utf8' });
      console.log('Claude exists:', testResult.trim());
    } catch (e) {
      console.error('Claude check failed:', e.message);
    }
    
    // Test simpler Claude command
    try {
      const testResult = execSync(`"${wslPath}" -e bash -c "echo test | /home/yuru/.claude/local/node_modules/.bin/claude --version 2>&1"`, { encoding: 'utf8' });
      console.log('Claude version:', testResult.trim());
    } catch (e) {
      console.error('Claude version failed:', e.message);
    }
  } else {
    console.log('✅ Got output!');
  }
});

proc.on('error', (err) => {
  console.error('Process error:', err);
});
#!/usr/bin/env node

const { spawn } = require('child_process');

console.log('=== TESTING WSL CLAUDE DIRECTLY ===\n');

// Test the exact command from the logs
const script = "cd '/mnt/c/Users/muuko/Desktop/yurucode' 2>/dev/null; echo 'echo test' | /home/yuru/node_modules/.bin/claude --print --output-format stream-json --verbose --dangerously-skip-permissions --append-system-prompt 'CRITICAL: you are in yurucode ui. ALWAYS: use all lowercase (no capitals ever), be extremely concise, never use formal language, no greetings/pleasantries, straight to the point, code/variables keep proper case, one line answers preferred' --model claude-opus-4-1-20250805";

console.log('Script being executed:');
console.log(script);
console.log('\n---\n');

const child = spawn('C:\\Windows\\System32\\wsl.exe', ['-e', 'bash', '-c', script], {
  windowsHide: true,
  stdio: ['pipe', 'pipe', 'pipe']
});

let stdout = '';
let stderr = '';
let startTime = Date.now();

child.stdout.on('data', (data) => {
  const chunk = data.toString();
  stdout += chunk;
  console.log(`[${Date.now() - startTime}ms] STDOUT (${data.length} bytes): ${chunk.substring(0, 100)}`);
});

child.stderr.on('data', (data) => {
  const chunk = data.toString();
  stderr += chunk;
  console.log(`[${Date.now() - startTime}ms] STDERR (${data.length} bytes): ${chunk}`);
});

child.on('error', (err) => {
  console.error('Spawn error:', err);
});

child.on('close', (code) => {
  console.log(`\n=== PROCESS EXITED ===`);
  console.log(`Exit code: ${code}`);
  console.log(`Duration: ${Date.now() - startTime}ms`);
  console.log(`Total stdout: ${stdout.length} bytes`);
  console.log(`Total stderr: ${stderr.length} bytes`);
  
  if (stdout.length === 0 && stderr.length === 0) {
    console.log('\n❌ NO OUTPUT AT ALL - Something is wrong with the command');
    
    // Try a simpler test
    console.log('\n=== TRYING SIMPLER TEST ===');
    const simpleScript = "echo 'hello' | /home/yuru/node_modules/.bin/claude --print --output-format stream-json";
    console.log('Simple script:', simpleScript);
    
    const child2 = spawn('C:\\Windows\\System32\\wsl.exe', ['-e', 'bash', '-c', simpleScript]);
    
    child2.stdout.on('data', (data) => {
      console.log('SIMPLE STDOUT:', data.toString().substring(0, 100));
    });
    
    child2.stderr.on('data', (data) => {
      console.log('SIMPLE STDERR:', data.toString());
    });
    
    child2.on('close', (code2) => {
      console.log('Simple test exit code:', code2);
    });
  } else {
    if (stdout.length > 0) {
      console.log('\n=== STDOUT CONTENT ===');
      console.log(stdout);
    }
    if (stderr.length > 0) {
      console.log('\n=== STDERR CONTENT ===');
      console.log(stderr);
    }
  }
});
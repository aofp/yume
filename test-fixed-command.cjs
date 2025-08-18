#!/usr/bin/env node

const { spawn } = require('child_process');

console.log('=== TESTING FIXED COMMAND ===\n');

// Test the exact command that should be generated now
const script = `cd '/mnt/c/Users/muuko/Desktop/yurucode' 2>/dev/null; echo 'echo test' | /home/yuru/node_modules/.bin/claude --print --output-format stream-json --verbose --dangerously-skip-permissions --append-system-prompt 'CRITICAL: you are in yurucode ui. ALWAYS: use all lowercase (no capitals ever), be extremely concise, never use formal language, no greetings/pleasantries, straight to the point, code/variables keep proper case, one line answers preferred' --model claude-opus-4-1-20250805`;

console.log('Script to execute:');
console.log(script);
console.log('\n---\n');

const child = spawn('wsl.exe', ['-e', 'bash', '-c', script]);

let output = '';
let error = '';
let startTime = Date.now();

child.stdout.on('data', (data) => {
  const chunk = data.toString();
  output += chunk;
  console.log(`[${Date.now() - startTime}ms] STDOUT (${data.length} bytes):`, chunk.substring(0, 200));
});

child.stderr.on('data', (data) => {
  const chunk = data.toString();
  error += chunk;
  console.log(`[${Date.now() - startTime}ms] STDERR (${data.length} bytes):`, chunk);
});

child.on('close', (code) => {
  console.log(`\nProcess exited with code: ${code}`);
  console.log(`Duration: ${Date.now() - startTime}ms`);
  console.log(`Total output bytes: ${output.length}`);
  console.log(`Total error bytes: ${error.length}`);
  
  if (output.length > 0) {
    console.log('\n=== FULL OUTPUT ===');
    console.log(output);
  }
  
  if (error.length > 0) {
    console.log('\n=== FULL STDERR ===');
    console.log(error);
  }
});
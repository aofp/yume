#!/usr/bin/env node

const { spawn } = require('child_process');

console.log('=== TESTING CLAUDE STREAMING OUTPUT ===\n');

// Test 1: Direct claude command with --print and stream-json
async function testDirectClaude() {
  console.log('TEST 1: Direct Claude with --print --output-format stream-json');
  console.log('Command: echo "hello" | /home/yuru/node_modules/.bin/claude --print --output-format stream-json');
  
  return new Promise((resolve) => {
    const script = `echo 'hello' | /home/yuru/node_modules/.bin/claude --print --output-format stream-json --verbose 2>&1`;
    
    const child = spawn('C:\\Windows\\System32\\wsl.exe', ['-e', 'bash', '-c', script]);
    
    let output = '';
    let error = '';
    
    child.stdout.on('data', (data) => {
      const chunk = data.toString();
      output += chunk;
      console.log('STDOUT chunk:', chunk);
    });
    
    child.stderr.on('data', (data) => {
      const chunk = data.toString();
      error += chunk;
      console.log('STDERR chunk:', chunk);
    });
    
    child.on('close', (code) => {
      console.log(`Exit code: ${code}`);
      console.log(`Total output bytes: ${output.length}`);
      console.log(`Total error bytes: ${error.length}`);
      console.log('---\n');
      resolve();
    });
  });
}

// Test 2: Same command but with json output format
async function testJsonOutput() {
  console.log('TEST 2: Direct Claude with --print --output-format json');
  console.log('Command: echo "hello" | /home/yuru/node_modules/.bin/claude --print --output-format json');
  
  return new Promise((resolve) => {
    const script = `echo 'hello' | /home/yuru/node_modules/.bin/claude --print --output-format json --verbose 2>&1`;
    
    const child = spawn('C:\\Windows\\System32\\wsl.exe', ['-e', 'bash', '-c', script]);
    
    let output = '';
    let error = '';
    
    child.stdout.on('data', (data) => {
      const chunk = data.toString();
      output += chunk;
      console.log('STDOUT chunk:', chunk.substring(0, 200) + (chunk.length > 200 ? '...' : ''));
    });
    
    child.stderr.on('data', (data) => {
      const chunk = data.toString();
      error += chunk;
      console.log('STDERR chunk:', chunk);
    });
    
    child.on('close', (code) => {
      console.log(`Exit code: ${code}`);
      console.log(`Total output bytes: ${output.length}`);
      console.log(`Total error bytes: ${error.length}`);
      console.log('---\n');
      resolve();
    });
  });
}

// Test 3: Without --print flag  
async function testWithoutPrint() {
  console.log('TEST 3: Claude WITHOUT --print (interactive mode)');
  console.log('Command: /home/yuru/node_modules/.bin/claude --output-format stream-json');
  
  return new Promise((resolve) => {
    const script = `/home/yuru/node_modules/.bin/claude --output-format stream-json --verbose 2>&1`;
    
    const child = spawn('C:\\Windows\\System32\\wsl.exe', ['-e', 'bash', '-c', script]);
    
    let output = '';
    let error = '';
    let dataReceived = false;
    
    child.stdout.on('data', (data) => {
      const chunk = data.toString();
      output += chunk;
      dataReceived = true;
      console.log('STDOUT chunk:', chunk.substring(0, 200) + (chunk.length > 200 ? '...' : ''));
    });
    
    child.stderr.on('data', (data) => {
      const chunk = data.toString();
      error += chunk;
      console.log('STDERR chunk:', chunk);
    });
    
    // Send input after a delay
    setTimeout(() => {
      if (!dataReceived) {
        console.log('Sending input: "hello"');
        child.stdin.write('hello\n');
        child.stdin.end();
      }
    }, 500);
    
    // Kill after 3 seconds if still running
    setTimeout(() => {
      if (!child.killed) {
        console.log('Killing process after 3 seconds...');
        child.kill();
      }
    }, 3000);
    
    child.on('close', (code) => {
      console.log(`Exit code: ${code}`);
      console.log(`Total output bytes: ${output.length}`);
      console.log(`Total error bytes: ${error.length}`);
      console.log('---\n');
      resolve();
    });
  });
}

// Test 4: Check if it's a buffering issue
async function testWithStdbuf() {
  console.log('TEST 4: Claude with stdbuf to disable buffering');
  console.log('Command: echo "hello" | stdbuf -o0 /home/yuru/node_modules/.bin/claude --print --output-format stream-json');
  
  return new Promise((resolve) => {
    const script = `echo 'hello' | stdbuf -o0 /home/yuru/node_modules/.bin/claude --print --output-format stream-json --verbose 2>&1`;
    
    const child = spawn('C:\\Windows\\System32\\wsl.exe', ['-e', 'bash', '-c', script]);
    
    let output = '';
    let error = '';
    
    child.stdout.on('data', (data) => {
      const chunk = data.toString();
      output += chunk;
      console.log('STDOUT chunk:', chunk);
    });
    
    child.stderr.on('data', (data) => {
      const chunk = data.toString();
      error += chunk;
      console.log('STDERR chunk:', chunk);
    });
    
    child.on('close', (code) => {
      console.log(`Exit code: ${code}`);
      console.log(`Total output bytes: ${output.length}`);
      console.log(`Total error bytes: ${error.length}`);
      console.log('---\n');
      resolve();
    });
  });
}

// Run all tests
async function runTests() {
  await testDirectClaude();
  await testJsonOutput();
  await testWithoutPrint();
  await testWithStdbuf();
  
  console.log('=== ALL TESTS COMPLETE ===');
}

runTests().catch(console.error);
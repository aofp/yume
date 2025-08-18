#!/usr/bin/env node

const { spawn } = require('child_process');

console.log('=== VERIFYING WINDOWS CLAUDE FIX ===\n');
console.log('Testing both stream-json (main chat) and json (title generation)...\n');

// Test 1: stream-json output (main chat)
async function testStreamJson() {
  return new Promise((resolve) => {
    console.log('TEST 1: stream-json output (main chat)');
    const script = `echo 'hello world' | /home/yuru/node_modules/.bin/claude --print --output-format stream-json --verbose`;
    
    const child = spawn('wsl.exe', ['-e', 'bash', '-c', script]);
    let output = '';
    
    child.stdout.on('data', (data) => {
      output += data.toString();
    });
    
    child.on('close', (code) => {
      console.log(`  Exit code: ${code}`);
      console.log(`  Output length: ${output.length} bytes`);
      console.log(`  Success: ${output.length > 0 ? '✅' : '❌'}`);
      resolve(output.length > 0);
    });
  });
}

// Test 2: json output (title generation)
async function testJsonOutput() {
  return new Promise((resolve) => {
    console.log('\nTEST 2: json output (title generation)');
    const script = `echo 'summarize in 3 words' | /home/yuru/node_modules/.bin/claude --print --output-format json --verbose`;
    
    const child = spawn('wsl.exe', ['-e', 'bash', '-c', script]);
    let output = '';
    
    child.stdout.on('data', (data) => {
      output += data.toString();
    });
    
    child.on('close', (code) => {
      console.log(`  Exit code: ${code}`);
      console.log(`  Output length: ${output.length} bytes`);
      
      // Try to parse JSON to verify it's valid
      let isValid = false;
      try {
        const lines = output.trim().split('\n');
        const lastLine = lines[lines.length - 1];
        // Parse as JSON array since --output-format json returns an array
        const jsonArray = JSON.parse(lastLine);
        if (Array.isArray(jsonArray)) {
          // Find the result object in the array
          const resultObj = jsonArray.find(obj => obj.type === 'result');
          isValid = resultObj && resultObj.result;
          if (isValid) {
            console.log(`  Result: "${resultObj.result}"`);
          }
        }
      } catch (e) {
        console.log(`  Parse error: ${e.message}`);
      }
      
      console.log(`  Success: ${isValid ? '✅' : '❌'}`);
      resolve(isValid);
    });
  });
}

// Run tests
async function runTests() {
  const test1 = await testStreamJson();
  const test2 = await testJsonOutput();
  
  console.log('\n=== SUMMARY ===');
  console.log(`Stream-JSON (main chat): ${test1 ? '✅ WORKING' : '❌ FAILED'}`);
  console.log(`JSON (title generation): ${test2 ? '✅ WORKING' : '❌ FAILED'}`);
  
  if (test1 && test2) {
    console.log('\n🎉 ALL TESTS PASSED! Windows Claude is fixed!');
  } else {
    console.log('\n⚠️ Some tests failed. Check the output above.');
  }
}

runTests().catch(console.error);
#!/usr/bin/env node

/**
 * Test script for Universal Claude Wrapper
 * 
 * Tests:
 * 1. Cross-platform detection
 * 2. Claude binary finding
 * 3. Process spawning
 * 4. Stream augmentation
 * 5. Token tracking
 * 6. API response capture
 * 7. Error handling
 */

const UniversalClaudeWrapper = require('./claude-process-wrapper.cjs');
const assert = require('assert');
const fs = require('fs');
const path = require('path');

// Test configuration
const TEST_CONFIG = {
  debug: true,
  maxTokens: 100000,
  captureAll: true,
  augmentStream: true
};

// Color output for test results
const colors = {
  green: '\x1b[32m',
  red: '\x1b[31m',
  yellow: '\x1b[33m',
  blue: '\x1b[34m',
  reset: '\x1b[0m'
};

function log(message, color = 'reset') {
  console.log(`${colors[color]}${message}${colors.reset}`);
}

function logTest(name) {
  log(`\n📝 Testing: ${name}`, 'blue');
}

function logPass(message) {
  log(`  ✅ ${message}`, 'green');
}

function logFail(message) {
  log(`  ❌ ${message}`, 'red');
}

function logInfo(message) {
  log(`  ℹ️  ${message}`, 'yellow');
}

// Test suite
class WrapperTestSuite {
  constructor() {
    this.wrapper = null;
    this.results = {
      passed: 0,
      failed: 0,
      skipped: 0
    };
    this.capturedData = {
      apiResponses: [],
      tokens: null,
      messages: [],
      errors: []
    };
  }
  
  async runAllTests() {
    log('\n🚀 Starting Universal Claude Wrapper Tests', 'blue');
    log('=' .repeat(50), 'blue');
    
    await this.testInitialization();
    await this.testPlatformDetection();
    await this.testClaudeBinaryFinding();
    await this.testSessionManagement();
    await this.testEventEmission();
    await this.testStreamProcessing();
    await this.testTokenTracking();
    await this.testApiResponseCapture();
    await this.testErrorHandling();
    await this.testProcessSpawning();
    
    this.printSummary();
  }
  
  async testInitialization() {
    logTest('Wrapper Initialization');
    
    try {
      this.wrapper = new UniversalClaudeWrapper(TEST_CONFIG);
      assert(this.wrapper instanceof UniversalClaudeWrapper);
      logPass('Wrapper initialized successfully');
      this.results.passed++;
      
      assert.equal(this.wrapper.config.maxTokens, 100000);
      logPass('Configuration applied correctly');
      this.results.passed++;
      
    } catch (e) {
      logFail(`Initialization failed: ${e.message}`);
      this.results.failed++;
      throw e;
    }
  }
  
  async testPlatformDetection() {
    logTest('Platform Detection');
    
    try {
      const platform = require('os').platform();
      logInfo(`Detected platform: ${platform}`);
      
      assert(['win32', 'darwin', 'linux'].includes(platform));
      logPass('Valid platform detected');
      this.results.passed++;
      
      const isWSL = platform === 'linux' && 
                    fs.existsSync('/proc/version') &&
                    fs.readFileSync('/proc/version', 'utf8').toLowerCase().includes('microsoft');
      
      if (isWSL) {
        logInfo('WSL environment detected');
      }
      
      logPass('Platform detection working');
      this.results.passed++;
      
    } catch (e) {
      logFail(`Platform detection failed: ${e.message}`);
      this.results.failed++;
    }
  }
  
  async testClaudeBinaryFinding() {
    logTest('Claude Binary Finding');
    
    try {
      const claudePath = this.wrapper.findClaudeBinary();
      
      if (claudePath) {
        logInfo(`Found Claude at: ${claudePath}`);
        assert(fs.existsSync(claudePath));
        logPass('Claude binary found and accessible');
        this.results.passed++;
      } else {
        logInfo('Claude binary not found (this is expected if Claude is not installed)');
        this.results.skipped++;
      }
      
    } catch (e) {
      logInfo(`Claude not installed: ${e.message}`);
      this.results.skipped++;
    }
  }
  
  async testSessionManagement() {
    logTest('Session Management');
    
    try {
      const sessionId = 'test-session-123';
      const session = this.wrapper.getSession(sessionId);
      
      assert.equal(session.id, sessionId);
      logPass('Session created successfully');
      this.results.passed++;
      
      assert.equal(session.totalTokens, 0);
      assert.equal(session.messageCount, 0);
      assert.equal(session.compactCount, 0);
      logPass('Session initialized with correct defaults');
      this.results.passed++;
      
      // Test session retrieval
      const sameSession = this.wrapper.getSession(sessionId);
      assert.equal(sameSession, session);
      logPass('Session retrieval working');
      this.results.passed++;
      
    } catch (e) {
      logFail(`Session management failed: ${e.message}`);
      this.results.failed++;
    }
  }
  
  async testEventEmission() {
    logTest('Event Emission');
    
    try {
      let eventFired = false;
      
      this.wrapper.once('test-event', (data) => {
        eventFired = true;
        assert.equal(data.test, 'value');
      });
      
      this.wrapper.emit('test-event', { test: 'value' });
      
      assert(eventFired);
      logPass('Event emission working');
      this.results.passed++;
      
      // Test multiple event handlers
      let counter = 0;
      this.wrapper.on('counter-event', () => counter++);
      this.wrapper.emit('counter-event');
      this.wrapper.emit('counter-event');
      
      assert.equal(counter, 2);
      logPass('Multiple event handlers working');
      this.results.passed++;
      
    } catch (e) {
      logFail(`Event emission failed: ${e.message}`);
      this.results.failed++;
    }
  }
  
  async testStreamProcessing() {
    logTest('Stream Processing');
    
    try {
      const testLines = [
        '{"type": "user", "message": {"content": "test"}}',
        '{"type": "assistant", "id": "msg_123", "message": {"content": "response"}}',
        '{"type": "result", "result": "done", "usage": {"input_tokens": 10, "output_tokens": 20}}',
        'non-json line',
        ''
      ];
      
      const sessionId = 'stream-test';
      const results = [];
      
      for (const line of testLines) {
        const processed = this.wrapper.processLine(line, sessionId);
        if (processed) {
          results.push(processed);
        }
      }
      
      assert.equal(results.length, 4); // 3 JSON + 1 non-JSON
      logPass('Stream processing handled all line types');
      this.results.passed++;
      
      // Check augmentation
      const augmented = JSON.parse(results[0]);
      assert(augmented.wrapper);
      assert(augmented.wrapper.tokens);
      logPass('Stream augmentation working');
      this.results.passed++;
      
    } catch (e) {
      logFail(`Stream processing failed: ${e.message}`);
      this.results.failed++;
    }
  }
  
  async testTokenTracking() {
    logTest('Token Tracking');
    
    try {
      const sessionId = 'token-test';
      const session = this.wrapper.getSession(sessionId);
      
      // Simulate token updates
      this.wrapper.updateTokens({
        input_tokens: 100,
        output_tokens: 200,
        cache_creation_input_tokens: 50,
        cache_read_input_tokens: 25
      }, sessionId);
      
      assert.equal(session.inputTokens, 150); // 100 + 50
      assert.equal(session.outputTokens, 200);
      assert.equal(session.cacheTokens, 25);
      assert.equal(session.totalTokens, 350); // 150 + 200
      logPass('Token accumulation working correctly');
      this.results.passed++;
      
      // Test percentage calculation
      const augData = this.wrapper.getAugmentationData(sessionId);
      assert.equal(augData.tokens.percentage, '0.4%'); // 350/100000
      logPass('Token percentage calculation correct');
      this.results.passed++;
      
    } catch (e) {
      logFail(`Token tracking failed: ${e.message}`);
      this.results.failed++;
    }
  }
  
  async testApiResponseCapture() {
    logTest('API Response Capture');
    
    try {
      const sessionId = 'api-test';
      
      // Set up event listener
      this.wrapper.on('api-response', (data) => {
        this.capturedData.apiResponses.push(data);
      });
      
      // Simulate API response
      const testResponse = {
        type: 'assistant',
        id: 'msg_test',
        message: { content: 'test response' }
      };
      
      this.wrapper.captureApiResponse(testResponse, sessionId);
      
      assert.equal(this.capturedData.apiResponses.length, 1);
      assert.equal(this.capturedData.apiResponses[0].sessionId, sessionId);
      logPass('API response capture working');
      this.results.passed++;
      
      // Check storage
      const session = this.wrapper.getSession(sessionId);
      assert.equal(session.apiResponses.length, 1);
      logPass('API responses stored in session');
      this.results.passed++;
      
    } catch (e) {
      logFail(`API response capture failed: ${e.message}`);
      this.results.failed++;
    }
  }
  
  async testErrorHandling() {
    logTest('Error Handling');
    
    try {
      const sessionId = 'error-test';
      
      // Set up error listener
      this.wrapper.on('process-error', (data) => {
        this.capturedData.errors.push(data);
      });
      
      // Simulate error
      this.wrapper.handleProcessError(sessionId, new Error('Test error'));
      
      assert.equal(this.capturedData.errors.length, 1);
      assert.equal(this.capturedData.errors[0].error, 'Test error');
      logPass('Error handling working');
      this.results.passed++;
      
      // Check error storage
      const session = this.wrapper.getSession(sessionId);
      assert.equal(session.errors.length, 1);
      assert.equal(session.errors[0].error, 'Test error');
      logPass('Errors stored in session');
      this.results.passed++;
      
    } catch (e) {
      logFail(`Error handling failed: ${e.message}`);
      this.results.failed++;
    }
  }
  
  async testProcessSpawning() {
    logTest('Process Spawning');
    
    try {
      // Only test if Claude is available
      if (!this.wrapper.claudePath) {
        logInfo('Skipping spawn test - Claude not installed');
        this.results.skipped++;
        return;
      }
      
      const sessionId = 'spawn-test';
      
      // Test with echo command instead of actual Claude
      const originalPath = this.wrapper.claudePath;
      this.wrapper.claudePath = process.platform === 'win32' ? 'cmd.exe' : 'echo';
      
      const args = process.platform === 'win32' 
        ? ['/c', 'echo', 'test'] 
        : ['test'];
      
      const claudeProcess = await this.wrapper.spawnClaude(args, {
        sessionId: sessionId
      });
      
      assert(claudeProcess.pid);
      logPass('Process spawned successfully');
      this.results.passed++;
      
      // Wait for process to exit
      await new Promise((resolve) => {
        claudeProcess.on('exit', resolve);
        setTimeout(resolve, 1000); // Timeout after 1 second
      });
      
      // Restore original path
      this.wrapper.claudePath = originalPath;
      
      logPass('Process management working');
      this.results.passed++;
      
    } catch (e) {
      logFail(`Process spawning failed: ${e.message}`);
      this.results.failed++;
    }
  }
  
  printSummary() {
    log('\n' + '=' .repeat(50), 'blue');
    log('📊 Test Summary', 'blue');
    log('=' .repeat(50), 'blue');
    
    const total = this.results.passed + this.results.failed + this.results.skipped;
    
    log(`Total Tests: ${total}`, 'blue');
    log(`Passed: ${this.results.passed}`, 'green');
    log(`Failed: ${this.results.failed}`, 'red');
    log(`Skipped: ${this.results.skipped}`, 'yellow');
    
    const percentage = Math.round((this.results.passed / (this.results.passed + this.results.failed)) * 100);
    
    if (this.results.failed === 0) {
      log(`\n✅ All tests passed! (${percentage}%)`, 'green');
    } else {
      log(`\n⚠️ Some tests failed (${percentage}% pass rate)`, 'yellow');
    }
    
    // Export results
    const resultsFile = path.join(__dirname, 'test-results.json');
    fs.writeFileSync(resultsFile, JSON.stringify({
      timestamp: new Date().toISOString(),
      results: this.results,
      platform: process.platform,
      capturedData: this.capturedData
    }, null, 2));
    
    log(`\nResults saved to: ${resultsFile}`, 'blue');
  }
}

// Run tests
async function main() {
  const suite = new WrapperTestSuite();
  
  try {
    await suite.runAllTests();
    process.exit(suite.results.failed > 0 ? 1 : 0);
  } catch (e) {
    console.error('Test suite failed:', e);
    process.exit(1);
  }
}

// Run if executed directly
if (require.main === module) {
  main();
}
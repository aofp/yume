# Master Implementation Checklist
## Complete Verification Guide for Feature Parity Implementation

---

## Pre-Implementation Requirements

### ✅ Required Documents Review
- [ ] Read `PRD-07-Yurucode-Feature-Parity-Roadmap.md`
- [ ] Read `PRD-07-IMPLEMENTATION-GUIDE.md`
- [ ] Read `PRD-07-EMBEDDED-SERVER-REMOVAL-GUIDE.md`
- [ ] Read `PRD-07-ULTRA-DETAILED-PLATFORM-GUIDE.md`
- [ ] Understand ALL platform-specific gotchas

### ✅ Development Environment Setup
```bash
# Verify all tools installed
- [ ] Node.js 18+ (node --version)
- [ ] Rust 1.70+ (rustc --version)
- [ ] Git (git --version)
- [ ] Claude CLI (claude --version)

# Platform specific
- [ ] Windows: Visual Studio Build Tools
- [ ] Windows: WSL2 with Ubuntu
- [ ] macOS: Xcode Command Line Tools
- [ ] macOS: Homebrew (optional but recommended)
```

### ✅ Backup Current Working Version
```bash
# Create safety backup
git checkout main
git pull origin main
git checkout -b backup/pre-implementation-$(date +%Y%m%d)
git push origin backup/pre-implementation-$(date +%Y%m%d)

# Tag current version
git tag -a v1.0.0-pre-refactor -m "Last stable before major refactor"
git push origin v1.0.0-pre-refactor

# Backup embedded server
cp src-tauri/src/logged_server.rs backups/logged_server.rs.backup
tar -czf backups/embedded-server-$(date +%Y%m%d).tar.gz src-tauri/src/logged_server.rs
```

---

## Phase 1: Safe Feature Additions (Week 1)
### NO Architecture Changes - Add Features to Existing System

#### ✅ Task 1.1: Message Virtualization
```bash
# Implementation steps
- [ ] npm install @tanstack/react-virtual@^3.13.10
- [ ] Create src/renderer/components/Chat/VirtualizedMessageList.tsx
- [ ] Add feature flag USE_VIRTUALIZATION=false
- [ ] Implement virtualized renderer
- [ ] Test with 10 messages
- [ ] Test with 100 messages
- [ ] Test with 1000 messages
- [ ] Test with 5000 messages
- [ ] Verify smooth scrolling
- [ ] Verify auto-scroll to bottom
- [ ] Verify memory usage < 100MB for 1000 messages
- [ ] Enable feature flag
- [ ] Test for 24 hours in production
```

**Verification Commands:**
```javascript
// Test virtualization performance
const testVirtualization = () => {
  const start = performance.now();
  // Render 1000 messages
  const renderTime = performance.now() - start;
  console.assert(renderTime < 100, 'Render time exceeds 100ms');
  
  // Check DOM nodes
  const nodes = document.querySelectorAll('.message-renderer');
  console.assert(nodes.length < 50, 'Too many DOM nodes rendered');
};
```

#### ✅ Task 1.2: Basic Checkpoint System (Through Embedded Server)
```javascript
// Add to embedded server in logged_server.rs
- [ ] Add checkpoint storage Map
- [ ] Add create-checkpoint handler
- [ ] Add restore-checkpoint handler
- [ ] Add get-timeline handler
- [ ] Create checkpointService.ts
- [ ] Add CheckpointButton component
- [ ] Test checkpoint creation
- [ ] Test checkpoint restoration
- [ ] Test checkpoint persistence
- [ ] Verify no data loss
- [ ] Test with 10 checkpoints
- [ ] Test checkpoint cleanup
```

**Verification Tests:**
```bash
# Test checkpoint functionality
1. Create new session
2. Send 5 messages
3. Create checkpoint "Test1"
4. Send 5 more messages (total 10)
5. Create checkpoint "Test2"
6. Send 5 more messages (total 15)
7. Restore to "Test1"
8. Verify only 5 messages remain
9. Restore to "Test2"
10. Verify 10 messages present
```

#### ✅ Task 1.3: Timeline UI Component
```typescript
// Frontend only - no backend changes
- [ ] Copy TimelineNavigator.tsx from opcode
- [ ] Adapt to yurucode's store structure
- [ ] Add Timeline.css styles
- [ ] Add feature flag SHOW_TIMELINE=false
- [ ] Test timeline rendering
- [ ] Test checkpoint selection
- [ ] Test restore functionality
- [ ] Test fork functionality
- [ ] Verify UI responsiveness
- [ ] Enable feature flag
```

#### ✅ Task 1.4: Agent Execution (Through Embedded Server)
```javascript
// Extend embedded server for agent runs
- [ ] Add agent run storage Map
- [ ] Add execute-agent handler
- [ ] Add stop-agent handler
- [ ] Add get-agent-runs handler
- [ ] Create agentExecutionService.ts
- [ ] Create AgentExecution component
- [ ] Test agent creation
- [ ] Test agent execution
- [ ] Test output streaming
- [ ] Test agent stopping
- [ ] Verify process cleanup
```

---

## Phase 2: Platform Testing (Week 2)
### Test EVERYTHING on ALL Platforms

#### ✅ Windows Native Testing
```powershell
# Run all tests on Windows Native
- [ ] Install fresh on Windows 10
- [ ] Install fresh on Windows 11
- [ ] Test with PowerShell
- [ ] Test with cmd.exe
- [ ] Test with Windows Terminal

# Path testing
- [ ] C:\Users\Test User\Documents (spaces in path)
- [ ] C:\Projects\测试项目 (Unicode path)
- [ ] C:\Very\Long\Path\That\Exceeds\260\Characters\...
- [ ] \\NetworkShare\Project (UNC path)
- [ ] D:\External\Drive (different drive)

# Claude execution
- [ ] claude.cmd execution works
- [ ] Node.js found at all common locations
- [ ] Environment variables set correctly
- [ ] No console windows appear
- [ ] Process cleanup works

# Feature testing
- [ ] Virtualization works (1000+ messages)
- [ ] Checkpoints save and restore
- [ ] Timeline UI displays correctly
- [ ] Agents execute properly
- [ ] No memory leaks after 1 hour
- [ ] No orphaned processes
```

**Windows Verification Script:**
```powershell
# Save as test-windows-complete.ps1
$tests = @{
    "Node Detection" = { node --version }
    "Claude Detection" = { claude --version }
    "Path with Spaces" = { Test-Path "C:\Test Directory" }
    "Unicode Support" = { Test-Path "C:\测试" }
    "Long Path Support" = { $path = "C:\"; 1..50 | % { $path += "Long\" }; $path.Length -gt 260 }
}

foreach ($test in $tests.GetEnumerator()) {
    Write-Host "Testing: $($test.Key)" -ForegroundColor Yellow
    try {
        $result = & $test.Value
        Write-Host "  ✓ Passed" -ForegroundColor Green
    } catch {
        Write-Host "  ✗ Failed: $_" -ForegroundColor Red
    }
}
```

#### ✅ WSL Testing
```bash
# Run all tests in WSL
- [ ] Test on WSL1
- [ ] Test on WSL2
- [ ] Test Ubuntu distro
- [ ] Test Debian distro
- [ ] Test with different users

# Path translation testing
- [ ] Windows → WSL: C:\Users\Test → /mnt/c/Users/Test
- [ ] WSL → Windows: /home/user/project → \\wsl$\Ubuntu\home\user\project
- [ ] Special characters preserved
- [ ] Permissions maintained
- [ ] Symlinks work

# Claude execution in WSL
- [ ] Node.js detected in WSL
- [ ] Claude found in WSL paths
- [ ] Can read Windows files
- [ ] Can write Windows files
- [ ] Line endings handled (CRLF/LF)

# Feature testing
- [ ] All features work through WSL
- [ ] No performance degradation
- [ ] File watchers work
- [ ] Git integration works
```

**WSL Verification Script:**
```bash
#!/bin/bash
# Save as test-wsl-complete.sh

echo "=== WSL Complete Test Suite ==="

# Function to test and report
test_feature() {
    local name="$1"
    local command="$2"
    echo -n "Testing $name... "
    if eval "$command" &>/dev/null; then
        echo "✓ PASSED"
        return 0
    else
        echo "✗ FAILED"
        return 1
    fi
}

# Run tests
test_feature "WSL Version" "grep -qi microsoft /proc/version"
test_feature "Node.js" "node --version"
test_feature "Claude" "which claude"
test_feature "Windows Drive Access" "ls /mnt/c/"
test_feature "Write to Windows" "touch /mnt/c/Users/\$USER/test_wsl_write.tmp && rm /mnt/c/Users/\$USER/test_wsl_write.tmp"
test_feature "Path Translation" "[ -d /mnt/c/Windows ]"
test_feature "Execute Windows Program" "cmd.exe /c echo test"

# Performance test
echo -n "Testing file operation performance... "
start=$(date +%s%N)
for i in {1..100}; do
    echo "test" > /tmp/test_$i.txt
done
rm /tmp/test_*.txt
end=$(date +%s%N)
duration=$((($end - $start) / 1000000))
if [ $duration -lt 1000 ]; then
    echo "✓ PASSED (${duration}ms)"
else
    echo "✗ SLOW (${duration}ms)"
fi

echo "=== Test Complete ==="
```

#### ✅ macOS Testing
```bash
# Run all tests on macOS
- [ ] Test on macOS 11 (Big Sur)
- [ ] Test on macOS 12 (Monterey)
- [ ] Test on macOS 13 (Ventura)
- [ ] Test on macOS 14 (Sonoma)
- [ ] Test on Intel Mac
- [ ] Test on M1 Mac
- [ ] Test on M2/M3 Mac

# Environment testing
- [ ] Homebrew paths detected
- [ ] Correct architecture detected
- [ ] Node.js found
- [ ] Claude found
- [ ] No quarantine issues
- [ ] No permission issues

# Feature testing
- [ ] All features work
- [ ] No SIP violations
- [ ] No code signing issues
- [ ] Performance acceptable
```

**macOS Verification Script:**
```bash
#!/bin/bash
# Save as test-macos-complete.sh

echo "=== macOS Complete Test Suite ==="

# Detect system info
echo "System Information:"
echo "  Architecture: $(uname -m)"
echo "  macOS Version: $(sw_vers -productVersion)"
echo "  SIP Status: $(csrutil status | head -1)"

# Test checklist
declare -a tests=(
    "Node.js:node --version"
    "Claude:which claude"
    "Homebrew:brew --version"
    "Quarantine Check:xattr -l $(which claude) 2>/dev/null | grep -c quarantine"
    "Permission Check:[ -x $(which claude) ]"
)

passed=0
failed=0

for test in "${tests[@]}"; do
    IFS=':' read -r name command <<< "$test"
    echo -n "Testing $name... "
    if eval "$command" &>/dev/null; then
        echo "✓ PASSED"
        ((passed++))
    else
        echo "✗ FAILED"
        ((failed++))
    fi
done

echo ""
echo "Results: $passed passed, $failed failed"

# Performance benchmark
echo ""
echo "Running performance benchmark..."
time {
    for i in {1..1000}; do
        echo "test" > /tmp/bench_$i.txt
    done
    rm /tmp/bench_*.txt
}

echo "=== Test Complete ==="
```

---

## Phase 3: Integration Testing (Week 3)
### Test Complete Workflows

#### ✅ Complete User Journey Tests

**Test Scenario 1: Basic Development Session**
```yaml
Steps:
  1. [ ] Start yurucode
  2. [ ] Create new session
  3. [ ] Send "Help me create a React component"
  4. [ ] Wait for response
  5. [ ] Use Edit tool on suggested file
  6. [ ] Create checkpoint "Component created"
  7. [ ] Send "Add tests for this component"
  8. [ ] Use Write tool for test file
  9. [ ] Create checkpoint "Tests added"
  10. [ ] Send "Run the tests"
  11. [ ] Use Bash tool
  12. [ ] Verify output displayed correctly
  13. [ ] Restore to "Component created" checkpoint
  14. [ ] Verify test file gone
  15. [ ] Close and reopen yurucode
  16. [ ] Resume session
  17. [ ] Verify history intact

Verification:
  - [ ] No errors in console
  - [ ] All tools work
  - [ ] Checkpoints restore correctly
  - [ ] Session persists
  - [ ] Memory usage reasonable
```

**Test Scenario 2: Large Project Session**
```yaml
Steps:
  1. [ ] Open large project (1000+ files)
  2. [ ] Send 50 messages
  3. [ ] Use various tools 20+ times
  4. [ ] Create 10 checkpoints
  5. [ ] Keep session running for 2 hours
  6. [ ] Monitor memory usage
  7. [ ] Monitor CPU usage
  8. [ ] Check for memory leaks
  9. [ ] Verify virtualization working
  10. [ ] Test timeline navigation

Verification:
  - [ ] Memory stays under 500MB
  - [ ] CPU usage reasonable
  - [ ] No lag with 50+ messages
  - [ ] Timeline responsive
  - [ ] No crashes
```

**Test Scenario 3: Agent Execution**
```yaml
Steps:
  1. [ ] Create custom agent
  2. [ ] Set system prompt
  3. [ ] Execute agent on project
  4. [ ] Monitor output streaming
  5. [ ] Stop agent mid-execution
  6. [ ] Verify cleanup
  7. [ ] Execute multiple agents
  8. [ ] Check process management

Verification:
  - [ ] Agents execute correctly
  - [ ] Output streams in real-time
  - [ ] Stop works immediately
  - [ ] No orphaned processes
  - [ ] Metrics accurate
```

#### ✅ Cross-Platform Compatibility Matrix
```yaml
Feature Matrix:
  Feature:              Win Native | WSL | macOS Intel | macOS ARM
  ------------------------------------------------------------------
  Session Creation:     [ ]        | [ ] | [ ]         | [ ]
  Message Sending:      [ ]        | [ ] | [ ]         | [ ]
  Edit Tool:           [ ]        | [ ] | [ ]         | [ ]
  Write Tool:          [ ]        | [ ] | [ ]         | [ ]
  Bash Tool:           [ ]        | [ ] | [ ]         | [ ]
  Read Tool:           [ ]        | [ ] | [ ]         | [ ]
  Checkpoints:         [ ]        | [ ] | [ ]         | [ ]
  Timeline:            [ ]        | [ ] | [ ]         | [ ]
  Agents:              [ ]        | [ ] | [ ]         | [ ]
  Virtualization:      [ ]        | [ ] | [ ]         | [ ]
  Session Resume:      [ ]        | [ ] | [ ]         | [ ]
  Compact Command:     [ ]        | [ ] | [ ]         | [ ]
  Token Tracking:      [ ]        | [ ] | [ ]         | [ ]
  Analytics:           [ ]        | [ ] | [ ]         | [ ]
  MCP Servers:         [ ]        | [ ] | [ ]         | [ ]
  Hooks:               [ ]        | [ ] | [ ]         | [ ]
```

---

## Phase 4: Performance Validation (Week 4)
### Ensure No Regressions

#### ✅ Performance Benchmarks
```javascript
// Performance test suite
const performanceTests = {
  messageRendering: {
    target: 50, // ms for 1000 messages
    test: async () => {
      const messages = generateMessages(1000);
      const start = performance.now();
      renderMessages(messages);
      return performance.now() - start;
    }
  },
  
  sessionSwitch: {
    target: 100, // ms
    test: async () => {
      const start = performance.now();
      await switchSession('test-session-id');
      return performance.now() - start;
    }
  },
  
  checkpointCreation: {
    target: 500, // ms
    test: async () => {
      const start = performance.now();
      await createCheckpoint('test');
      return performance.now() - start;
    }
  },
  
  checkpointRestore: {
    target: 1000, // ms
    test: async () => {
      const start = performance.now();
      await restoreCheckpoint('checkpoint-id');
      return performance.now() - start;
    }
  },
  
  memoryUsage: {
    target: 200, // MB for 1000 messages
    test: async () => {
      if ('memory' in performance) {
        return (performance as any).memory.usedJSHeapSize / 1048576;
      }
      return 0;
    }
  }
};

// Run all benchmarks
async function runBenchmarks() {
  const results = {};
  
  for (const [name, benchmark] of Object.entries(performanceTests)) {
    const duration = await benchmark.test();
    const passed = duration <= benchmark.target;
    
    results[name] = {
      duration,
      target: benchmark.target,
      passed,
      margin: ((benchmark.target - duration) / benchmark.target * 100).toFixed(2)
    };
    
    console.log(`${name}: ${duration}ms (target: ${benchmark.target}ms) ${passed ? '✓' : '✗'}`);
  }
  
  return results;
}
```

#### ✅ Memory Leak Detection
```javascript
// Memory leak detection
class MemoryLeakDetector {
  private samples: number[] = [];
  private interval: NodeJS.Timer;
  
  start() {
    this.interval = setInterval(() => {
      if ('memory' in performance) {
        const used = (performance as any).memory.usedJSHeapSize;
        this.samples.push(used);
        
        // Keep last 60 samples (1 minute at 1 sample/sec)
        if (this.samples.length > 60) {
          this.samples.shift();
        }
        
        // Check for consistent growth
        if (this.samples.length >= 60) {
          const trend = this.calculateTrend();
          if (trend > 1048576) { // 1MB/minute growth
            console.warn(`Memory leak detected: ${(trend / 1048576).toFixed(2)}MB/minute growth`);
          }
        }
      }
    }, 1000);
  }
  
  stop() {
    clearInterval(this.interval);
  }
  
  private calculateTrend(): number {
    // Simple linear regression
    const n = this.samples.length;
    const x = Array.from({length: n}, (_, i) => i);
    const y = this.samples;
    
    const sumX = x.reduce((a, b) => a + b, 0);
    const sumY = y.reduce((a, b) => a + b, 0);
    const sumXY = x.reduce((sum, xi, i) => sum + xi * y[i], 0);
    const sumX2 = x.reduce((sum, xi) => sum + xi * xi, 0);
    
    const slope = (n * sumXY - sumX * sumY) / (n * sumX2 - sumX * sumX);
    return slope * 60; // Growth per minute
  }
}
```

---

## Phase 5: Production Readiness (Week 5)
### Final Checks Before Release

#### ✅ Security Audit
```yaml
Security Checklist:
  Input Validation:
    - [ ] Path traversal prevention
    - [ ] Command injection prevention
    - [ ] XSS prevention
    - [ ] SQL injection prevention (if using SQLite)
    
  Process Security:
    - [ ] No hardcoded secrets
    - [ ] Environment variables sanitized
    - [ ] Process isolation working
    - [ ] No privilege escalation
    
  Data Security:
    - [ ] Sessions encrypted at rest
    - [ ] Checkpoints encrypted
    - [ ] No sensitive data in logs
    - [ ] Secure file permissions
```

#### ✅ Error Handling Verification
```typescript
// Error handling test scenarios
const errorScenarios = [
  {
    name: "Claude not found",
    setup: () => process.env.CLAUDE_PATH = "/nonexistent",
    expectedBehavior: "Graceful error message"
  },
  {
    name: "Network timeout",
    setup: () => simulateNetworkTimeout(),
    expectedBehavior: "Retry with exponential backoff"
  },
  {
    name: "Disk full",
    setup: () => simulateDiskFull(),
    expectedBehavior: "Clear error message, cleanup attempted"
  },
  {
    name: "Session corruption",
    setup: () => corruptSession(),
    expectedBehavior: "Recovery attempted, user notified"
  },
  {
    name: "Process crash",
    setup: () => killClaudeProcess(),
    expectedBehavior: "Process restarted, session recovered"
  }
];

// Test each scenario
for (const scenario of errorScenarios) {
  console.log(`Testing: ${scenario.name}`);
  scenario.setup();
  // Verify expected behavior
  // Log results
}
```

#### ✅ Documentation Verification
```yaml
Documentation Checklist:
  User Documentation:
    - [ ] Installation guide updated
    - [ ] Feature documentation complete
    - [ ] Troubleshooting guide updated
    - [ ] FAQ updated
    
  Developer Documentation:
    - [ ] Architecture documented
    - [ ] API documentation complete
    - [ ] Contributing guide updated
    - [ ] Testing guide complete
    
  Code Documentation:
    - [ ] All functions commented
    - [ ] Complex logic explained
    - [ ] TODOs addressed or documented
    - [ ] Type definitions complete
```

---

## Phase 6: Rollout Strategy (Week 6)
### Gradual Deployment

#### ✅ Beta Testing
```yaml
Beta Test Plan:
  Week 1 - Internal:
    - [ ] Development team testing
    - [ ] 5 internal users
    - [ ] Collect feedback
    - [ ] Fix critical issues
    
  Week 2 - Limited Beta:
    - [ ] 20 beta testers
    - [ ] Different platforms
    - [ ] Monitor telemetry
    - [ ] Daily bug fixes
    
  Week 3 - Open Beta:
    - [ ] 100+ beta testers
    - [ ] Public beta channel
    - [ ] Feedback form
    - [ ] Priority bug fixes
    
  Week 4 - Release Candidate:
    - [ ] Feature freeze
    - [ ] Only critical fixes
    - [ ] Final testing
    - [ ] Release preparation
```

#### ✅ Monitoring & Telemetry
```typescript
// Telemetry setup
interface TelemetryEvent {
  event: string;
  properties: Record<string, any>;
  timestamp: Date;
  platform: string;
  version: string;
  sessionId: string;
}

class TelemetryService {
  private events: TelemetryEvent[] = [];
  private uploadInterval: NodeJS.Timer;
  
  trackEvent(event: string, properties?: Record<string, any>) {
    this.events.push({
      event,
      properties: properties || {},
      timestamp: new Date(),
      platform: this.detectPlatform(),
      version: APP_VERSION,
      sessionId: this.getSessionId(),
    });
  }
  
  trackError(error: Error, context?: Record<string, any>) {
    this.trackEvent('error', {
      message: error.message,
      stack: error.stack,
      ...context
    });
  }
  
  trackPerformance(metric: string, value: number) {
    this.trackEvent('performance', {
      metric,
      value
    });
  }
}

// Key metrics to track
const metrics = {
  startup_time: 'ms',
  message_render_time: 'ms',
  checkpoint_creation_time: 'ms',
  memory_usage: 'MB',
  session_duration: 'minutes',
  tools_used: 'count',
  errors_encountered: 'count',
  feature_usage: {
    virtualization: 'boolean',
    checkpoints: 'count',
    timeline: 'interactions',
    agents: 'executions'
  }
};
```

---

## Final Sign-Off Checklist

### ✅ Technical Sign-Off
```yaml
Technical Requirements:
  Performance:
    - [ ] All benchmarks pass
    - [ ] No memory leaks
    - [ ] Startup time < 3s
    - [ ] Message rendering < 50ms
    
  Compatibility:
    - [ ] Windows 10/11 ✓
    - [ ] WSL 1/2 ✓
    - [ ] macOS Intel ✓
    - [ ] macOS ARM ✓
    - [ ] Linux (Ubuntu/Fedora) ✓
    
  Features:
    - [ ] Virtualization working
    - [ ] Checkpoints working
    - [ ] Timeline working
    - [ ] Agents working
    - [ ] All existing features preserved
    
  Quality:
    - [ ] Zero critical bugs
    - [ ] < 5 known minor issues
    - [ ] Test coverage > 70%
    - [ ] No security vulnerabilities
```

### ✅ Business Sign-Off
```yaml
Business Requirements:
  - [ ] Feature parity achieved
  - [ ] Performance improved
  - [ ] User experience enhanced
  - [ ] Documentation complete
  - [ ] Support team trained
  - [ ] Rollback plan ready
  - [ ] Communication plan ready
```

### ✅ Deployment Checklist
```yaml
Deployment:
  Pre-deployment:
    - [ ] Backup current production
    - [ ] Tag release version
    - [ ] Update changelog
    - [ ] Prepare release notes
    
  Deployment:
    - [ ] Deploy to staging
    - [ ] Run smoke tests
    - [ ] Deploy to production
    - [ ] Verify deployment
    
  Post-deployment:
    - [ ] Monitor error rates
    - [ ] Monitor performance
    - [ ] Monitor user feedback
    - [ ] Be ready to rollback
```

---

## Emergency Contacts & Procedures

### On-Call Procedures
```yaml
Severity Levels:
  P0 - Critical (App doesn't start):
    Response: Immediate
    Action: Rollback within 30 minutes
    
  P1 - Major (Core feature broken):
    Response: Within 1 hour
    Action: Hotfix or rollback within 4 hours
    
  P2 - Minor (Non-critical issue):
    Response: Within 4 hours
    Action: Fix in next release
```

### Rollback Procedure
```bash
#!/bin/bash
# emergency-rollback.sh

echo "🚨 INITIATING EMERGENCY ROLLBACK"

# 1. Stop current version
pkill -f yurucode

# 2. Restore previous version
git checkout v1.0.0-pre-refactor

# 3. Restore embedded server
git checkout backup/pre-implementation-* -- src-tauri/src/logged_server.rs

# 4. Rebuild
npm install
npm run build

# 5. Deploy
npm run deploy

# 6. Verify
npm run smoke-test

echo "✅ Rollback complete"
```

---

## Success Criteria

### The implementation is successful when:

1. **All platforms work flawlessly** ✓
   - Windows Native ✓
   - WSL ✓
   - macOS Intel ✓
   - macOS ARM ✓

2. **Performance targets met** ✓
   - 1000 messages render < 50ms
   - Checkpoints create < 500ms
   - Memory usage < 200MB

3. **No regressions** ✓
   - All existing features work
   - No new bugs introduced
   - User experience improved

4. **Production ready** ✓
   - Zero critical bugs
   - Documentation complete
   - Support team ready
   - Rollback plan tested

---

## Conclusion

This master checklist ensures NOTHING is missed during implementation. Follow each step carefully, verify thoroughly, and DO NOT skip any verification steps. The success of this implementation depends on meticulous attention to detail and comprehensive testing on all platforms.

Remember: **It's better to be slow and correct than fast and broken.**
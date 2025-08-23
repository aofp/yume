# 🚨 CRITICAL: Implementation Guide - START HERE

## ⚠️ MANDATORY IMPLEMENTATION REQUIREMENTS

### 1. ALWAYS Document Progress
**CREATE AND MAINTAIN**: `/docs/implementation-guide/progress/` folder
- **Log EVERY step** you take
- **Document EVERY change** you make  
- **Record EVERY test** you run
- **Track EVERY error** you encounter

### 2. Quadruple-Check EVERYTHING
Before writing ANY code:
1. **PLAN** - Write out what you're going to do
2. **REVIEW** - Check against claudia's working implementation
3. **IMPLEMENT** - Write the code carefully
4. **VERIFY** - Test that it works exactly as expected

### 3. Progress Tracking Structure
```
/docs/implementation-guide/progress/
├── 00-current-status.md          # UPDATE THIS CONSTANTLY
├── 01-completed-tasks.md         # Mark tasks as done
├── 02-in-progress.md             # What you're working on NOW
├── 03-blockers.md                # Any issues encountered
├── 04-test-results.md            # Results of EVERY test
├── 05-changes-made.md            # EVERY file modified
├── 06-rollback-points.md         # Git commits for safety
└── daily/
    ├── day-01-log.md             # Detailed daily progress
    ├── day-02-log.md
    └── ...
```

## 🎯 Purpose of This Documentation

This documentation provides **complete, exhaustive guidance** for migrating yurucode from its critically flawed embedded server architecture to robust direct CLI spawning. **FAILURE IS NOT AN OPTION** - follow every step exactly.

## 🔍 Reference Implementation: Claudia

**CRITICAL**: The `/claudia` directory contains a **WORKING IMPLEMENTATION** that you MUST reference:

### Files You MUST Study Before Starting:
- `/claudia/src-tauri/src/process/registry.rs` - **READ THIS FIRST**
- `/claudia/src-tauri/src/claude_binary.rs` - **COPY EXACTLY**
- `/claudia/src-tauri/src/commands/claude.rs` - **FOLLOW PATTERNS**

## 📋 Implementation Methodology

### Before EVERY Change:

1. **PLAN Phase** (Document in progress folder)
   ```markdown
   ## Planning: [Feature Name]
   - What I'm going to change
   - Why I'm changing it
   - Expected outcome
   - Potential risks
   ```

2. **REVIEW Phase** (Check 4 times)
   - ✓ Check against claudia's implementation
   - ✓ Check against documentation
   - ✓ Check for side effects
   - ✓ Check for platform differences

3. **IMPLEMENT Phase** (Log everything)
   ```markdown
   ## Implementation Log: [Timestamp]
   - File: [filename]
   - Lines changed: [line numbers]
   - Before: [old code]
   - After: [new code]
   - Reason: [why this change]
   ```

4. **VERIFY Phase** (Test and document)
   ```markdown
   ## Verification: [Feature Name]
   - Test performed: [description]
   - Expected result: [what should happen]
   - Actual result: [what happened]
   - Status: PASS/FAIL
   - If FAIL: [debugging steps taken]
   ```

## 🚨 Critical Problems We're Solving

### The Freeze Bug (P0 - CRITICAL)
- **Problem**: Freezes on tasks > 5 minutes
- **Root Cause**: 2-hour timeout in embedded server
- **Solution**: Direct CLI spawning (NO TIMEOUTS)
- **Verification**: Must test 2-hour task successfully

### Current Failure Rates (UNACCEPTABLE)
```
5-minute tasks:  85% success → MUST BE 100%
30-minute tasks: 35% success → MUST BE 100%  
2-hour tasks:    0% success  → MUST BE 100%
```

## 📚 Documentation You MUST Read (In Order)

### Day 0: Preparation
1. **Study `/claudia` implementation** - Understand working code
2. **Read [FINAL-SUMMARY-ALL-DETAILS.md](05-freeze-bug-analysis/FINAL-SUMMARY-ALL-DETAILS.md)** - Full context
3. **Create progress tracking folder** - Set up documentation

### Day 1-14: Implementation
4. **Follow [ULTIMATE-MIGRATION-CHECKLIST.md](ULTIMATE-MIGRATION-CHECKLIST.md)** - Day by day
5. **Reference [COMPLETE-INTEGRATION-GUIDE.md](COMPLETE-INTEGRATION-GUIDE.md)** - For details
6. **Check [SESSION-EXTRACTION-ANALYTICS.md](SESSION-EXTRACTION-ANALYTICS.md)** - Critical patterns

### Critical Fixes
7. **[SESSION-BROWSER-FIX.md](SESSION-BROWSER-FIX.md)** - Remove readOnly flag
8. **[PLATFORM-FEATURE-PARITY.md](PLATFORM-FEATURE-PARITY.md)** - Platform differences

### Testing & Verification
9. **[CRITICAL-FEATURES-VERIFICATION.md](CRITICAL-FEATURES-VERIFICATION.md)** - All must work
10. **[PLATFORM-RELEASE-CHECKLIST.md](PLATFORM-RELEASE-CHECKLIST.md)** - Final checks

## ⚠️ NEVER SKIP THESE CRITICAL PATTERNS

### 1. Process Registration (IMMEDIATE)
```rust
// WRONG - Will create orphans
let child = spawn_claude()?;
let session_id = extract_id(child).await?;  // Could fail!
registry.register(child);  // Too late!

// RIGHT - Always registered
let child = spawn_claude()?;
registry.register(child);  // IMMEDIATELY!
let session_id = extract_id(child).await?;
```

### 2. Session ID Extraction (500ms WINDOW)
```rust
// MUST extract within 500ms or LOST FOREVER
timeout(Duration::from_millis(500), async {
    // Look for: {"type":"system","subtype":"init","session_id":"..."}
}).await
```

### 3. Argument Order (EXACT OR FAILS)
```bash
# RIGHT - This exact order
claude \
  --resume SESSION_ID \         # 1. Resume FIRST
  --prompt "text" \             # 2. Prompt
  --output-format stream-json \ # 3. Format
  --print                       # 4. CRITICAL!

# WRONG - Will fail silently
claude --prompt "text" --resume SESSION_ID  # Resume ignored!
```

### 4. Token Accumulation (ALWAYS +=)
```typescript
// WRONG - Loses data
tokens.total = newTokens;  ❌

// RIGHT - Accumulates
tokens.total += newTokens; ✅
```

### 5. Remove readOnly Flag (OR UNUSABLE)
```typescript
// DELETE THIS LINE COMPLETELY
// readOnly: true,  ❌

// ADD THIS INSTEAD
resumable: true,  ✅
```

## 📊 Success Criteria (ALL MUST PASS)

| Test | Required | How to Verify |
|------|----------|---------------|
| 5-min task | 100% | Run 10 times, all must complete |
| 30-min task | 100% | Run 5 times, all must complete |
| 2-hour task | 100% | Run 3 times, all must complete |
| Memory | <300MB | Monitor throughout all tests |
| Process cleanup | 100% | `ps aux \| grep claude` shows none |
| Session resume | Works | Load old session, send message |

## 🔴 Common Failures (CHECK THESE FIRST)

### If Claude Hangs
- ✓ Check --print flag present
- ✓ Check argument order
- ✓ Check binary path correct

### If Session Won't Resume
- ✓ Check readOnly flag removed
- ✓ Check session ID format (26 chars)
- ✓ Check --resume is FIRST argument

### If Memory Grows
- ✓ Check using streaming, not accumulation
- ✓ Check buffer.clear() after each line
- ✓ Check not storing all output

### If Processes Orphaned
- ✓ Check ProcessRegistry.register() called immediately
- ✓ Check Drop trait implemented
- ✓ Check kill logic for platform

## 📝 Daily Progress Template

Create this EVERY DAY in `/docs/implementation-guide/progress/daily/`:

```markdown
# Day [N] Progress Log - [Date]

## Planned Tasks
- [ ] Task 1 from checklist
- [ ] Task 2 from checklist

## Morning Session (4 hours)
### 9:00 AM - Started
- Working on: [specific task]
- Files to modify: [list files]

### 10:30 AM - Progress Check
- Completed: [what's done]
- Issues: [any problems]
- Next: [what's next]

### 12:00 PM - Morning Complete
- ✅ Completed: [list]
- ⚠️ Blocked: [list]
- 📝 Notes: [important observations]

## Afternoon Session (4 hours)
[Same structure]

## End of Day Summary
- Completed: [X/Y] tasks
- Tests run: [list with results]
- Commits made: [git commit hashes]
- Tomorrow: [what's next]

## Issues for Review
- [Any problems that need discussion]
```

## 🚀 Implementation Timeline

**Total: 14 days implementation + 6 days testing**

### Week 1: Foundation
- Days 1-2: ProcessRegistry (copy from claudia)
- Days 3-4: Binary Detection (copy from claudia)
- Day 5: Session Management

### Week 2: Core
- Days 6-7: CLI Spawning
- Days 8-9: Stream Parser
- Day 10: Title Generation

### Week 3: Frontend
- Days 11-12: Remove Socket.IO
- Days 13-14: Add Tauri Events

### Week 4: Testing
- Days 15-16: Integration Tests
- Days 17-18: Platform Tests
- Days 19-20: Final Verification

## 🆘 When You Get Stuck

1. **Check claudia's implementation** - It works!
2. **Check your progress logs** - What changed?
3. **Review the patterns above** - Common mistakes?
4. **Test in isolation** - Simplify the problem
5. **Document the issue** - In `03-blockers.md`

## 📌 REMEMBER: The 5 Laws of Implementation

1. **LOG EVERYTHING** - Every change, every test, every result
2. **PLAN BEFORE CODING** - Think, plan, review, then code
3. **TEST IMMEDIATELY** - Don't accumulate untested changes
4. **COPY FROM CLAUDIA** - It's proven to work
5. **DOCUMENT PROGRESS** - Future you will thank you

## 🎯 Definition of Done

The migration is ONLY complete when:
- ✅ All tests pass 100% of the time
- ✅ Memory stays under 300MB
- ✅ No processes orphaned
- ✅ Sessions fully resumable
- ✅ Works on macOS AND Windows
- ✅ All progress documented
- ✅ No regressions from current version

---

## Quick Links to Critical Docs

### Implementation Guides
- [Complete Integration Guide](COMPLETE-INTEGRATION-GUIDE.md)
- [Ultimate Migration Checklist](ULTIMATE-MIGRATION-CHECKLIST.md)
- [Session Extraction Critical](SESSION-EXTRACTION-ANALYTICS.md)

### Must Fix
- [Session Browser Fix](SESSION-BROWSER-FIX.md) - Remove readOnly
- [Platform Differences](PLATFORM-FEATURE-PARITY.md)

### Testing
- [Features Verification](CRITICAL-FEATURES-VERIFICATION.md)
- [Release Checklist](PLATFORM-RELEASE-CHECKLIST.md)

---

**CRITICAL REMINDER**: 
- Create `/docs/implementation-guide/progress/` folder NOW
- Update `00-current-status.md` CONSTANTLY
- Log EVERY change in `05-changes-made.md`
- Test results in `04-test-results.md`
- Daily logs in `daily/` folder

**The embedded server MUST be replaced. Claudia shows the way. Your job is to implement it PERFECTLY.**

**START NOW → Create progress folder → Study claudia → Begin Day 1**
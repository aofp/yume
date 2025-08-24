# Process Wrapper Compact Implementation PRD

## Product Overview

### Vision
Implement automatic context management for yurucode through a transparent process wrapper that monitors Claude CLI token usage and triggers intelligent compaction when needed, ensuring unlimited conversation length without manual intervention.

### Problem Statement
- Users hit token limits causing "context full" errors
- Manual `/compact` command disrupts workflow
- No visibility into token usage until it's too late
- Lost context when forced to clear conversation
- Different behavior across platforms (Windows/macOS/Linux)

### Solution
A Node.js process wrapper that intercepts Claude CLI's stream-json output, monitors token usage in real-time, and automatically triggers context compaction at configurable thresholds - all without modifying Claude's source code.

## Success Metrics

| Metric | Target | Measurement |
|--------|--------|-------------|
| Token Efficiency | 75% reduction after compact | Compare before/after token counts |
| User Interruption | Zero manual compacts needed | Track auto vs manual compacts |
| Performance Impact | <5ms latency added | Measure wrapper overhead |
| Platform Coverage | 100% Windows/Mac/Linux | Test on all platforms |
| Reliability | 99.9% uptime | Monitor wrapper crashes |
| User Satisfaction | No workflow disruption | User feedback |

## User Stories

### As a Developer
- I want to have long technical discussions without worrying about token limits
- I want to see my current token usage in real-time
- I want automatic compaction to preserve my important context
- I want to configure when and how compaction happens

### As a Creative Writer  
- I want to maintain narrative continuity across long sessions
- I want compaction to preserve character details and plot points
- I want control over what gets summarized vs preserved

### As a Researcher
- I want to analyze large datasets without context limits
- I want compaction to maintain key findings and methodologies
- I want to export compacted summaries for documentation

## Technical Requirements

### Core Functionality

#### 1. Process Wrapping
- **MUST** spawn Claude CLI as child process
- **MUST** preserve all original CLI arguments
- **MUST** maintain stdin/stdout/stderr pipes
- **MUST** support all Claude CLI features unchanged

#### 2. Token Monitoring
- **MUST** parse stream-json output for token counts
- **MUST** track cumulative token usage per session
- **MUST** detect approaching limits before they hit
- **SHOULD** predict token growth rate

#### 3. Auto-Compact Triggering
- **MUST** trigger at configurable threshold (default 75%)
- **MUST** respect cooldown period (default 5 minutes)
- **MUST** queue pending messages during compact
- **MUST** preserve conversation continuity

#### 4. Compact Execution
- **MUST** use fast model (Sonnet) for compaction
- **MUST** preserve code blocks verbatim
- **MUST** maintain technical accuracy
- **SHOULD** customize prompt based on conversation type

#### 5. Platform Compatibility
- **MUST** work identically on Windows/macOS/Linux
- **MUST** handle WSL path translation
- **MUST** find Claude binary automatically
- **MUST** handle platform-specific spawn options

### Configuration

#### Required Settings
```json
{
  "compact": {
    "enabled": true,              // Master switch
    "auto": true,                 // Auto-compact enabled
    "threshold": 75000,           // Token count threshold
    "thresholdPercent": 0.75,    // Or percentage threshold
    "cooldown": 300000,           // Minimum time between compacts (ms)
    "model": "claude-3-5-sonnet-20241022"  // Model for compaction
  }
}
```

#### Advanced Settings
```json
{
  "compact": {
    "preserveRecent": 5,          // Keep last N messages uncompacted
    "preserveCodeBlocks": true,   // Never summarize code
    "preserveMode": "smart",      // smart|aggressive|conservative
    "customPrompts": {
      "technical": "...",
      "creative": "...",
      "research": "..."
    },
    "notifications": {
      "beforeCompact": true,
      "afterCompact": true,
      "showSavings": true
    },
    "export": {
      "enabled": false,
      "format": "markdown",
      "path": "~/.yurucode/compacts/"
    }
  }
}
```

### Integration Points

#### 1. Embedded Server (logged_server.rs)
- Replace direct Claude spawn with wrapper spawn
- Pass session ID for correlation
- Handle wrapper-specific events

#### 2. Frontend (claudeCodeStore.ts)
- Display token usage indicator
- Show compact progress
- Update UI after compact

#### 3. Configuration (Settings Modal)
- Compact settings UI
- Threshold sliders
- Model selection

## User Experience

### Token Usage Indicator
```
[█████████░░░░░░] 75% (75,000/100,000 tokens)
                  ⚠️ Auto-compact at 80%
```

### Compact Notification
```
🔄 AUTO-COMPACT: Optimizing conversation memory...
   • Preserving last 5 messages
   • Maintaining all code blocks
   • Using claude-3-5-sonnet for efficiency
   
✅ Compact complete! Saved 65,000 tokens (87% reduction)
```

### Manual Override
- Ctrl+Shift+C - Force compact now
- Ctrl+Shift+X - Cancel auto-compact
- Settings → Compact → Disable auto-compact

## Architecture

### Component Diagram
```
┌─────────────┐     ┌──────────────┐     ┌─────────────┐
│   yurucode  │────▶│    Wrapper   │────▶│  Claude CLI │
│   Frontend  │     │              │     │             │
└─────────────┘     │  - Monitor   │     └─────────────┘
       ▲            │  - Trigger   │            │
       │            │  - Compact   │            │
       │            └──────────────┘            │
       │                    │                   │
       └────────────────────┴───────────────────┘
              WebSocket with token data
```

### Data Flow
1. User sends message → yurucode → Wrapper → Claude
2. Claude returns stream-json → Wrapper parses tokens → yurucode
3. Wrapper detects threshold → Triggers compact → Claude
4. Compact completes → Token reset → Continue conversation

### State Management
```javascript
WrapperState = {
  sessions: Map<sessionId, {
    tokenCount: number,
    lastCompact: timestamp,
    isCompacting: boolean,
    messageQueue: array,
    compactCount: number
  }>
}
```

## Implementation Plan

### Phase 1: Core Wrapper (Day 1)
- [x] Basic process wrapping
- [x] Stream interception
- [x] Token parsing
- [x] Platform detection

### Phase 2: Auto-Compact (Day 2)
- [ ] Threshold detection
- [ ] Compact triggering
- [ ] Message queueing
- [ ] Session continuity

### Phase 3: Integration (Day 3)
- [ ] Modify logged_server.rs
- [ ] Update frontend store
- [ ] Add configuration
- [ ] Socket events

### Phase 4: UI/UX (Day 4)
- [ ] Token usage indicator
- [ ] Compact notifications
- [ ] Settings panel
- [ ] Keyboard shortcuts

### Phase 5: Testing (Day 5)
- [ ] Unit tests
- [ ] Integration tests
- [ ] Platform testing
- [ ] Performance testing

## Risk Analysis

| Risk | Probability | Impact | Mitigation |
|------|------------|--------|------------|
| Wrapper crashes | Low | High | Process monitoring, auto-restart |
| Infinite compact loop | Low | High | Cooldown timer, max attempts |
| Token count inaccuracy | Medium | Medium | Verify against Claude's count |
| Platform incompatibility | Low | High | Extensive testing, fallbacks |
| Performance degradation | Low | Low | Stream processing, minimal parsing |
| Context loss | Low | High | Message queue, state preservation |

## Testing Strategy

### Unit Tests
- Token parsing accuracy
- Threshold calculation
- Platform detection
- Path resolution

### Integration Tests
- End-to-end message flow
- Compact triggering
- Session continuity
- Error recovery

### Platform Tests
- Windows 10/11
- macOS 12+
- Ubuntu/Debian
- WSL2

### Performance Tests
- Latency measurement
- Memory usage
- CPU overhead
- Large conversation handling

### User Acceptance Tests
- Long conversation flow
- Multiple compacts
- Platform switching
- Configuration changes

## Security Considerations

- **No code injection** - Only wraps, doesn't modify
- **No network access** - Local process only
- **No file system writes** - Except optional exports
- **No sensitive data exposure** - Preserves Claude's security

## Rollout Strategy

### Phase 1: Alpha (Internal)
- Team testing
- Debug logging enabled
- Manual compact only

### Phase 2: Beta (Selected Users)
- Auto-compact enabled
- Feedback collection
- Performance monitoring

### Phase 3: General Availability
- Full feature set
- Optimized performance
- Documentation complete

## Success Criteria

### Launch Criteria
- ✅ All platforms working
- ✅ <5ms latency impact
- ✅ 100% backward compatibility
- ✅ Zero Claude modifications

### Post-Launch Metrics
- User engagement increase
- Support ticket reduction
- Session length increase
- Token usage optimization

## Documentation Requirements

### User Documentation
- How auto-compact works
- Configuration guide
- Troubleshooting guide
- FAQ

### Developer Documentation
- Architecture overview
- Integration guide
- API reference
- Contributing guide

## Appendix

### A. Compact Prompts

#### Technical Conversations
```
Please provide a concise technical summary of our conversation, preserving:
- All code snippets and commands
- Technical decisions and rationale
- Error messages and solutions
- Architecture and design patterns
Format as structured documentation.
```

#### Creative Writing
```
Summarize our creative work, maintaining:
- Character details and development
- Plot points and story arc
- World-building elements
- Dialogue style and tone
Present as a creative brief.
```

#### Research/Analysis
```
Synthesize our research findings, including:
- Key data points and statistics
- Methodologies used
- Conclusions and insights
- Next steps and recommendations
Structure as an executive summary.
```

### B. Error Messages

| Code | Message | Action |
|------|---------|--------|
| CW001 | Claude binary not found | Check installation |
| CW002 | Token parsing failed | Continue without monitoring |
| CW003 | Compact failed | Retry with backoff |
| CW004 | Session not found | Create new session |
| CW005 | Configuration invalid | Use defaults |

### C. Telemetry Events

- `compact.triggered` - Auto-compact initiated
- `compact.completed` - Compact successful
- `compact.failed` - Compact failed
- `compact.savings` - Token reduction amount
- `threshold.reached` - Threshold hit
- `wrapper.error` - Wrapper exception

## Approval

- Product: _______________
- Engineering: ___________
- Design: _______________
- QA: ___________________

---

*This PRD represents the complete specification for the yurucode compact wrapper implementation. Any deviations require approval from all stakeholders.*
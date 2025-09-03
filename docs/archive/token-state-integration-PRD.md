# Token State Integration PRD

## Executive Summary

Enhance the Claude Compact Wrapper to seamlessly integrate token usage data into yurucode's existing UI components by injecting token metadata into the stream-json messages in a format that yurucode already understands and displays.

## Problem Statement

### Current State
- Wrapper tracks tokens internally but doesn't expose them in yurucode's expected format
- yurucode has existing token display logic in `claudeCodeStore.ts` that expects specific message formats
- Token analytics in the UI show `0/0` or incorrect values
- Users can't see real-time token usage percentage in the existing UI

### Desired State
- Token data flows naturally through existing yurucode message pipeline
- No modifications needed to frontend store or components
- Token percentage displays correctly in existing UI elements
- Analytics accumulate properly using existing `+=` logic

## Solution Architecture

### Strategy: Message Augmentation

Instead of creating new event channels, augment existing Claude stream-json messages with token metadata that yurucode already knows how to parse.

```javascript
// Current Claude message
{
  "type": "result",
  "usage": {
    "input_tokens": 5000,
    "output_tokens": 500
  }
}

// Augmented message from wrapper
{
  "type": "result",
  "usage": {
    "input_tokens": 5000,
    "output_tokens": 500,
    "cache_creation_input_tokens": 0,
    "cache_read_input_tokens": 0
  },
  // Added by wrapper for yurucode
  "token_state": {
    "current": 5500,
    "max": 100000,
    "percentage": 0.055,
    "threshold": 75000,
    "approaching_limit": false,
    "will_compact_at": 75000,
    "session_total": 5500
  }
}
```

## Technical Design

### 1. Message Injection Points

#### A. Result Messages (Primary)
Every `type: "result"` message gets augmented with complete token state.

```javascript
// In wrapper's processStreamLine method
if (data.type === 'result') {
  // Augment with token state
  data.token_state = this.getTokenState();
  
  // Ensure usage object is complete for yurucode
  if (data.usage) {
    data.usage = this.normalizeUsageData(data.usage);
  }
}
```

#### B. Periodic Updates
Inject token state into content blocks every N messages for real-time updates.

```javascript
// Every 10th content block
if (data.type === 'content_block_delta') {
  this.messageCount++;
  if (this.messageCount % 10 === 0) {
    data.token_state = this.getTokenState();
  }
}
```

#### C. System Messages
Add token state to compact notifications and warnings.

```javascript
// When approaching threshold
{
  "type": "system",
  "subtype": "token_warning",
  "message": "Approaching token limit (75%)",
  "token_state": { /* full state */ }
}
```

### 2. Token State Schema

```typescript
interface TokenState {
  // Current counts
  current: number;          // Total tokens used
  max: number;              // Maximum allowed
  percentage: number;       // 0.0 to 1.0
  
  // Thresholds
  threshold: number;        // Compact trigger point
  threshold_percentage: number;
  
  // Status flags
  approaching_limit: boolean;
  compact_available: boolean;
  compact_recommended: boolean;
  will_compact_at: number;
  
  // Session metrics
  session_total: number;    // Total for this session
  session_input: number;    // Input tokens this session
  session_output: number;   // Output tokens this session
  
  // Compact metrics
  compacts_performed: number;
  tokens_saved_total: number;
  last_compact_savings: number;
  
  // Estimates
  messages_remaining_estimate: number;
  tokens_per_message_avg: number;
}
```

### 3. Integration with claudeCodeStore

#### Existing Store Structure
```typescript
// claudeCodeStore.ts already has:
sessions: Map<string, {
  analytics: {
    tokenUsage: {
      input: number;
      output: number;
      total: number;
    };
    contextInfo?: {
      used: number;
      limit: number;
      percentage: number;
    };
  }
}>
```

#### Message Processing
```javascript
// Wrapper ensures messages contain expected fields
processForYurucode(message) {
  if (message.type === 'result') {
    // Ensure analytics accumulation works
    if (!message.usage) {
      message.usage = {
        input_tokens: 0,
        output_tokens: 0,
        cache_creation_input_tokens: 0,
        cache_read_input_tokens: 0
      };
    }
    
    // Add context info for percentage display
    if (this.currentSessionId) {
      const state = this.getTokenState();
      message.context_info = {
        used: state.current,
        limit: state.max,
        percentage: state.percentage
      };
    }
  }
  
  return message;
}
```

### 4. UI Component Updates

#### Analytics Display
```typescript
// MessageRenderer.tsx can show
<div className="token-display">
  <span>{formatTokens(analytics.contextInfo.used)}</span>
  <span>/</span>
  <span>{formatTokens(analytics.contextInfo.limit)}</span>
  <span>({Math.round(analytics.contextInfo.percentage * 100)}%)</span>
</div>
```

#### Progress Bar
```typescript
// Existing progress bar component
<div className="token-progress">
  <div 
    className="token-progress-bar"
    style={{
      width: `${analytics.contextInfo.percentage * 100}%`,
      backgroundColor: getColorForPercentage(analytics.contextInfo.percentage)
    }}
  />
</div>
```

## Implementation Plan

### Phase 1: Core Message Augmentation (Day 1)

1. **Update wrapper's stream processing**
   ```javascript
   processStreamLine(line) {
     // Parse JSON
     const data = JSON.parse(line);
     
     // Augment with token state
     const augmented = this.augmentMessage(data);
     
     // Output augmented message
     console.log(JSON.stringify(augmented));
   }
   ```

2. **Add state calculation**
   ```javascript
   getTokenState() {
     const session = this.sessions.get(this.currentSessionId);
     return {
       current: session?.tokenCount || 0,
       max: this.config.maxTokens,
       percentage: (session?.tokenCount || 0) / this.config.maxTokens,
       // ... rest of state
     };
   }
   ```

3. **Normalize usage data**
   ```javascript
   normalizeUsageData(usage) {
     return {
       input_tokens: usage.input_tokens || 0,
       output_tokens: usage.output_tokens || 0,
       cache_creation_input_tokens: usage.cache_creation_input_tokens || 0,
       cache_read_input_tokens: usage.cache_read_input_tokens || 0,
       total_tokens: (usage.input_tokens || 0) + (usage.output_tokens || 0)
     };
   }
   ```

### Phase 2: Store Integration (Day 2)

1. **Update message handler in logged_server.rs**
   ```javascript
   // Process wrapper-augmented messages
   rl.on('line', (line) => {
     const data = JSON.parse(line);
     
     // Extract token state if present
     if (data.token_state) {
       session.tokenState = data.token_state;
     }
     
     // Forward to frontend with context info
     if (data.type === 'result' && data.token_state) {
       data.context_info = {
         used: data.token_state.current,
         limit: data.token_state.max,
         percentage: data.token_state.percentage
       };
     }
     
     socket.emit(`message:${sessionId}`, data);
   });
   ```

2. **Ensure store compatibility**
   ```typescript
   // In claudeCodeStore.ts
   if (message.type === 'result' && message.context_info) {
     session.analytics.contextInfo = message.context_info;
   }
   ```

### Phase 3: UI Polish (Day 3)

1. **Add visual indicators**
   - Color coding: green (0-50%), yellow (50-75%), red (75%+)
   - Pulsing animation when approaching limit
   - Smooth transitions on updates

2. **Add tooltips**
   ```typescript
   <Tooltip content={`
     ${contextInfo.used.toLocaleString()} / ${contextInfo.limit.toLocaleString()} tokens
     Compact at: ${threshold.toLocaleString()} tokens
     Est. messages remaining: ${messagesRemaining}
   `}>
     <TokenDisplay />
   </Tooltip>
   ```

## Message Flow Diagram

```
Claude CLI → Stream JSON → Wrapper → Augmented JSON → yurucode Server → Frontend Store → UI

Original:
{type: "result", usage: {...}}
    ↓
Wrapper Augmentation:
{type: "result", usage: {...}, token_state: {...}, context_info: {...}}
    ↓
Server Processing:
Extract token_state, forward context_info
    ↓
Store Update:
session.analytics.contextInfo = message.context_info
    ↓
UI Display:
Show percentage, progress bar, warnings
```

## Backwards Compatibility

### Graceful Degradation
- If wrapper not present, yurucode works normally
- If token_state missing, use existing usage data
- If context_info missing, calculate from usage

### Detection Logic
```javascript
// In claudeCodeStore
const hasWrapperSupport = message.token_state !== undefined;
const tokenInfo = hasWrapperSupport 
  ? message.context_info 
  : calculateFromUsage(message.usage);
```

## Testing Strategy

### Unit Tests
1. Message augmentation with various types
2. Token state calculation accuracy
3. Threshold detection
4. Usage normalization

### Integration Tests
1. End-to-end message flow
2. Store accumulation with augmented messages
3. UI updates with token state
4. Compact trigger from UI percentage

### Visual Tests
1. Progress bar at various percentages
2. Color transitions
3. Warning indicators
4. Tooltip information

## Success Metrics

| Metric | Target | Measurement |
|--------|--------|-------------|
| Token display accuracy | 100% | Compare wrapper state vs UI |
| Update latency | <100ms | Time from message to UI update |
| Store compatibility | 100% | No breaking changes |
| Visual clarity | High | User feedback on readability |

## Risk Mitigation

| Risk | Impact | Mitigation |
|------|--------|------------|
| Message format changes | High | Validate schema, graceful fallback |
| Performance overhead | Medium | Throttle updates, batch processing |
| Store incompatibility | High | Extensive testing, gradual rollout |
| Visual confusion | Low | Clear documentation, tooltips |

## Configuration

### Wrapper Settings
```json
{
  "tokenStateInjection": {
    "enabled": true,
    "includeInResult": true,
    "includeInContent": true,
    "contentInterval": 10,
    "includeEstimates": true,
    "includeMetrics": true
  }
}
```

### Frontend Settings
```typescript
interface TokenDisplayConfig {
  showPercentage: boolean;
  showProgressBar: boolean;
  showEstimates: boolean;
  showWarnings: boolean;
  warningThreshold: number;
  criticalThreshold: number;
  colors: {
    safe: string;
    warning: string;
    critical: string;
  };
}
```

## Documentation Requirements

1. **Update wrapper docs** with token state schema
2. **Update store docs** with context_info handling
3. **Add UI guide** for token display components
4. **Create migration guide** for existing installations

## Rollout Plan

### Phase 1: Beta (Week 1)
- Deploy to test environment
- Monitor message format compatibility
- Collect performance metrics

### Phase 2: Gradual (Week 2)
- Enable for 10% of users
- Monitor for issues
- Collect feedback

### Phase 3: General (Week 3)
- Enable for all users
- Document best practices
- Optimize based on metrics

## Alternative Approaches Considered

### 1. Separate WebSocket Channel ❌
- **Pros**: Clean separation, no message modification
- **Cons**: Requires frontend changes, sync issues
- **Reason rejected**: Too invasive, breaks existing flow

### 2. Polling Endpoint ❌
- **Pros**: Simple, no stream modification
- **Cons**: Latency, extra requests, not real-time
- **Reason rejected**: Poor UX, inefficient

### 3. Custom Headers ❌
- **Pros**: Out-of-band data
- **Cons**: Not supported in stream-json format
- **Reason rejected**: Technical limitation

### 4. Message Augmentation ✅
- **Pros**: Works with existing flow, no frontend changes needed
- **Cons**: Slightly larger messages
- **Reason selected**: Minimal changes, maximum compatibility

## Conclusion

By augmenting existing messages with token state data, we can provide complete token visibility in yurucode's UI without modifying the frontend store or components. This approach:

1. **Preserves existing functionality** - No breaking changes
2. **Enhances visibility** - Real-time token percentages
3. **Maintains compatibility** - Works with and without wrapper
4. **Minimal integration** - One-line change in wrapper
5. **Rich information** - Complete token state available

The implementation is straightforward, backwards-compatible, and provides immediate value to users by showing exactly how much context they're using and when compaction will occur.
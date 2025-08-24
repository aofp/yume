# Wrapper as Token Truth Source PRD

## Problem Statement

Currently:
- `/compact` returns empty result with 0 tokens
- No visibility into actual conversation summary
- Token counts are scattered and inconsistent
- UI doesn't show accurate token percentage
- No way to know what was compacted

## Solution Architecture

Make the wrapper the **single source of truth** for:
1. **Token counting** - Track every token from every message
2. **Token percentage** - Calculate real usage vs limits
3. **Compact summary** - Generate and inject summaries
4. **Session history** - Keep conversation context

## Core Design

### 1. Token Accumulation Strategy

```javascript
class ClaudeCompactWrapper {
  constructor() {
    this.sessions = new Map();
    // Each session tracks:
    // {
    //   totalInputTokens: 0,
    //   totalOutputTokens: 0,
    //   messages: [],
    //   lastCompactSummary: null,
    //   compactCount: 0,
    //   tokenHistory: []
    // }
  }
  
  processStreamLine(line) {
    const data = JSON.parse(line);
    
    // ALWAYS inject our token state
    data.wrapper_token_state = this.getCompleteTokenState();
    
    // Track tokens from EVERY message type
    if (data.usage) {
      this.accumulateTokens(data.usage);
    }
    
    // Store message content for summary generation
    if (data.type === 'assistant' && data.message?.content) {
      this.storeMessageContent(data.message);
    }
    
    return JSON.stringify(data);
  }
}
```

### 2. Token State Injection

**Every message** gets augmented with:

```javascript
{
  // Original Claude message
  "type": "assistant",
  "message": { /* ... */ },
  
  // ADDED BY WRAPPER - Complete token state
  "wrapper_token_state": {
    // Current session totals
    "session": {
      "input_tokens": 45678,
      "output_tokens": 12345,
      "total_tokens": 58023,
      "message_count": 42
    },
    
    // Usage percentage
    "usage": {
      "current": 58023,
      "max": 100000,
      "percentage": 0.58,  // 58%
      "percentage_display": "58%",
      "tokens_remaining": 41977
    },
    
    // Thresholds
    "thresholds": {
      "warning": 70000,    // 70%
      "critical": 90000,   // 90%
      "compact": 75000,    // 75%
      "will_compact_in": 16977
    },
    
    // Compact info
    "compact": {
      "available": true,
      "recommended": false,
      "last_compact": null,
      "compact_count": 0,
      "total_saved": 0
    },
    
    // Estimates
    "estimates": {
      "avg_message_tokens": 1381,
      "messages_remaining": 30,
      "time_to_limit": "45 minutes"
    }
  }
}
```

### 3. Compact Summary Generation

When `/compact` is detected:

```javascript
generateCompactSummary() {
  const session = this.sessions.get(this.currentSessionId);
  const messages = session.messages;
  
  // Build summary from tracked messages
  const summary = {
    conversation_overview: this.summarizeMessages(messages),
    key_points: this.extractKeyPoints(messages),
    code_blocks: this.extractCodeBlocks(messages),
    decisions: this.extractDecisions(messages),
    context: {
      message_count: messages.length,
      tokens_before: session.totalTokens,
      timestamp: new Date().toISOString()
    }
  };
  
  return summary;
}

// When compact result arrives (empty)
handleCompactResult(data) {
  if (data.result === '' && data.usage?.input_tokens === 0) {
    // Generate our summary
    const summary = this.generateCompactSummary();
    
    // Inject into result
    data.result = this.formatSummaryForDisplay(summary);
    data.wrapper_compact_summary = summary;
    
    // Reset token counts but save history
    const oldTokens = this.sessions.get(this.currentSessionId).totalTokens;
    this.resetSessionTokens();
    
    // Calculate savings
    data.wrapper_token_savings = {
      before: oldTokens,
      after: 0,
      saved: oldTokens,
      percentage: 100
    };
  }
  
  return data;
}
```

### 4. Message Content Tracking

```javascript
storeMessageContent(message) {
  const session = this.sessions.get(this.currentSessionId);
  
  // Store structured content
  session.messages.push({
    timestamp: Date.now(),
    role: message.role,
    content: this.extractContent(message),
    tokens: message.usage || {},
    type: this.detectMessageType(message)
  });
  
  // Keep rolling window (last 100 messages)
  if (session.messages.length > 100) {
    session.messages.shift();
  }
}

extractContent(message) {
  if (message.content) {
    return message.content.map(block => {
      if (block.type === 'text') return block.text;
      if (block.type === 'tool_use') return `[Tool: ${block.name}]`;
      return '[Unknown content]';
    }).join('\n');
  }
  return '';
}
```

### 5. Smart Summary Generation

```javascript
summarizeMessages(messages) {
  // Group by topic/tool use
  const groups = this.groupMessagesByContext(messages);
  
  // Build structured summary
  return {
    topics: groups.map(g => ({
      name: g.topic,
      messages: g.count,
      key_points: g.summary
    })),
    tools_used: this.extractToolUsage(messages),
    code_written: this.countCodeBlocks(messages),
    files_modified: this.extractFileOperations(messages)
  };
}

formatSummaryForDisplay(summary) {
  return `
📊 Conversation Summary (Compacted)

${summary.conversation_overview.topics.map(t => 
  `• ${t.name}: ${t.key_points}`
).join('\n')}

📈 Statistics:
• Messages: ${summary.context.message_count}
• Tokens saved: ${summary.context.tokens_before}
• Tools used: ${summary.conversation_overview.tools_used.join(', ')}
• Code blocks: ${summary.conversation_overview.code_written}

✅ Conversation compacted successfully. Continue normally.
  `.trim();
}
```

## Implementation Plan

### Phase 1: Core Token Tracking (Day 1)

```javascript
// claude-compact-wrapper-v2.js
class ClaudeCompactWrapperV2 extends EventEmitter {
  constructor(config) {
    super();
    this.config = config;
    this.sessions = new Map();
    this.maxTokens = config.maxTokens || 100000;
  }
  
  // Parse EVERY line and accumulate tokens
  processStreamLine(line) {
    try {
      const data = JSON.parse(line);
      
      // Track tokens from any message with usage
      if (data.usage) {
        this.updateTokenCounts(data.usage);
      }
      
      // Store message content
      if (data.type === 'assistant' || data.type === 'user') {
        this.storeMessage(data);
      }
      
      // ALWAYS inject token state
      data.wrapper_token_state = this.getTokenState();
      
      // Handle compact specially
      if (this.isCompactResult(data)) {
        data = this.augmentCompactResult(data);
      }
      
      return JSON.stringify(data);
    } catch (e) {
      return line; // Pass through if not JSON
    }
  }
  
  updateTokenCounts(usage) {
    const session = this.getOrCreateSession();
    
    // Accumulate tokens
    session.totalInputTokens += usage.input_tokens || 0;
    session.totalOutputTokens += usage.output_tokens || 0;
    session.totalCacheTokens += usage.cache_read_input_tokens || 0;
    
    // Calculate total
    session.totalTokens = session.totalInputTokens + session.totalOutputTokens;
    
    // Emit update
    this.emit('tokens-updated', {
      sessionId: this.currentSessionId,
      tokens: session.totalTokens,
      percentage: session.totalTokens / this.maxTokens
    });
  }
}
```

### Phase 2: Summary Generation (Day 2)

```javascript
// Summary generation methods
generateCompactSummary() {
  const session = this.getOrCreateSession();
  const messages = session.messages || [];
  
  // Analyze conversation
  const analysis = {
    userQueries: [],
    assistantResponses: [],
    toolsUsed: new Set(),
    codeBlocks: [],
    decisions: [],
    errors: []
  };
  
  messages.forEach(msg => {
    if (msg.role === 'user') {
      analysis.userQueries.push(msg.content);
    } else if (msg.role === 'assistant') {
      analysis.assistantResponses.push(msg.content);
      
      // Extract tools
      if (msg.tool_uses) {
        msg.tool_uses.forEach(t => analysis.toolsUsed.add(t));
      }
      
      // Extract code
      const codeMatches = msg.content.match(/```[\s\S]*?```/g);
      if (codeMatches) {
        analysis.codeBlocks.push(...codeMatches);
      }
    }
  });
  
  // Build summary
  return {
    overview: `Discussed ${analysis.userQueries.length} topics with ${analysis.assistantResponses.length} responses`,
    main_topics: this.extractTopics(analysis.userQueries),
    tools_used: Array.from(analysis.toolsUsed),
    code_count: analysis.codeBlocks.length,
    key_decisions: analysis.decisions,
    timestamp: new Date().toISOString()
  };
}
```

### Phase 3: Integration (Day 3)

```javascript
// In server-claude-macos.js
import ClaudeCompactWrapperV2 from './scripts/claude-compact-wrapper-v2.js';

const wrapper = new ClaudeCompactWrapperV2({
  maxTokens: 100000,
  enabled: true
});

// Process ALL output through wrapper
rl.on('line', (line) => {
  // Let wrapper process and augment
  const augmentedLine = wrapper.processStreamLine(line);
  const augmentedData = JSON.parse(augmentedLine);
  
  // Extract wrapper token state for UI
  if (augmentedData.wrapper_token_state) {
    // Send token update to UI
    socket.emit(`token-state:${sessionId}`, augmentedData.wrapper_token_state);
  }
  
  // Send augmented message
  socket.emit(`message:${sessionId}`, augmentedData);
});
```

## Message Flow

```
Claude Output → Wrapper Processing → Token Accumulation → State Injection → UI

1. Claude: {"type":"result","usage":{"input_tokens":100}}
                    ↓
2. Wrapper: Accumulate tokens (total += 100)
                    ↓
3. Wrapper: Inject state {"wrapper_token_state":{...}}
                    ↓
4. Server: Forward to UI with token state
                    ↓
5. UI: Display percentage from wrapper_token_state
```

## Success Metrics

| Feature | Measurement |
|---------|------------|
| Token accuracy | Wrapper count matches Claude bill |
| Percentage display | Shows real usage in UI |
| Compact summary | Meaningful summary displayed |
| Token savings | Shows actual tokens saved |
| Performance | <10ms processing overhead |

## Testing Plan

1. **Token accumulation test**
   - Send 10 messages
   - Verify wrapper tracks all tokens
   - Compare with Claude's reported usage

2. **Compact summary test**
   - Have conversation with code
   - Send `/compact`
   - Verify summary includes code blocks

3. **Percentage accuracy test**
   - Accumulate to 50% capacity
   - Verify UI shows 50%
   - Compact and verify reset to ~5%

## Rollout

1. **Phase 1**: Deploy wrapper v2 with token tracking
2. **Phase 2**: Enable summary generation
3. **Phase 3**: Full UI integration with percentages

This makes the wrapper the authoritative source for all token information, solving the visibility problem completely.
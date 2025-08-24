# YURUCODE TODO - Future Improvements & Features

## Priority 1: Critical Fixes & Stability

### 🔴 Session Management Improvements
- [ ] **Persist wasCompacted flag to disk** - Currently only in memory, lost on server restart
- [ ] **Validate claudeSessionId before use** - Add server-side validation before attempting resume
- [ ] **Handle session migration** - When Claude CLI updates, old sessions may become invalid
- [ ] **Add session versioning** - Track which Claude version created each session

### 🔴 Error Recovery
- [ ] **Auto-retry on transient failures** - Network issues, Claude API timeouts
- [ ] **Better error messages** - User-friendly explanations of what went wrong
- [ ] **Recovery suggestions** - Tell users how to fix common issues
- [ ] **Error reporting** - Optional telemetry to track common failures

### 🔴 Memory Management
- [ ] **Fix memory leaks in message buffering** - Buffer can grow unbounded
- [ ] **Implement message pagination** - Don't load entire history at once
- [ ] **Clean up old session data** - Remove sessions older than X days
- [ ] **Optimize localStorage usage** - Currently stores full message history

## Priority 2: Feature Parity with Claudia

### 🟡 Checkpoint System
- [ ] **Implement checkpoint manager** - Like Claudia's checkpoint system
- [ ] **Auto-checkpoint on tool use** - Save state before risky operations
- [ ] **Checkpoint UI** - Visual timeline of checkpoints
- [ ] **Fork from checkpoint** - Create new conversation branch
- [ ] **Checkpoint metadata** - Track what changed at each checkpoint

### 🟡 Session Persistence
- [ ] **Better session storage** - Use SQLite instead of localStorage
- [ ] **Session export/import** - Share conversations between devices
- [ ] **Session search** - Find old conversations by content
- [ ] **Session templates** - Start new sessions with predefined context

### 🟡 UI Improvements
- [ ] **Compact indicator** - Show when session has been compacted
- [ ] **Token usage bar** - Visual indicator of context usage
- [ ] **Auto-compact warning** - Alert before hitting token limits
- [ ] **Compact history** - Show what was removed during compact
- [ ] **Session stats** - Show token savings, cost reduction, etc.

## Priority 3: Performance & Optimization

### 🟢 Streaming Improvements
- [ ] **Better stream parsing** - Handle partial JSON gracefully
- [ ] **Stream buffering optimization** - Reduce memory usage
- [ ] **Parallel message processing** - Handle multiple sessions efficiently
- [ ] **Stream recovery** - Resume interrupted streams

### 🟢 Token Optimization
- [ ] **Smart context pruning** - Remove less relevant messages
- [ ] **Auto-compact triggers** - Based on token usage patterns
- [ ] **Token prediction** - Estimate tokens before sending
- [ ] **Cost optimization** - Suggest when to use Sonnet vs Opus

### 🟢 Caching
- [ ] **Response caching** - Cache Claude responses for common queries
- [ ] **Tool result caching** - Don't re-run same tools
- [ ] **Session state caching** - Faster session switching
- [ ] **Offline mode** - Work with cached data when offline

## Priority 4: Developer Experience

### 🔵 Debugging Tools
- [ ] **Session inspector** - View raw session state
- [ ] **Message debugger** - See exact JSON being sent/received
- [ ] **Performance profiler** - Identify bottlenecks
- [ ] **Network inspector** - Debug WebSocket issues

### 🔵 Testing
- [ ] **Unit tests for server logic** - Especially session management
- [ ] **Integration tests** - Test full message flow
- [ ] **E2E tests** - Automated UI testing
- [ ] **Load testing** - Handle multiple concurrent sessions

### 🔵 Documentation
- [ ] **API documentation** - Document all Tauri commands
- [ ] **Architecture guide** - Explain system design
- [ ] **Troubleshooting guide** - Common issues and solutions
- [ ] **Contributing guide** - How to contribute to yurucode

## Priority 5: Advanced Features

### ⚪ Multi-Model Support
- [ ] **Model switching mid-conversation** - Switch between Opus/Sonnet
- [ ] **Model comparison** - Run same prompt on multiple models
- [ ] **Custom models** - Support for other LLMs
- [ ] **Model routing** - Auto-select model based on task

### ⚪ Collaboration
- [ ] **Shared sessions** - Multiple users in same conversation
- [ ] **Session comments** - Annotate specific messages
- [ ] **Session branching** - Create alternate conversation paths
- [ ] **Team workspaces** - Organize sessions by project/team

### ⚪ Automation
- [ ] **Scheduled messages** - Send messages at specific times
- [ ] **Message templates** - Reusable prompt templates
- [ ] **Batch processing** - Process multiple prompts
- [ ] **Workflow automation** - Chain multiple operations

## Technical Debt

### 🔧 Code Quality
- [ ] **Refactor embedded server** - Extract from logged_server.rs
- [ ] **TypeScript strict mode** - Enable and fix all errors
- [ ] **Consistent error handling** - Standardize across codebase
- [ ] **Remove dead code** - Clean up unused functions

### 🔧 Build System
- [ ] **Optimize bundle size** - Reduce app size
- [ ] **Faster builds** - Improve build times
- [ ] **CI/CD pipeline** - Automated testing and deployment
- [ ] **Cross-platform testing** - Test on all platforms

### 🔧 Security
- [ ] **Input sanitization** - Prevent injection attacks
- [ ] **Secure session storage** - Encrypt sensitive data
- [ ] **API rate limiting** - Prevent abuse
- [ ] **Security audit** - Professional security review

## Bug Fixes from User Reports

### 🐛 Known Issues
- [ ] **Windows path handling** - Issues with spaces in paths
- [ ] **WSL integration** - Claude CLI detection in WSL
- [ ] **Large message handling** - UI freezes with very long messages
- [ ] **Tab switching lag** - Slow when many tabs open
- [ ] **Memory usage** - High memory with long sessions

### 🐛 Edge Cases
- [ ] **Rapid message sending** - Race conditions
- [ ] **Network disconnection** - Handle gracefully
- [ ] **Claude CLI updates** - Detect and handle
- [ ] **System sleep/wake** - Resume connections properly

## Feature Requests from Users

### 💡 Most Requested
- [ ] **Dark/light theme toggle** - Currently only dark
- [ ] **Font size adjustment** - Accessibility
- [ ] **Export to markdown** - Save conversations
- [ ] **Search in conversation** - Find specific messages
- [ ] **Keyboard shortcuts customization** - User preferences

### 💡 Nice to Have
- [ ] **Voice input** - Speech to text
- [ ] **Code syntax highlighting** - Better code display
- [ ] **Image support** - Display images in chat
- [ ] **File attachments** - Attach files to messages
- [ ] **Plugin system** - Extend functionality

## Implementation Notes

### For Compact Fix V2
The current fix uses a `wasCompacted` flag to track compacted sessions. This works but could be improved:
1. Persist flag to disk (currently memory only)
2. Add timestamp of when compacted
3. Track compact count (how many times compacted)
4. Store compact history (what was removed)

### For Session Management
Current session management mixes concerns. Should separate:
1. Session state (messages, analytics)
2. Claude state (claudeSessionId, streaming)
3. UI state (drafts, selections)
4. Persistence state (saved to disk)

### For Performance
Main bottlenecks identified:
1. Message parsing (JSON.parse on large strings)
2. localStorage operations (synchronous)
3. Message rendering (React re-renders)
4. WebSocket overhead (could batch messages)

## Priority Matrix

```
Impact vs Effort:
High Impact + Low Effort = Do First (🔴)
High Impact + High Effort = Plan Carefully (🟡)
Low Impact + Low Effort = Quick Wins (🟢)
Low Impact + High Effort = Maybe Later (⚪)
```

## Next Steps

1. **Fix wasCompacted persistence** - Critical for reliability
2. **Add session validation** - Prevent invalid resume attempts
3. **Implement basic checkpoints** - User safety net
4. **Improve error messages** - Better user experience
5. **Add token usage visualization** - User awareness

## Contributing

If you want to help with any of these items:
1. Check if issue exists in GitHub
2. Comment that you're working on it
3. Create feature branch
4. Submit PR with tests
5. Update documentation

## Version Goals

### v1.1.0 (Current + Fixes)
- ✅ Compact fix
- ✅ Session persistence
- [ ] wasCompacted persistence
- [ ] Better error handling

### v1.2.0 (Stability)
- [ ] Checkpoint system basics
- [ ] Session validation
- [ ] Memory management
- [ ] Error recovery

### v1.3.0 (Features)
- [ ] Token visualization
- [ ] Auto-compact
- [ ] Session search
- [ ] Export/import

### v2.0.0 (Major Update)
- [ ] SQLite storage
- [ ] Multi-model support
- [ ] Collaboration features
- [ ] Plugin system

---
*Last updated: 2024-12-23*
*Contributors: Claude (Opus 4.1)*
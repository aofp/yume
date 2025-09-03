# Better Session Recovery Approach

## Current Issues with Our Implementation
1. Complex context reconstruction logic
2. Potential for context truncation errors
3. Limited to 10 messages of context
4. May exceed token limits with long conversations

## Recommended Approach: Hybrid Solution

### 1. Use CLAUDE.md for Persistent Context
When a session fails to resume, automatically create/update a CLAUDE.md file:

```javascript
// When "No conversation found" error occurs
function createSessionContext(session) {
  const claudeMd = `# Session Context Recovery

## Previous Conversation Summary
${generateSummary(session.messages)}

## Key Points Discussed
${extractKeyPoints(session.messages)}

## Current Task
${getCurrentTask(session.messages)}

## Important Context
${extractImportantContext(session.messages)}
`;
  
  // Save to project directory
  fs.writeFileSync(path.join(workingDir, 'CLAUDE.md'), claudeMd);
}
```

### 2. Simplified Message on Resume Failure
Instead of complex context reconstruction:

```javascript
// When session resume fails
if (line.includes('No conversation found')) {
  // Save context to CLAUDE.md
  saveSessionContext(session);
  
  // Clear invalid session ID
  session.claudeSessionId = null;
  
  // Send simple message
  const resumeMessage = "I've saved our conversation context. Please continue where we left off.";
  
  // Let Claude read CLAUDE.md naturally
}
```

### 3. Benefits of This Approach

**Simpler Implementation:**
- No complex message reconstruction
- No substring/array handling issues
- No token limit concerns

**Better Context Preservation:**
- CLAUDE.md persists across sessions
- Claude automatically reads it
- Can include project-specific context

**More Reliable:**
- Works with Claude's native behavior
- No special message formatting needed
- Handles all content types

### 4. Implementation Steps

1. **Detect Resume Failure**
   ```javascript
   if (error.includes('No conversation found')) {
     session.needsContextSave = true;
   }
   ```

2. **Save Context to CLAUDE.md**
   ```javascript
   function saveContextToClaude(messages, workingDir) {
     const summary = summarizeConversation(messages);
     const claudeMd = formatClaudeMd(summary);
     fs.writeFileSync(path.join(workingDir, 'CLAUDE.md'), claudeMd);
   }
   ```

3. **Continue Normally**
   - Don't use --resume flag
   - Let Claude read CLAUDE.md
   - Start fresh session with context

### 5. Example CLAUDE.md Format

```markdown
# Project Context

## Session Recovery
This session was recovered from a previous conversation that could not be resumed.

## Previous Discussion
- User was working on [specific feature]
- We implemented [specific solution]
- Current issue: [current problem]

## Key Decisions
- Architecture: [decision]
- Approach: [approach]

## Next Steps
- [ ] Complete [task]
- [ ] Test [feature]
```

## Conclusion

This approach is:
- **Simpler**: Less code, fewer edge cases
- **More robust**: Uses Claude's native context system
- **Persistent**: Context survives beyond session
- **Maintainable**: Easy to understand and modify

Instead of trying to reconstruct messages, we leverage Claude's built-in ability to read project context from CLAUDE.md files.
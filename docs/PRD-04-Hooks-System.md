# PRD-04: Hooks System for yurucode

## Executive Summary
Implement a minimal yet powerful hooks system for yurucode that allows users to execute custom scripts at various points in the Claude CLI interaction lifecycle. Inspired by cc-sessions' approach to "authoritarian control" over AI behavior, this system will enable workflow automation, validation, and customization while maintaining yurucode's minimal OLED aesthetic.

## Problem Statement
Currently, yurucode lacks the ability to:
- Intercept and validate Claude's actions before execution
- Automate repetitive tasks during sessions
- Enforce coding standards and patterns
- Manage context and session state programmatically
- Prevent undesired AI behaviors (like premature implementation)

## Goals
1. **Primary**: Enable custom script execution at key interaction points
2. **Secondary**: Provide granular control over Claude's tool usage
3. **Tertiary**: Support workflow automation and validation

## Non-Goals
- Complex hook chaining or dependencies
- Built-in hook marketplace or sharing system
- Visual hook editor (scripts only)
- Hook persistence across app updates

## User Stories

### As a Developer
- I want to validate bash commands before execution
- I want to auto-commit changes after successful edits
- I want to enforce branch naming conventions
- I want to prevent file edits on protected branches
- I want to log all tool usage for auditing

### As a Team Lead
- I want to enforce code review requirements
- I want to track AI-generated code metrics
- I want to ensure compliance with coding standards
- I want to prevent sensitive data exposure

## Technical Design

### Hook Events
```typescript
enum HookEvent {
  UserPromptSubmit = 'user_prompt_submit',    // Before sending to Claude
  PreToolUse = 'pre_tool_use',               // Before tool execution
  PostToolUse = 'post_tool_use',             // After tool success
  AssistantResponse = 'assistant_response',   // After Claude responds
  SessionStart = 'session_start',            // Session begins
  SessionEnd = 'session_end',                // Session terminates
  ContextWarning = 'context_warning',        // 75% context used
  Error = 'error'                            // On any error
}
```

### Hook Configuration Structure
```typescript
interface HookConfig {
  event: HookEvent;
  enabled: boolean;
  script: string;           // Bash/Python/Node script
  timeout?: number;         // Default: 5000ms
  blocking?: boolean;       // Can block operation
  matcher?: string;         // Regex for tool matching
}
```

### Data Flow
1. **Event Trigger** → yurucode detects hook event
2. **Script Execution** → Pass JSON data via stdin
3. **Response Handling** → Process exit code and stdout
4. **Action Decision** → Continue, block, or modify

### Hook Input Schema
```json
{
  "event": "pre_tool_use",
  "timestamp": 1234567890,
  "sessionId": "abc-123",
  "data": {
    "tool": "Edit",
    "input": { /* tool specific */ },
    "context": { /* session context */ }
  }
}
```

### Hook Response Schema
```json
{
  "action": "continue|block|modify",
  "message": "Optional message to user",
  "modifications": { /* optional data changes */ },
  "exitCode": 0
}
```

## Implementation Plan

### Phase 1: Core Infrastructure (Week 1)
- [ ] Hook execution engine in Rust
- [ ] JSON data serialization/deserialization
- [ ] Process spawning with timeout
- [ ] Error handling and logging

### Phase 2: Event Integration (Week 1)
- [ ] Intercept Claude CLI events
- [ ] Hook event dispatching
- [ ] Response processing
- [ ] Blocking/non-blocking execution

### Phase 3: UI Integration (Week 2)
- [ ] Hooks tab in settings (already exists)
- [ ] Enable/disable toggles
- [ ] Script editor with syntax highlighting
- [ ] Test execution button

### Phase 4: Built-in Hooks (Week 2)
- [ ] Bash command validator
- [ ] Git branch protector
- [ ] Context monitor
- [ ] Auto-save trigger

## Success Metrics
- **Adoption**: 30% of users enable at least one hook
- **Reliability**: <1% hook execution failures
- **Performance**: <100ms overhead per hook
- **Satisfaction**: 4.5+ user rating

## Risk Mitigation

### Security Risks
- **Risk**: Arbitrary code execution
- **Mitigation**: Sandboxing, user warnings, script validation

### Performance Risks
- **Risk**: Slow hooks blocking UI
- **Mitigation**: Timeouts, async execution, progress indicators

### Compatibility Risks
- **Risk**: Breaking changes with Claude CLI updates
- **Mitigation**: Version detection, graceful degradation

## Example Hooks

### 1. Prevent Premature Implementation
```bash
#!/bin/bash
# pre_tool_use hook
tool=$(echo "$1" | jq -r '.data.tool')
if [[ "$tool" == "Write" || "$tool" == "Edit" ]]; then
  echo '{"action":"block","message":"Please discuss changes before implementing"}'
  exit 2
fi
echo '{"action":"continue"}'
```

### 2. Auto-commit After Edits
```bash
#!/bin/bash
# post_tool_use hook
tool=$(echo "$1" | jq -r '.data.tool')
if [[ "$tool" == "Edit" || "$tool" == "Write" ]]; then
  git add -A && git commit -m "Auto-commit: AI changes"
fi
echo '{"action":"continue"}'
```

### 3. Context Warning
```python
#!/usr/bin/env python3
# context_warning hook
import json
import sys

data = json.loads(sys.stdin.read())
usage = data['data']['contextUsage']

if usage > 0.9:
    print(json.dumps({
        "action": "block",
        "message": "Context at 90%! Consider using /compact"
    }))
    sys.exit(2)

print(json.dumps({"action": "continue"}))
```

## UI/UX Considerations

### Hooks Settings Tab
```
[✓] User Prompt Submit    [Edit Script]
    └─ validate_prompt.sh
    
[✓] Pre Tool Use          [Edit Script]
    └─ check_permissions.py
    
[ ] Post Tool Use         [Edit Script]
    └─ (no script)
    
[✓] Context Warning       [Edit Script]
    └─ alert_context.sh
```

### Script Editor
- Monospace font (Fira Code)
- Basic syntax highlighting
- Line numbers
- Test execution with sample data
- Error output display

## Testing Strategy
1. **Unit Tests**: Hook execution engine
2. **Integration Tests**: Event interception
3. **E2E Tests**: Full hook lifecycle
4. **Security Tests**: Script injection prevention
5. **Performance Tests**: Overhead measurement

## Documentation Requirements
- Hook event reference
- Script writing guide
- Example hooks library
- Security best practices
- Troubleshooting guide

## Timeline
- **Week 1**: Core infrastructure + Event integration
- **Week 2**: UI integration + Built-in hooks
- **Week 3**: Testing + Documentation
- **Week 4**: Beta release + Feedback

## Dependencies
- Claude CLI must support event interception
- Rust async runtime for non-blocking execution
- Script execution permissions on all platforms
- JSON parsing libraries

## Open Questions
1. Should hooks have access to file system?
2. Should we support hook chaining?
3. Should hooks be shareable between users?
4. Should we provide a hooks marketplace?

## Acceptance Criteria
- [ ] Users can enable/disable individual hooks
- [ ] Scripts execute within timeout limits
- [ ] Hooks can block tool execution
- [ ] Error handling prevents crashes
- [ ] Performance overhead < 100ms
- [ ] Works on macOS, Windows, Linux
- [ ] Maintains minimal UI aesthetic
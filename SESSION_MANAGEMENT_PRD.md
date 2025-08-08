# Claude Code Studio - Session Management PRD

## Core Architecture

### Session Lifecycle
1. **Session Creation**
   - Generate unique hex ID (6 chars): `session 4a8f2c`
   - Associate with working directory (project folder)
   - Initialize Claude Code SDK query stream
   - Store in both claudeCodeStore and useStore

2. **Session States**
   - `active`: Currently selected, receiving messages
   - `streaming`: Actively processing Claude response
   - `idle`: Session exists but not selected
   - `paused`: Temporarily suspended (preserve context)
   - `completed`: Finished with result

3. **Multi-Project Support**
   - Each session tied to ONE directory
   - Directory displayed in session tab
   - Switching sessions = switching project context
   - Server restarts with new CWD for each session

## Data Flow

### Message Pipeline
```
User Input → claudeCodeStore.sendMessage() 
          → claudeCodeClient.sendMessage() 
          → Socket.IO to server
          → server.js runs query() with session CWD
          → Streaming messages via Socket.IO
          → claudeCodeStore updates via onMessage listener
          → React components re-render
```

### Session Synchronization
- **Primary Store**: `claudeCodeStore` (SDK integration)
- **UI Store**: `useStore` (UI state, tabs)
- **Server**: Maintains session map with CWD
- **Socket**: Per-session message channels

## Implementation Details

### 1. Session Tab Component
```typescript
interface SessionTab {
  id: string           // session-4a8f2c
  name: string         // "session 4a8f2c"
  directory: string    // "/Users/project1"
  isActive: boolean
  isStreaming: boolean
  messageCount: number
}
```

### 2. Directory Management
- Store `workingDirectory` per session
- Display folder name in tab (last path segment)
- Pass CWD to server on message send
- Server uses `process.chdir()` before query

### 3. Message Deduplication
- Track message IDs: `${sessionId}-${timestamp}-${counter}`
- Check for existing ID before adding to store
- Replace streaming messages with final version
- Prevent duplicate tool results

### 4. UI Updates on Session Change
```typescript
// When switching sessions:
1. Update currentSessionId in both stores
2. Clear streaming state
3. Load session messages
4. Update folder selector display
5. Notify server of CWD change
```

### 5. Streaming State Management
- Show typing indicator per session
- Update message content incrementally
- Handle tool_use without displaying JSON
- Show concise tool results

## Claude Code Event Types & Display

### Message Type Handling

#### 1. `system` (type: "init")
- **Display**: Subtle initialization line with directory
- **Style**: Faded gray, small font
- **Animation**: Fade in from opacity 0
- **Example**: "⚡ /Users/project"

#### 2. `user` 
- **Display**: Right-aligned message bubble
- **Style**: Dark gray background, white text
- **Animation**: Slide in from right
- **Progress**: Show "Sending..." briefly

#### 3. `assistant` (streaming)
- **Display**: Left-aligned, progressive text reveal
- **Content Types**:
  - `text`: Display as markdown
  - `tool_use`: Inline tool badge with operation
  - `tool_result`: Only show errors or success confirmations
- **Animation**: Text appears character by character
- **Progress**: Pulsing dot indicator

#### 4. `result` 
- **Subtypes**:
  - `success`: Subtle stats line (turns • time • cost)
  - `error_max_turns`: Warning with retry option
  - `error_during_execution`: Red error message
- **Animation**: Fade and scale in
- **Progress**: None (final state)

### Tool Display Minimalism

```typescript
interface ToolDisplay {
  Read: "📖 filename"           // Just show file being read
  Write: "✏️ filename"          // Show file written
  Edit: "✂️ filename:line"      // Show edit location  
  Bash: "$ command"             // Show command only
  TodoWrite: "📝 n tasks"       // Show task count
  WebSearch: "🔍 query"         // Show search query
  // Hide verbose outputs, only show operations
}
```

### Animation Specifications

#### Transitions
- **Session switch**: 200ms crossfade
- **Message appear**: 150ms fade + slide
- **Tool badge**: 100ms scale in
- **Streaming text**: 16ms per character
- **Tab hover**: 150ms color transition

#### Progress Indicators
1. **Sending**: Input field border pulses magenta
2. **Streaming**: Assistant message has breathing dot
3. **Tool execution**: Tool badge rotates subtly
4. **Session loading**: Tab has shimmer effect

## UI Components

### Ultra-Minimal Layout
```
┌─────────────────────────────────────────┐
│ [session 4a8f2c] [session 9b3d1e] [+]  │ <- Session tabs (top)
├─────────────────────────────────────────┤
│                                         │
│         Chat Messages Area              │ <- Main content
│                                         │
├─────────────────────────────────────────┤
│ [Input field.........................]  │ <- Message input
└─────────────────────────────────────────┘
```

### Session Tab Features
- Click to switch
- Show folder icon + name
- Red dot for streaming
- X button to close
- + button for new session

## Server Changes

### Per-Session State
```javascript
sessions.set(sessionId, {
  id: sessionId,
  name: name,
  socketId: socket.id,
  workingDirectory: cwd,  // NEW
  messages: [],
  messageIds: new Set(),
  queryActive: false       // NEW
});
```

### Directory Switching
```javascript
// Before each query:
const session = sessions.get(sessionId);
if (session.workingDirectory) {
  process.chdir(session.workingDirectory);
}
```

## Visual Design System

### Color Palette
```css
--black: #000000          // Pure black background
--dark: #0a0a0a           // Slightly lighter black
--surface: #141414        // Surface elements
--border: #1a1a1a         // Subtle borders

--red-pastel: #ff9999     // Primary accent
--magenta-pastel: #ff99cc // Secondary accent
--pink-pastel: #ffb3d9    // Tertiary accent

--text-primary: #ffffff   // Main text
--text-secondary: #888888 // Secondary text
--text-dim: #444444       // Dimmed text
```

### Typography
- **Font**: SF Mono, Monaco, Consolas
- **Sizes**: 11px (small), 13px (normal), 15px (large)
- **Line height**: 1.5
- **Letter spacing**: 0.02em

### Spacing System
- **Unit**: 4px base
- **Padding**: 8px, 12px, 16px
- **Margins**: 4px, 8px, 16px
- **Border radius**: 4px (small), 8px (medium)

## Store Integration

### claudeCodeStore
- Manages SDK communication
- Handles streaming updates
- Deduplicates messages
- Notifies UI of changes

### useStore  
- Manages UI state
- Session tab selection
- NOT duplicating messages
- References claudeCodeStore for data

## Error Handling

1. **Session Not Found**: Create new session automatically
2. **Directory Access Denied**: Show error, use default CWD
3. **Streaming Interruption**: Mark session as idle
4. **Duplicate Messages**: Filter by ID before display
5. **Socket Disconnect**: Queue messages, retry on reconnect

## Performance

- Lazy load session messages
- Virtual scroll for long conversations
- Debounce streaming updates (16ms)
- Clean up old streaming messages
- Limit session history (last 100 messages)

## Session & Directory Management

### Session Creation Flow
1. User clicks + button
2. Folder picker opens (Electron) or uses current directory
3. Generate hex ID: `4a8f2c`
4. Create session with name: `session 4a8f2c`
5. Associate directory with session
6. Server stores CWD per session
7. Tab appears with subtle fade-in animation

### Directory Switching
- Each session maintains its own CWD
- Server changes directory before each query
- Directory shown as tooltip on tab hover
- Folder icon indicates project context

### Message Flow Architecture
```
User types → Input validates → Send button activates
          → Create user message → Add to session
          → Socket emit to server → Server changes CWD
          → Query Claude Code SDK → Stream responses
          → Parse message types → Update UI smoothly
          → Show completion stats → Ready for next
```

## Implementation Checklist

### Core Features
- [ ] Session tabs with hex IDs
- [ ] Per-session directory support
- [ ] Smooth tab switching animations
- [ ] Message type parsing and display
- [ ] Tool operation minimalism
- [ ] Streaming text animation
- [ ] Progress indicators
- [ ] Error handling with retry
- [ ] Session persistence
- [ ] Multi-project context

### UI Polish
- [ ] Black background throughout
- [ ] Pastel red/magenta accents
- [ ] Smooth 60fps animations
- [ ] Minimal tool output display
- [ ] Character-by-character streaming
- [ ] Breathing/pulsing indicators
- [ ] Subtle hover effects
- [ ] Clean typography

## Testing Scenarios

1. Create 3 sessions with different directories
2. Switch between sessions rapidly
3. Send messages to non-active session
4. Close session while streaming
5. Reload page with active sessions
6. Open same directory in multiple sessions

## Success Metrics

- Session switches < 50ms
- Zero duplicate messages
- Streaming appears smooth
- Directory context preserved
- No memory leaks with many sessions
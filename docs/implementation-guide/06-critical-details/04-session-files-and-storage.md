# Claude Session Files and Storage - Complete Documentation

## Session Storage Location

Claude stores all session data in the user's home directory:

```
~/.claude/
├── settings.json                 # Global Claude settings
├── memories/                     # Claude memories
│   └── *.json                   # Individual memory files
└── projects/                    # Project sessions
    └── -Users-name-project/    # Encoded project path
        ├── abc123...xyz.jsonl   # Session file (26 char ID)
        ├── def456...uvw.jsonl   # Another session
        └── todo.jsonl           # Todo lists (if enabled)
```

## Session ID Format

### Valid Session ID Pattern
```regex
^[a-zA-Z0-9]{26}$

Examples:
- abcdef1234567890ABCDEF1234
- x9y8z7w6v5u4t3s2r1q0p9o8n7
- AAAABBBBCCCCDDDDEEEEFFFFGG
```

### Session ID Extraction from Init Message
```json
{
  "type": "system",
  "subtype": "init",
  "session_id": "abcdef1234567890ABCDEF1234",
  "model": "claude-3-5-sonnet-20241022",
  "timestamp": "2025-01-23T10:30:00Z"
}
```

## JSONL File Structure

Each session is stored as a JSONL (JSON Lines) file where each line is a complete JSON object:

### Line 1: Session Metadata
```json
{
  "type": "metadata",
  "cwd": "/Users/name/project",
  "user": "name",
  "timestamp": "2025-01-23T10:30:00Z",
  "model": "claude-3-5-sonnet-20241022",
  "session_id": "abcdef1234567890ABCDEF1234"
}
```

### Line 2+: Messages
```json
{"type": "message", "role": "user", "content": "Hello Claude", "timestamp": "2025-01-23T10:30:01Z"}
{"type": "message", "role": "assistant", "content": "Hello! How can I help?", "timestamp": "2025-01-23T10:30:02Z"}
{"type": "message", "role": "user", "content": "Write a function", "timestamp": "2025-01-23T10:30:03Z"}
{"type": "message", "role": "assistant", "content": "Here's a function...", "timestamp": "2025-01-23T10:30:04Z"}
```

### Special Lines: Tool Use
```json
{
  "type": "tool_use",
  "tool": "str_replace_editor",
  "arguments": {
    "command": "create",
    "path": "main.py",
    "file_text": "def hello():\n    print('Hello')"
  },
  "timestamp": "2025-01-23T10:30:05Z"
}
```

### Token Usage Lines
```json
{
  "type": "usage",
  "input_tokens": 1234,
  "output_tokens": 567,
  "cache_creation_tokens": 89,
  "cache_read_tokens": 45,
  "timestamp": "2025-01-23T10:30:06Z"
}
```

## Project Path Encoding

### How Paths Are Encoded
```javascript
// Original path
/Users/name/my-project

// Encoded (slashes become hyphens)
-Users-name-my-project

// Problem: Ambiguous with hyphens in original
/Users/name/my-project  → -Users-name-my-project
/Users/name/my/project  → -Users-name-my-project  // Same encoding!
```

### Correct Way to Get Project Path
```rust
// DON'T decode from directory name (ambiguous)
fn decode_project_path(encoded: &str) -> String {
    encoded.replace('-', "/")  // WRONG - Can't distinguish hyphens
}

// DO read from first JSONL line
fn get_project_path(session_file: &Path) -> Result<String> {
    let file = File::open(session_file)?;
    let reader = BufReader::new(file);
    
    if let Some(Ok(first_line)) = reader.lines().next() {
        let json: Value = serde_json::from_str(&first_line)?;
        if let Some(cwd) = json["cwd"].as_str() {
            return Ok(cwd.to_string());
        }
    }
    
    Err("Could not find project path")
}
```

## Reading Session Files

### Rust Implementation
```rust
use std::fs::File;
use std::io::{BufRead, BufReader};
use serde_json::Value;

pub struct SessionReader {
    path: PathBuf,
    messages: Vec<Message>,
}

impl SessionReader {
    pub fn read_session(session_file: &Path) -> Result<Self> {
        let file = File::open(session_file)?;
        let reader = BufReader::new(file);
        let mut messages = Vec::new();
        let mut metadata = None;
        
        for line in reader.lines() {
            let line = line?;
            if line.trim().is_empty() {
                continue;
            }
            
            let json: Value = serde_json::from_str(&line)?;
            
            match json["type"].as_str() {
                Some("metadata") => {
                    metadata = Some(SessionMetadata {
                        cwd: json["cwd"].as_str().unwrap_or("").to_string(),
                        user: json["user"].as_str().unwrap_or("").to_string(),
                        timestamp: json["timestamp"].as_str().unwrap_or("").to_string(),
                        model: json["model"].as_str().unwrap_or("").to_string(),
                        session_id: json["session_id"].as_str().unwrap_or("").to_string(),
                    });
                }
                Some("message") => {
                    messages.push(Message {
                        role: json["role"].as_str().unwrap_or("").to_string(),
                        content: json["content"].as_str().unwrap_or("").to_string(),
                        timestamp: json["timestamp"].as_str().unwrap_or("").to_string(),
                    });
                }
                Some("tool_use") => {
                    // Handle tool use
                }
                Some("usage") => {
                    // Track token usage
                }
                _ => {
                    // Unknown type, skip
                }
            }
        }
        
        Ok(Self {
            path: session_file.to_path_buf(),
            messages,
        })
    }
}
```

### JavaScript Implementation
```javascript
const fs = require('fs');
const readline = require('readline');

async function readSession(sessionFile) {
    const messages = [];
    let metadata = null;
    
    const fileStream = fs.createReadStream(sessionFile);
    const rl = readline.createInterface({
        input: fileStream,
        crlfDelay: Infinity
    });
    
    for await (const line of rl) {
        if (!line.trim()) continue;
        
        try {
            const json = JSON.parse(line);
            
            switch (json.type) {
                case 'metadata':
                    metadata = {
                        cwd: json.cwd,
                        user: json.user,
                        timestamp: json.timestamp,
                        model: json.model,
                        sessionId: json.session_id
                    };
                    break;
                    
                case 'message':
                    messages.push({
                        role: json.role,
                        content: json.content,
                        timestamp: json.timestamp
                    });
                    break;
                    
                case 'tool_use':
                    // Handle tool use
                    break;
                    
                case 'usage':
                    // Track tokens
                    break;
            }
        } catch (e) {
            console.error('Failed to parse line:', e);
        }
    }
    
    return { metadata, messages };
}
```

## Finding Sessions

### List All Projects
```rust
fn list_projects() -> Result<Vec<Project>> {
    let claude_dir = dirs::home_dir()
        .ok_or("No home directory")?
        .join(".claude")
        .join("projects");
    
    let mut projects = Vec::new();
    
    for entry in fs::read_dir(claude_dir)? {
        let entry = entry?;
        let path = entry.path();
        
        if path.is_dir() {
            let project_name = path.file_name()
                .and_then(|n| n.to_str())
                .unwrap_or("");
            
            // Get actual path from first session file
            let actual_path = get_project_path_from_sessions(&path)?;
            
            projects.push(Project {
                encoded_name: project_name.to_string(),
                actual_path,
                sessions: list_sessions(&path)?,
            });
        }
    }
    
    Ok(projects)
}
```

### Find Sessions for Project
```rust
fn find_project_sessions(project_path: &str) -> Result<Vec<String>> {
    let claude_dir = dirs::home_dir()
        .ok_or("No home directory")?
        .join(".claude")
        .join("projects");
    
    // Try to find project directory
    for entry in fs::read_dir(claude_dir)? {
        let entry = entry?;
        let path = entry.path();
        
        if path.is_dir() {
            // Check if this is the right project
            if let Ok(actual_path) = get_project_path_from_sessions(&path) {
                if actual_path == project_path {
                    return list_sessions(&path);
                }
            }
        }
    }
    
    Ok(Vec::new())
}

fn list_sessions(project_dir: &Path) -> Result<Vec<String>> {
    let mut sessions = Vec::new();
    
    for entry in fs::read_dir(project_dir)? {
        let entry = entry?;
        let path = entry.path();
        
        if path.extension().and_then(|e| e.to_str()) == Some("jsonl") {
            let filename = path.file_stem()
                .and_then(|n| n.to_str())
                .unwrap_or("");
            
            // Skip todo.jsonl
            if filename != "todo" && filename.len() == 26 {
                sessions.push(filename.to_string());
            }
        }
    }
    
    sessions.sort_by(|a, b| {
        // Sort by modification time
        let a_path = project_dir.join(format!("{}.jsonl", a));
        let b_path = project_dir.join(format!("{}.jsonl", b));
        
        let a_time = fs::metadata(&a_path)
            .and_then(|m| m.modified())
            .unwrap_or(SystemTime::UNIX_EPOCH);
        let b_time = fs::metadata(&b_path)
            .and_then(|m| m.modified())
            .unwrap_or(SystemTime::UNIX_EPOCH);
        
        b_time.cmp(&a_time) // Most recent first
    });
    
    Ok(sessions)
}
```

## Session File Locking

Claude uses file locking to prevent concurrent access:

### Check if Session is Locked
```rust
use fs2::FileExt;

fn is_session_locked(session_file: &Path) -> bool {
    if let Ok(file) = File::open(session_file) {
        // Try to acquire exclusive lock
        match file.try_lock_exclusive() {
            Ok(_) => {
                // Got lock, session not in use
                let _ = file.unlock();
                false
            }
            Err(_) => {
                // Couldn't get lock, session in use
                true
            }
        }
    } else {
        false
    }
}
```

## Todo File Structure

The `todo.jsonl` file in each project directory:

```json
{"type": "todo", "id": "1", "text": "Implement user authentication", "completed": false, "created": "2025-01-23T10:30:00Z"}
{"type": "todo", "id": "2", "text": "Add database migrations", "completed": true, "created": "2025-01-23T10:31:00Z"}
{"type": "todo", "id": "3", "text": "Write unit tests", "completed": false, "created": "2025-01-23T10:32:00Z"}
```

## Settings File Structure

`~/.claude/settings.json`:

```json
{
  "model": "claude-3-5-sonnet-20241022",
  "temperature": 0.7,
  "max_tokens": 4096,
  "system_prompt": "You are a helpful assistant",
  "features": {
    "todo_lists": true,
    "memories": true,
    "checkpoints": false
  },
  "ui": {
    "theme": "dark",
    "font_size": 14,
    "show_tokens": true
  }
}
```

## Memory Files

`~/.claude/memories/*.json`:

```json
{
  "id": "mem_abc123",
  "content": "User prefers TypeScript over JavaScript",
  "created": "2025-01-23T10:30:00Z",
  "updated": "2025-01-23T10:30:00Z",
  "tags": ["preferences", "programming"],
  "projects": ["/Users/name/project1", "/Users/name/project2"]
}
```

## File Size Considerations

### Typical Session Sizes
- New session: ~1KB
- After 1 hour: ~50-100KB
- After 8 hours: ~500KB-1MB
- Very long session: 5-10MB

### When to Start New Session
```rust
fn should_start_new_session(session_file: &Path) -> bool {
    if let Ok(metadata) = fs::metadata(session_file) {
        let size = metadata.len();
        
        // Start new session if > 10MB
        if size > 10 * 1024 * 1024 {
            return true;
        }
        
        // Or if older than 24 hours
        if let Ok(modified) = metadata.modified() {
            let age = SystemTime::now()
                .duration_since(modified)
                .unwrap_or(Duration::ZERO);
            
            if age > Duration::from_secs(24 * 3600) {
                return true;
            }
        }
    }
    
    false
}
```

## Cleaning Up Old Sessions

```rust
fn cleanup_old_sessions(days: u64) -> Result<usize> {
    let claude_dir = dirs::home_dir()
        .ok_or("No home directory")?
        .join(".claude")
        .join("projects");
    
    let cutoff = SystemTime::now() - Duration::from_secs(days * 24 * 3600);
    let mut deleted = 0;
    
    for entry in WalkDir::new(claude_dir) {
        let entry = entry?;
        let path = entry.path();
        
        if path.extension().and_then(|e| e.to_str()) == Some("jsonl") {
            if let Ok(metadata) = fs::metadata(path) {
                if let Ok(modified) = metadata.modified() {
                    if modified < cutoff {
                        fs::remove_file(path)?;
                        deleted += 1;
                    }
                }
            }
        }
    }
    
    Ok(deleted)
}
```

## Important Notes

1. **Never modify JSONL files while Claude is using them** - Will corrupt the session
2. **Session IDs are globally unique** - Can resume from any directory
3. **Project directories are created automatically** - First session creates the directory
4. **Sessions persist across Claude updates** - Format is stable
5. **No automatic cleanup** - Sessions accumulate over time
6. **File locking prevents corruption** - Check locks before reading/writing

## Debugging Session Issues

### Verify Session File Integrity
```bash
# Check if JSONL is valid
cat ~/.claude/projects/*/SESSION_ID.jsonl | jq -s '.'

# Find corrupt lines
cat SESSION_ID.jsonl | while read line; do
  echo "$line" | jq '.' > /dev/null || echo "Invalid: $line"
done

# Count messages in session
cat SESSION_ID.jsonl | grep '"type":"message"' | wc -l

# Get session metadata
head -1 SESSION_ID.jsonl | jq '.'
```

### Common Session Problems

1. **"Session not found"** - Check exact 26-character ID
2. **"Session corrupted"** - JSONL has invalid JSON lines
3. **"Session locked"** - Another Claude process using it
4. **"Session too large"** - File > 10MB, start new session
5. **"Wrong project"** - Session created in different directory

This complete documentation covers all aspects of Claude's session storage system.
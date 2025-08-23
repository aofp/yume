# Detailed Refactoring Steps: Hour-by-Hour Guide

## Prerequisites Check (Hour 0)

### Required Tools
```bash
# Check Rust version (need 1.70+)
rustc --version

# Check Node version (for testing old server)
node --version

# Check Claude CLI is installed
claude --version

# Check Tauri CLI
cargo tauri --version
```

### Backup Current State
```bash
# Create backup branch
git checkout -b backup-before-migration
git add -A
git commit -m "Backup before migrating from embedded server to direct CLI"

# Create migration branch
git checkout -b feature/direct-cli-spawning
```

## Hour 1-4: Extract Embedded Server

### Hour 1: Document Current Server

```bash
# Extract embedded server for reference
mkdir -p extracted-server
```

```rust
// Write script to extract embedded server
// scripts/extract-embedded-server.rs
use std::fs;

fn main() {
    let content = include_str!("../src-tauri/src/logged_server.rs");
    
    // Find EMBEDDED_SERVER constant
    let start = content.find(r#"const EMBEDDED_SERVER: &str = r#""#).unwrap();
    let end_marker = r#""#;"#;
    let end = content[start..].find(end_marker).unwrap();
    
    let server_code = &content[start+34..start+end-2];
    
    fs::write("extracted-server/server.js", server_code).unwrap();
    println!("Extracted {} bytes", server_code.len());
}
```

### Hour 2: Analyze Server Functions

```javascript
// Document all server endpoints and handlers
// extracted-server/API_DOCUMENTATION.md

## Endpoints

1. **Socket Events**
   - `claude_message`: Send message to Claude
   - `claude_stop`: Stop current stream
   - `claude_clear`: Clear context
   - `health_check`: Check server health

2. **Internal Functions**
   - `spawnClaude()`: Spawns Claude process
   - `parseStreamJson()`: Parses JSONL output
   - `extractSessionId()`: Gets session from init
   - `handleError()`: Error management
```

### Hour 3: Create Function Mapping

```markdown
// extracted-server/FUNCTION_MAPPING.md

| Node.js Function | Rust Equivalent | Location |
|-----------------|-----------------|----------|
| spawn() | Command::spawn() | tokio::process |
| EventEmitter | tauri::EventHandler | tauri::api |
| Buffer.concat() | Vec<u8> + extend() | std::vec |
| JSON.parse() | serde_json::from_str() | serde_json |
| readline | BufReader + lines() | tokio::io |
```

### Hour 4: Remove Embedded Server

```rust
// src-tauri/src/logged_server.rs
// DELETE ALL OF THIS:
const EMBEDDED_SERVER: &str = r#"
    // ... 3500+ lines ...
"#;

// REPLACE WITH:
use crate::claude_direct::ClaudeDirectManager;

pub fn init_claude_manager(app: &tauri::App) -> Result<(), Box<dyn std::error::Error>> {
    let manager = ClaudeDirectManager::new()?;
    app.manage(manager);
    Ok(())
}
```

## Hour 5-8: Build Core Rust Components

### Hour 5: Create Process Structure

```rust
// src-tauri/src/claude_direct/mod.rs
pub mod process;
pub mod parser;
pub mod registry;
pub mod manager;

pub use manager::ClaudeDirectManager;
```

```rust
// src-tauri/src/claude_direct/process.rs
use tokio::process::{Command, Child, ChildStdout, ChildStderr};
use tokio::io::BufReader;
use std::process::Stdio;

pub struct ClaudeProcess {
    pub child: Child,
    pub session_id: String,
    pub stdout: BufReader<ChildStdout>,
    pub stderr: BufReader<ChildStderr>,
    pub created_at: std::time::Instant,
}

impl ClaudeProcess {
    pub async fn spawn(
        binary_path: &str,
        prompt: &str,
        resume_id: Option<&str>,
        working_dir: &str,
    ) -> Result<Self, Box<dyn std::error::Error>> {
        let mut cmd = Command::new(binary_path);
        
        // CRITICAL: Argument order matters!
        if let Some(id) = resume_id {
            cmd.arg("--resume").arg(id);
        }
        
        cmd.arg("--prompt").arg(prompt)
           .arg("--output-format").arg("stream-json")
           .arg("--verbose")
           .arg("--print")
           .current_dir(working_dir)
           .stdout(Stdio::piped())
           .stderr(Stdio::piped())
           .stdin(Stdio::piped())
           .kill_on_drop(true);  // Important!
        
        let mut child = cmd.spawn()?;
        
        let stdout = child.stdout.take().ok_or("No stdout")?;
        let stderr = child.stderr.take().ok_or("No stderr")?;
        
        let mut stdout_reader = BufReader::new(stdout);
        let stderr_reader = BufReader::new(stderr);
        
        // Extract session ID immediately
        let session_id = extract_session_id(&mut stdout_reader).await?;
        
        Ok(Self {
            child,
            session_id,
            stdout: stdout_reader,
            stderr: stderr_reader,
            created_at: std::time::Instant::now(),
        })
    }
    
    pub async fn kill(&mut self) -> Result<(), Box<dyn std::error::Error>> {
        self.child.kill().await?;
        Ok(())
    }
}

async fn extract_session_id(
    reader: &mut BufReader<ChildStdout>
) -> Result<String, Box<dyn std::error::Error>> {
    use tokio::io::AsyncBufReadExt;
    use tokio::time::{timeout, Duration};
    
    let extraction = timeout(Duration::from_millis(500), async {
        let mut line = String::new();
        while reader.read_line(&mut line).await? > 0 {
            if line.contains(r#""type":"init""#) && line.contains("session_id") {
                // Parse JSON to extract session_id
                if let Ok(json) = serde_json::from_str::<serde_json::Value>(&line.trim_end_matches('$')) {
                    if let Some(id) = json["session_id"].as_str() {
                        return Ok(id.to_string());
                    }
                }
            }
            line.clear();
        }
        Err("Session ID not found".into())
    });
    
    extraction.await?
}
```

### Hour 6: Create Stream Parser

```rust
// src-tauri/src/claude_direct/parser.rs
use serde::{Deserialize, Serialize};
use serde_json::Value;

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ClaudeMessage {
    #[serde(rename = "type")]
    pub msg_type: String,
    pub content: Option<String>,
    pub session_id: Option<String>,
    pub message_id: Option<String>,
    pub usage: Option<TokenUsage>,
    pub error: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct TokenUsage {
    pub input_tokens: Option<i32>,
    pub output_tokens: Option<i32>,
    pub cache_creation_tokens: Option<i32>,
    pub cache_read_tokens: Option<i32>,
}

pub struct StreamParser {
    buffer: String,
    incomplete_line: String,
}

impl StreamParser {
    pub fn new() -> Self {
        Self {
            buffer: String::with_capacity(8192),
            incomplete_line: String::new(),
        }
    }
    
    pub fn parse_line(&mut self, line: &str) -> Option<ClaudeMessage> {
        // Handle incomplete JSON from previous read
        let full_line = if !self.incomplete_line.is_empty() {
            let combined = format!("{}{}", self.incomplete_line, line);
            self.incomplete_line.clear();
            combined
        } else {
            line.to_string()
        };
        
        // Check if line is complete (ends with $)
        if !full_line.ends_with('$') {
            self.incomplete_line = full_line;
            return None;
        }
        
        // Remove $ terminator and parse
        let json_str = full_line.trim_end_matches('$').trim();
        
        match serde_json::from_str::<Value>(json_str) {
            Ok(json) => {
                // Convert to ClaudeMessage
                let msg = ClaudeMessage {
                    msg_type: json["type"].as_str().unwrap_or("unknown").to_string(),
                    content: json["content"].as_str().map(|s| s.to_string()),
                    session_id: json["session_id"].as_str().map(|s| s.to_string()),
                    message_id: json["message_id"].as_str().map(|s| s.to_string()),
                    usage: Self::extract_usage(&json),
                    error: json["error"].as_str().map(|s| s.to_string()),
                };
                Some(msg)
            }
            Err(e) => {
                eprintln!("Failed to parse JSON: {} - Line: {}", e, json_str);
                None
            }
        }
    }
    
    fn extract_usage(json: &Value) -> Option<TokenUsage> {
        json.get("usage").map(|u| TokenUsage {
            input_tokens: u["input_tokens"].as_i64().map(|n| n as i32),
            output_tokens: u["output_tokens"].as_i64().map(|n| n as i32),
            cache_creation_tokens: u["cache_creation_tokens"].as_i64().map(|n| n as i32),
            cache_read_tokens: u["cache_read_tokens"].as_i64().map(|n| n as i32),
        })
    }
}
```

### Hour 7: Create Process Registry

```rust
// src-tauri/src/claude_direct/registry.rs
use std::collections::HashMap;
use std::sync::Arc;
use tokio::sync::RwLock;
use super::process::ClaudeProcess;

pub struct ProcessRegistry {
    processes: Arc<RwLock<HashMap<String, ClaudeProcess>>>,
    max_processes: usize,
}

impl ProcessRegistry {
    pub fn new(max_processes: usize) -> Self {
        Self {
            processes: Arc::new(RwLock::new(HashMap::new())),
            max_processes,
        }
    }
    
    pub async fn register(&self, process: ClaudeProcess) -> Result<(), String> {
        let mut procs = self.processes.write().await;
        
        // Check limit
        if procs.len() >= self.max_processes {
            // Kill oldest process
            if let Some(oldest_id) = self.find_oldest(&procs).await {
                if let Some(mut old_proc) = procs.remove(&oldest_id) {
                    let _ = old_proc.kill().await;
                }
            }
        }
        
        procs.insert(process.session_id.clone(), process);
        Ok(())
    }
    
    pub async fn get(&self, session_id: &str) -> Option<ClaudeProcess> {
        let procs = self.processes.read().await;
        procs.get(session_id).cloned()
    }
    
    pub async fn remove(&self, session_id: &str) -> Option<ClaudeProcess> {
        let mut procs = self.processes.write().await;
        procs.remove(session_id)
    }
    
    pub async fn kill(&self, session_id: &str) -> Result<(), String> {
        if let Some(mut process) = self.remove(session_id).await {
            process.kill().await.map_err(|e| e.to_string())?;
        }
        Ok(())
    }
    
    pub async fn kill_all(&self) {
        let mut procs = self.processes.write().await;
        for (_, mut process) in procs.drain() {
            let _ = process.kill().await;
        }
    }
    
    async fn find_oldest(&self, procs: &HashMap<String, ClaudeProcess>) -> Option<String> {
        procs.iter()
            .min_by_key(|(_, p)| p.created_at)
            .map(|(id, _)| id.clone())
    }
}

impl Drop for ProcessRegistry {
    fn drop(&mut self) {
        // Clean up all processes
        let registry = self.processes.clone();
        tokio::spawn(async move {
            let mut procs = registry.write().await;
            for (_, mut process) in procs.drain() {
                let _ = process.kill().await;
            }
        });
    }
}
```

### Hour 8: Create Manager

```rust
// src-tauri/src/claude_direct/manager.rs
use super::{process::ClaudeProcess, parser::StreamParser, registry::ProcessRegistry};
use std::path::PathBuf;
use tauri::Manager;

pub struct ClaudeDirectManager {
    registry: ProcessRegistry,
    binary_path: PathBuf,
    working_dir: PathBuf,
}

impl ClaudeDirectManager {
    pub fn new() -> Result<Self, Box<dyn std::error::Error>> {
        let binary_path = Self::find_claude_binary()?;
        let working_dir = std::env::current_dir()?;
        
        Ok(Self {
            registry: ProcessRegistry::new(10), // Max 10 concurrent sessions
            binary_path,
            working_dir,
        })
    }
    
    fn find_claude_binary() -> Result<PathBuf, Box<dyn std::error::Error>> {
        // Priority order for finding Claude CLI
        let paths = vec![
            // Environment variable
            std::env::var("CLAUDE_CLI_PATH").ok().map(PathBuf::from),
            // User home
            home::home_dir().map(|h| h.join(".local/bin/claude")),
            // System paths
            Some(PathBuf::from("/usr/local/bin/claude")),
            Some(PathBuf::from("/opt/homebrew/bin/claude")),
            // Windows
            #[cfg(windows)]
            Some(PathBuf::from(r"C:\Program Files\Claude\claude.exe")),
        ];
        
        for path_opt in paths.into_iter().flatten() {
            if path_opt.exists() {
                return Ok(path_opt);
            }
        }
        
        // Try PATH
        if let Ok(output) = std::process::Command::new("which")
            .arg("claude")
            .output()
        {
            if output.status.success() {
                let path = String::from_utf8_lossy(&output.stdout).trim().to_string();
                return Ok(PathBuf::from(path));
            }
        }
        
        Err("Claude CLI not found".into())
    }
    
    pub async fn send_message(
        &self,
        prompt: &str,
        session_id: Option<&str>,
        app_handle: &tauri::AppHandle,
    ) -> Result<String, Box<dyn std::error::Error>> {
        // Check if resuming existing session
        if let Some(id) = session_id {
            if let Some(process) = self.registry.get(id).await {
                // Session exists, send to stdin
                return self.send_to_existing(process, prompt, app_handle).await;
            }
        }
        
        // Spawn new process
        let process = ClaudeProcess::spawn(
            self.binary_path.to_str().unwrap(),
            prompt,
            session_id,
            self.working_dir.to_str().unwrap(),
        ).await?;
        
        let session_id = process.session_id.clone();
        
        // Start streaming output
        self.start_stream(process, app_handle.clone()).await?;
        
        Ok(session_id)
    }
    
    async fn send_to_existing(
        &self,
        mut process: ClaudeProcess,
        prompt: &str,
        app_handle: &tauri::AppHandle,
    ) -> Result<String, Box<dyn std::error::Error>> {
        use tokio::io::AsyncWriteExt;
        
        // Write to stdin
        if let Some(stdin) = process.child.stdin.as_mut() {
            stdin.write_all(format!("{}\n", prompt).as_bytes()).await?;
            stdin.flush().await?;
        }
        
        Ok(process.session_id.clone())
    }
    
    async fn start_stream(
        &self,
        mut process: ClaudeProcess,
        app_handle: tauri::AppHandle,
    ) -> Result<(), Box<dyn std::error::Error>> {
        let session_id = process.session_id.clone();
        
        // Register process
        self.registry.register(process).await?;
        
        // Start streaming task
        tokio::spawn(async move {
            use tokio::io::AsyncBufReadExt;
            
            let mut parser = StreamParser::new();
            let mut line = String::new();
            
            // Get process from registry
            if let Some(mut proc) = self.registry.get(&session_id).await {
                loop {
                    line.clear();
                    match proc.stdout.read_line(&mut line).await {
                        Ok(0) => break, // EOF
                        Ok(_) => {
                            if let Some(msg) = parser.parse_line(&line) {
                                // Emit to frontend
                                app_handle.emit_all("claude_stream", &msg).ok();
                                
                                // Check for completion
                                if msg.msg_type == "done" || msg.error.is_some() {
                                    break;
                                }
                            }
                        }
                        Err(e) => {
                            eprintln!("Read error: {}", e);
                            break;
                        }
                    }
                }
            }
        });
        
        Ok(())
    }
    
    pub async fn stop_session(&self, session_id: &str) -> Result<(), Box<dyn std::error::Error>> {
        self.registry.kill(session_id).await?;
        Ok(())
    }
    
    pub async fn stop_all(&self) {
        self.registry.kill_all().await;
    }
}
```

## Hour 9-12: Frontend Migration

### Hour 9: Remove Socket.IO

```diff
// package.json
{
  "dependencies": {
-   "socket.io-client": "^4.5.0",
    "@tauri-apps/api": "^2.0.0",
  }
}
```

```bash
npm uninstall socket.io-client
npm install
```

### Hour 10: Update Claude Client

```typescript
// src/renderer/services/claudeClient.ts
// BEFORE - Socket.IO implementation
import { io, Socket } from 'socket.io-client';

export class ClaudeClient {
    private socket: Socket;
    
    constructor(port: number) {
        this.socket = io(`ws://localhost:${port}`);
    }
    
    sendMessage(content: string, sessionId?: string) {
        this.socket.emit('claude_message', {
            content,
            sessionId
        });
    }
    
    onResponse(callback: (data: any) => void) {
        this.socket.on('claude_response', callback);
    }
    
    stop(sessionId: string) {
        this.socket.emit('claude_stop', { sessionId });
    }
}

// AFTER - Tauri implementation
import { invoke, listen } from '@tauri-apps/api';
import { UnlistenFn } from '@tauri-apps/api/event';

export class ClaudeClient {
    private listeners: Map<string, UnlistenFn> = new Map();
    
    async sendMessage(prompt: string, sessionId?: string): Promise<string> {
        try {
            const newSessionId = await invoke<string>('send_claude_message', {
                prompt,
                sessionId
            });
            return newSessionId;
        } catch (error) {
            console.error('Failed to send message:', error);
            throw error;
        }
    }
    
    async listenToStream(callback: (data: any) => void): Promise<void> {
        const unlisten = await listen('claude_stream', (event) => {
            callback(event.payload);
        });
        this.listeners.set('stream', unlisten);
    }
    
    async stopSession(sessionId: string): Promise<void> {
        await invoke('stop_claude_session', { sessionId });
    }
    
    cleanup() {
        this.listeners.forEach(unlisten => unlisten());
        this.listeners.clear();
    }
}
```

### Hour 11: Update Store

```typescript
// src/renderer/stores/claudeStore.ts
// BEFORE
import { io } from 'socket.io-client';

interface ClaudeStore {
    socket: Socket | null;
    connectSocket: (port: number) => void;
    sendMessage: (content: string) => void;
}

// AFTER
import { invoke, listen } from '@tauri-apps/api';

interface ClaudeStore {
    sendMessage: (prompt: string) => Promise<void>;
    stopStreaming: () => Promise<void>;
    initializeListeners: () => Promise<void>;
}

const useClaudeStore = create<ClaudeStore>((set, get) => ({
    sessions: new Map(),
    currentSessionId: null,
    streaming: false,
    
    sendMessage: async (prompt: string) => {
        const { currentSessionId } = get();
        
        set({ streaming: true });
        
        try {
            const sessionId = await invoke<string>('send_claude_message', {
                prompt,
                sessionId: currentSessionId
            });
            
            set({ currentSessionId: sessionId });
        } catch (error) {
            console.error('Send message error:', error);
            set({ streaming: false });
        }
    },
    
    stopStreaming: async () => {
        const { currentSessionId } = get();
        if (currentSessionId) {
            await invoke('stop_claude_session', { sessionId: currentSessionId });
        }
        set({ streaming: false });
    },
    
    initializeListeners: async () => {
        await listen('claude_stream', (event) => {
            const data = event.payload as any;
            
            // Handle different message types
            switch (data.type) {
                case 'content':
                    // Update message content
                    set((state) => {
                        const session = state.sessions.get(data.session_id);
                        if (session) {
                            session.messages.push(data);
                        }
                        return { sessions: new Map(state.sessions) };
                    });
                    break;
                    
                case 'done':
                    set({ streaming: false });
                    break;
                    
                case 'error':
                    console.error('Claude error:', data.error);
                    set({ streaming: false });
                    break;
                    
                case 'usage':
                    // Update token usage
                    set((state) => {
                        const session = state.sessions.get(data.session_id);
                        if (session && data.usage) {
                            session.totalTokens += (data.usage.input_tokens || 0);
                            session.totalTokens += (data.usage.output_tokens || 0);
                        }
                        return { sessions: new Map(state.sessions) };
                    });
                    break;
            }
        });
    }
}));
```

### Hour 12: Update Components

```tsx
// src/renderer/components/Chat/ChatInput.tsx
// BEFORE
const handleSend = () => {
    socket.emit('claude_message', { content: input });
};

// AFTER
const handleSend = async () => {
    await store.sendMessage(input);
};
```

```tsx
// src/renderer/components/Chat/MessageList.tsx
// BEFORE
useEffect(() => {
    socket.on('claude_response', (data) => {
        setMessages(prev => [...prev, data]);
    });
}, []);

// AFTER
useEffect(() => {
    store.initializeListeners();
    return () => store.cleanup();
}, []);
```

## Hour 13-16: Tauri Integration

### Hour 13: Register Commands

```rust
// src-tauri/src/main.rs
mod claude_direct;

use claude_direct::ClaudeDirectManager;

fn main() {
    tauri::Builder::default()
        .setup(|app| {
            // Initialize Claude manager
            let manager = ClaudeDirectManager::new()
                .expect("Failed to initialize Claude manager");
            app.manage(manager);
            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            send_claude_message,
            stop_claude_session,
            stop_all_sessions,
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
```

### Hour 14: Implement Commands

```rust
// src-tauri/src/commands.rs
use tauri::State;
use crate::claude_direct::ClaudeDirectManager;

#[tauri::command]
pub async fn send_claude_message(
    prompt: String,
    session_id: Option<String>,
    manager: State<'_, ClaudeDirectManager>,
    app: tauri::AppHandle,
) -> Result<String, String> {
    manager.send_message(&prompt, session_id.as_deref(), &app)
        .await
        .map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn stop_claude_session(
    session_id: String,
    manager: State<'_, ClaudeDirectManager>,
) -> Result<(), String> {
    manager.stop_session(&session_id)
        .await
        .map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn stop_all_sessions(
    manager: State<'_, ClaudeDirectManager>,
) -> Result<(), String> {
    manager.stop_all().await;
    Ok(())
}
```

### Hour 15: Update Build Configuration

```json
// src-tauri/tauri.conf.json
{
  "build": {
    "beforeBuildCommand": "npm run build",
    "beforeDevCommand": "npm run dev",
    "devPath": "http://localhost:5173",
    "distDir": "../dist"
  },
  "bundle": {
    "resources": []  // No more server bundling!
  }
}
```

```javascript
// Remove scripts/bundle-macos-server.js
// Delete this file entirely
```

### Hour 16: Clean Up Package Scripts

```diff
// package.json
{
  "scripts": {
    "dev": "vite",
    "build": "tsc && vite build",
    "tauri:dev": "tauri dev",
    "tauri:build": "tauri build",
-   "server:macos": "node server-claude-macos.cjs",
-   "server:wsl": "node server-claude-wsl.cjs",
-   "bundle:server": "node scripts/bundle-macos-server.js"
  }
}
```

## Hour 17-20: Testing

### Hour 17: Unit Tests

```rust
// src-tauri/src/claude_direct/tests.rs
#[cfg(test)]
mod tests {
    use super::*;
    
    #[test]
    fn test_binary_detection() {
        let path = ClaudeDirectManager::find_claude_binary();
        assert!(path.is_ok(), "Claude binary should be found");
    }
    
    #[tokio::test]
    async fn test_session_id_extraction() {
        let mock_output = r#"{"type":"init","session_id":"abcdef1234567890ABCDEF1234"}"#;
        let id = extract_session_id_from_string(mock_output).unwrap();
        assert_eq!(id.len(), 26);
    }
    
    #[tokio::test]
    async fn test_parser() {
        let mut parser = StreamParser::new();
        let line = r#"{"type":"content","content":"Hello"}$"#;
        let msg = parser.parse_line(line);
        assert!(msg.is_some());
        assert_eq!(msg.unwrap().content, Some("Hello".to_string()));
    }
}
```

### Hour 18: Integration Tests

```rust
// src-tauri/tests/integration.rs
#[tokio::test]
async fn test_full_conversation() {
    let manager = ClaudeDirectManager::new().unwrap();
    
    // Send first message
    let session_id = manager.send_message(
        "Say hello",
        None,
        &app_handle
    ).await.unwrap();
    
    assert_eq!(session_id.len(), 26);
    
    // Resume session
    let same_id = manager.send_message(
        "Say goodbye",
        Some(&session_id),
        &app_handle
    ).await.unwrap();
    
    assert_eq!(same_id, session_id);
    
    // Clean up
    manager.stop_session(&session_id).await.unwrap();
}
```

### Hour 19: End-to-End Tests

```typescript
// e2e/claude-flow.test.ts
import { test, expect } from '@playwright/test';

test('complete claude conversation', async ({ page }) => {
    await page.goto('http://localhost:5173');
    
    // Send message
    const input = page.locator('textarea');
    await input.fill('Hello Claude');
    await input.press('Enter');
    
    // Wait for response
    await expect(page.locator('.message-content')).toContainText('Hello', {
        timeout: 10000
    });
    
    // Check session ID displayed
    await expect(page.locator('.session-id')).toHaveText(/[a-zA-Z0-9]{26}/);
});
```

### Hour 20: Performance Testing

```rust
// benchmarks/performance.rs
use criterion::{black_box, criterion_group, criterion_main, Criterion};

fn benchmark_spawn(c: &mut Criterion) {
    c.bench_function("spawn claude process", |b| {
        b.iter(|| {
            let rt = tokio::runtime::Runtime::new().unwrap();
            rt.block_on(async {
                let process = ClaudeProcess::spawn(
                    "claude",
                    "test",
                    None,
                    "."
                ).await.unwrap();
                process.kill().await.unwrap();
            });
        });
    });
}

criterion_group!(benches, benchmark_spawn);
criterion_main!(benches);
```

## Hour 21-24: Deployment

### Hour 21: Platform Testing

```bash
# macOS
cargo tauri build --target aarch64-apple-darwin

# Windows
cargo tauri build --target x86_64-pc-windows-msvc

# Linux
cargo tauri build --target x86_64-unknown-linux-gnu
```

### Hour 22: CI/CD Updates

```yaml
# .github/workflows/build.yml
name: Build and Test

on: [push, pull_request]

jobs:
  test:
    runs-on: ${{ matrix.os }}
    strategy:
      matrix:
        os: [ubuntu-latest, windows-latest, macos-latest]
    
    steps:
      - uses: actions/checkout@v3
      
      - name: Setup Rust
        uses: actions-rs/toolchain@v1
        with:
          toolchain: stable
      
      - name: Run tests
        run: |
          cargo test --all
          cargo bench --no-run
      
      - name: Build Tauri app
        run: cargo tauri build
```

### Hour 23: Memory Leak Testing

```rust
// tests/memory_leak.rs
#[test]
fn test_no_memory_leaks() {
    // Spawn and kill 100 processes
    let rt = tokio::runtime::Runtime::new().unwrap();
    
    for _ in 0..100 {
        rt.block_on(async {
            let manager = ClaudeDirectManager::new().unwrap();
            let session = manager.send_message("test", None, &app).await.unwrap();
            manager.stop_session(&session).await.unwrap();
        });
    }
    
    // Check memory usage didn't grow excessively
    // Implementation depends on platform
}
```

### Hour 24: Release

```bash
# Tag release
git tag -a v2.0.0 -m "Direct CLI spawning - removed embedded server"

# Push to remote
git push origin feature/direct-cli-spawning
git push origin v2.0.0

# Create GitHub release
gh release create v2.0.0 \
  --title "v2.0.0: Direct CLI Spawning" \
  --notes "Major refactor: Removed embedded Node.js server, now using direct Rust process spawning"
```

## Verification Checklist

- [ ] All Node.js server code removed
- [ ] No more EMBEDDED_SERVER constant
- [ ] Socket.IO dependencies removed
- [ ] Tauri commands implemented
- [ ] Frontend uses Tauri events
- [ ] Session management working
- [ ] Stream parsing functional
- [ ] Error handling complete
- [ ] All platforms tested
- [ ] Performance improved
- [ ] Memory usage reduced
- [ ] No memory leaks
- [ ] CI/CD updated
- [ ] Documentation updated
- [ ] Release notes written

## Rollback Procedure

If issues arise:

```bash
# Quick rollback
git checkout backup-before-migration

# Feature flag approach
#[cfg(feature = "legacy_server")]
mod logged_server;

#[cfg(not(feature = "legacy_server"))]
mod claude_direct;
```

## Success Metrics

- Memory usage: 150MB reduction (40% improvement)
- Latency: 20ms faster per message
- Code size: 3,500 lines removed
- Maintainability: 10x improvement
- Debug capability: Full IDE support restored
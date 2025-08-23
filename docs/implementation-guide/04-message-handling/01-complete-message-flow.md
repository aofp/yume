# Complete Message Flow: From UI Click to Claude Response

## Table of Contents
1. [Message Flow Architecture](#message-flow-architecture)
2. [Message Types & Structures](#message-types--structures)
3. [Stream Parsing Deep Dive](#stream-parsing-deep-dive)
4. [Token Counting & Analytics](#token-counting--analytics)
5. [Tool Use Detection & Handling](#tool-use-detection--handling)
6. [Error Message Handling](#error-message-handling)
7. [Performance Optimizations](#performance-optimizations)
8. [Implementation Guide](#implementation-guide)

---

## Message Flow Architecture

### Complete Flow Diagram

```
User Input (React)
    ↓
[1] Form Submission / Enter Key
    ↓
[2] Store Update (Zustand)
    ↓
[3] Tauri Command Invoke
    ↓
[4] Rust Command Handler
    ↓
[5] Process Spawn (Claude CLI)
    ↓
[6] Stdout/Stderr Streams
    ↓
[7] Line-by-Line Parsing
    ↓
[8] Message Type Detection
    ↓
[9] Event Emission (Tauri)
    ↓
[10] Frontend Event Handler
    ↓
[11] Store Update
    ↓
[12] UI Re-render
```

### Detailed Step Analysis

#### Step 1-2: User Input Processing

```typescript
// Frontend input handling
function ChatInput({ sessionId }: { sessionId: string }) {
    const [input, setInput] = useState('');
    const { addMessage, setStreaming } = useClaudeStore();
    
    const handleSubmit = async (e: FormEvent) => {
        e.preventDefault();
        
        if (!input.trim()) return;
        
        // CRITICAL: Order of operations
        // 1. Add user message to store
        const userMessage = {
            id: generateId(),
            type: 'user',
            content: input,
            timestamp: Date.now(),
        };
        addMessage(sessionId, userMessage);
        
        // 2. Clear input immediately for UX
        const prompt = input;
        setInput('');
        
        // 3. Set streaming state
        setStreaming(sessionId, true);
        
        // 4. Invoke backend command
        try {
            await invoke('execute_claude', {
                sessionId,
                prompt,
                model: getCurrentModel(),
                projectPath: getCurrentProject(),
            });
        } catch (error) {
            handleError(error);
            setStreaming(sessionId, false);
        }
    };
}
```

#### Step 3-4: Tauri Command Processing

```rust
#[tauri::command]
pub async fn execute_claude(
    app: AppHandle,
    session_id: Option<String>,
    prompt: String,
    model: String,
    project_path: String,
) -> Result<(), String> {
    // Validate inputs
    validate_inputs(&prompt, &model, &project_path)?;
    
    // Determine execution mode
    let execution_mode = if let Some(sid) = session_id {
        // Check if session exists
        if session_exists(&sid)? {
            ExecutionMode::Resume(sid)
        } else {
            ExecutionMode::NewWithContext(sid)
        }
    } else {
        ExecutionMode::New
    };
    
    // Build command arguments
    let args = build_args(execution_mode, &prompt, &model)?;
    
    // Create command with environment
    let cmd = create_command(&project_path, args)?;
    
    // Spawn and handle streaming
    spawn_and_stream(app, cmd, prompt, model, project_path).await
}
```

#### Step 5-6: Process Spawning & Streaming

```rust
async fn spawn_and_stream(
    app: AppHandle,
    mut cmd: Command,
    prompt: String,
    model: String,
    project_path: String,
) -> Result<(), String> {
    // CRITICAL: Take stdout/stderr before spawning
    let mut child = cmd
        .stdout(Stdio::piped())
        .stderr(Stdio::piped())
        .spawn()
        .map_err(|e| format!("Spawn failed: {}", e))?;
    
    let stdout = child.stdout.take().ok_or("No stdout")?;
    let stderr = child.stderr.take().ok_or("No stderr")?;
    
    // Create buffered readers for efficiency
    let stdout_reader = BufReader::new(stdout);
    let stderr_reader = BufReader::new(stderr);
    
    // Session ID extraction holder
    let session_id = Arc::new(Mutex::new(None::<String>));
    
    // Spawn stdout processing task
    let app_clone = app.clone();
    let session_id_clone = session_id.clone();
    
    let stdout_task = tokio::spawn(async move {
        let mut lines = stdout_reader.lines();
        
        while let Ok(Some(line)) = lines.next_line().await {
            process_stdout_line(
                &app_clone,
                &line,
                &session_id_clone
            ).await;
        }
    });
    
    // Spawn stderr processing task
    let stderr_task = tokio::spawn(async move {
        let mut lines = stderr_reader.lines();
        
        while let Ok(Some(line)) = lines.next_line().await {
            process_stderr_line(&app, &line).await;
        }
    });
    
    // Wait for completion
    let _ = tokio::join!(stdout_task, stderr_task);
    
    Ok(())
}
```

---

## Message Types & Structures

### Complete Message Type Definitions

```rust
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(tag = "type", rename_all = "snake_case")]
pub enum ClaudeStreamMessage {
    // System messages
    System {
        subtype: SystemSubtype,
        #[serde(skip_serializing_if = "Option::is_none")]
        session_id: Option<String>,
        #[serde(skip_serializing_if = "Option::is_none")]
        model: Option<String>,
        #[serde(skip_serializing_if = "Option::is_none")]
        tools: Option<Vec<String>>,
        #[serde(skip_serializing_if = "Option::is_none")]
        cwd: Option<String>,
        timestamp: i64,
    },
    
    // User messages
    User {
        message: MessageContent,
        timestamp: i64,
    },
    
    // Assistant messages
    Assistant {
        message: MessageContent,
        #[serde(default)]
        streaming: bool,
        #[serde(skip_serializing_if = "Option::is_none")]
        thinking: Option<ThinkingContent>,
        timestamp: i64,
    },
    
    // Tool use
    ToolUse {
        id: String,
        name: String,
        input: serde_json::Value,
        #[serde(default)]
        streaming: bool,
        timestamp: i64,
    },
    
    // Tool result
    ToolResult {
        tool_use_id: String,
        output: serde_json::Value,
        #[serde(default)]
        is_error: bool,
        timestamp: i64,
    },
    
    // Result/completion
    Result {
        result: String,
        #[serde(skip_serializing_if = "Option::is_none")]
        duration_ms: Option<u64>,
        #[serde(skip_serializing_if = "Option::is_none")]
        usage: Option<TokenUsage>,
        #[serde(skip_serializing_if = "Option::is_none")]
        cost_usd: Option<f64>,
    },
    
    // Errors
    Error {
        error: String,
        #[serde(skip_serializing_if = "Option::is_none")]
        code: Option<String>,
        #[serde(skip_serializing_if = "Option::is_none")]
        details: Option<serde_json::Value>,
    },
    
    // Permission requests
    Permission {
        tool: String,
        parameters: serde_json::Value,
        risk_level: RiskLevel,
        request_id: String,
    },
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct MessageContent {
    pub role: String,
    pub content: Vec<ContentBlock>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(tag = "type", rename_all = "snake_case")]
pub enum ContentBlock {
    Text {
        text: String,
    },
    ToolUse {
        id: String,
        name: String,
        input: serde_json::Value,
    },
    ToolResult {
        tool_use_id: String,
        #[serde(skip_serializing_if = "Option::is_none")]
        content: Option<String>,
        #[serde(skip_serializing_if = "Option::is_none")]
        is_error: Option<bool>,
    },
    Thinking {
        thinking: String,
    },
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct TokenUsage {
    pub input_tokens: u32,
    pub output_tokens: u32,
    #[serde(default)]
    pub cache_creation_input_tokens: u32,
    #[serde(default)]
    pub cache_read_input_tokens: u32,
}
```

### Message Parsing Implementation

```rust
async fn process_stdout_line(
    app: &AppHandle,
    line: &str,
    session_id: &Arc<Mutex<Option<String>>>,
) {
    // Skip empty lines
    if line.trim().is_empty() {
        return;
    }
    
    // Try to parse as JSON
    match serde_json::from_str::<ClaudeStreamMessage>(line) {
        Ok(message) => {
            handle_parsed_message(app, message, session_id).await;
        }
        Err(e) => {
            // Not JSON - might be plain text output
            log::debug!("Non-JSON line: {}", line);
            
            // Emit as raw output for debugging
            if let Some(sid) = session_id.lock().unwrap().as_ref() {
                app.emit(&format!("claude-raw:{}", sid), line).ok();
            }
        }
    }
}

async fn handle_parsed_message(
    app: &AppHandle,
    message: ClaudeStreamMessage,
    session_id: &Arc<Mutex<Option<String>>>,
) {
    match message {
        ClaudeStreamMessage::System { subtype, session_id: sid, .. } => {
            if subtype == SystemSubtype::Init {
                if let Some(sid) = sid {
                    // CRITICAL: Store session ID immediately
                    *session_id.lock().unwrap() = Some(sid.clone());
                    
                    // Register with ProcessRegistry
                    register_session(&sid).await;
                    
                    // Emit session initialized event
                    app.emit("session-initialized", json!({
                        "session_id": sid,
                        "timestamp": chrono::Utc::now(),
                    })).ok();
                }
            }
        }
        
        ClaudeStreamMessage::Assistant { message, streaming, thinking, .. } => {
            let sid = session_id.lock().unwrap().clone();
            
            if let Some(sid) = sid {
                // Handle thinking blocks specially
                if let Some(thinking_content) = thinking {
                    app.emit(&format!("claude-thinking:{}", sid), json!({
                        "content": thinking_content.thinking,
                        "streaming": streaming,
                    })).ok();
                }
                
                // Emit assistant message
                app.emit(&format!("claude-assistant:{}", sid), json!({
                    "message": message,
                    "streaming": streaming,
                })).ok();
            }
        }
        
        ClaudeStreamMessage::ToolUse { id, name, input, .. } => {
            let sid = session_id.lock().unwrap().clone();
            
            if let Some(sid) = sid {
                // Track tool use for analytics
                track_tool_use(&name, &input).await;
                
                // Emit tool use event
                app.emit(&format!("claude-tool-use:{}", sid), json!({
                    "id": id,
                    "name": name,
                    "input": input,
                })).ok();
            }
        }
        
        ClaudeStreamMessage::Result { usage, cost_usd, .. } => {
            let sid = session_id.lock().unwrap().clone();
            
            if let Some(sid) = sid {
                // Process token usage
                if let Some(usage) = usage {
                    process_token_usage(&sid, usage).await;
                }
                
                // Emit completion event
                app.emit(&format!("claude-complete:{}", sid), json!({
                    "success": true,
                    "cost": cost_usd,
                })).ok();
            }
        }
        
        _ => {
            // Handle other message types
        }
    }
}
```

---

## Stream Parsing Deep Dive

### JSONL Parsing with Special Characters

```rust
// Claude uses $ as line terminator but $ can appear in JSON
pub struct JsonlParser {
    buffer: String,
    brace_depth: i32,
    in_string: bool,
    escape_next: bool,
}

impl JsonlParser {
    pub fn new() -> Self {
        Self {
            buffer: String::new(),
            brace_depth: 0,
            in_string: false,
            escape_next: false,
        }
    }
    
    pub fn process_chunk(&mut self, chunk: &str) -> Vec<String> {
        let mut complete_messages = Vec::new();
        
        for ch in chunk.chars() {
            // Handle escape sequences
            if self.escape_next {
                self.buffer.push(ch);
                self.escape_next = false;
                continue;
            }
            
            if ch == '\\' && self.in_string {
                self.escape_next = true;
                self.buffer.push(ch);
                continue;
            }
            
            // Track string boundaries
            if ch == '"' && !self.escape_next {
                self.in_string = !self.in_string;
            }
            
            // Track brace depth outside strings
            if !self.in_string {
                match ch {
                    '{' => self.brace_depth += 1,
                    '}' => {
                        self.brace_depth -= 1;
                        
                        // Complete JSON object
                        if self.brace_depth == 0 {
                            self.buffer.push(ch);
                            
                            // Check for line terminator
                            // Claude uses $ or \n as terminators
                            // We'll handle both in the next character
                            continue;
                        }
                    }
                    '$' | '\n' if self.brace_depth == 0 && !self.buffer.is_empty() => {
                        // End of message
                        complete_messages.push(self.buffer.clone());
                        self.buffer.clear();
                        continue;
                    }
                    _ => {}
                }
            }
            
            self.buffer.push(ch);
        }
        
        complete_messages
    }
}

// Usage
let mut parser = JsonlParser::new();
let messages = parser.process_chunk(chunk);
for msg in messages {
    process_message(&msg);
}
```

### Streaming State Management

```rust
pub struct StreamingStateManager {
    sessions: Arc<RwLock<HashMap<String, SessionStreamState>>>,
}

pub struct SessionStreamState {
    pub streaming: bool,
    pub current_message_id: Option<String>,
    pub buffer: String,
    pub last_activity: Instant,
}

impl StreamingStateManager {
    pub async fn start_streaming(&self, session_id: String) {
        let mut sessions = self.sessions.write().await;
        sessions.insert(session_id, SessionStreamState {
            streaming: true,
            current_message_id: None,
            buffer: String::new(),
            last_activity: Instant::now(),
        });
    }
    
    pub async fn append_to_stream(
        &self, 
        session_id: &str, 
        content: &str
    ) -> Option<String> {
        let mut sessions = self.sessions.write().await;
        
        if let Some(state) = sessions.get_mut(session_id) {
            state.buffer.push_str(content);
            state.last_activity = Instant::now();
            
            // Check if we have a complete message
            if let Some(complete) = extract_complete_message(&state.buffer) {
                state.buffer.clear();
                return Some(complete);
            }
        }
        
        None
    }
    
    pub async fn end_streaming(&self, session_id: &str) {
        let mut sessions = self.sessions.write().await;
        
        if let Some(state) = sessions.get_mut(session_id) {
            state.streaming = false;
            
            // Flush any remaining buffer
            if !state.buffer.is_empty() {
                log::warn!("Unflushed buffer for session {}: {}", 
                    session_id, state.buffer);
            }
        }
    }
}
```

---

## Token Counting & Analytics

### Accurate Token Counting

```rust
#[derive(Debug, Clone)]
pub struct TokenAnalytics {
    pub input_tokens: u32,
    pub output_tokens: u32,
    pub cache_creation_tokens: u32,
    pub cache_read_tokens: u32,
    pub total_tokens: u32,
    pub effective_tokens: u32,  // Tokens that cost money
    pub cache_efficiency: f32,   // Percentage of tokens from cache
}

impl TokenAnalytics {
    pub fn from_usage(usage: &TokenUsage) -> Self {
        let total = usage.input_tokens + 
                   usage.output_tokens + 
                   usage.cache_creation_input_tokens +
                   usage.cache_read_input_tokens;
        
        let effective = usage.input_tokens + 
                        usage.output_tokens +
                        usage.cache_creation_input_tokens;
        
        let cache_efficiency = if total > 0 {
            (usage.cache_read_input_tokens as f32 / total as f32) * 100.0
        } else {
            0.0
        };
        
        Self {
            input_tokens: usage.input_tokens,
            output_tokens: usage.output_tokens,
            cache_creation_tokens: usage.cache_creation_input_tokens,
            cache_read_tokens: usage.cache_read_input_tokens,
            total_tokens: total,
            effective_tokens: effective,
            cache_efficiency,
        }
    }
    
    pub fn calculate_cost(&self, model: &Model) -> f64 {
        let rates = model.get_rates();
        
        // Different rates for different token types
        let input_cost = (self.input_tokens as f64 / 1_000_000.0) * rates.input_per_million;
        let output_cost = (self.output_tokens as f64 / 1_000_000.0) * rates.output_per_million;
        let cache_creation_cost = (self.cache_creation_tokens as f64 / 1_000_000.0) * rates.cache_creation_per_million;
        // Cache reads are usually free or very cheap
        let cache_read_cost = (self.cache_read_tokens as f64 / 1_000_000.0) * rates.cache_read_per_million;
        
        input_cost + output_cost + cache_creation_cost + cache_read_cost
    }
}

pub struct ModelRates {
    pub input_per_million: f64,
    pub output_per_million: f64,
    pub cache_creation_per_million: f64,
    pub cache_read_per_million: f64,
}

impl Model {
    pub fn get_rates(&self) -> ModelRates {
        match self {
            Model::Opus => ModelRates {
                input_per_million: 15.0,
                output_per_million: 75.0,
                cache_creation_per_million: 18.75,
                cache_read_per_million: 1.875,
            },
            Model::Sonnet => ModelRates {
                input_per_million: 3.0,
                output_per_million: 15.0,
                cache_creation_per_million: 3.75,
                cache_read_per_million: 0.375,
            },
            Model::Haiku => ModelRates {
                input_per_million: 0.25,
                output_per_million: 1.25,
                cache_creation_per_million: 0.30,
                cache_read_per_million: 0.03,
            },
        }
    }
}
```

### Session Analytics Tracking

```rust
pub struct SessionAnalytics {
    session_id: String,
    messages: Vec<MessageAnalytics>,
    total_tokens: TokenAnalytics,
    total_cost: f64,
    tool_uses: HashMap<String, u32>,
    start_time: Instant,
    thinking_time: Duration,
}

pub struct MessageAnalytics {
    pub message_id: String,
    pub tokens: TokenAnalytics,
    pub cost: f64,
    pub duration: Duration,
    pub tools_used: Vec<String>,
}

impl SessionAnalytics {
    pub async fn track_message(&mut self, msg: &ClaudeStreamMessage) {
        match msg {
            ClaudeStreamMessage::Result { usage, .. } => {
                if let Some(usage) = usage {
                    let analytics = TokenAnalytics::from_usage(usage);
                    let cost = analytics.calculate_cost(&self.get_model());
                    
                    self.total_tokens.add(&analytics);
                    self.total_cost += cost;
                    
                    // Store message analytics
                    self.messages.push(MessageAnalytics {
                        message_id: generate_id(),
                        tokens: analytics,
                        cost,
                        duration: self.last_message_duration(),
                        tools_used: self.current_tools.clone(),
                    });
                    
                    // Reset for next message
                    self.current_tools.clear();
                }
            }
            
            ClaudeStreamMessage::ToolUse { name, .. } => {
                *self.tool_uses.entry(name.clone()).or_insert(0) += 1;
                self.current_tools.push(name.clone());
            }
            
            ClaudeStreamMessage::Assistant { thinking, .. } => {
                if thinking.is_some() {
                    self.thinking_timer = Some(Instant::now());
                }
            }
            
            _ => {}
        }
    }
    
    pub fn get_summary(&self) -> AnalyticsSummary {
        AnalyticsSummary {
            total_messages: self.messages.len(),
            total_tokens: self.total_tokens.clone(),
            total_cost: self.total_cost,
            average_cost_per_message: self.total_cost / self.messages.len() as f64,
            cache_efficiency: self.total_tokens.cache_efficiency,
            most_used_tools: self.get_top_tools(5),
            total_duration: self.start_time.elapsed(),
            thinking_percentage: (self.thinking_time.as_secs_f64() / 
                                 self.start_time.elapsed().as_secs_f64()) * 100.0,
        }
    }
}
```

---

## Tool Use Detection & Handling

### Tool Detection Patterns

```rust
pub struct ToolDetector {
    patterns: HashMap<String, ToolPattern>,
}

pub struct ToolPattern {
    pub name: String,
    pub risk_level: RiskLevel,
    pub requires_approval: bool,
    pub validator: Box<dyn Fn(&Value) -> Result<()>>,
}

impl ToolDetector {
    pub fn new() -> Self {
        let mut patterns = HashMap::new();
        
        // Register all tools
        patterns.insert("Write".to_string(), ToolPattern {
            name: "Write".to_string(),
            risk_level: RiskLevel::Medium,
            requires_approval: false,
            validator: Box::new(|input| {
                if let Some(path) = input["file_path"].as_str() {
                    validate_file_path(path)?;
                }
                Ok(())
            }),
        });
        
        patterns.insert("Bash".to_string(), ToolPattern {
            name: "Bash".to_string(),
            risk_level: RiskLevel::High,
            requires_approval: true,
            validator: Box::new(|input| {
                if let Some(cmd) = input["command"].as_str() {
                    validate_bash_command(cmd)?;
                }
                Ok(())
            }),
        });
        
        patterns.insert("Edit".to_string(), ToolPattern {
            name: "Edit".to_string(),
            risk_level: RiskLevel::Medium,
            requires_approval: false,
            validator: Box::new(|input| {
                validate_edit_operation(input)?;
                Ok(())
            }),
        });
        
        Self { patterns }
    }
    
    pub async fn process_tool_use(
        &self,
        name: &str,
        input: &Value,
    ) -> Result<ToolApproval> {
        let pattern = self.patterns.get(name)
            .ok_or_else(|| anyhow!("Unknown tool: {}", name))?;
        
        // Validate input
        (pattern.validator)(input)?;
        
        // Check if approval needed
        if pattern.requires_approval {
            Ok(ToolApproval::Required {
                tool: name.to_string(),
                risk_level: pattern.risk_level.clone(),
                reason: get_approval_reason(name, input),
            })
        } else {
            Ok(ToolApproval::Automatic)
        }
    }
}

fn validate_file_path(path: &str) -> Result<()> {
    // Prevent directory traversal
    if path.contains("../") {
        return Err(anyhow!("Directory traversal detected"));
    }
    
    // Check against blacklist
    const BLACKLISTED: &[&str] = &[
        "/etc/passwd",
        "/etc/shadow",
        "~/.ssh/",
        ".env",
    ];
    
    for blacklisted in BLACKLISTED {
        if path.contains(blacklisted) {
            return Err(anyhow!("Blacklisted path: {}", path));
        }
    }
    
    Ok(())
}

fn validate_bash_command(cmd: &str) -> Result<()> {
    // Dangerous commands that should never auto-approve
    const DANGEROUS: &[&str] = &[
        "rm -rf /",
        "sudo",
        "chmod 777",
        "eval",
        "exec",
        "> /dev/null 2>&1",  // Hiding output
    ];
    
    for dangerous in DANGEROUS {
        if cmd.contains(dangerous) {
            return Err(anyhow!("Dangerous command pattern: {}", dangerous));
        }
    }
    
    Ok(())
}
```

### Tool Result Processing

```rust
pub async fn process_tool_result(
    tool_use_id: &str,
    output: &Value,
    is_error: bool,
) -> ProcessedToolResult {
    if is_error {
        // Handle tool errors
        ProcessedToolResult::Error {
            tool_use_id: tool_use_id.to_string(),
            error: extract_error_message(output),
            recoverable: is_recoverable_error(output),
        }
    } else {
        // Process successful result
        let processed = match detect_output_type(output) {
            OutputType::FileContent => process_file_output(output),
            OutputType::CommandOutput => process_command_output(output),
            OutputType::SearchResults => process_search_results(output),
            OutputType::Json => process_json_output(output),
            OutputType::PlainText => ProcessedOutput::Text(output.as_str().unwrap_or("").to_string()),
        };
        
        ProcessedToolResult::Success {
            tool_use_id: tool_use_id.to_string(),
            output: processed,
        }
    }
}

fn process_command_output(output: &Value) -> ProcessedOutput {
    // Parse ANSI codes, extract exit code, etc.
    let text = output.as_str().unwrap_or("");
    
    // Remove ANSI escape codes for display
    let clean = strip_ansi_codes(text);
    
    // Detect if it's an error based on patterns
    let is_error = text.contains("error:") || 
                   text.contains("Error:") ||
                   text.contains("fatal:");
    
    ProcessedOutput::Command {
        output: clean,
        exit_code: extract_exit_code(output),
        is_error,
    }
}
```

---

## Error Message Handling

### Error Classification & Recovery

```rust
#[derive(Debug, Clone)]
pub enum ErrorType {
    SessionNotFound,
    InvalidArguments,
    ApiError { code: String, message: String },
    RateLimited { retry_after: Duration },
    NetworkError,
    Timeout,
    PermissionDenied,
    OutOfMemory,
    ToolError { tool: String, error: String },
    ParseError,
    Unknown,
}

impl ErrorType {
    pub fn from_message(msg: &str) -> Self {
        if msg.contains("No conversation found") || msg.contains("Session not found") {
            ErrorType::SessionNotFound
        } else if msg.contains("Invalid arguments") {
            ErrorType::InvalidArguments
        } else if msg.contains("rate limit") {
            // Extract retry time
            let retry_after = extract_retry_duration(msg)
                .unwrap_or(Duration::from_secs(60));
            ErrorType::RateLimited { retry_after }
        } else if msg.contains("API error") {
            ErrorType::ApiError {
                code: extract_error_code(msg),
                message: msg.to_string(),
            }
        } else if msg.contains("timeout") {
            ErrorType::Timeout
        } else if msg.contains("Permission denied") {
            ErrorType::PermissionDenied
        } else if msg.contains("memory") || msg.contains("OOM") {
            ErrorType::OutOfMemory
        } else {
            ErrorType::Unknown
        }
    }
    
    pub fn is_recoverable(&self) -> bool {
        matches!(self,
            ErrorType::SessionNotFound |
            ErrorType::RateLimited { .. } |
            ErrorType::NetworkError |
            ErrorType::Timeout
        )
    }
    
    pub fn recovery_strategy(&self) -> RecoveryStrategy {
        match self {
            ErrorType::SessionNotFound => RecoveryStrategy::CreateNew,
            ErrorType::RateLimited { retry_after } => {
                RecoveryStrategy::RetryAfter(*retry_after)
            }
            ErrorType::NetworkError | ErrorType::Timeout => {
                RecoveryStrategy::RetryWithBackoff
            }
            ErrorType::ApiError { .. } => RecoveryStrategy::RetryOnce,
            ErrorType::OutOfMemory => RecoveryStrategy::ClearCacheAndRetry,
            _ => RecoveryStrategy::Fail,
        }
    }
}

pub enum RecoveryStrategy {
    CreateNew,
    RetryAfter(Duration),
    RetryWithBackoff,
    RetryOnce,
    ClearCacheAndRetry,
    Fail,
}

pub async fn handle_error_with_recovery(
    error: ErrorType,
    context: &ExecutionContext,
) -> Result<()> {
    match error.recovery_strategy() {
        RecoveryStrategy::CreateNew => {
            log::info!("Creating new session after error");
            create_new_session(context).await
        }
        
        RecoveryStrategy::RetryAfter(duration) => {
            log::info!("Retrying after {:?}", duration);
            tokio::time::sleep(duration).await;
            retry_execution(context).await
        }
        
        RecoveryStrategy::RetryWithBackoff => {
            let mut delay = Duration::from_secs(1);
            for attempt in 0..3 {
                log::info!("Retry attempt {} after {:?}", attempt + 1, delay);
                tokio::time::sleep(delay).await;
                
                match retry_execution(context).await {
                    Ok(()) => return Ok(()),
                    Err(_) => delay *= 2,
                }
            }
            Err(anyhow!("Max retries exceeded"))
        }
        
        RecoveryStrategy::ClearCacheAndRetry => {
            clear_session_cache(&context.session_id).await?;
            retry_execution(context).await
        }
        
        _ => Err(anyhow!("Unrecoverable error: {:?}", error)),
    }
}
```

---

## Performance Optimizations

### Message Batching

```rust
pub struct MessageBatcher {
    batch_size: usize,
    batch_timeout: Duration,
    pending: Vec<ClaudeStreamMessage>,
    last_flush: Instant,
}

impl MessageBatcher {
    pub fn new(batch_size: usize, batch_timeout: Duration) -> Self {
        Self {
            batch_size,
            batch_timeout,
            pending: Vec::with_capacity(batch_size),
            last_flush: Instant::now(),
        }
    }
    
    pub async fn add_message(&mut self, msg: ClaudeStreamMessage) -> Option<Vec<ClaudeStreamMessage>> {
        self.pending.push(msg);
        
        // Check if we should flush
        if self.pending.len() >= self.batch_size ||
           self.last_flush.elapsed() >= self.batch_timeout {
            return Some(self.flush());
        }
        
        None
    }
    
    pub fn flush(&mut self) -> Vec<ClaudeStreamMessage> {
        let batch = std::mem::replace(&mut self.pending, Vec::with_capacity(self.batch_size));
        self.last_flush = Instant::now();
        batch
    }
}

// Usage in stream processing
let mut batcher = MessageBatcher::new(10, Duration::from_millis(100));

while let Some(line) = stream.next().await {
    if let Ok(msg) = parse_message(&line) {
        if let Some(batch) = batcher.add_message(msg).await {
            // Process batch
            process_message_batch(batch).await;
        }
    }
}

// Flush remaining
if !batcher.pending.is_empty() {
    process_message_batch(batcher.flush()).await;
}
```

### Lazy Message Rendering

```typescript
// Frontend optimization using React.memo and virtualization
const MessageList = React.memo(({ messages }: { messages: Message[] }) => {
    const parentRef = useRef<HTMLDivElement>(null);
    
    const virtualizer = useVirtualizer({
        count: messages.length,
        getScrollElement: () => parentRef.current,
        estimateSize: useCallback((index) => {
            // Estimate based on message type
            const msg = messages[index];
            if (msg.type === 'tool_use') return 200;
            if (msg.type === 'assistant') return 150;
            return 100;
        }, [messages]),
        overscan: 3,
        getItemKey: (index) => messages[index].id,
    });
    
    return (
        <div ref={parentRef} className="message-list">
            <div style={{ height: virtualizer.getTotalSize() }}>
                {virtualizer.getVirtualItems().map((virtualItem) => (
                    <MessageRenderer
                        key={virtualItem.key}
                        message={messages[virtualItem.index]}
                        style={{
                            position: 'absolute',
                            top: virtualItem.start,
                            left: 0,
                            width: '100%',
                        }}
                    />
                ))}
            </div>
        </div>
    );
});
```

---

## Implementation Guide

### Step-by-Step Migration Plan

#### Phase 1: Message Type System (Day 1-2)
```rust
// 1. Define all message types
mod messages {
    pub use super::{ClaudeStreamMessage, MessageContent, ContentBlock};
}

// 2. Create parser module
mod parser {
    pub struct MessageParser;
    impl MessageParser {
        pub fn parse(line: &str) -> Result<ClaudeStreamMessage>;
    }
}

// 3. Create tests
#[cfg(test)]
mod tests {
    #[test]
    fn test_parse_all_message_types() {
        // Test each message type
    }
}
```

#### Phase 2: Stream Processing (Day 3-4)
```rust
// 1. Implement stream reader
pub struct StreamReader {
    reader: BufReader<ChildStdout>,
    parser: JsonlParser,
}

// 2. Add event emission
pub struct EventEmitter {
    app: AppHandle,
}

// 3. Connect to frontend
impl EventEmitter {
    pub fn emit_message(&self, session_id: &str, msg: ClaudeStreamMessage);
}
```

#### Phase 3: Analytics Integration (Day 5-6)
```rust
// 1. Token tracking
pub struct TokenTracker {
    sessions: HashMap<String, SessionAnalytics>,
}

// 2. Cost calculation
impl TokenTracker {
    pub fn calculate_cost(&self, session_id: &str) -> f64;
}

// 3. Export analytics
impl TokenTracker {
    pub fn export_csv(&self, path: &Path) -> Result<()>;
}
```

#### Phase 4: Error Recovery (Day 7)
```rust
// 1. Error detection
pub struct ErrorDetector {
    patterns: Vec<ErrorPattern>,
}

// 2. Recovery execution
pub struct RecoveryExecutor {
    strategies: HashMap<ErrorType, RecoveryStrategy>,
}

// 3. Testing
#[cfg(test)]
mod recovery_tests {
    #[tokio::test]
    async fn test_session_recovery();
}
```

### Critical Success Factors

1. **Parse EVERY line** - Don't assume message order
2. **Handle partial messages** - Streaming means incomplete JSON
3. **Track session ID immediately** - First system message has it
4. **Buffer for performance** - But flush on completion
5. **Test error cases** - Network failures, timeouts, OOM
6. **Monitor memory** - Long sessions accumulate data
7. **Profile performance** - <16ms render target

This completes the message flow documentation. The system is complex but follows clear patterns. Get the parsing right and everything else follows.
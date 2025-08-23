# Session Extraction and Analytics Implementation Guide

## Critical: Session ID Extraction Pattern

### The 500ms Window Problem

Session ID ONLY appears in the first message from Claude CLI and must be extracted within 500ms or it's lost forever.

### Correct Implementation

```rust
use tokio::time::{timeout, Duration};
use tokio::io::{AsyncBufReadExt, BufReader};

pub async fn extract_session_id(child: &mut Child) -> Result<String, String> {
    let stdout = child.stdout.take()
        .ok_or("Failed to capture stdout")?;
    
    let mut reader = BufReader::new(stdout);
    let mut line = String::new();
    
    // CRITICAL: 500ms timeout
    let extraction = timeout(Duration::from_millis(500), async {
        while reader.read_line(&mut line).await? > 0 {
            // Look for init message
            if line.contains(r#""type":"system"#) && line.contains(r#""subtype":"init"#) {
                // Parse JSON
                if let Ok(json) = serde_json::from_str::<Value>(&line) {
                    if let Some(session_id) = json["session_id"].as_str() {
                        // Validate format: 26 alphanumeric characters
                        if session_id.len() == 26 && 
                           session_id.chars().all(|c| c.is_alphanumeric()) {
                            return Ok(session_id.to_string());
                        }
                    }
                }
            }
            line.clear();
        }
        Err("Session ID not found in stream")
    });
    
    match extraction.await {
        Ok(Ok(session_id)) => {
            // Put stdout back for continued reading
            child.stdout = Some(reader.into_inner());
            Ok(session_id)
        }
        Ok(Err(e)) => Err(format!("Extraction failed: {}", e)),
        Err(_) => {
            // Timeout - generate synthetic ID
            let synthetic_id = generate_synthetic_session_id();
            warn!("Session ID extraction timeout, using synthetic: {}", synthetic_id);
            child.stdout = Some(reader.into_inner());
            Ok(synthetic_id)
        }
    }
}

fn generate_synthetic_session_id() -> String {
    use rand::Rng;
    const CHARSET: &[u8] = b"abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789";
    let mut rng = rand::thread_rng();
    
    (0..26)
        .map(|_| {
            let idx = rng.gen_range(0..CHARSET.len());
            CHARSET[idx] as char
        })
        .collect()
}
```

### Session ID Format

```json
{
  "type": "system",
  "subtype": "init",
  "session_id": "aBc123XyZ456dEf789GhI012JkL",  // Exactly 26 alphanumeric chars
  "project_path": "/path/to/project"
}
```

## Token Analytics Implementation

### Critical: Always Accumulate, Never Replace

#### ❌ WRONG (Current yurucode bug)
```typescript
// This REPLACES the total, losing all previous tokens
session.analytics.tokens.total = message.output_tokens;
```

#### ✅ CORRECT
```typescript
// This ACCUMULATES tokens properly
session.analytics.tokens.total += message.output_tokens;
```

### Complete Analytics Implementation

```rust
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct SessionAnalytics {
    // Token metrics
    pub input_tokens: u64,
    pub output_tokens: u64,
    pub cache_read_tokens: u64,
    pub cache_creation_tokens: u64,
    pub total_tokens: u64,
    
    // Cost calculation
    pub input_cost: f64,
    pub output_cost: f64,
    pub cache_read_cost: f64,
    pub cache_creation_cost: f64,
    pub total_cost: f64,
    
    // Model-specific breakdown
    pub by_model: HashMap<String, ModelMetrics>,
    
    // Performance metrics
    pub message_count: u32,
    pub thinking_time_ms: u64,
    pub streaming_time_ms: u64,
    pub first_token_time_ms: u64,
    
    // Timestamps
    pub session_start: DateTime<Utc>,
    pub last_activity: DateTime<Utc>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ModelMetrics {
    pub model_name: String,
    pub input_tokens: u64,
    pub output_tokens: u64,
    pub cache_read_tokens: u64,
    pub cache_creation_tokens: u64,
    pub message_count: u32,
    pub total_cost: f64,
}

impl SessionAnalytics {
    pub fn new() -> Self {
        Self {
            input_tokens: 0,
            output_tokens: 0,
            cache_read_tokens: 0,
            cache_creation_tokens: 0,
            total_tokens: 0,
            input_cost: 0.0,
            output_cost: 0.0,
            cache_read_cost: 0.0,
            cache_creation_cost: 0.0,
            total_cost: 0.0,
            by_model: HashMap::new(),
            message_count: 0,
            thinking_time_ms: 0,
            streaming_time_ms: 0,
            first_token_time_ms: 0,
            session_start: Utc::now(),
            last_activity: Utc::now(),
        }
    }
    
    pub fn update_tokens(&mut self, update: TokenUpdate, model: &str) {
        // CRITICAL: Always accumulate
        self.input_tokens += update.input_tokens;
        self.output_tokens += update.output_tokens;
        self.cache_read_tokens += update.cache_read_tokens;
        self.cache_creation_tokens += update.cache_creation_tokens;
        
        // Update total
        self.total_tokens = self.input_tokens + self.output_tokens;
        
        // Update costs based on model
        let pricing = get_model_pricing(model);
        self.input_cost += update.input_tokens as f64 * pricing.input_per_million / 1_000_000.0;
        self.output_cost += update.output_tokens as f64 * pricing.output_per_million / 1_000_000.0;
        self.cache_read_cost += update.cache_read_tokens as f64 * pricing.cache_read_per_million / 1_000_000.0;
        self.cache_creation_cost += update.cache_creation_tokens as f64 * pricing.cache_creation_per_million / 1_000_000.0;
        
        self.total_cost = self.input_cost + self.output_cost + 
                         self.cache_read_cost + self.cache_creation_cost;
        
        // Update model-specific metrics
        let model_metrics = self.by_model.entry(model.to_string())
            .or_insert_with(|| ModelMetrics {
                model_name: model.to_string(),
                input_tokens: 0,
                output_tokens: 0,
                cache_read_tokens: 0,
                cache_creation_tokens: 0,
                message_count: 0,
                total_cost: 0.0,
            });
        
        model_metrics.input_tokens += update.input_tokens;
        model_metrics.output_tokens += update.output_tokens;
        model_metrics.cache_read_tokens += update.cache_read_tokens;
        model_metrics.cache_creation_tokens += update.cache_creation_tokens;
        model_metrics.message_count += 1;
        model_metrics.total_cost += 
            (update.input_tokens as f64 * pricing.input_per_million +
             update.output_tokens as f64 * pricing.output_per_million) / 1_000_000.0;
        
        // Update activity
        self.message_count += 1;
        self.last_activity = Utc::now();
    }
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct TokenUpdate {
    pub input_tokens: u64,
    pub output_tokens: u64,
    pub cache_read_tokens: u64,
    pub cache_creation_tokens: u64,
}

// Extract tokens from Claude stream
pub async fn extract_tokens_from_stream(json: &Value) -> Option<TokenUpdate> {
    if json["type"] == "token_usage" {
        Some(TokenUpdate {
            input_tokens: json["input_tokens"].as_u64().unwrap_or(0),
            output_tokens: json["output_tokens"].as_u64().unwrap_or(0),
            cache_read_tokens: json["cache_read_tokens"].as_u64().unwrap_or(0),
            cache_creation_tokens: json["cache_creation_tokens"].as_u64().unwrap_or(0),
        })
    } else {
        None
    }
}
```

### Frontend Analytics Integration

```typescript
// src/renderer/stores/claudeCodeStore.ts

interface SessionAnalytics {
    tokens: {
        input: number;
        output: number;
        cache_read: number;
        cache_creation: number;
        total: number;
    };
    cost: {
        input: number;
        output: number;
        cache_read: number;
        cache_creation: number;
        total: number;
    };
    byModel: Map<string, ModelMetrics>;
    messageCount: number;
    thinkingTime: number;
    streamingTime: number;
    sessionStart: Date;
    lastActivity: Date;
}

// CRITICAL: Token update function with accumulation
function updateSessionTokens(sessionId: string, tokenUpdate: TokenUpdate) {
    const session = sessions.find(s => s.id === sessionId);
    if (!session?.analytics) return;
    
    // ACCUMULATE, don't replace
    session.analytics.tokens.input += tokenUpdate.input || 0;
    session.analytics.tokens.output += tokenUpdate.output || 0;
    session.analytics.tokens.cache_read += tokenUpdate.cache_read || 0;
    session.analytics.tokens.cache_creation += tokenUpdate.cache_creation || 0;
    
    // Recalculate total
    session.analytics.tokens.total = 
        session.analytics.tokens.input + 
        session.analytics.tokens.output;
    
    // Update costs
    const pricing = getModelPricing(session.model);
    session.analytics.cost.input += 
        (tokenUpdate.input || 0) * pricing.inputPerMillion / 1_000_000;
    session.analytics.cost.output += 
        (tokenUpdate.output || 0) * pricing.outputPerMillion / 1_000_000;
    session.analytics.cost.cache_read += 
        (tokenUpdate.cache_read || 0) * pricing.cacheReadPerMillion / 1_000_000;
    session.analytics.cost.cache_creation += 
        (tokenUpdate.cache_creation || 0) * pricing.cacheCreationPerMillion / 1_000_000;
    
    session.analytics.cost.total = 
        session.analytics.cost.input +
        session.analytics.cost.output +
        session.analytics.cost.cache_read +
        session.analytics.cost.cache_creation;
    
    // Update activity
    session.analytics.messageCount++;
    session.analytics.lastActivity = new Date();
}
```

## Session File Structure

### Location Pattern
```
~/.claude/projects/[encoded_project_path]/[session_id].jsonl
```

### Encoding/Decoding Project Paths

```rust
pub fn encode_project_path(path: &str) -> String {
    // Replace special characters with underscores
    path.replace('/', "_")
        .replace('\\', "_")
        .replace(':', "_")
        .replace(' ', "_")
        .to_lowercase()
}

pub fn decode_project_path(encoded: &str) -> Option<String> {
    // Read first line of any session file to get actual path
    let session_files = std::fs::read_dir(format!("~/.claude/projects/{}", encoded)).ok()?;
    
    for entry in session_files {
        if let Ok(entry) = entry {
            if entry.path().extension() == Some("jsonl") {
                // Read first line
                if let Ok(first_line) = read_first_line(&entry.path()) {
                    if let Ok(json) = serde_json::from_str::<Value>(&first_line) {
                        if let Some(path) = json["project_path"].as_str() {
                            return Some(path.to_string());
                        }
                    }
                }
            }
        }
    }
    
    None
}
```

### JSONL Session File Format

```jsonl
{"type":"system","subtype":"init","session_id":"abc...","project_path":"/Users/name/project","timestamp":"2024-01-01T00:00:00Z"}
{"type":"message","message":{"role":"user","content":"Hello"},"timestamp":"2024-01-01T00:00:01Z"}
{"type":"message","message":{"role":"assistant","content":"Hi!"},"timestamp":"2024-01-01T00:00:02Z"}
{"type":"token_usage","input_tokens":10,"output_tokens":5,"cache_read_tokens":0,"cache_creation_tokens":0}
...
```

## Session Lifecycle States

```rust
#[derive(Debug, Clone, Serialize, Deserialize)]
pub enum SessionState {
    // Session created but no messages sent
    Created,
    
    // Waiting for Claude to respond
    Initializing,
    
    // Claude is processing (thinking)
    Thinking { start_time: DateTime<Utc> },
    
    // Claude is streaming response
    Streaming { 
        start_time: DateTime<Utc>,
        first_token_time: Option<DateTime<Utc>>,
        tokens_streamed: u64,
    },
    
    // Session is idle, waiting for user
    Idle { last_activity: DateTime<Utc> },
    
    // Session is being resumed
    Resuming { original_session_id: String },
    
    // Session encountered an error
    Error { error: String, can_retry: bool },
    
    // Session was interrupted by user
    Interrupted { at_token: u64 },
    
    // Session completed successfully
    Completed { total_duration: Duration },
}

impl SessionState {
    pub fn transition(&mut self, event: SessionEvent) -> Result<(), String> {
        use SessionState::*;
        use SessionEvent::*;
        
        match (self.clone(), event) {
            (Created, MessageSent) => {
                *self = Initializing;
                Ok(())
            }
            (Initializing, ThinkingStarted) => {
                *self = Thinking { start_time: Utc::now() };
                Ok(())
            }
            (Thinking { .. }, StreamingStarted) => {
                *self = Streaming {
                    start_time: Utc::now(),
                    first_token_time: None,
                    tokens_streamed: 0,
                };
                Ok(())
            }
            (Streaming { start_time, mut first_token_time, tokens_streamed }, TokenReceived) => {
                if first_token_time.is_none() {
                    first_token_time = Some(Utc::now());
                }
                *self = Streaming {
                    start_time,
                    first_token_time,
                    tokens_streamed: tokens_streamed + 1,
                };
                Ok(())
            }
            (Streaming { start_time, .. }, StreamingComplete) => {
                let duration = Utc::now() - start_time;
                *self = Idle { last_activity: Utc::now() };
                Ok(())
            }
            (_, UserInterrupted) => {
                *self = Interrupted { at_token: 0 }; // Set actual token count
                Ok(())
            }
            (_, ErrorOccurred(error)) => {
                *self = Error { 
                    error,
                    can_retry: true // Determine based on error type
                };
                Ok(())
            }
            _ => Err("Invalid state transition".to_string())
        }
    }
}
```

## Thinking Time Tracking

```rust
pub struct ThinkingTracker {
    sessions: Arc<Mutex<HashMap<String, ThinkingMetrics>>>,
}

#[derive(Debug, Clone)]
struct ThinkingMetrics {
    thinking_start: Option<Instant>,
    total_thinking_ms: u64,
    thinking_blocks: Vec<ThinkingBlock>,
}

#[derive(Debug, Clone)]
struct ThinkingBlock {
    start: DateTime<Utc>,
    end: DateTime<Utc>,
    duration_ms: u64,
    token_count: u64,
}

impl ThinkingTracker {
    pub fn start_thinking(&self, session_id: &str) {
        let mut sessions = self.sessions.lock().unwrap();
        let metrics = sessions.entry(session_id.to_string())
            .or_insert_with(|| ThinkingMetrics {
                thinking_start: None,
                total_thinking_ms: 0,
                thinking_blocks: Vec::new(),
            });
        
        metrics.thinking_start = Some(Instant::now());
    }
    
    pub fn end_thinking(&self, session_id: &str) {
        let mut sessions = self.sessions.lock().unwrap();
        if let Some(metrics) = sessions.get_mut(session_id) {
            if let Some(start) = metrics.thinking_start.take() {
                let duration = start.elapsed().as_millis() as u64;
                metrics.total_thinking_ms += duration;
                
                metrics.thinking_blocks.push(ThinkingBlock {
                    start: Utc::now() - chrono::Duration::milliseconds(duration as i64),
                    end: Utc::now(),
                    duration_ms: duration,
                    token_count: 0, // Update when tokens received
                });
            }
        }
    }
    
    pub fn get_total_thinking_time(&self, session_id: &str) -> u64 {
        self.sessions.lock().unwrap()
            .get(session_id)
            .map(|m| m.total_thinking_ms)
            .unwrap_or(0)
    }
}
```

## Model-Specific Analytics

```rust
pub struct ModelPricing {
    pub input_per_million: f64,
    pub output_per_million: f64,
    pub cache_read_per_million: f64,
    pub cache_creation_per_million: f64,
}

pub fn get_model_pricing(model: &str) -> ModelPricing {
    match model {
        "claude-3-5-sonnet-20241022" => ModelPricing {
            input_per_million: 3.00,
            output_per_million: 15.00,
            cache_read_per_million: 0.30,
            cache_creation_per_million: 3.75,
        },
        "claude-3-opus-20240229" => ModelPricing {
            input_per_million: 15.00,
            output_per_million: 75.00,
            cache_read_per_million: 1.50,
            cache_creation_per_million: 18.75,
        },
        "claude-3-haiku-20240307" => ModelPricing {
            input_per_million: 0.25,
            output_per_million: 1.25,
            cache_read_per_million: 0.03,
            cache_creation_per_million: 0.30,
        },
        _ => ModelPricing {
            input_per_million: 3.00,
            output_per_million: 15.00,
            cache_read_per_million: 0.30,
            cache_creation_per_million: 3.75,
        }
    }
}
```

## Critical Implementation Details

### 1. Session ID Must Be Extracted First
```rust
// RIGHT ORDER:
1. Spawn process
2. Register in ProcessRegistry
3. Extract session ID (500ms timeout)
4. Update registry with real session ID
5. Start streaming

// WRONG ORDER (will fail):
1. Spawn process
2. Start streaming (session ID lost!)
3. Try to extract session ID (too late)
```

### 2. Token Accumulation Pattern
```rust
// ALWAYS use this pattern:
analytics.tokens += new_tokens;  // Accumulate

// NEVER use this pattern:
analytics.tokens = new_tokens;   // Replace (WRONG!)
```

### 3. Session Resume Validation
```rust
pub async fn can_resume_session(session_id: &str) -> bool {
    // Check session file exists
    let session_path = get_session_path(session_id);
    if !session_path.exists() {
        return false;
    }
    
    // Check not locked by another process
    if is_session_locked(&session_path) {
        return false;
    }
    
    // Check session not corrupted
    if !validate_session_file(&session_path) {
        return false;
    }
    
    // Check session ID format
    if !is_valid_session_id(session_id) {
        return false;
    }
    
    true
}
```

### 4. Error Recovery
```rust
pub enum SessionError {
    ExtractionTimeout,      // Retry with synthetic ID
    InvalidSessionId,       // Create new session
    SessionLocked,         // Wait or create new
    SessionCorrupted,      // Create new session
    ProcessCrashed,        // Restart process
    TokenParsingFailed,    // Log and continue
}

impl SessionError {
    pub fn recovery_action(&self) -> RecoveryAction {
        match self {
            Self::ExtractionTimeout => RecoveryAction::UseSyntheticId,
            Self::InvalidSessionId => RecoveryAction::CreateNewSession,
            Self::SessionLocked => RecoveryAction::WaitAndRetry,
            Self::SessionCorrupted => RecoveryAction::CreateNewSession,
            Self::ProcessCrashed => RecoveryAction::RestartProcess,
            Self::TokenParsingFailed => RecoveryAction::LogAndContinue,
        }
    }
}
```

## Testing Session Extraction

```rust
#[cfg(test)]
mod tests {
    use super::*;
    
    #[tokio::test]
    async fn test_session_extraction_success() {
        let mock_stdout = r#"
{"type":"system","subtype":"init","session_id":"abcdefghijklmnopqrstuvwxyz"}
{"type":"message","message":{"role":"assistant","content":"Hello!"}}
        "#;
        
        let session_id = extract_session_id_from_mock(mock_stdout).await.unwrap();
        assert_eq!(session_id, "abcdefghijklmnopqrstuvwxyz");
    }
    
    #[tokio::test]
    async fn test_session_extraction_timeout() {
        // Simulate slow response
        let session_id = extract_with_timeout(100).await;
        assert!(session_id.is_ok());
        // Should have synthetic ID
        assert_eq!(session_id.unwrap().len(), 26);
    }
    
    #[tokio::test]
    async fn test_token_accumulation() {
        let mut analytics = SessionAnalytics::new();
        
        // First update
        analytics.update_tokens(TokenUpdate {
            input_tokens: 100,
            output_tokens: 50,
            cache_read_tokens: 10,
            cache_creation_tokens: 5,
        }, "claude-3-5-sonnet");
        
        assert_eq!(analytics.input_tokens, 100);
        assert_eq!(analytics.total_tokens, 150);
        
        // Second update (should accumulate)
        analytics.update_tokens(TokenUpdate {
            input_tokens: 200,
            output_tokens: 100,
            cache_read_tokens: 20,
            cache_creation_tokens: 10,
        }, "claude-3-5-sonnet");
        
        assert_eq!(analytics.input_tokens, 300);
        assert_eq!(analytics.output_tokens, 150);
        assert_eq!(analytics.total_tokens, 450);
    }
}
```

## Conclusion

Proper session extraction and analytics are CRITICAL for yurucode to function correctly. The key points:

1. **Extract session ID within 500ms** or it's lost
2. **Always accumulate tokens** with `+=`, never replace
3. **Validate session before resuming** to prevent errors
4. **Track all metrics** for comprehensive analytics
5. **Handle errors gracefully** with appropriate recovery

Following these patterns ensures reliable session management and accurate analytics tracking.
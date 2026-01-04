use anyhow::Result;
use serde::{Deserialize, Serialize};
use serde_json::Value;
use std::collections::HashMap;
use tracing::{debug, error, info, warn};

// ============================================================================
// Supporting types for enriched message parsing (matching SDK types)
// ============================================================================

/// Usage statistics included in result messages
#[derive(Debug, Clone, Default, Serialize, Deserialize)]
pub struct ResultUsage {
    #[serde(default)]
    pub input_tokens: u32,
    #[serde(default)]
    pub output_tokens: u32,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub cache_creation_input_tokens: Option<u32>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub cache_read_input_tokens: Option<u32>,
}

/// Per-model usage statistics
#[derive(Debug, Clone, Default, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ModelUsage {
    #[serde(default)]
    pub input_tokens: u32,
    #[serde(default)]
    pub output_tokens: u32,
    #[serde(default)]
    pub cache_read_input_tokens: u32,
    #[serde(default)]
    pub cache_creation_input_tokens: u32,
    #[serde(default)]
    pub web_search_requests: u32,
    #[serde(default)]
    pub cost_usd: f64,
    #[serde(default)]
    pub context_window: u32,
}

/// Information about a denied tool use
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct PermissionDenial {
    pub tool_name: String,
    pub tool_use_id: String,
    #[serde(default)]
    pub tool_input: Value,
}

/// Metadata for compact boundary messages
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct CompactMetadata {
    pub trigger: String, // "manual" | "auto"
    #[serde(default)]
    pub pre_tokens: u32,
}

/// Represents all possible message types from Claude's stream-json output
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(tag = "type")]
pub enum ClaudeStreamMessage {
    /// System messages (init, compact_boundary, etc.)
    #[serde(rename = "system")]
    System {
        subtype: String,
        #[serde(skip_serializing_if = "Option::is_none")]
        session_id: Option<String>,
        #[serde(skip_serializing_if = "Option::is_none")]
        uuid: Option<String>,
        #[serde(skip_serializing_if = "Option::is_none")]
        message: Option<String>,
        /// Present when subtype is "compact_boundary"
        #[serde(skip_serializing_if = "Option::is_none")]
        compact_metadata: Option<CompactMetadata>,
        /// Tools available (present in init)
        #[serde(skip_serializing_if = "Option::is_none")]
        tools: Option<Vec<String>>,
        /// Current model (present in init)
        #[serde(skip_serializing_if = "Option::is_none")]
        model: Option<String>,
        /// Current working directory (present in init)
        #[serde(skip_serializing_if = "Option::is_none")]
        cwd: Option<String>,
        /// Permission mode (present in init)
        #[serde(skip_serializing_if = "Option::is_none")]
        #[serde(rename = "permissionMode")]
        permission_mode: Option<String>,
    },

    /// Text content from Claude
    #[serde(rename = "text")]
    Text { 
        content: String,
        #[serde(skip_serializing_if = "Option::is_none")]
        id: Option<String>,
    },

    /// Token usage statistics
    #[serde(rename = "usage")]
    Usage {
        input_tokens: u32,
        output_tokens: u32,
        #[serde(skip_serializing_if = "Option::is_none")]
        cache_creation_input_tokens: Option<u32>,
        #[serde(skip_serializing_if = "Option::is_none")]
        cache_read_input_tokens: Option<u32>,
    },

    /// Tool use request from Claude
    #[serde(rename = "tool_use")]
    ToolUse {
        id: String,
        name: String,
        input: Value,
    },

    /// Tool result to send back
    #[serde(rename = "tool_result")]
    ToolResult {
        tool_use_id: String,
        content: String,
        #[serde(default)]
        is_error: bool,
    },

    /// Assistant message metadata
    #[serde(rename = "assistant")]
    AssistantMessage {
        message: Value, // The nested message object
        #[serde(skip_serializing_if = "Option::is_none")]
        parent_tool_use_id: Option<String>,
        #[serde(skip_serializing_if = "Option::is_none")]
        session_id: Option<String>,
        #[serde(skip_serializing_if = "Option::is_none")]
        uuid: Option<String>,
    },

    /// User message
    #[serde(rename = "user")]
    UserMessage {
        message: Value, // The nested message object
        #[serde(skip_serializing_if = "Option::is_none")]
        parent_tool_use_id: Option<String>,
        #[serde(skip_serializing_if = "Option::is_none")]
        session_id: Option<String>,
        #[serde(skip_serializing_if = "Option::is_none")]
        uuid: Option<String>,
    },

    /// Thinking indicator
    #[serde(rename = "thinking")]
    Thinking {
        #[serde(default)]
        is_thinking: bool,
        #[serde(skip_serializing_if = "Option::is_none")]
        thought: Option<String>,
    },

    /// Message stop indicator
    #[serde(rename = "message_stop")]
    MessageStop,

    /// Error message
    #[serde(rename = "error")]
    Error { 
        message: String,
        #[serde(skip_serializing_if = "Option::is_none")]
        code: Option<String>,
    },

    /// Interrupt signal
    #[serde(rename = "interrupt")]
    Interrupt,

    /// Result message (completion status) - enriched with SDK fields
    #[serde(rename = "result")]
    Result {
        /// Result subtype: "success", "error_max_turns", "error_during_execution",
        /// "error_max_budget_usd", "error_max_structured_output_retries"
        #[serde(skip_serializing_if = "Option::is_none")]
        subtype: Option<String>,
        /// Unique identifier for this message
        #[serde(skip_serializing_if = "Option::is_none")]
        uuid: Option<String>,
        /// Session identifier
        #[serde(skip_serializing_if = "Option::is_none")]
        session_id: Option<String>,
        /// Total execution duration in milliseconds
        #[serde(skip_serializing_if = "Option::is_none")]
        duration_ms: Option<u64>,
        /// API call duration in milliseconds
        #[serde(skip_serializing_if = "Option::is_none")]
        duration_api_ms: Option<u64>,
        /// Whether the result is an error
        #[serde(default)]
        is_error: bool,
        /// Number of conversation turns
        #[serde(skip_serializing_if = "Option::is_none")]
        num_turns: Option<u32>,
        /// Final result text (for success)
        #[serde(skip_serializing_if = "Option::is_none")]
        result: Option<String>,
        /// Total cost in USD
        #[serde(skip_serializing_if = "Option::is_none")]
        total_cost_usd: Option<f64>,
        /// Aggregated token usage
        #[serde(skip_serializing_if = "Option::is_none")]
        usage: Option<ResultUsage>,
        /// Per-model usage breakdown
        #[serde(skip_serializing_if = "Option::is_none")]
        #[serde(rename = "modelUsage")]
        model_usage: Option<HashMap<String, ModelUsage>>,
        /// List of permission denials during execution
        #[serde(default, skip_serializing_if = "Vec::is_empty")]
        permission_denials: Vec<PermissionDenial>,
        /// Structured output (when using --json-schema)
        #[serde(skip_serializing_if = "Option::is_none")]
        structured_output: Option<Value>,
        /// Error messages (for error subtypes)
        #[serde(default, skip_serializing_if = "Vec::is_empty")]
        errors: Vec<String>,
        // Legacy fields for backward compatibility
        #[serde(skip_serializing_if = "Option::is_none")]
        status: Option<String>,
        #[serde(skip_serializing_if = "Option::is_none")]
        error: Option<String>,
    },

    /// Streaming partial message (when using --include-partial-messages)
    #[serde(rename = "stream_event")]
    StreamEvent {
        /// The raw streaming event from Anthropic API
        event: Value,
        /// Parent tool use ID if within a subagent
        #[serde(skip_serializing_if = "Option::is_none")]
        parent_tool_use_id: Option<String>,
        /// Unique identifier
        #[serde(skip_serializing_if = "Option::is_none")]
        uuid: Option<String>,
        /// Session identifier
        #[serde(skip_serializing_if = "Option::is_none")]
        session_id: Option<String>,
    },

    /// Raw/unknown message type
    #[serde(rename = "raw")]
    Raw {
        raw_type: String,
        data: Value,
    },
}

/// Maximum buffer size to prevent memory issues (100KB)
const MAX_BUFFER_SIZE: usize = 100_000;

/// Parser for Claude's stream-json output
pub struct StreamParser {
    /// Buffer for incomplete JSON lines
    buffer: String,
    /// Current nesting depth for JSON objects
    json_depth: i32,
    /// Whether we're currently in a string literal
    in_string: bool,
    /// Previous character for escape sequence handling
    last_char: Option<char>,
}

impl StreamParser {
    pub fn new() -> Self {
        Self {
            buffer: String::new(),
            json_depth: 0,
            in_string: false,
            last_char: None,
        }
    }

    /// Processes a line of output from Claude
    pub fn process_line(&mut self, line: &str) -> Result<Option<ClaudeStreamMessage>> {
        debug!("Processing line: {}", line);

        // Handle special case: $ terminator
        if line.trim() == "$" {
            debug!("Received $ terminator");
            return Ok(Some(ClaudeStreamMessage::MessageStop));
        }

        // Try to parse as complete JSON first
        if let Ok(json) = serde_json::from_str::<Value>(line) {
            return self.parse_json_to_message(json);
        }

        // Check buffer size before appending to prevent memory issues
        let new_size = self.buffer.len() + line.len() + 1; // +1 for newline
        if new_size > MAX_BUFFER_SIZE {
            // Clear buffer and return error to prevent memory exhaustion
            self.clear_buffer();
            return Err(anyhow::anyhow!(
                "Buffer size limit exceeded ({} bytes). Clearing buffer to prevent memory issues.",
                new_size
            ));
        }

        // If not complete JSON, add to buffer
        self.buffer.push_str(line);
        self.buffer.push('\n');

        // Check if we have a complete JSON object
        if self.is_complete_json() {
            let complete_json = self.buffer.clone();
            self.buffer.clear();
            self.reset_json_state();

            if let Ok(json) = serde_json::from_str::<Value>(&complete_json) {
                return self.parse_json_to_message(json);
            } else {
                warn!("Failed to parse buffered JSON: {}", complete_json);
            }
        }

        Ok(None)
    }

    /// Checks if the buffer contains a complete JSON object
    fn is_complete_json(&mut self) -> bool {
        // Reset state before checking - important for multi-line fragments
        self.reset_json_state();

        let mut prev_was_escape = false;

        for ch in self.buffer.chars() {
            if prev_was_escape {
                // This character is escaped, skip it entirely
                prev_was_escape = false;
                self.last_char = Some(ch);
                continue;
            }

            // Check for escape character (only valid inside strings)
            if ch == '\\' && self.in_string {
                prev_was_escape = true;
                self.last_char = Some(ch);
                continue;
            }

            // Track string boundaries (unescaped quotes)
            if ch == '"' {
                self.in_string = !self.in_string;
            }

            // Track JSON nesting depth (only outside strings)
            if !self.in_string {
                match ch {
                    '{' | '[' => self.json_depth += 1,
                    '}' | ']' => self.json_depth -= 1,
                    _ => {}
                }
            }

            self.last_char = Some(ch);
        }

        // Complete if we've returned to depth 0
        self.json_depth == 0 && !self.buffer.is_empty()
    }

    /// Resets JSON parsing state
    fn reset_json_state(&mut self) {
        self.json_depth = 0;
        self.in_string = false;
        self.last_char = None;
    }

    /// Parses a JSON value into a ClaudeStreamMessage
    fn parse_json_to_message(&self, json: Value) -> Result<Option<ClaudeStreamMessage>> {
        // Check the message type and handle accordingly
        if let Some(msg_type) = json.get("type").and_then(|v| v.as_str()) {
            match msg_type {
                "assistant" | "user" => {
                    // These have nested message objects, pass through as Raw for now
                    // The frontend will handle the transformation
                    debug!("Passing through {} message as Raw", msg_type);
                    return Ok(Some(ClaudeStreamMessage::Raw {
                        raw_type: msg_type.to_string(),
                        data: json,
                    }));
                }
                _ => {
                    // Try to deserialize other message types normally
                    if let Ok(message) = serde_json::from_value::<ClaudeStreamMessage>(json.clone()) {
                        debug!("Parsed message: {:?}", message);
                        return Ok(Some(message));
                    }
                    
                    // If that fails, handle as raw
                    warn!("Unknown message type: {}", msg_type);
                    return Ok(Some(ClaudeStreamMessage::Raw {
                        raw_type: msg_type.to_string(),
                        data: json,
                    }));
                }
            }
        }

        // If no type field, log and skip
        debug!("JSON message without type field: {:?}", json);
        Ok(None)
    }

    /// Clears the parser buffer
    pub fn clear_buffer(&mut self) {
        self.buffer.clear();
        self.reset_json_state();
    }
}

impl Default for StreamParser {
    fn default() -> Self {
        Self::new()
    }
}

/// Token accumulator for tracking usage statistics
#[derive(Debug, Clone, Default, Serialize, Deserialize)]
pub struct TokenAccumulator {
    pub total_input_tokens: u32,
    pub total_output_tokens: u32,
    pub total_cache_creation_tokens: u32,
    pub total_cache_read_tokens: u32,
    pub messages_processed: u32,
}

impl TokenAccumulator {
    pub fn new() -> Self {
        Self::default()
    }

    /// Accumulates tokens from a usage message
    /// CRITICAL: Always use += for accumulation
    pub fn accumulate(&mut self, usage: &ClaudeStreamMessage) {
        if let ClaudeStreamMessage::Usage {
            input_tokens,
            output_tokens,
            cache_creation_input_tokens,
            cache_read_input_tokens,
        } = usage
        {
            // ALWAYS use += for accumulation
            self.total_input_tokens += input_tokens;
            self.total_output_tokens += output_tokens;
            
            if let Some(cache_creation) = cache_creation_input_tokens {
                self.total_cache_creation_tokens += cache_creation;
            }
            
            if let Some(cache_read) = cache_read_input_tokens {
                self.total_cache_read_tokens += cache_read;
            }
            
            self.messages_processed += 1;
            
            debug!(
                "Token accumulation - Input: {} (+{}), Output: {} (+{})",
                self.total_input_tokens, input_tokens,
                self.total_output_tokens, output_tokens
            );
        }
    }

    /// Gets the total token count
    pub fn total_tokens(&self) -> u32 {
        let total = self.total_input_tokens + self.total_output_tokens + 
                   self.total_cache_creation_tokens + self.total_cache_read_tokens;
        if total > 0 {
            info!("Token totals - Input: {}, Output: {}, Cache Creation: {}, Cache Read: {}, Total: {}",
                self.total_input_tokens, self.total_output_tokens, 
                self.total_cache_creation_tokens, self.total_cache_read_tokens, total);
        }
        total
    }

    /// Resets all counters
    pub fn reset(&mut self) {
        *self = Self::default();
    }
}

/// Stream processor that handles a full Claude session
pub struct StreamProcessor {
    parser: StreamParser,
    accumulator: TokenAccumulator,
    session_id: Option<String>,
    is_streaming: bool,
}

impl StreamProcessor {
    pub fn new() -> Self {
        Self {
            parser: StreamParser::new(),
            accumulator: TokenAccumulator::new(),
            session_id: None,
            is_streaming: false,
        }
    }

    /// Processes a line and returns the parsed message
    pub async fn process_line(&mut self, line: &str) -> Result<Option<ClaudeStreamMessage>> {
        // First check if line contains usage data and extract it
        if let Ok(json) = serde_json::from_str::<Value>(line) {
            if let Some(usage_obj) = json.get("usage") {
                if let Ok(usage_val) = serde_json::from_value::<serde_json::Value>(usage_obj.clone()) {
                    let input_tokens = usage_val.get("input_tokens")
                        .and_then(|v| v.as_u64())
                        .map(|v| v as u32)
                        .unwrap_or(0);
                    let output_tokens = usage_val.get("output_tokens")
                        .and_then(|v| v.as_u64())
                        .map(|v| v as u32)
                        .unwrap_or(0);
                    let cache_creation = usage_val.get("cache_creation_input_tokens")
                        .and_then(|v| v.as_u64())
                        .map(|v| v as u32);
                    let cache_read = usage_val.get("cache_read_input_tokens")
                        .and_then(|v| v.as_u64())
                        .map(|v| v as u32);
                    
                    if input_tokens > 0 || output_tokens > 0 {
                        info!("Extracted usage from line: input={}, output={}, cache_creation={:?}, cache_read={:?}", 
                            input_tokens, output_tokens, cache_creation, cache_read);
                        
                        // Accumulate the tokens directly
                        let usage_msg = ClaudeStreamMessage::Usage {
                            input_tokens,
                            output_tokens,
                            cache_creation_input_tokens: cache_creation,
                            cache_read_input_tokens: cache_read,
                        };
                        self.accumulator.accumulate(&usage_msg);
                    }
                }
            }
        }
        
        // Now process the line normally for message parsing
        let message = self.parser.process_line(line)?;

        if let Some(ref msg) = message {
            // Handle different message types
            match msg {
                ClaudeStreamMessage::System { subtype, session_id, .. } => {
                    if subtype == "init" {
                        if let Some(id) = session_id {
                            self.session_id = Some(id.clone());
                            info!("Session initialized: {}", id);
                        }
                    }
                }
                ClaudeStreamMessage::Usage { .. } => {
                    // Already accumulated above if it came from usage field
                    self.accumulator.accumulate(msg);
                }
                ClaudeStreamMessage::MessageStop => {
                    self.is_streaming = false;
                    info!("Message complete, streaming stopped");
                }
                ClaudeStreamMessage::Error { message, .. } => {
                    error!("Claude error: {}", message);
                    self.is_streaming = false;
                }
                _ => {}
            }
        }

        Ok(message)
    }

    /// Starts streaming (sets the flag)
    pub fn start_streaming(&mut self) {
        self.is_streaming = true;
        debug!("Streaming started");
    }

    /// Checks if currently streaming
    pub fn is_streaming(&self) -> bool {
        self.is_streaming
    }

    /// Gets the current session ID
    pub fn session_id(&self) -> Option<&str> {
        self.session_id.as_deref()
    }

    /// Gets the token accumulator
    pub fn tokens(&self) -> &TokenAccumulator {
        &self.accumulator
    }

    /// Resets the processor for a new session
    pub fn reset(&mut self) {
        self.parser.clear_buffer();
        self.accumulator.reset();
        self.session_id = None;
        self.is_streaming = false;
    }
}

impl Default for StreamProcessor {
    fn default() -> Self {
        Self::new()
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_parse_system_message() {
        let json = r#"{"type":"system","subtype":"init","session_id":"abc123"}"#;
        let mut parser = StreamParser::new();
        let result = parser.process_line(json).unwrap();
        
        assert!(matches!(
            result,
            Some(ClaudeStreamMessage::System { subtype, .. }) if subtype == "init"
        ));
    }

    #[test]
    fn test_parse_text_message() {
        let json = r#"{"type":"text","content":"Hello, world!"}"#;
        let mut parser = StreamParser::new();
        let result = parser.process_line(json).unwrap();
        
        assert!(matches!(
            result,
            Some(ClaudeStreamMessage::Text { content, .. }) if content == "Hello, world!"
        ));
    }

    #[test]
    fn test_parse_usage_message() {
        let json = r#"{"type":"usage","input_tokens":100,"output_tokens":200}"#;
        let mut parser = StreamParser::new();
        let result = parser.process_line(json).unwrap();
        
        assert!(matches!(
            result,
            Some(ClaudeStreamMessage::Usage { input_tokens: 100, output_tokens: 200, .. })
        ));
    }

    #[test]
    fn test_token_accumulation() {
        let mut accumulator = TokenAccumulator::new();
        
        let usage1 = ClaudeStreamMessage::Usage {
            input_tokens: 100,
            output_tokens: 200,
            cache_creation_input_tokens: Some(50),
            cache_read_input_tokens: None,
        };
        
        let usage2 = ClaudeStreamMessage::Usage {
            input_tokens: 150,
            output_tokens: 250,
            cache_creation_input_tokens: None,
            cache_read_input_tokens: Some(75),
        };
        
        accumulator.accumulate(&usage1);
        accumulator.accumulate(&usage2);
        
        assert_eq!(accumulator.total_input_tokens, 250);
        assert_eq!(accumulator.total_output_tokens, 450);
        assert_eq!(accumulator.total_cache_creation_tokens, 50);
        assert_eq!(accumulator.total_cache_read_tokens, 75);
        assert_eq!(accumulator.total_tokens(), 825);
    }

    #[test]
    fn test_fragmented_json() {
        let mut parser = StreamParser::new();
        
        // First fragment
        let result1 = parser.process_line(r#"{"type":"text","#).unwrap();
        assert!(result1.is_none());
        
        // Second fragment completes the JSON
        let result2 = parser.process_line(r#""content":"Hello"}"#).unwrap();
        assert!(matches!(
            result2,
            Some(ClaudeStreamMessage::Text { content, .. }) if content == "Hello"
        ));
    }

    #[test]
    fn test_dollar_terminator() {
        let mut parser = StreamParser::new();
        let result = parser.process_line("$").unwrap();

        assert!(matches!(result, Some(ClaudeStreamMessage::MessageStop)));
    }

    #[test]
    fn test_parse_enriched_result_success() {
        let json = r#"{
            "type": "result",
            "subtype": "success",
            "uuid": "msg-123",
            "session_id": "sess-456",
            "duration_ms": 5000,
            "duration_api_ms": 4500,
            "is_error": false,
            "num_turns": 3,
            "result": "Task completed successfully",
            "total_cost_usd": 0.05,
            "usage": {
                "input_tokens": 1000,
                "output_tokens": 500,
                "cache_creation_input_tokens": 100,
                "cache_read_input_tokens": 200
            }
        }"#;
        let mut parser = StreamParser::new();
        let result = parser.process_line(json).unwrap();

        match result {
            Some(ClaudeStreamMessage::Result {
                subtype,
                is_error,
                num_turns,
                total_cost_usd,
                usage,
                ..
            }) => {
                assert_eq!(subtype, Some("success".to_string()));
                assert!(!is_error);
                assert_eq!(num_turns, Some(3));
                assert_eq!(total_cost_usd, Some(0.05));
                assert!(usage.is_some());
                let u = usage.unwrap();
                assert_eq!(u.input_tokens, 1000);
                assert_eq!(u.output_tokens, 500);
            }
            _ => panic!("Expected Result message"),
        }
    }

    #[test]
    fn test_parse_result_error() {
        let json = r#"{
            "type": "result",
            "subtype": "error_max_turns",
            "is_error": true,
            "num_turns": 10,
            "errors": ["Maximum turns exceeded"]
        }"#;
        let mut parser = StreamParser::new();
        let result = parser.process_line(json).unwrap();

        match result {
            Some(ClaudeStreamMessage::Result {
                subtype,
                is_error,
                errors,
                ..
            }) => {
                assert_eq!(subtype, Some("error_max_turns".to_string()));
                assert!(is_error);
                assert_eq!(errors.len(), 1);
                assert_eq!(errors[0], "Maximum turns exceeded");
            }
            _ => panic!("Expected Result message"),
        }
    }

    #[test]
    fn test_parse_compact_boundary() {
        let json = r#"{
            "type": "system",
            "subtype": "compact_boundary",
            "uuid": "msg-789",
            "session_id": "sess-456",
            "compact_metadata": {
                "trigger": "auto",
                "pre_tokens": 50000
            }
        }"#;
        let mut parser = StreamParser::new();
        let result = parser.process_line(json).unwrap();

        match result {
            Some(ClaudeStreamMessage::System {
                subtype,
                compact_metadata,
                ..
            }) => {
                assert_eq!(subtype, "compact_boundary");
                assert!(compact_metadata.is_some());
                let cm = compact_metadata.unwrap();
                assert_eq!(cm.trigger, "auto");
                assert_eq!(cm.pre_tokens, 50000);
            }
            _ => panic!("Expected System message with compact_boundary"),
        }
    }

    #[test]
    fn test_parse_system_init_with_tools() {
        let json = r#"{
            "type": "system",
            "subtype": "init",
            "session_id": "sess-123",
            "tools": ["Read", "Write", "Bash", "Grep"],
            "model": "claude-sonnet-4-20250514",
            "cwd": "/home/user/project",
            "permissionMode": "default"
        }"#;
        let mut parser = StreamParser::new();
        let result = parser.process_line(json).unwrap();

        match result {
            Some(ClaudeStreamMessage::System {
                subtype,
                session_id,
                tools,
                model,
                permission_mode,
                ..
            }) => {
                assert_eq!(subtype, "init");
                assert_eq!(session_id, Some("sess-123".to_string()));
                assert!(tools.is_some());
                assert_eq!(tools.unwrap().len(), 4);
                assert_eq!(model, Some("claude-sonnet-4-20250514".to_string()));
                assert_eq!(permission_mode, Some("default".to_string()));
            }
            _ => panic!("Expected System init message"),
        }
    }

    #[test]
    fn test_parse_stream_event() {
        let json = r#"{
            "type": "stream_event",
            "event": {"type": "content_block_delta", "delta": {"text": "Hello"}},
            "parent_tool_use_id": null,
            "uuid": "evt-123",
            "session_id": "sess-456"
        }"#;
        let mut parser = StreamParser::new();
        let result = parser.process_line(json).unwrap();

        match result {
            Some(ClaudeStreamMessage::StreamEvent {
                event,
                uuid,
                session_id,
                ..
            }) => {
                assert!(event.get("type").is_some());
                assert_eq!(uuid, Some("evt-123".to_string()));
                assert_eq!(session_id, Some("sess-456".to_string()));
            }
            _ => panic!("Expected StreamEvent message"),
        }
    }

    #[test]
    fn test_backward_compatibility_simple_result() {
        // Test that old-style simple result messages still parse
        let json = r#"{"type":"result","status":"success"}"#;
        let mut parser = StreamParser::new();
        let result = parser.process_line(json).unwrap();

        match result {
            Some(ClaudeStreamMessage::Result { status, .. }) => {
                assert_eq!(status, Some("success".to_string()));
            }
            _ => panic!("Expected Result message"),
        }
    }

    #[test]
    fn test_windows_path_escaping() {
        // Windows paths have backslashes that become \\ in JSON
        // This tests that escaped backslashes don't break string boundary detection
        let json = r#"{"type":"text","content":"C:\\Users\\name\\file.txt"}"#;
        let mut parser = StreamParser::new();
        let result = parser.process_line(json).unwrap();

        match result {
            Some(ClaudeStreamMessage::Text { content, .. }) => {
                assert_eq!(content, r"C:\Users\name\file.txt");
            }
            _ => panic!("Expected Text message"),
        }
    }

    #[test]
    fn test_escaped_quote_in_string() {
        // Test escaped quotes inside strings
        let json = r#"{"type":"text","content":"He said \"hello\""}"#;
        let mut parser = StreamParser::new();
        let result = parser.process_line(json).unwrap();

        match result {
            Some(ClaudeStreamMessage::Text { content, .. }) => {
                assert_eq!(content, r#"He said "hello""#);
            }
            _ => panic!("Expected Text message"),
        }
    }

    #[test]
    fn test_fragmented_json_with_escapes() {
        // Test fragmented JSON containing Windows paths
        let mut parser = StreamParser::new();

        // First fragment: opening brace and type field
        let result1 = parser.process_line(r#"{"type":"text","#).unwrap();
        assert!(result1.is_none());

        // Second fragment: content with escaped backslashes
        let result2 = parser.process_line(r#""content":"C:\\path"}"#).unwrap();
        match result2 {
            Some(ClaudeStreamMessage::Text { content, .. }) => {
                assert_eq!(content, r"C:\path");
            }
            _ => panic!("Expected Text message"),
        }
    }

    #[test]
    fn test_complex_escape_sequences() {
        // Test various JSON escape sequences: \\ \" \n \t
        let json = r#"{"type":"text","content":"line1\\nline2\ttab\\\"quoted\\\\"}"#;
        let mut parser = StreamParser::new();
        let result = parser.process_line(json).unwrap();

        assert!(matches!(result, Some(ClaudeStreamMessage::Text { .. })));
    }
}
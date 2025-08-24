use anyhow::{anyhow, Result};
use serde::{Deserialize, Serialize};
use serde_json::Value;
use std::collections::HashMap;
use tracing::{debug, error, info, warn};

/// Represents all possible message types from Claude's stream-json output
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(tag = "type")]
pub enum ClaudeStreamMessage {
    /// System messages (init, etc.)
    #[serde(rename = "system")]
    System {
        subtype: String,
        #[serde(skip_serializing_if = "Option::is_none")]
        session_id: Option<String>,
        #[serde(skip_serializing_if = "Option::is_none")]
        message: Option<String>,
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

    /// Result message (completion status)
    #[serde(rename = "result")]
    Result {
        #[serde(skip_serializing_if = "Option::is_none")]
        status: Option<String>,
        #[serde(skip_serializing_if = "Option::is_none")]
        error: Option<String>,
    },

    /// Raw/unknown message type
    #[serde(rename = "raw")]
    Raw {
        raw_type: String,
        data: Value,
    },
}

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
        for ch in self.buffer.chars() {
            // Handle escape sequences
            if self.last_char == Some('\\') {
                self.last_char = Some(ch);
                continue;
            }

            // Track string boundaries
            if ch == '"' && self.last_char != Some('\\') {
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
}
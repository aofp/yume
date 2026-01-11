/// Claude binary information command
/// Provides info about Claude installations for display in settings

use serde::{Serialize, Deserialize};
use tracing::info;
use std::collections::HashMap;
use crate::claude_binary::{discover_claude_installations, ClaudeInstallation};

/// Response structure for Claude binary information
#[derive(Debug, Serialize)]
pub struct ClaudeBinaryInfo {
    pub installations: Vec<ClaudeInstallation>,
    pub selected: Option<ClaudeInstallation>,
    pub platform: String,
    pub wsl_available: bool,
}

/// Gets information about available Claude binaries
#[tauri::command]
pub async fn get_claude_binary_info() -> Result<ClaudeBinaryInfo, String> {
    info!("get_claude_binary_info command called");
    
    // Find all Claude installations
    let installations = discover_claude_installations();
    
    // Get the selected one (first one is selected by default)
    let selected = installations.first().cloned();
    
    // Determine platform
    let platform = if cfg!(target_os = "windows") {
        "windows".to_string()
    } else if cfg!(target_os = "macos") {
        "macos".to_string()
    } else {
        "linux".to_string()
    };
    
    // Check WSL availability (only on Windows)
    let wsl_available = if cfg!(target_os = "windows") {
        // Check if WSL is available by trying to run wsl --version
        #[cfg(target_os = "windows")]
        {
            use std::os::windows::process::CommandExt;
            const CREATE_NO_WINDOW: u32 = 0x08000000;
            std::process::Command::new("wsl")
                .arg("--version")
                .creation_flags(CREATE_NO_WINDOW)
                .output()
                .map(|output| output.status.success())
                .unwrap_or(false)
        }
        #[cfg(not(target_os = "windows"))]
        { false }
    } else {
        false
    };
    
    Ok(ClaudeBinaryInfo {
        installations,
        selected,
        platform,
        wsl_available,
    })
}

/// Daily token usage by model
#[derive(Debug, Serialize, Deserialize)]
pub struct DailyModelTokens {
    pub date: String,
    #[serde(rename = "tokensByModel")]
    pub tokens_by_model: HashMap<String, u64>,
}

/// Model usage statistics
#[derive(Debug, Serialize, Deserialize, Default)]
pub struct ModelUsageStats {
    #[serde(rename = "inputTokens", default)]
    pub input_tokens: u64,
    #[serde(rename = "outputTokens", default)]
    pub output_tokens: u64,
    #[serde(rename = "cacheReadInputTokens", default)]
    pub cache_read_input_tokens: u64,
    #[serde(rename = "cacheCreationInputTokens", default)]
    pub cache_creation_input_tokens: u64,
}

/// Claude stats cache structure
#[derive(Debug, Serialize, Deserialize)]
pub struct ClaudeStatsCache {
    pub version: Option<u32>,
    #[serde(rename = "lastComputedDate")]
    pub last_computed_date: Option<String>,
    #[serde(rename = "dailyModelTokens", default)]
    pub daily_model_tokens: Vec<DailyModelTokens>,
    #[serde(rename = "modelUsage", default)]
    pub model_usage: HashMap<String, ModelUsageStats>,
    #[serde(rename = "totalMessages", default)]
    pub total_messages: u64,
    #[serde(rename = "totalSessions", default)]
    pub total_sessions: u64,
}

/// Weekly usage summary
#[derive(Debug, Serialize)]
pub struct WeeklyUsageSummary {
    pub total_tokens: u64,
    pub opus_tokens: u64,
    pub sonnet_tokens: u64,
    pub haiku_tokens: u64,
    pub days_with_data: u32,
    pub daily_breakdown: Vec<DailyModelTokens>,
}

/// Reads Claude stats-cache.json and returns weekly usage summary
#[tauri::command]
pub async fn get_claude_weekly_usage() -> Result<WeeklyUsageSummary, String> {
    info!("get_claude_weekly_usage command called");

    // Get home directory
    let home = dirs::home_dir()
        .ok_or_else(|| "Could not determine home directory".to_string())?;

    // Path to stats-cache.json
    let stats_path = home.join(".claude").join("stats-cache.json");

    if !stats_path.exists() {
        return Ok(WeeklyUsageSummary {
            total_tokens: 0,
            opus_tokens: 0,
            sonnet_tokens: 0,
            haiku_tokens: 0,
            days_with_data: 0,
            daily_breakdown: vec![],
        });
    }

    // Read and parse the file
    let content = std::fs::read_to_string(&stats_path)
        .map_err(|e| format!("Failed to read stats-cache.json: {}", e))?;

    let stats: ClaudeStatsCache = serde_json::from_str(&content)
        .map_err(|e| format!("Failed to parse stats-cache.json: {}", e))?;

    // Calculate date 7 days ago
    let now = chrono::Utc::now();
    let seven_days_ago = now - chrono::Duration::days(7);
    let cutoff_date = seven_days_ago.format("%Y-%m-%d").to_string();

    // Filter to last 7 days and sum tokens
    let mut total_tokens: u64 = 0;
    let mut opus_tokens: u64 = 0;
    let mut sonnet_tokens: u64 = 0;
    let mut haiku_tokens: u64 = 0;
    let mut days_with_data: u32 = 0;
    let mut daily_breakdown: Vec<DailyModelTokens> = vec![];

    for day in &stats.daily_model_tokens {
        if day.date >= cutoff_date {
            days_with_data += 1;
            daily_breakdown.push(DailyModelTokens {
                date: day.date.clone(),
                tokens_by_model: day.tokens_by_model.clone(),
            });

            for (model, tokens) in &day.tokens_by_model {
                total_tokens += tokens;
                let model_lower = model.to_lowercase();
                if model_lower.contains("opus") {
                    opus_tokens += tokens;
                } else if model_lower.contains("sonnet") {
                    sonnet_tokens += tokens;
                } else if model_lower.contains("haiku") {
                    haiku_tokens += tokens;
                }
            }
        }
    }

    Ok(WeeklyUsageSummary {
        total_tokens,
        opus_tokens,
        sonnet_tokens,
        haiku_tokens,
        days_with_data,
        daily_breakdown,
    })
}

/// Usage limit info from API
#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct UsageLimit {
    pub utilization: Option<f64>,
    pub resets_at: Option<String>,
}

/// Claude usage limits from API
#[derive(Debug, Serialize, Deserialize)]
pub struct ClaudeUsageLimits {
    pub five_hour: Option<UsageLimit>,
    pub seven_day: Option<UsageLimit>,
    pub seven_day_opus: Option<UsageLimit>,
    pub seven_day_sonnet: Option<UsageLimit>,
    pub subscription_type: Option<String>,
    pub rate_limit_tier: Option<String>,
}

/// Stored credentials structure
#[derive(Debug, Deserialize)]
struct ClaudeCredentials {
    #[serde(rename = "claudeAiOauth")]
    claude_ai_oauth: Option<OAuthCredentials>,
}

#[derive(Debug, Deserialize)]
struct OAuthCredentials {
    #[serde(rename = "accessToken")]
    access_token: String,
    #[serde(rename = "subscriptionType")]
    subscription_type: Option<String>,
    #[serde(rename = "rateLimitTier")]
    rate_limit_tier: Option<String>,
}

/// API response structure
#[derive(Debug, Deserialize)]
struct UsageApiResponse {
    five_hour: Option<UsageLimit>,
    seven_day: Option<UsageLimit>,
    seven_day_opus: Option<UsageLimit>,
    seven_day_sonnet: Option<UsageLimit>,
}

/// Gets Claude usage limits from the API
#[tauri::command]
pub async fn get_claude_usage_limits() -> Result<ClaudeUsageLimits, String> {
    info!("get_claude_usage_limits command called");

    // Get credentials based on platform
    let (access_token, subscription_type, rate_limit_tier) = get_claude_credentials()?;

    // Make API request
    let client = reqwest::Client::new();
    let response = client
        .get("https://api.anthropic.com/api/oauth/usage")
        .header("Accept", "application/json, text/plain, */*")
        .header("Content-Type", "application/json")
        .header("User-Agent", "claude-code/2.0.76")
        .header("Authorization", format!("Bearer {}", access_token))
        .header("anthropic-beta", "oauth-2025-04-20")
        .send()
        .await
        .map_err(|e| format!("Failed to call usage API: {}", e))?;

    if !response.status().is_success() {
        let status = response.status();
        let body = response.text().await.unwrap_or_default();
        return Err(format!("Usage API returned {}: {}", status, body));
    }

    // Get raw text first to log it
    let raw_body = response.text().await
        .map_err(|e| format!("Failed to read usage API response: {}", e))?;
    info!("Usage API raw response: {}", raw_body);

    let api_response: UsageApiResponse = serde_json::from_str(&raw_body)
        .map_err(|e| format!("Failed to parse usage API response: {} - raw: {}", e, raw_body))?;

    let result = ClaudeUsageLimits {
        five_hour: api_response.five_hour,
        seven_day: api_response.seven_day,
        seven_day_opus: api_response.seven_day_opus,
        seven_day_sonnet: api_response.seven_day_sonnet,
        subscription_type,
        rate_limit_tier,
    };
    info!("Usage API parsed result: {:?}", result);
    Ok(result)
}

/// Get Claude credentials from platform-specific storage
fn get_claude_credentials() -> Result<(String, Option<String>, Option<String>), String> {
    #[cfg(target_os = "macos")]
    {
        get_credentials_macos()
    }

    #[cfg(target_os = "windows")]
    {
        get_credentials_windows()
    }

    #[cfg(target_os = "linux")]
    {
        get_credentials_linux()
    }
}

#[cfg(target_os = "linux")]
fn get_credentials_linux() -> Result<(String, Option<String>, Option<String>), String> {
    use std::process::{Command, Stdio};

    // Try secret-tool first (libsecret - most common on modern Linux)
    let output = Command::new("secret-tool")
        .args(["lookup", "service", "Claude Code-credentials"])
        .stdin(Stdio::null())
        .stdout(Stdio::piped())
        .stderr(Stdio::null())
        .output();

    match output {
        Ok(out) if out.status.success() => {
            let json_str = String::from_utf8(out.stdout)
                .map_err(|e| format!("Invalid UTF-8 in credentials: {}", e))?;

            let creds: ClaudeCredentials = serde_json::from_str(&json_str)
                .map_err(|e| format!("Failed to parse credentials JSON: {}", e))?;

            let oauth = creds.claude_ai_oauth
                .ok_or_else(|| "No OAuth credentials found".to_string())?;

            return Ok((
                oauth.access_token,
                oauth.subscription_type,
                oauth.rate_limit_tier,
            ));
        }
        _ => {}
    }

    // Try alternative attribute format that Claude CLI might use
    let output = Command::new("secret-tool")
        .args(["lookup", "application", "claude-code"])
        .stdin(Stdio::null())
        .stdout(Stdio::piped())
        .stderr(Stdio::null())
        .output();

    match output {
        Ok(out) if out.status.success() => {
            let json_str = String::from_utf8(out.stdout)
                .map_err(|e| format!("Invalid UTF-8 in credentials: {}", e))?;

            let creds: ClaudeCredentials = serde_json::from_str(&json_str)
                .map_err(|e| format!("Failed to parse credentials JSON: {}", e))?;

            let oauth = creds.claude_ai_oauth
                .ok_or_else(|| "No OAuth credentials found".to_string())?;

            return Ok((
                oauth.access_token,
                oauth.subscription_type,
                oauth.rate_limit_tier,
            ));
        }
        _ => {}
    }

    Err("No Claude credentials found. Please run 'claude' CLI and authenticate first. (Requires libsecret-tools package for secret-tool command)".to_string())
}

#[cfg(target_os = "macos")]
fn get_credentials_macos() -> Result<(String, Option<String>, Option<String>), String> {
    use std::process::{Command, Stdio};

    // Use explicit Stdio to prevent any focus stealing
    let output = Command::new("security")
        .args(["find-generic-password", "-s", "Claude Code-credentials", "-w"])
        .stdin(Stdio::null())
        .stdout(Stdio::piped())
        .stderr(Stdio::null())
        .output()
        .map_err(|e| format!("Failed to read keychain: {}", e))?;

    if !output.status.success() {
        return Err("No Claude credentials found in keychain".to_string());
    }

    let json_str = String::from_utf8(output.stdout)
        .map_err(|e| format!("Invalid UTF-8 in credentials: {}", e))?;

    let creds: ClaudeCredentials = serde_json::from_str(&json_str)
        .map_err(|e| format!("Failed to parse credentials JSON: {}", e))?;

    let oauth = creds.claude_ai_oauth
        .ok_or_else(|| "No OAuth credentials found".to_string())?;

    Ok((
        oauth.access_token,
        oauth.subscription_type,
        oauth.rate_limit_tier,
    ))
}

#[cfg(target_os = "windows")]
fn get_credentials_windows() -> Result<(String, Option<String>, Option<String>), String> {
    // On Windows, Claude CLI stores credentials in ~/.claude/.credentials.json
    // NOT in Windows Credential Manager (unlike macOS which uses Keychain)

    info!("Reading Claude credentials from ~/.claude/.credentials.json");

    let home = dirs::home_dir()
        .ok_or_else(|| "Could not determine home directory".to_string())?;

    let creds_path = home.join(".claude").join(".credentials.json");

    if !creds_path.exists() {
        return Err(format!(
            "Claude credentials file not found at {:?}. Please run 'claude' CLI and authenticate first.",
            creds_path
        ));
    }

    let content = std::fs::read_to_string(&creds_path)
        .map_err(|e| format!("Failed to read credentials file: {}", e))?;

    info!("Read {} bytes from credentials file", content.len());

    let creds: ClaudeCredentials = serde_json::from_str(&content)
        .map_err(|e| format!("Failed to parse credentials JSON: {}", e))?;

    let oauth = creds.claude_ai_oauth
        .ok_or_else(|| "No OAuth credentials found in file".to_string())?;

    info!("Successfully loaded credentials from file (subscription: {:?})", oauth.subscription_type);

    Ok((
        oauth.access_token,
        oauth.subscription_type,
        oauth.rate_limit_tier,
    ))
}
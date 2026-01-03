use serde::{Deserialize, Serialize};
use std::collections::HashMap;
use std::sync::Arc;
use tokio::sync::Mutex;
use std::path::PathBuf;
use std::fs;
use chrono::{DateTime, Utc};

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct CompactionConfig {
    pub auto_threshold: f32,     // 60% default (like Claude Code ~38% buffer)
    pub force_threshold: f32,    // 65% default
    pub preserve_context: bool,
    pub generate_manifest: bool,
}

impl Default for CompactionConfig {
    fn default() -> Self {
        Self {
            auto_threshold: 0.60,  // 60% - conservative auto-compact (38-40% buffer like Claude Code)
            force_threshold: 0.65, // 65% - force compact
            preserve_context: true,
            generate_manifest: true,
        }
    }
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ContextManifest {
    pub version: String,
    pub task_id: Option<String>,
    pub session_id: String,
    pub timestamp: DateTime<Utc>,
    pub context: ContextInfo,
    pub scope: Option<String>,
    pub entry_points: Vec<String>,
    pub test_files: Vec<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ContextInfo {
    pub files: Vec<String>,
    pub functions: Vec<String>,
    pub dependencies: Vec<String>,
    pub decisions: Vec<Decision>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Decision {
    pub decision: String,
    pub rationale: String,
    pub timestamp: DateTime<Utc>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct CompactionState {
    pub session_id: String,
    pub context_usage: f32,
    pub last_compaction: Option<DateTime<Utc>>,
    pub auto_triggered: bool,
    pub force_triggered: bool,
    pub manifest_saved: bool,
}

pub struct CompactionManager {
    config: Arc<Mutex<CompactionConfig>>,
    states: Arc<Mutex<HashMap<String, CompactionState>>>,
    manifest_dir: PathBuf,
}

impl CompactionManager {
    pub fn new() -> Self {
        let manifest_dir = Self::get_manifest_dir();
        
        // Create directory with proper error handling
        if let Err(e) = fs::create_dir_all(&manifest_dir) {
            tracing::warn!("Failed to create manifest directory at {:?}: {}", manifest_dir, e);
            // Continue anyway - operations will fail later if directory can't be created
        } else {
            tracing::info!("Manifest directory ready at {:?}", manifest_dir);
        }
        
        Self {
            config: Arc::new(Mutex::new(CompactionConfig::default())),
            states: Arc::new(Mutex::new(HashMap::new())),
            manifest_dir,
        }
    }
    
    fn get_manifest_dir() -> PathBuf {
        #[cfg(target_os = "macos")]
        {
            let home = std::env::var("HOME").unwrap_or_else(|_| {
                tracing::warn!("HOME environment variable not found, using current directory");
                ".".to_string()
            });
            PathBuf::from(home).join(".yurucode").join("manifests")
        }
        
        #[cfg(target_os = "windows")]
        {
            // Try APPDATA first, then USERPROFILE, then fallback to current directory
            let app_data = std::env::var("APPDATA")
                .or_else(|_| std::env::var("USERPROFILE").map(|p| format!("{}\\AppData\\Roaming", p)))
                .unwrap_or_else(|_| {
                    tracing::warn!("APPDATA/USERPROFILE not found, using current directory");
                    ".".to_string()
                });
            PathBuf::from(app_data).join("yurucode").join("manifests")
        }
        
        #[cfg(target_os = "linux")]
        {
            let home = std::env::var("HOME").unwrap_or_else(|_| {
                tracing::warn!("HOME environment variable not found, using current directory");
                ".".to_string()
            });
            PathBuf::from(home).join(".yurucode").join("manifests")
        }
    }
    
    pub async fn update_context_usage(&self, session_id: String, usage: f32) -> CompactionAction {
        let config = self.config.lock().await;
        let mut states = self.states.lock().await;

        let state = states.entry(session_id.clone()).or_insert_with(|| {
            CompactionState {
                session_id: session_id.clone(),
                context_usage: usage,
                last_compaction: None,
                auto_triggered: false,
                force_triggered: false,
                manifest_saved: false,
            }
        });

        state.context_usage = usage;

        // Check thresholds (60% auto, 65% force - like Claude Code with ~38% buffer)
        if usage >= config.force_threshold && !state.force_triggered {
            state.force_triggered = true;
            CompactionAction::Force
        } else if usage >= config.auto_threshold && !state.auto_triggered {
            state.auto_triggered = true;
            CompactionAction::AutoTrigger
        } else if usage >= 0.55 {
            // Warning at 55% to prepare for auto-compact at 60%
            CompactionAction::Warning
        } else {
            CompactionAction::None
        }
    }

    /// Reset compaction flags after successful compaction
    /// This allows the session to trigger compaction again when it reaches threshold
    pub async fn reset_compaction_flags(&self, session_id: &str) {
        let mut states = self.states.lock().await;
        if let Some(state) = states.get_mut(session_id) {
            state.auto_triggered = false;
            state.force_triggered = false;
            state.manifest_saved = false;
            state.last_compaction = Some(Utc::now());
            tracing::info!("Reset compaction flags for session {}", session_id);
        }
    }
    
    pub async fn save_manifest(&self, session_id: &str, manifest: ContextManifest) -> Result<String, String> {
        let mut states = self.states.lock().await;
        
        // Ensure directory exists (in case it was deleted)
        fs::create_dir_all(&self.manifest_dir)
            .map_err(|e| format!("Failed to create manifest directory: {}", e))?;
        
        // Create manifest file path
        let manifest_file = self.manifest_dir.join(format!("{}.json", session_id));
        
        // Serialize manifest
        let manifest_json = serde_json::to_string_pretty(&manifest)
            .map_err(|e| format!("Failed to serialize manifest: {}", e))?;
        
        // Save to file
        fs::write(&manifest_file, manifest_json)
            .map_err(|e| format!("Failed to write manifest: {}", e))?;
        
        // Update state
        if let Some(state) = states.get_mut(session_id) {
            state.manifest_saved = true;
        }
        
        Ok(manifest_file.to_string_lossy().to_string())
    }
    
    pub async fn load_manifest(&self, session_id: &str) -> Result<ContextManifest, String> {
        let manifest_file = self.manifest_dir.join(format!("{}.json", session_id));
        
        let manifest_json = fs::read_to_string(&manifest_file)
            .map_err(|e| format!("Failed to read manifest: {}", e))?;
        
        serde_json::from_str(&manifest_json)
            .map_err(|e| format!("Failed to parse manifest: {}", e))
    }
    
    pub async fn reset_session(&self, session_id: &str) {
        let mut states = self.states.lock().await;
        states.remove(session_id);
    }
    
    pub async fn get_state(&self, session_id: &str) -> Option<CompactionState> {
        let states = self.states.lock().await;
        states.get(session_id).cloned()
    }
    
    pub async fn update_config(&self, config: CompactionConfig) {
        let mut current_config = self.config.lock().await;
        *current_config = config;
    }
    
    pub async fn get_config(&self) -> CompactionConfig {
        let config = self.config.lock().await;
        config.clone()
    }
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub enum CompactionAction {
    None,
    Notice,       // deprecated
    Warning,      // 55%+
    AutoTrigger,  // 60%+ (38% buffer like Claude Code)
    Force,        // 65%+
}

impl CompactionAction {
    pub fn to_message(&self) -> Option<String> {
        match self {
            CompactionAction::None => None,
            CompactionAction::Notice => None, // deprecated
            CompactionAction::Warning => Some("Context usage at 55%. Auto-compact will trigger at 60%.".to_string()),
            CompactionAction::AutoTrigger => Some("Context usage at 60%. Auto-compacting (38% buffer reserved like Claude Code).".to_string()),
            CompactionAction::Force => Some("Context usage at 65%. Force-compacting to prevent context overflow.".to_string()),
        }
    }
    
    pub fn should_trigger_compact(&self) -> bool {
        matches!(self, CompactionAction::AutoTrigger | CompactionAction::Force)
    }
}
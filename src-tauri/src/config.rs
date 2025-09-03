use serde::{Deserialize, Serialize};
use std::path::PathBuf;
use tracing::info;

/// Production configuration settings
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ProductionConfig {
    /// Performance thresholds
    pub performance: PerformanceConfig,
    
    /// Security settings
    pub security: SecurityConfig,
}


#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct PerformanceConfig {
    /// Maximum memory usage in MB before warning
    pub memory_warning_threshold: u64,
    
    /// Maximum memory usage in MB before critical alert
    pub memory_critical_threshold: u64,
    
    /// CPU usage percentage warning threshold
    pub cpu_warning_threshold: f64,
    
    /// FPS warning threshold
    pub fps_warning_threshold: f64,
    
    /// Maximum log file size in MB
    pub max_log_size: u64,
    
    /// Maximum number of log files to keep
    pub max_log_files: usize,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct SecurityConfig {
    /// Enable secure communication
    pub enable_tls: bool,
    
    /// Certificate validation
    pub validate_certificates: bool,
    
    /// Allowed domains for external communication
    pub allowed_domains: Vec<String>,
    
    /// Enable code signing verification
    pub verify_signatures: bool,
    
    /// Sandbox mode for untrusted operations
    pub sandbox_mode: bool,
}

impl Default for ProductionConfig {
    fn default() -> Self {
        Self {
            performance: PerformanceConfig {
                memory_warning_threshold: 500, // 500MB
                memory_critical_threshold: 1000, // 1GB
                cpu_warning_threshold: 80.0, // 80%
                fps_warning_threshold: 30.0, // 30 FPS
                max_log_size: 50, // 50MB
                max_log_files: 5,
            },
            security: SecurityConfig {
                enable_tls: true,
                validate_certificates: true,
                allowed_domains: vec![
                    "releases.yurucode.app".to_string(),
                    "api.yurucode.app".to_string(),
                    "github.com".to_string(),
                    "api.github.com".to_string(),
                    "sentry.io".to_string(),
                ],
                verify_signatures: true,
                sandbox_mode: false,
            },
        }
    }
}

impl ProductionConfig {
    /// Load configuration from file or environment
    pub fn load() -> Self {
        // Try to load from config file first
        if let Ok(config_path) = Self::get_config_path() {
            if config_path.exists() {
                if let Ok(contents) = std::fs::read_to_string(&config_path) {
                    if let Ok(config) = serde_json::from_str(&contents) {
                        info!("Loaded production config from {:?}", config_path);
                        return config;
                    }
                }
            }
        }
        
        // Use default config
        Self::default()
    }
    
    /// Save configuration to file
    pub fn save(&self) -> Result<(), String> {
        let config_path = Self::get_config_path()
            .map_err(|e| format!("Failed to get config path: {}", e))?;
        
        // Create directory if it doesn't exist
        if let Some(parent) = config_path.parent() {
            std::fs::create_dir_all(parent)
                .map_err(|e| format!("Failed to create config directory: {}", e))?;
        }
        
        let contents = serde_json::to_string_pretty(self)
            .map_err(|e| format!("Failed to serialize config: {}", e))?;
        
        std::fs::write(&config_path, contents)
            .map_err(|e| format!("Failed to write config: {}", e))?;
        
        info!("Saved production config to {:?}", config_path);
        Ok(())
    }
    
    /// Get the configuration file path
    fn get_config_path() -> Result<PathBuf, String> {
        #[cfg(target_os = "macos")]
        {
            let home = std::env::var("HOME")
                .map_err(|_| "HOME environment variable not set")?;
            Ok(PathBuf::from(home)
                .join("Library")
                .join("Application Support")
                .join("yurucode")
                .join("production.config.json"))
        }
        
        #[cfg(target_os = "windows")]
        {
            let appdata = std::env::var("APPDATA")
                .map_err(|_| "APPDATA environment variable not set")?;
            Ok(PathBuf::from(appdata)
                .join("yurucode")
                .join("production.config.json"))
        }
        
        #[cfg(target_os = "linux")]
        {
            let home = std::env::var("HOME")
                .map_err(|_| "HOME environment variable not set")?;
            Ok(PathBuf::from(home)
                .join(".config")
                .join("yurucode")
                .join("production.config.json"))
        }
    }
}

/// Initialize production configuration
pub fn init_production_config() -> ProductionConfig {
    let config = ProductionConfig::load();
    info!("Production configuration initialized");
    config
}
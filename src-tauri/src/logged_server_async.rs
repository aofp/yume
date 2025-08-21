/// Async server management module - OPTIMIZED VERSION
/// Provides non-blocking server spawn and monitoring

use std::process::{Command, Stdio};
use std::sync::Arc;
use tokio::sync::Mutex;
use tokio::io::{AsyncBufReadExt, BufReader};
use tracing::{info, error};

/// Starts the server asynchronously with parallel health monitoring
pub async fn start_server_async(port: u16) -> Result<(), Box<dyn std::error::Error>> {
    info!("Starting server asynchronously on port {}", port);
    
    // Spawn server in background
    let mut cmd = Command::new("node");
    
    #[cfg(target_os = "macos")]
    {
        // Use the macOS specific server path
        let server_path = get_macos_server_path()?;
        cmd.arg(&server_path);
    }
    
    #[cfg(not(target_os = "macos"))]
    {
        // Use embedded server for other platforms
        let server_path = create_embedded_server()?;
        cmd.arg(&server_path);
    }
    
    cmd.env("PORT", port.to_string())
       .stdout(Stdio::piped())
       .stderr(Stdio::piped());
    
    let mut child = cmd.spawn()?;
    let pid = child.id();
    info!("Server process spawned with PID: {}", pid);
    
    // Spawn async tasks for stdout/stderr monitoring
    if let Some(stdout) = child.stdout.take() {
        tokio::spawn(async move {
            let reader = BufReader::new(tokio::process::ChildStdout::from_std(stdout).unwrap());
            let mut lines = reader.lines();
            while let Ok(Some(line)) = lines.next_line().await {
                info!("[SERVER OUT] {}", line);
            }
        });
    }
    
    if let Some(stderr) = child.stderr.take() {
        tokio::spawn(async move {
            let reader = BufReader::new(tokio::process::ChildStderr::from_std(stderr).unwrap());
            let mut lines = reader.lines();
            while let Ok(Some(line)) = lines.next_line().await {
                error!("[SERVER ERR] {}", line);
            }
        });
    }
    
    // Spawn health check monitoring
    tokio::spawn(async move {
        monitor_server_health(port).await;
    });
    
    Ok(())
}

/// Monitors server health in parallel without blocking
async fn monitor_server_health(port: u16) {
    use tokio::time::{sleep, Duration};
    
    let health_url = format!("http://localhost:{}/health", port);
    let client = reqwest::Client::builder()
        .timeout(Duration::from_secs(2))
        .build()
        .unwrap();
    
    // Quick initial checks with exponential backoff
    let mut delay_ms = 50; // Start with 50ms
    for _ in 0..10 {
        sleep(Duration::from_millis(delay_ms)).await;
        
        if let Ok(response) = client.get(&health_url).send().await {
            if response.status().is_success() {
                info!("✅ Server health check passed on port {}", port);
                return;
            }
        }
        
        // Exponential backoff: 50, 100, 200, 400, 800...
        delay_ms = (delay_ms * 2).min(1000);
    }
    
    error!("⚠️ Server health check failed after 10 attempts");
}

#[cfg(target_os = "macos")]
fn get_macos_server_path() -> Result<std::path::PathBuf, Box<dyn std::error::Error>> {
    // Get server path for macOS
    let server_path = if cfg!(debug_assertions) {
        std::env::current_exe()?
            .parent().unwrap()
            .parent().unwrap()
            .parent().unwrap()
            .parent().unwrap()
            .join("server-claude-macos.js")
    } else {
        std::env::current_exe()?
            .parent().unwrap()
            .parent().unwrap()
            .join("Resources")
            .join("resources")
            .join("server-claude-macos.js")
    };
    
    if !server_path.exists() {
        return Err(format!("Server file not found at: {:?}", server_path).into());
    }
    
    Ok(server_path)
}

#[cfg(not(target_os = "macos"))]
fn create_embedded_server() -> Result<std::path::PathBuf, Box<dyn std::error::Error>> {
    use std::fs;
    use std::io::Write;
    
    // Create temp server file from embedded code
    let temp_dir = std::env::temp_dir().join("yurucode-server");
    fs::create_dir_all(&temp_dir)?;
    
    let server_path = temp_dir.join("server.cjs");
    let mut file = fs::File::create(&server_path)?;
    file.write_all(super::EMBEDDED_SERVER.as_bytes())?;
    
    Ok(server_path)
}
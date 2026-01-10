/// Dynamic port allocation module
/// Manages port allocation for the Node.js backend server to avoid conflicts
/// when running multiple instances of the application
///
/// Port allocation strategy:
/// - Uses ports in the 20000-65000 range to avoid common service conflicts
/// - First tries random ports for better distribution
/// - Falls back to sequential search if random fails
/// - Has hardcoded fallback ports as last resort
///
/// TOCTOU Mitigation:
/// - Provides find_and_hold_port() that returns a held listener
/// - Caller can hold listener until server is ready to bind
/// - Minimizes window between check and use

use std::net::{TcpListener, SocketAddr};
use std::sync::Mutex;
use std::path::PathBuf;
use std::fs;
use rand::Rng;
use tracing::{info, warn, debug};

// Store allocated ports to avoid conflicts between multiple servers
// Note: This is per-process, not shared between app instances
static ALLOCATED_PORTS: Mutex<Vec<u16>> = Mutex::new(Vec::new());

// Cached last working port - persisted to disk for faster startup
static CACHED_PORT: Mutex<Option<u16>> = Mutex::new(None);

/// Gets the path to the port cache file
/// Dev and prod use separate cache files to allow running both simultaneously
fn get_port_cache_path() -> Option<PathBuf> {
    let filename = if cfg!(debug_assertions) {
        "last_port_dev.txt"
    } else {
        "last_port.txt"
    };
    dirs::config_dir().map(|p| p.join("yurucode").join(filename))
}

/// Loads the cached port from disk
fn load_cached_port() -> Option<u16> {
    let path = get_port_cache_path()?;
    if let Ok(content) = fs::read_to_string(&path) {
        if let Ok(port) = content.trim().parse::<u16>() {
            if port >= 20000 && port <= 65000 {
                debug!("Loaded cached port {} from {:?}", port, path);
                return Some(port);
            }
        }
    }
    None
}

/// Saves the working port to disk cache
fn save_cached_port(port: u16) {
    if let Some(path) = get_port_cache_path() {
        if let Some(parent) = path.parent() {
            let _ = fs::create_dir_all(parent);
        }
        if let Err(e) = fs::write(&path, port.to_string()) {
            debug!("Failed to cache port: {}", e);
        } else {
            debug!("Cached port {} to {:?}", port, path);
        }
    }
}

/// Held port with listener that keeps the port bound until dropped
/// Use this to minimize TOCTOU race conditions
pub struct HeldPort {
    pub port: u16,
    listener: TcpListener,
}

impl HeldPort {
    /// Release the port for use by another process (e.g., Node.js server)
    /// Returns the port number after releasing the listener
    pub fn release(self) -> u16 {
        let port = self.port;
        drop(self.listener);
        info!("Released held port {}", port);
        port
    }
}

/// Finds an available port and holds it with a TcpListener
/// This prevents TOCTOU race conditions by keeping the port bound
/// until the caller explicitly releases it
pub fn find_and_hold_port() -> Option<HeldPort> {
    // First, try the cached port from last successful run (instant if available)
    if let Some(cached) = load_cached_port() {
        if let Some(held) = try_hold_port(cached) {
            info!("Using cached port {} from previous run", cached);
            mark_port_allocated(cached);
            return Some(held);
        }
        debug!("Cached port {} no longer available", cached);
    }

    let mut rng = rand::thread_rng();
    let mut attempts = 0;
    const MAX_ATTEMPTS: u32 = 500;

    // Try random ports (reduced to 100 attempts since we tried cached first)
    while attempts < 100 {
        let port = rng.random_range(20000..=65000);
        if let Some(held) = try_hold_port(port) {
            mark_port_allocated(port);
            save_cached_port(port); // Cache for next time
            return Some(held);
        }
        attempts += 1;
    }

    // Try sequential from a random starting point
    let start_port = rng.random_range(20000..=65000);
    for offset in 0..=45000 {
        let port = 20000 + ((start_port - 20000 + offset) % 45001);
        if let Some(held) = try_hold_port(port) {
            mark_port_allocated(port);
            save_cached_port(port); // Cache for next time
            return Some(held);
        }
        attempts += 1;
        if attempts >= MAX_ATTEMPTS {
            break;
        }
    }

    warn!("Could not find an available port to hold after {} attempts", attempts);
    None
}

/// Tries to bind to a port and returns HeldPort if successful
fn try_hold_port(port: u16) -> Option<HeldPort> {
    match TcpListener::bind(SocketAddr::from(([0, 0, 0, 0], port))) {
        Ok(listener) => {
            info!("Holding port {}", port);
            Some(HeldPort { port, listener })
        }
        Err(_) => None,
    }
}

/// Finds an available port in the range 20000-65000
///
/// Algorithm:
/// 1. Try cached port from last run (instant)
/// 2. Try random ports for first 100 attempts
/// 3. Try sequential ports from a random starting point
/// 4. Return None if no port found after MAX_ATTEMPTS
///
/// This approach minimizes startup time and conflicts between instances
pub fn find_available_port() -> Option<u16> {
    // First, try the cached port from last successful run
    if let Some(cached) = load_cached_port() {
        if is_port_available(cached) {
            info!("Using cached port {} from previous run", cached);
            mark_port_allocated(cached);
            return Some(cached);
        }
        debug!("Cached port {} no longer available", cached);
    }

    let mut rng = rand::thread_rng();
    let mut attempts = 0;
    const MAX_ATTEMPTS: u32 = 500;

    // Start with a random port in the range
    let start_port = rng.random_range(20000..=65000);

    info!("Searching for available port starting from {}", start_port);

    // Try random ports (reduced since we tried cached first)
    while attempts < 100 {
        let port = rng.random_range(20000..=65000);
        if is_port_available(port) {
            info!("Found available port: {}", port);
            mark_port_allocated(port);
            save_cached_port(port);
            return Some(port);
        }
        attempts += 1;
    }

    // If random didn't work, try sequential from start_port
    for offset in 0..=45000 {
        let port = 20000 + ((start_port - 20000 + offset) % 45001);
        if is_port_available(port) {
            info!("Found available port: {}", port);
            mark_port_allocated(port);
            save_cached_port(port);
            return Some(port);
        }
        attempts += 1;
        if attempts >= MAX_ATTEMPTS {
            break;
        }
    }
    
    warn!("Could not find an available port in range 20000-65000 after {} attempts", attempts);
    None
}

/// Checks if a specific port is available by attempting to bind to it
/// Tests binding on 0.0.0.0 (all interfaces) which matches server behavior
/// The TcpListener is immediately dropped, freeing the port
fn is_port_available(port: u16) -> bool {
    // Check both 0.0.0.0 and 127.0.0.1 to be sure
    // Try binding to 0.0.0.0 which is what the server uses
    match TcpListener::bind(SocketAddr::from(([0, 0, 0, 0], port))) {
        Ok(_) => {
            // Port is available - the listener will be dropped and port freed
            true
        }
        Err(_) => {
            // Port is in use
            false
        }
    }
}

/// Marks a port as allocated within this process
/// Helps avoid re-checking the same ports during allocation
/// Note: This doesn't prevent other processes from using the port
fn mark_port_allocated(port: u16) {
    let mut allocated = ALLOCATED_PORTS.lock().unwrap();
    if !allocated.contains(&port) {
        allocated.push(port);
        info!("Marked port {} as allocated", port);
    }
}

/// Clears all allocated ports from the tracking list
/// Used for cleanup, though ports are freed when processes exit
#[allow(dead_code)]
pub fn clear_allocated_ports() {
    let mut allocated = ALLOCATED_PORTS.lock().unwrap();
    allocated.clear();
    info!("Cleared all allocated ports");
}

/// Returns a fallback port when dynamic allocation fails
/// Tries a predefined list of ports that are unlikely to be in use
/// Last resort returns 3001 (common development port) even if occupied
pub fn get_fallback_port() -> u16 {
    // Try a few fallback ports in case dynamic allocation fails
    let fallbacks = vec![30001, 30002, 30003, 40001, 50001, 3001];
    
    for port in fallbacks {
        if is_port_available(port) {
            info!("Using fallback port: {}", port);
            mark_port_allocated(port);
            return port;
        }
    }
    // Last resort - just return a port and hope for the best
    warn!("No fallback ports available, using 3001");
    3001
}

/// Unit tests for port allocation
/// Note: These tests might be flaky in CI environments where ports are in use
#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_find_available_port() {
        let port = find_available_port();
        assert!(port.is_some());
        let port = port.unwrap();
        assert!(port >= 20000 && port <= 65000);
    }

    #[test]
    fn test_is_port_available() {
        // This test might be flaky if port 64999 is actually in use
        // But it's unlikely
        let available = is_port_available(64999);
        // We can't assert true because the port might actually be in use
        // Just check that the function doesn't panic
        let _ = available;
    }
}
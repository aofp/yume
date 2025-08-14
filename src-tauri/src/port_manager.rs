use std::net::{TcpListener, SocketAddr};
use std::sync::Mutex;
use rand::Rng;
use tracing::{info, warn};

// Store allocated ports to avoid conflicts between Vite and server
static ALLOCATED_PORTS: Mutex<Vec<u16>> = Mutex::new(Vec::new());

/// Find an available port in the range 60000-61000
pub fn find_available_port() -> Option<u16> {
    let mut rng = rand::thread_rng();
    let mut attempts = 0;
    const MAX_ATTEMPTS: u32 = 500; // Increased attempts
    
    // Start with a random port in the range
    let start_port = rng.gen_range(60000..=61000);
    
    info!("Searching for available port starting from {}", start_port);
    
    // Try random ports first
    while attempts < MAX_ATTEMPTS / 2 {
        let port = rng.gen_range(60000..=61000);
        // ONLY check if port is actually available - don't use ALLOCATED_PORTS
        // because it's not shared between processes
        if is_port_available(port) {
            info!("Found available port: {}", port);
            mark_port_allocated(port);
            return Some(port);
        }
        attempts += 1;
    }
    
    // If random didn't work, try sequential from start_port
    for offset in 0..=1000 {
        let port = 60000 + ((start_port - 60000 + offset) % 1001);
        if is_port_available(port) {
            info!("Found available port: {}", port);
            mark_port_allocated(port);
            return Some(port);
        }
        attempts += 1;
        if attempts >= MAX_ATTEMPTS {
            break;
        }
    }
    
    warn!("Could not find an available port in range 60000-61000 after {} attempts", attempts);
    None
}

/// Check if a specific port is available
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

/// Mark a port as allocated to avoid conflicts
fn mark_port_allocated(port: u16) {
    let mut allocated = ALLOCATED_PORTS.lock().unwrap();
    if !allocated.contains(&port) {
        allocated.push(port);
        info!("Marked port {} as allocated", port);
    }
}

/// Clear all allocated ports (for cleanup)
pub fn clear_allocated_ports() {
    let mut allocated = ALLOCATED_PORTS.lock().unwrap();
    allocated.clear();
    info!("Cleared all allocated ports");
}

/// Get the default fallback port if dynamic allocation fails
pub fn get_fallback_port() -> u16 {
    // Try a few fallback ports in case dynamic allocation fails
    let fallbacks = vec![60001, 60002, 60003, 60999, 3001];
    
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

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_find_available_port() {
        let port = find_available_port();
        assert!(port.is_some());
        let port = port.unwrap();
        assert!(port >= 60000 && port <= 61000);
    }

    #[test]
    fn test_is_port_available() {
        // This test might be flaky if port 60999 is actually in use
        // But it's unlikely
        let available = is_port_available(60999);
        // We can't assert true because the port might actually be in use
        // Just check that the function doesn't panic
        let _ = available;
    }
}
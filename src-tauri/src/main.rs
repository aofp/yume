// Prevents additional console window on Windows in release, DO NOT REMOVE!!
#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

fn main() {
    // Set up panic hook to ensure cleanup on panic
    std::panic::set_hook(Box::new(|info| {
        eprintln!("Application panic: {:?}", info);
        
        // DON'T kill all node processes - that affects other instances!
        // The logged_server module will handle cleanup of our specific process
        
        // Force exit
        std::process::exit(1);
    }));
    
    // Run the app
    yurucode_lib::run();
    
    // DON'T kill all node processes on exit
    // Each instance's server is managed by logged_server::stop_logged_server()
}

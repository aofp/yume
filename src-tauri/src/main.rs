// Prevents additional console window on Windows in release builds
// This attribute is crucial for Windows GUI applications to avoid showing a console
// DO NOT REMOVE - without this, Windows will show both the GUI and a console window
#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

/// Main entry point for the yume Tauri application
/// This is the actual executable entry that bootstraps the entire application
fn main() {
    // Custom panic handler for graceful error handling
    // Ensures the application exits cleanly even on unexpected panics
    // This is important for:
    // - Logging panic information for debugging
    // - Ensuring proper cleanup (though server cleanup is handled separately)
    // - Preventing zombie processes
    std::panic::set_hook(Box::new(|panic_info| {
        eprintln!("Application panic: {:?}", panic_info);
        // Ensure all Node.js processes associated with the application are terminated upon a panic.
        // This prevents orphaned processes and ensures a clean shutdown.
        yume_lib::cleanup_on_panic();
        std::process::exit(1);
    }));

    // Delegate to the library crate where the actual application logic lives
    // This separation allows for better code organization and testing
    yume_lib::run();

    // Note: Server cleanup is handled within the library's run() function
    // Each instance's server is managed individually by logged_server::stop_logged_server()
    // We specifically avoid killing all node processes to support multiple instances
}

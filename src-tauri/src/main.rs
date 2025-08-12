// Prevents additional console window on Windows in release, DO NOT REMOVE!!
#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

fn main() {
    // Set up panic hook to ensure cleanup on panic
    std::panic::set_hook(Box::new(|info| {
        eprintln!("Application panic: {:?}", info);
        
        // Quick cleanup on panic (non-blocking)
        #[cfg(target_os = "windows")]
        {
            let _ = std::process::Command::new("taskkill")
                .args(&["/F", "/IM", "node.exe"])
                .spawn();
        }
        
        // Force exit
        std::process::exit(1);
    }));
    
    // Run the app
    yurucode_lib::run();
    
    // If we get here, ensure cleanup before exit
    #[cfg(target_os = "windows")]
    {
        let _ = std::process::Command::new("taskkill")
            .args(&["/F", "/IM", "node.exe"])
            .spawn();
    }
}

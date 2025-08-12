// MacOS-specific imports must be at crate root
#[cfg(target_os = "macos")]
#[macro_use]
extern crate objc;

mod claude;
mod commands;
mod state;
mod websocket;
mod logged_server;

use std::sync::Arc;
use tauri::{Manager, Listener};
use tracing::{info, error};

use claude::ClaudeManager;
use state::AppState;

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    // Initialize tracing
    tracing_subscriber::fmt()
        .with_max_level(tracing::Level::INFO)
        .init();

    tauri::Builder::default()
        .plugin(tauri_plugin_fs::init())
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_shell::init())
        .plugin(tauri_plugin_store::Builder::new().build())
        .setup(|app| {
            info!("Starting yurucode Tauri app");

            // Initialize Claude manager
            let claude_manager = Arc::new(ClaudeManager::new());

            // Start the LOGGED server with full debugging
            let port = 3001;
            info!("Starting LOGGED Node.js server on port: {}", port);
            
            logged_server::start_logged_server();
            
            info!("Check these log files:");
            info!("  %TEMP%\\yurucode-rust.log");
            info!("  %TEMP%\\yurucode-server.log");
            info!("  %TEMP%\\yurucode-server-RUNNING.txt");

            // Initialize app state
            let app_state = AppState::new(claude_manager, port);
            let _ = app_state.load_persisted_data();

            // Store state for commands
            app.manage(app_state);

            // Set up window event handlers
            let window = app.get_webview_window("main").unwrap();
            
            // Always open DevTools in debug/development builds
            #[cfg(debug_assertions)]
            {
                window.open_devtools();
                info!("DevTools opened (debug build)");
            }
            
            // Enable F12 listener for DevTools
            {
                let _window_clone = window.clone();
                window.listen("open-devtools", move |_| {
                    info!("DevTools request via F12");
                    // DevTools toggling is handled via the toggle_devtools command
                    // which checks for debug/release builds internally
                });
            }
            
            // Apply custom window styles for macOS
            #[cfg(target_os = "macos")]
            {
                use cocoa::base::{id, YES, NO};
                
                let ns_window = window.ns_window().unwrap() as id;
                
                unsafe {
                    // Get the content view
                    let content_view: id = msg_send![ns_window, contentView];
                    
                    // Set the window to have a visual effect view background
                    let _: () = msg_send![content_view, setWantsLayer: YES];
                    
                    // Get the layer
                    let layer: id = msg_send![content_view, layer];
                    
                    // Set corner radius
                    let _: () = msg_send![layer, setCornerRadius: 4.0f64];
                    
                    // Set border
                    let border_color: id = msg_send![class!(NSColor), colorWithRed:1.0f64 green:1.0f64 blue:1.0f64 alpha:0.15f64];
                    let cg_color: id = msg_send![border_color, CGColor];
                    let _: () = msg_send![layer, setBorderColor: cg_color];
                    let _: () = msg_send![layer, setBorderWidth: 1.0f64];
                    
                    // Set background color to clear for transparency
                    let clear: id = msg_send![class!(NSColor), clearColor];
                    let _: () = msg_send![ns_window, setBackgroundColor: clear];
                    
                    // Make the window transparent
                    let _: () = msg_send![ns_window, setOpaque: NO];
                    
                    // Set the layer background to black
                    let black: id = msg_send![class!(NSColor), blackColor];
                    let black_cg: id = msg_send![black, CGColor];
                    let _: () = msg_send![layer, setBackgroundColor: black_cg];
                }
            }

            // Handle window close event - simplified for Windows
            let window_for_close = window.clone();
            window.on_window_event(move |event| {
                if let tauri::WindowEvent::CloseRequested { api, .. } = event {
                    info!("Window close requested, cleaning up...");
                    
                    // Stop the server immediately
                    logged_server::stop_logged_server();
                    info!("Server stopped, exiting application...");
                    
                    // Force exit immediately - don't wait
                    std::process::exit(0);
                }
            });
            
            // DevTools - will open via keyboard shortcut F12

            // Inject custom styles and debugging info for OLED theme
            window.eval(r#"
                console.log('Tauri window.eval executed!');
                const style = document.createElement('style');
                style.textContent = `
                    body {
                        background: #000000 !important;
                        -webkit-user-select: none;
                        user-select: none;
                    }
                    
                    ::-webkit-scrollbar {
                        width: 8px;
                        height: 8px;
                    }
                    
                    ::-webkit-scrollbar-track {
                        background: transparent;
                    }
                    
                    ::-webkit-scrollbar-thumb {
                        background: rgba(255, 153, 153, 0.3);
                        border-radius: 4px;
                    }
                    
                    ::-webkit-scrollbar-thumb:hover {
                        background: rgba(255, 153, 153, 0.5);
                    }
                `;
                document.head.appendChild(style);
                
                // Add debug message to check if JavaScript is running
                if (!document.getElementById('root')) {
                    document.body.innerHTML = '<div style="color: white; padding: 20px;">Debug: Root element not found. Window loaded but React not mounting.</div>';
                } else if (document.getElementById('root').children.length === 0) {
                    setTimeout(() => {
                        if (document.getElementById('root').children.length === 0) {
                            document.getElementById('root').innerHTML = '<div style="color: white; padding: 20px;">Debug: React app not loading. Check console for errors.</div>';
                        }
                    }, 2000);
                }
            "#).ok();

            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            commands::toggle_devtools,
            commands::select_folder,
            commands::get_server_port,
            commands::send_message,
            commands::interrupt_session,
            commands::clear_session,
            commands::get_sessions,
            commands::set_zoom_level,
            commands::minimize_window,
            commands::maximize_window,
            commands::close_window,
            commands::show_context_menu,
            commands::save_settings,
            commands::load_settings,
            commands::get_recent_projects,
            commands::add_recent_project,
        ])
        .on_window_event(|_app_handle, event| {
            // Additional handler for window events at app level
            match event {
                tauri::WindowEvent::Destroyed => {
                    info!("Window destroyed, ensuring final cleanup...");
                    // Final cleanup if not already done
                    logged_server::stop_logged_server();
                    // Exit immediately
                    std::process::exit(0);
                }
                tauri::WindowEvent::CloseRequested { .. } => {
                    info!("App-level close requested, stopping server...");
                    // Stop server at app level too
                    logged_server::stop_logged_server();
                    std::process::exit(0);
                }
                _ => {}
            }
        })
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
    
    // If we get here (app quit normally), ensure cleanup
    info!("App exiting normally, cleaning up...");
    logged_server::stop_logged_server();
}

#[cfg(target_os = "macos")]
mod macos {
    use cocoa::appkit::{NSWindowStyleMask, NSWindowTitleVisibility};
    use cocoa::base::{id, BOOL};
    
    pub trait NSWindowExt {
        unsafe fn setTitleVisibility_(&self, visibility: NSWindowTitleVisibility);
        unsafe fn setTitlebarAppearsTransparent_(&self, transparent: BOOL);
        unsafe fn styleMask(&self) -> NSWindowStyleMask;
        unsafe fn setStyleMask_(&self, mask: NSWindowStyleMask);
    }
    
    impl NSWindowExt for id {
        unsafe fn setTitleVisibility_(&self, visibility: NSWindowTitleVisibility) {
            msg_send![*self, setTitleVisibility:visibility]
        }
        
        unsafe fn setTitlebarAppearsTransparent_(&self, transparent: BOOL) {
            msg_send![*self, setTitlebarAppearsTransparent:transparent]
        }
        
        unsafe fn styleMask(&self) -> NSWindowStyleMask {
            msg_send![*self, styleMask]
        }
        
        unsafe fn setStyleMask_(&self, mask: NSWindowStyleMask) {
            msg_send![*self, setStyleMask:mask]
        }
    }
}

// Fallback server start function
fn start_server_fallback(app_handle: tauri::AppHandle) {
    use std::process::Command;
    
    info!("Attempting fallback server start...");
    
    // Use the correct server for production vs development
    let server_filename = if cfg!(debug_assertions) {
        "server-claude-direct.cjs"
    } else {
        // In production, use the simple server that works
        "server-simple.cjs"
    };
    
    let (server_path, working_dir) = if cfg!(debug_assertions) {
        // Development - use project root
        let project_root = std::env::current_exe()
            .ok()
            .and_then(|p| p.parent().map(|p| p.to_path_buf()))
            .and_then(|p| p.parent().map(|p| p.to_path_buf()))
            .and_then(|p| p.parent().map(|p| p.to_path_buf()))
            .and_then(|p| p.parent().map(|p| p.to_path_buf()))
            .unwrap_or_else(|| std::path::PathBuf::from("."));
        
        (project_root.join(server_filename), project_root)
    } else {
        // Production - resources are extracted to a temp directory
        if let Ok(resource_dir) = app_handle.path().resource_dir() {
            (resource_dir.join(server_filename), resource_dir)
        } else {
            error!("Failed to get resource directory");
            return;
        }
    };
    
    info!("Fallback server path: {:?}", server_path);
    
    // Find node
    let node_cmd = if cfg!(target_os = "windows") {
        which::which("node.exe")
            .or_else(|_| which::which("node"))
            .map(|p| p.to_string_lossy().to_string())
            .unwrap_or_else(|_| "node".to_string())
    } else {
        "node".to_string()
    };
    
    let mut cmd = Command::new(&node_cmd);
    cmd.arg(server_path.to_str().unwrap())
       .current_dir(working_dir);
    
    #[cfg(target_os = "windows")]
    {
        use std::os::windows::process::CommandExt;
        const CREATE_NO_WINDOW: u32 = 0x08000000;
        cmd.creation_flags(CREATE_NO_WINDOW);
    }
    
    match cmd.spawn() {
        Ok(mut child) => {
            info!("Fallback server started with PID: {}", child.id());
            let _ = child.wait();
        }
        Err(e) => {
            error!("Fallback server failed: {}", e);
        }
    }
}
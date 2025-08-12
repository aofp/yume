// MacOS-specific imports must be at crate root
#[cfg(target_os = "macos")]
#[macro_use]
extern crate objc;

mod claude;
mod commands;
mod state;
mod websocket;

use std::sync::Arc;
use tauri::Manager;
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

            // Start the Node.js server
            let port = 3001;
            info!("Starting Node.js server on port: {}", port);
            
            // Spawn the Node.js server process in a simple way
            std::thread::spawn(|| {
                // Use different server for Windows vs macOS
                let server_path = if cfg!(target_os = "windows") {
                    "server-claude-direct.cjs"
                } else {
                    "server-claude-macos.js"
                };
                
                // Get the app's resource directory (where the app bundle is located)
                let working_dir = if let Ok(exe_path) = std::env::current_exe() {
                    // For Windows, go up from target\debug to project root
                    if cfg!(target_os = "windows") {
                        exe_path
                            .parent() // debug
                            .and_then(|p| p.parent()) // target
                            .and_then(|p| p.parent()) // src-tauri
                            .and_then(|p| p.parent()) // yurucode (project root)
                            .map(|p| p.to_path_buf())
                            .unwrap_or_else(|| {
                                std::path::PathBuf::from("C:\\Users\\muuko\\Desktop\\yurucode")
                            })
                    } else {
                        // macOS path logic
                        exe_path
                            .parent() // MacOS
                            .and_then(|p| p.parent()) // Contents
                            .and_then(|p| p.parent()) // yurucode.app
                            .and_then(|p| p.parent()) // bundle/macos
                            .and_then(|p| p.parent()) // bundle
                            .and_then(|p| p.parent()) // release
                            .and_then(|p| p.parent()) // target
                            .and_then(|p| p.parent()) // src-tauri
                            .and_then(|p| p.parent()) // yurucode (project root)
                            .map(|p| p.to_path_buf())
                            .unwrap_or_else(|| {
                                std::path::PathBuf::from("/Users/yuru/yurucode")
                            })
                    }
                } else {
                    if cfg!(target_os = "windows") {
                        std::path::PathBuf::from("C:\\Users\\muuko\\Desktop\\yurucode")
                    } else {
                        std::path::PathBuf::from("/Users/yuru/yurucode")
                    }
                };
                
                info!("Starting Node.js server from: {:?}", working_dir.join(&server_path));
                
                match std::process::Command::new("node")
                    .arg(server_path)
                    .current_dir(&working_dir)
                    .spawn() {
                    Ok(mut child) => {
                        info!("Node.js server started with PID: {:?}", child.id());
                        
                        // Store the child process ID for cleanup
                        if let Ok(_) = std::fs::write(".server.pid", child.id().to_string()) {
                            info!("Saved server PID to file");
                        }
                        
                        // Keep the server running
                        let _ = child.wait();
                    },
                    Err(e) => {
                        error!("Failed to start Node.js server: {}", e);
                    }
                }
            });
            
            // Give the server a moment to start
            std::thread::sleep(std::time::Duration::from_millis(2000));
            
            info!("Node.js server should be running on port: {}", port);

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

            // Handle window close event
            window.on_window_event(move |event| {
                if let tauri::WindowEvent::CloseRequested { api, .. } = event {
                    // Prevent default close to cleanup first
                    api.prevent_close();
                    
                    // Kill the Node.js server if it's running
                    if let Ok(pid_str) = std::fs::read_to_string(".server.pid") {
                        if let Ok(pid) = pid_str.trim().parse::<u32>() {
                            // Cross-platform process killing
                            #[cfg(target_os = "macos")]
                            {
                                let _ = std::process::Command::new("kill")
                                    .arg("-TERM")
                                    .arg(pid.to_string())
                                    .output();
                            }
                            #[cfg(target_os = "windows")]
                            {
                                let _ = std::process::Command::new("taskkill")
                                    .args(&["/F", "/PID", &pid.to_string()])
                                    .output();
                            }
                            #[cfg(target_os = "linux")]
                            {
                                let _ = std::process::Command::new("kill")
                                    .arg("-TERM")
                                    .arg(pid.to_string())
                                    .output();
                            }
                            
                            // Clean up the PID file
                            let _ = std::fs::remove_file(".server.pid");
                        }
                    }
                    
                    // Cleanup and then close
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
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
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
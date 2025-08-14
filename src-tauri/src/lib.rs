// MacOS-specific imports must be at crate root
#[cfg(target_os = "macos")]
#[macro_use]
extern crate objc;

mod claude;
mod commands;
mod state;
mod websocket;
mod logged_server;
mod port_manager;

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
        .plugin(tauri_plugin_clipboard_manager::init())
        .setup(|app| {
            info!("Starting yurucode Tauri app");

            // Initialize Claude manager
            let claude_manager = Arc::new(ClaudeManager::new());

            // ALWAYS allocate a fresh dynamic port for EVERY instance
            let server_port = {
                info!("Allocating dynamic port for this instance");
                port_manager::find_available_port()
                    .unwrap_or_else(|| port_manager::get_fallback_port())
            };
            
            info!("Starting LOGGED Node.js server on port: {}", server_port);
            logged_server::start_logged_server(server_port);
            info!("Server started on port {}", server_port);

            // Initialize app state
            let app_state = AppState::new(claude_manager, server_port);
            let _ = app_state.load_persisted_data();

            // Store state for commands
            app.manage(app_state);
            
            // Wait for Vite to be ready (only in dev mode)
            #[cfg(debug_assertions)]
            {
                info!("Waiting for Vite dev server to be ready...");
                // On Windows, just wait a fixed time - connection checks fail due to Windows networking
                std::thread::sleep(std::time::Duration::from_secs(5));
                info!("Proceeding to open window after 5 second wait...");
            }

            // Set up window event handlers
            let window = app.get_webview_window("main").unwrap();
            
            // Restore window state BEFORE showing the window
            {
                let window_clone = window.clone();
                let app_handle = app.handle().clone();
                tauri::async_runtime::block_on(async move {
                    restore_window_state(&window_clone, &app_handle).await;
                });
            }
            
            // Show the window after a small delay to ensure everything is ready
            {
                let window_clone = window.clone();
                std::thread::spawn(move || {
                    // Wait a bit for the webview to load and apply styles
                    std::thread::sleep(std::time::Duration::from_millis(300));
                    let _ = window_clone.show();
                    info!("Window shown after initialization");
                });
            }
            
            // Check if YURUCODE_SHOW_CONSOLE is set (from logged_server)
            // DevTools methods are only available in debug builds
            #[cfg(debug_assertions)]
            {
                if logged_server::YURUCODE_SHOW_CONSOLE {
                    window.open_devtools();
                    info!("DevTools FORCED OPEN (YURUCODE_SHOW_CONSOLE=true)");
                } else {
                    window.open_devtools();
                    info!("DevTools opened (debug build)");
                }
            }
            
            #[cfg(not(debug_assertions))]
            {
                if logged_server::YURUCODE_SHOW_CONSOLE {
                    info!("DevTools would be forced open but not available in release build");
                    info!("To enable DevTools in release, rebuild in debug mode");
                }
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
            
            // Note: Tauri v2 file drops are handled via webview events
            // The frontend will handle drag-and-drop directly using web APIs
            // and can call Tauri commands if needed to process dropped folders
            
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
            {
                let window_clone = window.clone();
                let app_handle = app.handle().clone();
                window.on_window_event(move |event| {
                    match event {
                        tauri::WindowEvent::CloseRequested { .. } => {
                            info!("Window close requested, saving state...");
                            
                            // Save window state before closing
                            let window_for_save = window_clone.clone();
                            let app_for_save = app_handle.clone();
                            tauri::async_runtime::block_on(async move {
                                save_window_state(&window_for_save, &app_for_save).await;
                            });
                            
                            // DON'T stop the server - other windows might be using it!
                            // DON'T exit the app - let Tauri handle window lifecycle
                            info!("Window closing, server remains running for other windows");
                        }
                        tauri::WindowEvent::Resized(_) | tauri::WindowEvent::Moved(_) => {
                            // Save window state on resize/move with debouncing
                            let window_for_save = window_clone.clone();
                            let app_for_save = app_handle.clone();
                            tauri::async_runtime::spawn(async move {
                                // Simple debounce - wait 500ms before saving
                                tokio::time::sleep(std::time::Duration::from_millis(500)).await;
                                save_window_state(&window_for_save, &app_for_save).await;
                            });
                        }
                        _ => {}
                    }
                });
            }
            
            // DevTools - will open via keyboard shortcut F12

            // Inject custom styles and debugging info for OLED theme
            window.eval(r#"
                console.log('Tauri window.eval executed!');
                console.log('Current URL:', window.location.href);
                console.log('Document ready state:', document.readyState);
                console.log('Document body:', document.body ? 'exists' : 'missing');
                console.log('Root element:', document.getElementById('root'));
                
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
                    console.error('Root element not found!');
                    console.log('Document HTML:', document.documentElement.innerHTML.substring(0, 500));
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
            commands::new_window,
            commands::send_message,
            commands::interrupt_session,
            commands::clear_session,
            commands::get_sessions,
            commands::set_zoom_level,
            commands::minimize_window,
            commands::maximize_window,
            commands::get_server_logs,
            commands::get_server_log_path,
            commands::close_window,
            commands::show_context_menu,
            commands::save_settings,
            commands::load_settings,
            commands::get_recent_projects,
            commands::add_recent_project,
            commands::check_is_directory,
            commands::toggle_console_visibility,
            commands::open_external,
            commands::search_files,
            commands::get_recent_files,
            commands::get_git_status,
            commands::get_folder_contents,
        ])
        .on_window_event(|app_handle, event| {
            // Only handle cleanup when truly needed
            match event {
                tauri::WindowEvent::Destroyed => {
                    // The Destroyed event fires AFTER the window is removed
                    // So we need to check if any windows remain
                    let remaining_windows = app_handle.webview_windows();
                    
                    // Note: The destroyed window is already removed from the list
                    if remaining_windows.is_empty() {
                        info!("Last window destroyed, stopping server and exiting...");
                        logged_server::stop_logged_server();
                        // Let Tauri handle the exit properly
                    } else {
                        info!("Window destroyed, {} window(s) still open", remaining_windows.len());
                    }
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

// Window state persistence functions
async fn save_window_state(window: &tauri::WebviewWindow, app: &tauri::AppHandle) {
    use tauri_plugin_store::StoreExt;
    
    if let Ok(size) = window.outer_size() {
        if let Ok(position) = window.outer_position() {
            let store = app.store("window-state.json").expect("Failed to get store");
            
            // Save window dimensions and position
            let _ = store.set("width", serde_json::json!(size.width));
            let _ = store.set("height", serde_json::json!(size.height));
            let _ = store.set("x", serde_json::json!(position.x));
            let _ = store.set("y", serde_json::json!(position.y));
            let _ = store.save();
            
            info!("Saved window state: {}x{} at ({}, {})", size.width, size.height, position.x, position.y);
        }
    }
}

async fn restore_window_state(window: &tauri::WebviewWindow, app: &tauri::AppHandle) {
    use tauri_plugin_store::StoreExt;
    
    let store = app.store("window-state.json").expect("Failed to get store");
    
    // Try to restore window size
    if let Some(width) = store.get("width") {
        if let Some(height) = store.get("height") {
            if let (Some(w), Some(h)) = (width.as_u64(), height.as_u64()) {
                let _ = window.set_size(tauri::PhysicalSize::new(w as u32, h as u32));
                info!("Restored window size: {}x{}", w, h);
            }
        }
    }
    
    // Try to restore window position
    if let Some(x) = store.get("x") {
        if let Some(y) = store.get("y") {
            if let (Some(x_pos), Some(y_pos)) = (x.as_i64(), y.as_i64()) {
                let _ = window.set_position(tauri::PhysicalPosition::new(x_pos as i32, y_pos as i32));
                info!("Restored window position: ({}, {})", x_pos, y_pos);
            }
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
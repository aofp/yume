// MacOS-specific imports must be at crate root
// The objc crate provides Objective-C runtime bindings for macOS-specific window customization
#[cfg(target_os = "macos")]
#[macro_use]
extern crate objc;

// Module declarations for the application's core functionality
mod claude;         // Claude CLI process management and communication
mod commands;       // Tauri IPC commands exposed to the frontend
mod state;          // Application state management (sessions, settings, etc.)
mod websocket;      // WebSocket server for real-time communication with frontend
mod logged_server;  // Node.js server process management with logging
mod port_manager;   // Dynamic port allocation for server instances

use std::sync::Arc;
use tauri::{Manager, Listener};
use tracing::{info, error};

use claude::ClaudeManager;
use state::AppState;

/// Main entry point for the Tauri application
/// This function sets up the entire application infrastructure:
/// - Initializes logging/tracing for debugging
/// - Configures Tauri plugins (filesystem, dialog, shell, etc.)
/// - Starts the Node.js backend server for Claude CLI communication
/// - Sets up window styling and event handlers
/// - Manages application lifecycle and cleanup
#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    // Initialize tracing/logging system for application-wide debugging
    // Logs are output to console with INFO level and above
    tracing_subscriber::fmt()
        .with_max_level(tracing::Level::INFO)
        .init();

    // Build the Tauri application with required plugins
    tauri::Builder::default()
        .plugin(tauri_plugin_fs::init())        // File system access for project navigation
        .plugin(tauri_plugin_dialog::init())    // Native file/folder selection dialogs
        .plugin(tauri_plugin_shell::init())     // Shell command execution capabilities
        .plugin(tauri_plugin_store::Builder::new().build()) // Persistent storage for settings/state
        .plugin(tauri_plugin_clipboard_manager::init())     // Clipboard operations for copy/paste
        .setup(|app| {
            // Application setup phase - runs once at startup
            info!("Starting yurucode Tauri app");

            // Initialize Claude manager for handling Claude CLI process lifecycle
            // Arc allows safe sharing across threads
            let claude_manager = Arc::new(ClaudeManager::new());

            // Dynamic port allocation strategy to avoid conflicts
            // Each app instance gets its own port in the 60000-61000 range
            // This prevents multiple instances from conflicting
            let server_port = {
                info!("Allocating dynamic port for this instance");
                port_manager::find_available_port()
                    .unwrap_or_else(|| port_manager::get_fallback_port())
            };
            
            // Start the Node.js backend server that bridges between Tauri and Claude CLI
            // This server handles spawning Claude processes and parsing their output
            info!("Starting LOGGED Node.js server on port: {}", server_port);
            logged_server::start_logged_server(server_port);
            info!("Server started on port {}", server_port);

            // Initialize centralized application state
            // Contains: sessions, settings, recent projects, Claude manager reference
            let app_state = AppState::new(claude_manager, server_port);
            let _ = app_state.load_persisted_data();  // Restore previous session data

            // Register app state with Tauri's state management system
            // This makes it accessible to all command handlers
            app.manage(app_state);
            
            // Development mode: Wait for Vite dev server to fully initialize
            // This prevents the window from opening before the frontend is ready
            // Windows has networking quirks that prevent connection checks, so we use a fixed delay
            #[cfg(debug_assertions)]
            {
                info!("Waiting for Vite dev server to be ready...");
                // On Windows, just wait a fixed time - connection checks fail due to Windows networking
                std::thread::sleep(std::time::Duration::from_secs(5));
                info!("Proceeding to open window after 5 second wait...");
            }

            // Get reference to the main application window for configuration
            let window = app.get_webview_window("main").unwrap();
            
            // Development builds get a (dev) suffix in the title bar
            // This helps distinguish dev instances from production
            #[cfg(debug_assertions)]
            {
                let _ = window.set_title("yuru code (dev)");
                info!("Set window title to: yuru code (dev)");
            }
            
            // Restore previous window size and position from persistent storage
            // This happens BEFORE showing the window to prevent visual jumps
            {
                let window_clone = window.clone();
                let app_handle = app.handle().clone();
                tauri::async_runtime::block_on(async move {
                    restore_window_state(&window_clone, &app_handle).await;
                });
            }
            
            // Delayed window display strategy
            // The window starts hidden (configured in tauri.conf.json)
            // We show it after a brief delay to ensure:
            // - WebView is fully loaded
            // - Styles are applied
            // - No white flash on startup
            {
                let window_clone = window.clone();
                std::thread::spawn(move || {
                    // Wait a bit for the webview to load and apply styles
                    std::thread::sleep(std::time::Duration::from_millis(300));
                    let _ = window_clone.show();
                    info!("Window shown after initialization");
                });
            }
            
            // DevTools configuration for debugging
            // In debug builds, DevTools can be opened programmatically
            // YURUCODE_SHOW_CONSOLE environment variable forces DevTools open
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
            
            // Register F12 key listener for DevTools toggle
            // The actual toggle is handled by the toggle_devtools command
            // which properly checks debug vs release build constraints
            {
                let _window_clone = window.clone();
                window.listen("open-devtools", move |_| {
                    info!("DevTools request via F12");
                    // DevTools toggling is handled via the toggle_devtools command
                    // which checks for debug/release builds internally
                });
            }
            
            // File drag-and-drop handling note:
            // Tauri v2 delegates drag-and-drop to the webview
            // The React frontend handles drops via HTML5 drag-and-drop API
            // and calls Tauri commands when folders are dropped
            
            // macOS-specific window customization using Objective-C runtime
            // Creates a native macOS look with:
            // - Rounded corners
            // - Subtle border
            // - True transparency
            // - Black OLED-optimized background
            #[cfg(target_os = "macos")]
            {
                use cocoa::base::{id, YES, NO};
                use cocoa::appkit::NSWindowTitleVisibility;
                
                let ns_window = window.ns_window().unwrap() as id;
                
                unsafe {
                    // CRITICAL: Set minimum window size for macOS
                    use cocoa::foundation::NSSize;
                    let min_size = NSSize::new(516.0, 509.0);
                    let _: () = msg_send![ns_window, setMinSize: min_size];
                    info!("Set macOS minimum window size to 516x509");
                    
                    // CRITICAL: Hide the native titlebar completely
                    let _: () = msg_send![ns_window, setTitleVisibility: NSWindowTitleVisibility::NSWindowTitleHidden];
                    
                    // CRITICAL: Make titlebar fully transparent
                    let _: () = msg_send![ns_window, setTitlebarAppearsTransparent: YES];
                    
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

            // Window lifecycle event handlers
            // Manages:
            // - Saving window state on close/resize/move
            // - Graceful cleanup when closing
            // - Multi-window support (server stays alive for other windows)
            {
                let window_clone = window.clone();
                let app_handle = app.handle().clone();
                window.on_window_event(move |event| {
                    match event {
                        tauri::WindowEvent::CloseRequested { .. } => {
                            info!("Window close requested, saving state...");
                            
                            // Persist window dimensions and position for next launch
                            let window_for_save = window_clone.clone();
                            let app_for_save = app_handle.clone();
                            tauri::async_runtime::block_on(async move {
                                save_window_state(&window_for_save, &app_for_save).await;
                            });
                            
                            // Multi-window support: Server stays alive for other windows
                            // Tauri handles the actual window close and app exit logic
                            info!("Window closing, server remains running for other windows");
                        }
                        tauri::WindowEvent::Resized(size) => {
                            // Enforce minimum size constraints
                            if size.width < 516 || size.height < 509 {
                                let new_width = size.width.max(516);
                                let new_height = size.height.max(509);
                                let window_for_resize = window_clone.clone();
                                // Force resize back to minimum immediately
                                std::thread::spawn(move || {
                                    std::thread::sleep(std::time::Duration::from_millis(10));
                                    let _ = window_for_resize.set_size(tauri::PhysicalSize::new(new_width, new_height));
                                });
                                info!("Window too small ({}x{}), enforcing minimum size: {}x{}", size.width, size.height, new_width, new_height);
                                // Don't save invalid size - return early
                            } else {
                                // Only save valid sizes
                                // Auto-save window position/size changes
                                // Debounced to avoid excessive disk writes during drag operations
                                let window_for_save = window_clone.clone();
                                let app_for_save = app_handle.clone();
                                tauri::async_runtime::spawn(async move {
                                    // Simple debounce - wait 500ms before saving
                                    tokio::time::sleep(std::time::Duration::from_millis(500)).await;
                                    save_window_state(&window_for_save, &app_for_save).await;
                                });
                            }
                        }
                        tauri::WindowEvent::Moved(_) => {
                            // Auto-save window position changes
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

            // Inject critical styles and debugging code into the webview
            // This ensures the OLED black theme is applied immediately
            // Also provides debugging info if React fails to mount
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
            commands::get_home_directory,
            commands::get_current_directory,
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
            commands::execute_bash,
            commands::search_files,
            commands::get_recent_files,
            commands::get_git_status,
            commands::get_folder_contents,
        ])
        .on_window_event(|app_handle, event| {
            // Global window event handler for app-level lifecycle
            // Manages server cleanup when the last window closes
            match event {
                tauri::WindowEvent::Destroyed => {
                    // Multi-window cleanup logic
                    // The Destroyed event fires AFTER the window is removed from the list
                    // Check if this was the last window, and stop the server if so
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
    
    // Final cleanup when the app exits normally
    // Ensures the Node.js server process is terminated
    info!("App exiting normally, cleaning up...");
    logged_server::stop_logged_server();
}

/// macOS-specific window customization traits and implementations
/// Provides safe Rust wrappers around Objective-C NSWindow methods
/// Used for creating the custom transparent, borderless window style
#[cfg(target_os = "macos")]
mod macos {
    use cocoa::appkit::{NSWindowStyleMask, NSWindowTitleVisibility};
    use cocoa::base::{id, BOOL};
    
    pub trait NSWindowExt {
        #[allow(non_snake_case)]
        unsafe fn setTitleVisibility_(&self, visibility: NSWindowTitleVisibility);
        #[allow(non_snake_case)]
        unsafe fn setTitlebarAppearsTransparent_(&self, transparent: BOOL);
        #[allow(non_snake_case)]
        unsafe fn styleMask(&self) -> NSWindowStyleMask;
        #[allow(non_snake_case)]
        unsafe fn setStyleMask_(&self, mask: NSWindowStyleMask);
    }
    
    #[allow(non_snake_case)]
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

/// Saves the current window state (size and position) to persistent storage
/// This data is used to restore the window to its previous state on next launch
/// Uses the tauri-plugin-store for JSON-based persistence
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

/// Restores window size and position from persistent storage
/// Called during app initialization before the window is shown
/// Provides a seamless experience by remembering user's window preferences
async fn restore_window_state(window: &tauri::WebviewWindow, app: &tauri::AppHandle) {
    use tauri_plugin_store::StoreExt;
    
    let store = app.store("window-state.json").expect("Failed to get store");
    
    // Try to restore window size with minimum size enforcement
    if let Some(width) = store.get("width") {
        if let Some(height) = store.get("height") {
            if let (Some(w), Some(h)) = (width.as_u64(), height.as_u64()) {
                // Enforce minimum size of 516x509
                let final_width = (w as u32).max(516);
                let final_height = (h as u32).max(509);
                let _ = window.set_size(tauri::PhysicalSize::new(final_width, final_height));
                info!("Restored window size: {}x{} (enforced minimums)", final_width, final_height);
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

/// Fallback function to start the Node.js server if the primary method fails
/// Attempts to locate and spawn the server process manually
/// Uses different server scripts for development vs production builds
/// This is a last-resort recovery mechanism
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
// MacOS-specific imports must be at crate root
// The objc crate provides Objective-C runtime bindings for macOS-specific window customization
#[cfg(target_os = "macos")]
#[macro_use]
extern crate objc;

// Module declarations for the application's core functionality
mod claude;         // Claude CLI process management and communication
mod claude_binary;  // Claude binary detection and environment setup
mod claude_session; // Session management and ID extraction
mod claude_spawner; // Claude process spawning and coordination
mod stream_parser;  // Stream JSON parsing for Claude output
mod commands;       // Tauri IPC commands exposed to the frontend
mod process;        // Process registry for tracking and managing Claude processes
mod state;          // Application state management (sessions, settings, etc.)
mod websocket;      // WebSocket server for real-time communication with frontend
mod logged_server;  // Node.js server process management with logging
mod port_manager;   // Dynamic port allocation for server instances
mod db;             // SQLite database for persistent storage
mod hooks;          // Hook system for intercepting and modifying Claude behavior
mod compaction;     // Context compaction management for auto-trigger at 96%
mod mcp;            // Model Context Protocol (MCP) server management
mod config;         // Production configuration management
mod crash_recovery; // Crash recovery and session restoration
mod agents;         // Agent management for AI assistants

use std::sync::{Arc, atomic::{AtomicBool, Ordering}};
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
            // Each app instance gets its own port in the 20000-65000 range
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
            
            // Initialize production configuration
            let production_config = config::init_production_config();
            app.manage(production_config.clone());
            
            // Initialize crash recovery system
            let crash_recovery_manager = crash_recovery::init_crash_recovery(&app.handle());
            app.manage(crash_recovery_manager);
            
            
            // Development mode: Wait for Vite dev server to fully initialize
            // This prevents the window from opening before the frontend is ready
            // Windows has networking quirks that prevent connection checks, so we use a fixed delay
            #[cfg(debug_assertions)]
            {
                info!("Waiting for Vite dev server to be ready...");
                // Reduced wait time for faster startup
                std::thread::sleep(std::time::Duration::from_millis(500));
                info!("Proceeding to open window after 0.5 second wait...");
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
            
            
            // Add window event listener to configure transparency after page loads
            {
                let window_for_transparency = window.clone();
                window.listen("DOMContentLoaded", move |_| {
                    // Inject transparency styles after DOM is ready
                    let _ = window_for_transparency.eval(r#"
                        // Force webview transparency
                        document.documentElement.style.setProperty('background', 'transparent', 'important');
                        document.documentElement.style.setProperty('background-color', 'transparent', 'important');
                        
                        // Create observer to maintain transparency
                        const observer = new MutationObserver(() => {
                            if (document.documentElement.style.backgroundColor !== 'transparent') {
                                document.documentElement.style.backgroundColor = 'transparent';
                            }
                        });
                        observer.observe(document.documentElement, { 
                            attributes: true, 
                            attributeFilter: ['style'] 
                        });
                        
                        console.log('Transparency enforced via DOMContentLoaded');
                    "#);
                });
            }
            
            // Delayed window display strategy
            // The window starts hidden (configured in tauri.conf.json with visible: false)
            // We show it after a brief delay to ensure:
            // - WebView is fully loaded
            // - Styles are applied
            // - Window position/size is restored
            // - No white flash on startup
            {
                let window_clone = window.clone();
                std::thread::spawn(move || {
                    // Increased delay to ensure window is fully ready
                    // This prevents the brief flash of an improperly positioned window
                    std::thread::sleep(std::time::Duration::from_millis(200));
                    let _ = window_clone.show();
                    let _ = window_clone.set_focus();
                    info!("Window shown and focused after initialization");
                });
            }
            
            // DevTools configuration for debugging
            // In debug builds, DevTools can be opened with F12
            // YURUCODE_SHOW_CONSOLE environment variable forces DevTools open
            #[cfg(debug_assertions)]
            {
                if logged_server::YURUCODE_SHOW_CONSOLE {
                    window.open_devtools();
                    info!("DevTools FORCED OPEN (YURUCODE_SHOW_CONSOLE=true)");
                } else {
                    // DevTools not auto-opened in debug builds anymore
                    // Use F12 to open DevTools when needed
                    info!("DevTools available via F12 (debug build)");
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
            
            // Windows-specific minimum size enforcement with WndProc hook
            #[cfg(target_os = "windows")]
            {
                use windows::Win32::Foundation::{HWND, LPARAM, WPARAM, LRESULT};
                use windows::Win32::UI::WindowsAndMessaging::{
                    SetWindowLongPtrW, GetWindowLongPtrW, CallWindowProcW,
                    SetWindowPos, SWP_NOMOVE, SWP_NOZORDER,
                    GWLP_WNDPROC, WM_GETMINMAXINFO, WM_SIZING,
                    MINMAXINFO
                };
                use windows::Win32::Foundation::RECT;
                
                if let Ok(hwnd) = window.hwnd() {
                    let hwnd = HWND(hwnd.0);
                    
                    // Store the original window procedure
                    static mut ORIGINAL_WNDPROC: Option<isize> = None;
                    static INIT: std::sync::Mutex<bool> = std::sync::Mutex::new(false);
                    
                    unsafe {
                        // Custom window procedure to enforce minimum size with comprehensive error handling
                        unsafe extern "system" fn wndproc(
                            hwnd: HWND,
                            msg: u32,
                            wparam: WPARAM,
                            lparam: LPARAM,
                        ) -> LRESULT {
                            // Validate hwnd is not null
                            if hwnd.0 == 0 {
                                return LRESULT(0);
                            }
                            
                            match msg {
                                WM_GETMINMAXINFO => {
                                    // Validate lparam before casting
                                    if lparam.0 == 0 {
                                        return LRESULT(0);
                                    }
                                    
                                    // Enforce minimum size through MINMAXINFO
                                    let info = lparam.0 as *mut MINMAXINFO;
                                    if !info.is_null() {
                                        // Additional validation: check if pointer is aligned
                                        if (info as usize) % std::mem::align_of::<MINMAXINFO>() == 0 {
                                            (*info).ptMinTrackSize.x = 516;
                                            (*info).ptMinTrackSize.y = 509;
                                        }
                                    }
                                    LRESULT(0)
                                }
                                WM_SIZING => {
                                    // Validate lparam before casting
                                    if lparam.0 == 0 {
                                        return LRESULT(0);
                                    }
                                    
                                    // Enforce minimum size during resize dragging
                                    let rect = lparam.0 as *mut RECT;
                                    if !rect.is_null() {
                                        // Additional validation: check if pointer is aligned
                                        if (rect as usize) % std::mem::align_of::<RECT>() == 0 {
                                            let width = (*rect).right - (*rect).left;
                                            let height = (*rect).bottom - (*rect).top;
                                            
                                            // Validate reasonable dimensions
                                            if width >= 0 && width < 10000 && height >= 0 && height < 10000 {
                                                if width < 516 {
                                                    (*rect).right = (*rect).left + 516;
                                                }
                                                if height < 509 {
                                                    (*rect).bottom = (*rect).top + 509;
                                                }
                                            }
                                        }
                                    }
                                    LRESULT(1) // TRUE to indicate we modified the rect
                                }
                                _ => {
                                    // Call the original window procedure for other messages
                                    if let Some(original) = ORIGINAL_WNDPROC {
                                        // Validate the original procedure pointer
                                        if original != 0 {
                                            CallWindowProcW(
                                                Some(std::mem::transmute(original)),
                                                hwnd,
                                                msg,
                                                wparam,
                                                lparam
                                            )
                                        } else {
                                            LRESULT(0)
                                        }
                                    } else {
                                        LRESULT(0)
                                    }
                                }
                            }
                        }
                        
                        let mut init = INIT.lock().unwrap();
                        if !*init {
                            // Get and store the original window procedure
                            let original = GetWindowLongPtrW(hwnd, GWLP_WNDPROC);
                            ORIGINAL_WNDPROC = Some(original);
                            
                            // Set our custom window procedure
                            SetWindowLongPtrW(
                                hwnd,
                                GWLP_WNDPROC,
                                wndproc as usize as isize
                            );
                            
                            *init = true;
                            info!("Installed Windows WndProc hook for minimum size enforcement");
                        }
                        
                        // Also force initial size to at least minimum
                        let _ = SetWindowPos(
                            hwnd,
                            HWND::default(),
                            0,
                            0,
                            516,
                            509,
                            SWP_NOMOVE | SWP_NOZORDER
                        );
                        info!("Set Windows initial size to 516x509");
                    }
                }
            }
            
            // macOS-specific window customization using Objective-C runtime
            // Creates a native macOS look with:
            // - Rounded corners
            // - Subtle border
            // - True transparency
            // - Black OLED-optimized background
            #[cfg(target_os = "macos")]
            {
                use cocoa::base::{id, nil, YES, NO};
                use cocoa::appkit::NSWindowTitleVisibility;
                use cocoa::foundation::NSString;
                use std::ffi::CStr;
                
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
                    
                    // Set the layer background to clear for transparency
                    // Do NOT set to black as it prevents transparency
                    let clear_cg: id = msg_send![clear, CGColor];
                    let _: () = msg_send![layer, setBackgroundColor: clear_cg];
                    
                    // CRITICAL: Configure the WKWebView for transparency
                    // This is the missing piece that makes webview transparency work
                    let subviews: id = msg_send![content_view, subviews];
                    let count: usize = msg_send![subviews, count];
                    
                    // Find and configure the WKWebView
                    for i in 0..count {
                        let subview: id = msg_send![subviews, objectAtIndex:i];
                        let class: id = msg_send![subview, class];
                        let class_name: id = msg_send![class, description];
                        let class_name_str: *const i8 = msg_send![class_name, UTF8String];
                        
                        if !class_name_str.is_null() {
                            let class_name_rust = CStr::from_ptr(class_name_str).to_str().unwrap_or("");
                            
                            if class_name_rust.contains("WKWebView") {
                                // Make WKWebView transparent
                                let _: () = msg_send![subview, setOpaque: NO];
                                
                                // Set WKWebView layer for transparency
                                let _: () = msg_send![subview, setWantsLayer: YES];
                                let webview_layer: id = msg_send![subview, layer];
                                let _: () = msg_send![webview_layer, setBackgroundColor: clear_cg];
                                let _: () = msg_send![webview_layer, setOpaque: NO];
                                
                                // Use _drawsBackground and _backgroundColor for WKWebView
                                // These are private properties that control the background
                                let no_value: id = msg_send![class!(NSNumber), numberWithBool: NO];
                                let _: () = msg_send![subview, setValue:no_value forKey:NSString::alloc(nil).init_str("_drawsBackground")];
                                let _: () = msg_send![subview, setValue:clear forKey:NSString::alloc(nil).init_str("_backgroundColor")];
                                
                                info!("Configured WKWebView for transparency");
                                break;
                            }
                        }
                    }
                    
                    // Note: WKWebView configuration happens in the window.eval() section below
                }
            }

            // Configure native window properties for better interaction
            // Enable first click on macOS to accept mouse events even when window is not active
            #[cfg(target_os = "macos")]
            {
                use cocoa::appkit::{NSWindow, NSWindowCollectionBehavior};
                use cocoa::base::id;
                
                let ns_window = window.ns_window().unwrap() as id;
                unsafe {
                    // Enable first mouse click to both activate window AND process the click
                    // This makes the app feel more responsive
                    ns_window.setAcceptsMouseMovedEvents_(true);
                    
                    // Also ensure window can become key and main window
                    let collection_behavior = NSWindowCollectionBehavior::NSWindowCollectionBehaviorFullScreenPrimary
                        | NSWindowCollectionBehavior::NSWindowCollectionBehaviorManaged;
                    ns_window.setCollectionBehavior_(collection_behavior);
                }
            }
            
            // Configure Windows-specific window properties
            #[cfg(target_os = "windows")]
            {
                use windows::Win32::Foundation::HWND;
                use windows::Win32::UI::WindowsAndMessaging::{
                    SetWindowLongPtrW, GetWindowLongPtrW, GWL_EXSTYLE, 
                    WS_EX_ACCEPTFILES, WS_EX_APPWINDOW, SetForegroundWindow
                };
                
                let hwnd = window.hwnd().unwrap();
                unsafe {
                    let hwnd = HWND(hwnd.0);
                    // Get current extended style
                    let ex_style = GetWindowLongPtrW(hwnd, GWL_EXSTYLE);
                    // Add accept files and app window flags for better interaction
                    SetWindowLongPtrW(
                        hwnd, 
                        GWL_EXSTYLE, 
                        ex_style | (WS_EX_ACCEPTFILES.0 as isize) | (WS_EX_APPWINDOW.0 as isize)
                    );
                    // Force window to take focus
                    let _ = SetForegroundWindow(hwnd);
                }
            }
            
            // Configure Linux-specific window properties
            #[cfg(target_os = "linux")]
            {
                // On Linux with GTK, first click behavior is generally handled well by default
                // But we can ensure the window is set to accept focus
                if let Ok(gtk_window) = window.gtk_window() {
                    use gtk::prelude::*;
                    gtk_window.set_accept_focus(true);
                    gtk_window.set_can_focus(true);
                    // Ensure window appears in taskbar and can be activated
                    gtk_window.set_skip_taskbar_hint(false);
                    gtk_window.set_skip_pager_hint(false);
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
                let resize_pending = Arc::new(AtomicBool::new(false));
                let save_pending = Arc::new(AtomicBool::new(false));
                
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
                                // Only resize if not already pending
                                if !resize_pending.swap(true, Ordering::SeqCst) {
                                    let new_width = size.width.max(516);
                                    let new_height = size.height.max(509);
                                    let window_for_resize = window_clone.clone();
                                    let resize_flag = resize_pending.clone();
                                    
                                    // Set size synchronously to prevent flicker
                                    let _ = window_for_resize.set_size(tauri::PhysicalSize::new(new_width, new_height));
                                    
                                    // Reset flag after a delay
                                    std::thread::spawn(move || {
                                        std::thread::sleep(std::time::Duration::from_millis(100));
                                        resize_flag.store(false, Ordering::SeqCst);
                                    });
                                }
                            } else {
                                // Only save valid sizes with debounce
                                if !save_pending.swap(true, Ordering::SeqCst) {
                                    let window_for_save = window_clone.clone();
                                    let app_for_save = app_handle.clone();
                                    let save_flag = save_pending.clone();
                                    
                                    tauri::async_runtime::spawn(async move {
                                        // Debounce - wait 500ms before saving
                                        tokio::time::sleep(std::time::Duration::from_millis(500)).await;
                                        save_window_state(&window_for_save, &app_for_save).await;
                                        save_flag.store(false, Ordering::SeqCst);
                                    });
                                }
                            }
                        }
                        tauri::WindowEvent::Moved(_) => {
                            // Auto-save window position changes with debounce
                            if !save_pending.swap(true, Ordering::SeqCst) {
                                let window_for_save = window_clone.clone();
                                let app_for_save = app_handle.clone();
                                let save_flag = save_pending.clone();
                                
                                tauri::async_runtime::spawn(async move {
                                    // Debounce - wait 500ms before saving
                                    tokio::time::sleep(std::time::Duration::from_millis(500)).await;
                                    save_window_state(&window_for_save, &app_for_save).await;
                                    save_flag.store(false, Ordering::SeqCst);
                                });
                            }
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
                
                // Set up transparency support with webkit-specific styles
                document.documentElement.style.backgroundColor = 'transparent';
                document.documentElement.style.background = 'transparent';
                if (document.body) {
                    document.body.style.backgroundColor = 'rgba(0, 0, 0, 1)';
                    document.body.style.background = 'rgba(0, 0, 0, 1)';
                }
                
                const style = document.createElement('style');
                style.textContent = `
                    :root {
                        --bg-color: rgba(0, 0, 0, 1);
                        --bg-opacity: 1;
                    }
                    
                    html {
                        background-color: transparent !important;
                        background: transparent !important;
                        -webkit-app-region: no-drag;
                    }
                    
                    body {
                        background: var(--bg-color, rgba(0, 0, 0, 1)) !important;
                        background-color: var(--bg-color, rgba(0, 0, 0, 1)) !important;
                        -webkit-user-select: none;
                        user-select: none;
                        -webkit-app-region: no-drag;
                    }
                    
                    /* WebKit-specific transparency */
                    ::-webkit-scrollbar-corner {
                        background: transparent;
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
            // Window management
            commands::toggle_devtools,
            commands::select_folder,
            commands::get_server_port,
            commands::read_port_file,
            commands::get_home_directory,
            commands::get_current_directory,
            commands::new_window,
            // Claude detection
            commands::claude_detector::check_file_exists,
            commands::claude_detector::check_wsl_available,
            commands::claude_detector::get_wsl_username,
            commands::claude_detector::check_wsl_file_exists,
            commands::claude_detector::execute_wsl_command,
            commands::claude_detector::execute_command,
            commands::claude_detector::save_claude_settings,
            commands::claude_detector::load_claude_settings,
            // Claude version and path commands
            commands::get_claude_version,
            commands::get_claude_path,
            // Legacy Claude commands (to be replaced)
            commands::send_message,
            commands::interrupt_session,
            commands::clear_session,
            commands::get_sessions,
            // New direct CLI Claude commands
            commands::claude_commands::spawn_claude_session,
            commands::claude_commands::send_claude_message,
            commands::claude_commands::resume_claude_session,
            commands::claude_commands::interrupt_claude_session,
            commands::claude_commands::clear_claude_context,
            commands::claude_commands::get_session_info,
            commands::claude_commands::get_token_stats,
            commands::claude_commands::list_active_sessions,
            commands::claude_commands::get_session_output,
            commands::claude_info::get_claude_binary_info,
            // UI commands
            commands::set_zoom_level,
            commands::minimize_window,
            commands::maximize_window,
            commands::get_server_logs,
            commands::get_server_log_path,
            commands::clear_server_logs,
            commands::load_claude_agents,
            commands::load_project_agents,
            commands::save_global_agent,
            commands::save_project_agent,
            commands::delete_global_agent,
            commands::delete_project_agent,
            commands::close_window,
            commands::show_context_menu,
            commands::restore_window_focus,
            // Settings and state
            commands::save_settings,
            commands::load_settings,
            commands::get_recent_projects,
            commands::add_recent_project,
            commands::check_is_directory,
            commands::toggle_console_visibility,
            commands::get_system_fonts,
            commands::open_external,
            // Bash execution
            commands::execute_bash,
            commands::spawn_bash,
            commands::kill_bash_process,
            // File operations
            commands::search_files,
            commands::get_recent_files,
            commands::get_git_status,
            commands::get_folder_contents,
            // Database operations
            commands::database::db_save_session,
            commands::database::db_load_session,
            commands::database::db_load_all_sessions,
            commands::database::db_delete_session,
            commands::database::db_save_message,
            commands::database::db_load_messages,
            commands::database::db_save_analytics,
            commands::database::db_load_analytics,
            commands::database::db_get_statistics,
            commands::database::db_clear_all_data,
            commands::database::db_export_data,
            commands::database::db_import_data,
            // Hook operations
            commands::hooks::execute_hook,
            commands::hooks::test_hook,
            commands::hooks::get_hook_events,
            commands::hooks::get_sample_hooks,
            // Compaction operations
            commands::compaction::update_context_usage,
            commands::compaction::save_context_manifest,
            commands::compaction::load_context_manifest,
            commands::compaction::get_compaction_state,
            commands::compaction::reset_compaction_state,
            commands::compaction::update_compaction_config,
            commands::compaction::get_compaction_config,
            commands::compaction::generate_context_manifest,
            // MCP operations
            commands::mcp::mcp_list,
            commands::mcp::mcp_add,
            commands::mcp::mcp_remove,
            commands::mcp::mcp_test_connection,
            commands::mcp::mcp_import_claude_desktop,
            commands::mcp::mcp_export_config,
            // Agent operations
            agents::list_agents,
            agents::load_default_agents,
            agents::create_agent,
            agents::delete_agent,
            // Custom commands operations
            commands::load_custom_commands,
            commands::load_project_commands,
            commands::save_custom_command,
            commands::save_project_command,
            commands::delete_custom_command,
            commands::delete_project_command,
            commands::load_all_commands,
            commands::migrate_commands_to_filesystem,
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
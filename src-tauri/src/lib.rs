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
use tracing::info;

use claude::ClaudeManager;
use state::AppState;
use websocket::WebSocketServer;

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

            // Use port 3001 (where Node.js server is running)
            let port = 3001;
            info!("Using Node.js server on port: {}", port);

            // Don't start Rust WebSocket server - use Node.js server instead
            // The Node.js server handles Socket.IO protocol correctly

            // Initialize app state
            let app_state = AppState::new(claude_manager, port);
            let _ = app_state.load_persisted_data();

            // Store state for commands
            app.manage(app_state);

            // Set up window event handlers
            let window = app.get_webview_window("main").unwrap();
            
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
                    
                    // Cleanup and then close
                    std::process::exit(0);
                }
            });
            
            // Open devtools in development mode
            #[cfg(debug_assertions)]
            {
                window.open_devtools();
            }

            // Inject custom styles for OLED theme
            window.eval(r#"
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
            "#).ok();

            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
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
/// Database commands for yurucode
/// Provides SQLite persistence for sessions, messages, and analytics

use serde::{Deserialize, Serialize};
use tauri::State;
use crate::db::{Database, Session, Message, Analytics};
use crate::state::AppState;
use chrono::Utc;

/// Initialize the database connection
/// This is called during app startup
pub fn init_database() -> Result<Database, String> {
    Database::new().map_err(|e| format!("Failed to initialize database: {}", e))
}

/// Save or update a session in the database
#[tauri::command]
pub async fn db_save_session(
    state: State<'_, AppState>,
    session: Session,
) -> Result<(), String> {
    let db = state.database()
        .ok_or_else(|| "Database not initialized".to_string())?;
    
    // Check if session exists
    if let Ok(Some(_existing)) = db.get_session(&session.id) {
        db.update_session(&session)
    } else {
        db.create_session(&session)
    }
    .map_err(|e| format!("Failed to save session: {}", e))
}

/// Load a specific session from the database
#[tauri::command]
pub async fn db_load_session(
    state: State<'_, AppState>,
    session_id: String,
) -> Result<Option<Session>, String> {
    let db = state.database()
        .ok_or_else(|| "Database not initialized".to_string())?;
    
    db.get_session(&session_id)
        .map_err(|e| format!("Failed to load session: {}", e))
}

/// Load all sessions from the database
#[tauri::command]
pub async fn db_load_all_sessions(
    state: State<'_, AppState>,
) -> Result<Vec<Session>, String> {
    let db = state.database()
        .ok_or_else(|| "Database not initialized".to_string())?;
    
    db.get_all_sessions()
        .map_err(|e| format!("Failed to load sessions: {}", e))
}

/// Delete a session from the database
#[tauri::command]
pub async fn db_delete_session(
    state: State<'_, AppState>,
    session_id: String,
) -> Result<(), String> {
    let db = state.database()
        .ok_or_else(|| "Database not initialized".to_string())?;
    
    db.delete_session(&session_id)
        .map_err(|e| format!("Failed to delete session: {}", e))
}

/// Save a message to the database
#[tauri::command]
pub async fn db_save_message(
    state: State<'_, AppState>,
    message: Message,
) -> Result<(), String> {
    let db = state.database()
        .ok_or_else(|| "Database not initialized".to_string())?;
    
    db.save_message(&message)
        .map_err(|e| format!("Failed to save message: {}", e))
}

/// Load all messages for a session
#[tauri::command]
pub async fn db_load_messages(
    state: State<'_, AppState>,
    session_id: String,
) -> Result<Vec<Message>, String> {
    let db = state.database()
        .ok_or_else(|| "Database not initialized".to_string())?;
    
    db.get_session_messages(&session_id)
        .map_err(|e| format!("Failed to load messages: {}", e))
}

/// Save analytics data to the database
#[tauri::command]
pub async fn db_save_analytics(
    state: State<'_, AppState>,
    analytics: Analytics,
) -> Result<(), String> {
    let db = state.database()
        .ok_or_else(|| "Database not initialized".to_string())?;
    
    db.save_analytics(&analytics)
        .map_err(|e| format!("Failed to save analytics: {}", e))
}

/// Load analytics for a session
#[tauri::command]
pub async fn db_load_analytics(
    state: State<'_, AppState>,
    session_id: String,
) -> Result<Vec<Analytics>, String> {
    let db = state.database()
        .ok_or_else(|| "Database not initialized".to_string())?;
    
    db.get_session_analytics(&session_id)
        .map_err(|e| format!("Failed to load analytics: {}", e))
}

/// Get database statistics
#[tauri::command]
pub async fn db_get_statistics(
    state: State<'_, AppState>,
) -> Result<serde_json::Value, String> {
    let db = state.database()
        .ok_or_else(|| "Database not initialized".to_string())?;
    
    db.get_statistics()
        .map_err(|e| format!("Failed to get database statistics: {}", e))
}

/// Clear all data from the database
/// This is a destructive operation that requires confirmation
#[tauri::command]
pub async fn db_clear_all_data(
    state: State<'_, AppState>,
    confirm: bool,
) -> Result<(), String> {
    if !confirm {
        return Err("Confirmation required to clear database".to_string());
    }
    
    let db = state.database()
        .ok_or_else(|| "Database not initialized".to_string())?;
    
    db.clear_all_data()
        .map_err(|e| format!("Failed to clear database: {}", e))
}

/// Export all database data as JSON
/// Used for backups and data portability
#[tauri::command]
pub async fn db_export_data(
    state: State<'_, AppState>,
) -> Result<serde_json::Value, String> {
    let db = state.database()
        .ok_or_else(|| "Database not initialized".to_string())?;
    
    // Load all sessions with their messages and analytics
    let sessions = db.get_all_sessions()
        .map_err(|e| format!("Failed to load sessions: {}", e))?;
    
    let mut export_data = Vec::new();
    
    for session in sessions {
        let messages = db.get_session_messages(&session.id)
            .map_err(|e| format!("Failed to load messages for session {}: {}", session.id, e))?;
        
        let analytics = db.get_session_analytics(&session.id)
            .map_err(|e| format!("Failed to load analytics for session {}: {}", session.id, e))?;
        
        export_data.push(serde_json::json!({
            "session": session,
            "messages": messages,
            "analytics": analytics,
        }));
    }
    
    Ok(serde_json::json!({
        "version": "1.0",
        "exported_at": Utc::now().to_rfc3339(),
        "data": export_data,
    }))
}

/// Import database data from JSON
/// Used for restoring backups
#[tauri::command]
pub async fn db_import_data(
    state: State<'_, AppState>,
    data: serde_json::Value,
) -> Result<(), String> {
    let db = state.database()
        .ok_or_else(|| "Database not initialized".to_string())?;
    
    // Validate version
    let version = data.get("version")
        .and_then(|v| v.as_str())
        .ok_or_else(|| "Invalid import data: missing version".to_string())?;
    
    if version != "1.0" {
        return Err(format!("Unsupported import version: {}", version));
    }
    
    // Extract data array
    let import_data = data.get("data")
        .and_then(|d| d.as_array())
        .ok_or_else(|| "Invalid import data: missing data array".to_string())?;
    
    // Import each session with its data
    for item in import_data {
        // Parse session
        let session: Session = serde_json::from_value(
            item.get("session")
                .ok_or_else(|| "Missing session data")?
                .clone()
        ).map_err(|e| format!("Failed to parse session: {}", e))?;
        
        // Create session
        db.create_session(&session)
            .map_err(|e| format!("Failed to import session {}: {}", session.id, e))?;
        
        // Import messages
        if let Some(messages) = item.get("messages").and_then(|m| m.as_array()) {
            for msg_value in messages {
                let message: Message = serde_json::from_value(msg_value.clone())
                    .map_err(|e| format!("Failed to parse message: {}", e))?;
                
                db.save_message(&message)
                    .map_err(|e| format!("Failed to import message: {}", e))?;
            }
        }
        
        // Import analytics
        if let Some(analytics_list) = item.get("analytics").and_then(|a| a.as_array()) {
            for analytics_value in analytics_list {
                let analytics: Analytics = serde_json::from_value(analytics_value.clone())
                    .map_err(|e| format!("Failed to parse analytics: {}", e))?;
                
                db.save_analytics(&analytics)
                    .map_err(|e| format!("Failed to import analytics: {}", e))?;
            }
        }
    }
    
    Ok(())
}
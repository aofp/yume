use crate::compaction::{CompactionConfig, CompactionState, ContextManifest, ContextInfo, Decision};
use crate::state::AppState;
use serde_json::Value;
use tauri::State;
use chrono::Utc;

#[tauri::command]
pub async fn update_context_usage(
    state: State<'_, AppState>,
    session_id: String,
    usage: f32,
) -> Result<String, String> {
    let compaction_manager = state.compaction_manager.lock().await;
    let action = compaction_manager.update_context_usage(session_id.clone(), usage).await;
    
    // If auto-trigger or force, return action for frontend to handle
    Ok(serde_json::to_string(&action).unwrap_or_else(|_| "null".to_string()))
}

#[tauri::command]
pub async fn save_context_manifest(
    state: State<'_, AppState>,
    session_id: String,
    manifest_data: Value,
) -> Result<String, String> {
    let compaction_manager = state.compaction_manager.lock().await;
    
    // Parse manifest from JSON value
    let manifest: ContextManifest = serde_json::from_value(manifest_data)
        .map_err(|e| format!("Failed to parse manifest: {}", e))?;
    
    compaction_manager.save_manifest(&session_id, manifest).await
}

#[tauri::command]
pub async fn load_context_manifest(
    state: State<'_, AppState>,
    session_id: String,
) -> Result<ContextManifest, String> {
    let compaction_manager = state.compaction_manager.lock().await;
    compaction_manager.load_manifest(&session_id).await
}

#[tauri::command]
pub async fn get_compaction_state(
    state: State<'_, AppState>,
    session_id: String,
) -> Result<Option<CompactionState>, String> {
    let compaction_manager = state.compaction_manager.lock().await;
    Ok(compaction_manager.get_state(&session_id).await)
}

#[tauri::command]
pub async fn reset_compaction_state(
    state: State<'_, AppState>,
    session_id: String,
) -> Result<(), String> {
    let compaction_manager = state.compaction_manager.lock().await;
    compaction_manager.reset_session(&session_id).await;
    Ok(())
}

#[tauri::command]
pub async fn reset_compaction_flags(
    state: State<'_, AppState>,
    session_id: String,
) -> Result<(), String> {
    let compaction_manager = state.compaction_manager.lock().await;
    compaction_manager.reset_compaction_flags(&session_id).await;
    Ok(())
}

#[tauri::command]
pub async fn update_compaction_config(
    state: State<'_, AppState>,
    config: CompactionConfig,
) -> Result<(), String> {
    let compaction_manager = state.compaction_manager.lock().await;
    compaction_manager.update_config(config).await;
    Ok(())
}

#[tauri::command]
pub async fn get_compaction_config(
    state: State<'_, AppState>,
) -> Result<CompactionConfig, String> {
    let compaction_manager = state.compaction_manager.lock().await;
    Ok(compaction_manager.get_config().await)
}

#[tauri::command]
pub async fn generate_context_manifest(
    state: State<'_, AppState>,
    session_id: String,
    task_id: Option<String>,
    scope: Option<String>,
    files: Vec<String>,
    functions: Vec<String>,
    dependencies: Vec<String>,
    decisions: Vec<Value>,
) -> Result<ContextManifest, String> {
    // Parse decisions from JSON values
    let parsed_decisions: Vec<Decision> = decisions
        .into_iter()
        .map(|d| serde_json::from_value(d).unwrap_or_else(|_| Decision {
            decision: "Unknown".to_string(),
            rationale: "Unknown".to_string(),
            timestamp: Utc::now(),
        }))
        .collect();
    
    // Create manifest
    let manifest = ContextManifest {
        version: "1.0".to_string(),
        task_id,
        session_id: session_id.clone(),
        timestamp: Utc::now(),
        context: ContextInfo {
            files,
            functions,
            dependencies,
            decisions: parsed_decisions,
        },
        scope,
        entry_points: vec![],
        test_files: vec![],
    };
    
    // Save it
    let compaction_manager = state.compaction_manager.lock().await;
    compaction_manager.save_manifest(&session_id, manifest.clone()).await?;
    
    Ok(manifest)
}
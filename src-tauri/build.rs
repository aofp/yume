/// Tauri build script
/// Runs at compile time before the main application is built
/// - Injects app metadata from package.json into Rust code
/// - Generates platform-specific resources
/// - Processes tauri.conf.json configuration
use std::fs;
use std::path::PathBuf;

fn main() {
    // Tell Cargo to rerun if package.json changes
    println!("cargo:rerun-if-changed=../package.json");

    // Read package.json from parent directory
    let manifest_dir = PathBuf::from(env!("CARGO_MANIFEST_DIR"));
    let package_json_path = manifest_dir.parent().unwrap().join("package.json");

    let package_json_content =
        fs::read_to_string(&package_json_path).expect("Failed to read package.json");

    // Extract name and version (simple JSON parsing to avoid dependencies)
    let name =
        extract_json_field(&package_json_content, "name").unwrap_or_else(|| "yume".to_string());
    let version =
        extract_json_field(&package_json_content, "version").unwrap_or_else(|| "0.1.0".to_string());

    // Normalize name for file system use (lowercase, alphanumeric + hyphens only)
    let app_id = name
        .to_lowercase()
        .chars()
        .filter(|c| c.is_alphanumeric() || *c == '-')
        .collect::<String>();

    // Inject into Rust code via environment variables (accessible with env!() macro)
    println!("cargo:rustc-env=APP_NAME={}", name);
    println!("cargo:rustc-env=APP_VERSION={}", version);
    println!("cargo:rustc-env=APP_ID={}", app_id);

    println!(
        "cargo:warning=Building {} v{} (id: {})",
        name, version, app_id
    );

    tauri_build::build()
}

// Simple JSON field extractor (avoids serde dependency in build script)
fn extract_json_field(json: &str, field: &str) -> Option<String> {
    let pattern = format!(r#""{}""#, field);
    if let Some(start) = json.find(&pattern) {
        if let Some(colon_pos) = json[start..].find(':') {
            let after_colon = &json[start + colon_pos + 1..];
            let trimmed = after_colon.trim_start();
            if trimmed.starts_with('"') {
                if let Some(end_quote) = trimmed[1..].find('"') {
                    return Some(trimmed[1..end_quote + 1].to_string());
                }
            }
        }
    }
    None
}

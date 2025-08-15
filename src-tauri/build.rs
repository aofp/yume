/// Tauri build script
/// This script runs at compile time before the main application is built
/// It handles:
/// - Generating platform-specific resources
/// - Processing tauri.conf.json configuration
/// - Setting up app icons and metadata
/// - Configuring code signing (macOS/Windows)
/// - Preparing the application bundle structure
/// 
/// The tauri_build::build() function reads tauri.conf.json and generates
/// necessary code and resources for the target platform
fn main() {
  tauri_build::build()
}

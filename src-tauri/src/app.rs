pub const APP_NAME: &str = env!("APP_NAME");
pub const APP_VERSION: &str = env!("APP_VERSION");
pub const APP_ID: &str = env!("APP_ID");

pub const APP_IDENTIFIER: &str = concat!("be.yuru.", env!("APP_ID"));
pub const PLUGIN_ID: &str = env!("APP_ID");
pub const SERVER_BINARY_PREFIX: &str = concat!(env!("APP_ID"), "-bin");
pub const PLUGIN_DIR_NAME: &str = concat!(env!("APP_ID"), "-plugin");
pub const VSCODE_DIR_NAME: &str = concat!(env!("APP_ID"), "-vscode");
pub const VSCODE_EXTENSION_ID: &str = concat!(env!("APP_ID"), ".", env!("APP_ID"));
pub const VSCODE_EXTENSION_DIR_PREFIX: &str = concat!(env!("APP_ID"), ".", env!("APP_ID"), "-");

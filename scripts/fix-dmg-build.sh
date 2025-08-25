#!/bin/bash

# Fix for DMG build failure on macOS
# This script creates the DMG manually after Tauri build

APP_PATH="/Users/yuru/yurucode/src-tauri/target/aarch64-apple-darwin/release/bundle/macos/yurucode.app"
DMG_PATH="/Users/yuru/yurucode/src-tauri/target/aarch64-apple-darwin/release/bundle/dmg/yurucode_0.1.0_aarch64.dmg"

if [ -d "$APP_PATH" ]; then
    echo "📦 Creating DMG manually..."
    hdiutil create -volname "yurucode" -srcfolder "$APP_PATH" -ov -format UDZO "$DMG_PATH"
    
    if [ -f "$DMG_PATH" ]; then
        echo "✅ DMG created successfully!"
        echo "📂 Opening DMG..."
        open "$DMG_PATH"
    else
        echo "❌ Failed to create DMG"
        exit 1
    fi
else
    echo "❌ App bundle not found at $APP_PATH"
    exit 1
fi
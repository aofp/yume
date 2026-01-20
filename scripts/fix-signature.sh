#!/bin/bash
set -e

# Fix malformed adhoc signature on macOS builds
# Run this after tauri build completes

APP_PATH="$1"

if [ -z "$APP_PATH" ]; then
    echo "Usage: $0 /path/to/yume.app"
    exit 1
fi

if [ ! -d "$APP_PATH" ]; then
    echo "Error: App bundle not found at $APP_PATH"
    exit 1
fi

echo "Stripping broken adhoc signature from $APP_PATH..."
codesign --remove-signature "$APP_PATH"

echo "Re-signing with proper adhoc signature..."
# Adhoc signatures don't support --options runtime or entitlements
codesign --sign - --deep --force "$APP_PATH"

echo "✅ Signature fixed!"
echo ""
echo "Verification:"
codesign -dvv "$APP_PATH" 2>&1 | head -10

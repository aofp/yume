#!/bin/bash
set -e

# Notarize the macOS app bundle
# Usage: ./scripts/notarize.sh path/to/yume.app

APP_PATH="$1"
BUNDLE_ID="be.yuru.yume"

# Check if app path provided
if [ -z "$APP_PATH" ]; then
    echo "Error: Please provide path to app bundle"
    echo "Usage: $0 /path/to/yume.app"
    exit 1
fi

# Check if APPLE_ID and APPLE_PASSWORD are set
if [ -z "$APPLE_ID" ] || [ -z "$APPLE_PASSWORD" ]; then
    echo "Error: Set APPLE_ID and APPLE_PASSWORD environment variables"
    echo "  export APPLE_ID='your@email.com'"
    echo "  export APPLE_PASSWORD='app-specific-password'"
    exit 1
fi

echo "Creating DMG for notarization..."
DMG_PATH="${APP_PATH%.app}.dmg"
hdiutil create -volname "yume" -srcfolder "$APP_PATH" -ov -format UDZO "$DMG_PATH"

echo "Submitting for notarization..."
xcrun notarytool submit "$DMG_PATH" \
    --apple-id "$APPLE_ID" \
    --password "$APPLE_PASSWORD" \
    --team-id "$TEAM_ID" \
    --wait

echo "Stapling notarization ticket..."
xcrun stapler staple "$APP_PATH"

echo "✅ Notarization complete!"

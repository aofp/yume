#!/bin/bash
# Build a .pkg installer for macOS that auto-removes quarantine flags
# Usage: ./scripts/build-pkg.sh [aarch64|x64]

set -e

ARCH="${1:-aarch64}"
VERSION=$(node -p "require('./package.json').version")

if [ "$ARCH" = "aarch64" ]; then
    TARGET="aarch64-apple-darwin"
    ARCH_NAME="arm64"
elif [ "$ARCH" = "x64" ]; then
    TARGET="x86_64-apple-darwin"
    ARCH_NAME="x64"
else
    echo "Error: Invalid architecture. Use 'aarch64' or 'x64'"
    exit 1
fi

APP_BUNDLE="src-tauri/target/$TARGET/release/bundle/macos/yume.app"
DMG_DIR="src-tauri/target/$TARGET/release/bundle/dmg"
PKG_DIR="src-tauri/target/$TARGET/release/bundle/pkg"

if [ ! -d "$APP_BUNDLE" ]; then
    echo "Error: App bundle not found at $APP_BUNDLE"
    echo "Run 'npm run tauri:build:mac:$ARCH' first"
    exit 1
fi

echo "📦 Building .pkg installer for $ARCH ($ARCH_NAME)..."
echo "Version: $VERSION"
echo ""

# Create pkg directory
mkdir -p "$PKG_DIR"

# Build the pkg using component mode (prevents relocation)
PKG_OUTPUT="$PKG_DIR/yume_${VERSION}_${ARCH_NAME}.pkg"

echo "Creating package..."
pkgbuild \
    --component "$APP_BUNDLE" \
    --identifier "io.github.aofp.yume" \
    --version "$VERSION" \
    --install-location "/Applications" \
    --scripts "$(pwd)/scripts/pkg-scripts" \
    "$PKG_OUTPUT"

echo ""
echo "✅ Package created: $PKG_OUTPUT"
echo ""
echo "Size: $(du -h "$PKG_OUTPUT" | cut -f1)"
echo ""
echo "Users can install this .pkg and the app will automatically work without quarantine errors!"

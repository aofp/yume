#!/bin/bash
# yume release script
# usage: ./scripts/release.sh 0.1.0 "release notes here"

VERSION=$1
NOTES=$2
DATE=$(date +%Y-%m-%d)

if [ -z "$VERSION" ]; then
    echo "usage: ./scripts/release.sh <version> [notes]"
    echo "example: ./scripts/release.sh 0.1.0 'initial release'"
    exit 1
fi

NOTES=${NOTES:-"release $VERSION"}
YUME_DIR="$HOME/yume"
RELEASES_DIR="$HOME/yume-io/releases"

echo "=== yume release $VERSION ==="
echo "date: $DATE"
echo "notes: $NOTES"
echo ""

# check if yume dir exists
if [ ! -d "$YUME_DIR" ]; then
    echo "error: $YUME_DIR does not exist"
    exit 1
fi

# check for built binaries
echo "looking for binaries..."

MAC_ARM="$YUME_DIR/src-tauri/target/aarch64-apple-darwin/release/bundle/dmg"
MAC_X64="$YUME_DIR/src-tauri/target/x86_64-apple-darwin/release/bundle/dmg"
WIN="$YUME_DIR/src-tauri/target/release/bundle/msi"
LINUX="$YUME_DIR/src-tauri/target/release/bundle/appimage"

# copy mac arm64
if [ -d "$MAC_ARM" ]; then
    DMG=$(ls -1 "$MAC_ARM"/*.dmg 2>/dev/null | head -1)
    if [ -n "$DMG" ]; then
        cp "$DMG" "$RELEASES_DIR/yume-$VERSION-macos-arm64.dmg"
        echo "copied: yume-$VERSION-macos-arm64.dmg"
    fi
fi

# copy mac x64
if [ -d "$MAC_X64" ]; then
    DMG=$(ls -1 "$MAC_X64"/*.dmg 2>/dev/null | head -1)
    if [ -n "$DMG" ]; then
        cp "$DMG" "$RELEASES_DIR/yume-$VERSION-macos-x64.dmg"
        echo "copied: yume-$VERSION-macos-x64.dmg"
    fi
fi

# copy windows
if [ -d "$WIN" ]; then
    MSI=$(ls -1 "$WIN"/*.msi 2>/dev/null | head -1)
    if [ -n "$MSI" ]; then
        cp "$MSI" "$RELEASES_DIR/yume-$VERSION-windows-x64.msi"
        echo "copied: yume-$VERSION-windows-x64.msi"
    fi
fi

# copy linux
if [ -d "$LINUX" ]; then
    APP=$(ls -1 "$LINUX"/*.AppImage 2>/dev/null | head -1)
    if [ -n "$APP" ]; then
        cp "$APP" "$RELEASES_DIR/yume-$VERSION-linux-x64.AppImage"
        echo "copied: yume-$VERSION-linux-x64.AppImage"
    fi
fi

echo ""
echo "done. now:"
echo "1. update releases/releases.json with version $VERSION"
echo "2. git add . && git commit -m 'release $VERSION'"
echo "3. git push"

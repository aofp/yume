#!/bin/bash

# Generate all icons from yume.png
# Ensures all icons are RGBA format

SOURCE="yume.png"
ICON_DIR="src-tauri/icons"

echo "🎨 Generating icons from $SOURCE..."

# Check if source exists
if [ ! -f "$SOURCE" ]; then
    echo "❌ Source file $SOURCE not found!"
    exit 1
fi

# Create icons directory if it doesn't exist
mkdir -p "$ICON_DIR"

# Standard sizes for Tauri (Linux/General)
STANDARD_SIZES=(16 24 32 48 64 128 256 512)

echo "📐 Generating standard icons..."
for size in "${STANDARD_SIZES[@]}"; do
    output="$ICON_DIR/${size}x${size}.png"
    echo "  Creating $output..."
    magick "$SOURCE" -resize ${size}x${size} -define png:color-type=6 "$output"
done

# Special macOS retina icon
echo "  Creating 128x128@2x.png (256x256 for retina)..."
magick "$SOURCE" -resize 256x256 -define png:color-type=6 "$ICON_DIR/128x128@2x.png"

# Main icon.png (typically 512x512 or 1024x1024)
echo "  Creating icon.png (1024x1024)..."
magick "$SOURCE" -define png:color-type=6 "$ICON_DIR/icon.png"

# Windows Store icons (UWP)
echo "🪟 Generating Windows Store icons..."
WINDOWS_SIZES=(
    "Square30x30Logo:30"
    "Square44x44Logo:44"
    "Square71x71Logo:71"
    "Square89x89Logo:89"
    "Square107x107Logo:107"
    "Square142x142Logo:142"
    "Square150x150Logo:150"
    "Square284x284Logo:284"
    "Square310x310Logo:310"
    "StoreLogo:50"
)

for item in "${WINDOWS_SIZES[@]}"; do
    name="${item%%:*}"
    size="${item##*:}"
    output="$ICON_DIR/${name}.png"
    echo "  Creating $output..."
    magick "$SOURCE" -resize ${size}x${size} -define png:color-type=6 "$output"
done

# Generate Windows ICO file (multi-resolution)
echo "🪟 Generating Windows icon.ico..."
magick "$SOURCE" -resize 16x16 -define png:color-type=6 "$ICON_DIR/icon-16.png"
magick "$SOURCE" -resize 32x32 -define png:color-type=6 "$ICON_DIR/icon-32.png"
magick "$SOURCE" -resize 48x48 -define png:color-type=6 "$ICON_DIR/icon-48.png"
magick "$SOURCE" -resize 64x64 -define png:color-type=6 "$ICON_DIR/icon-64.png"
magick "$SOURCE" -resize 128x128 -define png:color-type=6 "$ICON_DIR/icon-128.png"
magick "$SOURCE" -resize 256x256 -define png:color-type=6 "$ICON_DIR/icon-256.png"

# Create ICO with multiple resolutions
magick "$ICON_DIR/icon-16.png" "$ICON_DIR/icon-32.png" "$ICON_DIR/icon-48.png" \
       "$ICON_DIR/icon-64.png" "$ICON_DIR/icon-128.png" "$ICON_DIR/icon-256.png" \
       "$ICON_DIR/icon.ico"

# Clean up temporary icon files
rm -f "$ICON_DIR/icon-16.png" "$ICON_DIR/icon-32.png" "$ICON_DIR/icon-48.png" \
      "$ICON_DIR/icon-64.png" "$ICON_DIR/icon-128.png" "$ICON_DIR/icon-256.png"

# Generate macOS ICNS file
echo "🍎 Generating macOS icon.icns..."
# Create iconset directory
ICONSET_DIR="$ICON_DIR/icon.iconset"
mkdir -p "$ICONSET_DIR"

# Generate all required sizes for macOS
magick "$SOURCE" -resize 16x16 -define png:color-type=6 "$ICONSET_DIR/icon_16x16.png"
magick "$SOURCE" -resize 32x32 -define png:color-type=6 "$ICONSET_DIR/icon_16x16@2x.png"
magick "$SOURCE" -resize 32x32 -define png:color-type=6 "$ICONSET_DIR/icon_32x32.png"
magick "$SOURCE" -resize 64x64 -define png:color-type=6 "$ICONSET_DIR/icon_32x32@2x.png"
magick "$SOURCE" -resize 128x128 -define png:color-type=6 "$ICONSET_DIR/icon_128x128.png"
magick "$SOURCE" -resize 256x256 -define png:color-type=6 "$ICONSET_DIR/icon_128x128@2x.png"
magick "$SOURCE" -resize 256x256 -define png:color-type=6 "$ICONSET_DIR/icon_256x256.png"
magick "$SOURCE" -resize 512x512 -define png:color-type=6 "$ICONSET_DIR/icon_256x256@2x.png"
magick "$SOURCE" -resize 512x512 -define png:color-type=6 "$ICONSET_DIR/icon_512x512.png"
magick "$SOURCE" -resize 1024x1024 -define png:color-type=6 "$ICONSET_DIR/icon_512x512@2x.png"

# Convert iconset to icns
iconutil -c icns "$ICONSET_DIR" -o "$ICON_DIR/icon.icns"

# Clean up iconset
rm -rf "$ICONSET_DIR"

echo "✅ Icon generation complete!"
echo ""
echo "📊 Verifying icons are RGBA..."
# Verify a few key icons
for icon in "$ICON_DIR/32x32.png" "$ICON_DIR/128x128.png" "$ICON_DIR/icon.png"; do
    if [ -f "$icon" ]; then
        format=$(file "$icon" | grep -o "RGBA")
        if [ "$format" = "RGBA" ]; then
            echo "  ✅ $icon is RGBA"
        else
            echo "  ❌ $icon is NOT RGBA"
        fi
    fi
done
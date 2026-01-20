#!/bin/bash
# Yume macOS Fix Script
# Removes quarantine flag so macOS allows the app to open

set -e

echo "🔧 Yume macOS Fix Script"
echo "========================="
echo ""

# Check common locations
LOCATIONS=(
    "$HOME/Downloads/yume.app"
    "/Applications/yume.app"
    "$HOME/Desktop/yume.app"
)

FOUND=""
for LOC in "${LOCATIONS[@]}"; do
    if [ -d "$LOC" ]; then
        FOUND="$LOC"
        break
    fi
done

if [ -z "$FOUND" ]; then
    echo "❌ Could not find yume.app in common locations:"
    echo "   - ~/Downloads/yume.app"
    echo "   - /Applications/yume.app"
    echo "   - ~/Desktop/yume.app"
    echo ""
    echo "Please drag yume.app to one of these locations and run this script again."
    echo ""
    echo "Or run manually:"
    echo "   xattr -cr /path/to/yume.app"
    exit 1
fi

echo "Found: $FOUND"
echo ""
echo "Removing quarantine flag..."

xattr -cr "$FOUND"

echo ""
echo "✅ Fixed! You can now open yume normally."
echo ""
echo "   Right-click yume.app → Open"
echo ""

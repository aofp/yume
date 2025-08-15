#!/bin/bash

echo "🔍 verifying tauri migration..."
echo ""

# Check 1: Tauri configuration
echo "✓ checking tauri configuration..."
if [ -f "src-tauri/tauri.conf.json" ]; then
    echo "  ✓ tauri.conf.json exists"
    
    # Check window size
    if grep -q '"width": 800' src-tauri/tauri.conf.json && grep -q '"height": 600' src-tauri/tauri.conf.json; then
        echo "  ✓ window size: 800x600"
    else
        echo "  ✗ window size not 800x600"
    fi
    
    # Check transparency
    if grep -q '"transparent": true' src-tauri/tauri.conf.json; then
        echo "  ✓ transparency enabled"
    else
        echo "  ✗ transparency not enabled"
    fi
    
    # Check decorations
    if grep -q '"decorations": false' src-tauri/tauri.conf.json; then
        echo "  ✓ custom window decorations"
    else
        echo "  ✗ decorations not disabled"
    fi
else
    echo "  ✗ tauri.conf.json missing"
fi

echo ""
echo "✓ checking for electron remnants..."
# Check for electron dependencies
if ! grep -qi "electron" package.json 2>/dev/null; then
    echo "  ✓ no electron dependencies in package.json"
else
    echo "  ✗ electron dependencies still present"
fi

# Check for electron folder
if [ ! -d "electron" ]; then
    echo "  ✓ electron folder removed"
else
    echo "  ✗ electron folder still exists"
fi

echo ""
echo "✓ checking server configuration..."
# Check server file
if [ -f "server-claude-macos.js" ]; then
    echo "  ✓ server-claude-macos.js exists"
    
    # Check if it's ES modules
    if grep -q "^import " server-claude-macos.js; then
        echo "  ✓ server uses ES modules"
    else
        echo "  ✗ server not using ES modules"
    fi
else
    echo "  ✗ server-claude-macos.js missing"
fi

echo ""
echo "✓ checking icon files..."
if [ -f "src-tauri/icons/icon.icns" ] && [ -f "src-tauri/icons/icon.ico" ] && [ -f "src-tauri/icons/icon.png" ]; then
    echo "  ✓ all icon formats present"
else
    echo "  ✗ some icon formats missing"
fi

echo ""
echo "✓ checking features..."

# Check window dragging
if grep -q "startDragging" src/renderer/components/Layout/TitleBar.tsx 2>/dev/null; then
    echo "  ✓ window dragging configured"
else
    echo "  ✗ window dragging not found"
fi

# Check zoom functionality  
if grep -q "document.body.style.zoom" src/renderer/services/platformBridge.ts 2>/dev/null; then
    echo "  ✓ css zoom implementation"
else
    echo "  ✗ zoom not implemented"
fi

# Check window state persistence
if grep -q "localStorage.setItem('window" src/renderer/App.minimal.tsx 2>/dev/null; then
    echo "  ✓ window state persistence"
else
    echo "  ✗ window state persistence not found"
fi

# Check server auto-start
if grep -q "server-claude-macos.js" src-tauri/src/lib.rs 2>/dev/null; then
    echo "  ✓ server auto-start configured"
else
    echo "  ✗ server auto-start not configured"
fi

echo ""
echo "📦 migration verification complete!"
echo ""
echo "to run the app:"
echo "  npm run tauri:dev"
echo ""
echo "to build for production:"
echo "  npm run tauri:build"
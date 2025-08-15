#!/bin/bash

echo "🚀 Starting optimized production build..."

# Clean previous builds
echo "Cleaning previous builds..."
rm -rf dist
rm -rf release
rm -rf node_modules/.cache

# Install production dependencies only
echo "Installing production dependencies..."
npm ci --production --no-audit --no-fund

# Reinstall dev dependencies needed for build
echo "Installing build dependencies..."
npm install --save-dev electron-builder vite @vitejs/plugin-react typescript --no-audit --no-fund

# Build the renderer with optimizations
echo "Building renderer with optimizations..."
NODE_ENV=production npm run build

# Create optimized electron packages
echo "Creating optimized Electron packages..."

# For Windows
if [[ "$OSTYPE" == "msys" || "$OSTYPE" == "cygwin" || "$OSTYPE" == "win32" ]]; then
  echo "Building for Windows..."
  NODE_ENV=production npm run dist:win
fi

# For macOS
if [[ "$OSTYPE" == "darwin"* ]]; then
  echo "Building for macOS..."
  NODE_ENV=production npm run dist:mac
fi

# For Linux
if [[ "$OSTYPE" == "linux-gnu"* ]]; then
  echo "Building for Linux..."
  NODE_ENV=production npm run dist:linux
fi

# Display final sizes
echo ""
echo "📊 Build complete! Final sizes:"
echo "================================"

# Check release folder size
if [ -d "release" ]; then
  du -sh release/*
fi

echo ""
echo "✅ Optimized build complete!"
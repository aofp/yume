#!/bin/bash

# ===================================
# yurucode Tauri - Quick Start Script
# ===================================

echo ""
echo "🚀 yurucode Tauri Edition"
echo "========================="
echo ""
echo "Starting the world's fastest Claude Code UI..."
echo ""

# Check if dependencies are installed
if ! command -v cargo &> /dev/null; then
    echo "❌ Rust not found. Installing..."
    curl --proto '=https' --tlsv1.2 -sSf https://sh.rustup.rs | sh
    source "$HOME/.cargo/env"
fi

if ! command -v node &> /dev/null; then
    echo "❌ Node.js not found. Please install Node.js 18+ first."
    echo "   Visit: https://nodejs.org"
    exit 1
fi

# Install npm dependencies if needed
if [ ! -d "node_modules" ]; then
    echo "📦 Installing dependencies..."
    npm install
fi

# Check if Rust dependencies are built
if [ ! -d "src-tauri/target" ]; then
    echo "🔨 Building Rust backend (first run only)..."
    cd src-tauri
    cargo build --release
    cd ..
fi

echo ""
echo "✨ Launching yurucode..."
echo ""

# Run Tauri in development mode
npm run tauri:dev

echo ""
echo "👋 yurucode closed. Thanks for using the Tauri edition!"
#!/bin/bash
# Install Claude CLI in WSL

echo "Installing Claude CLI in WSL..."
echo ""

# Check if npm is installed
if ! command -v npm &> /dev/null; then
    echo "npm not found. Installing Node.js and npm..."
    curl -fsSL https://deb.nodesource.com/setup_lts.x | sudo -E bash -
    sudo apt-get install -y nodejs
fi

# Install Claude CLI globally
echo "Installing Claude CLI..."
npm install -g @anthropic-ai/claude-cli

# Verify installation
if command -v claude &> /dev/null; then
    echo ""
    echo "✅ Claude CLI installed successfully!"
    claude --version
else
    echo ""
    echo "⚠️ Installation may have failed. Please check for errors above."
fi

echo ""
echo "Press Enter to continue..."
read
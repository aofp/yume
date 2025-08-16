#!/bin/bash
# Test script for Claude detection in WSL

echo "Testing Claude detection in WSL..."
echo "================================="

claude_paths=(
    "/usr/local/bin/claude"
    "/usr/bin/claude"
    "$HOME/.local/bin/claude"
    "$HOME/.npm-global/bin/claude"
    "$HOME/node_modules/.bin/claude"
    "$HOME/.claude/local/claude"
    "/opt/claude/bin/claude"
)

# Check each user's .npm-global
for user_home in /home/*; do
    if [ -d "$user_home" ]; then
        claude_paths+=("$user_home/.npm-global/bin/claude")
        claude_paths+=("$user_home/node_modules/.bin/claude")
        claude_paths+=("$user_home/.local/bin/claude")
    fi
done

# Check nvm installations
if [ -d "$HOME/.nvm" ]; then
    for nvm_path in $HOME/.nvm/versions/node/*/bin/claude; do
        [ -x "$nvm_path" ] && claude_paths+=("$nvm_path")
    done
fi

echo "Checking ${#claude_paths[@]} possible locations:"
echo ""

# Try to find claude in PATH first
if command -v claude &>/dev/null; then
    claude_cmd="claude"
    echo "✅ Found Claude in PATH: $(which claude)"
else
    # Check all known paths
    claude_cmd=""
    for path in "${claude_paths[@]}"; do
        if [ -x "$path" ]; then
            echo "✅ Found Claude at: $path"
            claude_cmd="$path"
            break
        else
            echo "❌ Not found at: $path"
        fi
    done
fi

echo ""
if [ -z "$claude_cmd" ]; then
    echo "❌ Claude CLI not found in WSL"
    echo ""
    echo "To install Claude in WSL, run:"
    echo "npm install -g @anthropics/claude-cli"
    exit 1
else
    echo "✅ Claude CLI found!"
    echo "Testing Claude version..."
    "$claude_cmd" --version
    exit 0
fi
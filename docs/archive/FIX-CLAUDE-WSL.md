# Fix: Claude CLI Not Found in WSL

## Issue
yurucode on Windows uses WSL (Windows Subsystem for Linux) to run Claude CLI, but Claude isn't installed in your WSL environment.

## Solution

### Option 1: Quick Install (Recommended)
Run the included batch file:
```
install-claude-wsl.bat
```

### Option 2: Manual Installation
1. Open WSL terminal (or run `wsl` in Command Prompt)
2. Install Claude CLI:
   ```bash
   npm install -g @anthropic-ai/claude-cli
   ```
3. Verify installation:
   ```bash
   claude --version
   ```

### Option 3: Alternative Installation Paths
If you prefer local installation, run in WSL:
```bash
# Install in home directory
cd ~
npm install @anthropic-ai/claude-cli

# Or install in .local/bin
mkdir -p ~/.local/bin
cd ~/.local/bin
npm install @anthropic-ai/claude-cli
```

## After Installation
1. Restart yurucode
2. Try sending a message again

## Troubleshooting

### If npm is not found in WSL:
Install Node.js first:
```bash
# In WSL
curl -fsSL https://deb.nodesource.com/setup_lts.x | sudo -E bash -
sudo apt-get install -y nodejs
```

### If Claude still isn't found:
Check installation path:
```bash
# In WSL
which claude
# or
find ~ -name claude -type f 2>/dev/null
```

The server checks these locations in order:
1. System PATH (`which claude`)
2. `~/node_modules/.bin/claude`
3. `~/.claude/local/claude`
4. `~/.local/bin/claude`

## Note
yurucode requires Claude CLI to be installed in WSL on Windows because:
- Claude CLI is a Node.js application that works best in a Unix-like environment
- WSL provides better compatibility for command-line tools
- File path handling is more consistent in WSL

---

## Fix: Claude Responses Not Working (Thinking Forever)

### Problem
On some Windows systems, Claude responses weren't going through - the UI would show "thinking..." forever even though title generation worked.

### Root Cause
The `--append-system-prompt` argument contained newlines which broke WSL command construction. Complex arguments with newlines caused quote mismatching when passed through multiple shell layers.

### Solution Applied (2025-08-16)
1. **Single-line system prompt**: Changed multi-line prompt to single line without newlines
2. **Simplified arg escaping**: Removed complex hex encoding for newlines 
3. **Added --print flag**: Ensures Claude CLI runs in non-interactive mode
4. **Improved stdin handling**: Added chunked writing for WSL to avoid buffer issues
5. **Better command chain**: Fixed argument passing through WSL bash layers

### Key Change
Changed from multi-line system prompt with newlines to single-line format:
```
CRITICAL: you are in yurucode ui. ALWAYS: use all lowercase (no capitals ever), be extremely concise, never use formal language, no greetings/pleasantries, straight to the point, code/variables keep proper case, one line answers preferred
```

This fix ensures Claude CLI properly receives and processes messages on Windows systems through WSL.
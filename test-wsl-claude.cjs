#!/usr/bin/env node

const { spawn } = require('child_process');

// Test the exact same command that's failing
const args = [
  '--print',
  '--output-format', 'stream-json',
  '--verbose',
  '--dangerously-skip-permissions',
  '--append-system-prompt', 'CRITICAL: you are in yurucode ui. ALWAYS: use all lowercase (no capitals ever), be extremely concise, never use formal language, no greetings/pleasantries, straight to the point, code/variables keep proper case, one line answers preferred',
  '--model', 'claude-opus-4-1-20250805'
];

// Escape args for bash
const escapedArgs = args.map(arg => {
  if (arg.includes(' ') || arg.includes('"') || arg.includes("'") || arg.includes('$') || arg.includes('\\') || arg.includes('\n')) {
    return "'" + arg.replace(/'/g, "'\\''") + "'";
  }
  return "'" + arg + "'";
}).join(' ');

// Build the bash script
const script = `
#!/bin/bash
claude_paths=(
  "/usr/local/bin/claude"
  "/usr/bin/claude"
  "$HOME/.local/bin/claude"
  "$HOME/.npm-global/bin/claude"
  "$HOME/node_modules/.bin/claude"
  "$HOME/.claude/local/claude"
  "/opt/claude/bin/claude"
)

# Check each user .npm-global
for user_home in /home/*; do
  if [ -d "$user_home" ]; then
    claude_paths+=("$user_home/.npm-global/bin/claude")
    claude_paths+=("$user_home/node_modules/.bin/claude")
    claude_paths+=("$user_home/.local/bin/claude")
  fi
done

# Try to find claude in PATH first
if command -v claude &>/dev/null; then
  claude_cmd="claude"
else
  # Check all known paths
  claude_cmd=""
  for path in "\${claude_paths[@]}"; do
    if [ -x "$path" ]; then
      claude_cmd="$path"
      break
    fi
  done
fi

if [ -z "$claude_cmd" ]; then
  echo "Claude CLI not found in WSL" >&2
  exit 127
fi

cd '/mnt/c/Users/muuko/Desktop/yurucode'
echo "DEBUG: Current directory: $(pwd)" >&2
echo "DEBUG: Claude path found: $claude_cmd" >&2
echo "DEBUG: Starting Claude CLI..." >&2

# Run Claude with arguments
"$claude_cmd" ${escapedArgs} 2>&1
`;

console.log('Script to execute:');
console.log(script);
console.log('\n---\n');

// Test execution
const child = spawn('C:\\Windows\\System32\\wsl.exe', ['-e', 'bash', '-c', script]);

child.stdout.on('data', (data) => {
  console.log('STDOUT:', data.toString());
});

child.stderr.on('data', (data) => {
  console.error('STDERR:', data.toString());
});

child.on('close', (code) => {
  console.log('Process exited with code:', code);
});

// Send test input
setTimeout(() => {
  child.stdin.write('echo test\n');
  child.stdin.end();
}, 100);
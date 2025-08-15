# Claude CLI Bash Tool Working Directory Issue

## Problem
When Claude uses the Bash tool to run commands like `pwd`, it shows `/` instead of the actual working directory that was set when spawning the Claude process. This is a limitation of the Claude CLI itself.

## What Works
✅ Claude process spawns in correct directory (verified with logs)
✅ Claude knows the correct working directory (can access files relative to it)
✅ Environment variables PWD and HOME are set correctly
✅ The `cwd` option is passed correctly to spawn()

## What Doesn't Work
❌ `pwd` command in Claude's Bash tool shows `/`
❌ Commands that depend on current directory may fail

## Root Cause
The Claude CLI doesn't pass the working directory to its Bash tool subprocess. When Claude executes bash commands internally, it doesn't inherit or respect the cwd that was set when the Claude process was spawned.

## Workarounds

### For Users
1. **Use absolute paths**: Instead of `pwd`, ask Claude to use the Read tool on files
2. **Specify paths explicitly**: When running commands, provide full paths
3. **Use cd first**: Tell Claude to `cd /path/to/dir && command`

### For Claude
When Claude runs bash commands, it should:
```bash
# Instead of:
ls

# Use:
cd /Users/username && ls

# Or use absolute paths:
ls /Users/username
```

## Technical Details
- Our server correctly spawns Claude with `cwd: processWorkingDir`
- We set `PWD` and `HOME` environment variables
- Claude process runs in the correct directory
- But Claude's internal Bash tool spawns in `/` (root)

## Future Solution
This would need to be fixed in the Claude CLI itself to properly pass the working directory to its Bash tool subprocess. Until then, users need to work around this limitation by using absolute paths or explicit `cd` commands.

## Testing
```bash
# In Claude, these will show different results:
# 1. Ask: "What directory are you in?"
#    Claude will correctly identify the working directory

# 2. Ask: "Run pwd"
#    Will incorrectly show /

# 3. Ask: "Run cd ~ && pwd"
#    Will correctly show home directory
```
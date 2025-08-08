# Build Instructions for burntcode

## Prerequisites
1. Install dependencies:
```bash
npm install
```

2. Set your Anthropic API key:
```bash
export ANTHROPIC_API_KEY="your-api-key"
```

## Building the Application

### For macOS
```bash
npm run dist:mac
```
This creates:
- `release/burntcode-1.0.0.dmg` - Installer
- `release/mac/burntcode.app` - Application bundle

### For Windows
```bash
npm run dist:win
```
This creates:
- `release/burntcode Setup 1.0.0.exe` - Installer

### For Linux
```bash
npm run dist:linux
```
This creates:
- `release/burntcode-1.0.0.AppImage` - AppImage
- `release/burntcode_1.0.0_amd64.deb` - Debian package

## Command Line Usage

Once installed, you can open directories directly:

```bash
# Open current directory
burntcode .

# Open specific directory
burntcode /path/to/project

# Or just launch the app
burntcode
```

## Features

✅ **Complete Event Handling**
- System init with working directory
- User messages with markdown
- Assistant streaming with tool use
- Tool executions with visual display
- Result statistics and summaries
- Permission requests
- Error handling

✅ **Tool Displays**
- 📖 Read - Shows file being read
- ✏️ Write - Shows file being written
- ✂️ Edit - Shows file and change preview
- 💻 Bash - Shows command being run
- 📝 TodoWrite - Shows todo statistics
- 🔍 WebSearch - Shows search query
- 🌐 WebFetch - Shows URL being fetched
- 🔎 Grep - Shows pattern and path
- 📁 Glob - Shows file pattern
- 📂 LS - Shows directory listing
- 🤖 Task - Shows agent task
- ✅ ExitPlanMode - Shows plan complete
- 📓 NotebookEdit - Shows notebook editing

✅ **Project Management**
- Open folders from UI
- Open folders from command line
- Per-session working directories
- Directory shown in header
- Change directory button

✅ **Single Executable**
- Server bundled inside
- All dependencies included
- No external requirements
- Works offline (with API key)

## Architecture

The app bundles:
1. **Electron Shell** - Native window and menus
2. **React UI** - Minimal black interface
3. **Node.js Server** - Runs Claude Code SDK
4. **Claude Code SDK** - AI capabilities

All compiled into a single executable!
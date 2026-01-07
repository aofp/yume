# yurucode setup instructions

## prerequisites

Before running yurucode, ensure you have the following installed:

- **Node.js** (v18 or later)
- **npm** (comes with Node.js)
- **Rust** (for building the Tauri backend)
- **Platform-specific build tools**:
  - **macOS**: Xcode Command Line Tools (`xcode-select --install`)
  - **Windows**: Visual Studio Build Tools with MSVC
  - **Linux**: Build essentials and required libraries (see Tauri docs)

## installation

1. Clone the repository
2. Install dependencies:
   ```bash
   npm install
   ```

## fixing the "invalid api key" error

The Claude Code SDK in yurucode needs an API key to work. Here is how to fix it:

### option 1: set environment variable before running (recommended)

Set the API key before starting the app:

```bash
# macOS/Linux
export ANTHROPIC_API_KEY=sk-ant-api03-xxxxx...
npm run tauri:dev

# Windows PowerShell
$env:ANTHROPIC_API_KEY="sk-ant-api03-xxxxx..."
npm run tauri:dev

# Windows CMD
set ANTHROPIC_API_KEY=sk-ant-api03-xxxxx...
npm run tauri:dev
```

### option 2: create a .env file

1. Create a `.env` file in the project root
2. Add your API key:
   ```
   ANTHROPIC_API_KEY=sk-ant-api03-xxxxx...
   ```
3. Start the application

Get your API key from https://console.anthropic.com/account/keys

## running the application

### development mode

```bash
# Run the full Tauri application with hot reload
npm run tauri:dev

# Run frontend only (for UI development without Tauri)
npm run dev:frontend
```

### building for production

```bash
# macOS (creates .dmg)
npm run tauri:build:mac

# Windows (creates .msi and .exe installers)
npm run tauri:build:win

# Linux (creates .AppImage and .deb)
npm run tauri:build:linux
```

## troubleshooting

### api key issues
- Make sure your API key starts with `sk-ant-`
- Verify the key is set in the environment where the app is running
- Check the application logs for error messages

### port conflicts
The application uses dynamic port allocation (range 20000-65000). If you experience issues:
- Run `npm run prestart` to kill any processes on conflicting ports
- The app will automatically find an available port

### development server issues
If the development server fails to start:
```bash
# Kill any stuck processes
npm run prestart

# Then restart development
npm run tauri:dev
```

## notes

- The Claude Code SDK package requires an API key
- This is separate from your claude.ai subscription
- API usage will be billed to your Anthropic account
- Check usage at https://console.anthropic.com/settings/usage

## architecture overview

Yurucode is a Tauri desktop application with three processes:
1. **Tauri Process** (Rust) - Native window management and system integration
2. **Embedded Node.js Server** - Claude CLI integration and stream parsing
3. **React Frontend** - UI rendering and state management

For more technical details, see CLAUDE.md.

# Claude Code Studio

A minimal, elegant cross-platform UI for the Claude Code SDK. Built with Electron, React, and TypeScript.

## Features

- ✨ **Complete SDK Integration** - Access 100% of Claude Code SDK capabilities
- 🎨 **Minimal Black UI** - Clean, distraction-free interface
- 💬 **Session Management** - Create, resume, pause multiple sessions
- 📝 **Todo Management** - Built-in task tracking with drag-and-drop
- 🛡️ **Granular Permissions** - Control tool access per session
- 🤖 **Agent Support** - Manage specialized AI agents
- ⚡ **Real-time Streaming** - Live response streaming
- 🌍 **Cross-platform** - Works on macOS, Windows, and Linux

## Installation

```bash
# Clone the repository
git clone https://github.com/yourusername/yurucode.git
cd yurucode

# Install dependencies
npm install
```

## Running the App

### Development Mode (with console for debugging)
```bash
# Windows - Double-click or run:
DEV.bat
# OR
START-CMD.bat

# Cross-platform:
npm run start:multi
```

### Production Build
```bash
# Build for current platform
npm run dist

# The .exe will NOT show a console window
```

## Development

```bash
# Start development server
npm run dev

# Run Electron in development
npm run electron:dev

# Build for current platform
npm run dist

# Build for specific platforms
npm run dist:mac
npm run dist:win
npm run dist:linux
```

## Architecture

```
claude-code-studio/
├── src/
│   ├── main/           # Electron main process
│   ├── renderer/       # React application
│   │   ├── components/ # UI components
│   │   ├── stores/     # State management
│   │   └── styles/     # Global styles
│   └── shared/         # Shared types
├── dist/              # Build output
└── release/           # Distribution packages
```

## Technologies

- **Electron** - Cross-platform desktop framework
- **React** - UI library
- **TypeScript** - Type safety
- **Zustand** - State management
- **Framer Motion** - Animations
- **Monaco Editor** - Code editing
- **Vite** - Build tool

## Configuration

The app stores configuration in:
- **macOS**: `~/Library/Application Support/claude-code-studio`
- **Windows**: `%APPDATA%/claude-code-studio`
- **Linux**: `~/.config/claude-code-studio`

## Keyboard Shortcuts

- `Cmd/Ctrl + N` - New session
- `Cmd/Ctrl + Tab` - Switch session
- `Cmd/Ctrl + K` - Command palette
- `Cmd/Ctrl + ,` - Settings
- `Cmd/Ctrl + Enter` - Send message
- `Esc Esc` - Edit last message

## License

MIT

## Contributing

Contributions are welcome! Please read our contributing guidelines before submitting PRs.

## Support

For issues and feature requests, please use the GitHub issue tracker.
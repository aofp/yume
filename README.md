# Yurucode

A powerful, minimal GUI for Claude Code with intelligent context management.

![Yurucode Screenshot](public/assets/yurucode.png)

## ✨ Features

### 🎯 Intelligent Context Management
- **Auto-compact at 60%** - Conservative 38% buffer like Claude Code
- **Multi-tier warnings** - Get notified at 55%, 60%, 65%
- **Context preservation** - Saves important context before compacting
- **Visual indicators** - Color-coded token usage (grey → orange → red)

### 💰 Accurate Token Tracking
- **Real-time costs** - Know exactly what you're spending
- **Detailed breakdown** - Input, output, cache tokens tracked separately
- **Model-specific pricing** - Accurate costs for Opus and Sonnet
- **Analytics dashboard** - View usage by project, date, and model

### 🚀 Performance Optimized
- **Lazy reconnection** - No delays when switching tabs
- **Message deduplication** - Clean, efficient message handling
- **Smart buffering** - Optimized memory usage
- **Embedded server** - No external dependencies

### 🎨 Beautiful Minimal UI
- **OLED black theme** - Easy on the eyes
- **Pastel accents** - Cyan, magenta, grey highlights
- **Clean typography** - Focused on readability
- **Responsive layout** - Works on all screen sizes

## 🛠️ Development

```bash
# Install dependencies
npm install

# Run Tauri in development mode with hot reload
npm run tauri:dev

# Frontend only (for UI work)
npm run dev:frontend

# Build for production
npm run tauri:build:mac   # macOS
npm run tauri:build:win   # Windows
npm run tauri:build:linux # Linux
```

## 📋 Requirements

- Node.js 18+
- Rust 1.70+
- Claude CLI installed and configured
- macOS 11+, Windows 10+, or Linux

## 🏗️ Architecture

Yurucode uses a three-process architecture:

1. **Tauri Main Process** - Window management and native APIs
2. **Node.js Server** - Claude CLI integration (compiled binaries, no Node.js needed for end users)
3. **React Frontend** - User interface with Zustand state management

## 📄 License

MIT License - See LICENSE file for details

## 🤝 Contributing

Contributions are welcome! Please read CONTRIBUTING.md first.

## 🔗 Links

- [Documentation](docs/)
- [Troubleshooting Guide](docs/TROUBLESHOOTING_GUIDE.md)
- [Architecture Overview](docs/COMPLETE_ARCHITECTURE.md)

---

Built with ❤️ for the Claude Code community
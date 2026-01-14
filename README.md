# Yume

The most feature-rich Claude Code desktop GUI. Native performance, 15+ unique features.

![Yume Screenshot](public/assets/yume.png)

## Why Yume?

| vs Claude CLI | vs Opcode/Claudia | vs Cursor/Windsurf |
|---------------|-------------------|---------------------|
| No flickering/lag | Plugin system | $21 one-time vs $240+/yr |
| Visual UI | 30 themes | Claude-native excellence |
| 5h/7d limit tracking | 9 hook events | No IDE bloat |
| Stream timers | 5 built-in agents | Native Tauri performance |

## Unique Features (No Competitor Has)

- **Plugin System** - Install custom commands, agents, hooks, skills, MCP
- **Skills System** - Auto-inject context based on triggers
- **5h + 7-day Limit Tracking** - Visual Anthropic quota bars
- **Yume Guard** - Built-in security hook (blocks dangerous commands)
- **5 Built-in Agents** - architect, explorer, implementer, guardian, specialist
- **@ Mention System** - @r (recent), @m (modified), folder navigation
- **Stream Timers** - Live thinking/bash/compacting duration
- **History/Rollback Panel** - Visual message history with undo
- **Ultrathink Support** - Cmd+K insert + rainbow highlighting
- **30 Themes** - More than Cursor, Windsurf, Opcode combined
- **9 Hook Events** - Most comprehensive hook system
- **Crash Recovery** - Auto-save with 24hr restoration
- **Bash Mode** - !/$ prefix for direct terminal commands

## Context Management

- **Auto-compact at 60%** - 38% buffer like Claude Code
- **Multi-tier warnings** - 55%, 60%, 65% thresholds
- **Visual indicators** - Color-coded token usage
- **5h + 7-day tracking** - Only tool tracking actual Anthropic limits

## Quick Start

```bash
npm install
npm run tauri:dev    # Development with hot reload
npm run tauri:build:mac   # Build for macOS
```

## Requirements

- Claude CLI installed and configured
- macOS 11+ / Windows 10+ / Linux

## Architecture

Three-process model:
1. **Tauri (Rust)** - Native window management
2. **Node.js Server** - Claude CLI integration (compiled binaries)
3. **React Frontend** - UI with Zustand state

## Documentation

- [Complete Features](docs/FEATURES_COMPLETE.md)
- [Architecture](docs/COMPLETE_ARCHITECTURE.md)
- [Competitive Analysis](docs/COMPETITIVE_ANALYSIS.md)
- [Troubleshooting](docs/TROUBLESHOOTING_GUIDE.md)
- [Master Index](docs/MASTER_DOCUMENTATION_INDEX.md)

## License

MIT License

---

$21 one-time. All features included. No subscriptions.

## 🔮 Future Roadmap (Yume 2.0)

We are actively working on expanding Yume to be the universal GUI for agentic CLIs.
- **Translation Layer:** `yume-cli` shim that emits Claude-compatible stream-json for all providers.
- **Gemini Support:** Drive Gemini models via the shim with gcloud-based auth.
- **Codex/OpenAI Support:** Use GPT-4o and O1 models via OpenAI-compatible endpoints.
- **Cross-Platform Compliance:** Golden transcript tests on macOS, Windows, Linux.
- **See the full plan:** [docs/expansion-plan/ROADMAP.md](docs/expansion-plan/ROADMAP.md)

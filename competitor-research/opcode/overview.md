# Opcode

## Overview
- **Developer**: winfunc
- **Type**: GUI wrapper for Claude Code
- **Tech Stack**: Tauri 2 (same as yume)
- **Pricing**: Free
- **License**: AGPL
- **GitHub**: https://github.com/winfunc/opcode
- **Stars**: ~19.7k (very popular!)

## Key Features
- visual project & session browser
- custom cc agents (background process execution)
- pre-built agents: git-committer, sast-security, test-generator
- usage analytics with visual charts
- mcp server registry with testing
- timeline checkpoints with visual navigation
- diff viewer between versions
- built-in claude.md editor
- data export capabilities

## Technical Stack
- frontend: react 18, typescript, vite 6, tailwind css v4, shadcn/ui
- backend: rust with tauri 2
- database: sqlite (rusqlite)
- package manager: bun

## Strengths
- **same tech stack**: uses tauri 2 like yume
- **open source**: agpl, 19.7k stars, large community
- **custom agents**: create specialized agents with system prompts
- **pre-built agents**: ready-to-use git/security/test agents
- **usage analytics**: detailed cost tracking with export
- **mcp management**: registry ui with testing
- **timeline**: visual checkpoint navigation
- **claude.md editor**: built-in with syntax highlighting

## Weaknesses
- **agpl license**: restrictive for commercial derivatives
- **no keyboard shortcuts depth**: fewer hotkeys than yume
- **no tab management**: can't cmd+t/w/d for quick tab ops
- **no parallel execution**: agents run one at a time
- **no live preview**: must check changes externally
- **no real-time awareness**: manual context only
- **bun dependency**: different package manager

## Target Audience
developers wanting customizable claude code experience, teams needing analytics, open source advocates

---

## vs yume Comparison

### yume Wins ⚡
| Feature | yume | opcode |
|---------|----------|--------|
| Keyboard shortcuts | 30+ | ~10 |
| Tab management | cmd+t/w/d/1-9 | ❌ |
| Ultrathink shortcut | cmd+k | ❌ |
| Bash mode | !/$ prefix | ❌ |
| Duplicate tab | cmd+d | ❌ |
| Context compaction shortcut | cmd+m | ❌ |
| Recent projects shortcut | cmd+r | 🔶 |
| Model toggle | cmd+o | ❌ |
| Performance presets | auto-detect | ❌ |
| Multi-tab sessions | ⚡ | ❌ |

### opcode Wins
| Feature | yume | opcode |
|---------|----------|--------|
| Custom agents | ❌ | ⚡ cc_agents |
| Pre-built agents | ❌ | ⚡ git/sast/test |
| MCP registry | ❌ | ⚡ |
| CLAUDE.md editor | ❌ | ⚡ |
| Usage analytics | ✅ basic | ⚡ detailed charts |
| Data export | ❌ | ⚡ |
| Timeline UI | ✅ basic | ⚡ visual |
| Open source | ❌ | ⚡ AGPL |
| GitHub stars | - | 19.7k |

### How yume Beats opcode
1. **add agent library** - match custom agent capability
2. **add mcp registry ui** - settings tab for mcp management
3. **add claude.md editor** - built-in editing
4. **improve analytics** - add charts, breakdown, export
5. **keep speed advantage** - more shortcuts = faster workflow
6. **parallel tabs** - something opcode doesn't have

### Key Differentiator
opcode = feature-rich, community-driven (agpl restriction)
yume = speed-first, keyboard-centric (no license restriction)

### Strategic Note
opcode's 19.7k stars shows strong demand for gui wrappers. yume should:
- differentiate on SPEED and SHORTCUTS
- consider adding most-requested opcode features
- avoid agpl to allow commercial flexibility

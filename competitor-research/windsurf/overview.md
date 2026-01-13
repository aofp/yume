# Windsurf

## Overview
- **Developer**: Codeium
- **Type**: AI-native IDE
- **Pricing**: $15/month
- **Platforms**: Windows, macOS, Linux
- **Website**: https://windsurf.com
- **Model**: SWE-1.5 (fast agent model)

## Key Features
- cascade: context-aware agentic system
- real-time action awareness (tracks edits, commands, clipboard, terminal)
- live preview with click-to-edit (wave 4)
- swe-1.5 fast agent model (near-sota speed)
- swe-grep: 20x faster codebase search (>2800 tps)
- turbo mode: auto-execute terminal commands
- context window meter: real-time token usage
- planning agent: background long-term planning
- windsurf tab: unified autocomplete experience

## Strengths
- **real-time awareness**: tracks all user actions automatically
- **live preview**: see changes instantly, click to edit elements
- **turbo mode**: auto-execute for faster iteration
- **context meter**: know your token usage
- **20x search**: swe-grep is incredibly fast
- **more affordable**: $15/mo vs cursor's $20
- **beginner friendly**: guides users through code
- **team-oriented**: better collaboration features

## Weaknesses
- **electron bloat**: ~350mb bundle, slow startup
- **proprietary models**: locked into codeium ecosystem
- **newer product**: less mature than cursor
- **result quality**: cursor often produces better output
- **not standalone**: requires learning new ide
- **full ide overkill**: when you just need claude gui

## Target Audience
teams on large codebases, beginners learning ai coding, budget-conscious developers, those wanting real-time features

---

## vs yume Comparison

### yume Wins ⚡
| Feature | yume | windsurf |
|---------|----------|----------|
| Bundle size | ~15MB | ~350MB |
| Cold startup | <2s | ~5s |
| Native (not electron) | ⚡ tauri | ❌ electron |
| Simplicity | ⚡ focused | complex ide |
| Price | uses your sub | $15/mo extra |
| Keyboard shortcuts | 30+ | ~20 |
| Tab management | cmd+t/w/d/1-9 | ✅ basic |
| Ultrathink | cmd+k | ❌ |
| Bash mode | !/$ | ❌ |
| Duplicate tab | cmd+d | ❌ |
| Performance presets | auto-detect | ❌ |

### windsurf Wins
| Feature | yume | windsurf |
|---------|----------|----------|
| Real-time awareness | ❌ | ⚡ cascade |
| Live preview | ❌ | ⚡ click-to-edit |
| Context meter | ❌ | ⚡ |
| Turbo mode | ❌ | ⚡ auto-execute |
| Fast search | ❌ | ⚡ 20x swe-grep |
| Planning agent | ❌ | ⚡ |

### How yume Beats windsurf
1. **add real-time tracking**: action logger for context
2. **add live preview**: embedded preview pane
3. **add context meter**: token usage in status bar
4. **add turbo mode**: auto-execute toggle
5. **keep speed advantage**: 23x smaller, instant start

### Key Differentiator
windsurf = all-in-one ai ide with smart context
yume = fastest native claude wrapper with smart shortcuts

### Priority Features to Steal
1. **context window meter** - easy win, high impact
2. **turbo mode** - game-changer for speed
3. **live preview** - eliminates alt-tab friction
4. **action tracking** - reduces manual context management

### Strategic Note
windsurf's cascade features are genuinely impressive.
yume must implement the core speed features:
- context meter (easy)
- turbo mode (medium)
- live preview (hard but worth it)

without becoming another bloated ide.

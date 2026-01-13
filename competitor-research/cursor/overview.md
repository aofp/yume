# Cursor

## Overview
- **Developer**: Cursor Team
- **Type**: AI-native IDE (VS Code fork)
- **Pricing**: $20/month (Pro plan)
- **Platforms**: Windows, macOS, Linux
- **Website**: https://cursor.com
- **Model**: Composer (custom, 4x faster)

## Key Features (Cursor 2.0)
- composer model: 4x faster than similar models, ~2x sonnet 4.5
- 8 parallel agents running simultaneously
- agent-centric workflow (not file-centric)
- git worktrees or remote machines for isolation
- multi-file editing with cmd+i
- automatic dependency resolution
- lint error auto-fixing
- codebase-wide semantic search
- mixture-of-experts (moe) architecture
- rl-trained for software engineering

## Strengths
- **4x speed**: composer model is fastest in class
- **8 parallel agents**: massive parallelization
- **agent-centric ui**: purpose-built for agentic workflows
- **semantic search**: understands codebase structure
- **vs code familiar**: users know the interface
- **mature product**: established, well-funded
- **sub-30s turns**: most operations complete quickly

## Weaknesses
- **expensive**: $20/month higher than windsurf
- **electron bloat**: ~400mb bundle, slow startup
- **500 request limit**: can exhaust quota quickly
- **proprietary**: closed source, vendor lock-in
- **not standalone**: requires understanding vs code
- **overkill for wrapper**: full ide when you may just need gui

## Target Audience
professional developers, teams, vs code power users, those needing max ai features

---

## vs yume Comparison

### yume Wins ⚡
| Feature | yume | cursor |
|---------|----------|--------|
| Bundle size | ~15MB | ~400MB |
| Cold startup | <2s | ~5s |
| Native (not electron) | ⚡ tauri | ❌ electron |
| Simplicity | ⚡ focused | complex ide |
| Price | uses your sub | $20/mo extra |
| Tab duplicate | cmd+d | ❌ |
| Ultrathink | cmd+k | ❌ |
| Bash mode | !/$ | ❌ |
| Performance presets | auto-detect | ❌ |
| Virtualized messages | ✅ | ✅ |

### cursor Wins
| Feature | yume | cursor |
|---------|----------|--------|
| Parallel agents | ❌ | ⚡ 8 agents |
| Custom model | ❌ | ⚡ composer 4x |
| Agent-centric UI | ❌ | ⚡ 2.0 |
| Semantic search | ❌ | ⚡ |
| Multi-file editing | 🔶 via claude | ⚡ composer |
| IDE features | ❌ | ⚡ full ide |
| Git worktrees | ❌ | ⚡ |

### How yume Beats cursor
1. **positioning**: don't compete as ide, compete as FASTEST wrapper
2. **parallel tabs**: implement 8+ parallel sessions
3. **size/speed**: emphasize 25x smaller, instant startup
4. **cost**: no extra subscription, just use your claude
5. **focus**: simpler = faster for claude-only users

### Key Differentiator
cursor = full ai ide (heavy, expensive, powerful)
yume = fastest claude wrapper (light, free, focused)

### Strategic Note
cursor targets developers who want everything in one place.
yume targets users who:
- already have an editor they love
- just want fastest claude access
- don't need $20/mo ide subscription
- value lightweight native app

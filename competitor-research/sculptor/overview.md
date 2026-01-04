# Sculptor

## Overview
- **Developer**: Imbue
- **Type**: GUI wrapper for Claude Code
- **Pricing**: Free (currently in beta)
- **Platforms**: macOS, Linux, Windows (via WSL)
- **GitHub**: https://github.com/imbue-ai/sculptor
- **Stars**: ~5k

## Key Features
- parallel claude instances in isolated docker containers
- pairing mode with real-time file sync (mutagen)
- jump between agent environments instantly
- merge management with conflict detection
- fork agents from any history point
- custom mcp server support
- devcontainer/dockerfile support
- context compaction with token meter

## Strengths
- **multi-instance support**: run multiple claude sessions simultaneously
- **containerization**: safe isolated environments via docker
- **pairing mode**: real-time sync between agent and local ide
- **forking**: branch from any point in conversation
- **free during beta**: no cost barrier
- **merge management**: automatic conflict detection

## Weaknesses
- **slow cold start**: ~1 minute for first agent (container spin-up)
- **docker dependency**: requires docker installed and running
- **windows limitation**: requires wsl, not native
- **no keyboard shortcuts**: minimal hotkey support (~5 shortcuts)
- **no tab management**: can't cmd+t/w/d for quick tab ops
- **no virtualized messages**: may struggle with long conversations
- **unknown pricing**: future pricing model unclear
- **beta status**: may have stability issues

## Target Audience
developers needing parallel testing environments, power users managing multiple projects, teams requiring isolated execution environments

---

## vs yurucode Comparison

### yurucode Wins ⚡
| Feature | yurucode | sculptor |
|---------|----------|----------|
| Keyboard shortcuts | 30+ | ~5 |
| Cold startup | <2s | ~1min |
| Windows native | ✅ | ❌ (wsl) |
| Tab management | cmd+t/w/d/1-9 | ❌ |
| Performance presets | auto-detect | ❌ |
| Virtualized messages | ✅ 1000+ | ❌ |
| Ultrathink shortcut | cmd+k | ❌ |
| Bash mode | !/$ prefix | ❌ |
| Duplicate tab | cmd+d | ❌ |
| No docker required | ✅ | ❌ |

### sculptor Wins
| Feature | yurucode | sculptor |
|---------|----------|----------|
| Parallel agents | ❌ | ⚡ containers |
| Pairing mode | ❌ | ⚡ mutagen |
| Fork from history | ❌ | ⚡ |
| Container isolation | ❌ | ⚡ docker |
| Merge management | ❌ | ⚡ |
| Custom MCP | ❌ | ✅ |
| Context meter | ❌ | ✅ |

### How yurucode Beats sculptor
1. **add parallel tabs** - same functionality without docker overhead
2. **add fork/branch feature** - timeline branching without containers
3. **add context meter** - real-time token visibility
4. **keep speed advantage** - native performance without docker latency
5. **emphasize shortcuts** - 6x more keyboard shortcuts

### Key Differentiator
sculptor = power through isolation (heavy, slow start)
yurucode = power through speed (light, instant start)

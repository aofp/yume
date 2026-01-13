# yume: The Official Claude Code GUI

## For Anthropic's Consideration

---

## The Opportunity

Claude Code generates **$1B+ annualized revenue**. Users need a better interface.

Current options:
- **Terminal only** - limited audience, steep learning curve
- **Electron bloatware** (cursor/windsurf) - 400MB, slow, resource-hungry
- **Docker complexity** (sculptor) - 60s first launch, WSL required on windows

**yume fills the gap**: native, fast, minimal, focused on claude.

---

## Why yume

### 1. Fastest Possible Architecture

```
              Bundle    Memory    Startup
yume      15MB      50MB      <2s
cursor        400MB     300MB     5s
windsurf      350MB     280MB     5s

yume is 25x smaller, uses 6x less RAM
```

**Tauri 2 = same stack bun uses** (rust + webview)

### 2. Most Keyboard-Efficient

```
30+ shortcuts - most of any claude gui wrapper

unique features:
- cmd+k ultrathink (extended thinking mode)
- cmd+d duplicate tab with context
- !/$ bash mode prefix
- cmd+m context compaction
```

**no competitor matches this keyboard depth**

### 3. Claude-Only Focus

| Tool | Focus | Distraction |
|------|-------|-------------|
| cursor | multi-AI IDE | cursor ai, gpt, claude |
| windsurf | codeium ecosystem | codeium, claude, etc |
| yume | **claude only** | zero distraction |

**yume exists solely to make claude code better**

### 4. Cross-Platform Native

```
✅ macOS - native .dmg
✅ Windows - native .msi/.exe (NOT wsl)
✅ Linux - native appimage/deb
```

sculptor requires WSL on windows. yume works natively everywhere.

---

## Technical Excellence

### Performance Engineering

```typescript
// device-adaptive config (no competitor has this)
PERFORMANCE_PRESETS: {
  low: { VIRTUALIZATION_THRESHOLD: 10, ANIMATION_DURATION: 0 },
  medium: { VIRTUALIZATION_THRESHOLD: 20, ANIMATION_DURATION: 150 },
  high: { VIRTUALIZATION_THRESHOLD: 50, ANIMATION_DURATION: 200 }
}

// auto-detects based on RAM, cores, battery status
```

### Clean Architecture

```
src/
├── renderer/           # react frontend
│   ├── components/     # ui components
│   ├── stores/         # zustand state management
│   └── services/       # business logic
├── src-tauri/          # rust backend
│   ├── commands/       # ipc handlers
│   └── logged_server.rs # embedded node server
```

### Design System

```css
/* minimalist, consistent, accessible */
--background-color: #000000
--foreground-color: #ffffff
--accent-color: #99bbff
scrollbar-width: 3px
font-size: 7pt-12px (information dense)
lowercase everywhere (consistent personality)
```

---

## Roadmap to Official GUI

### Phase 1: Feature Parity (4 weeks)

| Feature | Days | Status |
|---------|------|--------|
| Context window meter | 1 | planned |
| Turbo mode | 2 | planned |
| Parallel tabs | 5 | planned |
| Live preview | 4 | planned |
| Onboarding | 1 | planned |
| Polish | 7 | planned |

### Phase 2: Unique Differentiators

- **Ambient input** - type anywhere to focus
- **Speed dial** - cmd+shift+1-9 for favorites
- **Command chaining** - "fix then test then commit"
- **Session templates** - preconfigured contexts
- **Predictive commands** - suggest before you type

### Phase 3: Enterprise Features

- Team sharing/collaboration
- Admin controls
- SSO integration
- Usage analytics dashboard
- Custom branding

---

## Integration Potential

### Official Claude Code GUI

```
user downloads claude code
  → includes yume as default gui
  → terminal still available for power users
  → seamless experience out of box
```

### Claude Desktop Companion

```
existing claude desktop users
  → one-click install yume
  → specialized coding interface
  → shares authentication
```

### Enterprise Package

```
companies buying claude max/enterprise
  → managed yume deployment
  → centralized configuration
  → usage analytics
```

---

## Competitive Moat

### Why Not Just Build It?

1. **Time**: yume is 6+ months ahead
2. **Expertise**: deep tauri/claude code knowledge
3. **Design**: consistent minimalist vision
4. **Keyboard UX**: 30+ shortcuts already working
5. **Community**: (building) engaged user base

### Why Not Acquire Competitors?

| Competitor | Problem |
|------------|---------|
| cursor | electron bloat, multi-ai focus, $20B valuation |
| windsurf | codeium ecosystem, not claude-focused |
| sculptor | docker dependency, linux-first |
| opcode | AGPL license complications |

**yume = lightest, fastest, claude-only, commercial-ready**

---

## The Ask

### Acquisition Benefits

For Anthropic:
- Instant native gui for claude code
- Cross-platform without electron
- Keyboard-first power user appeal
- Team with deep claude code expertise

For Users:
- Official supported client
- Guaranteed updates with claude code
- Enterprise features roadmap
- Community investment

### Next Steps

1. **Technical review** - code audit, architecture review
2. **Product alignment** - feature roadmap discussion
3. **Team conversation** - culture fit, roles
4. **Terms discussion** - structure, timeline

---

## Summary

> "yume is the Bun of Claude Code UI"

Just as Anthropic acquired Bun to power Claude Code's backend infrastructure, yume should power the frontend experience.

**fastest. smallest. claude-only. keyboard-first.**

the foundation is built. let's make it official.

# yume

<div align="center">
  <img src="assets/yume.png" alt="yume logo" width="120">
  <h3>claude code, unchained</h3>
  <p>the fastest, most intuitive way to use claude code</p>
  <p>
    <a href="https://aofp.github.io/yume">Download</a>
  </p>
</div>

---

## why yume?

claude code is powerful. the terminal experience isn't.

### the problems with cli

- **flickering** - 700+ upvotes on github, still unfixed
- **lag** - slows to 10+ seconds in long sessions
- **crashes** - ide terminals crash after 10-20 minutes
- **hidden limits** - need to run `/usage` constantly
- **no recovery** - crash = lose your session

### yume solves this

- ✅ **zero flickering** - native rendering, zero terminal artifacts
- ✅ **zero lag** - stays under 50ms, always
- ✅ **crash proof** - standalone app with 24hr recovery
- ✅ **limits always visible** - 5h and 7-day limits in the ui
- ✅ **crash recovery** - auto-saves every 5 min

---

## features

### core improvements
- **limits always visible** - 5h and 7-day limits shown permanently. no commands needed.
- **no flickering** - eliminate the 700+ upvoted cli flickering issue completely
- **keyboard-first** - 30+ shortcuts. never touch the mouse.
- **no input lag** - cli slows to 10+ seconds. yume stays under 50ms.
- **no vs code crashes** - standalone native app. crash-proof by design.
- **smart auto-compaction** - auto-compacts at 60%, forces at 65%. visual indicator.

### advanced features
- **5 built-in agents** - architect, explorer, implementer, guardian, specialist
- **plugin system** - install custom commands, agents, hooks, skills, mcp servers
- **skills system** - auto-inject context based on triggers (file extensions, keywords, regex)
- **background agents** - 4 concurrent async agents with git branch isolation
- **memory system** - persistent knowledge graph. remembers patterns across sessions.
- **voice dictation** - speak instead of type. native speech-to-text.
- **visual checkpoints** - timeline navigator for code state. rewind, restore, compare.
- **analytics dashboard** - usage by project, model, date. token breakdown. cost tracking.
- **crash recovery** - recover sessions even after crashes
- **@ mention system** - @r for recent files. @m for modified files. folder navigation.
- **multi-provider** - claude, gemini, openai support via yume-cli

### customization
- **570+ color combinations** - 31 themes. 189 accent colors, 189 backgrounds, 189 foregrounds
- **oled-first** - pure black default for oled displays
- **full cli compatibility** - subagents, mcp, hooks, skills, claude.md, @mentions, /commands

---

## tech stack

- **tauri 2.9** - rust backend, native speed
- **react 19** - modern ui with virtualized rendering
- **<50ms response time** - type and the ui responds instantly
- **10k+ messages** - scroll through hours without lag
- **zero telemetry** - your code stays on your machine

---

## comparison

| feature | cli | cursor | opcode | crystal | yume |
|---------|-----|--------|--------|---------|------|
| limits always visible | /usage | ✗ | ✗ | ✗ | ✓ always |
| plugin/skills system | ✗ | ✗ | ✗ | ✗ | ✓ unique |
| 5 built-in agents | ✗ | ✗ | ✗ | ✗ | ✓ |
| crash recovery | ✗ | ✗ | ✗ | ✗ | ✓ |
| @ mentions | partial | ✗ | ✗ | ✗ | ✓ @r @m |
| stream timers | ✗ | ✗ | ✗ | ✗ | ✓ live |
| native app | terminal | electron | tauri | electron | ✓ tauri |
| customization | ✗ | ~5 themes | ✗ | ✗ | ✓ 570+ |
| price | pro/max | $20-200/mo | ✓ free | ✓ free | ✓ free |

---

## download

visit [aofp.github.io/yume](https://aofp.github.io/yume) for all download options.

---

## keyboard shortcuts

| action | shortcut |
|--------|----------|
| new tab | ⌘T |
| close tab | ⌘W |
| toggle model | ⌘O |
| ultrathink | ⌘K |
| settings | ⌘, |
| search messages | ⌘F |
| files panel | ⌘E |
| git panel | ⌘G |
| analytics | ⌘Y |
| agents | ⌘N |
| clear context | ⌘L |
| compact context | ⌘M |

30+ shortcuts total. every action has a shortcut.

---

## 5 built-in agents

yume includes 5 specialized agents that follow your selected model (opus/sonnet):

- **architect** - plans and decomposes. runs before complex tasks.
- **explorer** - read-only search. understands without editing.
- **implementer** - focused edits. minimal diffs.
- **guardian** - reviews for bugs and security issues.
- **specialist** - tests, docs, devops, data.

---

## requirements

- **claude subscription** - pro or max required for claude code access
- **macos** 11+ (big sur or later)
- **windows** 10+ (64-bit)
- **linux** ubuntu 20.04+ or equivalent

---

## license

yume is free to download and use with 2 tab limit. upgrade to pro for unlimited tabs ($21 one-time payment).

---

## links

- **download**: [aofp.github.io/yume](https://aofp.github.io/yume)
- **docs**: [aofp.github.io/yume/docs/release/viewer.html](https://aofp.github.io/yume/docs/release/viewer.html)
- **issues**: [github.com/aofp/yume/issues](https://github.com/aofp/yume/issues)
- **claude code cli**: [github.com/anthropics/claude-code](https://github.com/anthropics/claude-code)

---

<div align="center">
  <p>made with claude code + yume</p>
</div>

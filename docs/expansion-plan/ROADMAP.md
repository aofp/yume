# Multi-Provider Expansion Roadmap

> **Last Updated:** 2026-01-31
> **Overall Progress:** ~95% architecture complete (feature-flagged off in production)
>
> **Note:** Multi-provider infrastructure is implemented but disabled via `PROVIDER_GEMINI_AVAILABLE: false` and `PROVIDER_OPENAI_AVAILABLE: false` in `src/renderer/config/features.ts`. Enable when ready for testing.

**Key Documents:**
- [PROVIDER_REFERENCE.md](./PROVIDER_REFERENCE.md) - Models, pricing, features
- [CONVERSATION_PORTABILITY.md](./CONVERSATION_PORTABILITY.md) - Provider switching
- [PROTOCOL_NORMALIZATION.md](./PROTOCOL_NORMALIZATION.md) - Stream-JSON contract

---

## Phase 0: Protocol Contract - COMPLETE

- [x] Document Claude-compatible stream-json requirements
- [x] Golden transcript fixtures for text, tool use, errors, interrupts
- [x] Edge-case matrix for cross-platform/provider failure modes

## Phase 1: Foundation - COMPLETE

- [x] Claude CLI integration (Sonnet 4.5, Opus 4.5)
- [x] Multi-session tabbed interface
- [x] Core tooling (Read, Write, Edit, Glob, Grep, Bash)
- [x] Provider service (`providersService.ts`)
- [x] Provider selector UI with keyboard nav
- [x] Model registry (`models.ts`)

## Phase 2: Translation Layer - COMPLETE

- [x] yume-cli TypeScript implementation (`src-yume-cli/`)
- [x] Agent loop with safety limits (50 turns, 10min, 100 messages)
- [x] Plugin system (agents, skills with ReDoS-safe triggers)
- [x] Tool executors (glob, grep, ls, bash, file, edit, write)
- [x] Gemini CLI spawner + translation
- [x] Codex CLI spawner + translation with intelligent tool detection
- [ ] Golden transcript compliance tests (pending)

## Phase 3: Provider Expansion - COMPLETE

- [x] Backend spawner (`yume_cli_spawner.rs`)
- [x] CLI detection commands
- [x] Dynamic context bar using model-specific limits
- [x] Provider-aware rate limits (Claude only shows 5h/7d limits)
- [x] Provider analytics (dynamic model support)
- [ ] Auth status check before session spawn

## Phase 4: UI/UX & Settings - COMPLETE

- [x] Provider selector with icons
- [x] Providers tab with CLI status, toggles, per-provider settings
- [x] No-provider modal when none enabled
- [x] Model tools modal with provider locking

## Phase 5: Conversation Portability - 75% COMPLETE

- [x] Unified Conversation Format (UCF) schema and types
- [x] Conversation store with UCF save/load
- [x] Claude adapter (import/export)
- [x] Thinking/reasoning translation strategies
- [x] Switch analysis with feature parity detection
- [ ] Gemini/OpenAI adapters
- [ ] Hot-swap UI (switch warning modal, provider badges)
- [ ] Context summarization for smaller windows

## Phase 6: Optional Extensions - 25% COMPLETE

- [x] VSCode extension commands (install/uninstall/check)
- [ ] Deep linking from VSCode to Yume
- [ ] JetBrains IDE support
- [ ] Team collaboration / encrypted sync
- [ ] Checkpoint integration across providers

---

## Implementation Notes

### yume-cli Binary Location (from `yume_cli_spawner.rs`)

1. Dev: `src-yume-cli/dist/index.js` via node
2. macOS: `Contents/Resources/resources/yume-cli-macos-{arch}`
3. Windows: `{exe_dir}/resources/yume-cli-windows-x64.exe`
4. Linux: `{exe_dir}/resources/yume-cli-linux-x64`
5. Override: `YUME_CLI_BINARY` env var

### Background Agents

- Use Claude CLI directly (not yume-cli)
- Max concurrent: 4 (`MAX_CONCURRENT_AGENTS`)
- No timeout - agents run indefinitely
- Output: `~/.yume/agent-output/{agent-id}.json`

### Provider CLI Commands

| Provider | Command |
|----------|---------|
| Claude | `claude -p --model <m> --output-format stream-json --dangerously-skip-permissions` |
| Gemini | `gemini --model <m> --output-format stream-json --yolo` |
| Codex | `codex exec --json -C <cwd> --full-auto -m <m>` |

---

## Success Metrics

- User can switch between Claude, Gemini, and OpenAI in one app
- All existing UI features work across providers without code changes
- Protocol compliance tests pass across macOS, Windows, Linux

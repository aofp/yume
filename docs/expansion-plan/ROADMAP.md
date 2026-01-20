# Multi-Provider Expansion Roadmap

This roadmap focuses on making Yume provider-agnostic while preserving the existing Claude-compatible stream-json pipeline.

> **Last Updated:** 2026-01-19
> **Overall Progress:** ~95% complete (macOS ready, Windows/Linux binaries pending)

> **Key Documents:**
> - [PROVIDER_REFERENCE.md](./PROVIDER_REFERENCE.md) - Single source of truth for models, pricing, features
> - [CONVERSATION_PORTABILITY.md](./CONVERSATION_PORTABILITY.md) - Mid-conversation provider switching
> - [PROTOCOL_NORMALIZATION.md](./PROTOCOL_NORMALIZATION.md) - Stream-JSON contract
> - [UNIVERSAL_SESSION_ARCHITECTURE.md](./UNIVERSAL_SESSION_ARCHITECTURE.md) - Session storage architecture

## Phase 0: Protocol Contract ✅ COMPLETE
- [x] **Canonical Protocol:** Document Claude-compatible stream-json requirements (match `src-tauri/src/stream_parser.rs`).
- [x] **Golden Transcript Tests:** Replayable fixtures for text, tool use, errors, and interrupts.
- [x] **Edge-Case Matrix:** Enumerate cross-platform/provider failure modes.
- [x] **Technical Approach Doc:** Finalize best-practice architecture and tool support tiers.

## Phase 1: Foundation ✅ COMPLETE
- [x] **Claude CLI Integration**: Native support for Claude Sonnet 4.5 / Opus 4.5.
- [x] **Multi-Session Architecture**: Tabbed interface with independent contexts.
- [x] **Core Tooling**: Read, Write, Edit, Glob, Grep, Bash tool definitions.
- [x] **Provider Service:** `providersService.ts` for enabling/disabling providers.
- [x] **Provider Selector:** `ProviderSelector.tsx` component with keyboard nav.
- [x] **Providers Tab:** `ProvidersTab.tsx` with CLI status, toggles, per-provider options.
- [x] **yume-cli Scaffolding:** Full `src-yume-cli/` directory with TypeScript implementation.
- [x] **Event Compatibility:** Existing `claude-message` events work for all providers.
- [x] **Model Registry:** `models.ts` with all providers (Claude, Gemini, OpenAI/Codex).

## Phase 2: Translation Layer ✅ COMPLETE
- [x] **yume-cli Structure:** Complete TypeScript implementation in `src-yume-cli/`.
  - [x] CLI argument parsing (`index.ts`)
  - [x] Provider base interface (`providers/base.ts`)
  - [x] Provider factory (`providers/index.ts`)
  - [x] Agent loop (`core/agent-loop.ts`)
    - [x] History file injection for Cross-Agent Resumption (`--historyFile` flag)
    - [x] MAX_TURNS safety limit (50 turns)
    - [x] MAX_DURATION_MS timeout (10 minutes)
    - [x] MAX_HISTORY_MESSAGES compaction (100 messages)
  - [x] Session management (`core/session.ts`)
  - [x] Stream emission (`core/emit.ts`)
  - [x] Plugin loader (`core/plugins.ts`) - agents, skills from `~/.yume/plugins/`
    - [x] ReDoS-safe regex validation for skill triggers
    - [x] Agent system prompt injection via `<system-context>` tags
    - [x] Skill content injection via `<skill-context>` tags
    - [x] `buildSystemContext()` for prompt enhancement
- [x] **Tool Executors:** Full local tool implementations.
  - [x] `glob.ts` - File pattern matching
  - [x] `grep.ts` - Content search
  - [x] `ls.ts` - Directory listing
  - [x] `bash.ts` - Command execution
  - [x] `file.ts` - File reading
  - [x] `edit.ts` - File editing
  - [x] `write.ts` - File writing
- [x] **CLI Spawning:** Spawn official `gemini` and `codex` CLIs.
  - [x] Gemini CLI spawner (`providers/gemini.ts`)
  - [x] Codex CLI spawner (`providers/openai.ts`)
- [x] **Stream Translation:** Translate provider stream-json to Claude format.
  - [x] Gemini → Claude translation (tool name mapping, thinking blocks)
  - [x] Codex → Claude translation (command detection → Read/Grep/Glob/LS/Edit/Write/WebFetch)
    - [x] `detectToolFromCommand()` - intelligent tool type detection from bash commands
    - [x] Tool detection patterns: cat/head/tail → Read, find/fd → Glob, grep/rg → Grep, ls/tree → LS, sed/awk → Edit, curl/wget → WebFetch
    - [x] Mini model reasoning effort override
- [ ] **Compliance:** Pass golden transcript tests on macOS, Windows, Linux.

## Phase 3: Provider Expansion ✅ COMPLETE
- [x] **Backend Spawner:** `yume_cli_spawner.rs` - Full Rust implementation.
  - [x] Provider enum (Gemini, OpenAI)
  - [x] Binary location logic (dev, bundled, env var)
  - [x] Spawn options (provider, model, prompt, resume, history)
  - [x] Stream handling and session ID extraction
  - [x] Multi-channel event emission
- [x] **CLI Detection:** `check_cli_installed` command in `claude_detector.rs`.
- [x] **Provider Detection:** `detect_provider_support` command for yume-cli availability.
- [x] **Dynamic Context Bar:** `ContextBar.tsx` uses model-specific limits from `models.ts`.
- [x] **Provider-Aware Rate Limits:**
  - [x] 5h/7d limit bars only shown for Claude provider
  - [x] Stats modal shows "claude 5h/7d" labels
  - [x] "rate limits not available for {provider}" message for Gemini/OpenAI
- [x] **Provider Analytics:** Analytics now supports dynamic models (not just opus/sonnet).
  - [x] `normalizeModelName()` detects all model types
  - [x] `ensureModelStats()` creates entries on demand
  - [x] Supports gemini-pro, gemini-flash, gpt-codex, gpt-codex-mini, etc.
- [ ] **Auth Status:** Check authentication status before spawning sessions.

## Phase 4: UI/UX & Settings ✅ COMPLETE
- [x] **Enhanced Provider Switcher:** `ProviderSelector.tsx` with icons (◉ ◈ ◎).
- [x] **Enhanced Providers Tab:** `ProvidersTab.tsx` with full features.
  - [x] CLI installation status indicators
  - [x] Enable/disable toggles (disabled if CLI not installed)
  - [x] Per-provider CLI settings (`ProviderCliModal.tsx`)
  - [x] Per-provider system prompts (`ProviderSystemPromptSelector.tsx`)
- [x] **No Provider Modal:** `NoProviderModal.tsx` blocks app when no providers enabled.
- [x] **Provider Hooks:** `useEnabledProviders.ts` for reactive state.
- [x] **Model Tools Modal:** `ModelToolsModal.tsx` shows models from enabled providers.
  - [x] Provider locking when session has messages
  - [x] Keyboard navigation

## Phase 5: Conversation Portability 🔄 IN PROGRESS (~75%)
> See [CONVERSATION_PORTABILITY.md](./CONVERSATION_PORTABILITY.md) for detailed specification.

- [x] **Unified Conversation Format (UCF):** Schema defined and implemented.
  - [x] TypeScript interfaces in `src/renderer/types/ucf.ts`
  - [x] `UnifiedConversation`, `UnifiedMessage`, `UnifiedContent` types
  - [x] `ProviderSwitch`, `ProviderState`, `SwitchAnalysis` types
  - [x] `CORE_TOOLS`, `CLAUDE_ONLY_TOOLS`, `MCP_TOOL_PREFIXES` constants
- [x] **Conversation Store:** `conversationStore.ts` implemented.
  - [x] Save/load conversations in UCF format
  - [x] Metadata extraction for quick listing
  - [x] Automatic backup management (5 backups)
  - [x] Claude JSONL import capability
- [x] **Translation Layer:** `conversationTranslator.ts` service.
  - [x] Claude adapter (import from JSONL, export to Claude format)
  - [ ] Gemini adapter (import/export) - planned
  - [ ] OpenAI adapter (import/export) - planned
- [x] **Thinking/Reasoning Handling:** Strategy defined in translator.
  - [x] Preserve for Claude and Gemini 2.0-thinking
  - [x] Drop or convert for unsupported models
  - [x] Translation strategies: `drop`, `convert`, `ask`
- [x] **Switch Analysis:** `analyzeSwitch()` function implemented.
  - [x] Feature parity detection
  - [x] Context window validation
  - [x] Lossy conversion warnings
- [ ] **Hot-Swap UI:**
  - [ ] `SwitchWarningModal.tsx` component
  - [ ] Provider badges on messages
  - [ ] Visual switch dividers
- [x] **MCP/Artifact Handling:** Strategy in translator.
  - [x] MCP tool detection via prefixes
  - [x] Artifact inlining for non-Claude providers
- [ ] **Context Summarization:**
  - [ ] Auto-summarize when switching to smaller context
  - [ ] User control over summarization strategy

## Phase 6: Optional Extensions 🔄 IN PROGRESS (~25%)
- [x] **VSCode Extension:** Commands for VSCode extension management.
  - [x] `is_vscode_installed()` - Check if VSCode CLI is available
  - [x] `check_vscode_extension_installed()` - Check if Yume extension is installed
  - [x] `install_vscode_extension()` - Install bundled .vsix extension
  - [x] `uninstall_vscode_extension()` - Uninstall extension
  - [ ] Deep linking from VSCode to Yume
  - [ ] JetBrains IDE support
- [ ] **Team Collaboration:** Shared sessions and encrypted sync.
- [ ] **Checkpoint Integration:** Restore checkpoints across providers.

## Success Metrics
- User can switch between Claude, Gemini, and OpenAI in one app.
- All existing UI features work across providers without code changes.
- Protocol compliance tests pass across macOS, Windows, Linux.

---

## Testing Infrastructure

### Golden Transcript Location
```
tests/golden-transcripts/
├── claude/
│   ├── text-only.jsonl
│   ├── single-tool.jsonl
│   ├── multi-tool.jsonl
│   ├── tool-error.jsonl
│   ├── interrupt.jsonl
│   └── session-resume.jsonl
├── gemini/
│   └── (same structure)
├── openai/
│   └── (same structure)
└── README.md
```

### Test Scenarios (Minimum)

Each provider must pass these 8 scenarios:

| # | Scenario | Description |
|---|----------|-------------|
| 1 | text-only | Simple text response, no tools |
| 2 | single-tool | One tool call + result |
| 3 | multi-tool | Multiple sequential tool calls |
| 4 | parallel-tool | Parallel tool calls (if supported) |
| 5 | tool-error | Tool execution fails, `is_error: true` |
| 6 | interrupt | User interrupts mid-response |
| 7 | auth-failure | Missing/invalid credentials |
| 8 | rate-limit | 429 response, retry behavior |

### CI Pipeline

```yaml
# .github/workflows/yume-cli-test.yml
name: yume-cli Tests

on:
  push:
    paths:
      - 'src-yume-cli/**'
  pull_request:
    paths:
      - 'src-yume-cli/**'

jobs:
  test:
    strategy:
      matrix:
        os: [macos-latest, ubuntu-latest, windows-latest]
        provider: [gemini, openai]

    runs-on: ${{ matrix.os }}

    steps:
      - uses: actions/checkout@v4

      - name: Setup Node.js
        uses: actions/setup-node@v4
        with:
          node-version: '20'

      - name: Install dependencies
        run: npm ci
        working-directory: src-yume-cli

      - name: Run golden tests
        run: npm test -- --provider ${{ matrix.provider }}
        working-directory: src-yume-cli
        env:
          # Use mock credentials for CI
          GOOGLE_API_KEY: ${{ secrets.GOOGLE_API_KEY_TEST }}
          OPENAI_API_KEY: ${{ secrets.OPENAI_API_KEY_TEST }}

      - name: Build binary
        run: npm run build:${{ runner.os == 'macOS' && 'macos' || runner.os == 'Linux' && 'linux' || 'windows' }}
        working-directory: src-yume-cli
```

### Running Tests Locally

```bash
# Run all golden tests
cd src-yume-cli
npm test

# Run specific provider
npm test -- --provider gemini

# Run specific scenario
npm test -- --scenario single-tool

# Run with mock responses (no API calls)
npm test -- --mock

# Generate new golden files from live API
npm test -- --record --provider openai
```

### Test Harness

```typescript
// src-yume-cli/tests/harness.ts
interface GoldenTest {
  name: string;
  provider: string;
  input: {
    prompt: string;
    sessionId?: string;
    model?: string;
  };
  expected: {
    messages: StreamMessage[];
    exitCode: number;
  };
}

async function runGoldenTest(test: GoldenTest): Promise<TestResult> {
  const process = spawn('node', [
    'dist/index.js',
    '--provider', test.provider,
    '--prompt', test.input.prompt,
    '--session-id', test.input.sessionId || 'test-session',
  ]);

  const messages: StreamMessage[] = [];

  for await (const line of readline(process.stdout)) {
    messages.push(JSON.parse(line));
  }

  const exitCode = await waitForExit(process);

  return compareOutput(messages, test.expected.messages);
}
```

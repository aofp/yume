# Multi-Provider Expansion Roadmap

This roadmap focuses on making Yume provider-agnostic while preserving the existing Claude-compatible stream-json pipeline.

## Phase 0: Protocol Contract ✅
- [x] **Canonical Protocol:** Document Claude-compatible stream-json requirements (match `src-tauri/src/stream_parser.rs`).
- [x] **Golden Transcript Tests:** Replayable fixtures for text, tool use, errors, and interrupts.
- [x] **Edge-Case Matrix:** Enumerate cross-platform/provider failure modes.
- [x] **Technical Approach Doc:** Finalize best-practice architecture and tool support tiers.

## Phase 1: Foundation (In Progress)
- [x] **Claude CLI Integration**: Native support for Claude Sonnet 4 / Opus 4.5.
- [x] **Multi-Session Architecture**: Tabbed interface with independent contexts.
- [x] **Core Tooling**: Read, Write, Edit, Glob, Grep, Bash tool definitions.
- [ ] **Server Refactor:** Extract CLI logic into adapters (Claude + Shim).
- [ ] **Event Compatibility:** Keep `claude-message` events for backward compatibility.
- [ ] **yume-cli Scaffolding:** Create `src-yume-cli/` directory structure.

## Phase 2: Translation Layer
- [ ] **Build `yume-cli`:** Standalone shim emitting Claude-compatible stream-json.
  - [ ] Core agent loop (Think → Act → Observe)
  - [ ] Session persistence to `~/.yume/sessions/`
  - [ ] Secret redaction in tool outputs
- [ ] **Gemini Strategy:**
  - [ ] REST streaming implementation
  - [ ] Function calling normalization
  - [ ] Token caching for gcloud auth
- [ ] **OpenAI Strategy:**
  - [ ] Streaming tool-call buffering
  - [ ] Rate limit retry logic
  - [ ] Usage mapping
- [ ] **Compliance:** Pass golden transcript tests on macOS, Windows, Linux.

## Phase 3: Provider Expansion
- [ ] **Gemini Provider:** Wire `yume-cli --provider gemini` into Yume.
- [ ] **OpenAI Provider:** Wire `yume-cli --provider openai` into Yume.
- [ ] **Local LLM Provider:** OpenAI-compatible endpoints (Ollama, LM Studio, etc.).
- [ ] **Provider Analytics:** Cost/token tracking by `{provider}:{model}` key.

## Phase 4: UI/UX & Settings
- [ ] **Provider Switcher:** UI for selecting provider per session.
- [ ] **Providers Tab:** Auth status, model selection, binary paths.
- [ ] **Graceful Fallbacks:** Degraded mode when tool calls are unavailable.
- [ ] **Migration UX:** Clear messaging when switching providers mid-session.

## Phase 5: Optional Extensions
- [ ] **IDE Integration:** VSCode/JetBrains deep linking.
- [ ] **Team Collaboration:** Shared sessions and encrypted sync.

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

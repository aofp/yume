# Claude Agent SDK

## Overview
- **Developer**: Anthropic (Official)
- **Type**: SDK wrapper for Claude Code CLI
- **Tech Stack**: TypeScript/Python
- **Pricing**: Free SDK, **BUT REQUIRES API KEY (separate billing)**
- **License**: Commercial (Anthropic ToS)

---

## ⚠️ CRITICAL: API KEY REQUIREMENT

**The Agent SDK REQUIRES an Anthropic API key and CANNOT use CLI subscription authentication.**

### Confirmed by Anthropic (GitHub Issues)

From [Issue #5891](https://github.com/anthropics/claude-code/issues/5891) - Anthropic staff (Catherine Wu, Nov 2025):
> "The Claude Agent SDK is intended to be used with an API key. Claude Code can be used with an API key or with a subscription."

From [Issue #6536](https://github.com/anthropics/claude-code/issues/6536):
> "SDK requires a traditional API key from the Anthropic Console (keys starting with `sk-ant-...`)"
> "The two systems use different authentication methods and billing models."

### What This Means

| Method | CLI Direct | Agent SDK |
|--------|-----------|-----------|
| Subscription auth (Pro/Max) | ✅ Works | ❌ NOT SUPPORTED |
| API key (`sk-ant-...`) | ✅ Works | ✅ Required |
| OAuth token | ✅ Works | ❌ NOT SUPPORTED |
| Billing | Subscription OR API | **API only (pay-per-token)** |

### Impact on yume

**This is a DEALBREAKER for SDK adoption.**

yume users:
1. Have Claude Pro/Max subscriptions
2. Expect to use subscription quota
3. Don't want to pay separately for API usage
4. Would effectively pay TWICE (subscription + API) with SDK

---

## Architecture Note

**The Agent SDK IS a CLI wrapper, but it FORCES API key authentication.**

From official docs:
> "Install Claude Code: The Agent SDK uses Claude Code as its runtime."

This means:
1. SDK spawns CLI processes internally
2. BUT configures them to use API key auth
3. SDK provides higher-level abstractions
4. SDK handles all message parsing, streaming, tool execution

---

## Architecture Comparison

### Current yume Flow
```
Frontend → Tauri IPC → Rust Spawner → Claude CLI → stream-json → Parse → Events
```

### Agent SDK Flow
```
SDK query() → Internal CLI Spawn → Built-in Parser → Message Stream
```

### Key Insight
Both approaches spawn CLI. The difference is:
- **yume**: reinvents SDK functionality in Rust
- **agent sdk**: uses Anthropic's official abstractions

---

## SDK Capabilities

### Message Types (Complete)
| Type | Description |
|------|-------------|
| `SDKAssistantMessage` | Claude's responses with content blocks |
| `SDKUserMessage` | User input messages |
| `SDKResultMessage` | Final result with subtype (success/error_*) |
| `SDKSystemMessage` | Init with tools, mcp_servers, model, etc. |
| `SDKPartialAssistantMessage` | Streaming deltas (includePartialMessages) |
| `SDKCompactBoundaryMessage` | Compact trigger/pre_tokens metadata |

### Result Subtypes
- `success`
- `error_max_turns`
- `error_during_execution`
- `error_max_budget_usd`
- `error_max_structured_output_retries`

### Full Options
```typescript
{
  prompt: string | AsyncIterable<SDKUserMessage>,
  options: {
    // Core
    allowedTools: string[],
    disallowedTools: string[],
    model: string,
    fallbackModel: string,
    systemPrompt: string | { type: 'preset', preset: 'claude_code', append?: string },

    // Sessions
    resume: string,  // session_id to resume
    continue: boolean,  // continue most recent
    forkSession: boolean,  // fork instead of continue

    // Permissions
    permissionMode: 'default' | 'acceptEdits' | 'bypassPermissions' | 'plan',
    canUseTool: (toolName, input, options) => Promise<PermissionResult>,
    allowDangerouslySkipPermissions: boolean,

    // Hooks (lifecycle callbacks)
    hooks: {
      PreToolUse: HookCallback[],
      PostToolUse: HookCallback[],
      PostToolUseFailure: HookCallback[],
      Notification: HookCallback[],
      UserPromptSubmit: HookCallback[],
      SessionStart: HookCallback[],
      SessionEnd: HookCallback[],
      Stop: HookCallback[],
      SubagentStart: HookCallback[],
      SubagentStop: HookCallback[],
      PreCompact: HookCallback[],
      PermissionRequest: HookCallback[],
    },

    // MCP
    mcpServers: {
      [name]: { command, args, env } | { type: 'sse', url } | { type: 'http', url }
    },

    // Subagents
    agents: {
      [name]: { description, tools, prompt, model }
    },

    // Budget/Limits
    maxTurns: number,
    maxBudgetUsd: number,
    maxThinkingTokens: number,

    // Advanced
    sandbox: SandboxSettings,
    enableFileCheckpointing: boolean,
    settingSources: ('user' | 'project' | 'local')[],
    includePartialMessages: boolean,
    betas: ['context-1m-2025-08-07'],

    // Runtime
    cwd: string,
    env: Record<string, string>,
    executable: 'bun' | 'deno' | 'node',
    abortController: AbortController,
  }
}
```

### Query Object Methods
```typescript
interface Query extends AsyncGenerator<SDKMessage, void> {
  interrupt(): Promise<void>;
  rewindFiles(userMessageUuid: string): Promise<void>;
  setPermissionMode(mode: PermissionMode): Promise<void>;
  setModel(model?: string): Promise<void>;
  setMaxThinkingTokens(max: number | null): Promise<void>;
  supportedCommands(): Promise<SlashCommand[]>;
  supportedModels(): Promise<ModelInfo[]>;
  mcpServerStatus(): Promise<McpServerStatus[]>;
  accountInfo(): Promise<AccountInfo>;
}
```

---

## Comparison: SDK vs Current Implementation

### What yume Currently Has

| Feature | Status | Notes |
|---------|--------|-------|
| CLI spawning | ✅ | Via Rust |
| Stream parsing | ✅ | `stream_parser.rs` |
| Message types | ⚠️ | Missing some fields |
| Session resume | ✅ | `--resume` flag |
| Token tracking | ⚠️ | Custom impl, drift issues |
| Compact detection | ✅ | Zero-usage result |
| Permission mode | ⚠️ | Only `--dangerously-skip-permissions` |
| Hooks | ❌ | Not implemented |
| MCP config | ❌ | Not exposed |
| Subagents | ❌ | Not exposed |
| File checkpointing | ⚠️ | Partial (RestorePoint) |
| Streaming input | ❌ | New process per message |
| Query methods | ❌ | No interrupt/setModel/etc |

### What SDK Provides for Free

1. **Correct message parsing** - battle-tested by Anthropic
2. **Session management** - resume, fork, continue
3. **Hooks system** - PreToolUse, PostToolUse, etc.
4. **MCP integration** - stdio, sse, http, sdk-native
5. **Subagent definitions** - programmatic agent configs
6. **Permission callbacks** - canUseTool with full control
7. **Query methods** - interrupt(), setModel(), etc.
8. **File checkpointing** - rewindFiles() built-in
9. **Streaming input mode** - multi-turn with live control
10. **Automatic tool execution** - no manual implementation

---

## Current yume Bugs (Found in Review)

### Critical: Session Routing Bug
`claude_commands.rs:134-137`:
```rust
let sessions = session_manager.list_sessions().await;
let session = sessions.into_iter()
    .next()  // ALWAYS gets first session!
    .ok_or_else(|| ...)?;
```
This breaks multi-tab scenarios.

### Medium: Token Tracking Drift
`wrapperIntegration.ts` accumulates tokens differently than SDK's context window tracking. Can lead to incorrect compaction triggers.

### Medium: Env Var for Session State
`claude_commands.rs:175` uses `std::env::set_var("COMPACT_ORIGINAL_SESSION", ...)` for /compact relay. Fragile.

---

## Migration Options Analysis

### Option A: Keep Current + Fix Bugs
**Effort**: Low
**Risk**: Medium
**Benefit**: Quick

Fix critical bugs, keep Rust implementation.

Pros:
- Minimal changes
- Keep Tauri performance
- Already working for most cases

Cons:
- Maintain parity with SDK forever
- Miss new SDK features
- Custom parsing = potential bugs
- More code to maintain

### Option B: Hybrid - SDK for Logic, Tauri for UI
**Effort**: Medium
**Risk**: Low
**Benefit**: High

Use SDK in a Node.js subprocess, Tauri for UI only.

```
Tauri UI → Node.js Bridge → Agent SDK → CLI
```

Pros:
- Official SDK handling
- Automatic feature updates
- Correct parsing guaranteed
- Hooks, MCP, subagents for free
- Less code to maintain

Cons:
- Node.js dependency
- IPC complexity
- Memory overhead (~30MB)

### Option C: Full SDK Migration
**Effort**: High
**Risk**: Medium
**Benefit**: Highest

Replace Rust spawner entirely with SDK.

Pros:
- Full SDK parity
- Official support
- All features automatically
- Future-proof

Cons:
- Major refactor
- Electron-like dependency
- Lose some Tauri benefits

### Option D: SDK via Tauri Sidecar
**Effort**: Medium-High
**Risk**: Low
**Benefit**: High

Bundle Node.js as Tauri sidecar for SDK.

```
Tauri → Sidecar (Node + SDK) → IPC Events
```

Pros:
- Official SDK
- No external Node dependency
- Single binary distribution
- Clean architecture

Cons:
- Larger bundle
- Sidecar management
- IPC overhead

---

## Recommendation

### ~~Best Option: Option D - SDK via Tauri Sidecar~~

### ❌ SDK IS NOT VIABLE - API KEY REQUIREMENT

**The SDK requires API key authentication, which breaks yume's value proposition.**

yume users expect to use their Claude Pro/Max subscription. Requiring an API key would:
1. Force users to pay TWICE (subscription + API usage)
2. Require credit card setup in Anthropic Console
3. Create billing confusion
4. Lose competitive advantage vs other GUI wrappers

---

## REVISED Recommendation

### Best Option: **Option A - Keep Current + Fix Bugs + Enhance**

**Rationale:**

1. **Subscription auth works** - Current CLI spawning supports subscription authentication
2. **Direct CLI = Full flexibility** - Can use any auth method user has configured
3. **Already 90% there** - Most SDK features are already implemented
4. **Lower risk** - Incremental improvements vs risky migration

### What To Do

#### Phase 1: Fix Critical Bugs (Immediate)

**Bug 1: Session Routing** (`claude_commands.rs:134-137`)
```rust
// BROKEN: Always gets first session
let session = sessions.into_iter().next()

// FIX: Find by session_id
let session = sessions.into_iter()
    .find(|s| s.session_id == request.session_id)
```

**Bug 2: Env var for compact state** (`claude_commands.rs:175`)
- Replace `std::env::set_var` with proper session state tracking

**Bug 3: Token tracking drift** (`wrapperIntegration.ts`)
- Align with SDK's context window calculation
- Use `cache_read + cache_creation + input` for context size

#### Phase 2: Complete Message Parity

Add missing fields to `stream_parser.rs`:
- `structured_output` in Result
- `mcp_servers` array in system init
- `slash_commands` in system init
- `output_style` in system init

#### Phase 3: Add SDK-Inspired Features

These can be implemented WITHOUT SDK dependency:

| Feature | Implementation |
|---------|---------------|
| Hooks | Shell script hooks (like Claude Code does) |
| MCP config | Pass `--mcp-servers` to CLI |
| Permission modes | Pass `--permission-mode` to CLI |
| File checkpointing | Already have RestorePoint, enhance it |

#### Phase 4: Study SDK for Parsing Reference

Use SDK as **reference implementation** for:
- Message type definitions
- Token calculation logic
- Compact detection
- Session state management

Don't use SDK directly, but learn from its patterns.

### Implementation Outline (Revised)

```
Week 1: Bug Fixes
├── Fix session routing bug
├── Fix env var state tracking
├── Test multi-tab scenarios
└── Verify compact flow works

Week 2: Message Parity
├── Add structured_output field
├── Parse mcp_servers from init
├── Parse slash_commands from init
├── Update TypeScript types

Week 3: Token Tracking Fix
├── Audit wrapperIntegration.ts
├── Align with SDK's context calculation
├── Fix compaction trigger logic
└── Add context window UI

Week 4: Polish
├── Add permission mode selector
├── Expose hooks configuration
├── Documentation update
└── Final testing
```

---

## KEY DISCOVERY: Bidirectional Streaming

**The CLI supports `--input-format stream-json` for persistent processes!**

This enables:
- One process handles entire session (no respawn per message)
- Live control: interrupt(), setModel(), setPermissionMode()
- File checkpointing with rewindFiles()
- ~100-500ms latency savings per message

See [STREAMING-INPUT-MODE.md](./STREAMING-INPUT-MODE.md) for full details.

---

## Related Documents

| Document | Description |
|----------|-------------|
| [CLI-FLAGS-COMPARISON.md](./CLI-FLAGS-COMPARISON.md) | Complete CLI flag mapping |
| [IMPLEMENTATION-ROADMAP.md](./IMPLEMENTATION-ROADMAP.md) | Phased implementation plan |
| [STREAMING-INPUT-MODE.md](./STREAMING-INPUT-MODE.md) | Bidirectional streaming details |

---

## Reference Source

SDK source and Claude Code repo cloned to:
```
competitor-research/claude-agent-sdk/source/
├── sdk-npm/           # @anthropic-ai/claude-agent-sdk package
│   ├── sdk.mjs        # Main SDK code
│   └── entrypoints/   # Type definitions
│       └── agentSdkTypes.d.ts  # Full SDK types
└── claude-code/       # Claude Code repo
    └── plugins/       # Official plugins for reference
```

---

## Sources

- [Claude Agent SDK Overview](https://platform.claude.com/docs/en/agent-sdk/overview)
- [TypeScript SDK Reference](https://platform.claude.com/docs/en/agent-sdk/typescript)
- [Quickstart Guide](https://platform.claude.com/docs/en/agent-sdk/quickstart)
- [@anthropic-ai/claude-agent-sdk npm](https://www.npmjs.com/package/@anthropic-ai/claude-agent-sdk)

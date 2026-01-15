# Provider & Model Reference (Single Source of Truth)

This document consolidates all provider, model, context window, pricing, and capability information. **Update this file when models or pricing change.**

## Provider Overview

| Provider | CLI Command | Auth Method | Installation | Status |
|----------|-------------|-------------|--------------|--------|
| Claude (Anthropic) | `claude` | Auto on first run | Bundled with Yume | ✅ Production |
| Gemini (Google) | `yume-cli --provider gemini`<br>(spawns `gemini` CLI) | `gemini auth login` | `npm install -g @google/gemini-cli` | 🚧 In Progress |
| OpenAI/Codex | `yume-cli --provider openai`<br>(spawns `codex` CLI) | `codex auth login` | `npm install -g codex-cli` | 🚧 Planned |

## Model Registry

### Claude (Anthropic)

| Model ID | Short Name | Display Name | Context | Output | Tools | Thinking |
|----------|-----------|--------------|---------|--------|-------|----------|
| claude-sonnet-4-5-20250929 | sonnet | Sonnet 4.5 | 200K | 8K | ✅ | ✅ |
| claude-opus-4-5-20251101 | opus | Opus 4.5 | 200K | 8K | ✅ | ✅ |

**Analytics Key Format:** `claude:sonnet-4.5`, `claude:opus-4.5`

### Gemini (Google)

| Model ID | Short Name | Display Name | Context | Output | Tools | Thinking |
|----------|-----------|--------------|---------|--------|-------|----------|
| gemini-2.0-flash | gemini-flash | Gemini 2.0 Flash | 1M | 8K | ✅ | ❌ |
| gemini-2.0-flash-thinking | gemini-thinking | Gemini 2.0 Thinking | 32K | 8K | ✅ | ✅ |
| gemini-1.5-pro | gemini-pro | Gemini 1.5 Pro | 1M | 8K | ✅ | ❌ |
| gemini-1.5-flash | gemini-1.5-flash | Gemini 1.5 Flash | 1M | 8K | ✅ | ❌ |

**Analytics Key Format:** `gemini:2.0-flash`, `gemini:2.0-thinking`, `gemini:1.5-pro`

### OpenAI

| Model ID | Short Name | Display Name | Context | Output | Tools | Reasoning |
|----------|-----------|--------------|---------|--------|-------|-----------|
| gpt-4o | gpt4o | GPT-4o | 128K | 16K | ✅ | ❌ |
| gpt-4o-mini | gpt4o-mini | GPT-4o Mini | 128K | 16K | ✅ | ❌ |
| o1 | o1 | O1 | 200K | 100K | ✅ | ✅ |
| o1-mini | o1-mini | O1 Mini | 128K | 65K | ✅ | ✅ |
| o3-mini | o3-mini | O3 Mini | 200K | 100K | ✅ | ✅ |

**Analytics Key Format:** `openai:gpt-4o`, `openai:o1`, `openai:o3-mini`

## Pricing (per 1M tokens, USD)

### Claude

| Model | Input | Output | Cache Read | Cache Write |
|-------|-------|--------|------------|-------------|
| claude:opus-4.5 | $15.00 | $75.00 | $1.50 | $18.75 |
| claude:sonnet-4.5 | $3.00 | $15.00 | $0.30 | $3.75 |

### Gemini

| Model | Input | Output | Cache Read | Notes |
|-------|-------|--------|------------|-------|
| gemini:2.0-flash | $0.10 | $0.40 | - | No caching |
| gemini:2.0-thinking | $0.10 | $0.40 | - | Thinking tokens included |
| gemini:1.5-pro | $3.50 | $10.50 | $0.88 | >128K: 2x price |
| gemini:1.5-flash | $0.075 | $0.30 | $0.02 | >128K: 2x price |

### OpenAI

| Model | Input | Output | Notes |
|-------|-------|--------|-------|
| openai:gpt-4o | $2.50 | $10.00 | |
| openai:gpt-4o-mini | $0.15 | $0.60 | |
| openai:o1 | $15.00 | $60.00 | Reasoning tokens billed as output |
| openai:o1-mini | $3.00 | $12.00 | |
| openai:o3-mini | $1.10 | $4.40 | |

## Context Compaction Thresholds

| Provider | Model Type | Threshold | Reason |
|----------|------------|-----------|--------|
| Claude | All | 60% | Standard - matches Claude Code |
| Gemini | Standard (1M) | 80% | Large context, rarely needed |
| Gemini | Thinking (32K) | 60% | Small context, standard |
| OpenAI | Standard | 60% | Standard |
| OpenAI | O1/O3 | 50% | Large outputs need buffer |

## Feature Parity Matrix

### Core Features

| Feature | Claude | Gemini | OpenAI | Notes |
|---------|--------|--------|--------|-------|
| Text streaming | ✅ | ✅ | ✅ | Required |
| Tool/function calls | ✅ | ✅ | ✅ | Required |
| Multi-turn conversation | ✅ | ✅ | ✅ | Required |
| Session resume | ✅ Native | ✅ Shim | ✅ Shim | Claude uses ~/.claude |
| Token counting | ✅ | ✅ | ✅ | Tiktoken fallback |
| Cost tracking | ✅ | ✅ | ✅ | Via result.total_cost_usd |

### Advanced Features

| Feature | Claude | Gemini | OpenAI | Translation Strategy |
|---------|--------|--------|--------|---------------------|
| Thinking blocks | ✅ | ⚠️ 2.0-thinking | ⚠️ O1/O3 | Preserve if available, else drop |
| Extended thinking | ✅ | ❌ | ✅ O1 | Provider-specific |
| Prompt caching | ✅ | ✅ | ❌ | Ignore cache tokens on switch |
| MCP support | ✅ | ❌ | ❌ | Claude-only, disable on switch |
| Artifacts | ✅ | ❌ | ❌ | Inline content on switch |
| Custom agents | ✅ | ✅ | ✅ | Via system prompt |
| Skills | ✅ | ✅ | ✅ | Via system prompt injection |
| Hooks | ✅ | ⚠️ | ⚠️ | PreToolUse/PostToolUse only |

### Input/Output Support

| Feature | Claude | Gemini | OpenAI | Notes |
|---------|--------|--------|--------|-------|
| Image input | ✅ | ✅ | ✅ | Base64 required |
| PDF input | ✅ | ✅ | ❌ | OpenAI lacks native PDF |
| Image output | ❌ | ✅ | ✅ DALL-E | Via tool |
| Code execution | ✅ Bash | ❌ | ✅ | Via tool |
| Web search | ✅ | ✅ Grounding | ✅ Browsing | Provider-specific |

## Tool Compatibility

### Core Tools (All Providers)

These tools must work identically across all providers:

| Tool | Claude | Gemini | OpenAI | Schema |
|------|--------|--------|--------|--------|
| Read | ✅ | ✅ | ✅ | `{ file_path }` |
| Write | ✅ | ✅ | ✅ | `{ file_path, content }` |
| Edit | ✅ | ✅ | ✅ | `{ file_path, old_string, new_string }` |
| MultiEdit | ✅ | ✅ | ✅ | `{ file_path, edits[] }` |
| Glob | ✅ | ✅ | ✅ | `{ pattern, path? }` |
| Grep | ✅ | ✅ | ✅ | `{ pattern, path? }` |
| LS | ✅ | ✅ | ✅ | `{ path? }` |
| Bash | ✅ | ✅ | ✅ | `{ command }` |

### Extended Tools

| Tool | Claude | Gemini | OpenAI | Notes |
|------|--------|--------|--------|-------|
| WebFetch | ✅ | ✅ | ✅ | |
| WebSearch | ✅ | ✅ | ✅ | Different backends |
| NotebookEdit | ✅ | ✅ | ✅ | |
| Task (subagents) | ✅ | ⚠️ | ⚠️ | Simulated via nested calls |
| TodoWrite | ✅ | ✅ | ✅ | |
| LSP | ✅ | ❌ | ❌ | Claude-only |
| Skill | ✅ | ✅ | ✅ | |
| KillShell | ✅ | ✅ | ✅ | |

## Authentication Methods

### Claude
```bash
# Auto-authenticates on first run
claude
# Follow the prompts to authenticate with Anthropic
```

### Gemini
```bash
# 1. Install the official Gemini CLI
npm install -g @google/gemini-cli

# 2. Authenticate with Google
gemini auth login
# Opens browser for OAuth authentication

# 3. Verify authentication
gemini auth status
```

**Note:** Yume does not manage Gemini authentication. Users authenticate separately with the official `gemini` CLI.

### OpenAI/Codex
```bash
# 1. Install the official Codex CLI
npm install -g codex-cli

# 2. Authenticate with OpenAI
codex auth login
# Follow prompts to authenticate

# 3. Verify authentication
codex auth status
```

**Note:** Yume does not manage OpenAI authentication. Users authenticate separately with the official `codex` CLI.

## Rate Limits

| Provider | Requests/min | Tokens/min | Strategy |
|----------|-------------|------------|----------|
| Claude | ~60 | ~100K | Generous |
| Gemini | ~60 | ~1M | Very generous |
| OpenAI Tier 1 | 500 | 30K | Aggressive |
| OpenAI Tier 4+ | 10K | 800K | More headroom |
| Azure OpenAI | Varies | Varies | Per deployment |

## Provider-Specific Considerations

### Claude
- Native session files in `~/.claude/projects/`
- Full MCP support
- Extended thinking with budget control
- Artifact generation

### Gemini
- Massive context (1M tokens)
- Native grounding/search
- Context caching supported
- No native session persistence (yume-cli handles)

### OpenAI
- Aggressive rate limiting (especially Tier 1-2)
- O1/O3 reasoning tokens billed as output
- No prompt caching
- Assistants API optional (not used by yume-cli)

## Updating This Document

When models or pricing change:

1. Update the model registry table
2. Update pricing table
3. Update `src/renderer/config/models.ts` to match
4. Update `src/renderer/config/pricing.ts` (if exists)
5. Run golden transcript tests

**Last Updated:** 2025-01-14

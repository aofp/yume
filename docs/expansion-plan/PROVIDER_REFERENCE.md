# Provider & Model Reference

Single source of truth for providers, models, context limits, and pricing. Update this file when models or pricing change.

> **Last Updated:** 2026-01-31

## Provider Overview

| Provider | CLI | Auth | Installation | Status |
|----------|-----|------|--------------|--------|
| Claude | `claude` | Auto on first run | Bundled | Production |
| Gemini | `yume-cli --provider gemini` | `gemini auth login` | `npm i -g @google/gemini-cli` | 85% |
| OpenAI | `yume-cli --provider openai` | `codex login` | `npm i -g @openai/codex` | 85% |

**Feature Flags (`config/features.ts`):**
- `PROVIDER_GEMINI_AVAILABLE: false`
- `PROVIDER_OPENAI_AVAILABLE: false`

## Model Registry

### Claude (Source: `models.ts`)

| Model ID | Short | Context | Output | Thinking |
|----------|-------|---------|--------|----------|
| claude-sonnet-4-5-20250929 | sonnet | 200K | 8K | Yes |
| claude-opus-4-5-20251101 | opus | 200K | 8K | Yes |

### Gemini (Source: `models.ts`)

| Model ID | Short | Context | Output | Thinking |
|----------|-------|---------|--------|----------|
| gemini-2.5-pro | gemini-pro | 1M | 8K | Yes |
| gemini-2.5-flash | gemini-flash | 1M | 8K | No |

**Extended (yume-cli):** gemini-2.0-flash (1M/8K), gemini-2.0-flash-thinking-exp (32K/8K), gemini-3-flash (1M/65K), gemini-1.5-pro/flash (1M/8K)

### OpenAI (Source: `models.ts`)

| Model ID | Short | Context | Output | Reasoning |
|----------|-------|---------|--------|-----------|
| gpt-5.2-codex | codex | 200K | 100K | xhigh |
| gpt-5.1-codex-mini | codex-mini | 200K | 100K | low |

**Extended (yume-cli):** gpt-4o (128K/16K), gpt-4o-mini (128K/16K), o1 (200K/100K), o1-mini (128K/65K), o3-mini (200K/100K)

## Pricing (per 1M tokens, USD)

| Provider | Model | Input | Output | Notes |
|----------|-------|-------|--------|-------|
| Claude | opus-4.5 | $15 | $75 | Cache: $1.50 read, $18.75 write |
| Claude | sonnet-4.5 | $3 | $15 | Cache: $0.30 read, $3.75 write |
| Gemini | 2.0-flash | $0.10 | $0.40 | No caching |
| Gemini | 1.5-pro | $3.50 | $10.50 | >128K: 2x |
| Gemini | 1.5-flash | $0.075 | $0.30 | >128K: 2x |
| OpenAI | gpt-4o | $2.50 | $10 | |
| OpenAI | gpt-4o-mini | $0.15 | $0.60 | |
| OpenAI | o1 | $15 | $60 | Reasoning = output |
| OpenAI | o1-mini | $3 | $12 | |
| OpenAI | o3-mini | $1.10 | $4.40 | |

## Compaction Thresholds

| Provider | Model Type | Threshold |
|----------|------------|-----------|
| Claude | All | 60% |
| Gemini | Standard (1M) | 80% |
| Gemini | Thinking (32K) | 60% |
| OpenAI | Standard | 60% |
| OpenAI | O1/O3 | 50% |

## Feature Parity

| Feature | Claude | Gemini | OpenAI |
|---------|--------|--------|--------|
| Streaming | Yes | Yes | Yes |
| Tool calls | Yes | Yes | Yes |
| Multi-turn | Yes | Yes | Yes |
| Session resume | Native | Shim | Shim |
| Thinking blocks | Yes | 2.0-thinking | O1/O3 |
| Prompt caching | Yes | Yes | No |
| MCP support | Yes | No | No |
| Image input | Yes | Yes | Yes |
| PDF input | Yes | Yes | No |
| Custom agents | Yes | Yes | Yes |
| Skills | Yes | Yes | Yes |

## Tool Compatibility

**Core Tools (all providers):** Read, Write, Edit, MultiEdit, Glob, Grep, LS, Bash

**Extended Tools:**
| Tool | Claude | Gemini | OpenAI |
|------|--------|--------|--------|
| WebFetch | Yes | Yes | Yes |
| WebSearch | Yes | Yes | Yes |
| NotebookEdit | Yes | Yes | Yes |
| Task | Yes | Partial | Partial |
| LSP | Yes | No | No |

## Authentication

| Provider | Setup |
|----------|-------|
| Claude | `claude` (auto-auth on first run) |
| Gemini | `npm i -g @google/gemini-cli && gemini auth login` |
| OpenAI | `npm i -g @openai/codex && codex login` |

Yume does not manage Gemini/OpenAI auth. Users authenticate via official CLIs.

## Rate Limits

| Provider | Requests/min | Tokens/min |
|----------|-------------|------------|
| Claude | ~60 | ~100K |
| Gemini | ~60 | ~1M |
| OpenAI Tier 1 | 500 | 30K |
| OpenAI Tier 4+ | 10K | 800K |

## Provider Notes

**Claude:** Native sessions in `~/.claude/projects/`, full MCP, extended thinking, artifacts

**Gemini:** 1M context, grounding/search, context caching, no native sessions (yume-cli handles)

**OpenAI:** Aggressive rate limiting (Tier 1-2), O1/O3 reasoning billed as output, no caching

## Maintenance

When models or pricing change:
1. Update tables in this document
2. Update `src/renderer/config/models.ts`
3. Run golden transcript tests

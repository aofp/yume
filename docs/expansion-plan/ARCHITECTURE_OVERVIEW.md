# Multi-Model CLI Architecture Expansion

> **Last Updated:** 2026-01-29
> **Implementation Status:** ~95% complete (macOS ready, Windows/Linux binaries pending)

## Overview

Yume supports multiple AI providers (Claude, Gemini, OpenAI/Codex) through a CLI-first architecture. The underlying CLI interaction is abstracted via adapters and a translation shim.

## Core Philosophy: CLI-First

Yume acts as a GUI layer over **existing CLI tools**:
- **No Direct SDKs:** No `@google/generative-ai` or `openai` libraries in production
- **No API Keys:** Authentication handled by users via respective CLI (`claude`, `gemini auth login`, `codex login`)
- **Binary Integration:** Yume interacts via `stdin`/`stdout`
- **Shim Allowed:** `yume-cli` translates non-Claude CLIs to Claude-compatible stream-json

## Protocol Contract

All providers emit **Claude-compatible stream-json** (line-delimited JSON with `type` fields). See:
- `PROTOCOL_NORMALIZATION.md` - Canonical schema
- `STREAM_JSON_REFERENCE.md` - Message shapes
- `TOOL_SCHEMA_REFERENCE.md` - Tool inputs

## Supported Providers

| Provider | Binary | Protocol | Auth | Install |
|----------|--------|----------|------|---------|
| Claude | `claude` | stream-json native | Auto on first run | bundled |
| Gemini | `yume-cli --provider gemini` | stream-json translated | `gemini auth login` | `npm i -g @google/gemini-cli` |
| OpenAI | `yume-cli --provider openai` | JSONL translated | `codex login` | `npm i -g @openai/codex` |

**CLI Flags:**
- Gemini: `--model`, `--output-format stream-json`, `--yolo` (auto-approve)
- Codex: `exec --json -C <cwd> --full-auto -m <model>` (mini models use `reasoning_effort=low`)

## Model Registry

Model IDs defined in `src/renderer/config/models.ts` - **DO NOT CHANGE without approval**.

| Provider | Model ID | Display | Context |
|----------|----------|---------|---------|
| Claude | claude-sonnet-4-5-20250929 | Sonnet 4.5 | 200K |
| Claude | claude-opus-4-5-20251101 | Opus 4.5 | 200K |
| Gemini | gemini-2.5-pro | Gemini 2.5 Pro | 1M |
| Gemini | gemini-2.5-flash | Gemini 2.5 Flash | 1M |
| OpenAI | gpt-5.2-codex | Codex 5.2 | 200K |
| OpenAI | gpt-5.1-codex-mini | Codex 5.1 Mini | 200K |

## Cost Tracking

**Fallback strategy:**
1. Provider returns `cost_usd` - use directly
2. Provider returns token counts - calculate from pricing table
3. No usage data - estimate (marked in UI)

See `PROVIDER_REFERENCE.md` for current pricing rates.

## Concurrent Sessions

- Each tab spawns one CLI process (Claude or yume-cli)
- Max concurrent: `maxTabs` license limit (99 Pro, 3 Trial)
- Memory per yume-cli: ~100MB
- Cleanup: Process killed on tab close or app exit
- Analytics aggregated by `{provider}:{model}` key

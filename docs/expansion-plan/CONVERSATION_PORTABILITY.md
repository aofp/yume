# Conversation Portability & Mid-Session Model Switching

> **Related Documents:**
> - [UNIVERSAL_SESSION_ARCHITECTURE.md](./UNIVERSAL_SESSION_ARCHITECTURE.md) - Session storage foundation
> - [PROVIDER_REFERENCE.md](./PROVIDER_REFERENCE.md) - Model and feature matrix (single source of truth)
> - [PROTOCOL_NORMALIZATION.md](./PROTOCOL_NORMALIZATION.md) - Stream-JSON protocol contract

## Overview

This document details how Yume enables **mid-conversation model switching** between Claude, Gemini, and OpenAI/Codex. Users can start a conversation with one model and seamlessly continue with another, preserving full context and history.

**Key Insight:** While `YUME_CLI_SPEC.md` states sessions are "NOT portable between providers" (meaning direct session file sharing), this document describes a **translation layer** that enables portability through format conversion.

## Problem Statement

Currently, each provider has its own:
- **Session storage format** (Claude JSONL in `~/.claude/`, yume-cli JSON in `~/.yume/sessions/`)
- **Message structure** (different content block formats)
- **Tool calling conventions** (different ID schemes, input formats)
- **Special features** (Claude thinking, Gemini grounding, O1 reasoning, etc.)

To enable hot-swapping, we need a **Unified Conversation Format (UCF)** that can:
1. Import from any provider's native format
2. Export to any provider's format
3. Handle lossy conversions gracefully
4. Manage context window differences
5. Preserve provider-specific features when returning to original provider

## Architecture

```
┌──────────────────────────────────────────────────────────────────┐
│                         Yume Frontend                            │
│                                                                  │
│  ┌──────────┐   ┌──────────┐   ┌──────────┐   ┌──────────┐      │
│  │ Claude   │   │ Gemini   │   │ OpenAI   │   │ Provider │      │
│  │ Messages │   │ Messages │   │ Messages │   │ Selector │      │
│  └────┬─────┘   └────┬─────┘   └────┬─────┘   └────┬─────┘      │
│       │              │              │              │              │
│       └──────────────┴──────────────┴──────────────┘              │
│                              │                                    │
│                    ┌─────────▼─────────┐                         │
│                    │ Conversation      │                         │
│                    │ Translator        │                         │
│                    │ Service           │                         │
│                    └─────────┬─────────┘                         │
│                              │                                    │
│                    ┌─────────▼─────────┐                         │
│                    │ Unified           │                         │
│                    │ Conversation      │                         │
│                    │ Store             │                         │
│                    └─────────┬─────────┘                         │
│                              │                                    │
└──────────────────────────────┼────────────────────────────────────┘
                               │
              ┌────────────────┼────────────────┐
              │                │                │
    ┌─────────▼─────┐  ┌───────▼───────┐  ┌────▼────────┐
    │ Claude CLI    │  │ yume-cli      │  │ yume-cli    │
    │ (native)      │  │ --provider    │  │ --provider  │
    │               │  │ gemini        │  │ openai      │
    └───────────────┘  └───────────────┘  └─────────────┘
```

## Unified Conversation Format (UCF)

### Schema v1.0

```typescript
interface UnifiedConversation {
  // Metadata
  id: string;                    // Yume session ID
  version: '1.0';
  created: string;               // ISO timestamp
  updated: string;               // ISO timestamp

  // Context
  cwd: string;                   // Working directory
  title?: string;                // Session title

  // Messages in provider-agnostic format
  messages: UnifiedMessage[];

  // Cumulative usage
  usage: {
    totalInputTokens: number;
    totalOutputTokens: number;
    totalCost: number;
    byProvider: Record<ProviderType, ProviderUsage>;
  };

  // Provider-specific state for session resumption
  providerState: {
    claude?: {
      sessionId: string;
      sessionFile: string;       // Path to JSONL
    };
    gemini?: {
      sessionId: string;
    };
    openai?: {
      threadId?: string;
    };
  };

  // Switch history
  switches: ProviderSwitch[];
}

interface UnifiedMessage {
  id: string;
  timestamp: string;

  // Who created this message
  role: 'user' | 'assistant' | 'system' | 'tool_result';
  provider: ProviderType | 'user' | 'system';
  model?: string;

  // Content in normalized format
  content: UnifiedContent[];

  // Tool interactions
  toolCalls?: UnifiedToolCall[];
  toolResults?: UnifiedToolResult[];

  // Usage for this specific message
  usage?: {
    inputTokens: number;
    outputTokens: number;
    cacheReadTokens?: number;
    cacheCreationTokens?: number;
    cost?: number;
  };

  // Provider-specific data (preserved for round-tripping)
  _providerData?: Record<string, unknown>;
}

interface UnifiedContent {
  type: 'text' | 'thinking' | 'code' | 'image' | 'artifact' | 'error';

  // For text/thinking/error
  text?: string;

  // For code
  language?: string;
  code?: string;

  // For images
  mimeType?: string;
  data?: string;           // Base64
  url?: string;            // Or URL

  // For artifacts
  artifactId?: string;
  artifactType?: string;
}

interface UnifiedToolCall {
  id: string;              // Normalized ID (provider-agnostic)
  originalId: string;      // Original provider ID
  name: string;
  input: Record<string, unknown>;
  status: 'pending' | 'completed' | 'error';
}

interface UnifiedToolResult {
  toolCallId: string;
  originalToolCallId: string;
  content: string;
  isError: boolean;
}

interface ProviderSwitch {
  timestamp: string;
  fromProvider: ProviderType;
  toProvider: ProviderType;
  fromModel: string;
  toModel: string;
  messageIndex: number;    // Index in messages array where switch occurred
  reason?: string;         // User-provided reason
  warnings?: string[];     // Any warnings shown to user
}
```

### Storage Location

```
~/.yume/conversations/
├── {session-id}.json          # UCF file
├── {session-id}.meta.json     # Quick-load metadata (title, last used, etc.)
└── backups/
    └── {session-id}.{timestamp}.json
```

## Translation Layer

### Service Interface

```typescript
// src/renderer/services/conversationTranslator.ts

interface ConversationTranslator {
  // Import from provider-specific format to UCF
  importFromClaude(jsonlPath: string): Promise<UnifiedConversation>;
  importFromGemini(sessionData: GeminiSession): Promise<UnifiedConversation>;
  importFromOpenAI(thread: OpenAIThread): Promise<UnifiedConversation>;

  // Export from UCF to provider-specific format
  exportToClaude(conv: UnifiedConversation): ClaudeHistory;
  exportToGemini(conv: UnifiedConversation): GeminiHistory;
  exportToOpenAI(conv: UnifiedConversation): OpenAIHistory;

  // Analyze switch feasibility
  analyzeSwitch(
    conv: UnifiedConversation,
    toProvider: ProviderType,
    toModel: string
  ): SwitchAnalysis;

  // Prepare conversation for new provider
  prepareForSwitch(
    conv: UnifiedConversation,
    toProvider: ProviderType,
    toModel: string,
    options?: SwitchOptions
  ): PreparedConversation;
}

interface SwitchAnalysis {
  canSwitch: boolean;
  warnings: SwitchWarning[];
  requiresSummarization: boolean;
  estimatedTokens: number;
  targetContextLimit: number;
  lossyFeatures: string[];     // Features that won't translate
}

interface SwitchWarning {
  type: 'info' | 'warning' | 'error';
  code: string;
  message: string;
  affectedMessages?: number[]; // Indices of affected messages
}

interface SwitchOptions {
  summarizationStrategy: 'truncate' | 'summarize' | 'hybrid';
  preserveSystemPrompt: boolean;
  includeToolHistory: boolean;
}

interface PreparedConversation {
  history: HistoryMessage[];   // Provider-specific format
  systemPrompt?: string;
  warnings: SwitchWarning[];
  summarized: boolean;
  originalMessageCount: number;
  preservedMessageCount: number;
}
```

### Provider Adapters

#### Claude Adapter

```typescript
// Import from Claude JSONL
function importFromClaude(jsonlPath: string): UnifiedConversation {
  const lines = readFileSync(jsonlPath, 'utf-8').split('\n').filter(Boolean);
  const messages: UnifiedMessage[] = [];

  for (const line of lines) {
    const msg = JSON.parse(line);

    switch (msg.type) {
      case 'user':
        messages.push({
          id: generateId(),
          timestamp: msg.timestamp || new Date().toISOString(),
          role: 'user',
          provider: 'user',
          content: normalizeClaudeContent(msg.message?.content || msg.content),
        });
        break;

      case 'assistant':
        const content: UnifiedContent[] = [];
        const toolCalls: UnifiedToolCall[] = [];

        for (const block of msg.message?.content || []) {
          if (block.type === 'text') {
            content.push({ type: 'text', text: block.text });
          } else if (block.type === 'thinking') {
            content.push({ type: 'thinking', text: block.thinking });
          } else if (block.type === 'tool_use') {
            toolCalls.push({
              id: generateId(),
              originalId: block.id,
              name: block.name,
              input: block.input,
              status: 'completed',
            });
          }
        }

        messages.push({
          id: generateId(),
          timestamp: msg.timestamp || new Date().toISOString(),
          role: 'assistant',
          provider: 'claude',
          model: msg.model,
          content,
          toolCalls: toolCalls.length ? toolCalls : undefined,
        });
        break;

      case 'tool_result':
        // Attach to previous assistant message's tool call
        // ...
        break;
    }
  }

  return { /* ... */ messages };
}

// Export to Claude format
function exportToClaude(conv: UnifiedConversation): ClaudeHistory {
  return conv.messages.map(msg => {
    if (msg.role === 'user') {
      return {
        role: 'user',
        content: msg.content.map(c =>
          c.type === 'text' ? { type: 'text', text: c.text } : c
        ),
      };
    }

    if (msg.role === 'assistant') {
      const content: any[] = [];

      // Add thinking blocks (Claude-specific)
      for (const c of msg.content) {
        if (c.type === 'thinking' && msg.provider === 'claude') {
          content.push({ type: 'thinking', thinking: c.text });
        } else if (c.type === 'text') {
          content.push({ type: 'text', text: c.text });
        }
      }

      // Add tool calls
      for (const tc of msg.toolCalls || []) {
        content.push({
          type: 'tool_use',
          id: tc.originalId || tc.id,
          name: tc.name,
          input: tc.input,
        });
      }

      return { role: 'assistant', content };
    }

    // Handle tool results
    if (msg.role === 'tool_result') {
      return {
        role: 'user',
        content: [{
          type: 'tool_result',
          tool_use_id: msg.toolResults?.[0]?.originalToolCallId,
          content: msg.toolResults?.[0]?.content,
          is_error: msg.toolResults?.[0]?.isError,
        }],
      };
    }
  }).filter(Boolean);
}
```

#### Gemini Adapter

```typescript
// Export to Gemini format
function exportToGemini(conv: UnifiedConversation): GeminiHistory {
  return conv.messages.map(msg => {
    if (msg.role === 'user') {
      return {
        role: 'user',
        parts: msg.content.map(c => ({ text: c.text || '' })),
      };
    }

    if (msg.role === 'assistant') {
      const parts: any[] = [];

      // Text content
      for (const c of msg.content) {
        if (c.type === 'text') {
          parts.push({ text: c.text });
        }
        // Skip thinking blocks - Gemini doesn't support them
        // Could optionally convert to text with prefix
      }

      // Tool calls as functionCall
      for (const tc of msg.toolCalls || []) {
        parts.push({
          functionCall: {
            name: tc.name,
            args: tc.input,
          },
        });
      }

      return { role: 'model', parts };
    }

    if (msg.role === 'tool_result') {
      return {
        role: 'user',
        parts: [{
          functionResponse: {
            name: msg._providerData?.toolName || 'unknown',
            response: { result: msg.toolResults?.[0]?.content },
          },
        }],
      };
    }
  }).filter(Boolean);
}
```

#### OpenAI Adapter

```typescript
// Export to OpenAI format
function exportToOpenAI(conv: UnifiedConversation): OpenAIHistory {
  const messages: any[] = [];

  for (const msg of conv.messages) {
    if (msg.role === 'user') {
      messages.push({
        role: 'user',
        content: msg.content.map(c => c.text).join('\n'),
      });
    }

    if (msg.role === 'assistant') {
      const content = msg.content
        .filter(c => c.type === 'text')
        .map(c => c.text)
        .join('\n');

      const toolCalls = msg.toolCalls?.map(tc => ({
        id: tc.originalId || tc.id,
        type: 'function',
        function: {
          name: tc.name,
          arguments: JSON.stringify(tc.input),
        },
      }));

      messages.push({
        role: 'assistant',
        content: content || null,
        tool_calls: toolCalls?.length ? toolCalls : undefined,
      });
    }

    if (msg.role === 'tool_result') {
      for (const tr of msg.toolResults || []) {
        messages.push({
          role: 'tool',
          tool_call_id: tr.originalToolCallId || tr.toolCallId,
          content: tr.content,
        });
      }
    }
  }

  return messages;
}
```

## Feature Parity Matrix

See [PROVIDER_REFERENCE.md](./PROVIDER_REFERENCE.md) for complete feature matrix.

| Feature | Claude | Gemini | OpenAI | Translation Strategy |
|---------|--------|--------|--------|---------------------|
| Text messages | ✅ | ✅ | ✅ | Direct |
| Tool calling | ✅ | ✅ | ✅ | ID remapping |
| System prompt | Via param | systemInstruction | First message | Adapt per provider |
| Thinking blocks | ✅ | ⚠️ 2.0-thinking | ⚠️ O1/O3 | See Reasoning section |
| Artifacts | ✅ | ❌ | ❌ | Inline as code block |
| Images in input | ✅ | ✅ | ✅ | Direct |
| Images in output | ❌ | ✅ | ✅ | Preserve if available |
| Code execution | Via Bash | ❌ | ✅ | Tool compatibility |
| Grounding/Search | ❌ | ✅ | ✅ (browsing) | Drop or convert |
| Caching | ✅ | ✅ | ❌ | Ignore cache tokens |
| MCP support | ✅ | ❌ | ❌ | Disable MCP tools |
| Context window | 200K | 32K-1M | 128K-200K | Summarize if needed |

## Thinking & Reasoning Block Handling

Different providers have different "thinking" capabilities. This section details how to handle them during provider switches.

### Provider Thinking Capabilities

| Provider | Model | Thinking Type | Format | Controllable |
|----------|-------|---------------|--------|--------------|
| Claude | All | Extended Thinking | `{ type: "thinking", thinking: "..." }` | Budget param |
| Gemini | 2.0-thinking | Thoughts | `{ thoughts: [...] }` in response | ❌ |
| Gemini | Others | ❌ None | - | - |
| OpenAI | O1/O3 | Reasoning | Hidden by default, tokens billed | ❌ |
| OpenAI | GPT-4o | ❌ None | - | - |

### Translation Matrix

| From → To | Claude Thinking | Gemini Thinking | O1 Reasoning |
|-----------|-----------------|-----------------|--------------|
| **Claude** | ✅ Preserve | ⚠️ Convert to text | ⚠️ Convert to text |
| **Gemini 2.0-thinking** | ⚠️ Convert to thinking block | ✅ Preserve | ⚠️ Convert to text |
| **Gemini Standard** | ❌ Drop (no equivalent) | - | ❌ Drop |
| **O1/O3** | ⚠️ Hidden (not exposed in API) | ⚠️ Hidden | ✅ Preserve |
| **GPT-4o** | ❌ Drop (no equivalent) | ❌ Drop | - |

### Implementation

```typescript
// Thinking block translation
interface ThinkingContent {
  type: 'thinking';
  text: string;
  provider: 'claude' | 'gemini' | 'openai';
  model?: string;
  hidden?: boolean;  // For O1/O3 where reasoning is billed but not shown
}

function translateThinking(
  content: ThinkingContent,
  toProvider: ProviderType,
  toModel: string
): TranslationResult {
  const targetSupportsThinking = checkThinkingSupport(toProvider, toModel);

  if (targetSupportsThinking) {
    // Target supports thinking - preserve as thinking block
    return {
      type: 'preserve',
      content: { type: 'thinking', text: content.text },
    };
  }

  // Target doesn't support thinking - convert options
  const strategy = getUserPreference('thinkingTranslation'); // 'drop' | 'convert' | 'ask'

  switch (strategy) {
    case 'drop':
      return { type: 'drop', warning: 'Thinking blocks dropped (not supported)' };

    case 'convert':
      return {
        type: 'convert',
        content: {
          type: 'text',
          text: `[Previous reasoning]\n${content.text}\n[End reasoning]`,
        },
        warning: 'Thinking blocks converted to text',
      };

    case 'ask':
    default:
      return {
        type: 'prompt_user',
        options: ['Drop thinking blocks', 'Convert to visible text'],
      };
  }
}

function checkThinkingSupport(provider: ProviderType, model: string): boolean {
  if (provider === 'claude') return true;
  if (provider === 'gemini' && model.includes('thinking')) return true;
  if (provider === 'openai' && (model.startsWith('o1') || model.startsWith('o3'))) {
    // O1/O3 have reasoning but it's hidden - treat as partial support
    return false; // Can't inject thinking into O1/O3
  }
  return false;
}
```

### User Warning Examples

**Claude → GPT-4o:**
```
⚠️ Thinking blocks will be affected
   • 5 thinking blocks found in conversation
   • GPT-4o does not support thinking/reasoning
   • Options:
     ○ Drop: Remove thinking blocks (recommended)
     ○ Convert: Show as "[Previous reasoning]..." text
```

**Claude → O1:**
```
ℹ️ Reasoning model selected
   • O1 has its own internal reasoning (hidden from output)
   • 5 Claude thinking blocks will be dropped
   • O1 will generate new reasoning for its responses
```

**Gemini 2.0-thinking → Claude:**
```
✓ Thinking blocks compatible
   • 3 Gemini thought blocks will convert to Claude thinking format
   • Full reasoning preserved
```

## Artifact Handling

Claude artifacts are self-contained content blocks (code, documents, etc.) that don't exist in other providers.

### Translation Strategy

```typescript
interface ArtifactContent {
  type: 'artifact';
  artifactId: string;
  artifactType: 'code' | 'document' | 'react' | 'svg' | 'mermaid';
  title?: string;
  content: string;
  language?: string;
}

function translateArtifact(
  artifact: ArtifactContent,
  toProvider: ProviderType
): UnifiedContent[] {
  // Always inline artifacts when switching away from Claude
  // They become regular content blocks

  switch (artifact.artifactType) {
    case 'code':
    case 'react':
      return [{
        type: 'code',
        language: artifact.language || 'typescript',
        code: artifact.content,
        text: artifact.title ? `// ${artifact.title}\n${artifact.content}` : artifact.content,
      }];

    case 'svg':
    case 'mermaid':
      return [{
        type: 'code',
        language: artifact.artifactType,
        code: artifact.content,
      }];

    case 'document':
      return [{
        type: 'text',
        text: artifact.content,
      }];

    default:
      return [{
        type: 'text',
        text: `[Artifact: ${artifact.title || 'Untitled'}]\n${artifact.content}`,
      }];
  }
}
```

### Returning to Claude

When switching back to Claude, previously inlined artifacts remain as regular content (no automatic re-artifacting). The model may choose to create new artifacts.

## MCP (Model Context Protocol) Handling

MCP is Claude-only. When switching away from Claude:

1. **MCP tools become unavailable** - remove from tool list
2. **Previous MCP tool results** - preserve as historical context
3. **Active MCP connections** - disconnect gracefully

```typescript
function handleMCPOnSwitch(
  conv: UnifiedConversation,
  toProvider: ProviderType
): { warnings: string[]; actions: string[] } {
  if (toProvider === 'claude') {
    return { warnings: [], actions: [] };
  }

  const mcpToolCalls = conv.messages.flatMap(m =>
    (m.toolCalls || []).filter(tc => isMCPTool(tc.name))
  );

  if (mcpToolCalls.length === 0) {
    return { warnings: [], actions: [] };
  }

  return {
    warnings: [
      `${mcpToolCalls.length} MCP tool calls in history`,
      'MCP tools not available with ' + toProvider,
    ],
    actions: [
      'MCP tool results preserved as context',
      'Future MCP tool requests will fail',
    ],
  };
}

function isMCPTool(toolName: string): boolean {
  // MCP tools typically have namespaced names
  return toolName.includes(':') || MCP_TOOL_REGISTRY.has(toolName);
}
```

## Degradation Warnings Matrix

Complete list of warnings shown to users based on switch direction:

### Claude → Gemini

| Feature | Warning Level | Message |
|---------|---------------|---------|
| Thinking blocks | ⚠️ Warning | "X thinking blocks will be dropped/converted" |
| Artifacts | ⚠️ Warning | "X artifacts will be inlined as code/text" |
| MCP tools | ⚠️ Warning | "MCP tools not available" |
| Caching | ℹ️ Info | "Prompt cache will reset" |
| Context | ✓ OK | "Context fits (45K → 1M)" |

### Claude → OpenAI (GPT-4o)

| Feature | Warning Level | Message |
|---------|---------------|---------|
| Thinking blocks | ⚠️ Warning | "X thinking blocks will be dropped" |
| Artifacts | ⚠️ Warning | "X artifacts will be inlined" |
| MCP tools | ⚠️ Warning | "MCP tools not available" |
| PDF input | ⚠️ Warning | "PDF attachments not supported" |
| Context | ⚠️ Warning | "Context may need summarization (150K → 128K)" |

### Claude → OpenAI (O1/O3)

| Feature | Warning Level | Message |
|---------|---------------|---------|
| Thinking blocks | ℹ️ Info | "Claude thinking replaced by O1 reasoning" |
| Artifacts | ⚠️ Warning | "X artifacts will be inlined" |
| Output length | ℹ️ Info | "O1 can output up to 100K tokens" |
| Tool calls | ⚠️ Warning | "O1 tool call format differs" |

### Gemini → Claude

| Feature | Warning Level | Message |
|---------|---------------|---------|
| Grounding results | ⚠️ Warning | "Web grounding results preserved as context only" |
| Context | ⚠️ Warning | "Context may need summarization (800K → 200K)" |
| Images in output | ℹ️ Info | "Generated images preserved as URLs" |

### OpenAI → Claude

| Feature | Warning Level | Message |
|---------|---------------|---------|
| DALL-E images | ℹ️ Info | "Generated images preserved as URLs" |
| Browsing results | ⚠️ Warning | "Web browsing results preserved as context only" |

## Context Management

### When Switching to Smaller Context

```typescript
async function handleContextReduction(
  conv: UnifiedConversation,
  targetLimit: number
): Promise<UnifiedMessage[]> {
  const currentTokens = estimateTokens(conv.messages);

  // Fits comfortably (80% threshold)
  if (currentTokens <= targetLimit * 0.8) {
    return conv.messages;
  }

  // Strategy 1: Keep recent messages, summarize old
  const targetRecent = Math.floor(targetLimit * 0.6);
  const recentMessages = keepRecentMessages(conv.messages, targetRecent);
  const oldMessages = conv.messages.slice(0, -recentMessages.length);

  // Generate summary of older messages
  const summary = await generateConversationSummary(oldMessages);

  // Create summary message
  const summaryMessage: UnifiedMessage = {
    id: generateId(),
    timestamp: new Date().toISOString(),
    role: 'system',
    provider: 'system',
    content: [{
      type: 'text',
      text: `[Previous conversation summary - ${oldMessages.length} messages]\n\n${summary}`,
    }],
  };

  return [summaryMessage, ...recentMessages];
}

async function generateConversationSummary(messages: UnifiedMessage[]): Promise<string> {
  // Use current provider to generate summary
  // Focus on: key decisions, file changes, important context

  const prompt = `Summarize this conversation for context continuity. Focus on:
- Key decisions made
- Files created/modified
- Important technical context
- Unfinished tasks

Keep it concise but preserve critical information.`;

  // Call appropriate summarization endpoint
  return await summarize(messages, prompt);
}
```

### Token Estimation

```typescript
// Rough token estimation (provider-agnostic)
function estimateTokens(messages: UnifiedMessage[]): number {
  let total = 0;

  for (const msg of messages) {
    for (const content of msg.content) {
      if (content.text) {
        // ~4 chars per token average
        total += Math.ceil(content.text.length / 4);
      }
      if (content.code) {
        total += Math.ceil(content.code.length / 4);
      }
    }

    // Tool calls add overhead
    for (const tc of msg.toolCalls || []) {
      total += 50; // Base overhead
      total += Math.ceil(JSON.stringify(tc.input).length / 4);
    }

    for (const tr of msg.toolResults || []) {
      total += Math.ceil(tr.content.length / 4);
    }
  }

  return total;
}
```

## Hot-Swap Flow

### User-Initiated Switch

```
1. User clicks model selector while in conversation
2. User selects model from different provider (e.g., Claude → Gemini)
3. System calls analyzeSwitch()
4. If warnings exist, show SwitchWarningModal
5. User confirms switch
6. System calls prepareForSwitch()
7. System spawns new provider session with translated history
8. System updates providerState and records switch in UCF
9. Conversation continues with new provider
10. Visual indicator shows provider change
```

### Switch Warning Modal

```
┌───────────────────────────────────────────────────────────────┐
│ Switch to Gemini 3 Pro?                                       │
├───────────────────────────────────────────────────────────────┤
│                                                               │
│ This conversation will continue with Gemini. Here's what     │
│ to expect:                                                    │
│                                                               │
│ ℹ️  Context                                                   │
│    45,230 tokens → fits in 1M context ✓                      │
│                                                               │
│ ⚠️  Feature differences                                       │
│    • 3 thinking blocks will be hidden from Gemini            │
│    • Claude-specific formatting may differ                   │
│                                                               │
│ ✓  Preserved                                                  │
│    • All 27 messages                                          │
│    • 8 tool call results                                      │
│    • File edit history                                        │
│                                                               │
│ ┌─────────────────────────────────────────────────────────┐  │
│ │ ☐ Summarize old context to reduce tokens               │  │
│ │ ☐ Include tool call history                             │  │
│ │ ☐ Preserve system prompt                                │  │
│ └─────────────────────────────────────────────────────────┘  │
│                                                               │
│              [Cancel]              [Switch to Gemini]         │
└───────────────────────────────────────────────────────────────┘
```

### Visual Indicators

In the chat view, provider switches are shown:

```
┌─────────────────────────────────────────────────────────────────┐
│ [Claude badge] How can I help you today?                       │
├─────────────────────────────────────────────────────────────────┤
│ [User] Please refactor the auth module                         │
├─────────────────────────────────────────────────────────────────┤
│ [Claude badge] I'll help refactor the auth module...           │
│ [tool: Edit src/auth.ts]                                       │
├─────────────────────────────────────────────────────────────────┤
│                                                                 │
│           ─── Switched to Gemini 3 Pro ───                     │
│                                                                 │
├─────────────────────────────────────────────────────────────────┤
│ [Gemini badge] Continuing from where we left off...            │
└─────────────────────────────────────────────────────────────────┘
```

## Implementation Phases

### Phase A: Unified Storage (Foundation)
- [ ] Define UCF TypeScript interfaces
- [ ] Create `conversationStore.ts` service
- [ ] Implement UCF file I/O
- [ ] Add migration from Claude JSONL to UCF
- [ ] Background sync: UCF ↔ provider sessions

### Phase B: Translation Layer
- [ ] Create `conversationTranslator.ts` service
- [ ] Implement Claude adapter (import/export)
- [ ] Implement Gemini adapter (import/export)
- [ ] Implement OpenAI adapter (import/export)
- [ ] Add token estimation utilities
- [ ] Add context summarization logic

### Phase C: Switch Analysis
- [ ] Implement `analyzeSwitch()` function
- [ ] Feature parity detection
- [ ] Context window validation
- [ ] Warning generation
- [ ] Lossy conversion detection

### Phase D: Hot-Swap UI
- [ ] Enhance ModelSelector for cross-provider switching
- [ ] Create SwitchWarningModal component
- [ ] Add provider badges to messages
- [ ] Add visual switch dividers
- [ ] Update session metadata display

### Phase E: Integration
- [ ] Wire translator to tauriClaudeClient
- [ ] Update claudeCodeStore for multi-provider sessions
- [ ] Handle provider session lifecycle
- [ ] Analytics updates for multi-provider tracking
- [ ] Testing across all provider combinations

## Edge Cases

### 1. Tool Call ID Conflicts
**Problem:** Different providers use different ID formats.
**Solution:**
- Store both `id` (normalized) and `originalId` (provider-specific)
- Regenerate IDs when switching to ensure uniqueness
- Maintain mapping table for tool result correlation

### 2. Incomplete Tool Calls
**Problem:** User switches mid-tool-execution.
**Solution:**
- Complete pending tool calls before switch
- Or mark them as abandoned and notify user
- New provider starts with clean tool state

### 3. Provider-Specific Features Used
**Problem:** Claude thinking blocks don't exist in Gemini.
**Solution:**
- Option A: Drop silently (default for thinking)
- Option B: Convert to text with prefix "[Thinking] ..."
- Option C: Warn user and let them choose

### 4. Authentication State
**Problem:** Target provider not authenticated.
**Solution:**
- Check auth before showing switch option
- Guide user through auth flow
- Fall back gracefully if auth fails mid-switch

### 5. Rate Limits
**Problem:** New provider rate-limited immediately.
**Solution:**
- Preserve conversation state on UCF
- Allow retry without re-translation
- Show estimated wait time

## API Changes

### New Tauri Commands

```rust
// src-tauri/src/commands/conversation.rs

#[tauri::command]
async fn save_unified_conversation(
    session_id: String,
    conversation: UnifiedConversation,
) -> Result<(), String>

#[tauri::command]
async fn load_unified_conversation(
    session_id: String,
) -> Result<Option<UnifiedConversation>, String>

#[tauri::command]
async fn import_claude_session(
    jsonl_path: String,
) -> Result<UnifiedConversation, String>

#[tauri::command]
async fn prepare_provider_switch(
    session_id: String,
    to_provider: String,
    to_model: String,
    options: SwitchOptions,
) -> Result<PreparedConversation, String>
```

### New Frontend Services

```typescript
// src/renderer/services/conversationStore.ts
export const conversationStore = {
  save: (sessionId: string, conv: UnifiedConversation) => Promise<void>,
  load: (sessionId: string) => Promise<UnifiedConversation | null>,
  importFromClaude: (jsonlPath: string) => Promise<UnifiedConversation>,
  sync: (sessionId: string) => Promise<void>,
};

// src/renderer/services/conversationTranslator.ts
export const conversationTranslator = {
  analyzeSwitch: (conv, toProvider, toModel) => SwitchAnalysis,
  prepareForSwitch: (conv, toProvider, toModel, options) => PreparedConversation,
  exportTo: (conv, provider) => ProviderHistory,
  importFrom: (data, provider) => UnifiedConversation,
};
```

## Testing Strategy

### Unit Tests
- UCF schema validation
- Import/export round-trip for each provider
- Token estimation accuracy
- Context summarization quality

### Integration Tests
- Full switch flow: Claude → Gemini → OpenAI → Claude
- Context reduction scenarios
- Tool call preservation
- Error handling (auth failures, rate limits)

### Manual Testing Scenarios
1. Simple text conversation switch
2. Conversation with multiple tool calls
3. Large context requiring summarization
4. Switch with thinking blocks
5. Switch mid-tool-execution
6. Rapid provider switching
7. Network failure during switch

## Success Metrics

1. **Conversion accuracy**: 95%+ messages correctly translated
2. **Context preservation**: Key information retained after switch
3. **User experience**: < 3s switch time for typical conversations
4. **Error rate**: < 1% failed switches due to translation issues

## Dependencies

- Phase 2 of expansion roadmap (yume-cli foundation)
- Provider authentication status
- Token estimation utilities
- Summarization capability (can use current provider)

## Risks & Mitigations

| Risk | Impact | Mitigation |
|------|--------|------------|
| Provider API changes | High | Version adapters, test regularly |
| Context loss on summarization | Medium | Give user control, allow rollback |
| Tool incompatibility | Medium | Validate tools before switch, warn user |
| Performance on large conversations | Low | Async translation, progress indicator |
| Data loss on failed switch | High | Atomic operations, backup before switch |

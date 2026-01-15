/**
 * Conversation Translator Service
 *
 * Handles translation between UCF (Unified Conversation Format) and
 * provider-specific formats (Claude, Gemini, OpenAI).
 *
 * Key responsibilities:
 * - Import from provider-specific formats to UCF
 * - Export from UCF to provider-specific formats
 * - Analyze switch feasibility
 * - Prepare conversations for provider switches
 * - Handle lossy conversions gracefully
 */

import type {
  UnifiedConversation,
  UnifiedMessage,
  UnifiedContent,
  UnifiedToolCall,
  UnifiedToolResult,
  ProviderType,
  ClaudeHistory,
  ClaudeHistoryMessage,
  ClaudeContentBlock,
  GeminiHistory,
  GeminiHistoryMessage,
  GeminiPart,
  OpenAIHistory,
  OpenAIHistoryMessage,
  SwitchAnalysis,
  SwitchWarning,
  SwitchOptions,
  PreparedConversation,
  ProviderHistory,
  TranslationType,
  TranslationResult,
  UnifiedThinkingContent,
  UnifiedArtifactContent,
  TokenEstimate,
  MessageRole,
} from '../types/ucf';

import {
  UCF_VERSION,
  DEFAULT_SWITCH_OPTIONS,
  MCP_TOOL_PREFIXES,
  CORE_TOOLS,
  CLAUDE_ONLY_TOOLS,
} from '../types/ucf';

import { ALL_MODELS, getModelById, type ModelDefinition } from '../config/models';
import { invoke } from '@tauri-apps/api/core';

// =============================================================================
// Helper Functions
// =============================================================================

/**
 * Generate unique ID for messages and tool calls
 */
function generateId(): string {
  return `${Date.now()}-${Math.random().toString(36).substring(2, 11)}`;
}

/**
 * Estimate tokens for messages (rough approximation)
 * Uses ~4 characters per token average
 */
function estimateTokens(messages: UnifiedMessage[]): number {
  let total = 0;

  for (const msg of messages) {
    // Content tokens
    for (const content of msg.content) {
      if ('text' in content && content.text) {
        total += Math.ceil(content.text.length / 4);
      }
      if ('code' in content && content.code) {
        total += Math.ceil(content.code.length / 4);
      }
      if ('content' in content && typeof content.content === 'string') {
        total += Math.ceil(content.content.length / 4);
      }
    }

    // Tool call overhead
    for (const tc of msg.toolCalls || []) {
      total += 50; // Base overhead
      total += Math.ceil(JSON.stringify(tc.input).length / 4);
    }

    // Tool result overhead
    for (const tr of msg.toolResults || []) {
      total += Math.ceil(tr.content.length / 4);
    }
  }

  return total;
}

/**
 * Get token estimate breakdown by role
 */
function getTokenEstimate(messages: UnifiedMessage[]): TokenEstimate {
  const byRole = {
    user: 0,
    assistant: 0,
    system: 0,
    tool: 0,
  };

  for (const msg of messages) {
    const msgTokens = estimateTokens([msg]);
    if (msg.role === 'user') byRole.user += msgTokens;
    else if (msg.role === 'assistant') byRole.assistant += msgTokens;
    else if (msg.role === 'system') byRole.system += msgTokens;
    else if (msg.role === 'tool_result') byRole.tool += msgTokens;
  }

  return {
    total: Object.values(byRole).reduce((a, b) => a + b, 0),
    byRole,
  };
}

/**
 * Check if a model supports thinking/reasoning blocks
 */
function checkThinkingSupport(provider: ProviderType, model: string): boolean {
  // Claude: All models support thinking
  if (provider === 'claude') return true;

  // Gemini: Only 2.0-thinking model
  if (provider === 'gemini' && model.includes('thinking')) return true;

  // OpenAI: O1/O3 have reasoning but it's hidden (can't inject)
  if (provider === 'openai' && (model.startsWith('o1') || model.startsWith('o3'))) {
    return false; // Can't inject thinking into O1/O3
  }

  return false;
}

/**
 * Check if a tool is an MCP tool
 * MCP tools typically have namespaced names (e.g., "server:tool" or "mcp_tool")
 */
function isMCPTool(toolName: string): boolean {
  return (
    toolName.includes(':') ||
    toolName.startsWith('mcp_') ||
    MCP_TOOL_PREFIXES.some((prefix) => toolName.startsWith(prefix))
  );
}

/**
 * Translate thinking blocks based on target provider/model
 */
function translateThinking(
  content: UnifiedThinkingContent,
  toProvider: ProviderType,
  toModel: string,
  strategy: 'drop' | 'convert' | 'ask' = 'drop'
): TranslationResult {
  const targetSupportsThinking = checkThinkingSupport(toProvider, toModel);

  if (targetSupportsThinking) {
    // Target supports thinking - preserve as thinking block
    return {
      type: 'preserve',
      content: {
        type: 'thinking',
        text: content.text,
        provider: toProvider,
        model: toModel,
      } as UnifiedThinkingContent,
    };
  }

  // Target doesn't support thinking - apply strategy
  switch (strategy) {
    case 'drop':
      return {
        type: 'drop',
        warning: 'Thinking blocks dropped (not supported by target model)',
      };

    case 'convert':
      return {
        type: 'convert',
        content: {
          type: 'text',
          text: `[Previous reasoning]\n${content.text}\n[End reasoning]`,
        },
        warning: 'Thinking blocks converted to visible text',
      };

    case 'ask':
      return {
        type: 'prompt_user',
        options: ['Drop thinking blocks', 'Convert to visible text'],
      };

    default:
      return {
        type: 'drop',
        warning: 'Thinking blocks dropped (not supported)',
      };
  }
}

/**
 * Translate artifact blocks for non-Claude providers
 * Artifacts are inlined as code or text blocks
 */
function translateArtifact(
  artifact: UnifiedArtifactContent,
  toProvider: ProviderType
): UnifiedContent[] {
  // Claude supports artifacts natively
  if (toProvider === 'claude') {
    return [artifact];
  }

  // For other providers, inline as appropriate content type
  switch (artifact.artifactType) {
    case 'code':
    case 'react':
      return [
        {
          type: 'code',
          language: artifact.language || 'typescript',
          code: artifact.content,
          filename: artifact.title,
        },
      ];

    case 'svg':
    case 'mermaid':
      return [
        {
          type: 'code',
          language: artifact.artifactType,
          code: artifact.content,
        },
      ];

    case 'document':
    case 'html':
      return [
        {
          type: 'text',
          text: artifact.title
            ? `[${artifact.title}]\n${artifact.content}`
            : artifact.content,
        },
      ];

    default:
      return [
        {
          type: 'text',
          text: `[Artifact: ${artifact.title || 'Untitled'}]\n${artifact.content}`,
        },
      ];
  }
}

// =============================================================================
// Claude Adapter
// =============================================================================

/**
 * Import conversation from Claude JSONL format
 */
async function importFromClaude(jsonlPath: string): Promise<UnifiedConversation> {
  // Read JSONL file
  const content = await invoke<string>('read_file_content', { path: jsonlPath });
  const lines = content.split('\n').filter((line) => line.trim());

  const messages: UnifiedMessage[] = [];
  let totalInputTokens = 0;
  let totalOutputTokens = 0;
  let totalCacheReadTokens = 0;
  let totalCacheCreationTokens = 0;
  let totalCost = 0;

  for (const line of lines) {
    try {
      const msg = JSON.parse(line);

      switch (msg.type) {
        case 'user': {
          const content: UnifiedContent[] = [];
          const msgContent = msg.message?.content || msg.content || [];

          for (const block of msgContent) {
            if (block.type === 'text') {
              content.push({ type: 'text', text: block.text });
            } else if (block.type === 'image') {
              content.push({
                type: 'image',
                mimeType: block.source?.media_type || 'image/jpeg',
                data: block.source?.data,
                url: block.source?.url,
              });
            }
          }

          messages.push({
            id: generateId(),
            timestamp: msg.timestamp || new Date().toISOString(),
            role: 'user',
            provider: 'user',
            content,
            _providerData: msg,
          });
          break;
        }

        case 'assistant': {
          const content: UnifiedContent[] = [];
          const toolCalls: UnifiedToolCall[] = [];
          const msgContent = msg.message?.content || [];

          for (const block of msgContent) {
            if (block.type === 'text') {
              content.push({ type: 'text', text: block.text });
            } else if (block.type === 'thinking') {
              content.push({
                type: 'thinking',
                text: block.thinking,
                provider: 'claude',
                model: msg.model,
              } as UnifiedThinkingContent);
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

          // Extract usage
          const usage = msg.message?.usage || msg.usage;
          if (usage) {
            totalInputTokens += usage.input_tokens || 0;
            totalOutputTokens += usage.output_tokens || 0;
            totalCacheReadTokens += usage.cache_read_input_tokens || 0;
            totalCacheCreationTokens += usage.cache_creation_input_tokens || 0;
          }

          messages.push({
            id: generateId(),
            timestamp: msg.timestamp || new Date().toISOString(),
            role: 'assistant',
            provider: 'claude',
            model: msg.model,
            content,
            toolCalls: toolCalls.length ? toolCalls : undefined,
            usage: usage
              ? {
                  inputTokens: usage.input_tokens || 0,
                  outputTokens: usage.output_tokens || 0,
                  cacheReadTokens: usage.cache_read_input_tokens,
                  cacheCreationTokens: usage.cache_creation_input_tokens,
                  cost: usage.cost,
                }
              : undefined,
            _providerData: msg,
          });

          if (usage?.cost) totalCost += usage.cost;
          break;
        }

        case 'result': {
          // Result messages contain usage info
          const usage = msg.usage;
          if (usage) {
            totalInputTokens += usage.input_tokens || 0;
            totalOutputTokens += usage.output_tokens || 0;
            totalCacheReadTokens += usage.cache_read_input_tokens || 0;
            totalCacheCreationTokens += usage.cache_creation_input_tokens || 0;
            if (usage.cost) totalCost += usage.cost;
          }
          break;
        }

        case 'tool_result': {
          // Attach tool results to the previous assistant message
          const lastMsg = messages[messages.length - 1];
          if (lastMsg && lastMsg.role === 'assistant') {
            if (!lastMsg.toolResults) lastMsg.toolResults = [];
            lastMsg.toolResults.push({
              toolCallId: generateId(),
              originalToolCallId: msg.tool_use_id || '',
              name: msg.name || 'unknown',
              content: msg.content || '',
              isError: msg.is_error || false,
            });
          }
          break;
        }
      }
    } catch (error) {
      console.warn('Failed to parse JSONL line:', error);
    }
  }

  // Extract session info from file path
  const sessionId = jsonlPath.split('/').pop()?.replace('.jsonl', '') || generateId();
  const cwd = ''; // Will be set by store when loading

  return {
    id: sessionId,
    version: UCF_VERSION,
    created: messages[0]?.timestamp || new Date().toISOString(),
    updated: messages[messages.length - 1]?.timestamp || new Date().toISOString(),
    cwd,
    currentProvider: 'claude',
    currentModel: messages.find((m) => m.model)?.model || 'claude-sonnet-4-5-20250929',
    messages,
    usage: {
      totalInputTokens,
      totalOutputTokens,
      totalCacheReadTokens,
      totalCacheCreationTokens,
      totalCost,
      byProvider: {
        claude: {
          inputTokens: totalInputTokens,
          outputTokens: totalOutputTokens,
          cacheReadTokens: totalCacheReadTokens,
          cacheCreationTokens: totalCacheCreationTokens,
          cost: totalCost,
        },
      },
    },
    providerState: {
      claude: {
        sessionId,
        sessionFile: jsonlPath,
        lastSyncedAt: new Date().toISOString(),
      },
    },
    switches: [],
  };
}


/**
 * Export conversation to Claude history format
 */
function exportToClaude(conv: UnifiedConversation): ClaudeHistory {
  const history: ClaudeHistory = [];

  for (const msg of conv.messages) {
    if (msg.role === 'user') {
      const content: ClaudeContentBlock[] = [];

      for (const c of msg.content) {
        if (c.type === 'text') {
          content.push({ type: 'text', text: c.text || '' });
        } else if (c.type === 'image') {
          content.push({
            type: 'image',
            source: {
              type: 'base64',
              media_type: c.mimeType || 'image/jpeg',
              data: c.data || '',
            },
          });
        }
      }

      history.push({ role: 'user', content });
    } else if (msg.role === 'assistant') {
      const content: ClaudeContentBlock[] = [];

      // Add thinking blocks (Claude-specific)
      for (const c of msg.content) {
        if (c.type === 'thinking') {
          // Only preserve thinking if it was originally from Claude
          if (c.provider === 'claude' || !c.provider) {
            content.push({ type: 'thinking', thinking: c.text || '' });
          }
        } else if (c.type === 'text') {
          content.push({ type: 'text', text: c.text || '' });
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

      history.push({ role: 'assistant', content });

      // Add tool results as user messages
      if (msg.toolResults && msg.toolResults.length > 0) {
        const toolResultContent: ClaudeContentBlock[] = msg.toolResults.map((tr) => ({
          type: 'tool_result',
          tool_use_id: tr.originalToolCallId || tr.toolCallId,
          content: tr.content,
          is_error: tr.isError,
        }));

        history.push({ role: 'user', content: toolResultContent });
      }
    } else if (msg.role === 'tool_result' && msg.toolResults) {
      // Standalone tool result messages
      const content: ClaudeContentBlock[] = msg.toolResults.map((tr) => ({
        type: 'tool_result',
        tool_use_id: tr.originalToolCallId || tr.toolCallId,
        content: tr.content,
        is_error: tr.isError,
      }));

      history.push({ role: 'user', content });
    }
  }

  return history;
}

// =============================================================================
// Gemini Adapter
// =============================================================================

/**
 * Export conversation to Gemini history format
 */
function exportToGemini(conv: UnifiedConversation): GeminiHistory {
  const history: GeminiHistory = [];

  for (const msg of conv.messages) {
    if (msg.role === 'user') {
      const parts: GeminiPart[] = [];

      for (const c of msg.content) {
        if (c.type === 'text') {
          parts.push({ text: c.text || '' });
        } else if (c.type === 'image' && c.data) {
          parts.push({
            inlineData: {
              mimeType: c.mimeType || 'image/jpeg',
              data: c.data,
            },
          });
        }
      }

      if (parts.length > 0) {
        history.push({ role: 'user', parts });
      }
    } else if (msg.role === 'assistant') {
      const parts: GeminiPart[] = [];

      // Text content (skip thinking blocks for non-thinking models)
      for (const c of msg.content) {
        if (c.type === 'text') {
          parts.push({ text: c.text || '' });
        } else if (c.type === 'thinking' && conv.currentModel.includes('thinking')) {
          // Convert thinking to text for Gemini thinking models
          parts.push({ text: `[Reasoning]\n${c.text}\n[End Reasoning]` });
        }
        // Skip other content types
      }

      // Tool calls as functionCall
      for (const tc of msg.toolCalls || []) {
        // Skip MCP tools (Gemini doesn't support them)
        if (!isMCPTool(tc.name)) {
          parts.push({
            functionCall: {
              name: tc.name,
              args: tc.input,
            },
          });
        }
      }

      if (parts.length > 0) {
        history.push({ role: 'model', parts });
      }

      // Add tool results as user messages
      if (msg.toolResults && msg.toolResults.length > 0) {
        const toolParts: GeminiPart[] = msg.toolResults
          .filter((tr) => !isMCPTool(tr.name))
          .map((tr) => ({
            functionResponse: {
              name: tr.name,
              response: { result: tr.content },
            },
          }));

        if (toolParts.length > 0) {
          history.push({ role: 'user', parts: toolParts });
        }
      }
    } else if (msg.role === 'tool_result' && msg.toolResults) {
      // Standalone tool result messages
      const parts: GeminiPart[] = msg.toolResults
        .filter((tr) => !isMCPTool(tr.name))
        .map((tr) => ({
          functionResponse: {
            name: tr.name,
            response: { result: tr.content },
          },
        }));

      if (parts.length > 0) {
        history.push({ role: 'user', parts });
      }
    }
  }

  return history;
}

// =============================================================================
// OpenAI Adapter
// =============================================================================

/**
 * Export conversation to OpenAI history format
 */
function exportToOpenAI(conv: UnifiedConversation): OpenAIHistory {
  const history: OpenAIHistory = [];

  for (const msg of conv.messages) {
    if (msg.role === 'user') {
      const content = msg.content
        .filter((c) => c.type === 'text')
        .map((c) => c.text)
        .join('\n');

      if (content) {
        history.push({
          role: 'user',
          content,
        });
      }
    } else if (msg.role === 'assistant') {
      const content = msg.content
        .filter((c) => c.type === 'text')
        .map((c) => c.text)
        .join('\n');

      const toolCalls = msg.toolCalls
        ?.filter((tc) => !isMCPTool(tc.name))
        .map((tc) => ({
          id: tc.originalId || tc.id,
          type: 'function' as const,
          function: {
            name: tc.name,
            arguments: JSON.stringify(tc.input),
          },
        }));

      history.push({
        role: 'assistant',
        content: content || null,
        tool_calls: toolCalls && toolCalls.length > 0 ? toolCalls : undefined,
      });

      // Add tool results as separate tool messages
      if (msg.toolResults && msg.toolResults.length > 0) {
        for (const tr of msg.toolResults) {
          if (!isMCPTool(tr.name)) {
            history.push({
              role: 'tool',
              tool_call_id: tr.originalToolCallId || tr.toolCallId,
              content: tr.content,
            });
          }
        }
      }
    } else if (msg.role === 'tool_result' && msg.toolResults) {
      // Standalone tool result messages
      for (const tr of msg.toolResults) {
        if (!isMCPTool(tr.name)) {
          history.push({
            role: 'tool',
            tool_call_id: tr.originalToolCallId || tr.toolCallId,
            content: tr.content,
          });
        }
      }
    }
  }

  return history;
}

// =============================================================================
// Switch Analysis
// =============================================================================

/**
 * Analyze feasibility of switching providers
 */
function analyzeSwitch(
  conv: UnifiedConversation,
  toProvider: ProviderType,
  toModel: string
): SwitchAnalysis {
  const warnings: SwitchWarning[] = [];
  const lossyFeatures: string[] = [];

  // Get target model info
  const targetModel = getModelById(toModel);
  const targetContextLimit = targetModel?.contextWindow || 128000;

  // Estimate current token usage
  const estimatedTokens = estimateTokens(conv.messages);
  const requiresSummarization = estimatedTokens > targetContextLimit * 0.8;

  // Count special features
  let thinkingBlockCount = 0;
  let artifactCount = 0;
  let mcpToolCount = 0;

  for (const msg of conv.messages) {
    for (const c of msg.content) {
      if (c.type === 'thinking') thinkingBlockCount++;
      if (c.type === 'artifact') artifactCount++;
    }

    for (const tc of msg.toolCalls || []) {
      if (isMCPTool(tc.name)) mcpToolCount++;
    }
  }

  // Check thinking block compatibility
  if (thinkingBlockCount > 0) {
    const supportsThinking = checkThinkingSupport(toProvider, toModel);
    if (!supportsThinking) {
      warnings.push({
        type: 'warning',
        code: 'THINKING_NOT_SUPPORTED',
        message: `${thinkingBlockCount} thinking block(s) will be dropped or converted`,
      });
      lossyFeatures.push('Thinking blocks');
    }
  }

  // Check artifact compatibility
  if (artifactCount > 0 && toProvider !== 'claude') {
    warnings.push({
      type: 'warning',
      code: 'ARTIFACTS_NOT_SUPPORTED',
      message: `${artifactCount} artifact(s) will be inlined as code/text`,
    });
    lossyFeatures.push('Artifacts');
  }

  // Check MCP tool compatibility
  if (mcpToolCount > 0 && toProvider !== 'claude') {
    warnings.push({
      type: 'warning',
      code: 'MCP_NOT_SUPPORTED',
      message: 'MCP tools not available with ' + toProvider,
    });
    lossyFeatures.push('MCP tools');
  }

  // Context window warning
  if (requiresSummarization) {
    warnings.push({
      type: 'warning',
      code: 'CONTEXT_TOO_LARGE',
      message: `Context may need summarization (${estimatedTokens} → ${targetContextLimit})`,
    });
  } else if (estimatedTokens > targetContextLimit) {
    warnings.push({
      type: 'error',
      code: 'CONTEXT_EXCEEDS_LIMIT',
      message: `Context exceeds target limit (${estimatedTokens} > ${targetContextLimit})`,
    });
  }

  // Provider-specific warnings
  if (conv.currentProvider === 'claude' && toProvider === 'openai') {
    if (toModel.startsWith('o1') || toModel.startsWith('o3')) {
      warnings.push({
        type: 'info',
        code: 'O1_REASONING',
        message: 'O1/O3 has its own internal reasoning (hidden from output)',
      });
    }
  }

  const canSwitch = !warnings.some((w) => w.type === 'error');

  return {
    canSwitch,
    warnings,
    requiresSummarization,
    estimatedTokens,
    targetContextLimit,
    lossyFeatures,
    thinkingBlockCount,
    artifactCount,
    mcpToolCount,
  };
}

// =============================================================================
// Prepare for Switch
// =============================================================================

/**
 * Prepare conversation for provider switch
 */
function prepareForSwitch(
  conv: UnifiedConversation,
  toProvider: ProviderType,
  toModel: string,
  options: Partial<SwitchOptions> = {}
): PreparedConversation {
  const opts: SwitchOptions = { ...DEFAULT_SWITCH_OPTIONS, ...options };
  const analysis = analyzeSwitch(conv, toProvider, toModel);
  const warnings: SwitchWarning[] = [...analysis.warnings];

  // Make a copy of the conversation to modify
  let messages = [...conv.messages];
  const originalMessageCount = messages.length;
  let summarized = false;

  // Handle context reduction if needed
  if (analysis.requiresSummarization && opts.summarizationStrategy !== 'truncate') {
    // For now, just truncate (summarization would require AI call)
    const targetLimit = analysis.targetContextLimit * 0.6;
    let currentTokens = 0;
    const keptMessages: UnifiedMessage[] = [];

    // Keep messages from end until we hit limit
    for (let i = messages.length - 1; i >= 0; i--) {
      const msgTokens = estimateTokens([messages[i]]);
      if (currentTokens + msgTokens > targetLimit) break;
      currentTokens += msgTokens;
      keptMessages.unshift(messages[i]);
    }

    messages = keptMessages;
    summarized = true;

    warnings.push({
      type: 'info',
      code: 'CONTEXT_REDUCED',
      message: `Context reduced from ${originalMessageCount} to ${messages.length} messages`,
    });
  }

  // Handle thinking blocks based on strategy
  if (analysis.thinkingBlockCount > 0) {
    messages = messages.map((msg) => {
      const newContent: UnifiedContent[] = [];

      for (const c of msg.content) {
        if (c.type === 'thinking') {
          const result = translateThinking(
            c as UnifiedThinkingContent,
            toProvider,
            toModel,
            opts.thinkingTranslation
          );

          if (result.type === 'preserve' && result.content) {
            newContent.push(result.content);
          } else if (result.type === 'convert' && result.content) {
            newContent.push(result.content);
          }
          // 'drop' means we skip adding it
        } else {
          newContent.push(c);
        }
      }

      return { ...msg, content: newContent };
    });
  }

  // Handle artifacts
  if (analysis.artifactCount > 0 && toProvider !== 'claude') {
    messages = messages.map((msg) => {
      const newContent: UnifiedContent[] = [];

      for (const c of msg.content) {
        if (c.type === 'artifact') {
          const inlined = translateArtifact(c as UnifiedArtifactContent, toProvider);
          newContent.push(...inlined);
        } else {
          newContent.push(c);
        }
      }

      return { ...msg, content: newContent };
    });
  }

  // Filter out MCP tools if target doesn't support them
  if (toProvider !== 'claude') {
    messages = messages.map((msg) => ({
      ...msg,
      toolCalls: msg.toolCalls?.filter((tc) => !isMCPTool(tc.name)),
      toolResults: msg.toolResults?.filter((tr) => !isMCPTool(tr.name)),
    }));
  }

  // Remove empty tool arrays
  messages = messages.map((msg) => ({
    ...msg,
    toolCalls: msg.toolCalls && msg.toolCalls.length > 0 ? msg.toolCalls : undefined,
    toolResults: msg.toolResults && msg.toolResults.length > 0 ? msg.toolResults : undefined,
  }));

  // Export to target provider format
  const modifiedConv = { ...conv, messages };
  let history: ProviderHistory;

  switch (toProvider) {
    case 'claude':
      history = exportToClaude(modifiedConv);
      break;
    case 'gemini':
      history = exportToGemini(modifiedConv);
      break;
    case 'openai':
      history = exportToOpenAI(modifiedConv);
      break;
    default:
      throw new Error(`Unknown provider: ${toProvider}`);
  }

  // Extract system prompt with proper type checking
  let systemPrompt: string | undefined;
  if (opts.preserveSystemPrompt) {
    const systemMsg = conv.messages.find((m) => m.role === 'system');
    if (systemMsg && systemMsg.content.length > 0) {
      const firstContent = systemMsg.content[0];
      if (firstContent.type === 'text' && 'text' in firstContent) {
        systemPrompt = firstContent.text;
      }
    }
  }

  return {
    history,
    systemPrompt,
    warnings,
    summarized,
    originalMessageCount,
    preservedMessageCount: messages.length,
  };
}

// =============================================================================
// Service Export
// =============================================================================

export const conversationTranslator = {
  // Import functions
  importFromClaude,
  importFromGemini: async (sessionData: GeminiHistory): Promise<UnifiedConversation> => {
    throw new Error('Not implemented yet');
  },
  importFromOpenAI: async (thread: OpenAIHistory): Promise<UnifiedConversation> => {
    throw new Error('Not implemented yet');
  },

  // Export functions
  exportToClaude,
  exportToGemini,
  exportToOpenAI,

  // Analysis and preparation
  analyzeSwitch,
  prepareForSwitch,

  // Helper utilities
  generateId,
  estimateTokens,
  checkThinkingSupport,
  isMCPTool,
  translateThinking,
  translateArtifact,
  getTokenEstimate,
};

export default conversationTranslator;

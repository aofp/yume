/**
 * Core agent loop for yume-cli
 * Think -> Act -> Observe cycle
 */

import type {
  CLIArgs,
  Session,
  HistoryMessage,
  ToolCall,
  TokenUsage,
  Provider,
  ToolDefinition,
  ToolExecutor,
} from '../types.js';
import {
  emitSystemInit,
  emitText,
  emitThinking,
  emitToolUse,
  emitToolResult,
  emitUsage,
  emitResult,
  emitError,
  emitErrorResult,
  emitMessageStop,
  log,
  logVerbose,
} from './emit.js';
import {
  createSession,
  loadSession,
  saveSession,
  loadHistoryFromFile,
  addToHistory,
  updateUsage,
} from './session.js';
import { buildSystemContext } from './plugins.js';

const MAX_TURNS = 50; // Safety limit
const MAX_DURATION_MS = 10 * 60 * 1000; // 10 minute overall timeout
const MAX_HISTORY_MESSAGES = 100; // Prevent unbounded history growth

interface AgentLoopOptions {
  args: CLIArgs;
  provider: Provider;
  tools: ToolExecutor[];
  toolDefinitions: ToolDefinition[];
}

/**
 * Run the agent loop
 * This is the main entry point for processing a user prompt
 */
export async function runAgentLoop(options: AgentLoopOptions): Promise<void> {
  const { args, provider, tools, toolDefinitions } = options;
  const startTime = Date.now();
  let turnCount = 0;

  // Load or create session
  let session: Session;
  if (args.resume) {
    const existing = await loadSession(args.provider, args.resume);
    if (existing) {
      session = existing;
      logVerbose(`Resumed session ${session.id}`);
    } else {
      log(`Session ${args.resume} not found, creating new session`);
      session = await createSession(args.provider, args.model, args.cwd);
    }
  } else {
    session = await createSession(
      args.provider,
      args.model,
      args.cwd,
      args.sessionId
    );
  }
  
  // Inject history from file if provided (Cross-Agent Resumption)
  if (args.historyFile) {
    const injectedHistory = await loadHistoryFromFile(args.historyFile);
    if (injectedHistory.length > 0) {
      logVerbose(`Injected ${injectedHistory.length} messages from ${args.historyFile}`);
      session.history.push(...injectedHistory);
    }
  }

  // Emit system init
  emitSystemInit(
    session.id,
    args.model,
    args.cwd,
    args.permissionMode,
    toolDefinitions.map((t) => t.name)
  );

  // Add user message to history if prompt provided
  if (args.prompt) {
    // Build system context from plugins (agents, skills)
    const systemContext = await buildSystemContext(args.prompt);
    const enhancedPrompt = systemContext ? systemContext + args.prompt : args.prompt;

    addToHistory(session, {
      role: 'user',
      content: enhancedPrompt,
    });

    if (systemContext) {
      logVerbose('Injected plugin context into prompt');
    }
  }

  // Total usage for this turn
  const turnUsage: TokenUsage = {
    inputTokens: 0,
    outputTokens: 0,
    cacheReadTokens: 0,
    cacheCreationTokens: 0,
  };

  try {
    // Main agent loop with timeout protection
    while (turnCount < MAX_TURNS) {
      // Check overall timeout
      if (Date.now() - startTime > MAX_DURATION_MS) {
        log(`Agent loop timed out after ${MAX_DURATION_MS / 1000}s`);
        emitError('timeout', `Agent loop exceeded maximum duration of ${MAX_DURATION_MS / 1000} seconds`);
        break;
      }

      // Truncate history if too long (simple compaction)
      if (session.history.length > MAX_HISTORY_MESSAGES) {
        const toRemove = session.history.length - MAX_HISTORY_MESSAGES;
        session.history = session.history.slice(toRemove);
        session.metadata.compactionCount = (session.metadata.compactionCount || 0) + 1;
        logVerbose(`Truncated ${toRemove} old messages from history`);
      }

      turnCount++;
      logVerbose(`Turn ${turnCount}`);

      // Generate response from provider
      const pendingToolCalls: ToolCall[] = [];
      let responseText = '';
      let hasToolCalls = false;

      // Buffer for partial tool call arguments and names
      const toolCallBuffers: Map<string, string> = new Map();
      const toolCallNames: Map<string, string> = new Map();

      // Wrap stream in try/catch to handle unhandled rejections
      let streamError: Error | null = null;
      try {
        for await (const chunk of provider.generate(
          session.history,
          toolDefinitions
        )) {
        switch (chunk.type) {
          case 'text':
            if (chunk.text) {
              responseText += chunk.text;
              emitText(chunk.text);
            }
            break;

          case 'thinking':
            if (chunk.thinking) {
              emitThinking(chunk.thinking);
            }
            break;

          case 'tool_call':
            if (chunk.toolCall) {
              hasToolCalls = true;
              let input: Record<string, unknown> = {};
              try {
                input = JSON.parse(chunk.toolCall.arguments);
              } catch {
                logVerbose(`Failed to parse tool arguments: ${chunk.toolCall.arguments}`);
                // Try to use arguments as-is if it's not valid JSON
                input = { raw: chunk.toolCall.arguments };
              }
              const toolCall: ToolCall = {
                id: chunk.toolCall.id,
                name: chunk.toolCall.name,
                input,
              };
              pendingToolCalls.push(toolCall);
              emitToolUse(toolCall.id, toolCall.name, toolCall.input);
            }
            break;

          case 'tool_call_delta':
            // Buffer partial tool call arguments and track names
            if (chunk.toolCallDelta) {
              const id = chunk.toolCallDelta.id;
              const current = toolCallBuffers.get(id) || '';
              toolCallBuffers.set(id, current + (chunk.toolCallDelta.arguments || ''));
              // Track tool name from initial delta if provided
              if (chunk.toolCallDelta.name && !toolCallNames.has(id)) {
                toolCallNames.set(id, chunk.toolCallDelta.name);
              }
            }
            break;

          case 'usage':
            if (chunk.usage) {
              turnUsage.inputTokens += chunk.usage.inputTokens;
              turnUsage.outputTokens += chunk.usage.outputTokens;
              turnUsage.cacheReadTokens += chunk.usage.cacheReadTokens || 0;
            }
            break;

          case 'done':
            // Stream complete
            break;

          case 'tool_result':
            // Handle tool_result from providers that execute tools internally (gemini cli)
            if (chunk.toolResult) {
              const tr = chunk.toolResult;
              emitToolResult(tr.id, tr.output, tr.isError);
              // Add to history
              addToHistory(session, {
                role: 'tool',
                toolCallId: tr.id,
                content: tr.output,
              });
              // Remove from pendingToolCalls since provider already executed it
              const idx = pendingToolCalls.findIndex((tc) => tc.id === tr.id);
              if (idx >= 0) {
                logVerbose(`Provider executed tool ${tr.id} internally, removing from pending`);
                pendingToolCalls.splice(idx, 1);
              }
            }
            break;
        }
        }
      } catch (error) {
        streamError = error instanceof Error ? error : new Error(String(error));
        logVerbose(`Stream error: ${streamError.message}`);
      }

      // If stream errored, report and break
      if (streamError) {
        emitError('stream_error', streamError.message);
        emitToolResult('stream-error', `Stream error: ${streamError.message}`, true);
        break;
      }

      // Process any buffered tool calls (from deltas) that weren't already in pendingToolCalls
      for (const [id, argsBuffer] of toolCallBuffers) {
        // Skip if already processed as a complete tool_call
        if (pendingToolCalls.some((tc) => tc.id === id)) {
          continue;
        }

        const toolName = toolCallNames.get(id);
        if (!toolName) {
          logVerbose(`Warning: Tool call ${id} has no name, skipping`);
          continue;
        }

        try {
          const input = JSON.parse(argsBuffer);
          const toolCall: ToolCall = { id, name: toolName, input };
          pendingToolCalls.push(toolCall);
          hasToolCalls = true;
          emitToolUse(toolCall.id, toolCall.name, toolCall.input);
          logVerbose(`Assembled tool call from deltas: ${toolName}`);
        } catch {
          logVerbose(`Warning: Could not parse tool call arguments for ${id}`);
        }
      }

      // Add assistant message to history
      if (responseText || hasToolCalls) {
        const assistantMessage: HistoryMessage = {
          role: 'assistant',
          content: responseText || undefined,
          toolCalls: hasToolCalls ? pendingToolCalls : undefined,
        };
        addToHistory(session, assistantMessage);
      }

      // If no tool calls, we're done
      if (!hasToolCalls) {
        break;
      }

      // Execute tool calls (Act phase)
      for (const toolCall of pendingToolCalls) {
        logVerbose(`Executing tool: ${toolCall.name}`);

        const executor = tools.find((t) => t.name === toolCall.name);
        if (!executor) {
          const errorMsg = `Unknown tool: ${toolCall.name}`;
          emitToolResult(toolCall.id, errorMsg, true);
          addToHistory(session, {
            role: 'tool',
            toolCallId: toolCall.id,
            content: errorMsg,
          });
          continue;
        }

        try {
          const result = await executor.execute(toolCall.input, args.cwd);
          emitToolResult(toolCall.id, result.content, result.isError);
          addToHistory(session, {
            role: 'tool',
            toolCallId: toolCall.id,
            content: result.content,
          });
        } catch (error) {
          const errorMsg =
            error instanceof Error ? error.message : String(error);
          emitToolResult(toolCall.id, errorMsg, true);
          addToHistory(session, {
            role: 'tool',
            toolCallId: toolCall.id,
            content: errorMsg,
          });
        }
      }

      // Continue to next turn (Observe phase - model sees tool results)
    }

    // Update session usage
    updateUsage(session, turnUsage);
    await saveSession(session);

    // Emit final usage and result
    emitUsage(turnUsage);
    emitResult({
      sessionId: session.id,
      usage: turnUsage,
      durationMs: Date.now() - startTime,
      numTurns: turnCount,
      model: args.model,
    });
    emitMessageStop();
  } catch (error) {
    const errorMsg = error instanceof Error ? error.message : String(error);
    log(`Error in agent loop: ${errorMsg}`);
    emitError('agent_error', errorMsg);
    emitErrorResult(session.id, errorMsg, turnUsage);
    emitMessageStop();
  }
}

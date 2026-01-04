import type { MessageParam as APIUserMessage } from '@anthropic-ai/sdk/resources';
import type { BetaMessage as APIAssistantMessage, BetaUsage as Usage, BetaRawMessageStreamEvent as RawMessageStreamEvent } from '@anthropic-ai/sdk/resources/beta/messages/messages.mjs';
import type { UUID } from 'crypto';
import type { CallToolResult } from '@modelcontextprotocol/sdk/types.js';
import { type McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { type z, type ZodRawShape, type ZodObject } from 'zod';
import type { SandboxSettings, SandboxNetworkConfig, SandboxIgnoreViolations } from './sandboxTypes.js';
import type { SpawnedProcess, SpawnOptions } from '../transport/processTransportTypes.js';
import type { Transport } from '../transport/transport.js';
export type { SandboxSettings, SandboxNetworkConfig, SandboxIgnoreViolations };
export type NonNullableUsage = {
    [K in keyof Usage]: NonNullable<Usage[K]>;
};
export type ModelUsage = {
    inputTokens: number;
    outputTokens: number;
    cacheReadInputTokens: number;
    cacheCreationInputTokens: number;
    webSearchRequests: number;
    costUSD: number;
    contextWindow: number;
};
export type OutputFormatType = 'json_schema';
export type BaseOutputFormat = {
    type: OutputFormatType;
};
export type JsonSchemaOutputFormat = BaseOutputFormat & {
    type: 'json_schema';
    schema: Record<string, unknown>;
};
export type OutputFormat = JsonSchemaOutputFormat;
export type ApiKeySource = 'user' | 'project' | 'org' | 'temporary';
export type ConfigScope = 'local' | 'user' | 'project';
/**
 * Allowed beta headers that can be passed via SDK options.
 */
export type SdkBeta = 'context-1m-2025-08-07';
export type McpStdioServerConfig = {
    type?: 'stdio';
    command: string;
    args?: string[];
    env?: Record<string, string>;
};
export type McpSSEServerConfig = {
    type: 'sse';
    url: string;
    headers?: Record<string, string>;
};
export type McpHttpServerConfig = {
    type: 'http';
    url: string;
    headers?: Record<string, string>;
};
export type McpSdkServerConfig = {
    type: 'sdk';
    name: string;
};
export type McpSdkServerConfigWithInstance = McpSdkServerConfig & {
    instance: McpServer;
};
export type McpServerConfig = McpStdioServerConfig | McpSSEServerConfig | McpHttpServerConfig | McpSdkServerConfigWithInstance;
export type McpServerConfigForProcessTransport = McpStdioServerConfig | McpSSEServerConfig | McpHttpServerConfig | McpSdkServerConfig;
type PermissionUpdateDestination = 'userSettings' | 'projectSettings' | 'localSettings' | 'session' | 'cliArg';
export type PermissionBehavior = 'allow' | 'deny' | 'ask';
export type PermissionUpdate = {
    type: 'addRules';
    rules: PermissionRuleValue[];
    behavior: PermissionBehavior;
    destination: PermissionUpdateDestination;
} | {
    type: 'replaceRules';
    rules: PermissionRuleValue[];
    behavior: PermissionBehavior;
    destination: PermissionUpdateDestination;
} | {
    type: 'removeRules';
    rules: PermissionRuleValue[];
    behavior: PermissionBehavior;
    destination: PermissionUpdateDestination;
} | {
    type: 'setMode';
    mode: PermissionMode;
    destination: PermissionUpdateDestination;
} | {
    type: 'addDirectories';
    directories: string[];
    destination: PermissionUpdateDestination;
} | {
    type: 'removeDirectories';
    directories: string[];
    destination: PermissionUpdateDestination;
};
export type PermissionResult = {
    behavior: 'allow';
    /**
     * Updated tool input to use, if any changes are needed.
     *
     * For example if the user was given the option to update the tool use
     * input before approving, then this would be the updated input which
     * would be executed by the tool.
     */
    updatedInput: Record<string, unknown>;
    /**
     * Permissions updates to be applied as part of accepting this tool use.
     *
     * Typically this is used as part of the 'always allow' flow and these
     * permission updates are from the `suggestions` field from the
     * CanUseTool callback.
     *
     * It is recommended that you use these suggestions rather than
     * attempting to re-derive them from the tool use input, as the
     * suggestions may include other permission changes such as adding
     * directories or incorporate complex tool-use logic such as bash
     * commands.
     */
    updatedPermissions?: PermissionUpdate[];
    /**
     * The tool use ID. Supplied and used internally.
     */
    toolUseID?: string;
} | {
    behavior: 'deny';
    /**
     * Message indicating the reason for denial, or guidance of what the
     * model should do instead.
     */
    message: string;
    /**
     * If true, interrupt execution and do not continue.
     *
     * Typically this should be set to true when the user says 'no' with no
     * further guidance. Leave unset or false if the user provides guidance
     * which the model should incorporate and continue.
     */
    interrupt?: boolean;
    /**
     * The tool use ID. Supplied and used internally.
     */
    toolUseID?: string;
};
export type PermissionRuleValue = {
    toolName: string;
    ruleContent?: string;
};
export type CanUseTool = (toolName: string, input: Record<string, unknown>, options: {
    /** Signaled if the operation should be aborted. */
    signal: AbortSignal;
    /**
     * Suggestions for updating permissions so that the user will not be
     * prompted again for this tool during this session.
     *
     * Typically if presenting the user an option 'always allow' or similar,
     * then this full set of suggestions should be returned as the
     * `updatedPermissions` in the PermissionResult.
     */
    suggestions?: PermissionUpdate[];
    /**
     * The file path that triggered the permission request, if applicable.
     * For example, when a Bash command tries to access a path outside allowed directories.
     */
    blockedPath?: string;
    /** Explains why this permission request was triggered. */
    decisionReason?: string;
    /**
     * Unique identifier for this specific tool call within the assistant message.
     * Multiple tool calls in the same assistant message will have different toolUseIDs.
     */
    toolUseID: string;
    /** If running within the context of a sub-agent, the sub-agent's ID. */
    agentID?: string;
}) => Promise<PermissionResult>;
export declare const HOOK_EVENTS: readonly ["PreToolUse", "PostToolUse", "PostToolUseFailure", "Notification", "UserPromptSubmit", "SessionStart", "SessionEnd", "Stop", "SubagentStart", "SubagentStop", "PreCompact", "PermissionRequest"];
export type HookEvent = (typeof HOOK_EVENTS)[number];
export type HookCallback = (input: HookInput, toolUseID: string | undefined, options: {
    signal: AbortSignal;
}) => Promise<HookJSONOutput>;
export interface HookCallbackMatcher {
    matcher?: string;
    hooks: HookCallback[];
    /** Timeout in seconds for all hooks in this matcher */
    timeout?: number;
}
export type BaseHookInput = {
    session_id: string;
    transcript_path: string;
    cwd: string;
    permission_mode?: string;
};
export type PreToolUseHookInput = BaseHookInput & {
    hook_event_name: 'PreToolUse';
    tool_name: string;
    tool_input: unknown;
    tool_use_id: string;
};
export type PermissionRequestHookInput = BaseHookInput & {
    hook_event_name: 'PermissionRequest';
    tool_name: string;
    tool_input: unknown;
    permission_suggestions?: PermissionUpdate[];
};
export type PostToolUseHookInput = BaseHookInput & {
    hook_event_name: 'PostToolUse';
    tool_name: string;
    tool_input: unknown;
    tool_response: unknown;
    tool_use_id: string;
};
export type PostToolUseFailureHookInput = BaseHookInput & {
    hook_event_name: 'PostToolUseFailure';
    tool_name: string;
    tool_input: unknown;
    tool_use_id: string;
    error: string;
    is_interrupt?: boolean;
};
export type NotificationHookInput = BaseHookInput & {
    hook_event_name: 'Notification';
    message: string;
    title?: string;
    notification_type: string;
};
export type UserPromptSubmitHookInput = BaseHookInput & {
    hook_event_name: 'UserPromptSubmit';
    prompt: string;
};
export type SessionStartHookInput = BaseHookInput & {
    hook_event_name: 'SessionStart';
    source: 'startup' | 'resume' | 'clear' | 'compact';
};
export type StopHookInput = BaseHookInput & {
    hook_event_name: 'Stop';
    stop_hook_active: boolean;
};
export type SubagentStartHookInput = BaseHookInput & {
    hook_event_name: 'SubagentStart';
    agent_id: string;
    agent_type: string;
};
export type SubagentStopHookInput = BaseHookInput & {
    hook_event_name: 'SubagentStop';
    stop_hook_active: boolean;
    agent_id: string;
    agent_transcript_path: string;
};
export type PreCompactHookInput = BaseHookInput & {
    hook_event_name: 'PreCompact';
    trigger: 'manual' | 'auto';
    custom_instructions: string | null;
};
export declare const EXIT_REASONS: string[];
export type ExitReason = (typeof EXIT_REASONS)[number];
export type SessionEndHookInput = BaseHookInput & {
    hook_event_name: 'SessionEnd';
    reason: ExitReason;
};
export type HookInput = PreToolUseHookInput | PostToolUseHookInput | PostToolUseFailureHookInput | NotificationHookInput | UserPromptSubmitHookInput | SessionStartHookInput | SessionEndHookInput | StopHookInput | SubagentStartHookInput | SubagentStopHookInput | PreCompactHookInput | PermissionRequestHookInput;
export type AsyncHookJSONOutput = {
    async: true;
    asyncTimeout?: number;
};
export type SyncHookJSONOutput = {
    continue?: boolean;
    suppressOutput?: boolean;
    stopReason?: string;
    decision?: 'approve' | 'block';
    systemMessage?: string;
    reason?: string;
    hookSpecificOutput?: {
        hookEventName: 'PreToolUse';
        permissionDecision?: 'allow' | 'deny' | 'ask';
        permissionDecisionReason?: string;
        updatedInput?: Record<string, unknown>;
    } | {
        hookEventName: 'UserPromptSubmit';
        additionalContext?: string;
    } | {
        hookEventName: 'SessionStart';
        additionalContext?: string;
    } | {
        hookEventName: 'SubagentStart';
        additionalContext?: string;
    } | {
        hookEventName: 'PostToolUse';
        additionalContext?: string;
        updatedMCPToolOutput?: unknown;
    } | {
        hookEventName: 'PostToolUseFailure';
        additionalContext?: string;
    } | {
        hookEventName: 'PermissionRequest';
        decision: {
            behavior: 'allow';
            updatedInput?: Record<string, unknown>;
            updatedPermissions?: PermissionUpdate[];
        } | {
            behavior: 'deny';
            message?: string;
            interrupt?: boolean;
        };
    };
};
export type HookJSONOutput = AsyncHookJSONOutput | SyncHookJSONOutput;
/**
 * Permission mode for controlling how tool executions are handled.
 * - `'default'` - Standard behavior, prompts for dangerous operations
 * - `'acceptEdits'` - Auto-accept file edit operations
 * - `'bypassPermissions'` - Bypass all permission checks (requires `allowDangerouslySkipPermissions`)
 * - `'plan'` - Planning mode, no actual tool execution
 * - `'delegate'` - Delegate mode, restricts team leader to only Teammate and Task tools
 * - `'dontAsk'` - Don't prompt for permissions, deny if not pre-approved
 */
export type PermissionMode = 'default' | 'acceptEdits' | 'bypassPermissions' | 'plan' | 'delegate' | 'dontAsk';
/**
 * Information about an available skill (invoked via /command syntax).
 */
export type SlashCommand = {
    /** Skill name (without the leading slash) */
    name: string;
    /** Description of what the skill does */
    description: string;
    /** Hint for skill arguments (e.g., "<file>") */
    argumentHint: string;
};
/**
 * Information about an available model.
 */
export type ModelInfo = {
    /** Model identifier to use in API calls */
    value: string;
    /** Human-readable display name */
    displayName: string;
    /** Description of the model's capabilities */
    description: string;
};
/** Information about the logged in user's account. */
export type AccountInfo = {
    email?: string;
    organization?: string;
    subscriptionType?: string;
    tokenSource?: string;
    apiKeySource?: string;
};
/**
 * Status information for an MCP server connection.
 */
export type McpServerStatus = {
    /** Server name as configured */
    name: string;
    /** Current connection status */
    status: 'connected' | 'failed' | 'needs-auth' | 'pending';
    /** Server information (available when connected) */
    serverInfo?: {
        name: string;
        version: string;
    };
};
/**
 * Result of a setMcpServers operation.
 */
export type McpSetServersResult = {
    /** Names of servers that were added */
    added: string[];
    /** Names of servers that were removed */
    removed: string[];
    /** Map of server names to error messages for servers that failed to connect */
    errors: Record<string, string>;
};
type SDKUserMessageContent = {
    type: 'user';
    message: APIUserMessage;
    parent_tool_use_id: string | null;
    /**
     * True if this is a 'synthetic' user message which did not originate from
     * the user directly, but instead was generated by the system.
     */
    isSynthetic?: boolean;
    /**
     * If present, the JSON result of a tool use that this user message is
     * responding to. This is provided to make it easier for applications to
     * present the tool result in a formatted way. The model only receives
     * the content within the user message.
     * The specific format is tool-dependent.
     */
    tool_use_result?: unknown;
};
export type SDKUserMessage = SDKUserMessageContent & {
    uuid?: UUID;
    session_id: string;
};
export type SDKUserMessageReplay = SDKUserMessageContent & {
    uuid: UUID;
    session_id: string;
    /**
     * True if this is a replay/acknowledgment of a user message that was already
     * added to the messages array. Used internally to prevent duplicate messages.
     */
    isReplay: true;
};
export type SDKAssistantMessageError = 'authentication_failed' | 'billing_error' | 'rate_limit' | 'invalid_request' | 'server_error' | 'unknown';
export type SDKAssistantMessage = {
    type: 'assistant';
    message: APIAssistantMessage;
    parent_tool_use_id: string | null;
    error?: SDKAssistantMessageError;
    uuid: UUID;
    session_id: string;
};
export type SDKPermissionDenial = {
    tool_name: string;
    tool_use_id: string;
    tool_input: Record<string, unknown>;
};
export type SDKResultMessage = {
    type: 'result';
    subtype: 'success';
    duration_ms: number;
    duration_api_ms: number;
    is_error: boolean;
    num_turns: number;
    result: string;
    total_cost_usd: number;
    usage: NonNullableUsage;
    modelUsage: {
        [modelName: string]: ModelUsage;
    };
    permission_denials: SDKPermissionDenial[];
    structured_output?: unknown;
    uuid: UUID;
    session_id: string;
} | {
    type: 'result';
    subtype: 'error_during_execution' | 'error_max_turns' | 'error_max_budget_usd' | 'error_max_structured_output_retries';
    duration_ms: number;
    duration_api_ms: number;
    is_error: boolean;
    num_turns: number;
    total_cost_usd: number;
    usage: NonNullableUsage;
    modelUsage: {
        [modelName: string]: ModelUsage;
    };
    permission_denials: SDKPermissionDenial[];
    errors: string[];
    uuid: UUID;
    session_id: string;
};
export type SDKSystemMessage = {
    type: 'system';
    subtype: 'init';
    agents?: string[];
    apiKeySource: ApiKeySource;
    betas?: string[];
    claude_code_version: string;
    cwd: string;
    tools: string[];
    mcp_servers: {
        name: string;
        status: string;
    }[];
    model: string;
    permissionMode: PermissionMode;
    slash_commands: string[];
    output_style: string;
    skills: string[];
    plugins: {
        name: string;
        path: string;
    }[];
    uuid: UUID;
    session_id: string;
};
export type SDKPartialAssistantMessage = {
    type: 'stream_event';
    event: RawMessageStreamEvent;
    parent_tool_use_id: string | null;
    uuid: UUID;
    session_id: string;
};
export type SDKCompactBoundaryMessage = {
    type: 'system';
    subtype: 'compact_boundary';
    compact_metadata: {
        trigger: 'manual' | 'auto';
        pre_tokens: number;
    };
    uuid: UUID;
    session_id: string;
};
export type SDKStatus = 'compacting' | null;
export type SDKStatusMessage = {
    type: 'system';
    subtype: 'status';
    status: SDKStatus;
    uuid: UUID;
    session_id: string;
};
export type SDKHookResponseMessage = {
    type: 'system';
    subtype: 'hook_response';
    hook_name: string;
    hook_event: string;
    stdout: string;
    stderr: string;
    exit_code?: number;
    uuid: UUID;
    session_id: string;
};
export type SDKToolProgressMessage = {
    type: 'tool_progress';
    tool_use_id: string;
    tool_name: string;
    parent_tool_use_id: string | null;
    elapsed_time_seconds: number;
    uuid: UUID;
    session_id: string;
};
export type SDKAuthStatusMessage = {
    type: 'auth_status';
    isAuthenticating: boolean;
    output: string[];
    error?: string;
    uuid: UUID;
    session_id: string;
};
export type SDKMessage = SDKAssistantMessage | SDKUserMessage | SDKUserMessageReplay | SDKResultMessage | SDKSystemMessage | SDKPartialAssistantMessage | SDKCompactBoundaryMessage | SDKStatusMessage | SDKHookResponseMessage | SDKToolProgressMessage | SDKAuthStatusMessage;
export interface Query extends AsyncGenerator<SDKMessage, void> {
    /**
     * Control Requests
     * The following methods are control requests, and are only supported when
     * streaming input/output is used.
     */
    /**
     * Interrupt the current query execution. The query will stop processing
     * and return control to the caller.
     */
    interrupt(): Promise<void>;
    /**
     * Change the permission mode for the current session.
     * Only available in streaming input mode.
     *
     * @param mode - The new permission mode to set
     */
    setPermissionMode(mode: PermissionMode): Promise<void>;
    /**
     * Change the model used for subsequent responses.
     * Only available in streaming input mode.
     *
     * @param model - The model identifier to use, or undefined to use the default
     */
    setModel(model?: string): Promise<void>;
    /**
     * Set the maximum number of thinking tokens the model is allowed to use
     * when generating its response. This can be used to limit the amount of
     * tokens the model uses for its response, which can help control cost and
     * latency.
     *
     * Use `null` to clear any previously set limit and allow the model to
     * use the default maximum thinking tokens.
     *
     * @param maxThinkingTokens - Maximum tokens for thinking, or null to clear the limit
     */
    setMaxThinkingTokens(maxThinkingTokens: number | null): Promise<void>;
    /**
     * Get the list of available skills for the current session.
     *
     * @returns Array of available skills with their names and descriptions
     */
    supportedCommands(): Promise<SlashCommand[]>;
    /**
     * Get the list of available models.
     *
     * @returns Array of model information including display names and descriptions
     */
    supportedModels(): Promise<ModelInfo[]>;
    /**
     * Get the current status of all configured MCP servers.
     *
     * @returns Array of MCP server statuses (connected, failed, needs-auth, pending)
     */
    mcpServerStatus(): Promise<McpServerStatus[]>;
    /**
     * Get information about the authenticated account.
     *
     * @returns Account information including email, organization, and subscription type
     */
    accountInfo(): Promise<AccountInfo>;
    /**
     * Rewind tracked files to their state at a specific user message.
     * Requires file checkpointing to be enabled via the `enableFileCheckpointing` option.
     *
     * @param userMessageId - UUID of the user message to rewind to
     */
    rewindFiles(userMessageId: string): Promise<void>;
    /**
     * Dynamically set the MCP servers for this session.
     * This replaces the current set of dynamically-added MCP servers with the provided set.
     * Servers that are removed will be disconnected, and new servers will be connected.
     *
     * Supports both process-based servers (stdio, sse, http) and SDK servers (in-process).
     * SDK servers are handled locally in the SDK process, while process-based servers
     * are managed by the CLI subprocess.
     *
     * Note: This only affects servers added dynamically via this method or the SDK.
     * Servers configured via settings files are not affected.
     *
     * @param servers - Record of server name to configuration. Pass an empty object to remove all dynamic servers.
     * @returns Information about which servers were added, removed, and any connection errors
     */
    setMcpServers(servers: Record<string, McpServerConfig>): Promise<McpSetServersResult>;
    /**
     * Stream input messages to the query.
     * Used internally for multi-turn conversations.
     *
     * @param stream - Async iterable of user messages to send
     */
    streamInput(stream: AsyncIterable<SDKUserMessage>): Promise<void>;
}
/**
 * V2 API - UNSTABLE
 * Options for creating a session
 */
export type SDKSessionOptions = {
    /** Model to use */
    model: string;
    /** Path to Claude Code executable */
    pathToClaudeCodeExecutable?: string;
    /** Executable to use (node, bun) */
    executable?: 'node' | 'bun';
    /** Arguments to pass to executable */
    executableArgs?: string[];
    /**
     * Environment variables to pass to the Claude Code process.
     * Defaults to `process.env`.
     */
    env?: {
        [envVar: string]: string | undefined;
    };
};
/**
 * V2 API - UNSTABLE
 * Session interface for multi-turn conversations
 */
export interface SDKSession {
    /**
     * The session ID. Available after receiving the first message.
     * For resumed sessions, available immediately.
     * Throws if accessed before the session is initialized.
     */
    readonly sessionId: string;
    /** Send a message to the agent */
    send(message: string | SDKUserMessage): Promise<void>;
    /** Stream messages from the agent */
    stream(): AsyncGenerator<SDKMessage, void>;
    /** Close the session */
    close(): void;
    /** Async disposal support (calls close if not already closed) */
    [Symbol.asyncDispose](): Promise<void>;
}
type SdkMcpToolDefinition<Schema extends ZodRawShape = ZodRawShape> = {
    name: string;
    description: string;
    inputSchema: Schema;
    handler: (args: z.infer<ZodObject<Schema>>, extra: unknown) => Promise<CallToolResult>;
};
export declare function tool<Schema extends ZodRawShape>(_name: string, _description: string, _inputSchema: Schema, _handler: (args: z.infer<ZodObject<Schema>>, extra: unknown) => Promise<CallToolResult>): SdkMcpToolDefinition<Schema>;
type CreateSdkMcpServerOptions = {
    name: string;
    version?: string;
    tools?: Array<SdkMcpToolDefinition<any>>;
};
/**
 * Creates an MCP server instance that can be used with the SDK transport.
 * This allows SDK users to define custom tools that run in the same process.
 *
 * If your SDK MCP calls will run longer than 60s, override CLAUDE_CODE_STREAM_CLOSE_TIMEOUT
 */
export declare function createSdkMcpServer(_options: CreateSdkMcpServerOptions): McpSdkServerConfigWithInstance;
export declare class AbortError extends Error {
}
/**
 * Definition for a custom subagent that can be invoked via the Task tool.
 */
export type AgentDefinition = {
    /** Natural language description of when to use this agent */
    description: string;
    /** Array of allowed tool names. If omitted, inherits all tools from parent */
    tools?: string[];
    /** Array of tool names to explicitly disallow for this agent */
    disallowedTools?: string[];
    /** The agent's system prompt */
    prompt: string;
    /** Model to use for this agent. If omitted or 'inherit', uses the main model */
    model?: 'sonnet' | 'opus' | 'haiku' | 'inherit';
    /** Experimental: Critical reminder added to system prompt */
    criticalSystemReminder_EXPERIMENTAL?: string;
};
/**
 * Source for loading filesystem-based settings.
 * - `'user'` - Global user settings (`~/.claude/settings.json`)
 * - `'project'` - Project settings (`.claude/settings.json`)
 * - `'local'` - Local settings (`.claude/settings.local.json`)
 */
export type SettingSource = 'user' | 'project' | 'local';
/**
 * Configuration for loading a plugin.
 */
export type SdkPluginConfig = {
    /** Plugin type. Currently only 'local' is supported */
    type: 'local';
    /** Absolute or relative path to the plugin directory */
    path: string;
};
export type Options = {
    /**
     * Controller for cancelling the query. When aborted, the query will stop
     * and clean up resources.
     */
    abortController?: AbortController;
    /**
     * Additional directories Claude can access beyond the current working directory.
     * Paths should be absolute.
     */
    additionalDirectories?: string[];
    /**
     * Programmatically define custom subagents that can be invoked via the Task tool.
     * Keys are agent names, values are agent definitions.
     *
     * @example
     * ```typescript
     * agents: {
     *   'code-reviewer': {
     *     description: 'Reviews code for bugs and style issues',
     *     prompt: 'You are a code reviewer...',
     *     tools: ['Read', 'Grep', 'Glob']
     *   }
     * }
     * ```
     */
    agents?: Record<string, AgentDefinition>;
    /**
     * List of tool names that are auto-allowed without prompting for permission.
     * These tools will execute automatically without asking the user for approval.
     * To restrict which tools are available, use the `tools` option instead.
     */
    allowedTools?: string[];
    /**
     * Custom permission handler for controlling tool usage. Called before each
     * tool execution to determine if it should be allowed, denied, or prompt the user.
     */
    canUseTool?: CanUseTool;
    /**
     * Continue the most recent conversation instead of starting a new one.
     * Mutually exclusive with `resume`.
     */
    continue?: boolean;
    /**
     * Current working directory for the session. Defaults to `process.cwd()`.
     */
    cwd?: string;
    /**
     * List of tool names that are disallowed. These tools will be removed
     * from the model's context and cannot be used, even if they would
     * otherwise be allowed.
     */
    disallowedTools?: string[];
    /**
     * Specify the base set of available built-in tools.
     * - `string[]` - Array of specific tool names (e.g., `['Bash', 'Read', 'Edit']`)
     * - `[]` (empty array) - Disable all built-in tools
     * - `{ type: 'preset'; preset: 'claude_code' }` - Use all default Claude Code tools
     */
    tools?: string[] | {
        type: 'preset';
        preset: 'claude_code';
    };
    /**
     * Environment variables to pass to the Claude Code process.
     * Defaults to `process.env`.
     */
    env?: {
        [envVar: string]: string | undefined;
    };
    /**
     * JavaScript runtime to use for executing Claude Code.
     * Auto-detected if not specified.
     */
    executable?: 'bun' | 'deno' | 'node';
    /**
     * Additional arguments to pass to the JavaScript runtime executable.
     */
    executableArgs?: string[];
    /**
     * Additional CLI arguments to pass to Claude Code.
     * Keys are argument names (without --), values are argument values.
     * Use `null` for boolean flags.
     */
    extraArgs?: Record<string, string | null>;
    /**
     * Fallback model to use if the primary model fails or is unavailable.
     */
    fallbackModel?: string;
    /**
     * Enable file checkpointing to track file changes during the session.
     * When enabled, files can be rewound to their state at any user message
     * using `Query.rewindFiles()`.
     *
     * File checkpointing creates backups of files before they are modified,
     * allowing you to restore them to previous states.
     */
    enableFileCheckpointing?: boolean;
    /**
     * When true, resumed sessions will fork to a new session ID rather than
     * continuing the previous session. Use with `resume`.
     */
    forkSession?: boolean;
    /**
     * Enable beta features. Currently supported:
     * - `'context-1m-2025-08-07'` - Enable 1M token context window (Sonnet 4/4.5 only)
     *
     * @see https://docs.anthropic.com/en/api/beta-headers
     */
    betas?: SdkBeta[];
    /**
     * Hook callbacks for responding to various events during execution.
     * Hooks can modify behavior, add context, or implement custom logic.
     *
     * @example
     * ```typescript
     * hooks: {
     *   PreToolUse: [{
     *     hooks: [async (input) => ({ continue: true })]
     *   }]
     * }
     * ```
     */
    hooks?: Partial<Record<HookEvent, HookCallbackMatcher[]>>;
    /**
     * When false, disables session persistence to disk. Sessions will not be
     * saved to ~/.claude/projects/ and cannot be resumed later. Useful for
     * ephemeral or automated workflows where session history is not needed.
     *
     * @default true
     */
    persistSession?: boolean;
    /**
     * Include partial/streaming message events in the output.
     * When true, `SDKPartialAssistantMessage` events will be emitted during streaming.
     */
    includePartialMessages?: boolean;
    /**
     * Maximum number of tokens the model can use for its thinking/reasoning process.
     * Helps control cost and latency for complex tasks.
     */
    maxThinkingTokens?: number;
    /**
     * Maximum number of conversation turns before the query stops.
     * A turn consists of a user message and assistant response.
     */
    maxTurns?: number;
    /**
     * Maximum budget in USD for the query. The query will stop if this
     * budget is exceeded, returning an `error_max_budget_usd` result.
     */
    maxBudgetUsd?: number;
    /**
     * MCP (Model Context Protocol) server configurations.
     * Keys are server names, values are server configurations.
     *
     * @example
     * ```typescript
     * mcpServers: {
     *   'my-server': {
     *     command: 'node',
     *     args: ['./my-mcp-server.js']
     *   }
     * }
     * ```
     */
    mcpServers?: Record<string, McpServerConfig>;
    /**
     * Claude model to use. Defaults to the CLI default model.
     * Examples: 'claude-sonnet-4-5-20250929', 'claude-opus-4-20250514'
     */
    model?: string;
    /**
     * Output format configuration for structured responses.
     * When specified, the agent will return structured data matching the schema.
     *
     * @example
     * ```typescript
     * outputFormat: {
     *   type: 'json_schema',
     *   schema: { type: 'object', properties: { result: { type: 'string' } } }
     * }
     * ```
     */
    outputFormat?: OutputFormat;
    /**
     * Path to the Claude Code executable. Uses the built-in executable if not specified.
     */
    pathToClaudeCodeExecutable?: string;
    /**
     * Permission mode for the session.
     * - `'default'` - Standard permission behavior, prompts for dangerous operations
     * - `'acceptEdits'` - Auto-accept file edit operations
     * - `'bypassPermissions'` - Bypass all permission checks (requires `allowDangerouslySkipPermissions`)
     * - `'plan'` - Planning mode, no execution of tools
     * - `'dontAsk'` - Don't prompt for permissions, deny if not pre-approved
     */
    permissionMode?: PermissionMode;
    /**
     * Must be set to `true` when using `permissionMode: 'bypassPermissions'`.
     * This is a safety measure to ensure intentional bypassing of permissions.
     */
    allowDangerouslySkipPermissions?: boolean;
    /**
     * MCP tool name to use for permission prompts. When set, permission requests
     * will be routed through this MCP tool instead of the default handler.
     */
    permissionPromptToolName?: string;
    /**
     * Load plugins for this session. Plugins provide custom commands, agents,
     * skills, and hooks that extend Claude Code's capabilities.
     *
     * Currently only local plugins are supported via the 'local' type.
     *
     * @example
     * ```typescript
     * plugins: [
     *   { type: 'local', path: './my-plugin' },
     *   { type: 'local', path: '/absolute/path/to/plugin' }
     * ]
     * ```
     */
    plugins?: SdkPluginConfig[];
    /**
     * Session ID to resume. Loads the conversation history from the specified session.
     */
    resume?: string;
    /**
     * When resuming, only resume messages up to and including the message with this UUID.
     * Use with `resume`. This allows you to resume from a specific point in the conversation.
     * The message ID should be from `SDKAssistantMessage.uuid`.
     */
    resumeSessionAt?: string;
    /**
     * Sandbox settings for command execution isolation.
     *
     * When enabled, commands are executed in a sandboxed environment that restricts
     * filesystem and network access. This provides an additional security layer.
     *
     * **Important:** Filesystem and network restrictions are configured via permission
     * rules, not via these sandbox settings:
     * - Filesystem access: Use `Read` and `Edit` permission rules
     * - Network access: Use `WebFetch` permission rules
     *
     * These sandbox settings control sandbox behavior (enabled, auto-allow, etc.),
     * while the actual access restrictions come from your permission configuration.
     *
     * @example Enable sandboxing with auto-allow
     * ```typescript
     * sandbox: {
     *   enabled: true,
     *   autoAllowBashIfSandboxed: true
     * }
     * ```
     *
     * @example Configure network options (not restrictions)
     * ```typescript
     * sandbox: {
     *   enabled: true,
     *   network: {
     *     allowLocalBinding: true,
     *     allowUnixSockets: ['/var/run/docker.sock']
     *   }
     * }
     * ```
     *
     * @see https://docs.anthropic.com/en/docs/claude-code/settings#sandbox-settings
     */
    sandbox?: SandboxSettings;
    /**
     * Control which filesystem settings to load.
     * - `'user'` - Global user settings (`~/.claude/settings.json`)
     * - `'project'` - Project settings (`.claude/settings.json`)
     * - `'local'` - Local settings (`.claude/settings.local.json`)
     *
     * When omitted or empty, no filesystem settings are loaded (SDK isolation mode).
     * Must include `'project'` to load CLAUDE.md files.
     */
    settingSources?: SettingSource[];
    /**
     * Callback for stderr output from the Claude Code process.
     * Useful for debugging and logging.
     */
    stderr?: (data: string) => void;
    /**
     * Enforce strict validation of MCP server configurations.
     * When true, invalid configurations will cause errors instead of warnings.
     */
    strictMcpConfig?: boolean;
    /**
     * System prompt configuration.
     * - `string` - Use a custom system prompt
     * - `{ type: 'preset', preset: 'claude_code' }` - Use Claude Code's default system prompt
     * - `{ type: 'preset', preset: 'claude_code', append: '...' }` - Use default prompt with appended instructions
     *
     * @example Custom prompt
     * ```typescript
     * systemPrompt: 'You are a helpful coding assistant.'
     * ```
     *
     * @example Default with additions
     * ```typescript
     * systemPrompt: {
     *   type: 'preset',
     *   preset: 'claude_code',
     *   append: 'Always explain your reasoning.'
     * }
     * ```
     */
    systemPrompt?: string | {
        type: 'preset';
        preset: 'claude_code';
        append?: string;
    };
    /**
     * Custom function to spawn the Claude Code process.
     * Use this to run Claude Code in VMs, containers, or remote environments.
     *
     * When provided, this function is called instead of the default local spawn.
     * The default behavior checks if the executable exists before spawning.
     *
     * @example
     * ```typescript
     * spawnClaudeCodeProcess: (options) => {
     *   // Custom spawn logic for VM execution
     *   // options contains: command, args, cwd, env, signal
     *   return myVMProcess; // Must satisfy SpawnedProcess interface
     * }
     * ```
     */
    spawnClaudeCodeProcess?: (options: SpawnOptions) => SpawnedProcess;
};
export declare function query(_params: {
    prompt: string | AsyncIterable<SDKUserMessage>;
    options?: Options;
}): Query;
/**
 * V2 API - UNSTABLE
 * Create a persistent session for multi-turn conversations
 */
export declare function unstable_v2_createSession(_options: SDKSessionOptions): SDKSession;
/**
 * V2 API - UNSTABLE
 * Resume an existing session by ID
 */
export declare function unstable_v2_resumeSession(_sessionId: string, _options: SDKSessionOptions): SDKSession;
/**
 * V2 API - UNSTABLE
 * One-shot convenience function for single prompts
 *
 * @example
 * ```typescript
 * const result = await unstable_v2_prompt("What files are here?", {
 *   model: 'claude-sonnet-4-5-20250929'
 * })
 * ```
 */
export declare function unstable_v2_prompt(_message: string, _options: SDKSessionOptions): Promise<SDKResultMessage>;
export { SpawnOptions, SpawnedProcess, Transport };

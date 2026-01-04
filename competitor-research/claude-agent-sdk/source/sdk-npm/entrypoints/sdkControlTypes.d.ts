import { type AccountInfo, type PermissionMode, type SDKMessage, type SDKUserMessage, type HookInput, type HookEvent, type PermissionUpdate, type ModelInfo, type SlashCommand, type AgentDefinition, type McpServerConfigForProcessTransport } from './agentSdkTypes.js';
import type { JSONRPCMessage } from '@modelcontextprotocol/sdk/types.js';
export type SDKControlInitializeRequest = {
    subtype: 'initialize';
    hooks?: Partial<Record<HookEvent, SDKHookCallbackMatcher[]>>;
    sdkMcpServers?: string[];
    jsonSchema?: Record<string, unknown>;
    systemPrompt?: string;
    appendSystemPrompt?: string;
    agents?: Record<string, AgentDefinition>;
};
export type SDKControlInitializeResponse = {
    commands: SlashCommand[];
    output_style: string;
    available_output_styles: string[];
    models: ModelInfo[];
    account: AccountInfo;
};
export type SDKControlInterruptRequest = {
    subtype: 'interrupt';
};
export type SDKControlPermissionRequest = {
    subtype: 'can_use_tool';
    tool_name: string;
    input: Record<string, unknown>;
    permission_suggestions?: PermissionUpdate[];
    blocked_path?: string;
    decision_reason?: string;
    tool_use_id: string;
    agent_id?: string;
};
export type SDKControlSetPermissionModeRequest = {
    subtype: 'set_permission_mode';
    mode: PermissionMode;
};
export type SDKControlSetModelRequest = {
    subtype: 'set_model';
    model?: string;
};
export type SDKControlSetMaxThinkingTokensRequest = {
    subtype: 'set_max_thinking_tokens';
    max_thinking_tokens: number | null;
};
export type SDKControlMcpStatusRequest = {
    subtype: 'mcp_status';
};
export type SDKControlRewindFilesRequest = {
    subtype: 'rewind_files';
    user_message_id: string;
};
export type SDKHookCallbackMatcher = {
    matcher?: string;
    hookCallbackIds: string[];
    /** Timeout in seconds for all hooks in this matcher */
    timeout?: number;
};
export type SDKHookCallbackRequest = {
    subtype: 'hook_callback';
    callback_id: string;
    input: HookInput;
    tool_use_id?: string;
};
export type SDKControlMcpMessageRequest = {
    subtype: 'mcp_message';
    server_name: string;
    message: JSONRPCMessage;
};
export type SDKControlMcpSetServersRequest = {
    subtype: 'mcp_set_servers';
    servers: Record<string, McpServerConfigForProcessTransport>;
};
export type SDKControlMcpSetServersResponse = {
    added: string[];
    removed: string[];
    errors: Record<string, string>;
};
export type SDKControlRequest = {
    type: 'control_request';
    request_id: string;
    request: SDKControlInterruptRequest | SDKControlPermissionRequest | SDKControlInitializeRequest | SDKControlSetPermissionModeRequest | SDKControlSetModelRequest | SDKControlSetMaxThinkingTokensRequest | SDKControlMcpStatusRequest | SDKHookCallbackRequest | SDKControlMcpMessageRequest | SDKControlRewindFilesRequest | SDKControlMcpSetServersRequest;
};
export type SDKControlResponse = {
    type: 'control_response';
    response: ControlResponse | ControlErrorResponse;
};
export type ControlResponse = {
    subtype: 'success';
    request_id: string;
    response?: Record<string, unknown>;
};
export type ControlErrorResponse = {
    subtype: 'error';
    request_id: string;
    error: string;
    pending_permission_requests?: SDKControlRequest[];
};
export type SDKControlCancelRequest = {
    type: 'control_cancel_request';
    request_id: string;
};
export type SDKKeepAliveMessage = {
    type: 'keep_alive';
};
export type StdoutMessage = SDKMessage | SDKControlResponse | SDKControlRequest | SDKControlCancelRequest | SDKKeepAliveMessage;
export type StdinMessage = SDKUserMessage | SDKControlRequest | SDKControlResponse | SDKKeepAliveMessage;

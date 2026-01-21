/**
 * Conversation Store Service
 *
 * Handles UCF (Unified Conversation Format) persistence.
 * Saves/loads conversations to ~/.yume/conversations/
 */

import { invoke } from '@tauri-apps/api/core';
import type {
  UnifiedConversation,
  ConversationStore as IConversationStore,
} from '../types/ucf';
import { decodeClaudeProjectPath } from '../utils/helpers';

// =============================================================================
// Types
// =============================================================================

interface ConversationMetadata {
  id: string;
  title?: string;
  updated: string;
  created: string;
  currentProvider: string;
  currentModel: string;
  messageCount: number;
  totalCost: number;
}

// =============================================================================
// Path Helpers
// =============================================================================

class ConversationStorePaths {
  private baseDir: string | null = null;

  async getBaseDir(): Promise<string> {
    if (this.baseDir) {
      return this.baseDir;
    }

    // Get home directory from Tauri
    const homeDir = await invoke<string>('get_home_directory').catch(() => {
      // Fallback for different platforms
      if (typeof window !== 'undefined' && (window as Record<string, unknown>).__TAURI__) {
        return '~/.yume';
      }
      throw new Error('Failed to get home directory');
    });

    this.baseDir = `${homeDir}/.yume/conversations`;
    return this.baseDir;
  }

  async getConversationPath(sessionId: string): Promise<string> {
    // Validate sessionId to prevent path traversal
    if (sessionId.includes('../') || sessionId.includes('..\\')) {
      throw new Error('Invalid session ID: path traversal detected');
    }
    const baseDir = await this.getBaseDir();
    return `${baseDir}/${sessionId}.json`;
  }

  async getMetadataPath(sessionId: string): Promise<string> {
    // Validate sessionId to prevent path traversal
    if (sessionId.includes('../') || sessionId.includes('..\\')) {
      throw new Error('Invalid session ID: path traversal detected');
    }
    const baseDir = await this.getBaseDir();
    return `${baseDir}/${sessionId}.meta.json`;
  }

  async getBackupPath(sessionId: string, timestamp: number): Promise<string> {
    // Validate sessionId to prevent path traversal
    if (sessionId.includes('../') || sessionId.includes('..\\')) {
      throw new Error('Invalid session ID: path traversal detected');
    }
    const baseDir = await this.getBaseDir();
    return `${baseDir}/backups/${sessionId}.${timestamp}.json`;
  }

  async getBackupsDir(): Promise<string> {
    const baseDir = await this.getBaseDir();
    return `${baseDir}/backups`;
  }
}

const paths = new ConversationStorePaths();

// =============================================================================
// Directory Management
// =============================================================================

async function ensureConversationDirectories(): Promise<void> {
  // write_file_content automatically creates parent directories,
  // so we don't need explicit directory creation.
  // Directories will be created when first file is written.
}

// =============================================================================
// Metadata Helpers
// =============================================================================

function extractMetadata(conv: UnifiedConversation): ConversationMetadata {
  return {
    id: conv.id,
    title: conv.title,
    updated: conv.updated,
    created: conv.created,
    currentProvider: conv.currentProvider,
    currentModel: conv.currentModel,
    messageCount: conv.messages.length,
    totalCost: conv.usage.totalCost,
  };
}

async function saveMetadata(sessionId: string, conv: UnifiedConversation): Promise<void> {
  const metaPath = await paths.getMetadataPath(sessionId);
  const metadata = extractMetadata(conv);

  await invoke('write_file_content', {
    path: metaPath,
    content: JSON.stringify(metadata, null, 2),
  });
}

async function loadMetadata(sessionId: string): Promise<ConversationMetadata | null> {
  const metaPath = await paths.getMetadataPath(sessionId);

  try {
    const content = await invoke<string>('read_file_content', { path: metaPath });
    return JSON.parse(content) as ConversationMetadata;
  } catch {
    return null;
  }
}

// =============================================================================
// Backup Management
// =============================================================================

async function createBackup(sessionId: string, conv: UnifiedConversation): Promise<void> {
  const timestamp = Date.now();
  const backupPath = await paths.getBackupPath(sessionId, timestamp);

  await invoke('write_file_content', {
    path: backupPath,
    content: JSON.stringify(conv, null, 2),
  });

  // Clean up old backups (keep last 5)
  await cleanupOldBackups(sessionId);
}

async function cleanupOldBackups(sessionId: string): Promise<void> {
  const backupDir = `${await paths.getBaseDir()}/backups`;
  const allBackups = await invoke<string[]>('list_directory', { path: backupDir });

  // Filter backups for this session and sort by timestamp (newest first)
  const sessionBackups = allBackups
    .filter((f) => f.startsWith(`${sessionId}.`) && f.endsWith('.json'))
    .sort((a, b) => b.localeCompare(a)); // Timestamps sort alphabetically as ISO strings

  // Keep only the 5 most recent backups
  const MAX_BACKUPS = 5;
  const toDelete = sessionBackups.slice(MAX_BACKUPS);

  for (const file of toDelete) {
    await invoke('delete_file', { path: `${backupDir}/${file}` }).catch(() => {});
  }
}

// =============================================================================
// Claude JSONL Import
// =============================================================================

interface ClaudeJSONLMessage {
  role: 'user' | 'assistant';
  content: Array<
    | { type: 'text'; text: string }
    | { type: 'thinking'; thinking: string }
    | { type: 'tool_use'; id: string; name: string; input: Record<string, unknown> }
    | { type: 'tool_result'; tool_use_id: string; content: string; is_error?: boolean }
    | { type: 'image'; source: { type: 'base64'; media_type: string; data: string } }
  >;
  timestamp?: string;
  usage?: {
    input_tokens?: number;
    output_tokens?: number;
    cache_read_input_tokens?: number;
    cache_creation_input_tokens?: number;
  };
  model?: string;
}

async function importFromClaudeJSONL(jsonlPath: string): Promise<UnifiedConversation> {
  const content = await invoke<string>('read_file_content', { path: jsonlPath });
  const lines = content.split('\n').filter((line) => line.trim());

  const messages: UnifiedConversation['messages'] = [];
  let totalInputTokens = 0;
  let totalOutputTokens = 0;
  let totalCacheReadTokens = 0;
  let totalCacheCreationTokens = 0;

  for (const line of lines) {
    try {
      const msg = JSON.parse(line) as ClaudeJSONLMessage;

      // Convert Claude message to UCF message
      const unifiedContent = msg.content.map((block) => {
        switch (block.type) {
          case 'text':
            return { type: 'text' as const, text: block.text };
          case 'thinking':
            return {
              type: 'thinking' as const,
              text: block.thinking,
              provider: 'claude' as const,
            };
          case 'tool_use':
            // Tool use is stored in toolCalls, not content
            return null;
          case 'tool_result':
            // Tool result is stored in toolResults, not content
            return null;
          case 'image':
            return {
              type: 'image' as const,
              mimeType: block.source.media_type,
              data: block.source.data,
            };
          default:
            return { type: 'text' as const, text: JSON.stringify(block) };
        }
      }).filter((c): c is NonNullable<typeof c> => c !== null);

      // Extract tool calls
      const toolCalls = msg.content
        .filter((block): block is Extract<typeof block, { type: 'tool_use' }> => block.type === 'tool_use')
        .map((block) => ({
          id: block.id,
          originalId: block.id,
          name: block.name,
          input: block.input,
          status: 'completed' as const,
        }));

      // Extract tool results
      const toolResults = msg.content
        .filter((block): block is Extract<typeof block, { type: 'tool_result' }> => block.type === 'tool_result')
        .map((block) => ({
          toolCallId: block.tool_use_id,
          originalToolCallId: block.tool_use_id,
          name: '', // Name not available in tool_result
          content: block.content,
          isError: block.is_error || false,
        }));

      // Track usage
      if (msg.usage) {
        totalInputTokens += msg.usage.input_tokens || 0;
        totalOutputTokens += msg.usage.output_tokens || 0;
        totalCacheReadTokens += msg.usage.cache_read_input_tokens || 0;
        totalCacheCreationTokens += msg.usage.cache_creation_input_tokens || 0;
      }

      messages.push({
        id: `msg-${Date.now()}-${messages.length}`,
        timestamp: msg.timestamp || new Date().toISOString(),
        role: msg.role,
        provider: 'claude',
        model: msg.model,
        content: unifiedContent,
        toolCalls: toolCalls.length > 0 ? toolCalls : undefined,
        toolResults: toolResults.length > 0 ? toolResults : undefined,
        usage: msg.usage ? {
          inputTokens: msg.usage.input_tokens || 0,
          outputTokens: msg.usage.output_tokens || 0,
          cacheReadTokens: msg.usage.cache_read_input_tokens,
          cacheCreationTokens: msg.usage.cache_creation_input_tokens,
        } : undefined,
      });
    } catch (err) {
      logger.warn('Failed to parse JSONL line:', err);
    }
  }

  // Extract session ID from path (e.g., /path/to/session-id.jsonl)
  const sessionId = jsonlPath.split('/').pop()?.replace('.jsonl', '') || `imported-${Date.now()}`;

  // Get working directory from path (Claude stores in ~/.claude/projects/-path-escaped/)
  const cwd = await extractCwdFromClaudePath(jsonlPath);

  const conversation: UnifiedConversation = {
    id: sessionId,
    version: '1.0',
    created: messages[0]?.timestamp || new Date().toISOString(),
    updated: messages[messages.length - 1]?.timestamp || new Date().toISOString(),
    cwd,
    currentProvider: 'claude',
    currentModel: messages.find((m) => m.model)?.model || 'claude-sonnet-4-5',
    messages,
    usage: {
      totalInputTokens,
      totalOutputTokens,
      totalCacheReadTokens,
      totalCacheCreationTokens,
      totalCost: 0, // Will be calculated later
      byProvider: {
        claude: {
          inputTokens: totalInputTokens,
          outputTokens: totalOutputTokens,
          cacheReadTokens: totalCacheReadTokens,
          cacheCreationTokens: totalCacheCreationTokens,
          cost: 0,
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

  return conversation;
}

async function extractCwdFromClaudePath(jsonlPath: string): Promise<string> {
  // Claude paths look like: ~/.claude/projects/-Users-yuru-project/session-id.jsonl
  const match = jsonlPath.match(/\.claude\/projects\/(-[^/]+)\//);
  if (match) {
    // Smart decode: try filesystem check to handle dashes in folder names
    const checkPath = async (path: string): Promise<boolean> => {
      try {
        return await invoke<boolean>('check_is_directory', { path });
      } catch {
        return false;
      }
    };
    return await decodeClaudeProjectPath(match[1], checkPath);
  }
  // Fallback to empty string if path cannot be determined
  return '';
}

// =============================================================================
// Conversation Store Implementation
// =============================================================================

class ConversationStoreImpl implements IConversationStore {
  /**
   * Save a conversation to disk
   */
  async save(sessionId: string, conv: UnifiedConversation): Promise<void> {
    await ensureConversationDirectories();

    // Create backup of existing conversation
    const existing = await this.load(sessionId);
    if (existing) {
      await createBackup(sessionId, existing);
    }

    // Update timestamp
    conv.updated = new Date().toISOString();

    // Save conversation file
    const convPath = await paths.getConversationPath(sessionId);
    await invoke('write_file_content', {
      path: convPath,
      content: JSON.stringify(conv, null, 2),
    });

    // Save metadata for quick listing
    await saveMetadata(sessionId, conv);
  }

  /**
   * Load a conversation from disk
   */
  async load(sessionId: string): Promise<UnifiedConversation | null> {
    const convPath = await paths.getConversationPath(sessionId);

    try {
      const content = await invoke<string>('read_file_content', { path: convPath });
      return JSON.parse(content) as UnifiedConversation;
    } catch {
      return null;
    }
  }

  /**
   * List all saved conversations (uses metadata for performance)
   */
  async list(): Promise<{ id: string; title?: string; updated: string }[]> {
    const baseDir = await paths.getBaseDir();
    const files = await invoke<string[]>('list_directory', { path: baseDir });

    const results: { id: string; title?: string; updated: string }[] = [];

    for (const file of files) {
      // Only look at .meta.json files
      if (!file.endsWith('.meta.json')) continue;

      const sessionId = file.replace('.meta.json', '');
      const metaPath = await paths.getMetadataPath(sessionId);

      try {
        const metaContent = await invoke<string | null>('read_file_content', { path: metaPath });
        if (metaContent) {
          const meta = JSON.parse(metaContent);
          results.push({
            id: sessionId,
            title: meta.title,
            updated: meta.updated,
          });
        }
      } catch {
        // Skip files that can't be read
      }
    }

    // Sort by updated (most recent first)
    results.sort((a, b) => new Date(b.updated).getTime() - new Date(a.updated).getTime());

    return results;
  }

  /**
   * Delete a conversation and its metadata
   */
  async delete(sessionId: string): Promise<void> {
    const convPath = await paths.getConversationPath(sessionId);
    const metaPath = await paths.getMetadataPath(sessionId);

    // Delete main files
    await invoke('delete_file', { path: convPath }).catch(() => {});
    await invoke('delete_file', { path: metaPath }).catch(() => {});

    // Delete backups
    const backupDir = `${await paths.getBaseDir()}/backups`;
    const backupFiles = await invoke<string[]>('list_directory', { path: backupDir });
    const prefix = `${sessionId}.`;

    for (const file of backupFiles) {
      if (file.startsWith(prefix)) {
        await invoke('delete_file', { path: `${backupDir}/${file}` }).catch(() => {});
      }
    }
  }

  /**
   * Import a Claude JSONL file and convert to UCF
   */
  async importFromClaude(jsonlPath: string): Promise<UnifiedConversation> {
    const conversation = await importFromClaudeJSONL(jsonlPath);

    // Save the imported conversation
    await this.save(conversation.id, conversation);

    return conversation;
  }

  /**
   * Sync UCF with provider session files
   * (Placeholder - actual implementation depends on provider)
   */
  async sync(sessionId: string): Promise<void> {
    const conv = await this.load(sessionId);
    if (!conv) {
      throw new Error(`Conversation ${sessionId} not found`);
    }

    // Get provider-specific session file
    const claudeState = conv.providerState.claude;
    if (claudeState?.sessionFile) {
      // Re-import from Claude JSONL to sync changes
      const updated = await importFromClaudeJSONL(claudeState.sessionFile);

      // Preserve UCF metadata but update messages
      conv.messages = updated.messages;
      conv.usage = updated.usage;
      conv.updated = new Date().toISOString();

      if (claudeState) {
        claudeState.lastSyncedAt = new Date().toISOString();
      }

      await this.save(sessionId, conv);
    }

    // TODO: Add Gemini and OpenAI sync when implemented
  }
}

// =============================================================================
// Export Singleton
// =============================================================================

export const conversationStore = new ConversationStoreImpl();
export default conversationStore;

/**
 * Memory Service - Manages the built-in MCP memory server
 *
 * Uses @modelcontextprotocol/server-memory to provide persistent memory
 * across Claude sessions. Memory is stored in ~/.yume/memory.jsonl
 *
 * Memory is stored as a knowledge graph with:
 * - Entities: Named nodes with observations (facts)
 * - Relations: Connections between entities
 */

import { invoke } from '@tauri-apps/api/core';
import { useClaudeCodeStore } from '../stores/claudeCodeStore';

// Types matching Rust structs
export interface MemoryEntity {
  name: string;
  entityType: string;
  observations: string[];
}

export interface MemoryRelation {
  from: string;
  to: string;
  relationType: string;
}

interface MemoryServerResult {
  success: boolean;
  error?: string;
}

interface MemoryQueryResult {
  success: boolean;
  entities?: MemoryEntity[];
  relations?: MemoryRelation[];
  error?: string;
}

class MemoryService {
  private isStarting = false;
  private isStopping = false;

  /**
   * Start the memory MCP server
   */
  async start(): Promise<boolean> {
    if (this.isStarting) {
      console.log('[MemoryService] Already starting...');
      return false;
    }

    const store = useClaudeCodeStore.getState();
    if (store.memoryServerRunning) {
      console.log('[MemoryService] Server already running');
      return true;
    }

    this.isStarting = true;
    console.log('[MemoryService] Starting memory server...');

    try {
      const result = await invoke<MemoryServerResult>('start_memory_server');

      if (result.success) {
        console.log('[MemoryService] Memory server started successfully');
        useClaudeCodeStore.getState().setMemoryServerRunning(true);
        return true;
      } else {
        console.error('[MemoryService] Failed to start:', result.error);
        return false;
      }
    } catch (error) {
      console.error('[MemoryService] Error starting server:', error);
      return false;
    } finally {
      this.isStarting = false;
    }
  }

  /**
   * Stop the memory MCP server
   */
  async stop(): Promise<boolean> {
    if (this.isStopping) {
      console.log('[MemoryService] Already stopping...');
      return false;
    }

    const store = useClaudeCodeStore.getState();
    if (!store.memoryServerRunning) {
      console.log('[MemoryService] Server not running');
      return true;
    }

    this.isStopping = true;
    console.log('[MemoryService] Stopping memory server...');

    try {
      const result = await invoke<MemoryServerResult>('stop_memory_server');

      if (result.success) {
        console.log('[MemoryService] Memory server stopped successfully');
        useClaudeCodeStore.getState().setMemoryServerRunning(false);
        return true;
      } else {
        console.error('[MemoryService] Failed to stop:', result.error);
        return false;
      }
    } catch (error) {
      console.error('[MemoryService] Error stopping server:', error);
      return false;
    } finally {
      this.isStopping = false;
    }
  }

  /**
   * Check if memory server is running
   */
  async checkStatus(): Promise<boolean> {
    try {
      const result = await invoke<{ running: boolean }>('check_memory_server');
      useClaudeCodeStore.getState().setMemoryServerRunning(result.running);
      return result.running;
    } catch (error) {
      console.error('[MemoryService] Error checking status:', error);
      return false;
    }
  }

  /**
   * Initialize memory service on app startup
   */
  async initialize(): Promise<void> {
    const store = useClaudeCodeStore.getState();

    await this.checkStatus();

    if (store.memoryEnabled && !store.memoryServerRunning) {
      console.log('[MemoryService] Auto-starting memory server...');
      await this.start();
    }
  }

  /**
   * Get the memory file path
   */
  async getMemoryFilePath(): Promise<string> {
    try {
      return await invoke<string>('get_memory_file_path');
    } catch (error) {
      console.error('[MemoryService] Error getting memory file path:', error);
      return '';
    }
  }

  // ==================== Knowledge Graph Operations ====================

  /**
   * Create entities in the knowledge graph
   */
  async createEntities(entities: MemoryEntity[]): Promise<boolean> {
    if (!useClaudeCodeStore.getState().memoryServerRunning) {
      console.warn('[MemoryService] Server not running, cannot create entities');
      return false;
    }

    try {
      const result = await invoke<MemoryServerResult>('memory_create_entities', { entities });
      if (!result.success) {
        console.error('[MemoryService] Failed to create entities:', result.error);
      }
      return result.success;
    } catch (error) {
      console.error('[MemoryService] Error creating entities:', error);
      return false;
    }
  }

  /**
   * Create relations between entities
   */
  async createRelations(relations: MemoryRelation[]): Promise<boolean> {
    if (!useClaudeCodeStore.getState().memoryServerRunning) {
      console.warn('[MemoryService] Server not running, cannot create relations');
      return false;
    }

    try {
      const result = await invoke<MemoryServerResult>('memory_create_relations', { relations });
      if (!result.success) {
        console.error('[MemoryService] Failed to create relations:', result.error);
      }
      return result.success;
    } catch (error) {
      console.error('[MemoryService] Error creating relations:', error);
      return false;
    }
  }

  /**
   * Add observations to an existing entity
   */
  async addObservations(entityName: string, observations: string[]): Promise<boolean> {
    if (!useClaudeCodeStore.getState().memoryServerRunning) {
      console.warn('[MemoryService] Server not running, cannot add observations');
      return false;
    }

    try {
      const result = await invoke<MemoryServerResult>('memory_add_observations', {
        entityName,
        observations
      });
      if (!result.success) {
        console.error('[MemoryService] Failed to add observations:', result.error);
      }
      return result.success;
    } catch (error) {
      console.error('[MemoryService] Error adding observations:', error);
      return false;
    }
  }

  /**
   * Search for nodes matching a query
   */
  async searchNodes(query: string): Promise<{ entities: MemoryEntity[]; relations: MemoryRelation[] }> {
    if (!useClaudeCodeStore.getState().memoryServerRunning) {
      console.warn('[MemoryService] Server not running, cannot search');
      return { entities: [], relations: [] };
    }

    try {
      const result = await invoke<MemoryQueryResult>('memory_search_nodes', { query });
      if (result.success) {
        return {
          entities: result.entities || [],
          relations: result.relations || []
        };
      }
      console.error('[MemoryService] Search failed:', result.error);
      return { entities: [], relations: [] };
    } catch (error) {
      console.error('[MemoryService] Error searching nodes:', error);
      return { entities: [], relations: [] };
    }
  }

  /**
   * Read the entire knowledge graph
   */
  async readGraph(): Promise<{ entities: MemoryEntity[]; relations: MemoryRelation[] }> {
    if (!useClaudeCodeStore.getState().memoryServerRunning) {
      console.warn('[MemoryService] Server not running, cannot read graph');
      return { entities: [], relations: [] };
    }

    try {
      const result = await invoke<MemoryQueryResult>('memory_read_graph');
      if (result.success) {
        return {
          entities: result.entities || [],
          relations: result.relations || []
        };
      }
      console.error('[MemoryService] Read graph failed:', result.error);
      return { entities: [], relations: [] };
    } catch (error) {
      console.error('[MemoryService] Error reading graph:', error);
      return { entities: [], relations: [] };
    }
  }

  /**
   * Delete an entity and its relations
   */
  async deleteEntity(entityName: string): Promise<boolean> {
    if (!useClaudeCodeStore.getState().memoryServerRunning) {
      console.warn('[MemoryService] Server not running, cannot delete entity');
      return false;
    }

    try {
      const result = await invoke<MemoryServerResult>('memory_delete_entity', { entityName });
      if (!result.success) {
        console.error('[MemoryService] Failed to delete entity:', result.error);
      }
      return result.success;
    } catch (error) {
      console.error('[MemoryService] Error deleting entity:', error);
      return false;
    }
  }

  // ==================== High-Level Memory Operations ====================

  /**
   * Remember a fact about the current project
   * Creates or updates an entity with the observation
   */
  async remember(projectPath: string, fact: string, category: string = 'observation'): Promise<boolean> {
    // Create project entity if needed, then add observation
    const entityName = `project:${projectPath.replace(/\//g, '-').replace(/^-/, '')}`;

    // Try to add observation to existing entity
    const result = await this.addObservations(entityName, [fact]);

    if (!result) {
      // Entity might not exist, create it first
      const created = await this.createEntities([{
        name: entityName,
        entityType: 'project',
        observations: [fact]
      }]);
      return created;
    }

    return result;
  }

  /**
   * Remember a coding pattern or best practice
   */
  async rememberPattern(pattern: string, context: string): Promise<boolean> {
    const entityName = `pattern:${pattern.toLowerCase().replace(/\s+/g, '-').substring(0, 50)}`;

    return this.createEntities([{
      name: entityName,
      entityType: 'coding_pattern',
      observations: [context]
    }]);
  }

  /**
   * Remember an error and its solution
   */
  async rememberErrorFix(error: string, solution: string): Promise<boolean> {
    const errorHash = error.substring(0, 30).toLowerCase().replace(/\s+/g, '-');
    const entityName = `error:${errorHash}`;

    return this.createEntities([{
      name: entityName,
      entityType: 'error_solution',
      observations: [`Error: ${error}`, `Solution: ${solution}`]
    }]);
  }

  /**
   * Get relevant memories for a given context
   * Returns formatted string suitable for injection into prompts
   */
  async getRelevantMemories(context: string, maxResults: number = 5): Promise<string> {
    if (!useClaudeCodeStore.getState().memoryServerRunning) {
      return '';
    }

    try {
      // Extract key terms from context for search
      const searchTerms = context
        .toLowerCase()
        .split(/\s+/)
        .filter(word => word.length > 3)
        .slice(0, 5)
        .join(' ');

      if (!searchTerms) return '';

      const { entities } = await this.searchNodes(searchTerms);

      if (entities.length === 0) return '';

      // Format memories for prompt injection
      const memories = entities
        .slice(0, maxResults)
        .map(entity => {
          const observations = entity.observations.slice(0, 3).join('; ');
          return `- [${entity.entityType}] ${entity.name}: ${observations}`;
        })
        .join('\n');

      return `<memory-context>\nRelevant memories from past sessions:\n${memories}\n</memory-context>`;
    } catch (error) {
      console.error('[MemoryService] Error getting relevant memories:', error);
      return '';
    }
  }

  /**
   * Extract and store learnings from an assistant response
   * Call this after receiving a response to auto-extract useful patterns
   */
  async extractLearnings(projectPath: string, userMessage: string, assistantResponse: string): Promise<void> {
    if (!useClaudeCodeStore.getState().memoryServerRunning) {
      return;
    }

    // Look for patterns worth remembering:
    // 1. Error fixes (if user asked about error and got solution)
    // 2. Architecture decisions
    // 3. Coding patterns used

    try {
      // Check if this was an error-related conversation
      const errorPatterns = /error|bug|fix|issue|problem|crash|fail/i;
      const isErrorFix = errorPatterns.test(userMessage) && assistantResponse.length > 100;

      if (isErrorFix) {
        // Extract a summary (first 200 chars of each)
        const errorSummary = userMessage.substring(0, 200);
        const fixSummary = assistantResponse.substring(0, 500);

        await this.rememberErrorFix(errorSummary, fixSummary);
        console.log('[MemoryService] Stored error/fix pattern');
      }

      // Check for architectural decisions
      const archPatterns = /should (use|prefer|avoid)|best practice|pattern|architecture|design/i;
      if (archPatterns.test(userMessage) || archPatterns.test(assistantResponse)) {
        const decision = assistantResponse.substring(0, 300);
        await this.remember(projectPath, `Architecture decision: ${decision}`, 'architecture');
        console.log('[MemoryService] Stored architecture decision');
      }
    } catch (error) {
      console.error('[MemoryService] Error extracting learnings:', error);
    }
  }
}

// Export singleton instance
export const memoryService = new MemoryService();

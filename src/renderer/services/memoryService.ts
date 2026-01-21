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

// Lazy import to avoid circular dependency with claudeCodeStore
// The store imports memoryService dynamically, so we must not import it statically here
let _storeModule: typeof import('../stores/claudeCodeStore') | null = null;
async function getStore() {
  if (!_storeModule) {
    _storeModule = await import('../stores/claudeCodeStore');
  }
  return _storeModule.useClaudeCodeStore;
}

// Synchronous getter for use in methods that can't be async
// Falls back to null if not loaded yet
function getStoreSync() {
  return _storeModule?.useClaudeCodeStore ?? null;
}

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

// Simple hash function for entity naming (djb2 algorithm)
function simpleHash(str: string): string {
  let hash = 5381;
  for (let i = 0; i < str.length; i++) {
    hash = ((hash << 5) + hash) ^ str.charCodeAt(i);
  }
  // Convert to positive 8-char hex
  return (hash >>> 0).toString(16).padStart(8, '0');
}

// Timestamp prefix format: [ISO_DATE] content
const TIMESTAMP_REGEX = /^\[(\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{3})?Z?)\]\s*/;

// Add timestamp prefix to observation
function timestampObservation(content: string): string {
  // Don't double-timestamp
  if (TIMESTAMP_REGEX.test(content)) {
    return content;
  }
  return `[${new Date().toISOString()}] ${content}`;
}

// Parse timestamp from observation
export function parseObservationTimestamp(observation: string): { date: Date | null; content: string } {
  const match = observation.match(TIMESTAMP_REGEX);
  if (match) {
    const dateStr = match[1].endsWith('Z') ? match[1] : match[1] + 'Z';
    return {
      date: new Date(dateStr),
      content: observation.slice(match[0].length)
    };
  }
  return { date: null, content: observation };
}

// Get basename from path (cross-platform)
function getBasename(path: string): string {
  const parts = path.replace(/\\/g, '/').split('/').filter(Boolean);
  return parts[parts.length - 1] || 'root';
}

// Create safe entity name from path
function pathToEntityName(path: string): string {
  const hash = simpleHash(path);
  const basename = getBasename(path).substring(0, 20);
  return `project:${hash}-${basename}`;
}

class MemoryService {
  // RACE CONDITION FIX: Use Promise-based guards instead of boolean flags
  // This ensures multiple concurrent calls wait for the same operation to complete
  // rather than returning early with stale results
  private startPromise: Promise<boolean> | null = null;
  private stopPromise: Promise<boolean> | null = null;

  /**
   * Start the memory MCP server
   *
   * RACE CONDITION FIX: If multiple calls happen before first completes,
   * they all wait for the same Promise instead of each starting their own.
   */
  async start(): Promise<boolean> {
    console.log('[MemoryService] start() called');

    // If already starting, return the existing promise (deduplicate concurrent calls)
    if (this.startPromise) {
      console.log('[MemoryService] Already starting, waiting for existing operation...');
      return this.startPromise;
    }

    const useClaudeCodeStore = await getStore();
    const store = useClaudeCodeStore.getState();
    if (store.memoryServerRunning) {
      console.log('[MemoryService] Server already running');
      return true;
    }

    console.log('[MemoryService] Starting memory server via tauri...');

    // Create and store the promise for concurrent callers to share
    this.startPromise = (async () => {
      try {
        console.log('[MemoryService] Invoking start_memory_server command...');
        const result = await invoke<MemoryServerResult>('start_memory_server');
        console.log('[MemoryService] Tauri start_memory_server result:', JSON.stringify(result));

        if (result.success) {
          console.log('[MemoryService] Memory server started successfully');
          const store = await getStore();
          store.getState().setMemoryServerRunning(true);
          return true;
        } else {
          console.error('[MemoryService] Failed to start:', result.error);
          return false;
        }
      } catch (error) {
        console.error('[MemoryService] Error starting server:', error);
        return false;
      } finally {
        // Clear promise after completion so next call can start fresh
        this.startPromise = null;
      }
    })();

    return this.startPromise;
  }

  /**
   * Stop the memory MCP server
   *
   * RACE CONDITION FIX: Same pattern as start() - deduplicate concurrent calls
   */
  async stop(): Promise<boolean> {
    // If already stopping, return the existing promise
    if (this.stopPromise) {
      console.log('[MemoryService] Already stopping, waiting for existing operation...');
      return this.stopPromise;
    }

    const useClaudeCodeStore = await getStore();
    const store = useClaudeCodeStore.getState();
    if (!store.memoryServerRunning) {
      console.log('[MemoryService] Server not running');
      return true;
    }

    console.log('[MemoryService] Stopping memory server...');

    this.stopPromise = (async () => {
      try {
        const result = await invoke<MemoryServerResult>('stop_memory_server');

        if (result.success) {
          console.log('[MemoryService] Memory server stopped successfully');
          const store = await getStore();
          store.getState().setMemoryServerRunning(false);
          return true;
        } else {
          console.error('[MemoryService] Failed to stop:', result.error);
          return false;
        }
      } catch (error) {
        console.error('[MemoryService] Error stopping server:', error);
        return false;
      } finally {
        this.stopPromise = null;
      }
    })();

    return this.stopPromise;
  }

  /**
   * Check if memory server is running
   */
  async checkStatus(): Promise<boolean> {
    try {
      const result = await invoke<{ running: boolean }>('check_memory_server');
      const useClaudeCodeStore = await getStore();
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
    console.log('[MemoryService] Initializing...');
    const useClaudeCodeStore = await getStore();
    const store = useClaudeCodeStore.getState();
    console.log('[MemoryService] Initial state:', { memoryEnabled: store.memoryEnabled, memoryServerRunning: store.memoryServerRunning });

    await this.checkStatus();

    // Get fresh state after checkStatus
    const freshStore = useClaudeCodeStore.getState();
    console.log('[MemoryService] After checkStatus:', { memoryEnabled: freshStore.memoryEnabled, memoryServerRunning: freshStore.memoryServerRunning });

    if (freshStore.memoryEnabled && !freshStore.memoryServerRunning) {
      console.log('[MemoryService] Auto-starting memory server...');
      const started = await this.start();
      console.log('[MemoryService] Auto-start result:', started);

      // Test: write a startup marker to verify the system works
      if (started) {
        console.log('[MemoryService] Testing memory write...');
        const testResult = await this.createEntities([{
          name: 'yume:startup-test',
          entityType: 'system',
          observations: [`Memory system initialized at ${new Date().toISOString()}`]
        }]);
        console.log('[MemoryService] Test write result:', testResult);
      }
    } else {
      console.log('[MemoryService] Not auto-starting:', { memoryEnabled: freshStore.memoryEnabled, memoryServerRunning: freshStore.memoryServerRunning });
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
   * Automatically adds timestamps to observations
   */
  async createEntities(entities: MemoryEntity[]): Promise<boolean> {
    console.log('[MemoryService] createEntities called with:', JSON.stringify(entities));
    const useClaudeCodeStore = await getStore();
    if (!useClaudeCodeStore.getState().memoryServerRunning) {
      console.warn('[MemoryService] Server not running, cannot create entities');
      return false;
    }

    // Add timestamps to all observations
    const timestampedEntities = entities.map(entity => ({
      ...entity,
      observations: entity.observations.map(obs => timestampObservation(obs))
    }));

    try {
      console.log('[MemoryService] Invoking memory_create_entities...');
      const result = await invoke<MemoryServerResult>('memory_create_entities', { entities: timestampedEntities });
      console.log('[MemoryService] memory_create_entities result:', JSON.stringify(result));
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
    const useClaudeCodeStore = await getStore();
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
   * Automatically adds timestamps to observations
   */
  async addObservations(entityName: string, observations: string[]): Promise<boolean> {
    const useClaudeCodeStore = await getStore();
    if (!useClaudeCodeStore.getState().memoryServerRunning) {
      console.warn('[MemoryService] Server not running, cannot add observations');
      return false;
    }

    // Add timestamps to observations
    const timestampedObservations = observations.map(obs => timestampObservation(obs));

    try {
      const result = await invoke<MemoryServerResult>('memory_add_observations', {
        entityName,
        observations: timestampedObservations
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
    const useClaudeCodeStore = await getStore();
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
    const useClaudeCodeStore = await getStore();
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
    const useClaudeCodeStore = await getStore();
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
    // Use hash-based naming to avoid collisions
    const entityName = pathToEntityName(projectPath);

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
    const useClaudeCodeStore = await getStore();
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
    const useClaudeCodeStore = await getStore();
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

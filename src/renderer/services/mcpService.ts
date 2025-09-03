import { invoke } from '@tauri-apps/api/core';

export interface MCPServer {
  name: string;
  transport: 'stdio' | 'sse';
  command?: string;
  args?: string[];
  env?: Record<string, string>;
  url?: string;
  scope: 'local' | 'project' | 'user';
  connected?: boolean;
}

export interface AddServerResult {
  success: boolean;
  message?: string;
  error?: string;
}

export interface ImportResult {
  imported: number;
  failed: number;
  errors?: string[];
}

class MCPService {
  /**
   * Lists all configured MCP servers
   */
  async listServers(): Promise<MCPServer[]> {
    try {
      return await invoke<MCPServer[]>('mcp_list');
    } catch (error) {
      console.error('Failed to list MCP servers:', error);
      // Return empty array on error - no mock data in production
      return [];
    }
  }

  /**
   * Adds a new MCP server
   */
  async addServer(server: MCPServer): Promise<AddServerResult> {
    try {
      return await invoke<AddServerResult>('mcp_add', {
        name: server.name,
        transport: server.transport,
        command: server.command,
        args: server.args || [],
        env: server.env || {},
        url: server.url,
        scope: server.scope
      });
    } catch (error) {
      console.error('Failed to add MCP server:', error);
      return { 
        success: false, 
        error: error instanceof Error ? error.message : 'Unknown error' 
      };
    }
  }

  /**
   * Removes an MCP server
   */
  async removeServer(name: string): Promise<void> {
    try {
      await invoke('mcp_remove', { name });
    } catch (error) {
      console.error('Failed to remove MCP server:', error);
      throw error;
    }
  }

  /**
   * Tests connection to an MCP server
   */
  async testConnection(name: string): Promise<boolean> {
    try {
      const result = await invoke<string>('mcp_test_connection', { name });
      return result.toLowerCase().includes('success') || result.toLowerCase().includes('connected');
    } catch (error) {
      console.error('Failed to test connection:', error);
      return false;
    }
  }

  /**
   * Imports MCP servers from Claude Desktop configuration
   */
  async importFromClaudeDesktop(): Promise<number> {
    try {
      const result = await invoke<ImportResult>('mcp_import_claude_desktop');
      return result.imported;
    } catch (error) {
      console.error('Failed to import from Claude Desktop:', error);
      throw error;
    }
  }

  /**
   * Exports MCP configuration to JSON
   */
  async exportConfig(): Promise<string> {
    try {
      return await invoke<string>('mcp_export_config');
    } catch (error) {
      console.error('Failed to export configuration:', error);
      throw error;
    }
  }

}

// Export singleton instance
export const mcpService = new MCPService();
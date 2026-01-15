/**
 * Plugin loader for yume-cli
 *
 * Loads plugins from ~/.yume/plugins/ and provides:
 * - Agent system prompts for injection
 * - Skill matching and content injection
 * - Custom tool definitions from plugins
 */

import { readFile, readdir, stat } from 'node:fs/promises';
import { join, basename } from 'node:path';
import { homedir } from 'node:os';
import { logVerbose } from './emit.js';

// Max time to allow regex execution (prevents ReDoS)
const REGEX_TIMEOUT_MS = 100;

/**
 * Safely test a regex pattern with timeout protection
 * Returns false if regex takes too long (potential ReDoS)
 */
function safeRegexTest(pattern: string, text: string): boolean {
  const startTime = Date.now();
  try {
    // Check for obviously dangerous patterns (nested quantifiers)
    if (/(\+|\*|\?)\s*\1|\(\?.*\+|\(\.\*\)\+/.test(pattern)) {
      logVerbose(`Skipping potentially dangerous regex pattern: ${pattern}`);
      return false;
    }
    const regex = new RegExp(pattern);
    const result = regex.test(text);
    const elapsed = Date.now() - startTime;
    if (elapsed > REGEX_TIMEOUT_MS) {
      logVerbose(`Regex took ${elapsed}ms, exceeds timeout - pattern may be unsafe`);
    }
    return result;
  } catch {
    return false;
  }
}

const YUME_DIR = join(homedir(), '.yume');
const PLUGINS_DIR = join(YUME_DIR, 'plugins');

// Plugin manifest structure
interface PluginManifest {
  id: string;
  name: string;
  version: string;
  author?: string;
  description?: string;
  components?: string[];
  enabled?: boolean;
}

// Agent definition from .md file with YAML frontmatter
interface AgentDefinition {
  id: string;
  name: string;
  systemPrompt: string;
  model?: string;
  tools?: string[];
  enabled?: boolean;
}

// Skill definition
interface SkillDefinition {
  id: string;
  name: string;
  description?: string;
  triggers: string[]; // file extensions, keywords, or regex patterns
  content: string;
  enabled?: boolean;
}

// Loaded plugin with all its components
interface LoadedPlugin {
  manifest: PluginManifest;
  agents: AgentDefinition[];
  skills: SkillDefinition[];
  commands: string[]; // paths to command .md files
}

// Cache for loaded plugins
let pluginsCache: LoadedPlugin[] | null = null;

/**
 * Load all plugins from ~/.yume/plugins/
 */
export async function loadPlugins(): Promise<LoadedPlugin[]> {
  if (pluginsCache !== null) {
    return pluginsCache;
  }

  const plugins: LoadedPlugin[] = [];

  try {
    const pluginDirs = await readdir(PLUGINS_DIR);

    for (const dir of pluginDirs) {
      const pluginPath = join(PLUGINS_DIR, dir);
      const stats = await stat(pluginPath);
      if (!stats.isDirectory()) continue;

      try {
        const plugin = await loadPlugin(pluginPath);
        if (plugin && plugin.manifest.enabled !== false) {
          plugins.push(plugin);
        }
      } catch (err) {
        logVerbose(`Failed to load plugin ${dir}: ${err}`);
      }
    }
  } catch {
    // Plugins directory doesn't exist - that's fine
    logVerbose('No plugins directory found at ~/.yume/plugins/');
  }

  pluginsCache = plugins;
  return plugins;
}

/**
 * Load a single plugin from its directory
 */
async function loadPlugin(pluginPath: string): Promise<LoadedPlugin | null> {
  const manifestPath = join(pluginPath, 'plugin.json');

  try {
    const manifestContent = await readFile(manifestPath, 'utf-8');
    const manifest: PluginManifest = JSON.parse(manifestContent);

    const plugin: LoadedPlugin = {
      manifest,
      agents: [],
      skills: [],
      commands: [],
    };

    // Load agents
    const agentsDir = join(pluginPath, 'agents');
    try {
      const agentFiles = await readdir(agentsDir);
      for (const file of agentFiles) {
        if (file.endsWith('.md')) {
          const agent = await loadAgent(join(agentsDir, file));
          if (agent) {
            plugin.agents.push(agent);
          }
        }
      }
    } catch {
      // No agents directory
    }

    // Load skills
    const skillsDir = join(pluginPath, 'skills');
    try {
      const skillFiles = await readdir(skillsDir);
      for (const file of skillFiles) {
        if (file.endsWith('.json')) {
          const skill = await loadSkill(join(skillsDir, file));
          if (skill) {
            plugin.skills.push(skill);
          }
        }
      }
    } catch {
      // No skills directory
    }

    // Load commands (just paths for now)
    const commandsDir = join(pluginPath, 'commands');
    try {
      const cmdFiles = await readdir(commandsDir);
      for (const file of cmdFiles) {
        if (file.endsWith('.md')) {
          plugin.commands.push(join(commandsDir, file));
        }
      }
    } catch {
      // No commands directory
    }

    logVerbose(`Loaded plugin: ${manifest.name} (${plugin.agents.length} agents, ${plugin.skills.length} skills)`);
    return plugin;
  } catch {
    return null;
  }
}

/**
 * Load agent from .md file with YAML frontmatter
 */
async function loadAgent(filePath: string): Promise<AgentDefinition | null> {
  try {
    const content = await readFile(filePath, 'utf-8');

    // Parse YAML frontmatter (between --- markers)
    const frontmatterMatch = content.match(/^---\n([\s\S]*?)\n---\n([\s\S]*)$/);

    if (!frontmatterMatch) {
      // No frontmatter - use entire content as system prompt
      const id = basename(filePath, '.md') || 'unknown';
      return {
        id,
        name: id,
        systemPrompt: content.trim(),
      };
    }

    const [, frontmatter, body] = frontmatterMatch;

    // Simple YAML parsing for key: value pairs
    const meta: Record<string, unknown> = {};
    for (const line of frontmatter.split('\n')) {
      const match = line.match(/^(\w+):\s*(.*)$/);
      if (match) {
        const [, key, value] = match;
        // Handle arrays (tools: [a, b, c])
        if (value.startsWith('[') && value.endsWith(']')) {
          meta[key] = value
            .slice(1, -1)
            .split(',')
            .map((s) => s.trim());
        } else {
          meta[key] = value.trim();
        }
      }
    }

    return {
      id: (meta.id as string) || basename(filePath, '.md') || 'unknown',
      name: (meta.name as string) || (meta.id as string) || 'Unknown Agent',
      systemPrompt: body.trim(),
      model: meta.model as string | undefined,
      tools: meta.tools as string[] | undefined,
      enabled: meta.enabled !== 'false' && meta.enabled !== false,
    };
  } catch {
    return null;
  }
}

/**
 * Load skill from .json file
 */
async function loadSkill(filePath: string): Promise<SkillDefinition | null> {
  try {
    const content = await readFile(filePath, 'utf-8');
    const skill: SkillDefinition = JSON.parse(content);

    // Validate required fields
    if (!skill.id || !skill.triggers || !skill.content) {
      return null;
    }

    return skill;
  } catch {
    return null;
  }
}

/**
 * Get all agent system prompts to inject
 * Returns combined system prompt from all enabled agents
 */
export async function getAgentSystemPrompts(): Promise<string[]> {
  const plugins = await loadPlugins();
  const prompts: string[] = [];

  for (const plugin of plugins) {
    for (const agent of plugin.agents) {
      if (agent.enabled !== false && agent.systemPrompt) {
        prompts.push(agent.systemPrompt);
      }
    }
  }

  return prompts;
}

/**
 * Match skills against a prompt/file context and return matched content
 */
export async function matchSkills(prompt: string, filePaths: string[] = []): Promise<string[]> {
  const plugins = await loadPlugins();
  const matched: string[] = [];

  for (const plugin of plugins) {
    for (const skill of plugin.skills) {
      if (skill.enabled === false) continue;

      let isMatch = false;

      for (const trigger of skill.triggers) {
        // Check if trigger is a file extension pattern (*.ext)
        if (trigger.startsWith('*.')) {
          const ext = trigger.slice(1); // Get .ext
          if (filePaths.some((fp) => fp.endsWith(ext))) {
            isMatch = true;
            break;
          }
        }
        // Check if trigger is a regex (starts with /)
        else if (trigger.startsWith('/') && trigger.endsWith('/')) {
          const pattern = trigger.slice(1, -1);
          if (safeRegexTest(pattern, prompt)) {
            isMatch = true;
            break;
          }
        }
        // Check if trigger is a keyword (case-insensitive)
        else if (prompt.toLowerCase().includes(trigger.toLowerCase())) {
          isMatch = true;
          break;
        }
      }

      if (isMatch) {
        matched.push(skill.content);
        logVerbose(`Matched skill: ${skill.name || skill.id}`);
      }
    }
  }

  return matched;
}

/**
 * Build system context from agents and skills
 * Returns a string to prepend to the user prompt
 */
export async function buildSystemContext(prompt: string, filePaths: string[] = []): Promise<string> {
  const parts: string[] = [];

  // Get agent system prompts
  const agentPrompts = await getAgentSystemPrompts();
  if (agentPrompts.length > 0) {
    parts.push('<system-context>');
    parts.push(...agentPrompts);
    parts.push('</system-context>');
  }

  // Get matched skill content
  const skillContent = await matchSkills(prompt, filePaths);
  if (skillContent.length > 0) {
    parts.push('<skill-context>');
    parts.push(...skillContent);
    parts.push('</skill-context>');
  }

  return parts.length > 0 ? parts.join('\n\n') + '\n\n' : '';
}

/**
 * Invalidate the plugins cache (call when plugins change)
 */
export function invalidatePluginsCache(): void {
  pluginsCache = null;
}

/**
 * Skill Types - Enhanced skill interface with triggers support
 */

export interface SkillTriggers {
  // File extension patterns (e.g., "*.py", "*.tsx", "test_*.py")
  extensions: string[];
  // Keyword triggers (e.g., "python", "react", "testing")
  keywords: string[];
  // Regex patterns (e.g., "/^import.*from ['"]react['"]/" )
  patterns: string[];
  // Match mode: 'any' = OR logic, 'all' = AND logic
  matchMode: 'any' | 'all';
}

export interface Skill {
  // Unique identifier (generated from name if custom)
  id: string;
  // Human-readable name
  name: string;
  // Short description of what the skill provides
  description: string;
  // Source: 'plugin' = from enabled plugin, 'custom' = user-created
  source: 'plugin' | 'custom';
  // Plugin info (only if source === 'plugin')
  pluginName?: string;
  pluginId?: string;
  // File path (for plugin skills or synced custom skills)
  filePath?: string;
  // Whether the skill is enabled
  enabled: boolean;
  // Trigger configuration
  triggers: SkillTriggers;
  // Content to inject when triggered (markdown)
  content: string;
  // Metadata
  createdAt?: string;
  updatedAt?: string;
}

// Default empty triggers
export const DEFAULT_TRIGGERS: SkillTriggers = {
  extensions: [],
  keywords: [],
  patterns: [],
  matchMode: 'any',
};

// Create a new empty skill
export function createEmptySkill(): Skill {
  return {
    id: '',
    name: '',
    description: '',
    source: 'custom',
    enabled: true,
    triggers: { ...DEFAULT_TRIGGERS },
    content: '',
  };
}

// Generate ID from name
export function generateSkillId(name: string): string {
  return name
    .toLowerCase()
    .replace(/\s+/g, '-')
    .replace(/[^a-z0-9-]/g, '')
    .slice(0, 50);
}

// Convert skill to YAML frontmatter format
export function skillToYaml(skill: Skill): string {
  const yaml = [
    '---',
    `id: ${skill.id}`,
    `name: ${escapeYamlString(skill.name)}`,
    `description: ${escapeYamlString(skill.description)}`,
    'triggers:',
  ];

  // Extensions
  if (skill.triggers.extensions.length > 0) {
    yaml.push('  extensions:');
    skill.triggers.extensions.forEach(ext => {
      yaml.push(`    - "${escapeYamlString(ext)}"`);
    });
  }

  // Keywords
  if (skill.triggers.keywords.length > 0) {
    yaml.push('  keywords:');
    skill.triggers.keywords.forEach(kw => {
      yaml.push(`    - "${escapeYamlString(kw)}"`);
    });
  }

  // Patterns
  if (skill.triggers.patterns.length > 0) {
    yaml.push('  patterns:');
    skill.triggers.patterns.forEach(p => {
      yaml.push(`    - "${escapeYamlString(p)}"`);
    });
  }

  yaml.push(`  matchMode: ${skill.triggers.matchMode}`);
  yaml.push(`enabled: ${skill.enabled}`);
  yaml.push('---');
  yaml.push('');
  yaml.push(skill.content);

  return yaml.join('\n');
}

// Parse YAML frontmatter to skill
export function parseSkillYaml(content: string, filePath?: string): Partial<Skill> | null {
  try {
    // Extract frontmatter
    const match = content.match(/^---\n([\s\S]*?)\n---\n?([\s\S]*)$/);
    if (!match) return null;

    const frontmatter = match[1];
    const body = match[2].trim();

    // Simple YAML parsing (not full YAML spec, just what we need)
    const skill: Partial<Skill> = {
      content: body,
      filePath,
      triggers: { ...DEFAULT_TRIGGERS },
    };

    // Parse simple key-value pairs
    const lines = frontmatter.split('\n');
    let currentSection = '';
    let currentArray: string[] = [];

    for (const line of lines) {
      const trimmed = line.trim();
      if (!trimmed) continue;

      // Check for section start
      if (trimmed === 'triggers:') {
        currentSection = 'triggers';
        continue;
      }

      // Check for array items
      if (trimmed.startsWith('- ')) {
        const value = trimmed.slice(2).replace(/^["']|["']$/g, '');
        if (currentSection === 'extensions') {
          skill.triggers!.extensions.push(value);
        } else if (currentSection === 'keywords') {
          skill.triggers!.keywords.push(value);
        } else if (currentSection === 'patterns') {
          skill.triggers!.patterns.push(value);
        }
        continue;
      }

      // Check for nested sections under triggers
      if (currentSection === 'triggers') {
        if (trimmed === 'extensions:') {
          currentSection = 'extensions';
          continue;
        }
        if (trimmed === 'keywords:') {
          currentSection = 'keywords';
          continue;
        }
        if (trimmed === 'patterns:') {
          currentSection = 'patterns';
          continue;
        }
        if (trimmed.startsWith('matchMode:')) {
          const value = trimmed.split(':')[1].trim() as 'any' | 'all';
          skill.triggers!.matchMode = value === 'all' ? 'all' : 'any';
          continue;
        }
      }

      // Parse top-level key-value pairs
      const colonIdx = trimmed.indexOf(':');
      if (colonIdx > 0) {
        const key = trimmed.slice(0, colonIdx).trim();
        const value = trimmed.slice(colonIdx + 1).trim().replace(/^["']|["']$/g, '');

        switch (key) {
          case 'id':
            skill.id = value;
            break;
          case 'name':
            skill.name = value;
            break;
          case 'description':
            skill.description = value;
            break;
          case 'enabled':
            skill.enabled = value === 'true';
            break;
        }
      }
    }

    return skill;
  } catch (e) {
    console.error('Failed to parse skill YAML:', e);
    return null;
  }
}

// Escape special YAML characters
function escapeYamlString(str: string): string {
  if (!str) return '""';
  // If string contains special chars, quote it
  if (/[:\n\r\t#&*!|>'"[\]{},%@`]/.test(str) || str.startsWith(' ') || str.endsWith(' ')) {
    return `"${str.replace(/\\/g, '\\\\').replace(/"/g, '\\"')}"`;
  }
  return str;
}

// Check if a skill matches given context
export function skillMatchesContext(
  skill: Skill,
  context: {
    fileName?: string;
    fileContent?: string;
    userInput?: string;
  }
): boolean {
  if (!skill.enabled) return false;

  const { triggers } = skill;
  const matchResults: boolean[] = [];

  // Check file extensions
  if (triggers.extensions.length > 0 && context.fileName) {
    const matches = triggers.extensions.some(pattern => {
      // Convert glob pattern to regex
      const regex = new RegExp(
        '^' + pattern
          .replace(/\./g, '\\.')
          .replace(/\*/g, '.*')
          .replace(/\?/g, '.') + '$',
        'i'
      );
      return regex.test(context.fileName!);
    });
    matchResults.push(matches);
  }

  // Check keywords
  if (triggers.keywords.length > 0) {
    const searchText = [
      context.fileName || '',
      context.fileContent || '',
      context.userInput || '',
    ].join(' ').toLowerCase();

    const matches = triggers.keywords.some(kw =>
      searchText.includes(kw.toLowerCase())
    );
    matchResults.push(matches);
  }

  // Check regex patterns
  if (triggers.patterns.length > 0) {
    const searchText = [
      context.fileName || '',
      context.fileContent || '',
      context.userInput || '',
    ].join('\n');

    const matches = triggers.patterns.some(pattern => {
      try {
        // Strip leading/trailing slashes
        let cleanPattern = pattern;
        if (pattern.startsWith('/') && pattern.endsWith('/')) {
          cleanPattern = pattern.slice(1, -1);
        } else if (pattern.startsWith('/')) {
          cleanPattern = pattern.slice(1);
        }
        const regex = new RegExp(cleanPattern, 'i');
        return regex.test(searchText);
      } catch {
        return false;
      }
    });
    matchResults.push(matches);
  }

  // Apply match mode
  if (matchResults.length === 0) return false;

  if (triggers.matchMode === 'all') {
    return matchResults.every(r => r);
  } else {
    return matchResults.some(r => r);
  }
}

export default {
  DEFAULT_TRIGGERS,
  createEmptySkill,
  generateSkillId,
  skillToYaml,
  parseSkillYaml,
  skillMatchesContext,
};

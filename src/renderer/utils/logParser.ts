export interface ParsedLog {
  raw: string;
  timestamp: string | null;
  type: 'SERVER_OUT' | 'SERVER_ERR' | 'SYSTEM';
  category: LogCategory;
  emoji: string | null;
  content: string;
  sessionId: string | null;
  apiNumber: number | null;
  isMultiline: boolean;
  severity: 'info' | 'success' | 'warning' | 'error';
}

export type LogCategory =
  | 'system'
  | 'api'
  | 'tokens'
  | 'health'
  | 'error'
  | 'process'
  | 'config'
  | 'data'
  | 'other';

export interface LogGroup {
  type: 'normal' | 'heartbeat' | 'table';
  logs: ParsedLog[];
  count?: number;
  lastTimestamp?: string;
  id: string; // stable identifier for collapse tracking
}

// List of emojis to check - order matters (longer/combined emojis first)
const EMOJI_LIST = [
  '🖥️', '⚠️', // combined emojis with variation selectors first
  '🩺', '📡', '📊', '💰', '❌', '✅', '🚀', '🔍', '📋', '🎯',
  '📥', '📤', '🏠', '📁', '🪟', '🔌', '👋', '🐕', '📝', '📦',
  '✨', '🔧', '🗑️', '🔄', '🤖', '💾', '⏳', '🔒', '🔓', '💡',
  '🎉', '🛠️', '📂', '🌐', '💻', '🖥', '⚠', '🆕', '🔴', '🟢',
  '🟡', '🔵', '⬛', '⬜', 'ℹ️', 'ℹ',
];

const EMOJI_CATEGORIES: Record<string, LogCategory> = {
  '🩺': 'health',
  '📡': 'api',
  '📊': 'tokens',
  '💰': 'tokens',
  '❌': 'error',
  '⚠️': 'error',
  '⚠': 'error',
  '✅': 'system',
  '🚀': 'process',
  '🔍': 'system',
  '📋': 'config',
  '🎯': 'config',
  '📥': 'data',
  '📤': 'data',
  '🏠': 'config',
  '📁': 'config',
  '📂': 'config',
  '🖥️': 'system',
  '🖥': 'system',
  '🪟': 'system',
  '🔌': 'system',
  '👋': 'process',
  '🐕': 'process',
  '📝': 'api',
  '📦': 'tokens',
  '✨': 'system',
  '🔧': 'config',
  '🗑️': 'system',
  '🔄': 'process',
  '🤖': 'api',
  '💾': 'data',
  '⏳': 'process',
  '🔒': 'system',
  '🔓': 'system',
  '💡': 'system',
  '🛠️': 'config',
  '🌐': 'system',
  '💻': 'system',
  'ℹ️': 'system',
  'ℹ': 'system',
};

const ERROR_KEYWORDS = ['error', 'failed', 'could not', 'unable to'];
const SUCCESS_KEYWORDS = ['success', 'ready', 'complete'];
const API_PATTERNS = /📡.*API (assistant|user|system|result) #(\d+)/;
const SESSION_PATTERN = /session-[\w-]+/;
const HEARTBEAT_PATTERN = /🩺.*duration:/;
const TABLE_PATTERN = /[┌├└│─┬┼┴┤]/;

// Extract emoji from start of string (handles multi-codepoint emojis)
function extractLeadingEmoji(text: string): string | null {
  const trimmed = text.trimStart();
  for (const emoji of EMOJI_LIST) {
    if (trimmed.startsWith(emoji)) {
      return emoji;
    }
  }
  return null;
}

export function parseLogLine(line: string): ParsedLog {
  // Extract timestamp
  const timestampMatch = line.match(/\[(\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}\.\d+)\]/);
  const timestamp = timestampMatch ? timestampMatch[1] : null;

  // Extract type (SERVER_OUT, SERVER_ERR, SYSTEM)
  let type: ParsedLog['type'] = 'SYSTEM';
  let content = line;

  if (line.includes('[SERVER OUT]')) {
    type = 'SERVER_OUT';
    content = line.replace(/\[.*?\] \[SERVER OUT\] /, '');
  } else if (line.includes('[SERVER ERR]')) {
    type = 'SERVER_ERR';
    content = line.replace(/\[.*?\] \[SERVER ERR\] /, '');
  } else if (timestamp) {
    content = line.replace(/\[.*?\] /, '');
  }

  // Extract emoji using proper multi-codepoint handling
  const emoji = extractLeadingEmoji(content);

  // Determine category
  let category: LogCategory = 'other';
  if (emoji && EMOJI_CATEGORIES[emoji]) {
    category = EMOJI_CATEGORIES[emoji];
  } else if (API_PATTERNS.test(content)) {
    category = 'api';
  } else if (HEARTBEAT_PATTERN.test(content)) {
    category = 'health';
  } else if (TABLE_PATTERN.test(content)) {
    category = 'tokens';
  } else if (ERROR_KEYWORDS.some(kw => content.toLowerCase().includes(kw))) {
    category = 'error';
  }

  // Extract session ID
  const sessionMatch = content.match(SESSION_PATTERN);
  const sessionId = sessionMatch ? sessionMatch[0] : null;

  // Extract API message number
  const apiMatch = content.match(API_PATTERNS);
  const apiNumber = apiMatch ? parseInt(apiMatch[2], 10) : null;

  // Determine severity - check emoji first, then keywords
  let severity: ParsedLog['severity'] = 'info';
  if (emoji === '❌' || emoji === '⚠️' || emoji === '⚠') {
    severity = type === 'SERVER_ERR' ? 'error' : 'warning';
  } else if (ERROR_KEYWORDS.some(kw => content.toLowerCase().includes(kw))) {
    severity = type === 'SERVER_ERR' ? 'error' : 'warning';
  } else if (emoji === '✅' || SUCCESS_KEYWORDS.some(kw => content.toLowerCase().includes(kw))) {
    severity = 'success';
  }

  // Check if multiline (table or special format)
  const isMultiline = TABLE_PATTERN.test(content);

  return {
    raw: line,
    timestamp,
    type,
    category,
    emoji,
    content,
    sessionId,
    apiNumber,
    isMultiline,
    severity,
  };
}

// Generate stable ID for a group based on its first log's timestamp and type
function generateGroupId(type: string, firstLog: ParsedLog, groupIndex: number): string {
  const timestamp = firstLog.timestamp || `idx-${groupIndex}`;
  return `${type}-${timestamp}-${firstLog.content.substring(0, 20).replace(/\s/g, '_')}`;
}

export function parseAndGroupLogs(rawLogs: string): LogGroup[] {
  const lines = rawLogs.split(/\r?\n/).filter(l => l.trim());
  const parsed = lines.map(parseLogLine);
  const groups: LogGroup[] = [];

  let currentGroup: ParsedLog[] = [];
  let currentType: 'normal' | 'heartbeat' | 'table' = 'normal';
  let heartbeatCount = 0;
  let groupCounter = 0;

  const flushGroup = () => {
    if (currentGroup.length === 0) return;

    const firstLog = currentGroup[0];
    const lastLog = currentGroup[currentGroup.length - 1];

    groups.push({
      type: currentType,
      logs: currentGroup,
      count: currentType === 'heartbeat' ? heartbeatCount : undefined,
      lastTimestamp: lastLog.timestamp || undefined,
      id: generateGroupId(currentType, firstLog, groupCounter++),
    });
  };

  for (let i = 0; i < parsed.length; i++) {
    const log = parsed[i];

    // Handle heartbeat grouping
    if (log.category === 'health' && HEARTBEAT_PATTERN.test(log.content)) {
      if (currentType === 'heartbeat') {
        // Continue heartbeat group
        currentGroup.push(log);
        heartbeatCount++;
      } else {
        // Start new heartbeat group
        flushGroup();
        currentGroup = [log];
        currentType = 'heartbeat';
        heartbeatCount = 1;
      }
      continue;
    }

    // Handle table grouping - check for table characters or continuation of table
    const isTableLine = log.isMultiline;
    const isTableContinuation = currentType === 'table' &&
      !log.emoji &&
      (log.content.trim().startsWith('│') ||
       log.content.trim().startsWith('├') ||
       log.content.trim().startsWith('└') ||
       log.content.includes('│'));

    if (isTableLine || isTableContinuation) {
      if (currentType === 'table') {
        currentGroup.push(log);
      } else {
        flushGroup();
        currentGroup = [log];
        currentType = 'table';
      }
      continue;
    }

    // Normal log - flush previous group and start new
    flushGroup();
    currentGroup = [log];
    currentType = 'normal';
    heartbeatCount = 0;
  }

  // Flush final group
  flushGroup();

  return groups;
}

export function filterLogs(
  groups: LogGroup[],
  filters: {
    categories: Set<LogCategory>;
    hideHeartbeats: boolean;
    searchText: string;
    sessionId: string | null;
  }
): LogGroup[] {
  return groups
    .filter(group => {
      // Hide heartbeats if requested
      if (filters.hideHeartbeats && group.type === 'heartbeat') {
        return false;
      }

      // Filter by category
      const hasMatchingCategory = group.logs.some(log =>
        filters.categories.has(log.category)
      );
      if (!hasMatchingCategory) {
        return false;
      }

      // Filter by session
      if (filters.sessionId) {
        const hasMatchingSession = group.logs.some(log =>
          log.sessionId === filters.sessionId
        );
        if (!hasMatchingSession) {
          return false;
        }
      }

      // Filter by search text
      if (filters.searchText) {
        const searchLower = filters.searchText.toLowerCase();
        const hasMatchingText = group.logs.some(log =>
          log.content.toLowerCase().includes(searchLower)
        );
        if (!hasMatchingText) {
          return false;
        }
      }

      return true;
    });
}

export function extractSessions(groups: LogGroup[]): string[] {
  const sessions = new Set<string>();
  groups.forEach(group => {
    group.logs.forEach(log => {
      if (log.sessionId) {
        sessions.add(log.sessionId);
      }
    });
  });
  return Array.from(sessions).sort();
}

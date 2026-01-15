/**
 * Session management for yume-cli
 * Persists conversation history to ~/.yume/sessions/
 */

import * as fs from 'node:fs/promises';
import * as path from 'node:path';
import { randomUUID } from 'node:crypto';
import { homedir } from 'node:os';
import type {
  Session,
  ProviderType,
  HistoryMessage,
  TokenUsage,
} from '../types.js';
import { log } from './emit.js';

const SESSIONS_DIR = path.join(homedir(), '.yume', 'sessions');

/**
 * Generate a new session ID
 */
export function generateSessionId(): string {
  return `sess-${randomUUID().slice(0, 8)}`;
}

/**
 * Get session file path
 */
function getSessionPath(provider: ProviderType, sessionId: string): string {
  return path.join(SESSIONS_DIR, provider, `${sessionId}.json`);
}

/**
 * Ensure sessions directory exists
 */
async function ensureSessionsDir(provider: ProviderType): Promise<void> {
  const dir = path.join(SESSIONS_DIR, provider);
  await fs.mkdir(dir, { recursive: true });
}

/**
 * Create a new session
 */
export async function createSession(
  provider: ProviderType,
  model: string,
  cwd: string,
  sessionId?: string
): Promise<Session> {
  const id = sessionId || generateSessionId();
  const now = new Date().toISOString();

  const session: Session = {
    id,
    provider,
    model,
    cwd,
    created: now,
    updated: now,
    history: [],
    usage: {
      inputTokens: 0,
      outputTokens: 0,
      cacheReadTokens: 0,
      cacheCreationTokens: 0,
    },
    metadata: {
      compactionCount: 0,
    },
  };

  await saveSession(session);
  return session;
}

/**
 * Load a session by ID
 */
export async function loadSession(
  provider: ProviderType,
  sessionId: string
): Promise<Session | null> {
  const sessionPath = getSessionPath(provider, sessionId);

  try {
    const data = await fs.readFile(sessionPath, 'utf-8');
    return JSON.parse(data) as Session;
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
      return null;
    }
    throw error;
  }
}

/**
 * Save a session to disk atomically
 * Uses temp file + rename to prevent corruption on crash
 */
export async function saveSession(session: Session): Promise<void> {
  await ensureSessionsDir(session.provider);

  const sessionPath = getSessionPath(session.provider, session.id);
  session.updated = new Date().toISOString();

  // Write to temp file first, then rename atomically
  // This prevents corruption if the process crashes mid-write
  const tempPath = `${sessionPath}.tmp.${Date.now()}`;

  try {
    await fs.writeFile(tempPath, JSON.stringify(session, null, 2));
    await fs.rename(tempPath, sessionPath);
  } catch (error) {
    // Clean up temp file on error
    try {
      await fs.unlink(tempPath);
    } catch {
      // Ignore cleanup errors
    }
    throw error;
  }
}

/**
 * Load history from an external JSON file (for cross-agent resumption)
 */
export async function loadHistoryFromFile(filePath: string): Promise<HistoryMessage[]> {
  try {
    const data = await fs.readFile(filePath, 'utf-8');
    const history = JSON.parse(data);
    if (!Array.isArray(history)) {
      throw new Error('History file must contain an array of messages');
    }
    return history as HistoryMessage[];
  } catch (error) {
    log(`Error loading history from ${filePath}: ${error}`);
    return [];
  }
}

/**
 * Add message to session history
 */
export function addToHistory(session: Session, message: HistoryMessage): void {
  session.history.push(message);
}

/**
 * Update session usage
 */
export function updateUsage(session: Session, usage: Partial<TokenUsage>): void {
  if (usage.inputTokens !== undefined) {
    session.usage.inputTokens += usage.inputTokens;
  }
  if (usage.outputTokens !== undefined) {
    session.usage.outputTokens += usage.outputTokens;
  }
  if (usage.cacheReadTokens !== undefined) {
    session.usage.cacheReadTokens += usage.cacheReadTokens;
  }
  if (usage.cacheCreationTokens !== undefined) {
    session.usage.cacheCreationTokens += usage.cacheCreationTokens;
  }
}

/**
 * List all sessions for a provider
 */
export async function listSessions(
  provider: ProviderType
): Promise<Session[]> {
  const dir = path.join(SESSIONS_DIR, provider);

  try {
    const files = await fs.readdir(dir);
    const sessions: Session[] = [];

    for (const file of files) {
      if (file.endsWith('.json')) {
        const sessionPath = path.join(dir, file);
        try {
          const data = await fs.readFile(sessionPath, 'utf-8');
          sessions.push(JSON.parse(data) as Session);
        } catch {
          // Skip invalid files
          log(`Warning: Could not load session file ${file}`);
        }
      }
    }

    // Sort by updated date, newest first
    sessions.sort(
      (a, b) => new Date(b.updated).getTime() - new Date(a.updated).getTime()
    );

    return sessions;
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
      return [];
    }
    throw error;
  }
}

/**
 * Delete a session
 */
export async function deleteSession(
  provider: ProviderType,
  sessionId: string
): Promise<void> {
  const sessionPath = getSessionPath(provider, sessionId);
  await fs.unlink(sessionPath);
}

/**
 * Convert session history to provider-specific format
 * This is used when making API calls
 */
export function historyToMessages(
  history: HistoryMessage[]
): { role: string; content: string }[] {
  return history.map((msg) => ({
    role: msg.role === 'tool' ? 'user' : msg.role,
    content: msg.content || '',
  }));
}

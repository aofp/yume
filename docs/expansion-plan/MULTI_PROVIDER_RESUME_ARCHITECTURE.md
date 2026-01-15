# Multi-Provider Conversation Resume Architecture

> **Status:** Architectural Design (Phase 3 of Expansion Roadmap)
> **Dependencies:** Phase 2 (yume-cli foundation), UNIVERSAL_SESSION_ARCHITECTURE.md, CONVERSATION_PORTABILITY.md
> **Created:** 2025-01-14

## Executive Summary

This document defines the architecture for enabling Yume to resume conversations from all three providers (Claude, Gemini, OpenAI) in a unified Recent Conversations modal. Users can browse sessions from any provider and resume them regardless of which provider they're currently using.

**Key Innovation:** Unlike the current Claude-only implementation, this architecture creates a **provider-agnostic session index** that unifies session discovery across all three storage locations while preserving backward compatibility.

## Problem Statement

### Current State (Claude-Only)

The current implementation in `server-claude-macos.cjs` line 2908:
- Scans `~/.claude/projects/` for `.jsonl` files
- Parses each file to extract title, summary, message count
- Filters out empty files and agent subagent sessions
- Returns list to RecentConversationsModal

**Location:** `~/.claude/projects/`
**Format:** JSONL (line-delimited JSON)
**Detection:** File extension `.jsonl`, exclude `agent-*.jsonl`

### Target State (Multi-Provider)

Users should see a unified list showing:
- **Claude sessions** from `~/.claude/projects/`
- **Gemini sessions** from `~/.yume/sessions/gemini/`
- **OpenAI sessions** from `~/.yume/sessions/openai/`

Each session displays:
- Provider badge (Claude/Gemini/OpenAI)
- Model used (Sonnet 4.5, Gemini 2.0 Flash, GPT-4o, etc.)
- Title (extracted from session content)
- Summary (first user message or generated)
- Message count
- Last modified timestamp
- Project/working directory

## Session Storage Analysis

### Claude Sessions

**Location:** `~/.claude/projects/-[escaped-path]/`

**Example:** `/Users/yuru/project` → `~/.claude/projects/-Users-yuru-project/`

**File Format:**
```jsonl
{"type":"system","subtype":"init","session_id":"...","model":"claude-sonnet-4-5-20250929"}
{"type":"user","content":"Hello"}
{"type":"assistant","message":{"content":[{"type":"text","text":"Hi!"}]}}
{"type":"title","title":"Greeting conversation"}
```

**Session Detection:**
- Files ending in `.jsonl`
- Exclude files starting with `agent-` (subagent sessions)
- Exclude 0-byte files

**Metadata Extraction:**
```typescript
interface ClaudeSessionMetadata {
  sessionId: string;        // From filename: "abc123.jsonl" → "abc123"
  filePath: string;         // Full path to .jsonl file
  projectPath: string;      // Decoded from directory name
  title?: string;           // From {"type":"title"} message
  summary?: string;         // From {"type":"summary"} or first user message
  model?: string;           // From init message
  messageCount: number;     // Count of user/assistant messages (skip meta)
  lastModified: number;     // File mtime
}
```

### Gemini Sessions (yume-cli)

**Location:** `~/.yume/sessions/gemini/`

**File Format (per YUME_CLI_SPEC.md):**
```json
{
  "id": "sess-abc123",
  "provider": "gemini",
  "model": "gemini-2.0-flash",
  "cwd": "/Users/yuru/project",
  "created": "2025-01-14T00:00:00Z",
  "updated": "2025-01-14T01:30:00Z",
  "history": [...],
  "usage": {...},
  "metadata": {
    "title": "Login Refactor",
    "compaction_count": 0
  }
}
```

**Session Detection:**
- Files ending in `.json`
- Must have `"provider": "gemini"`

**Metadata Extraction:**
```typescript
interface GeminiSessionMetadata {
  sessionId: string;        // From file: "sess-abc123.json" → "sess-abc123"
  filePath: string;         // Full path to .json file
  projectPath: string;      // From session.cwd
  title?: string;           // From session.metadata.title
  summary?: string;         // First user message from history
  model: string;            // From session.model
  messageCount: number;     // session.history.length
  lastModified: number;     // session.updated timestamp
}
```

### OpenAI Sessions (yume-cli)

**Location:** `~/.yume/sessions/openai/`

**File Format (identical structure to Gemini):**
```json
{
  "id": "sess-def456",
  "provider": "openai",
  "model": "gpt-4o",
  "cwd": "/Users/yuru/project",
  "created": "2025-01-14T00:00:00Z",
  "updated": "2025-01-14T01:30:00Z",
  "history": [...],
  "usage": {...},
  "metadata": {
    "title": "API Integration",
    "compaction_count": 0
  }
}
```

**Session Detection:**
- Files ending in `.json`
- Must have `"provider": "openai"`

**Metadata Extraction:**
```typescript
interface OpenAISessionMetadata {
  sessionId: string;        // From file: "sess-def456.json" → "sess-def456"
  filePath: string;         // Full path to .json file
  projectPath: string;      // From session.cwd
  title?: string;           // From session.metadata.title
  summary?: string;         // First user message from history
  model: string;            // From session.model
  messageCount: number;     // session.history.length
  lastModified: number;     // session.updated timestamp
}
```

## Unified Session Index Architecture

### Index Storage Location

```
~/.yume/session-index.json
```

This index enables fast session listing without parsing every session file on each request.

### Index Schema

```typescript
interface SessionIndex {
  version: '1.0';
  lastUpdated: string;      // ISO timestamp
  sessions: SessionIndexEntry[];
}

interface SessionIndexEntry {
  // Universal identifiers
  sessionId: string;        // Unique ID
  provider: 'claude' | 'gemini' | 'openai';

  // Metadata
  model: string;            // e.g., "claude-sonnet-4-5-20250929"
  modelDisplay: string;     // e.g., "Sonnet 4.5" (for UI)
  title: string;            // Session title
  summary?: string;         // Brief summary

  // Context
  projectPath: string;      // Working directory
  messageCount: number;     // Total messages

  // Timestamps
  created: string;          // ISO timestamp
  updated: string;          // ISO timestamp (for sorting)

  // Storage
  filePath: string;         // Absolute path to session file
  fileSize: number;         // File size in bytes

  // Provider-specific
  providerData?: {
    // Claude-specific
    claudeProjectDir?: string;   // e.g., "-Users-yuru-project"

    // Gemini/OpenAI-specific
    compactionCount?: number;
    totalTokens?: number;
    totalCost?: number;
  };
}
```

### Index Management

```typescript
// src-tauri/src/session_index.rs

pub struct SessionIndexManager {
    index_path: PathBuf,
    sessions: HashMap<String, SessionIndexEntry>,
}

impl SessionIndexManager {
    /// Load or create session index
    pub async fn load() -> Result<Self>;

    /// Scan all provider directories and rebuild index
    pub async fn rebuild_index() -> Result<()>;

    /// Incrementally update index (faster than full rebuild)
    pub async fn update_index() -> Result<()>;

    /// Add or update a session in the index
    pub async fn upsert_session(&mut self, entry: SessionIndexEntry) -> Result<()>;

    /// Remove a session from the index
    pub async fn remove_session(&mut self, session_id: &str) -> Result<()>;

    /// Get all sessions, optionally filtered by provider or project
    pub async fn list_sessions(
        &self,
        filter: SessionFilter,
    ) -> Result<Vec<SessionIndexEntry>>;

    /// Persist index to disk
    pub async fn save(&self) -> Result<()>;
}

pub struct SessionFilter {
    pub provider: Option<ProviderType>,
    pub project_path: Option<String>,
    pub limit: Option<usize>,
    pub offset: Option<usize>,
}
```

### Index Update Strategy

**Incremental Updates (Preferred):**
- Update index when session is created (after first message)
- Update index when session is resumed (update `updated` timestamp)
- Update index when session title is generated
- Background task checks for orphaned files every 5 minutes

**Full Rebuild (Fallback):**
- On Yume startup (if index is stale or missing)
- User-triggered via Settings → Advanced → Rebuild Session Index
- After provider installation (e.g., first Gemini session created)

**Staleness Detection:**
```typescript
function isIndexStale(index: SessionIndex): boolean {
  const lastUpdated = new Date(index.lastUpdated);
  const hoursSinceUpdate = (Date.now() - lastUpdated.getTime()) / (1000 * 60 * 60);

  // Rebuild if index is older than 24 hours
  return hoursSinceUpdate > 24;
}
```

## Provider-Specific Parsers

### Claude Session Parser

```typescript
// src-tauri/src/session_parsers/claude.rs

pub async fn parse_claude_session(
    file_path: &PathBuf,
) -> Result<SessionIndexEntry> {
    let content = tokio::fs::read_to_string(file_path).await?;
    let lines: Vec<&str> = content.lines().collect();

    let mut title: Option<String> = None;
    let mut summary: Option<String> = None;
    let mut model: Option<String> = None;
    let mut message_count = 0;
    let mut created: Option<String> = None;

    for line in lines {
        let data: serde_json::Value = serde_json::from_str(line)?;

        // Skip meta messages
        if data.get("isMeta") == Some(&serde_json::Value::Bool(true)) {
            continue;
        }

        // Extract title
        if data["type"] == "title" {
            title = data["title"].as_str().map(String::from);
        } else if data["type"] == "summary" {
            summary = data["summary"].as_str().map(String::from);
        }

        // Extract model from init message
        if data["type"] == "system" && data["subtype"] == "init" {
            model = data["model"].as_str().map(String::from);
            created = data["timestamp"].as_str().map(String::from);
        }

        // Count messages
        if data["role"] == "user" || data["role"] == "assistant" {
            // Skip XML-prefixed system messages
            let content_str = extract_content_string(&data);
            if !content_str.starts_with('<') {
                message_count += 1;
            }

            // Use first user message as summary if no title
            if summary.is_none() && data["role"] == "user" {
                summary = Some(content_str.chars().take(100).collect());
            }
        }
    }

    // Use summary as title if no title found
    let final_title = title.or(summary.clone()).unwrap_or_else(|| "Untitled conversation".to_string());

    // Extract session ID from filename
    let session_id = file_path
        .file_stem()
        .and_then(|s| s.to_str())
        .ok_or_else(|| anyhow!("Invalid filename"))?
        .to_string();

    // Extract project path from directory name
    let project_path = decode_claude_project_path(file_path.parent())?;

    // Get file metadata
    let metadata = tokio::fs::metadata(file_path).await?;
    let updated = metadata.modified()?.into();

    Ok(SessionIndexEntry {
        session_id,
        provider: ProviderType::Claude,
        model: model.unwrap_or_else(|| "unknown".to_string()),
        model_display: get_model_display_name(&model),
        title: final_title,
        summary,
        project_path,
        message_count,
        created: created.unwrap_or_else(|| updated.clone()),
        updated,
        file_path: file_path.to_string_lossy().to_string(),
        file_size: metadata.len(),
        provider_data: Some(json!({
            "claudeProjectDir": file_path.parent().unwrap().file_name().unwrap().to_string_lossy()
        })),
    })
}

/// Decode Claude's path escaping: "-Users-yuru-project" → "/Users/yuru/project"
fn decode_claude_project_path(project_dir: &Path) -> Result<String> {
    let dir_name = project_dir
        .file_name()
        .and_then(|s| s.to_str())
        .ok_or_else(|| anyhow!("Invalid project directory"))?;

    // Claude escapes "/" as "-" and prepends "-"
    // Example: -Users-yuru-project → /Users/yuru/project
    let decoded = dir_name
        .trim_start_matches('-')
        .replace('-', "/");

    Ok(format!("/{}", decoded))
}
```

### Gemini Session Parser

```typescript
// src-tauri/src/session_parsers/gemini.rs

pub async fn parse_gemini_session(
    file_path: &PathBuf,
) -> Result<SessionIndexEntry> {
    let content = tokio::fs::read_to_string(file_path).await?;
    let session: GeminiSession = serde_json::from_str(&content)?;

    // Validate provider
    if session.provider != "gemini" {
        return Err(anyhow!("Not a Gemini session"));
    }

    // Extract summary from first user message if not in metadata
    let summary = session.metadata.summary.or_else(|| {
        session.history.iter()
            .find(|m| m.role == "user")
            .and_then(|m| m.content.as_str())
            .map(|s| s.chars().take(100).collect())
    });

    Ok(SessionIndexEntry {
        session_id: session.id,
        provider: ProviderType::Gemini,
        model: session.model,
        model_display: get_model_display_name(&session.model),
        title: session.metadata.title.unwrap_or_else(|| "Untitled conversation".to_string()),
        summary,
        project_path: session.cwd,
        message_count: session.history.len(),
        created: session.created,
        updated: session.updated,
        file_path: file_path.to_string_lossy().to_string(),
        file_size: content.len() as u64,
        provider_data: Some(json!({
            "compactionCount": session.metadata.compaction_count,
            "totalTokens": session.usage.total_input_tokens + session.usage.total_output_tokens,
            "totalCost": session.usage.total_cost_usd,
        })),
    })
}

#[derive(Deserialize)]
struct GeminiSession {
    id: String,
    provider: String,
    model: String,
    cwd: String,
    created: String,
    updated: String,
    history: Vec<serde_json::Value>,
    usage: SessionUsage,
    metadata: SessionMetadata,
}

#[derive(Deserialize)]
struct SessionUsage {
    total_input_tokens: u64,
    total_output_tokens: u64,
    total_cost_usd: f64,
}

#[derive(Deserialize)]
struct SessionMetadata {
    title: Option<String>,
    summary: Option<String>,
    compaction_count: u32,
}
```

### OpenAI Session Parser

```typescript
// src-tauri/src/session_parsers/openai.rs

// Identical structure to Gemini parser, just validate provider = "openai"

pub async fn parse_openai_session(
    file_path: &PathBuf,
) -> Result<SessionIndexEntry> {
    let content = tokio::fs::read_to_string(file_path).await?;
    let session: OpenAISession = serde_json::from_str(&content)?;

    // Validate provider
    if session.provider != "openai" {
        return Err(anyhow!("Not an OpenAI session"));
    }

    // Same logic as Gemini parser...
    // (Extract summary, build SessionIndexEntry)

    Ok(SessionIndexEntry {
        session_id: session.id,
        provider: ProviderType::OpenAI,
        model: session.model,
        model_display: get_model_display_name(&session.model),
        // ... rest identical to Gemini
    })
}
```

## Server Endpoint Updates

### New Endpoint: `/recent-conversations` (Replaces `/claude-recent-conversations`)

```javascript
// server-claude-macos.cjs (and other platform servers)

app.get('/recent-conversations', async (req, res) => {
  try {
    const filterProject = req.query.project;     // Optional: filter by working directory
    const filterProvider = req.query.provider;   // Optional: filter by provider
    const limit = parseInt(req.query.limit) || 9;
    const offset = parseInt(req.query.offset) || 0;

    console.log('📂 Loading recent conversations', {
      project: filterProject || 'all',
      provider: filterProvider || 'all',
      limit,
      offset
    });

    // Load session index via Tauri command
    const indexData = await invoke('load_session_index', {
      filter: {
        projectPath: filterProject,
        provider: filterProvider,
      }
    });

    // Sort by updated timestamp (most recent first)
    const sorted = indexData.sessions.sort((a, b) =>
      new Date(b.updated).getTime() - new Date(a.updated).getTime()
    );

    // Paginate
    const paginated = sorted.slice(offset, offset + limit);

    res.json({
      conversations: paginated.map(entry => ({
        id: entry.sessionId,
        provider: entry.provider,
        model: entry.model,
        modelDisplay: entry.modelDisplay,
        title: entry.title,
        summary: entry.summary,
        projectPath: entry.projectPath,
        messageCount: entry.messageCount,
        filePath: entry.filePath,
        updated: entry.updated,
      })),
      totalCount: sorted.length,
      hasMore: offset + limit < sorted.length,
    });

  } catch (error) {
    console.error('Error loading recent conversations:', error);
    res.status(500).json({
      error: 'Failed to load recent conversations',
      details: error.message
    });
  }
});
```

### Backward Compatibility: Keep `/claude-recent-conversations`

```javascript
// Deprecated but maintained for backward compatibility
app.get('/claude-recent-conversations', async (req, res) => {
  // Forward to new endpoint with provider filter
  const filterProject = req.query.project;
  const limit = parseInt(req.query.limit) || 9;

  try {
    const response = await fetch(
      `http://localhost:${port}/recent-conversations?provider=claude&project=${filterProject || ''}&limit=${limit}`
    );
    const data = await response.json();

    // Transform to old format for compatibility
    res.json({
      conversations: data.conversations.map(c => ({
        id: c.id,
        title: c.title,
        summary: c.summary,
        projectPath: c.projectPath,
        messageCount: c.messageCount,
        filePath: c.filePath,
      }))
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});
```

## Tauri Commands

### New Commands in `src-tauri/src/commands/sessions.rs`

```rust
use crate::session_index::SessionIndexManager;

/// Load session index with optional filtering
#[tauri::command]
pub async fn load_session_index(
    filter: SessionFilter,
) -> Result<SessionIndex, String> {
    let manager = SessionIndexManager::load()
        .await
        .map_err(|e| e.to_string())?;

    let sessions = manager.list_sessions(filter)
        .await
        .map_err(|e| e.to_string())?;

    Ok(SessionIndex {
        version: "1.0".to_string(),
        last_updated: chrono::Utc::now().to_rfc3339(),
        sessions,
    })
}

/// Rebuild session index from scratch
#[tauri::command]
pub async fn rebuild_session_index() -> Result<(), String> {
    SessionIndexManager::rebuild_index()
        .await
        .map_err(|e| e.to_string())
}

/// Update session index incrementally
#[tauri::command]
pub async fn update_session_index() -> Result<(), String> {
    SessionIndexManager::update_index()
        .await
        .map_err(|e| e.to_string())
}

/// Add or update a session in the index
#[tauri::command]
pub async fn upsert_session_index_entry(
    entry: SessionIndexEntry,
) -> Result<(), String> {
    let mut manager = SessionIndexManager::load()
        .await
        .map_err(|e| e.to_string())?;

    manager.upsert_session(entry)
        .await
        .map_err(|e| e.to_string())?;

    manager.save()
        .await
        .map_err(|e| e.to_string())
}

/// Remove a session from the index
#[tauri::command]
pub async fn remove_session_from_index(
    session_id: String,
) -> Result<(), String> {
    let mut manager = SessionIndexManager::load()
        .await
        .map_err(|e| e.to_string())?;

    manager.remove_session(&session_id)
        .await
        .map_err(|e| e.to_string())?;

    manager.save()
        .await
        .map_err(|e| e.to_string())
}
```

### Register Commands in `lib.rs`

```rust
// src-tauri/src/lib.rs

tauri::Builder::default()
    .invoke_handler(tauri::generate_handler![
        // ... existing commands ...
        commands::sessions::load_session_index,
        commands::sessions::rebuild_session_index,
        commands::sessions::update_session_index,
        commands::sessions::upsert_session_index_entry,
        commands::sessions::remove_session_from_index,
    ])
```

## Frontend Updates

### Update RecentConversationsModal

```typescript
// src/renderer/components/RecentConversationsModal/RecentConversationsModal.tsx

interface ConversationEntry {
  id: string;
  provider: 'claude' | 'gemini' | 'openai';
  model: string;
  modelDisplay: string;
  title: string;
  summary?: string;
  projectPath: string;
  messageCount: number;
  filePath: string;
  updated: string;
}

export function RecentConversationsModal({ isOpen, onClose, projectFilter }: Props) {
  const [conversations, setConversations] = useState<ConversationEntry[]>([]);
  const [providerFilter, setProviderFilter] = useState<string>('all');
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (isOpen) {
      loadConversations();
    }
  }, [isOpen, projectFilter, providerFilter]);

  async function loadConversations() {
    setLoading(true);
    try {
      const response = await fetch(
        `http://localhost:${port}/recent-conversations?` +
        `project=${projectFilter || ''}&` +
        `provider=${providerFilter === 'all' ? '' : providerFilter}&` +
        `limit=20`
      );

      const data = await response.json();
      setConversations(data.conversations);
    } catch (error) {
      console.error('Failed to load conversations:', error);
    } finally {
      setLoading(false);
    }
  }

  function getProviderBadge(provider: string) {
    const badges = {
      claude: { color: '#D97757', label: 'Claude' },
      gemini: { color: '#4285F4', label: 'Gemini' },
      openai: { color: '#10A37F', label: 'OpenAI' },
    };
    return badges[provider] || { color: '#666', label: provider };
  }

  return (
    <Modal isOpen={isOpen} onClose={onClose}>
      <div className="recent-conversations">
        <header>
          <h2>Recent Conversations</h2>

          {/* Provider Filter */}
          <div className="filters">
            <button
              className={providerFilter === 'all' ? 'active' : ''}
              onClick={() => setProviderFilter('all')}
            >
              All
            </button>
            <button
              className={providerFilter === 'claude' ? 'active' : ''}
              onClick={() => setProviderFilter('claude')}
            >
              Claude
            </button>
            <button
              className={providerFilter === 'gemini' ? 'active' : ''}
              onClick={() => setProviderFilter('gemini')}
            >
              Gemini
            </button>
            <button
              className={providerFilter === 'openai' ? 'active' : ''}
              onClick={() => setProviderFilter('openai')}
            >
              OpenAI
            </button>
          </div>
        </header>

        <div className="conversations-list">
          {loading ? (
            <div className="loading">Loading...</div>
          ) : conversations.length === 0 ? (
            <div className="empty">No conversations found</div>
          ) : (
            conversations.map(conv => (
              <ConversationCard
                key={conv.id}
                conversation={conv}
                onSelect={() => handleResumeConversation(conv)}
                badge={getProviderBadge(conv.provider)}
              />
            ))
          )}
        </div>
      </div>
    </Modal>
  );
}

function ConversationCard({ conversation, onSelect, badge }: CardProps) {
  return (
    <div className="conversation-card" onClick={onSelect}>
      <div className="header">
        <span
          className="provider-badge"
          style={{ backgroundColor: badge.color }}
        >
          {badge.label}
        </span>
        <span className="model-name">{conversation.modelDisplay}</span>
        <span className="message-count">{conversation.messageCount} messages</span>
      </div>

      <h3 className="title">{conversation.title}</h3>

      {conversation.summary && (
        <p className="summary">{conversation.summary}</p>
      )}

      <div className="footer">
        <span className="project-path">{conversation.projectPath}</span>
        <span className="timestamp">{formatTimestamp(conversation.updated)}</span>
      </div>
    </div>
  );
}
```

### Resume Conversation Logic

```typescript
// src/renderer/services/conversationResume.ts

export async function resumeConversation(
  conversation: ConversationEntry,
  currentProvider: ProviderType
): Promise<void> {
  // Case 1: Same provider - direct resume
  if (conversation.provider === currentProvider) {
    await resumeSameProvider(conversation);
    return;
  }

  // Case 2: Different provider - cross-provider resume
  // (Requires conversation translation - see CONVERSATION_PORTABILITY.md)
  await resumeCrossProvider(conversation, currentProvider);
}

async function resumeSameProvider(conversation: ConversationEntry): Promise<void> {
  const { provider, id, filePath } = conversation;

  switch (provider) {
    case 'claude':
      // Use existing Claude resume logic
      await invoke('spawn_claude', {
        model: conversation.model,
        cwd: conversation.projectPath,
        sessionId: id,
        resume: true,
      });
      break;

    case 'gemini':
      // Resume via yume-cli
      await invoke('spawn_yume_cli', {
        provider: 'gemini',
        model: conversation.model,
        cwd: conversation.projectPath,
        sessionId: id,
        resume: true,
      });
      break;

    case 'openai':
      // Resume via yume-cli
      await invoke('spawn_yume_cli', {
        provider: 'openai',
        model: conversation.model,
        cwd: conversation.projectPath,
        sessionId: id,
        resume: true,
      });
      break;
  }
}

async function resumeCrossProvider(
  conversation: ConversationEntry,
  targetProvider: ProviderType
): Promise<void> {
  // 1. Load source conversation
  const sourceConv = await loadConversation(conversation.filePath, conversation.provider);

  // 2. Convert to Unified Conversation Format (UCF)
  const ucf = await conversationTranslator.importFrom(sourceConv, conversation.provider);

  // 3. Analyze switch feasibility
  const analysis = conversationTranslator.analyzeSwitch(
    ucf,
    targetProvider,
    getDefaultModel(targetProvider)
  );

  // 4. Show warnings if needed
  if (analysis.warnings.length > 0) {
    const confirmed = await showSwitchWarningModal(analysis);
    if (!confirmed) return;
  }

  // 5. Prepare for target provider
  const prepared = await conversationTranslator.prepareForSwitch(
    ucf,
    targetProvider,
    getDefaultModel(targetProvider)
  );

  // 6. Start new session with translated history
  await startSessionWithHistory(targetProvider, prepared);
}
```

## Provider Detection & Model Display Names

```rust
// src-tauri/src/models.rs

pub fn get_model_display_name(model_id: &str) -> String {
    match model_id {
        // Claude
        "claude-sonnet-4-5-20250929" => "Sonnet 4.5".to_string(),
        "claude-opus-4-5-20251101" => "Opus 4.5".to_string(),

        // Gemini
        "gemini-2.0-flash" => "Gemini 2.0 Flash".to_string(),
        "gemini-2.0-flash-thinking" => "Gemini 2.0 Thinking".to_string(),
        "gemini-1.5-pro" => "Gemini 1.5 Pro".to_string(),
        "gemini-1.5-flash" => "Gemini 1.5 Flash".to_string(),

        // OpenAI
        "gpt-4o" => "GPT-4o".to_string(),
        "gpt-4o-mini" => "GPT-4o Mini".to_string(),
        "o1" => "O1".to_string(),
        "o1-mini" => "O1 Mini".to_string(),
        "o3-mini" => "O3 Mini".to_string(),

        // Fallback
        _ => model_id.to_string(),
    }
}

pub fn detect_provider_from_model(model_id: &str) -> ProviderType {
    if model_id.starts_with("claude-") {
        ProviderType::Claude
    } else if model_id.starts_with("gemini-") {
        ProviderType::Gemini
    } else if model_id.starts_with("gpt-") || model_id.starts_with("o1") || model_id.starts_with("o3") {
        ProviderType::OpenAI
    } else {
        ProviderType::Unknown
    }
}
```

## Backward Compatibility Strategy

### 1. Index Migration

On first launch with multi-provider support:
```rust
async fn migrate_to_multi_provider_index() -> Result<()> {
    let index_path = get_session_index_path()?;

    // Check if index exists
    if !index_path.exists() {
        info!("No existing index found - building from scratch");
        SessionIndexManager::rebuild_index().await?;
        return Ok(());
    }

    // Check index version
    let index = SessionIndexManager::load().await?;
    if index.version != "1.0" {
        warn!("Old index version detected - rebuilding");
        SessionIndexManager::rebuild_index().await?;
    }

    Ok(())
}
```

### 2. API Compatibility

Old endpoint `/claude-recent-conversations` remains functional:
- Automatically filters for `provider=claude`
- Returns data in legacy format
- Logs deprecation warning to console
- Will be removed in v2.0

### 3. Session File Compatibility

**Claude sessions:** No changes to `.jsonl` format. Claude CLI continues to manage its own storage.

**yume-cli sessions:** New format defined in YUME_CLI_SPEC.md. No migration needed since yume-cli is new.

### 4. Frontend Compatibility

```typescript
// Support both old and new modal APIs
export function openRecentConversationsModal(options?: {
  provider?: ProviderType;
  project?: string;
}) {
  // New implementation uses provider filter
  // Old code that doesn't pass options still works (shows all)
}
```

## Performance Optimizations

### 1. Index Caching

```typescript
// Cache index in memory for 30 seconds
let indexCache: { data: SessionIndex; timestamp: number } | null = null;

async function loadSessionIndex(filter: SessionFilter): Promise<SessionIndex> {
  const now = Date.now();

  // Return cached index if fresh
  if (indexCache && (now - indexCache.timestamp) < 30000) {
    return filterSessions(indexCache.data, filter);
  }

  // Load fresh index
  const index = await invoke('load_session_index', { filter: {} });
  indexCache = { data: index, timestamp: now };

  return filterSessions(index, filter);
}
```

### 2. Lazy Session File Parsing

Only parse session files when:
- Index is missing or stale
- User requests full rebuild
- Background sync detects new files

**Do NOT parse** on every `/recent-conversations` request.

### 3. Background Index Updates

```rust
// Background task runs every 5 minutes
async fn background_index_sync() {
    let mut interval = tokio::time::interval(Duration::from_secs(300));

    loop {
        interval.tick().await;

        if let Err(e) = SessionIndexManager::update_index().await {
            error!("Background index sync failed: {}", e);
        }
    }
}
```

### 4. Pagination

```typescript
// Load conversations in batches
const BATCH_SIZE = 20;

async function loadMoreConversations(offset: number) {
  const response = await fetch(
    `/recent-conversations?offset=${offset}&limit=${BATCH_SIZE}`
  );
  return response.json();
}
```

## Testing Strategy

### Unit Tests

```rust
#[cfg(test)]
mod tests {
    use super::*;

    #[tokio::test]
    async fn test_parse_claude_session() {
        let session = parse_claude_session(&test_jsonl_path()).await.unwrap();
        assert_eq!(session.provider, ProviderType::Claude);
        assert!(session.message_count > 0);
    }

    #[tokio::test]
    async fn test_parse_gemini_session() {
        let session = parse_gemini_session(&test_json_path()).await.unwrap();
        assert_eq!(session.provider, ProviderType::Gemini);
    }

    #[tokio::test]
    async fn test_session_index_upsert() {
        let mut manager = SessionIndexManager::new();
        let entry = create_test_entry();

        manager.upsert_session(entry.clone()).await.unwrap();
        let loaded = manager.get_session(&entry.session_id).await.unwrap();

        assert_eq!(loaded.title, entry.title);
    }

    #[tokio::test]
    async fn test_decode_claude_project_path() {
        let decoded = decode_claude_project_path(
            Path::new("-Users-yuru-project")
        ).unwrap();
        assert_eq!(decoded, "/Users/yuru/project");
    }
}
```

### Integration Tests

```typescript
describe('Multi-Provider Session Resume', () => {
  it('should list Claude sessions', async () => {
    const response = await fetch('/recent-conversations?provider=claude');
    const data = await response.json();

    expect(data.conversations).toBeDefined();
    expect(data.conversations.every(c => c.provider === 'claude')).toBe(true);
  });

  it('should list Gemini sessions', async () => {
    const response = await fetch('/recent-conversations?provider=gemini');
    const data = await response.json();

    expect(data.conversations.every(c => c.provider === 'gemini')).toBe(true);
  });

  it('should filter by project', async () => {
    const response = await fetch('/recent-conversations?project=/Users/test/project');
    const data = await response.json();

    expect(data.conversations.every(c =>
      c.projectPath === '/Users/test/project'
    )).toBe(true);
  });

  it('should sort by most recent', async () => {
    const response = await fetch('/recent-conversations');
    const data = await response.json();

    const timestamps = data.conversations.map(c => new Date(c.updated).getTime());
    expect(timestamps).toEqual([...timestamps].sort((a, b) => b - a));
  });
});
```

## Implementation Phases

### Phase 1: Foundation (Week 1)
**Goal:** Session index infrastructure

- [ ] Create `SessionIndexEntry` type in Rust
- [ ] Implement `SessionIndexManager` with load/save
- [ ] Create Claude session parser
- [ ] Create Gemini session parser (stub - pending yume-cli)
- [ ] Create OpenAI session parser (stub - pending yume-cli)
- [ ] Add Tauri commands (`load_session_index`, etc.)
- [ ] Write unit tests for parsers
- [ ] Test index rebuild from Claude sessions

**Deliverable:** Index can be built from Claude sessions only

### Phase 2: Server Integration (Week 1)
**Goal:** New API endpoint

- [ ] Create `/recent-conversations` endpoint in server
- [ ] Wire endpoint to Tauri `load_session_index` command
- [ ] Add provider and project filtering
- [ ] Add pagination support
- [ ] Keep `/claude-recent-conversations` for backward compatibility
- [ ] Test endpoint with Postman/curl

**Deliverable:** API returns Claude sessions via new index

### Phase 3: Frontend Updates (Week 2)
**Goal:** UI shows provider badges

- [ ] Update `RecentConversationsModal` component
- [ ] Add provider filter buttons (All/Claude/Gemini/OpenAI)
- [ ] Add provider badges to conversation cards
- [ ] Update conversation card layout (model name, message count)
- [ ] Add loading states and error handling
- [ ] Style provider badges with brand colors

**Deliverable:** Modal shows Claude sessions with provider badges

### Phase 4: Resume Logic (Week 2)
**Goal:** Resume works for same-provider

- [ ] Implement `resumeSameProvider()` function
- [ ] Wire resume to existing Claude spawn logic
- [ ] Add resume support for yume-cli (Gemini/OpenAI) - stub
- [ ] Test resuming Claude sessions from modal
- [ ] Add error handling for missing files

**Deliverable:** Clicking a Claude session resumes it

### Phase 5: Cross-Provider Resume (Week 3) - FUTURE
**Goal:** Switch providers mid-conversation

**Note:** This phase requires CONVERSATION_PORTABILITY.md implementation

- [ ] Implement `resumeCrossProvider()` function
- [ ] Integrate conversation translator service
- [ ] Add switch warning modal
- [ ] Test Claude → Gemini switch
- [ ] Test Gemini → OpenAI switch
- [ ] Handle edge cases (auth failures, context overflow)

**Deliverable:** Can resume Claude session as Gemini session

### Phase 6: yume-cli Integration (Week 3-4)
**Goal:** Gemini and OpenAI sessions appear in list

**Depends on:** Phase 2 of expansion roadmap (yume-cli foundation)

- [ ] Implement Gemini session persistence in yume-cli
- [ ] Implement OpenAI session persistence in yume-cli
- [ ] Update Gemini/OpenAI parsers (remove stubs)
- [ ] Test index rebuild with all three providers
- [ ] Verify filtering and sorting with mixed sessions

**Deliverable:** All three provider sessions show in modal

### Phase 7: Polish & Optimization (Week 4)
**Goal:** Production-ready performance

- [ ] Implement index caching (30s TTL)
- [ ] Add background index sync task (5min interval)
- [ ] Optimize session file parsing (limit line reads)
- [ ] Add index staleness detection
- [ ] Implement lazy loading / infinite scroll
- [ ] Add user-triggered "Rebuild Index" button in Settings
- [ ] Performance testing with 1000+ sessions

**Deliverable:** Fast, reliable session listing

## File Changes Required

### New Files

```
src-tauri/src/
├── session_index.rs              # SessionIndexManager
├── session_parsers/
│   ├── mod.rs
│   ├── claude.rs                 # Claude JSONL parser
│   ├── gemini.rs                 # Gemini JSON parser
│   └── openai.rs                 # OpenAI JSON parser
├── commands/
│   └── sessions.rs               # Session index Tauri commands
└── models.rs                     # Model display name mapping

src/renderer/
├── services/
│   └── conversationResume.ts     # Resume logic
└── components/
    └── RecentConversationsModal/
        └── ProviderBadge.tsx     # Provider badge component
```

### Modified Files

```
src-tauri/src/
├── lib.rs                        # Register new commands
└── main.rs                       # Launch background index sync

server-claude-macos.cjs           # Add /recent-conversations endpoint
server-claude-windows.cjs         # (same)
server-claude-linux.cjs           # (same)

src/renderer/components/
└── RecentConversationsModal/
    └── RecentConversationsModal.tsx   # Multi-provider support
```

### Configuration Files

```
src/renderer/config/
└── providers.ts                  # Provider badge colors, labels

~/.yume/
└── session-index.json           # Generated index file
```

## Security Considerations

### 1. Path Traversal

```rust
// Validate session file paths before reading
fn validate_session_path(path: &Path) -> Result<()> {
    let allowed_dirs = vec![
        get_claude_projects_dir()?,
        get_yume_sessions_dir()?,
    ];

    let canonical = path.canonicalize()?;

    if !allowed_dirs.iter().any(|dir| canonical.starts_with(dir)) {
        return Err(anyhow!("Session path outside allowed directories"));
    }

    Ok(())
}
```

### 2. Sanitize Session Data

```rust
// Prevent XSS in session titles
fn sanitize_title(title: &str) -> String {
    title
        .replace('<', "&lt;")
        .replace('>', "&gt;")
        .chars()
        .take(200)
        .collect()
}
```

### 3. Rate Limiting

```javascript
// Limit index rebuild requests
let lastRebuild = 0;
const REBUILD_COOLDOWN = 60000; // 1 minute

app.post('/rebuild-session-index', async (req, res) => {
  const now = Date.now();
  if (now - lastRebuild < REBUILD_COOLDOWN) {
    return res.status(429).json({
      error: 'Please wait before rebuilding again'
    });
  }

  lastRebuild = now;
  await invoke('rebuild_session_index');
  res.json({ success: true });
});
```

## Migration Path for Existing Users

### Step 1: Detect First Launch
```rust
async fn on_app_launch() {
    let index_path = get_session_index_path()?;

    if !index_path.exists() {
        info!("First launch with multi-provider support - building index");
        show_notification("Building session index...");

        match SessionIndexManager::rebuild_index().await {
            Ok(_) => show_notification("Session index ready"),
            Err(e) => error!("Index build failed: {}", e),
        }
    }
}
```

### Step 2: Progressive Enhancement
- Existing Claude sessions work immediately (via new index)
- Gemini/OpenAI sections appear empty until yume-cli sessions created
- No breaking changes to existing workflows

### Step 3: User Communication
Add to release notes:
```
## Multi-Provider Session Resume

Yume now supports resuming conversations from all three providers:
- Claude (native support)
- Gemini (via yume-cli - coming soon)
- OpenAI (via yume-cli - coming soon)

On first launch, Yume will build an index of your existing Claude
sessions. This may take a few seconds if you have many conversations.

Use the provider filter in the Recent Conversations modal to focus
on sessions from a specific provider.
```

## Dependencies & Prerequisites

### Completed (Available Now)
- Claude session storage in `~/.claude/projects/`
- RecentConversationsModal UI component
- Server endpoint infrastructure

### In Progress (Phase 2)
- yume-cli foundation (spawning, translation)
- Gemini/OpenAI CLI integration
- Session persistence in yume-cli

### Required Before Phase 6
- yume-cli session storage implementation (per YUME_CLI_SPEC.md)
- Session resume support in yume-cli (`--resume` flag)

### Optional Enhancements (Future)
- Conversation translation (CONVERSATION_PORTABILITY.md)
- Cross-provider resume (switch Claude → Gemini)
- Unified Conversation Format (UCF)

## Success Metrics

### Phase 1-4 (Claude-only with new architecture)
- ✅ Index builds in <2 seconds for 100 sessions
- ✅ Index builds in <10 seconds for 1000 sessions
- ✅ Modal loads in <500ms with cached index
- ✅ Backward compatibility: old endpoint still works
- ✅ Zero data loss during migration

### Phase 6 (Multi-provider)
- ✅ All three providers show in modal
- ✅ Provider filter works correctly
- ✅ Resume works for same-provider sessions
- ✅ No confusion between provider sessions

### Phase 7 (Polish)
- ✅ Background sync runs without user noticing
- ✅ Index stays fresh (<5 min lag for new sessions)
- ✅ No UI jank with 1000+ sessions (pagination)
- ✅ User can manually rebuild if index corrupted

## Risk Mitigation

| Risk | Impact | Mitigation |
|------|--------|------------|
| Index corruption | High | Atomic writes, backup on rebuild, user can rebuild |
| yume-cli delay | Medium | Phase gracefully, Claude works first |
| Performance with many sessions | Medium | Pagination, caching, background sync |
| Claude path escaping bugs | Low | Extensive testing, fallback to filename |
| Provider session conflicts | Low | Separate directories per provider |

## Open Questions

1. **Should index be in JSON or SQLite?**
   - JSON: Simpler, human-readable, easier debugging
   - SQLite: Faster queries, better for 10K+ sessions
   - **Decision:** Start with JSON, migrate to SQLite if needed

2. **Should we deduplicate sessions across providers?**
   - Same conversation resumed on both Claude and Gemini
   - **Decision:** No - treat as separate sessions (different providers = different experiences)

3. **How to handle deleted session files?**
   - **Decision:** Background sync removes orphaned entries, rebuild clears all

4. **Should index be per-project or global?**
   - **Decision:** Global index with project filtering (easier to implement, matches current behavior)

## Conclusion

This architecture provides:
- **Unified discovery** of sessions across all providers
- **Backward compatibility** with existing Claude-only code
- **Performance** via indexed metadata (no per-request file parsing)
- **Scalability** to 1000+ sessions via caching and pagination
- **Extensibility** for future providers (just add new parser)

Implementation can proceed in phases, with each phase delivering value independently. Claude support lands first, with Gemini/OpenAI following as yume-cli matures.

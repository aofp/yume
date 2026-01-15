use anyhow::Result;
use chrono::{DateTime, Utc};
use rusqlite::{params, Connection, OptionalExtension};
use serde::{Deserialize, Serialize};
use std::path::PathBuf;

use crate::app::APP_ID;
use std::sync::Mutex;

// Database connection wrapped in a Mutex for thread safety
pub struct Database {
    conn: Mutex<Connection>,
}

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct Session {
    pub id: String,
    pub name: String,
    pub status: String,
    pub working_directory: Option<String>,
    pub claude_session_id: Option<String>,
    pub claude_title: Option<String>,
    pub user_renamed: bool,
    pub created_at: DateTime<Utc>,
    pub updated_at: DateTime<Utc>,
    pub metadata: Option<String>, // JSON string
}

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct Message {
    pub id: String,
    pub session_id: String,
    pub message_type: String,
    pub role: Option<String>,
    pub content: Option<String>,
    pub tool_uses: Option<String>, // JSON string
    pub usage: Option<String>,     // JSON string
    pub timestamp: DateTime<Utc>,
}

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct Analytics {
    pub id: Option<i64>,
    pub session_id: String,
    pub tokens_input: i64,
    pub tokens_output: i64,
    pub tokens_cache: i64,
    pub cost_usd: f64,
    pub model: Option<String>,
    pub timestamp: DateTime<Utc>,
}

impl Database {
    /// Create a new database connection
    pub fn new() -> Result<Self> {
        let db_path = Self::get_db_path()?;

        // Ensure parent directory exists
        if let Some(parent) = db_path.parent() {
            std::fs::create_dir_all(parent)?;
        }

        let conn = Connection::open(db_path)?;

        // Enable WAL mode for better concurrency
        conn.execute("PRAGMA journal_mode = WAL", [])?;
        conn.execute("PRAGMA synchronous = NORMAL", [])?;
        conn.execute("PRAGMA cache_size = -10000", [])?; // 10MB cache
        conn.execute("PRAGMA temp_store = MEMORY", [])?;

        let db = Database {
            conn: Mutex::new(conn),
        };

        db.initialize_schema()?;
        Ok(db)
    }

    /// Get the database path based on platform
    fn get_db_path() -> Result<PathBuf> {
        let base_dir = if cfg!(target_os = "windows") {
            dirs::data_dir()
                .ok_or_else(|| anyhow::anyhow!("Could not determine data directory"))?
                .join(APP_ID)
        } else {
            dirs::home_dir()
                .ok_or_else(|| anyhow::anyhow!("Could not determine home directory"))?
                .join(format!(".{}", APP_ID))
        };

        Ok(base_dir.join(format!("{}.db", APP_ID)))
    }

    /// Initialize database schema
    fn initialize_schema(&self) -> Result<()> {
        let conn = self.conn.lock().unwrap();

        // Sessions table
        conn.execute(
            "CREATE TABLE IF NOT EXISTS sessions (
                id TEXT PRIMARY KEY,
                name TEXT NOT NULL,
                status TEXT DEFAULT 'pending',
                working_directory TEXT,
                claude_session_id TEXT,
                claude_title TEXT,
                user_renamed INTEGER DEFAULT 0,
                created_at TEXT DEFAULT CURRENT_TIMESTAMP,
                updated_at TEXT DEFAULT CURRENT_TIMESTAMP,
                metadata TEXT
            )",
            [],
        )?;

        // Messages table
        conn.execute(
            "CREATE TABLE IF NOT EXISTS messages (
                id TEXT PRIMARY KEY,
                session_id TEXT NOT NULL,
                message_type TEXT NOT NULL,
                role TEXT,
                content TEXT,
                tool_uses TEXT,
                usage TEXT,
                timestamp TEXT DEFAULT CURRENT_TIMESTAMP,
                FOREIGN KEY (session_id) REFERENCES sessions(id) ON DELETE CASCADE
            )",
            [],
        )?;

        // Analytics table
        conn.execute(
            "CREATE TABLE IF NOT EXISTS analytics (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                session_id TEXT NOT NULL,
                tokens_input INTEGER DEFAULT 0,
                tokens_output INTEGER DEFAULT 0,
                tokens_cache INTEGER DEFAULT 0,
                cost_usd REAL DEFAULT 0,
                model TEXT,
                timestamp TEXT DEFAULT CURRENT_TIMESTAMP,
                FOREIGN KEY (session_id) REFERENCES sessions(id) ON DELETE CASCADE
            )",
            [],
        )?;

        // Create indexes
        conn.execute(
            "CREATE INDEX IF NOT EXISTS idx_sessions_updated ON sessions(updated_at)",
            [],
        )?;
        conn.execute(
            "CREATE INDEX IF NOT EXISTS idx_messages_session ON messages(session_id)",
            [],
        )?;
        conn.execute(
            "CREATE INDEX IF NOT EXISTS idx_analytics_session ON analytics(session_id)",
            [],
        )?;

        Ok(())
    }

    // Session operations

    pub fn create_session(&self, session: &Session) -> Result<()> {
        let conn = self.conn.lock().unwrap();
        conn.execute(
            "INSERT INTO sessions (id, name, status, working_directory, claude_session_id, 
             claude_title, user_renamed, created_at, updated_at, metadata)
             VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10)",
            params![
                session.id,
                session.name,
                session.status,
                session.working_directory,
                session.claude_session_id,
                session.claude_title,
                session.user_renamed,
                session.created_at.to_rfc3339(),
                session.updated_at.to_rfc3339(),
                session.metadata,
            ],
        )?;
        Ok(())
    }

    pub fn update_session(&self, session: &Session) -> Result<()> {
        let conn = self.conn.lock().unwrap();
        conn.execute(
            "UPDATE sessions SET name = ?2, status = ?3, working_directory = ?4, 
             claude_session_id = ?5, claude_title = ?6, user_renamed = ?7, 
             updated_at = ?8, metadata = ?9 WHERE id = ?1",
            params![
                session.id,
                session.name,
                session.status,
                session.working_directory,
                session.claude_session_id,
                session.claude_title,
                session.user_renamed,
                Utc::now().to_rfc3339(),
                session.metadata,
            ],
        )?;
        Ok(())
    }

    pub fn get_session(&self, id: &str) -> Result<Option<Session>> {
        let conn = self.conn.lock().unwrap();
        let result = conn
            .query_row(
                "SELECT id, name, status, working_directory, claude_session_id, 
                 claude_title, user_renamed, created_at, updated_at, metadata 
                 FROM sessions WHERE id = ?1",
                params![id],
                |row| {
                    Ok(Session {
                        id: row.get(0)?,
                        name: row.get(1)?,
                        status: row.get(2)?,
                        working_directory: row.get(3)?,
                        claude_session_id: row.get(4)?,
                        claude_title: row.get(5)?,
                        user_renamed: row.get(6)?,
                        created_at: DateTime::parse_from_rfc3339(&row.get::<_, String>(7)?)
                            .unwrap()
                            .with_timezone(&Utc),
                        updated_at: DateTime::parse_from_rfc3339(&row.get::<_, String>(8)?)
                            .unwrap()
                            .with_timezone(&Utc),
                        metadata: row.get(9)?,
                    })
                },
            )
            .optional()?;
        Ok(result)
    }

    pub fn get_all_sessions(&self) -> Result<Vec<Session>> {
        let conn = self.conn.lock().unwrap();
        let mut stmt = conn.prepare(
            "SELECT id, name, status, working_directory, claude_session_id, 
             claude_title, user_renamed, created_at, updated_at, metadata 
             FROM sessions ORDER BY updated_at DESC",
        )?;

        let sessions = stmt
            .query_map([], |row| {
                Ok(Session {
                    id: row.get(0)?,
                    name: row.get(1)?,
                    status: row.get(2)?,
                    working_directory: row.get(3)?,
                    claude_session_id: row.get(4)?,
                    claude_title: row.get(5)?,
                    user_renamed: row.get(6)?,
                    created_at: DateTime::parse_from_rfc3339(&row.get::<_, String>(7)?)
                        .unwrap()
                        .with_timezone(&Utc),
                    updated_at: DateTime::parse_from_rfc3339(&row.get::<_, String>(8)?)
                        .unwrap()
                        .with_timezone(&Utc),
                    metadata: row.get(9)?,
                })
            })?
            .collect::<rusqlite::Result<Vec<_>>>()?;

        Ok(sessions)
    }

    pub fn delete_session(&self, id: &str) -> Result<()> {
        let conn = self.conn.lock().unwrap();
        conn.execute("DELETE FROM sessions WHERE id = ?1", params![id])?;
        Ok(())
    }

    // Message operations

    pub fn save_message(&self, message: &Message) -> Result<()> {
        let conn = self.conn.lock().unwrap();
        conn.execute(
            "INSERT OR REPLACE INTO messages (id, session_id, message_type, role, 
             content, tool_uses, usage, timestamp)
             VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8)",
            params![
                message.id,
                message.session_id,
                message.message_type,
                message.role,
                message.content,
                message.tool_uses,
                message.usage,
                message.timestamp.to_rfc3339(),
            ],
        )?;
        Ok(())
    }

    pub fn get_session_messages(&self, session_id: &str) -> Result<Vec<Message>> {
        let conn = self.conn.lock().unwrap();
        let mut stmt = conn.prepare(
            "SELECT id, session_id, message_type, role, content, tool_uses, usage, timestamp 
             FROM messages WHERE session_id = ?1 ORDER BY timestamp ASC",
        )?;

        let messages = stmt
            .query_map(params![session_id], |row| {
                Ok(Message {
                    id: row.get(0)?,
                    session_id: row.get(1)?,
                    message_type: row.get(2)?,
                    role: row.get(3)?,
                    content: row.get(4)?,
                    tool_uses: row.get(5)?,
                    usage: row.get(6)?,
                    timestamp: DateTime::parse_from_rfc3339(&row.get::<_, String>(7)?)
                        .unwrap()
                        .with_timezone(&Utc),
                })
            })?
            .collect::<rusqlite::Result<Vec<_>>>()?;

        Ok(messages)
    }

    // Analytics operations

    pub fn save_analytics(&self, analytics: &Analytics) -> Result<()> {
        let conn = self.conn.lock().unwrap();
        conn.execute(
            "INSERT INTO analytics (session_id, tokens_input, tokens_output, tokens_cache, 
             cost_usd, model, timestamp)
             VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7)",
            params![
                analytics.session_id,
                analytics.tokens_input,
                analytics.tokens_output,
                analytics.tokens_cache,
                analytics.cost_usd,
                analytics.model,
                analytics.timestamp.to_rfc3339(),
            ],
        )?;
        Ok(())
    }

    pub fn get_session_analytics(&self, session_id: &str) -> Result<Vec<Analytics>> {
        let conn = self.conn.lock().unwrap();
        let mut stmt = conn.prepare(
            "SELECT id, session_id, tokens_input, tokens_output, tokens_cache, 
             cost_usd, model, timestamp 
             FROM analytics WHERE session_id = ?1 ORDER BY timestamp ASC",
        )?;

        let analytics = stmt
            .query_map(params![session_id], |row| {
                Ok(Analytics {
                    id: Some(row.get(0)?),
                    session_id: row.get(1)?,
                    tokens_input: row.get(2)?,
                    tokens_output: row.get(3)?,
                    tokens_cache: row.get(4)?,
                    cost_usd: row.get(5)?,
                    model: row.get(6)?,
                    timestamp: DateTime::parse_from_rfc3339(&row.get::<_, String>(7)?)
                        .unwrap()
                        .with_timezone(&Utc),
                })
            })?
            .collect::<rusqlite::Result<Vec<_>>>()?;

        Ok(analytics)
    }

    // Database maintenance

    pub fn clear_all_data(&self) -> Result<()> {
        let conn = self.conn.lock().unwrap();
        conn.execute("DELETE FROM messages", [])?;
        conn.execute("DELETE FROM analytics", [])?;
        conn.execute("DELETE FROM sessions", [])?;
        conn.execute("VACUUM", [])?;
        Ok(())
    }

    pub fn get_database_size(&self) -> Result<u64> {
        let db_path = Self::get_db_path()?;
        let metadata = std::fs::metadata(db_path)?;
        Ok(metadata.len())
    }

    pub fn get_statistics(&self) -> Result<serde_json::Value> {
        let conn = self.conn.lock().unwrap();

        let session_count: i64 =
            conn.query_row("SELECT COUNT(*) FROM sessions", [], |row| row.get(0))?;

        let message_count: i64 =
            conn.query_row("SELECT COUNT(*) FROM messages", [], |row| row.get(0))?;

        let total_cost: f64 = conn.query_row(
            "SELECT COALESCE(SUM(cost_usd), 0) FROM analytics",
            [],
            |row| row.get(0),
        )?;

        let db_size = self.get_database_size()?;

        Ok(serde_json::json!({
            "sessions": session_count,
            "messages": message_count,
            "total_cost": total_cost,
            "database_size": db_size,
        }))
    }
}

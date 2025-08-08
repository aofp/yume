import React, { useState } from 'react';
import { 
  Plus, 
  Search, 
  Play, 
  Pause, 
  Trash2, 
  Clock,
  MessageSquare,
  DollarSign
} from 'lucide-react';
import { useStore } from '../../stores/useStore';
import './SessionManager.css';

export const SessionManager: React.FC = () => {
  const { sessions, currentSessionId, createSession, resumeSession, pauseSession, deleteSession } = useStore();
  const [searchQuery, setSearchQuery] = useState('');
  const [newSessionName, setNewSessionName] = useState('');
  const [showNewSession, setShowNewSession] = useState(false);

  const filteredSessions = sessions.filter(session =>
    session.name.toLowerCase().includes(searchQuery.toLowerCase())
  );

  const handleCreateSession = async () => {
    if (newSessionName.trim()) {
      await createSession(newSessionName);
      setNewSessionName('');
      setShowNewSession(false);
    }
  };

  return (
    <div className="session-manager">
      <div className="session-header">
        <h2>Sessions</h2>
        <button 
          className="btn-primary-sm"
          onClick={() => setShowNewSession(true)}
        >
          <Plus size={16} />
          <span>New Session</span>
        </button>
      </div>

      <div className="session-search">
        <Search size={16} />
        <input
          type="text"
          placeholder="Search sessions..."
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
        />
      </div>

      {showNewSession && (
        <div className="new-session-form">
          <input
            type="text"
            placeholder="Session name..."
            value={newSessionName}
            onChange={(e) => setNewSessionName(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && handleCreateSession()}
            autoFocus
          />
          <button onClick={handleCreateSession}>Create</button>
          <button onClick={() => setShowNewSession(false)}>Cancel</button>
        </div>
      )}

      <div className="session-list">
        {filteredSessions.map((session) => (
          <div 
            key={session.id}
            className={`session-card ${currentSessionId === session.id ? 'active' : ''}`}
            onClick={() => resumeSession(session.id)}
          >
            <div className="session-card-header">
              <h3>{session.name}</h3>
              <div className="session-status">
                {session.status === 'active' && <span className="status-active">Active</span>}
                {session.status === 'paused' && <span className="status-paused">Paused</span>}
              </div>
            </div>

            <div className="session-meta">
              <div className="meta-item">
                <Clock size={12} />
                <span>{new Date(session.updatedAt).toLocaleDateString()}</span>
              </div>
              <div className="meta-item">
                <MessageSquare size={12} />
                <span>{session.messages.length} messages</span>
              </div>
              <div className="meta-item">
                <DollarSign size={12} />
                <span>${session.cost.toFixed(2)}</span>
              </div>
            </div>

            <div className="session-actions">
              {session.status === 'active' ? (
                <button 
                  className="action-pause"
                  onClick={(e) => {
                    e.stopPropagation();
                    pauseSession(session.id);
                  }}
                >
                  <Pause size={14} />
                </button>
              ) : (
                <button 
                  className="action-play"
                  onClick={(e) => {
                    e.stopPropagation();
                    resumeSession(session.id);
                  }}
                >
                  <Play size={14} />
                </button>
              )}
              
              <button 
                className="action-delete"
                onClick={(e) => {
                  e.stopPropagation();
                  if (confirm('Delete this session?')) {
                    deleteSession(session.id);
                  }
                }}
              >
                <Trash2 size={14} />
              </button>
            </div>
          </div>
        ))}
      </div>

      {filteredSessions.length === 0 && (
        <div className="session-empty">
          {searchQuery ? (
            <p>No sessions found matching "{searchQuery}"</p>
          ) : (
            <p>No sessions yet. Create your first session to get started.</p>
          )}
        </div>
      )}
    </div>
  );
};
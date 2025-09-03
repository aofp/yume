# Yurucode Feature Implementation Guide
## Detailed Step-by-Step Instructions for Adding Opcode Features

---

## Table of Contents
1. [Pre-Implementation Checklist](#pre-implementation-checklist)
2. [Feature 1: Message Virtualization](#feature-1-message-virtualization)
3. [Feature 2: Checkpoint System](#feature-2-checkpoint-system)
4. [Feature 3: Timeline Navigator](#feature-3-timeline-navigator)
5. [Feature 4: Agent Execution](#feature-4-agent-execution)
6. [Feature 5: Performance Optimizations](#feature-5-performance-optimizations)
7. [Cleanup Guide](#cleanup-guide)
8. [Testing Strategy](#testing-strategy)
9. [Rollback Plan](#rollback-plan)

---

## Pre-Implementation Checklist

### Before Starting ANY Implementation:

1. **Create a backup branch:**
```bash
git checkout -b feature/opcode-parity-backup
git push origin feature/opcode-parity-backup
```

2. **Document current working state:**
```bash
# Test current functionality
npm run tauri:dev
# Document what works:
# - Session creation ✓
# - Message streaming ✓
# - Windows/Mac compatibility ✓
```

3. **Set up feature flags:**
```typescript
// src/renderer/config/features.ts
export const FEATURE_FLAGS = {
  USE_VIRTUALIZATION: false,
  ENABLE_CHECKPOINTS: false,
  SHOW_TIMELINE: false,
  ENABLE_AGENT_EXECUTION: false,
  USE_NATIVE_RUST: false, // NEVER turn on until fully tested
};
```

4. **Create rollback script:**
```bash
#!/bin/bash
# scripts/rollback.sh
git stash
git checkout main
git pull origin main
npm install
npm run build
echo "Rolled back to stable version"
```

---

## Feature 1: Message Virtualization
### Time: 2-4 hours | Risk: LOW | Impact: HIGH

### Step 1.1: Install Dependencies
```bash
npm install @tanstack/react-virtual@^3.13.10
npm install --save-dev @types/react-window
```

### Step 1.2: Create Virtualized Message Component
```typescript
// src/renderer/components/Chat/VirtualizedMessageList.tsx
import { useVirtualizer } from '@tanstack/react-virtual';
import React, { useRef, useEffect, useCallback, useMemo } from 'react';
import { MessageRenderer } from './MessageRenderer';
import type { Message } from '../../types';

interface VirtualizedMessageListProps {
  messages: Message[];
  sessionId: string;
  className?: string;
}

export const VirtualizedMessageList: React.FC<VirtualizedMessageListProps> = ({
  messages,
  sessionId,
  className = ''
}) => {
  const parentRef = useRef<HTMLDivElement>(null);
  const scrollingRef = useRef(false);
  
  // Estimate message heights based on content
  const estimateSize = useCallback((index: number) => {
    const msg = messages[index];
    if (!msg) return 100;
    
    // Tool messages are taller
    if (msg.type === 'tool_use') return 200;
    
    // Estimate based on content length
    const contentLength = msg.content?.length || 0;
    if (contentLength > 2000) return 500;
    if (contentLength > 1000) return 300;
    if (contentLength > 500) return 200;
    return 100;
  }, [messages]);
  
  const virtualizer = useVirtualizer({
    count: messages.length,
    getScrollElement: () => parentRef.current,
    estimateSize,
    overscan: 5, // Render 5 items outside viewport
    getItemKey: useCallback((index: number) => messages[index]?.id || `msg-${index}`, [messages]),
  });
  
  // Auto-scroll to bottom on new messages
  useEffect(() => {
    if (!scrollingRef.current && messages.length > 0) {
      virtualizer.scrollToIndex(messages.length - 1, {
        behavior: 'smooth',
        align: 'end',
      });
    }
  }, [messages.length, virtualizer]);
  
  // Detect manual scrolling
  const handleScroll = useCallback(() => {
    if (!parentRef.current) return;
    
    const { scrollTop, scrollHeight, clientHeight } = parentRef.current;
    const isNearBottom = scrollHeight - scrollTop - clientHeight < 100;
    
    // User is scrolling if not near bottom
    scrollingRef.current = !isNearBottom;
  }, []);
  
  // Memoize virtual items to prevent re-renders
  const virtualItems = virtualizer.getVirtualItems();
  
  return (
    <div 
      ref={parentRef}
      className={`messages-virtualized ${className}`}
      onScroll={handleScroll}
      style={{
        height: '100%',
        overflow: 'auto',
        position: 'relative'
      }}
    >
      <div
        style={{
          height: `${virtualizer.getTotalSize()}px`,
          width: '100%',
          position: 'relative',
        }}
      >
        {virtualItems.map((virtualItem) => {
          const message = messages[virtualItem.index];
          if (!message) return null;
          
          return (
            <div
              key={virtualItem.key}
              data-index={virtualItem.index}
              ref={virtualizer.measureElement}
              style={{
                position: 'absolute',
                top: 0,
                left: 0,
                width: '100%',
                transform: `translateY(${virtualItem.start}px)`,
              }}
            >
              <MessageRenderer
                message={message}
                sessionId={sessionId}
                isVirtualized={true}
              />
            </div>
          );
        })}
      </div>
    </div>
  );
};
```

### Step 1.3: Update ClaudeChat to Use Virtualization
```typescript
// src/renderer/components/Chat/ClaudeChat.tsx
// Find the existing message list rendering and replace with:

import { VirtualizedMessageList } from './VirtualizedMessageList';
import { FEATURE_FLAGS } from '../../config/features';

// In the render method, replace the message list with:
{FEATURE_FLAGS.USE_VIRTUALIZATION ? (
  <VirtualizedMessageList
    messages={messages}
    sessionId={sessionId}
    className="flex-1"
  />
) : (
  // Keep existing message rendering as fallback
  <div className="messages-container">
    {messages.map(msg => (
      <MessageRenderer key={msg.id} message={msg} sessionId={sessionId} />
    ))}
  </div>
)}
```

### Step 1.4: Add Performance Monitoring
```typescript
// src/renderer/hooks/usePerformanceMonitor.ts
import { useEffect, useRef } from 'react';

export function usePerformanceMonitor(componentName: string) {
  const renderCount = useRef(0);
  const renderTime = useRef<number[]>([]);
  
  useEffect(() => {
    const startTime = performance.now();
    renderCount.current++;
    
    return () => {
      const endTime = performance.now();
      const duration = endTime - startTime;
      renderTime.current.push(duration);
      
      // Log every 10 renders
      if (renderCount.current % 10 === 0) {
        const avgTime = renderTime.current.reduce((a, b) => a + b, 0) / renderTime.current.length;
        console.log(`[PERF] ${componentName}: ${renderCount.current} renders, avg ${avgTime.toFixed(2)}ms`);
        
        // Alert if performance degrades
        if (avgTime > 100) {
          console.warn(`[PERF] ${componentName} is slow: ${avgTime}ms average render time`);
        }
      }
    };
  });
}
```

### Step 1.5: Test Virtualization
```typescript
// src/renderer/tests/virtualization.test.ts
function generateTestMessages(count: number) {
  return Array.from({ length: count }, (_, i) => ({
    id: `test-msg-${i}`,
    type: i % 3 === 0 ? 'tool_use' : 'assistant',
    content: `Test message ${i}`.repeat(Math.random() * 100),
    timestamp: Date.now() - (count - i) * 1000,
  }));
}

// Test with 1000+ messages
const testMessages = generateTestMessages(1000);
// Measure render time
// Check memory usage
// Verify smooth scrolling
```

### Step 1.6: Enable Virtualization
```typescript
// src/renderer/config/features.ts
export const FEATURE_FLAGS = {
  USE_VIRTUALIZATION: true, // Enable after testing
  // ... other flags
};
```

---

## Feature 2: Checkpoint System
### Time: 8-12 hours | Risk: MEDIUM | Impact: VERY HIGH

### Step 2.1: Create Checkpoint Types
```typescript
// src/renderer/types/checkpoint.ts
export interface Checkpoint {
  id: string;
  sessionId: string;
  projectId: string;
  parentId?: string;
  createdAt: Date;
  messageCount: number;
  metadata: CheckpointMetadata;
  fileSnapshots: FileSnapshot[];
}

export interface CheckpointMetadata {
  description?: string;
  trigger: 'manual' | 'auto' | 'tool_use' | 'error';
  tokensUsed: number;
  model: string;
  messageIds: string[];
}

export interface FileSnapshot {
  path: string;
  contentHash: string;
  content?: string; // Base64 encoded
  modifiedAt: Date;
  size: number;
}

export interface SessionTimeline {
  sessionId: string;
  rootCheckpoint?: string;
  currentCheckpoint?: string;
  checkpoints: Map<string, Checkpoint>;
  branches: TimelineBranch[];
}

export interface TimelineBranch {
  id: string;
  parentCheckpointId: string;
  name: string;
  createdAt: Date;
}
```

### Step 2.2: Add Checkpoint Commands to Embedded Server
```javascript
// src-tauri/src/logged_server.rs - Add to EMBEDDED_SERVER constant

// Add checkpoint storage (around line 1050)
let checkpoints = new Map(); // Map of sessionId -> checkpoints
let timelines = new Map();   // Map of sessionId -> timeline

// Add checkpoint creation handler (around line 2500)
socket.on('create-checkpoint', async (data) => {
  const { sessionId, description, trigger = 'manual' } = data;
  console.log(`📸 Creating checkpoint for session ${sessionId}`);
  
  try {
    const session = sessions.get(sessionId);
    if (!session) {
      socket.emit('checkpoint-error', { 
        sessionId, 
        error: 'Session not found' 
      });
      return;
    }
    
    // Create checkpoint ID
    const checkpointId = `chk_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    
    // Capture current state
    const checkpoint = {
      id: checkpointId,
      sessionId: sessionId,
      projectId: session.projectPath,
      parentId: timelines.get(sessionId)?.currentCheckpoint,
      createdAt: new Date().toISOString(),
      messageCount: session.messages.length,
      metadata: {
        description: description,
        trigger: trigger,
        tokensUsed: session.tokenCount || 0,
        model: session.model || 'opus',
        messageIds: session.messages.map(m => m.id),
      },
      fileSnapshots: [], // TODO: Implement file tracking
    };
    
    // Store checkpoint
    if (!checkpoints.has(sessionId)) {
      checkpoints.set(sessionId, []);
    }
    checkpoints.get(sessionId).push(checkpoint);
    
    // Update timeline
    if (!timelines.has(sessionId)) {
      timelines.set(sessionId, {
        sessionId: sessionId,
        rootCheckpoint: checkpointId,
        currentCheckpoint: checkpointId,
        checkpoints: new Map(),
        branches: [],
      });
    } else {
      const timeline = timelines.get(sessionId);
      timeline.currentCheckpoint = checkpointId;
      timeline.checkpoints.set(checkpointId, checkpoint);
    }
    
    // Save to disk (optional)
    const checkpointDir = path.join(homedir(), '.yurucode', 'checkpoints', sessionId);
    if (!fs.existsSync(checkpointDir)) {
      fs.mkdirSync(checkpointDir, { recursive: true });
    }
    
    const checkpointFile = path.join(checkpointDir, `${checkpointId}.json`);
    fs.writeFileSync(checkpointFile, JSON.stringify(checkpoint, null, 2));
    
    console.log(`✅ Checkpoint created: ${checkpointId}`);
    socket.emit('checkpoint-created', { 
      sessionId, 
      checkpoint 
    });
    
  } catch (error) {
    console.error('❌ Checkpoint creation failed:', error);
    socket.emit('checkpoint-error', { 
      sessionId, 
      error: error.message 
    });
  }
});

// Add checkpoint restoration handler
socket.on('restore-checkpoint', async (data) => {
  const { sessionId, checkpointId } = data;
  console.log(`⏮️ Restoring checkpoint ${checkpointId} for session ${sessionId}`);
  
  try {
    const sessionCheckpoints = checkpoints.get(sessionId);
    if (!sessionCheckpoints) {
      throw new Error('No checkpoints found for session');
    }
    
    const checkpoint = sessionCheckpoints.find(c => c.id === checkpointId);
    if (!checkpoint) {
      throw new Error('Checkpoint not found');
    }
    
    const session = sessions.get(sessionId);
    if (!session) {
      throw new Error('Session not found');
    }
    
    // Restore messages up to checkpoint
    const restoredMessages = session.messages.filter(m => 
      checkpoint.metadata.messageIds.includes(m.id)
    );
    
    // Create new session state
    session.messages = restoredMessages;
    session.tokenCount = checkpoint.metadata.tokensUsed;
    
    // Update timeline
    const timeline = timelines.get(sessionId);
    if (timeline) {
      timeline.currentCheckpoint = checkpointId;
    }
    
    console.log(`✅ Checkpoint restored: ${checkpointId}`);
    socket.emit('checkpoint-restored', { 
      sessionId, 
      checkpointId,
      messages: restoredMessages 
    });
    
  } catch (error) {
    console.error('❌ Checkpoint restoration failed:', error);
    socket.emit('checkpoint-error', { 
      sessionId, 
      error: error.message 
    });
  }
});

// Add timeline fetch handler
socket.on('get-timeline', async (data) => {
  const { sessionId } = data;
  
  const timeline = timelines.get(sessionId);
  const sessionCheckpoints = checkpoints.get(sessionId) || [];
  
  socket.emit('timeline-data', {
    sessionId,
    timeline: timeline || null,
    checkpoints: sessionCheckpoints,
  });
});
```

### Step 2.3: Create Checkpoint Service
```typescript
// src/renderer/services/checkpointService.ts
import { claudeCodeClient } from './claudeCodeClient';
import type { Checkpoint, SessionTimeline } from '../types/checkpoint';

class CheckpointService {
  private checkpointCache = new Map<string, Checkpoint[]>();
  private timelineCache = new Map<string, SessionTimeline>();
  
  async createCheckpoint(
    sessionId: string,
    description?: string,
    trigger: 'manual' | 'auto' | 'tool_use' | 'error' = 'manual'
  ): Promise<Checkpoint> {
    return new Promise((resolve, reject) => {
      const socket = claudeCodeClient.getSocket();
      
      // Set up one-time listeners
      const handleCreated = (data: any) => {
        if (data.sessionId === sessionId) {
          socket.off('checkpoint-created', handleCreated);
          socket.off('checkpoint-error', handleError);
          
          // Update cache
          if (!this.checkpointCache.has(sessionId)) {
            this.checkpointCache.set(sessionId, []);
          }
          this.checkpointCache.get(sessionId)!.push(data.checkpoint);
          
          resolve(data.checkpoint);
        }
      };
      
      const handleError = (data: any) => {
        if (data.sessionId === sessionId) {
          socket.off('checkpoint-created', handleCreated);
          socket.off('checkpoint-error', handleError);
          reject(new Error(data.error));
        }
      };
      
      socket.on('checkpoint-created', handleCreated);
      socket.on('checkpoint-error', handleError);
      
      // Send checkpoint request
      socket.emit('create-checkpoint', {
        sessionId,
        description,
        trigger,
      });
      
      // Timeout after 5 seconds
      setTimeout(() => {
        socket.off('checkpoint-created', handleCreated);
        socket.off('checkpoint-error', handleError);
        reject(new Error('Checkpoint creation timed out'));
      }, 5000);
    });
  }
  
  async restoreCheckpoint(sessionId: string, checkpointId: string): Promise<void> {
    return new Promise((resolve, reject) => {
      const socket = claudeCodeClient.getSocket();
      
      const handleRestored = (data: any) => {
        if (data.sessionId === sessionId && data.checkpointId === checkpointId) {
          socket.off('checkpoint-restored', handleRestored);
          socket.off('checkpoint-error', handleError);
          
          // Update store with restored messages
          const store = useClaudeCodeStore.getState();
          store.updateSession(sessionId, {
            messages: data.messages,
          });
          
          resolve();
        }
      };
      
      const handleError = (data: any) => {
        if (data.sessionId === sessionId) {
          socket.off('checkpoint-restored', handleRestored);
          socket.off('checkpoint-error', handleError);
          reject(new Error(data.error));
        }
      };
      
      socket.on('checkpoint-restored', handleRestored);
      socket.on('checkpoint-error', handleError);
      
      socket.emit('restore-checkpoint', {
        sessionId,
        checkpointId,
      });
      
      setTimeout(() => {
        socket.off('checkpoint-restored', handleRestored);
        socket.off('checkpoint-error', handleError);
        reject(new Error('Checkpoint restoration timed out'));
      }, 5000);
    });
  }
  
  async getTimeline(sessionId: string): Promise<SessionTimeline | null> {
    // Check cache first
    if (this.timelineCache.has(sessionId)) {
      return this.timelineCache.get(sessionId)!;
    }
    
    return new Promise((resolve) => {
      const socket = claudeCodeClient.getSocket();
      
      const handleTimeline = (data: any) => {
        if (data.sessionId === sessionId) {
          socket.off('timeline-data', handleTimeline);
          
          // Update cache
          if (data.timeline) {
            this.timelineCache.set(sessionId, data.timeline);
          }
          
          resolve(data.timeline);
        }
      };
      
      socket.on('timeline-data', handleTimeline);
      socket.emit('get-timeline', { sessionId });
      
      setTimeout(() => {
        socket.off('timeline-data', handleTimeline);
        resolve(null);
      }, 3000);
    });
  }
  
  async forkFromCheckpoint(
    sessionId: string, 
    checkpointId: string,
    branchName: string
  ): Promise<string> {
    // Create a new session based on checkpoint
    const checkpoint = this.checkpointCache.get(sessionId)?.find(c => c.id === checkpointId);
    if (!checkpoint) {
      throw new Error('Checkpoint not found');
    }
    
    // Generate new session ID
    const newSessionId = `fork_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    
    // Copy session state up to checkpoint
    // This would involve creating a new session with the checkpoint's messages
    
    return newSessionId;
  }
  
  clearCache() {
    this.checkpointCache.clear();
    this.timelineCache.clear();
  }
}

export const checkpointService = new CheckpointService();
```

### Step 2.4: Add Checkpoint UI Components
```typescript
// src/renderer/components/Checkpoint/CheckpointButton.tsx
import React, { useState } from 'react';
import { IconCamera, IconLoader2 } from '@tabler/icons-react';
import { checkpointService } from '../../services/checkpointService';
import { useClaudeCodeStore } from '../../stores/claudeCodeStore';

export const CheckpointButton: React.FC = () => {
  const [isCreating, setIsCreating] = useState(false);
  const [showModal, setShowModal] = useState(false);
  const [description, setDescription] = useState('');
  const { currentSessionId } = useClaudeCodeStore();
  
  const handleCreateCheckpoint = async () => {
    if (!currentSessionId || isCreating) return;
    
    setIsCreating(true);
    try {
      const checkpoint = await checkpointService.createCheckpoint(
        currentSessionId,
        description || undefined,
        'manual'
      );
      
      console.log('Checkpoint created:', checkpoint);
      
      // Show success notification
      const notification = document.createElement('div');
      notification.className = 'checkpoint-notification';
      notification.textContent = '✅ Checkpoint created';
      document.body.appendChild(notification);
      setTimeout(() => notification.remove(), 3000);
      
      setShowModal(false);
      setDescription('');
    } catch (error) {
      console.error('Failed to create checkpoint:', error);
      alert('Failed to create checkpoint: ' + error.message);
    } finally {
      setIsCreating(false);
    }
  };
  
  return (
    <>
      <button
        onClick={() => setShowModal(true)}
        className="checkpoint-button"
        title="Create checkpoint"
        disabled={!currentSessionId}
      >
        <IconCamera size={20} />
      </button>
      
      {showModal && (
        <div className="checkpoint-modal">
          <div className="checkpoint-modal-content">
            <h3>Create Checkpoint</h3>
            <input
              type="text"
              placeholder="Description (optional)"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              maxLength={100}
            />
            <div className="checkpoint-modal-buttons">
              <button onClick={() => setShowModal(false)}>Cancel</button>
              <button 
                onClick={handleCreateCheckpoint}
                disabled={isCreating}
              >
                {isCreating ? <IconLoader2 className="spin" /> : 'Create'}
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
};
```

### Step 2.5: Add Auto-Checkpoint on Tool Use
```javascript
// In embedded server, modify tool_use handling (around line 3500)
// When emitting tool_use message:
if (toolName && ['edit', 'write', 'multiedit', 'bash'].includes(toolName.toLowerCase())) {
  // Auto-create checkpoint before risky operations
  const autoCheckpoint = {
    id: `auto_chk_${Date.now()}`,
    sessionId: sessionId,
    trigger: 'tool_use',
    metadata: {
      tool: toolName,
      description: `Auto-checkpoint before ${toolName}`,
    },
    // ... rest of checkpoint data
  };
  
  // Store checkpoint
  if (!checkpoints.has(sessionId)) {
    checkpoints.set(sessionId, []);
  }
  checkpoints.get(sessionId).push(autoCheckpoint);
  
  console.log(`📸 Auto-checkpoint created before ${toolName}`);
}
```

---

## Feature 3: Timeline Navigator
### Time: 6-8 hours | Risk: LOW | Impact: HIGH

### Step 3.1: Copy Timeline Component from Opcode
```typescript
// src/renderer/components/Timeline/TimelineNavigator.tsx
// Copy from opcode/src/components/TimelineNavigator.tsx
// Then adapt to yurucode's structure:

import React, { useState, useEffect } from 'react';
import { 
  IconGitBranch, 
  IconRotateClockwise,
  IconGitCommit,
  IconChevronRight,
  IconChevronDown 
} from '@tabler/icons-react';
import { checkpointService } from '../../services/checkpointService';
import { useClaudeCodeStore } from '../../stores/claudeCodeStore';
import type { Checkpoint, SessionTimeline } from '../../types/checkpoint';

interface TimelineNavigatorProps {
  sessionId: string;
  className?: string;
}

export const TimelineNavigator: React.FC<TimelineNavigatorProps> = ({
  sessionId,
  className = ''
}) => {
  const [timeline, setTimeline] = useState<SessionTimeline | null>(null);
  const [checkpoints, setCheckpoints] = useState<Checkpoint[]>([]);
  const [selectedCheckpoint, setSelectedCheckpoint] = useState<string | null>(null);
  const [expandedNodes, setExpandedNodes] = useState<Set<string>>(new Set());
  const [isLoading, setIsLoading] = useState(false);
  const [showDiff, setShowDiff] = useState(false);
  
  // Load timeline on mount
  useEffect(() => {
    loadTimeline();
  }, [sessionId]);
  
  const loadTimeline = async () => {
    setIsLoading(true);
    try {
      const timelineData = await checkpointService.getTimeline(sessionId);
      if (timelineData) {
        setTimeline(timelineData);
        setCheckpoints(Array.from(timelineData.checkpoints.values()));
      }
    } catch (error) {
      console.error('Failed to load timeline:', error);
    } finally {
      setIsLoading(false);
    }
  };
  
  const handleRestore = async (checkpointId: string) => {
    if (!confirm('Restore to this checkpoint? Current changes will be lost.')) {
      return;
    }
    
    setIsLoading(true);
    try {
      await checkpointService.restoreCheckpoint(sessionId, checkpointId);
      
      // Refresh timeline
      await loadTimeline();
      
      // Show success
      alert('Checkpoint restored successfully');
    } catch (error) {
      console.error('Failed to restore checkpoint:', error);
      alert('Failed to restore checkpoint: ' + error.message);
    } finally {
      setIsLoading(false);
    }
  };
  
  const handleFork = async (checkpointId: string) => {
    const branchName = prompt('Enter branch name:');
    if (!branchName) return;
    
    try {
      const newSessionId = await checkpointService.forkFromCheckpoint(
        sessionId,
        checkpointId,
        branchName
      );
      
      // Switch to new session
      const store = useClaudeCodeStore.getState();
      store.setCurrentSession(newSessionId);
      
      alert(`Created new branch: ${branchName}`);
    } catch (error) {
      console.error('Failed to fork checkpoint:', error);
      alert('Failed to fork checkpoint: ' + error.message);
    }
  };
  
  const toggleNode = (nodeId: string) => {
    const newExpanded = new Set(expandedNodes);
    if (newExpanded.has(nodeId)) {
      newExpanded.delete(nodeId);
    } else {
      newExpanded.add(nodeId);
    }
    setExpandedNodes(newExpanded);
  };
  
  const renderCheckpointNode = (checkpoint: Checkpoint, level: number = 0) => {
    const isExpanded = expandedNodes.has(checkpoint.id);
    const isSelected = selectedCheckpoint === checkpoint.id;
    const isCurrent = timeline?.currentCheckpoint === checkpoint.id;
    
    // Find child checkpoints
    const children = checkpoints.filter(c => c.parentId === checkpoint.id);
    
    return (
      <div key={checkpoint.id} className="timeline-node" style={{ marginLeft: level * 20 }}>
        <div 
          className={`timeline-node-header ${isSelected ? 'selected' : ''} ${isCurrent ? 'current' : ''}`}
          onClick={() => setSelectedCheckpoint(checkpoint.id)}
        >
          {children.length > 0 && (
            <button onClick={(e) => {
              e.stopPropagation();
              toggleNode(checkpoint.id);
            }}>
              {isExpanded ? <IconChevronDown size={16} /> : <IconChevronRight size={16} />}
            </button>
          )}
          
          <IconGitCommit size={16} />
          
          <div className="timeline-node-info">
            <div className="timeline-node-title">
              {checkpoint.metadata.description || `Checkpoint ${checkpoint.id.slice(0, 8)}`}
            </div>
            <div className="timeline-node-meta">
              {new Date(checkpoint.createdAt).toLocaleString()} • 
              {checkpoint.messageCount} messages • 
              {checkpoint.metadata.trigger}
            </div>
          </div>
          
          {isCurrent && <span className="timeline-current-badge">CURRENT</span>}
        </div>
        
        {isSelected && (
          <div className="timeline-node-actions">
            <button onClick={() => handleRestore(checkpoint.id)}>
              <IconRotateClockwise size={16} /> Restore
            </button>
            <button onClick={() => handleFork(checkpoint.id)}>
              <IconGitBranch size={16} /> Fork
            </button>
          </div>
        )}
        
        {isExpanded && children.length > 0 && (
          <div className="timeline-children">
            {children.map(child => renderCheckpointNode(child, level + 1))}
          </div>
        )}
      </div>
    );
  };
  
  if (isLoading) {
    return <div className="timeline-loading">Loading timeline...</div>;
  }
  
  if (!timeline || checkpoints.length === 0) {
    return (
      <div className={`timeline-empty ${className}`}>
        <IconGitBranch size={32} />
        <p>No checkpoints yet</p>
        <small>Create checkpoints to save your progress</small>
      </div>
    );
  }
  
  // Find root checkpoints (no parent)
  const rootCheckpoints = checkpoints.filter(c => !c.parentId);
  
  return (
    <div className={`timeline-navigator ${className}`}>
      <div className="timeline-header">
        <h3>Session Timeline</h3>
        <button onClick={loadTimeline} title="Refresh">
          <IconRotateClockwise size={16} />
        </button>
      </div>
      
      <div className="timeline-tree">
        {rootCheckpoints.map(checkpoint => renderCheckpointNode(checkpoint))}
      </div>
      
      {showDiff && selectedCheckpoint && (
        <div className="timeline-diff">
          {/* TODO: Implement diff viewer */}
        </div>
      )}
    </div>
  );
};
```

### Step 3.2: Add Timeline Styles
```css
/* src/renderer/components/Timeline/Timeline.css */
.timeline-navigator {
  display: flex;
  flex-direction: column;
  height: 100%;
  background: #0a0a0a;
  border: 1px solid #1a1a1a;
  border-radius: 8px;
  overflow: hidden;
}

.timeline-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 12px 16px;
  border-bottom: 1px solid #1a1a1a;
}

.timeline-header h3 {
  margin: 0;
  font-size: 14px;
  color: #fff;
}

.timeline-tree {
  flex: 1;
  overflow-y: auto;
  padding: 12px;
}

.timeline-node {
  margin-bottom: 8px;
}

.timeline-node-header {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 8px;
  border-radius: 4px;
  cursor: pointer;
  transition: background 0.2s;
}

.timeline-node-header:hover {
  background: #1a1a1a;
}

.timeline-node-header.selected {
  background: #1f1f1f;
  border: 1px solid #00ffff;
}

.timeline-node-header.current {
  border-left: 3px solid #00ffff;
}

.timeline-node-info {
  flex: 1;
}

.timeline-node-title {
  font-size: 13px;
  color: #fff;
  margin-bottom: 2px;
}

.timeline-node-meta {
  font-size: 11px;
  color: #666;
}

.timeline-current-badge {
  padding: 2px 6px;
  background: #00ffff;
  color: #000;
  border-radius: 3px;
  font-size: 10px;
  font-weight: bold;
}

.timeline-node-actions {
  display: flex;
  gap: 8px;
  padding: 8px;
  margin-left: 24px;
}

.timeline-node-actions button {
  display: flex;
  align-items: center;
  gap: 4px;
  padding: 4px 8px;
  background: #1a1a1a;
  border: 1px solid #2a2a2a;
  color: #fff;
  border-radius: 4px;
  font-size: 12px;
  cursor: pointer;
  transition: all 0.2s;
}

.timeline-node-actions button:hover {
  background: #2a2a2a;
  border-color: #00ffff;
}

.timeline-children {
  margin-top: 4px;
}

.timeline-empty {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  padding: 32px;
  color: #666;
  text-align: center;
}

.timeline-loading {
  padding: 16px;
  text-align: center;
  color: #666;
}
```

### Step 3.3: Integrate Timeline into UI
```typescript
// src/renderer/components/Chat/ClaudeChat.tsx
// Add timeline panel to the chat interface

import { TimelineNavigator } from '../Timeline/TimelineNavigator';
import { FEATURE_FLAGS } from '../../config/features';

// Add state for timeline visibility
const [showTimeline, setShowTimeline] = useState(false);

// In the render method, add timeline toggle button
<button 
  onClick={() => setShowTimeline(!showTimeline)}
  className="timeline-toggle-button"
  title="Show timeline"
>
  <IconGitBranch size={20} />
</button>

// Add timeline panel (can be a sidebar or modal)
{FEATURE_FLAGS.SHOW_TIMELINE && showTimeline && (
  <div className="timeline-panel">
    <TimelineNavigator sessionId={currentSessionId} />
  </div>
)}
```

---

## Feature 4: Agent Execution
### Time: 10-15 hours | Risk: HIGH | Impact: VERY HIGH

### Step 4.1: Extend Agent Types for Execution
```typescript
// src/renderer/types/agent.ts
export interface AgentRun {
  id: string;
  agentId: string;
  sessionId: string;
  projectPath: string;
  initialPrompt: string;
  status: 'pending' | 'running' | 'completed' | 'failed' | 'cancelled';
  startedAt: Date;
  completedAt?: Date;
  output: AgentOutput[];
  metrics: AgentMetrics;
  error?: string;
}

export interface AgentOutput {
  timestamp: Date;
  type: 'message' | 'tool_use' | 'error' | 'system';
  content: string;
  metadata?: any;
}

export interface AgentMetrics {
  tokensUsed: number;
  toolCalls: number;
  filesModified: number;
  duration: number;
  cost: number;
}
```

### Step 4.2: Add Agent Execution to Embedded Server
```javascript
// In embedded server (logged_server.rs), add agent execution

// Agent run storage
let agentRuns = new Map(); // Map of runId -> AgentRun

// Agent execution handler
socket.on('execute-agent', async (data) => {
  const { agentId, projectPath, initialPrompt } = data;
  console.log(`🤖 Executing agent ${agentId} in ${projectPath}`);
  
  try {
    // Load agent configuration
    const agent = await loadAgent(agentId);
    if (!agent) {
      throw new Error('Agent not found');
    }
    
    // Create run ID
    const runId = `run_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    
    // Create session for agent
    const agentSessionId = `agent_${runId}`;
    
    // Initialize run
    const run = {
      id: runId,
      agentId: agentId,
      sessionId: agentSessionId,
      projectPath: projectPath,
      initialPrompt: initialPrompt,
      status: 'pending',
      startedAt: new Date().toISOString(),
      output: [],
      metrics: {
        tokensUsed: 0,
        toolCalls: 0,
        filesModified: 0,
        duration: 0,
        cost: 0,
      }
    };
    
    agentRuns.set(runId, run);
    
    // Emit run started
    socket.emit('agent-run-started', { runId, run });
    
    // Prepare Claude arguments with agent's system prompt
    const args = [
      '-p', initialPrompt,
      '--system', agent.system_prompt,
      '--model', agent.model || 'opus',
      '--print',
      '--output-format', 'stream-json',
      '--verbose'
    ];
    
    // Spawn Claude process for agent
    const claudeProcess = spawn(CLAUDE_PATH, args, {
      cwd: projectPath,
      env: process.env,
      stdio: ['pipe', 'pipe', 'pipe']
    });
    
    // Track in active processes
    activeProcesses.set(agentSessionId, claudeProcess);
    run.status = 'running';
    
    // Handle output
    claudeProcess.stdout.on('data', (chunk) => {
      const lines = chunk.toString().split('\n');
      
      lines.forEach(line => {
        if (!line.trim()) return;
        
        try {
          const data = JSON.parse(line);
          
          // Track output
          run.output.push({
            timestamp: new Date().toISOString(),
            type: data.type || 'message',
            content: JSON.stringify(data),
          });
          
          // Update metrics
          if (data.type === 'tool_use') {
            run.metrics.toolCalls++;
          }
          
          if (data.usage) {
            run.metrics.tokensUsed += (data.usage.input_tokens || 0) + (data.usage.output_tokens || 0);
          }
          
          // Emit progress
          socket.emit('agent-run-output', {
            runId: runId,
            output: data,
            metrics: run.metrics,
          });
          
        } catch (e) {
          console.error('Failed to parse agent output:', e);
        }
      });
    });
    
    // Handle completion
    claudeProcess.on('close', (code) => {
      console.log(`🤖 Agent run ${runId} completed with code ${code}`);
      
      run.status = code === 0 ? 'completed' : 'failed';
      run.completedAt = new Date().toISOString();
      run.metrics.duration = Date.now() - new Date(run.startedAt).getTime();
      
      // Calculate cost (rough estimate)
      run.metrics.cost = (run.metrics.tokensUsed / 1000) * 0.01;
      
      // Remove from active processes
      activeProcesses.delete(agentSessionId);
      
      // Emit completion
      socket.emit('agent-run-completed', {
        runId: runId,
        run: run,
      });
    });
    
    // Handle errors
    claudeProcess.stderr.on('data', (data) => {
      console.error(`Agent error: ${data}`);
      run.output.push({
        timestamp: new Date().toISOString(),
        type: 'error',
        content: data.toString(),
      });
    });
    
  } catch (error) {
    console.error('❌ Agent execution failed:', error);
    socket.emit('agent-run-error', {
      agentId: agentId,
      error: error.message,
    });
  }
});

// Stop agent handler
socket.on('stop-agent', async (data) => {
  const { runId } = data;
  const run = agentRuns.get(runId);
  
  if (!run) {
    socket.emit('agent-stop-error', { error: 'Run not found' });
    return;
  }
  
  const process = activeProcesses.get(run.sessionId);
  if (process) {
    console.log(`🛑 Stopping agent run ${runId}`);
    process.kill('SIGTERM');
    run.status = 'cancelled';
    activeProcesses.delete(run.sessionId);
    
    socket.emit('agent-stopped', { runId });
  }
});

// Get agent runs handler
socket.on('get-agent-runs', async (data) => {
  const { agentId } = data;
  
  const runs = Array.from(agentRuns.values())
    .filter(run => !agentId || run.agentId === agentId)
    .sort((a, b) => new Date(b.startedAt) - new Date(a.startedAt));
  
  socket.emit('agent-runs-list', { runs });
});
```

### Step 4.3: Create Agent Execution Service
```typescript
// src/renderer/services/agentExecutionService.ts
import { claudeCodeClient } from './claudeCodeClient';
import type { Agent, AgentRun, AgentMetrics } from '../types/agent';

class AgentExecutionService {
  private activeRuns = new Map<string, AgentRun>();
  private outputBuffers = new Map<string, any[]>();
  
  async executeAgent(
    agent: Agent,
    projectPath: string,
    initialPrompt: string
  ): Promise<string> {
    return new Promise((resolve, reject) => {
      const socket = claudeCodeClient.getSocket();
      
      const handleStarted = (data: any) => {
        socket.off('agent-run-started', handleStarted);
        socket.off('agent-run-error', handleError);
        
        this.activeRuns.set(data.runId, data.run);
        this.outputBuffers.set(data.runId, []);
        
        // Set up output listener
        this.listenToAgentOutput(data.runId);
        
        resolve(data.runId);
      };
      
      const handleError = (data: any) => {
        socket.off('agent-run-started', handleStarted);
        socket.off('agent-run-error', handleError);
        reject(new Error(data.error));
      };
      
      socket.on('agent-run-started', handleStarted);
      socket.on('agent-run-error', handleError);
      
      socket.emit('execute-agent', {
        agentId: agent.id,
        projectPath,
        initialPrompt,
      });
      
      setTimeout(() => {
        socket.off('agent-run-started', handleStarted);
        socket.off('agent-run-error', handleError);
        reject(new Error('Agent execution timed out'));
      }, 10000);
    });
  }
  
  private listenToAgentOutput(runId: string) {
    const socket = claudeCodeClient.getSocket();
    
    const handleOutput = (data: any) => {
      if (data.runId !== runId) return;
      
      // Buffer output
      const buffer = this.outputBuffers.get(runId) || [];
      buffer.push(data.output);
      
      // Update metrics
      const run = this.activeRuns.get(runId);
      if (run && data.metrics) {
        run.metrics = data.metrics;
      }
      
      // Notify subscribers
      this.notifyOutputListeners(runId, data.output);
    };
    
    const handleCompleted = (data: any) => {
      if (data.runId !== runId) return;
      
      socket.off('agent-run-output', handleOutput);
      socket.off('agent-run-completed', handleCompleted);
      
      // Update run status
      this.activeRuns.set(runId, data.run);
      
      // Notify completion
      this.notifyCompletionListeners(runId, data.run);
    };
    
    socket.on('agent-run-output', handleOutput);
    socket.on('agent-run-completed', handleCompleted);
  }
  
  async stopAgent(runId: string): Promise<void> {
    const socket = claudeCodeClient.getSocket();
    
    return new Promise((resolve, reject) => {
      const handleStopped = (data: any) => {
        if (data.runId === runId) {
          socket.off('agent-stopped', handleStopped);
          socket.off('agent-stop-error', handleError);
          
          const run = this.activeRuns.get(runId);
          if (run) {
            run.status = 'cancelled';
          }
          
          resolve();
        }
      };
      
      const handleError = (data: any) => {
        socket.off('agent-stopped', handleStopped);
        socket.off('agent-stop-error', handleError);
        reject(new Error(data.error));
      };
      
      socket.on('agent-stopped', handleStopped);
      socket.on('agent-stop-error', handleError);
      
      socket.emit('stop-agent', { runId });
    });
  }
  
  async getAgentRuns(agentId?: string): Promise<AgentRun[]> {
    const socket = claudeCodeClient.getSocket();
    
    return new Promise((resolve) => {
      const handleRuns = (data: any) => {
        socket.off('agent-runs-list', handleRuns);
        resolve(data.runs || []);
      };
      
      socket.on('agent-runs-list', handleRuns);
      socket.emit('get-agent-runs', { agentId });
      
      setTimeout(() => {
        socket.off('agent-runs-list', handleRuns);
        resolve([]);
      }, 3000);
    });
  }
  
  getActiveRun(runId: string): AgentRun | undefined {
    return this.activeRuns.get(runId);
  }
  
  getOutput(runId: string): any[] {
    return this.outputBuffers.get(runId) || [];
  }
  
  // Event listeners
  private outputListeners = new Map<string, Set<(output: any) => void>>();
  private completionListeners = new Map<string, Set<(run: AgentRun) => void>>();
  
  onOutput(runId: string, callback: (output: any) => void) {
    if (!this.outputListeners.has(runId)) {
      this.outputListeners.set(runId, new Set());
    }
    this.outputListeners.get(runId)!.add(callback);
    
    return () => {
      this.outputListeners.get(runId)?.delete(callback);
    };
  }
  
  onCompletion(runId: string, callback: (run: AgentRun) => void) {
    if (!this.completionListeners.has(runId)) {
      this.completionListeners.set(runId, new Set());
    }
    this.completionListeners.get(runId)!.add(callback);
    
    return () => {
      this.completionListeners.get(runId)?.delete(callback);
    };
  }
  
  private notifyOutputListeners(runId: string, output: any) {
    this.outputListeners.get(runId)?.forEach(callback => {
      try {
        callback(output);
      } catch (e) {
        console.error('Output listener error:', e);
      }
    });
  }
  
  private notifyCompletionListeners(runId: string, run: AgentRun) {
    this.completionListeners.get(runId)?.forEach(callback => {
      try {
        callback(run);
      } catch (e) {
        console.error('Completion listener error:', e);
      }
    });
  }
}

export const agentExecutionService = new AgentExecutionService();
```

### Step 4.4: Create Agent Execution UI
```typescript
// src/renderer/components/Agents/AgentExecution.tsx
import React, { useState, useEffect, useRef } from 'react';
import {
  IconRocket,
  IconLoader2,
  IconX,
  IconCheck,
  IconAlertCircle,
  IconFolder
} from '@tabler/icons-react';
import { agentExecutionService } from '../../services/agentExecutionService';
import type { Agent, AgentRun } from '../../types/agent';

interface AgentExecutionProps {
  agent: Agent;
  onClose: () => void;
}

export const AgentExecution: React.FC<AgentExecutionProps> = ({ agent, onClose }) => {
  const [projectPath, setProjectPath] = useState('');
  const [initialPrompt, setInitialPrompt] = useState('');
  const [isRunning, setIsRunning] = useState(false);
  const [runId, setRunId] = useState<string | null>(null);
  const [run, setRun] = useState<AgentRun | null>(null);
  const [output, setOutput] = useState<any[]>([]);
  const outputRef = useRef<HTMLDivElement>(null);
  
  useEffect(() => {
    if (runId) {
      // Subscribe to output
      const unsubOutput = agentExecutionService.onOutput(runId, (newOutput) => {
        setOutput(prev => [...prev, newOutput]);
        
        // Auto-scroll to bottom
        if (outputRef.current) {
          outputRef.current.scrollTop = outputRef.current.scrollHeight;
        }
      });
      
      // Subscribe to completion
      const unsubComplete = agentExecutionService.onCompletion(runId, (completedRun) => {
        setRun(completedRun);
        setIsRunning(false);
      });
      
      return () => {
        unsubOutput();
        unsubComplete();
      };
    }
  }, [runId]);
  
  const selectProjectPath = async () => {
    // Use Tauri dialog to select folder
    const { open } = await import('@tauri-apps/api/dialog');
    const selected = await open({
      directory: true,
      multiple: false,
      title: 'Select Project Directory',
    });
    
    if (selected && typeof selected === 'string') {
      setProjectPath(selected);
    }
  };
  
  const startExecution = async () => {
    if (!projectPath || !initialPrompt) {
      alert('Please select a project and enter a prompt');
      return;
    }
    
    setIsRunning(true);
    setOutput([]);
    
    try {
      const newRunId = await agentExecutionService.executeAgent(
        agent,
        projectPath,
        initialPrompt
      );
      
      setRunId(newRunId);
      
    } catch (error) {
      console.error('Failed to start agent:', error);
      alert('Failed to start agent: ' + error.message);
      setIsRunning(false);
    }
  };
  
  const stopExecution = async () => {
    if (!runId) return;
    
    try {
      await agentExecutionService.stopAgent(runId);
      setIsRunning(false);
    } catch (error) {
      console.error('Failed to stop agent:', error);
    }
  };
  
  const formatOutput = (item: any) => {
    if (typeof item === 'string') return item;
    
    try {
      const data = typeof item === 'string' ? JSON.parse(item) : item;
      
      if (data.type === 'assistant' && data.message?.content) {
        return <div className="agent-output-message">{data.message.content}</div>;
      }
      
      if (data.type === 'tool_use') {
        return (
          <div className="agent-output-tool">
            🔧 {data.tool_name || 'Tool'}: {data.parameters?.command || JSON.stringify(data.parameters)}
          </div>
        );
      }
      
      return <pre>{JSON.stringify(data, null, 2)}</pre>;
    } catch {
      return <span>{String(item)}</span>;
    }
  };
  
  return (
    <div className="agent-execution-modal">
      <div className="agent-execution-header">
        <div className="agent-info">
          <span className="agent-icon">{agent.icon || '🤖'}</span>
          <h2>Execute: {agent.name}</h2>
        </div>
        <button onClick={onClose} className="close-button">
          <IconX size={20} />
        </button>
      </div>
      
      {!isRunning && !run && (
        <div className="agent-execution-setup">
          <div className="form-group">
            <label>Project Directory</label>
            <div className="path-input">
              <input
                type="text"
                value={projectPath}
                onChange={(e) => setProjectPath(e.target.value)}
                placeholder="/path/to/project"
                readOnly
              />
              <button onClick={selectProjectPath}>
                <IconFolder size={16} /> Browse
              </button>
            </div>
          </div>
          
          <div className="form-group">
            <label>Initial Prompt</label>
            <textarea
              value={initialPrompt}
              onChange={(e) => setInitialPrompt(e.target.value)}
              placeholder="What should the agent do?"
              rows={6}
            />
          </div>
          
          <div className="agent-system-prompt">
            <label>System Prompt (from agent config):</label>
            <pre>{agent.system_prompt}</pre>
          </div>
          
          <button 
            className="start-button"
            onClick={startExecution}
            disabled={!projectPath || !initialPrompt}
          >
            <IconRocket size={20} /> Start Agent
          </button>
        </div>
      )}
      
      {(isRunning || run) && (
        <div className="agent-execution-monitor">
          <div className="execution-status">
            <div className="status-indicator">
              {isRunning ? (
                <>
                  <IconLoader2 className="spin" size={20} />
                  <span>Running...</span>
                </>
              ) : run?.status === 'completed' ? (
                <>
                  <IconCheck size={20} style={{ color: '#00ff00' }} />
                  <span>Completed</span>
                </>
              ) : run?.status === 'failed' ? (
                <>
                  <IconAlertCircle size={20} style={{ color: '#ff0000' }} />
                  <span>Failed</span>
                </>
              ) : (
                <>
                  <IconX size={20} style={{ color: '#ffaa00' }} />
                  <span>Cancelled</span>
                </>
              )}
            </div>
            
            {run?.metrics && (
              <div className="execution-metrics">
                <span>Tokens: {run.metrics.tokensUsed}</span>
                <span>Tools: {run.metrics.toolCalls}</span>
                <span>Files: {run.metrics.filesModified}</span>
                {run.metrics.duration > 0 && (
                  <span>Duration: {Math.round(run.metrics.duration / 1000)}s</span>
                )}
                {run.metrics.cost > 0 && (
                  <span>Cost: ${run.metrics.cost.toFixed(4)}</span>
                )}
              </div>
            )}
          </div>
          
          <div className="execution-output" ref={outputRef}>
            {output.map((item, index) => (
              <div key={index} className="output-item">
                {formatOutput(item)}
              </div>
            ))}
          </div>
          
          {isRunning && (
            <div className="execution-controls">
              <button onClick={stopExecution} className="stop-button">
                <IconX size={16} /> Stop Agent
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  );
};
```

---

## Feature 5: Performance Optimizations
### Time: 4-6 hours | Risk: LOW | Impact: MEDIUM

### Step 5.1: Optimize Store Updates
```typescript
// src/renderer/stores/optimizedStore.ts
import { create } from 'zustand';
import { subscribeWithSelector, shallow } from 'zustand/middleware';
import { immer } from 'zustand/middleware/immer';

// Split stores for better performance
export const useSessionStore = create(
  subscribeWithSelector(
    immer((set, get) => ({
      sessions: new Map<string, Session>(),
      currentSessionId: null,
      
      // Optimized message append
      appendMessage: (sessionId: string, message: Message) => {
        set(state => {
          const session = state.sessions.get(sessionId);
          if (session) {
            // Use immer for immutable updates
            session.messages.push(message);
          }
        });
      },
      
      // Batch message updates
      batchUpdateMessages: (sessionId: string, updates: MessageUpdate[]) => {
        set(state => {
          const session = state.sessions.get(sessionId);
          if (session) {
            updates.forEach(update => {
              const msg = session.messages.find(m => m.id === update.id);
              if (msg) {
                Object.assign(msg, update.changes);
              }
            });
          }
        });
      },
    }))
  )
);

// Separate UI store (not persisted)
export const useUIStore = create((set, get) => ({
  selectedTab: 0,
  sidebarOpen: true,
  modals: new Set<string>(),
  
  // Fast UI updates
  toggleModal: (modalId: string) => {
    set(state => ({
      modals: new Set(
        state.modals.has(modalId) 
          ? [...state.modals].filter(id => id !== modalId)
          : [...state.modals, modalId]
      )
    }));
  },
}));

// Memoized selectors
export const useMessages = (sessionId: string) => {
  return useSessionStore(
    state => state.sessions.get(sessionId)?.messages || [],
    shallow
  );
};

export const useCurrentSession = () => {
  return useSessionStore(
    state => state.sessions.get(state.currentSessionId || ''),
    shallow
  );
};
```

### Step 5.2: Add Request Debouncing
```typescript
// src/renderer/utils/debounce.ts
export function debounce<T extends (...args: any[]) => any>(
  func: T,
  wait: number
): (...args: Parameters<T>) => void {
  let timeout: NodeJS.Timeout;
  
  return function executedFunction(...args: Parameters<T>) {
    const later = () => {
      clearTimeout(timeout);
      func(...args);
    };
    
    clearTimeout(timeout);
    timeout = setTimeout(later, wait);
  };
}

// Usage in components
const debouncedSave = useMemo(
  () => debounce((content: string) => {
    saveToServer(content);
  }, 500),
  []
);
```

### Step 5.3: Implement Lazy Loading
```typescript
// src/renderer/components/LazyLoad.tsx
import { lazy, Suspense } from 'react';

// Lazy load heavy components
const AgentsModal = lazy(() => import('./AgentsModal/AgentsModal'));
const AnalyticsModal = lazy(() => import('./Analytics/AnalyticsModal'));
const TimelineNavigator = lazy(() => import('./Timeline/TimelineNavigator'));

// Loading component
const LoadingFallback = () => (
  <div className="loading-fallback">
    <IconLoader2 className="spin" />
    <span>Loading...</span>
  </div>
);

// Usage
<Suspense fallback={<LoadingFallback />}>
  {showAgents && <AgentsModal />}
</Suspense>
```

### Step 5.4: Add Memory Management
```typescript
// src/renderer/hooks/useMemoryManagement.ts
import { useEffect, useRef } from 'react';

export function useMemoryManagement(threshold = 100) {
  const gcTimer = useRef<NodeJS.Timeout>();
  
  useEffect(() => {
    // Monitor memory usage
    const checkMemory = () => {
      if ('memory' in performance) {
        const used = (performance as any).memory.usedJSHeapSize;
        const limit = (performance as any).memory.jsHeapSizeLimit;
        const usage = (used / limit) * 100;
        
        if (usage > threshold) {
          console.warn(`High memory usage: ${usage.toFixed(2)}%`);
          
          // Trigger cleanup
          if (window.gc) {
            window.gc();
          }
          
          // Clear caches
          clearOldData();
        }
      }
    };
    
    gcTimer.current = setInterval(checkMemory, 30000); // Check every 30s
    
    return () => {
      if (gcTimer.current) {
        clearInterval(gcTimer.current);
      }
    };
  }, [threshold]);
}

function clearOldData() {
  const store = useClaudeCodeStore.getState();
  const sessions = Array.from(store.sessions.values());
  
  // Remove old messages from inactive sessions
  sessions.forEach(session => {
    if (session.id !== store.currentSessionId && session.messages.length > 100) {
      // Keep only last 100 messages for inactive sessions
      store.updateSession(session.id, {
        messages: session.messages.slice(-100)
      });
    }
  });
}
```

---

## Cleanup Guide
### Removing Old Code Safely

### Step C.1: Create Deprecation Markers
```typescript
// src/renderer/utils/deprecated.ts
export function deprecated(message: string) {
  return function (target: any, propertyKey: string, descriptor: PropertyDescriptor) {
    const original = descriptor.value;
    
    descriptor.value = function (...args: any[]) {
      console.warn(`DEPRECATED: ${propertyKey} - ${message}`);
      return original.apply(this, args);
    };
    
    return descriptor;
  };
}

// Usage
class OldService {
  @deprecated('Use new checkpointService instead')
  saveState() {
    // Old implementation
  }
}
```

### Step C.2: Feature Flag Old Code
```typescript
// Before removing, wrap old code in feature flags
if (!FEATURE_FLAGS.USE_NEW_IMPLEMENTATION) {
  // Old code here
} else {
  // New code here
}
```

### Step C.3: Gradual Removal Plan
```bash
# Phase 1: Mark as deprecated (Week 1)
git tag deprecated-old-server-v1

# Phase 2: Move to separate file (Week 2)
mv logged_server.rs logged_server.deprecated.rs
git commit -m "Move deprecated server to separate file"

# Phase 3: Remove imports (Week 3)
# Update all imports to use new implementation

# Phase 4: Delete deprecated code (Week 4)
rm logged_server.deprecated.rs
git commit -m "Remove deprecated server implementation"
```

### Step C.4: Clean Up Embedded Server (DANGER ZONE)
```rust
// src-tauri/src/logged_server.rs
// ONLY after new implementation is 100% working and tested

// Step 1: Extract embedded server to separate file
// Create src-tauri/src/legacy/embedded_server.js
// Copy EMBEDDED_SERVER content to actual .js file

// Step 2: Create feature flag
#[cfg(feature = "legacy_server")]
pub const EMBEDDED_SERVER: &str = include_str!("legacy/embedded_server.js");

#[cfg(not(feature = "legacy_server"))]
pub const EMBEDDED_SERVER: &str = "";

// Step 3: Update Cargo.toml
[features]
default = ["legacy_server"]
native_execution = []

// Step 4: Test without legacy server
cargo build --no-default-features --features native_execution
```

---

## Testing Strategy

### Test Plan for Each Feature

### T.1: Virtualization Tests
```typescript
// tests/virtualization.test.ts
describe('Message Virtualization', () => {
  it('should render 1000+ messages without lag', async () => {
    const messages = generateMessages(1000);
    const startTime = performance.now();
    
    render(<VirtualizedMessageList messages={messages} />);
    
    const renderTime = performance.now() - startTime;
    expect(renderTime).toBeLessThan(100); // Should render in <100ms
  });
  
  it('should only render visible items', () => {
    const messages = generateMessages(1000);
    const { container } = render(<VirtualizedMessageList messages={messages} />);
    
    // Only ~20 messages should be in DOM
    const renderedMessages = container.querySelectorAll('.message-renderer');
    expect(renderedMessages.length).toBeLessThan(30);
  });
});
```

### T.2: Checkpoint Tests
```bash
# Manual test plan for checkpoints
1. Create new session
2. Send 5 messages
3. Create checkpoint "Before changes"
4. Send 5 more messages
5. Restore checkpoint
6. Verify only first 5 messages remain
7. Fork from checkpoint
8. Verify new session created
```

### T.3: Agent Execution Tests
```typescript
// tests/agent-execution.test.ts
describe('Agent Execution', () => {
  it('should execute agent with system prompt', async () => {
    const agent = {
      id: 'test-agent',
      name: 'Test Agent',
      system_prompt: 'You are a test agent',
      model: 'opus'
    };
    
    const runId = await agentExecutionService.executeAgent(
      agent,
      '/tmp/test-project',
      'Test prompt'
    );
    
    expect(runId).toBeTruthy();
    
    // Wait for completion
    await waitFor(() => {
      const run = agentExecutionService.getActiveRun(runId);
      return run?.status === 'completed';
    });
  });
});
```

### T.4: Performance Benchmarks
```typescript
// benchmarks/performance.ts
async function benchmarkMessageRendering() {
  const results = {
    oldImplementation: 0,
    newImplementation: 0,
  };
  
  // Test old implementation
  FEATURE_FLAGS.USE_VIRTUALIZATION = false;
  const oldStart = performance.now();
  // Render 1000 messages
  results.oldImplementation = performance.now() - oldStart;
  
  // Test new implementation  
  FEATURE_FLAGS.USE_VIRTUALIZATION = true;
  const newStart = performance.now();
  // Render 1000 messages
  results.newImplementation = performance.now() - newStart;
  
  console.log('Performance improvement:', 
    ((results.oldImplementation - results.newImplementation) / results.oldImplementation * 100).toFixed(2) + '%'
  );
  
  return results;
}
```

---

## Rollback Plan

### If Things Go Wrong

### R.1: Immediate Rollback
```bash
#!/bin/bash
# scripts/emergency-rollback.sh

echo "🚨 EMERGENCY ROLLBACK INITIATED"

# Stash current changes
git stash push -m "Emergency stash $(date)"

# Checkout last known good commit
git checkout $(git rev-parse HEAD~1)

# Reset feature flags
cat > src/renderer/config/features.ts << EOF
export const FEATURE_FLAGS = {
  USE_VIRTUALIZATION: false,
  ENABLE_CHECKPOINTS: false,
  SHOW_TIMELINE: false,
  ENABLE_AGENT_EXECUTION: false,
  USE_NATIVE_RUST: false,
};
EOF

# Rebuild
npm run build

echo "✅ Rolled back to previous version"
echo "⚠️  Stashed changes saved - run 'git stash list' to see"
```

### R.2: Partial Rollback
```typescript
// Disable specific features without full rollback
export const FEATURE_FLAGS = {
  USE_VIRTUALIZATION: true,  // Keep this
  ENABLE_CHECKPOINTS: false, // Disable problematic feature
  SHOW_TIMELINE: false,      // Disable related UI
  ENABLE_AGENT_EXECUTION: true, // Keep working features
  USE_NATIVE_RUST: false,    // Never enable until tested
};
```

### R.3: Data Recovery
```javascript
// If checkpoint data gets corrupted
socket.on('recover-checkpoints', async (data) => {
  const { sessionId } = data;
  
  try {
    // Try to load from backup
    const backupPath = path.join(homedir(), '.yurucode', 'backups', sessionId);
    if (fs.existsSync(backupPath)) {
      const backup = JSON.parse(fs.readFileSync(backupPath, 'utf8'));
      checkpoints.set(sessionId, backup.checkpoints || []);
      timelines.set(sessionId, backup.timeline || null);
      
      socket.emit('checkpoints-recovered', { sessionId });
    }
  } catch (error) {
    console.error('Recovery failed:', error);
    // Clear corrupted data
    checkpoints.delete(sessionId);
    timelines.delete(sessionId);
  }
});
```

---

## Monitoring & Metrics

### M.1: Add Performance Tracking
```typescript
// src/renderer/services/metricsService.ts
class MetricsService {
  private metrics: Map<string, number[]> = new Map();
  
  track(name: string, value: number) {
    if (!this.metrics.has(name)) {
      this.metrics.set(name, []);
    }
    this.metrics.get(name)!.push(value);
    
    // Alert on degradation
    const values = this.metrics.get(name)!;
    if (values.length > 10) {
      const recent = values.slice(-10);
      const avg = recent.reduce((a, b) => a + b, 0) / recent.length;
      
      if (name === 'render_time' && avg > 100) {
        console.warn(`Performance degradation detected: ${name} avg ${avg}ms`);
      }
    }
  }
  
  report() {
    const report: any = {};
    
    this.metrics.forEach((values, name) => {
      const avg = values.reduce((a, b) => a + b, 0) / values.length;
      const max = Math.max(...values);
      const min = Math.min(...values);
      
      report[name] = { avg, max, min, count: values.length };
    });
    
    return report;
  }
}

export const metrics = new MetricsService();
```

### M.2: Add Error Tracking
```typescript
// src/renderer/services/errorTracking.ts
window.addEventListener('error', (event) => {
  console.error('Global error:', event.error);
  
  // Track error
  const errorInfo = {
    message: event.error?.message || event.message,
    stack: event.error?.stack,
    timestamp: new Date().toISOString(),
    url: event.filename,
    line: event.lineno,
    column: event.colno,
  };
  
  // Save to local storage for debugging
  const errors = JSON.parse(localStorage.getItem('yurucode_errors') || '[]');
  errors.push(errorInfo);
  
  // Keep only last 50 errors
  if (errors.length > 50) {
    errors.shift();
  }
  
  localStorage.setItem('yurucode_errors', JSON.stringify(errors));
});
```

---

## Final Checklist

Before deploying any changes:

- [ ] All tests pass
- [ ] Performance benchmarks show improvement (or no regression)
- [ ] Feature flags are properly set
- [ ] Rollback script is tested and ready
- [ ] Backup of current working version exists
- [ ] Documentation is updated
- [ ] Error handling is comprehensive
- [ ] Memory leaks are checked
- [ ] Cross-platform testing completed (Windows/Mac/Linux)
- [ ] User data migration path exists (if needed)

---

## Support & Troubleshooting

### Common Issues and Solutions

**Issue: Virtualization causes jumpy scrolling**
```typescript
// Solution: Improve size estimation
const estimateSize = useCallback((index: number) => {
  // Cache calculated sizes
  if (sizeCache.has(index)) {
    return sizeCache.get(index);
  }
  // ... calculate size
  sizeCache.set(index, size);
  return size;
}, []);
```

**Issue: Checkpoints not saving**
```javascript
// Check permissions
const checkpointDir = path.join(homedir(), '.yurucode', 'checkpoints');
fs.access(checkpointDir, fs.constants.W_OK, (err) => {
  if (err) {
    console.error('No write permission for checkpoint directory');
    // Create directory with proper permissions
    fs.mkdirSync(checkpointDir, { recursive: true, mode: 0o755 });
  }
});
```

**Issue: Agent execution hangs**
```javascript
// Add timeout to agent execution
const timeout = setTimeout(() => {
  if (claudeProcess && !claudeProcess.killed) {
    claudeProcess.kill('SIGTERM');
    console.error('Agent execution timed out after 5 minutes');
  }
}, 5 * 60 * 1000); // 5 minutes

claudeProcess.on('close', () => {
  clearTimeout(timeout);
});
```

---

## Conclusion

This implementation guide provides a safe, incremental approach to adding opcode's features to yurucode without breaking the existing functionality. Key principles:

1. **Safety First**: Never break working code
2. **Feature Flags**: Test new features gradually
3. **Incremental Migration**: Add features alongside existing code
4. **Comprehensive Testing**: Test each feature thoroughly
5. **Easy Rollback**: Always have a way back

Start with the low-risk, high-impact features (virtualization, Timeline UI) and gradually work towards the more complex architectural changes.

Remember: The embedded server exists for a reason (Windows/WSL complexity). Don't remove it until you're 100% certain the new approach works perfectly on all platforms.
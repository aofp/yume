import React, { useState, useMemo } from 'react';
import {
  IconGitBranch,
  IconGitCommit,
  IconPlayerPlay,
  IconRestore,
  IconEye,
  IconCode,
  IconMessage,
  IconRobot,
  IconClock
} from '@tabler/icons-react';
import { useClaudeCodeStore } from '../../stores/claudeCodeStore';
import './SessionTimeline.css';

interface TimelineNode {
  id: string;
  timestamp: Date;
  type: 'user' | 'assistant' | 'tool' | 'result';
  content: string;
  tokens?: number;
  toolsUsed?: string[];
  messageIndex: number;
}

export const SessionTimeline: React.FC = () => {
  const { sessions, currentSessionId, sendMessage } = useClaudeCodeStore();
  const [selectedNode, setSelectedNode] = useState<string | null>(null);
  const [showDiff, setShowDiff] = useState(false);
  const [compareFrom, setCompareFrom] = useState<number | null>(null);
  const [compareTo, setCompareTo] = useState<number | null>(null);
  const [lastRestore, setLastRestore] = useState<number | null>(null);

  const currentSession = sessions.find(s => s.id === currentSessionId);

  // Build timeline from messages
  const timeline = useMemo(() => {
    if (!currentSession) return [];
    
    const nodes: TimelineNode[] = [];
    
    currentSession.messages.forEach((msg, index) => {
      // Skip system messages
      if (msg.type === 'system') return;
      
      let content = '';
      let toolsUsed: string[] = [];
      
      if (msg.type === 'user') {
        const msgContent = msg.message?.content;
        if (typeof msgContent === 'string') {
          content = msgContent.substring(0, 100);
        } else if (Array.isArray(msgContent) && msgContent[0]?.text) {
          content = msgContent[0].text.substring(0, 100);
        }
      } else if (msg.type === 'assistant') {
        const msgContent = msg.message?.content;
        if (typeof msgContent === 'string') {
          content = msgContent.substring(0, 100);
        } else if (Array.isArray(msgContent)) {
          // Extract text and tools
          msgContent.forEach(block => {
            if (block.type === 'text' && block.text) {
              content = block.text.substring(0, 100);
            } else if (block.type === 'tool_use' && block.name) {
              toolsUsed.push(block.name);
            }
          });
        }
      }
      
      nodes.push({
        id: msg.id || `${index}`,
        timestamp: msg.timestamp ? new Date(msg.timestamp) : new Date(),
        type: msg.type as any,
        content: content || '...',
        toolsUsed: toolsUsed.length > 0 ? toolsUsed : undefined,
        messageIndex: index
      });
    });
    
    return nodes;
  }, [currentSession]);

  const formatTime = (date: Date) => {
    const now = new Date();
    const diff = now.getTime() - date.getTime();
    const minutes = Math.floor(diff / 60000);
    
    if (minutes < 1) return 'just now';
    if (minutes < 60) return `${minutes}m ago`;
    const hours = Math.floor(minutes / 60);
    if (hours < 24) return `${hours}h ago`;
    const days = Math.floor(hours / 24);
    return `${days}d ago`;
  };

  const getNodeIcon = (type: string) => {
    switch (type) {
      case 'user': return <IconMessage size={12} />;
      case 'assistant': return <IconRobot size={12} />;
      case 'tool': return <IconCode size={12} />;
      default: return <IconGitCommit size={12} />;
    }
  };

  const handleNodeClick = (node: TimelineNode) => {
    setSelectedNode(selectedNode === node.id ? null : node.id);
  };

  const handleCompare = (index: number) => {
    if (compareFrom === null) {
      setCompareFrom(index);
      setShowDiff(true);
    } else if (compareTo === null && index !== compareFrom) {
      setCompareTo(index);
    } else {
      setCompareFrom(index);
      setCompareTo(null);
    }
  };

  const handleRestore = async (index: number) => {
    if (!currentSession) return;
    
    // Mark this as the last restore point
    setLastRestore(index);
    
    // Send a system message to indicate restore
    const restoreMessage = `restored session to message ${index + 1} of ${currentSession.messages.length}`;
    await sendMessage(`[system] ${restoreMessage}`);
    
    console.log('Restored to index:', index);
  };

  const renderDiffModal = () => {
    if (!showDiff || compareFrom === null || compareTo === null) return null;
    
    const fromNode = timeline[compareFrom];
    const toNode = timeline[compareTo];
    
    return (
      <div 
        className="diff-modal-overlay"
        onClick={() => { setShowDiff(false); setCompareFrom(null); setCompareTo(null); }}
      >
        <div 
          className="diff-modal"
          onClick={(e) => e.stopPropagation()}
        >
          <div className="diff-header">
            <span>comparing changes</span>
            <button 
              className="diff-close"
              onClick={() => { setShowDiff(false); setCompareFrom(null); setCompareTo(null); }}
            >
              ×
            </button>
          </div>
          <div className="diff-content">
            <div className="diff-side from">
              <div className="diff-label">from: {formatTime(fromNode.timestamp)}</div>
              <div className="diff-text">{fromNode.content}</div>
            </div>
            <div className="diff-side to">
              <div className="diff-label">to: {formatTime(toNode.timestamp)}</div>
              <div className="diff-text">{toNode.content}</div>
            </div>
          </div>
        </div>
      </div>
    );
  };

  if (!currentSession) {
    return (
      <div className="timeline-empty">
        <IconGitBranch size={32} stroke={1} />
        <p>no active session</p>
        <span>select a session to view timeline</span>
      </div>
    );
  }

  return (
    <div className="session-timeline">
      <div className="timeline-header">
        <h3>session timeline</h3>
        <div className="timeline-stats">
          <span>{timeline.length} events</span>
          <span>•</span>
          <span>{currentSession.messages.length} messages</span>
        </div>
      </div>

      <div className="timeline-container">
        {timeline.map((node, index) => (
          <div
            key={node.id}
            className={`timeline-node ${node.type} ${selectedNode === node.id ? 'selected' : ''}`}
            onClick={() => handleNodeClick(node)}
          >
            <div className={`node-line ${lastRestore === index ? 'restored' : ''}`} />
            <div className="node-dot" />
            <div className="node-content">
              <div className="node-header">
                <span className="node-type">{node.type}</span>
                {lastRestore === index && (
                  <span className="restore-indicator">restored here</span>
                )}
                <span className="node-time">
                  {formatTime(node.timestamp)}
                </span>
              </div>
              <div className="node-text">{node.content}</div>
              {node.toolsUsed && (
                <div className="node-tools">
                  {node.toolsUsed.map((tool, i) => (
                    <span key={i} className="tool-badge">{tool.toLowerCase()}</span>
                  ))}
                </div>
              )}
              {selectedNode === node.id && (
                <div className="node-actions">
                  {index > 0 && (
                    <button
                      className="node-action"
                      onClick={(e) => { e.stopPropagation(); handleCompare(index); }}
                      title="compare"
                    >
                      compare
                    </button>
                  )}
                  {index < timeline.length - 1 && (
                    <button
                      className="node-action"
                      onClick={(e) => { e.stopPropagation(); handleRestore(index); }}
                      title="restore to this point"
                    >
                      restore
                    </button>
                  )}
                </div>
              )}
            </div>
          </div>
        ))}
      </div>

      {renderDiffModal()}
    </div>
  );
};
import React, { useState, useMemo } from 'react';
import {
  IconChevronLeft,
  IconChevronRight,
  IconFile,
  IconEdit,
  IconPlus,
  IconTrash,
  IconArrowBackUp,
  IconChevronDown,
  IconChevronUp,
  IconDiff
} from '@tabler/icons-react';
import { useClaudeCodeStore, RestorePoint, FileSnapshot } from '../../stores/claudeCodeStore';
import './FileChangesSidebar.css';

interface FileChangesSidebarProps {
  isOpen: boolean;
  onToggle: () => void;
}

export const FileChangesSidebar: React.FC<FileChangesSidebarProps> = ({ isOpen, onToggle }) => {
  const { sessions, currentSessionId } = useClaudeCodeStore();
  const [expandedPoints, setExpandedPoints] = useState<Set<number>>(new Set());
  const [expandedFiles, setExpandedFiles] = useState<Set<string>>(new Set());
  
  const currentSession = sessions.find(s => s.id === currentSessionId);
  const restorePoints = currentSession?.restorePoints || [];
  const modifiedFiles = currentSession?.modifiedFiles || new Set();
  
  const togglePoint = (index: number) => {
    const newExpanded = new Set(expandedPoints);
    if (newExpanded.has(index)) {
      newExpanded.delete(index);
    } else {
      newExpanded.add(index);
    }
    setExpandedPoints(newExpanded);
  };
  
  const toggleFile = (fileKey: string) => {
    const newExpanded = new Set(expandedFiles);
    if (newExpanded.has(fileKey)) {
      newExpanded.delete(fileKey);
    } else {
      newExpanded.add(fileKey);
    }
    setExpandedFiles(newExpanded);
  };
  
  const handleRestorePoint = (point: RestorePoint) => {
    if (!currentSessionId) return;
    // TODO: Implement full restore with files
    console.log('restoring to point:', point);
  };
  
  const handleRestoreFile = (snapshot: FileSnapshot) => {
    if (!currentSessionId) return;
    // TODO: Implement single file restore
    console.log('restoring file:', snapshot);
  };
  
  const getOperationIcon = (operation: string) => {
    switch (operation) {
      case 'edit':
      case 'multiedit':
        return <IconEdit size={12} stroke={1.5} />;
      case 'write':
        return <IconFile size={12} stroke={1.5} />;
      case 'create':
        return <IconPlus size={12} stroke={1.5} />;
      case 'delete':
        return <IconTrash size={12} stroke={1.5} />;
      default:
        return <IconFile size={12} stroke={1.5} />;
    }
  };
  
  const formatPath = (path: string) => {
    // Convert absolute paths to relative
    const workingDir = currentSession?.workingDirectory || '';
    if (path.startsWith(workingDir)) {
      return path.slice(workingDir.length + 1);
    }
    return path.split('/').pop() || path;
  };
  
  return (
    <div className="file-changes-sidebar">
      <div className="sidebar-header">
        <h3>file changes</h3>
        <button className="sidebar-toggle" onClick={onToggle} title="hide sidebar">
          <IconChevronRight size={16} stroke={1.5} />
        </button>
      </div>
      
      <div className="sidebar-content">
        {restorePoints.length === 0 ? (
          <div className="no-changes">
            <span>no file changes yet</span>
          </div>
        ) : (
          <div className="restore-points-list">
            {restorePoints.map((point, index) => {
              const isExpanded = expandedPoints.has(index);
              const fileCount = point.fileSnapshots.length;
              
              return (
                <div key={index} className="restore-point">
                  <div className="restore-point-header" onClick={() => togglePoint(index)}>
                    <span className="expand-icon">
                      {isExpanded ? <IconChevronDown size={12} /> : <IconChevronUp size={12} />}
                    </span>
                    <span className="point-description">{point.description}</span>
                    <span className="file-count">{fileCount} file{fileCount !== 1 ? 's' : ''}</span>
                    <button 
                      className="restore-btn"
                      onClick={(e) => {
                        e.stopPropagation();
                        handleRestorePoint(point);
                      }}
                      title="restore to this point"
                    >
                      <IconArrowBackUp size={12} stroke={1.5} />
                    </button>
                  </div>
                  
                  {isExpanded && (
                    <div className="file-changes-list">
                      {point.fileSnapshots.map((snapshot, fileIndex) => {
                        const fileKey = `${index}-${fileIndex}`;
                        const isFileExpanded = expandedFiles.has(fileKey);
                        
                        return (
                          <div key={fileKey} className="file-change">
                            <div 
                              className="file-change-header"
                              onClick={() => toggleFile(fileKey)}
                            >
                              <span className="operation-icon">
                                {getOperationIcon(snapshot.operation)}
                              </span>
                              <span className="file-path">{formatPath(snapshot.path)}</span>
                              <button
                                className="restore-file-btn"
                                onClick={(e) => {
                                  e.stopPropagation();
                                  handleRestoreFile(snapshot);
                                }}
                                title="restore this file"
                              >
                                <IconArrowBackUp size={10} stroke={1.5} />
                              </button>
                            </div>
                            
                            {isFileExpanded && snapshot.oldContent && (
                              <div className="file-diff-preview">
                                <div className="diff-content">
                                  <pre className="diff-old">- {snapshot.oldContent.slice(0, 100)}</pre>
                                  <pre className="diff-new">+ {snapshot.content.slice(0, 100)}</pre>
                                </div>
                              </div>
                            )}
                          </div>
                        );
                      })}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>
      
      <div className="sidebar-footer">
        <div className="stats">
          <span>{modifiedFiles.size} files modified</span>
          <span>{restorePoints.length} restore points</span>
        </div>
      </div>
    </div>
  );
};
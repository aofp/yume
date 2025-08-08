import React, { useState, useEffect } from 'react';
import {
  IconFileText,
  IconEdit,
  IconEye,
  IconDeviceFloppy,
  IconRefresh,
  IconCode
} from '@tabler/icons-react';
import ReactMarkdown from 'react-markdown';
import { useClaudeCodeStore } from '../../stores/claudeCodeStore';
import './ClaudeMdEditor.css';

export const ClaudeMdEditor: React.FC = () => {
  const [content, setContent] = useState('');
  const [isEditing, setIsEditing] = useState(false);
  const [hasChanges, setHasChanges] = useState(false);
  const [lastSaved, setLastSaved] = useState<Date | null>(null);
  const { sessions, currentSessionId } = useClaudeCodeStore();
  
  const currentSession = sessions.find(s => s.id === currentSessionId);
  const workingDir = currentSession?.workingDirectory || '/';

  // Load CLAUDE.md content
  useEffect(() => {
    loadClaudeMd();
  }, [workingDir]);

  const loadClaudeMd = async () => {
    try {
      // In a real implementation, this would read from the file system
      // For now, we'll use a default template
      const defaultContent = `# CLAUDE.md

This file provides guidance to Claude Code when working with code in this repository.

## Project Overview

${currentSession?.name || 'Untitled Project'}

Working directory: ${workingDir}

## Development Commands

\`\`\`bash
# Add your common commands here
npm install
npm run dev
npm test
\`\`\`

## Architecture

Describe your project architecture here.

## Key Files

- \`src/index.ts\` - Main entry point
- \`config/\` - Configuration files

## Coding Conventions

- Use TypeScript
- Follow ESLint rules
- Write tests for new features

## Notes

Add any special instructions or context for Claude here.
`;
      setContent(defaultContent);
      setHasChanges(false);
    } catch (error) {
      console.error('Failed to load CLAUDE.md:', error);
    }
  };

  const handleSave = async () => {
    try {
      // In a real implementation, this would save to the file system
      console.log('Saving CLAUDE.md:', content);
      setHasChanges(false);
      setLastSaved(new Date());
      
      // Show saved indicator
      setTimeout(() => {
        setLastSaved(null);
      }, 3000);
    } catch (error) {
      console.error('Failed to save CLAUDE.md:', error);
    }
  };

  const handleContentChange = (value: string) => {
    setContent(value);
    setHasChanges(true);
  };

  const formatLastSaved = () => {
    if (!lastSaved) return '';
    const now = new Date();
    const diff = now.getTime() - lastSaved.getTime();
    if (diff < 5000) return 'saved';
    return '';
  };

  return (
    <div className="claude-md-editor">
      <div className="editor-header">
        <div className="editor-title">
          <IconFileText size={14} />
          <span>CLAUDE.md</span>
          {hasChanges && <span className="unsaved-indicator">•</span>}
        </div>
        <div className="editor-actions">
          {lastSaved && (
            <span className="saved-indicator">{formatLastSaved()}</span>
          )}
          <button
            className={`editor-action ${isEditing ? 'active' : ''}`}
            onClick={() => setIsEditing(!isEditing)}
            title={isEditing ? 'preview' : 'edit'}
          >
            {isEditing ? <IconEye size={14} /> : <IconEdit size={14} />}
          </button>
          {hasChanges && (
            <button
              className="editor-action save"
              onClick={handleSave}
              title="save"
            >
              <IconDeviceFloppy size={14} />
            </button>
          )}
          <button
            className="editor-action"
            onClick={loadClaudeMd}
            title="refresh"
          >
            <IconRefresh size={14} />
          </button>
        </div>
      </div>

      <div className="editor-path">
        <IconCode size={10} />
        <span>{workingDir}/CLAUDE.md</span>
      </div>

      <div className="editor-content">
        {isEditing ? (
          <textarea
            className="editor-textarea"
            value={content}
            onChange={(e) => handleContentChange(e.target.value)}
            placeholder="Add instructions for Claude..."
            spellCheck={false}
          />
        ) : (
          <div className="editor-preview">
            <ReactMarkdown>{content}</ReactMarkdown>
          </div>
        )}
      </div>

      <div className="editor-footer">
        <div className="editor-tips">
          <h4>tips for effective CLAUDE.md:</h4>
          <ul>
            <li>include project structure and architecture</li>
            <li>list common commands and scripts</li>
            <li>document coding conventions</li>
            <li>add context about external dependencies</li>
            <li>specify testing requirements</li>
          </ul>
        </div>
      </div>
    </div>
  );
};
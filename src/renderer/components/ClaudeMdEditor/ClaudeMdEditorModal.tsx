import React, { useState, useEffect, useRef, useCallback } from 'react';
import { invoke } from '@tauri-apps/api/core';
import { IconX, IconDeviceFloppy, IconFile } from '@tabler/icons-react';
import { LoadingIndicator } from '../LoadingIndicator/LoadingIndicator';
import './ClaudeMdEditorModal.css';

// Platform detection (computed once)
const IS_MAC = navigator.platform.toLowerCase().includes('mac');
const IS_WINDOWS = navigator.platform.toLowerCase().includes('win');
const PATH_SEP = IS_WINDOWS ? '\\' : '/';
const MOD_KEY = IS_MAC ? 'cmd' : 'ctrl';

interface ClaudeMdEditorModalProps {
  isOpen: boolean;
  onClose: () => void;
  workingDirectory: string;
}

export const ClaudeMdEditorModal: React.FC<ClaudeMdEditorModalProps> = ({
  isOpen,
  onClose,
  workingDirectory
}) => {
  const [content, setContent] = useState('');
  const [originalContent, setOriginalContent] = useState('');
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [fileExists, setFileExists] = useState(false);
  const [showSavedToast, setShowSavedToast] = useState(false);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const toastTimeoutRef = useRef<number | null>(null);

  // Derived values
  const claudeMdPath = `${workingDirectory}${PATH_SEP}CLAUDE.md`;
  const hasChanges = content !== originalContent;

  // Close with confirmation if needed
  const handleClose = useCallback(() => {
    if (hasChanges) {
      if (window.confirm('discard unsaved changes?')) {
        onClose();
      }
    } else {
      onClose();
    }
  }, [hasChanges, onClose]);

  // Load CLAUDE.md content
  const loadContent = useCallback(async () => {
    if (!workingDirectory) return;

    setLoading(true);
    setError(null);

    try {
      const fileContent = await invoke<string>('read_file_content', { path: claudeMdPath });
      setContent(fileContent);
      setOriginalContent(fileContent);
      setFileExists(true);
    } catch {
      // File doesn't exist - start with empty content
      setContent('');
      setOriginalContent('');
      setFileExists(false);
    }

    setLoading(false);
  }, [workingDirectory, claudeMdPath]);

  // Save CLAUDE.md content
  const saveContent = useCallback(async () => {
    if (!workingDirectory) return;

    setSaving(true);
    setError(null);

    try {
      await invoke('write_file_content', { path: claudeMdPath, content });

      setOriginalContent(content);
      setFileExists(true);

      // Show saved toast (clear any existing timeout)
      if (toastTimeoutRef.current) clearTimeout(toastTimeoutRef.current);
      setShowSavedToast(true);
      toastTimeoutRef.current = window.setTimeout(() => setShowSavedToast(false), 1500);
    } catch (err) {
      console.error('Failed to save CLAUDE.md:', err);
      setError('failed to save file');
    } finally {
      setSaving(false);
    }
  }, [workingDirectory, claudeMdPath, content]);

  // Cleanup toast timeout on unmount
  useEffect(() => {
    return () => {
      if (toastTimeoutRef.current) clearTimeout(toastTimeoutRef.current);
    };
  }, []);

  // Load content when modal opens
  useEffect(() => {
    if (isOpen) {
      loadContent();
    }
  }, [isOpen, loadContent]);

  // Focus textarea when loaded
  useEffect(() => {
    if (!loading && textareaRef.current) {
      textareaRef.current.focus();
    }
  }, [loading]);

  // Handle keyboard shortcuts
  useEffect(() => {
    if (!isOpen) return;

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        e.stopPropagation();
        handleClose();
      }

      if ((e.metaKey || e.ctrlKey) && e.key === 's') {
        e.preventDefault();
        e.stopPropagation();
        if (hasChanges) saveContent();
      }
    };

    window.addEventListener('keydown', handleKeyDown, true);
    return () => window.removeEventListener('keydown', handleKeyDown, true);
  }, [isOpen, hasChanges, handleClose, saveContent]);

  if (!isOpen) return null;

  return (
    <div className="claude-md-modal-overlay" onClick={handleClose}>
      <div className="claude-md-modal" onClick={e => e.stopPropagation()}>
        <div className="claude-md-modal-header" onContextMenu={(e) => e.preventDefault()}>
          <div className="claude-md-modal-title">
            <IconFile size={14} />
            <span>CLAUDE.md</span>
            {!fileExists && !loading && <span className="claude-md-new-badge">new</span>}
            {hasChanges && <span className="claude-md-modified-badge">modified</span>}
          </div>
          <div className="claude-md-modal-actions">
            <button
              className="claude-md-save-btn"
              onClick={saveContent}
              disabled={!hasChanges || saving}
              title={`save (${MOD_KEY}+s)`}
            >
              {saving ? <LoadingIndicator size="small" /> : <IconDeviceFloppy size={16} />}
            </button>
            <button
              className="claude-md-close-btn"
              onClick={handleClose}
              title="close (esc)"
            >
              <IconX size={16} />
            </button>
          </div>
        </div>

        <div className="claude-md-modal-body">
          {loading ? (
            <div className="claude-md-loading">
              <LoadingIndicator size="medium" />
              <span>loading...</span>
            </div>
          ) : error ? (
            <div className="claude-md-error">{error}</div>
          ) : (
            <textarea
              ref={textareaRef}
              className="claude-md-editor"
              value={content}
              onChange={e => setContent(e.target.value)}
              placeholder="# CLAUDE.md

add project-specific instructions for claude here.

example:
- build commands: npm run build
- test commands: npm test
- code style guidelines
- project architecture notes"
              spellCheck={false}
            />
          )}
        </div>

        {showSavedToast && (
          <div className="claude-md-toast">saved</div>
        )}
      </div>
    </div>
  );
};

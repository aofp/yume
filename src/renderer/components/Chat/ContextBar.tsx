import React, { useState, useRef, useEffect } from 'react';
import {
  IconFolder,
  IconGitBranch,
  IconHistory,
  IconMicrophone,
  IconMicrophoneOff,
  IconInputSearch,
  IconRobot,
  IconPencil,
} from '@tabler/icons-react';
import { ModelSelector } from '../ModelSelector/ModelSelector';
import { isBashPrefix } from '../../utils/helpers';
import { isVSCode } from '../../services/tauriApi';
import { getModelById, ProviderType } from '../../config/models';

// Visibility settings for context bar buttons
export interface ContextBarVisibility {
  showCommandPalette: boolean;
  showDictation: boolean;
  showFilesPanel: boolean;
  showHistory: boolean;
}

interface SessionMessage {
  type: string;
  message?: { content?: any };
}

interface ContextBarProps {
  // Model selection
  selectedModel: string;
  onModelChange: (model: string) => void;
  enabledToolsCount: number;
  onOpenModelModal: () => void;

  // Panel states
  showFilesPanel: boolean;
  showRollbackPanel: boolean;
  setShowFilesPanel: (show: boolean) => void;
  setShowRollbackPanel: (show: boolean) => void;

  // Panel state setters for clearing other state
  setSelectedFile: (file: string | null) => void;
  setFileContent: (content: string) => void;
  setSelectedGitFile: (file: string | null) => void;
  setGitDiff: (diff: any) => void;
  setFocusedFileIndex: (index: number) => void;
  setFocusedGitIndex: (index: number) => void;

  // Session state
  workingDirectory: string | undefined;
  isReadOnly: boolean;
  isStreaming: boolean;
  messages: SessionMessage[];

  // Token/context stats
  totalContextTokens: number;
  isTokensPending: boolean;
  autoCompactEnabled: boolean;
  setAutoCompactEnabled: (enabled: boolean) => void;
  isPendingCompact: boolean;

  // Usage limits (only shown for providers that support it)
  usageLimits: {
    five_hour?: { utilization: number; resets_at: string };
    seven_day?: { utilization: number; resets_at: string };
  } | null;

  // Current provider (determines limit bar visibility)
  currentProvider: ProviderType;

  // Actions
  onClearRequest: () => void;
  onCompactRequest: () => void;
  onOpenStatsModal: () => void;

  // Dictation
  isDictating: boolean;
  onToggleDictation: () => void;

  // Platform
  modKey: string;

  // Feature toggles (from settings)
  showDictationSetting: boolean;
  showHistorySetting: boolean;

  // Visibility toggles (from context menu)
  visibility: ContextBarVisibility;
  onVisibilityChange: (visibility: ContextBarVisibility) => void;

  // Git stats
  gitChangesCount: number;

  // Files panel sub-tab
  filesSubTab: 'files' | 'git' | 'sessions';

  // Command palette
  onOpenCommandPalette: () => void;

  // Line changes for this session
  lineChanges?: { added: number; removed: number };
  onOpenSessionChanges?: () => void;

  // Background agents running count
  backgroundAgentCount?: number;
}

export const ContextBar: React.FC<ContextBarProps> = ({
  selectedModel,
  onModelChange,
  enabledToolsCount,
  onOpenModelModal,
  showFilesPanel,
  showRollbackPanel,
  setShowFilesPanel,
  setShowRollbackPanel,
  setSelectedFile,
  setFileContent,
  setSelectedGitFile,
  setGitDiff,
  setFocusedFileIndex,
  setFocusedGitIndex,
  workingDirectory,
  isReadOnly,
  isStreaming,
  messages,
  totalContextTokens,
  isTokensPending,
  autoCompactEnabled,
  setAutoCompactEnabled,
  isPendingCompact,
  usageLimits,
  currentProvider,
  onClearRequest,
  onCompactRequest,
  onOpenStatsModal,
  isDictating,
  onToggleDictation,
  modKey,
  showDictationSetting,
  showHistorySetting,
  visibility,
  onVisibilityChange,
  gitChangesCount,
  filesSubTab,
  onOpenCommandPalette,
  lineChanges,
  onOpenSessionChanges,
  backgroundAgentCount = 0,
}) => {
  // Context menu state
  const [contextMenuPos, setContextMenuPos] = useState<{ x: number; y: number } | null>(null);
  const contextMenuRef = useRef<HTMLDivElement>(null);

  // Close context menu on outside click
  useEffect(() => {
    if (!contextMenuPos) return;
    const handleClick = (e: MouseEvent) => {
      if (contextMenuRef.current && !contextMenuRef.current.contains(e.target as Node)) {
        setContextMenuPos(null);
      }
    };
    document.addEventListener('mousedown', handleClick);
    return () => document.removeEventListener('mousedown', handleClick);
  }, [contextMenuPos]);

  const handleContextMenu = (e: React.MouseEvent) => {
    e.preventDefault();
    setContextMenuPos({ x: e.clientX, y: e.clientY });
  };

  const toggleVisibility = (key: keyof ContextBarVisibility) => {
    onVisibilityChange({ ...visibility, [key]: !visibility[key] });
    setContextMenuPos(null);
  };
  // Get context window from selected model
  const currentModel = getModelById(selectedModel);
  const contextWindowTokens = currentModel?.contextWindow || 200000;

  const rawPercentage = (totalContextTokens / contextWindowTokens * 100);
  const percentageNum = rawPercentage;
  // Only show "?" when pending AND no valid token data
  const percentage = (isTokensPending && totalContextTokens === 0) ? '?' : percentageNum.toFixed(2);

  // Determine usage class
  const usageClass = rawPercentage >= 65 ? 'critical' :
                     isPendingCompact || rawPercentage >= 60 ? 'high' :
                     rawPercentage >= 50 ? 'medium' :
                     rawPercentage >= 40 ? 'low' : 'minimal';

  const hasActivity = messages.some(m =>
    m.type === 'assistant' || m.type === 'tool_use' || m.type === 'tool_result'
  );

  // Count user messages excluding bash commands
  const historyCount = messages.filter(m => {
    if (m.type !== 'user') return false;
    const content = m.message?.content;
    let text = '';
    if (typeof content === 'string') {
      text = content;
    } else if (Array.isArray(content)) {
      text = content.filter((c: any) => c.type === 'text').map((c: any) => c.text).join(' ');
    }
    return !isBashPrefix(text.trim());
  }).length;

  // Build title for combined files button
  const buildFilesButtonTitle = () => {
    const parts = [];
    if (filesSubTab === 'git') parts.push(`git (${modKey}+g)`);
    else if (filesSubTab === 'sessions') parts.push('session changes');
    else parts.push(`files (${modKey}+e)`);

    if (gitChangesCount > 0) parts.push(`${gitChangesCount} git changes`);
    if (backgroundAgentCount > 0) parts.push(`${backgroundAgentCount} agent${backgroundAgentCount > 1 ? 's' : ''}`);
    if (lineChanges && (lineChanges.added > 0 || lineChanges.removed > 0)) {
      parts.push(`+${lineChanges.added} -${lineChanges.removed} lines`);
    }
    return parts.join(' • ');
  };

  return (
    <div className="context-bar" onContextMenu={handleContextMenu}>
      {/* LEFT GROUP: model, palette, dictation */}
      <div className="context-left">
        <ModelSelector
          value={selectedModel}
          onChange={onModelChange}
          toolCount={enabledToolsCount}
          onOpenModal={onOpenModelModal}
        />

        {/* Command palette button */}
        {!isVSCode() && visibility.showCommandPalette && (
          <button
            className="btn-context-icon"
            onClick={onOpenCommandPalette}
            title={`command palette (${modKey}+p)`}
          >
            <span className="btn-icon-wrapper">
              <IconInputSearch size={12} stroke={1.5} />
            </span>
          </button>
        )}

        {/* Dictation button */}
        {!isVSCode() && showDictationSetting && visibility.showDictation && (
          <button
            className={`btn-context-icon ${isDictating ? 'active dictating' : ''}`}
            onClick={onToggleDictation}
            disabled={isReadOnly}
            title={isDictating ? 'stop dictation (F5)' : 'dictate (F5)'}
          >
            <span className="btn-icon-wrapper">
              {isDictating ? (
                <IconMicrophone size={12} stroke={1.5} />
              ) : (
                <IconMicrophoneOff size={12} stroke={1.5} />
              )}
            </span>
          </button>
        )}
      </div>

      {/* RIGHT GROUP: combined files button, history, context% */}
      <div className="context-right">
        {/* History button */}
        {showHistorySetting && visibility.showHistory && (
          <button
            className={`btn-rollback ${showRollbackPanel ? 'active' : ''}`}
            onClick={() => {
              setShowRollbackPanel(!showRollbackPanel);
              setShowFilesPanel(false);
              setSelectedFile(null);
              setFileContent('');
              setSelectedGitFile(null);
              setGitDiff(null);
            }}
            disabled={historyCount === 0}
            title={`history (${modKey}+h)`}
          >
            <IconHistory size={12} stroke={1.5} />
            <span className="btn-rollback-count">{historyCount}</span>
          </button>
        )}

        {/* Combined files/git/sessions button with all stats */}
        {!isVSCode() && visibility.showFilesPanel && (
          <button
            className={`btn-context-icon btn-files-combined ${showFilesPanel ? 'active' : ''}`}
            onClick={() => {
              setShowFilesPanel(!showFilesPanel);
              setSelectedFile(null);
              setFileContent('');
              setSelectedGitFile(null);
              setGitDiff(null);
              setFocusedFileIndex(-1);
              setFocusedGitIndex(-1);
            }}
            disabled={!workingDirectory}
            title={buildFilesButtonTitle()}
          >
            <span className="btn-icon-wrapper">
              {filesSubTab === 'git' ? <IconGitBranch size={12} stroke={1.5} /> : filesSubTab === 'sessions' ? <IconPencil size={12} stroke={1.5} /> : <IconFolder size={12} stroke={1.5} />}
            </span>

            {/* Stats badges - only render container if there are stats to show */}
            {(gitChangesCount > 0 || backgroundAgentCount > 0 || (lineChanges && (lineChanges.added > 0 || lineChanges.removed > 0))) && (
              <span className="btn-files-stats">
                {gitChangesCount > 0 && <span className="stat-badge git-badge">{gitChangesCount}</span>}
                {backgroundAgentCount > 0 && <span className="stat-badge agent-badge">{backgroundAgentCount}</span>}
                {lineChanges && (lineChanges.added > 0 || lineChanges.removed > 0) && (
                  <span className="stat-badge lines-badge">
                    <span className="line-added">+{lineChanges.added}</span>
                    <span className="line-removed">-{lineChanges.removed}</span>
                  </span>
                )}
              </span>
            )}
          </button>
        )}

        {/* Context % button */}
        <div className="btn-stats-container">
          <button
            className={`btn-stats ${usageClass}`}
            onClick={onOpenStatsModal}
            disabled={false}
            title={hasActivity ?
              `${totalContextTokens.toLocaleString()} tokens • ${modKey}+. stats • ${modKey}+shift+./rmb: toggle auto-compact` :
              `0 tokens • ${modKey}+. stats • ${modKey}+shift+./rmb: toggle auto-compact`}
            onContextMenu={(e) => {
              e.preventDefault();
              e.stopPropagation();
              setAutoCompactEnabled(!autoCompactEnabled);
            }}
            style={{
              background: `linear-gradient(to right, ${
                usageClass === 'minimal' ? `rgba(var(--foreground-rgb), ${(0.05 + (Math.min(percentageNum, 80) / 80) * 0.05).toFixed(3)})` :
                `rgba(var(--negative-rgb), ${(0.1 + (Math.min(percentageNum, 80) / 80) * 0.1).toFixed(3)})`
              } ${Math.min(percentageNum, 100)}%, transparent ${Math.min(percentageNum, 100)}%)`
            }}
          >
            <span className="btn-stats-text">
              {autoCompactEnabled ? (
                <span className="btn-stats-auto">auto</span>
              ) : (
                <span className="btn-stats-auto">user</span>
              )}
              <span>{percentage}%</span>
            </span>
          </button>
          {/* 5h/7d limit bars - only shown for Claude provider */}
          {currentProvider === 'claude' && (
            <>
              <div className="btn-stats-limit-bar five-hour">
                <div
                  className={`btn-stats-limit-fill ${(usageLimits?.five_hour?.utilization ?? 0) >= 90 ? 'warning' : 'normal'}`}
                  style={{
                    width: `${Math.min(usageLimits?.five_hour?.utilization ?? 0, 100)}%`,
                    opacity: 0.1 + (Math.min(usageLimits?.five_hour?.utilization ?? 0, 90) / 90) * 0.9
                  }}
                />
              </div>
              <div className="btn-stats-limit-bar seven-day">
                <div
                  className={`btn-stats-limit-fill ${(usageLimits?.seven_day?.utilization ?? 0) >= 90 ? 'warning' : 'normal'}`}
                  style={{
                    width: `${Math.min(usageLimits?.seven_day?.utilization ?? 0, 100)}%`,
                    opacity: 0.1 + (Math.min(usageLimits?.seven_day?.utilization ?? 0, 90) / 90) * 0.9
                  }}
                />
              </div>
            </>
          )}
        </div>
      </div>

      {/* Context menu for toggling button visibility */}
      {contextMenuPos && (
        <div
          ref={contextMenuRef}
          className="context-bar-menu"
          style={{ left: contextMenuPos.x, top: contextMenuPos.y }}
        >
          <div className="context-menu-header">Show/Hide Buttons</div>
          <button
            className={`context-menu-item ${visibility.showCommandPalette ? 'checked' : ''}`}
            onClick={() => toggleVisibility('showCommandPalette')}
          >
            <span className="context-menu-check">{visibility.showCommandPalette ? '✓' : ''}</span>
            Command Palette
          </button>
          {showDictationSetting && (
            <button
              className={`context-menu-item ${visibility.showDictation ? 'checked' : ''}`}
              onClick={() => toggleVisibility('showDictation')}
            >
              <span className="context-menu-check">{visibility.showDictation ? '✓' : ''}</span>
              Dictation
            </button>
          )}
          <button
            className={`context-menu-item ${visibility.showFilesPanel ? 'checked' : ''}`}
            onClick={() => toggleVisibility('showFilesPanel')}
          >
            <span className="context-menu-check">{visibility.showFilesPanel ? '✓' : ''}</span>
            Files Panel
          </button>
          {showHistorySetting && (
            <button
              className={`context-menu-item ${visibility.showHistory ? 'checked' : ''}`}
              onClick={() => toggleVisibility('showHistory')}
            >
              <span className="context-menu-check">{visibility.showHistory ? '✓' : ''}</span>
              History
            </button>
          )}
        </div>
      )}
    </div>
  );
};

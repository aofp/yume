import React from 'react';
import {
  IconFolder,
  IconGitBranch,
  IconHistory,
  IconMicrophone,
  IconMicrophoneOff,
  IconInputSearch,
  IconRobot,
  IconPencil,
  IconTerminal2,
  IconUsers,
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

  // Visibility toggles
  visibility: ContextBarVisibility;

  // Git stats
  gitChangesCount: number;
  gitAheadCount: number;
  gitLinesAdded: number;
  gitLinesRemoved: number;

  // Session file stats
  sessionFileCount: number;
  sessionLinesAdded: number;
  sessionLinesRemoved: number;

  // Files panel sub-tab
  filesSubTab: 'files' | 'git' | 'sessions';
  setFilesSubTab: (tab: 'files' | 'git' | 'sessions') => void;

  // Command palette
  onOpenCommandPalette: () => void;

  // Background agents running count
  backgroundAgentCount?: number;

  // Pending tool counts for context center (computed from pendingToolInfo)
  pendingAgentCount?: number;
  pendingBashCount?: number;
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
  visibility,
  gitChangesCount,
  gitAheadCount,
  gitLinesAdded,
  gitLinesRemoved,
  sessionFileCount,
  sessionLinesAdded,
  sessionLinesRemoved,
  filesSubTab,
  setFilesSubTab,
  onOpenCommandPalette,
  backgroundAgentCount = 0,
  pendingAgentCount = 0,
  pendingBashCount = 0,
}) => {
  // Get context window from selected model
  const currentModel = getModelById(selectedModel);
  const contextWindowTokens = currentModel?.contextWindow || 200000;

  const rawPercentage = (totalContextTokens / contextWindowTokens * 100);
  const percentageNum = rawPercentage;
  // Always show actual percentage - 0.00% is accurate for new sessions or after compaction
  const percentage = percentageNum.toFixed(2);

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
    if (filesSubTab === 'git') {
      parts.push(`git (${modKey}+g)`);
      if (gitChangesCount > 0) parts.push(`${gitChangesCount} files, +${gitLinesAdded} -${gitLinesRemoved}`);
    } else {
      // files or sessions tab - show session stats
      parts.push(filesSubTab === 'sessions' ? `session changes (${modKey}+s)` : `files (${modKey}+e)`);
      if (sessionFileCount > 0) parts.push(`${sessionFileCount} files, +${sessionLinesAdded} -${sessionLinesRemoved}`);
    }
    if (backgroundAgentCount > 0) parts.push(`${backgroundAgentCount} agent${backgroundAgentCount > 1 ? 's' : ''}`);
    return parts.join(' • ');
  };

  return (
    <div className="context-bar">
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
            onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); onOpenCommandPalette(); } }}
            tabIndex={0}
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
            onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); onToggleDictation(); } }}
            tabIndex={0}
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

      {/* CENTER: active status indicators - order: bash, agent, bg agent */}
      {(pendingBashCount > 0 || pendingAgentCount > 0 || backgroundAgentCount > 0) && (
        <div className="context-center">
          {pendingAgentCount > 0 && (
            <span className="context-status-item agent">
              <IconRobot size={10} stroke={1.5} />
              <span className="context-status-label">{pendingAgentCount}</span>
            </span>
          )}
          {backgroundAgentCount > 0 && (
            <span className="context-status-item bg-agent">
              <IconUsers size={10} stroke={1.5} />
              <span className="context-status-label">{backgroundAgentCount}</span>
            </span>
          )}
          {pendingBashCount > 0 && (
            <span className="context-status-item bash">
              <IconTerminal2 size={10} stroke={1.5} />
              <span className="context-status-label">{pendingBashCount}</span>
            </span>
          )}
        </div>
      )}

      {/* RIGHT GROUP: combined files button, history, context% */}
      <div className="context-right">
        {/* History button */}
        {visibility.showHistory && (
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
            onKeyDown={(e) => {
              if (e.key === 'Enter' || e.key === ' ') {
                e.preventDefault();
                setShowRollbackPanel(!showRollbackPanel);
                setShowFilesPanel(false);
                setSelectedFile(null);
                setFileContent('');
                setSelectedGitFile(null);
                setGitDiff(null);
              }
            }}
            tabIndex={0}
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
            onKeyDown={(e) => {
              if (e.key === 'Enter' || e.key === ' ') {
                e.preventDefault();
                setShowFilesPanel(!showFilesPanel);
                setSelectedFile(null);
                setFileContent('');
                setSelectedGitFile(null);
                setGitDiff(null);
                setFocusedFileIndex(-1);
                setFocusedGitIndex(-1);
              }
            }}
            tabIndex={0}
            onContextMenu={(e) => {
              e.preventDefault();
              e.stopPropagation();
              // cycle backwards: files -> sessions -> git -> files (opposite of left-click tab order)
              const prev = filesSubTab === 'files' ? 'sessions' : filesSubTab === 'sessions' ? 'git' : 'files';
              setFilesSubTab(prev);
              // don't open panel on right-click, just switch tab silently
            }}
            disabled={!workingDirectory}
            title={buildFilesButtonTitle() + ' • rmb: switch tab'}
          >
            <span className="btn-icon-wrapper">
              {filesSubTab === 'git' ? <IconGitBranch size={12} stroke={1.5} /> : filesSubTab === 'sessions' ? <IconPencil size={12} stroke={1.5} /> : <IconFolder size={12} stroke={1.5} />}
            </span>

            {/* Stats badges based on selected tab */}
            {(() => {
              // files tab: combined count "session/git", no line stats
              // git tab: "gitCount +added -removed"
              // sessions tab: "sessionCount +added -removed"
              if (filesSubTab === 'files') {
                return (
                  <span className="btn-files-stats">
                    <span className="stat-badge git-badge">{sessionFileCount}/{gitChangesCount}</span>
                    {backgroundAgentCount > 0 && <span className="stat-badge agent-badge">{backgroundAgentCount}</span>}
                  </span>
                );
              }
              const isGit = filesSubTab === 'git';
              const count = isGit ? gitChangesCount : sessionFileCount;
              const added = isGit ? gitLinesAdded : sessionLinesAdded;
              const removed = isGit ? gitLinesRemoved : sessionLinesRemoved;
              return (
                <span className="btn-files-stats">
                  <span className="stat-badge git-badge">{isGit ? (gitAheadCount > 0 ? `^${gitAheadCount} ${count}` : count) : count}</span>
                  {backgroundAgentCount > 0 && <span className="stat-badge agent-badge">{backgroundAgentCount}</span>}
                  {(added > 0 || removed > 0) && (
                    <span className="stat-badge lines-badge">
                      <span className="line-added">+{added}</span>
                      <span className="line-removed">-{removed}</span>
                    </span>
                  )}
                </span>
              );
            })()}
          </button>
        )}

        {/* Context % button */}
        <div className="btn-stats-container">
          <button
            className={`btn-stats ${usageClass}`}
            onClick={onOpenStatsModal}
            onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); onOpenStatsModal(); } }}
            tabIndex={0}
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

    </div>
  );
};

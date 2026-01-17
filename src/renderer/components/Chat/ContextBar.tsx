import React from 'react';
import {
  IconFolder,
  IconGitBranch,
  IconHistory,
  IconMicrophone,
  IconMicrophoneOff,
  IconCommand,
} from '@tabler/icons-react';
import { ModelSelector } from '../ModelSelector/ModelSelector';
import { isBashPrefix } from '../../utils/helpers';
import { isVSCode } from '../../services/tauriApi';
import { getModelById, ProviderType } from '../../config/models';

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

  // Feature toggles
  showDictation: boolean;
  showHistory: boolean;

  // Git stats
  gitChangesCount: number;

  // Files panel sub-tab
  filesSubTab: 'files' | 'git';

  // Command palette
  onOpenCommandPalette: () => void;
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
  showDictation,
  showHistory,
  gitChangesCount,
  filesSubTab,
  onOpenCommandPalette,
}) => {
  // Get context window from selected model
  const currentModel = getModelById(selectedModel);
  const contextWindowTokens = currentModel?.contextWindow || 200000;

  const rawPercentage = (totalContextTokens / contextWindowTokens * 100);
  const percentageNum = rawPercentage;
  const percentage = isTokensPending ? '?' : percentageNum.toFixed(2);

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

  return (
    <div className="context-bar">
      <ModelSelector
        value={selectedModel}
        onChange={onModelChange}
        toolCount={enabledToolsCount}
        onOpenModal={onOpenModelModal}
      />

      {/* Files/Git button - opens files panel (with files/git tabs inside) - hidden in vscode mode */}
      {!isVSCode() && (
        <button
          className={`btn-context-icon ${showFilesPanel ? 'active' : ''}`}
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
          title={filesSubTab === 'git' ? `git (${modKey}+g)` : `files (${modKey}+e)`}
          style={{ marginLeft: '2px' }}
        >
          <span className="btn-icon-wrapper">
            {filesSubTab === 'git' ? <IconGitBranch size={12} stroke={1.5} /> : <IconFolder size={12} stroke={1.5} />}
          </span>
          {gitChangesCount > 0 && <span className="btn-git-text">{gitChangesCount}</span>}
        </button>
      )}

      {/* Dictation button - after files/git, hidden in vscode mode or when disabled in settings */}
      {!isVSCode() && showDictation && (
        <button
          className={`btn-context-icon ml2 ${isDictating ? 'active dictating' : ''}`}
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

      {/* Center - empty spacer */}
      <div className="context-center">
      </div>

      {/* Right - history + stats */}
      <div className="context-info">
        {/* History button - shown for both modes when enabled */}
        {showHistory && (
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
        {/* Command palette button - before stats */}
        <button
          className="btn-context-icon"
          onClick={onOpenCommandPalette}
          title={`command palette (${modKey}+p)`}
        >
          <span className="btn-icon-wrapper">
            <IconCommand size={12} stroke={1.5} />
          </span>
        </button>
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
    </div>
  );
};

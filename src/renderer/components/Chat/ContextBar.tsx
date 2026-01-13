import React from 'react';
import {
  IconFolder,
  IconGitBranch,
  IconHistory,
  IconCancel,
  IconArrowsMinimize,
  IconMicrophone,
  IconMicrophoneOff,
} from '@tabler/icons-react';
import { ModelSelector } from '../ModelSelector/ModelSelector';
import { isBashPrefix } from '../../utils/helpers';
import { isVSCode } from '../../services/tauriApi';

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
  showGitPanel: boolean;
  showRollbackPanel: boolean;
  setShowFilesPanel: (show: boolean) => void;
  setShowGitPanel: (show: boolean) => void;
  setShowRollbackPanel: (show: boolean) => void;

  // Panel state setters for clearing other state
  setSelectedFile: (file: string | null) => void;
  setFileContent: (content: string) => void;
  setSelectedGitFile: (file: string | null) => void;
  setGitDiff: (diff: any) => void;
  setFocusedFileIndex: (index: number) => void;
  setFocusedGitIndex: (index: number) => void;

  // Git stats
  isGitRepo: boolean;
  gitLineStats: { [file: string]: { added: number; deleted: number } };

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

  // Usage limits
  usageLimits: {
    five_hour?: { utilization: number; resets_at: string };
    seven_day?: { utilization: number; resets_at: string };
  } | null;

  // Actions
  onClearRequest: () => void;
  onCompactRequest: () => void;
  onOpenStatsModal: () => void;

  // Dictation
  isDictating: boolean;
  onToggleDictation: () => void;

  // Platform
  modKey: string;
}

export const ContextBar: React.FC<ContextBarProps> = ({
  selectedModel,
  onModelChange,
  enabledToolsCount,
  onOpenModelModal,
  showFilesPanel,
  showGitPanel,
  showRollbackPanel,
  setShowFilesPanel,
  setShowGitPanel,
  setShowRollbackPanel,
  setSelectedFile,
  setFileContent,
  setSelectedGitFile,
  setGitDiff,
  setFocusedFileIndex,
  setFocusedGitIndex,
  isGitRepo,
  gitLineStats,
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
  onClearRequest,
  onCompactRequest,
  onOpenStatsModal,
  isDictating,
  onToggleDictation,
  modKey,
}) => {
  const contextWindowTokens = 200000;
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

  // Git total line stats
  const totalAdded = Object.values(gitLineStats).reduce((sum, s) => sum + s.added, 0);
  const totalDeleted = Object.values(gitLineStats).reduce((sum, s) => sum + s.deleted, 0);

  return (
    <div className="context-bar">
      <ModelSelector
        value={selectedModel}
        onChange={onModelChange}
        toolCount={enabledToolsCount}
        onOpenModal={onOpenModelModal}
      />

      {/* Center - tools group */}
      <div className="context-center">
        {/* Files button - hidden in vscode mode */}
        {!isVSCode() && (
          <button
            className={`btn-context-icon ${showFilesPanel ? 'active' : ''}`}
            onClick={() => {
              setShowFilesPanel(!showFilesPanel);
              setShowGitPanel(false);
              setSelectedFile(null);
              setFileContent('');
              setFocusedFileIndex(-1);
              setFocusedGitIndex(-1);
            }}
            disabled={!workingDirectory}
            title={`files (${modKey}+e)`}
          >
            <IconFolder size={12} stroke={1.5} />
          </button>
        )}

        {/* Git button - hidden in vscode mode */}
        {!isVSCode() && (
          <>
            <button
              className={`btn-context-icon ${showGitPanel ? 'active' : ''}`}
              onClick={() => {
                setShowGitPanel(!showGitPanel);
                setShowFilesPanel(false);
                setSelectedGitFile(null);
                setGitDiff(null);
                setFocusedFileIndex(-1);
                setFocusedGitIndex(-1);
              }}
              disabled={!workingDirectory || !isGitRepo}
              title={isGitRepo ? `git (${modKey}+g)` : "not a git repo"}
            >
              <IconGitBranch size={12} stroke={1.5} />
            </button>

            {/* Git total line stats */}
            {showGitPanel && Object.keys(gitLineStats).length > 0 && (
              <span className="git-total-stats">
                <span className="git-total-added">+{totalAdded}</span>
                <span className="git-total-deleted">-{totalDeleted}</span>
              </span>
            )}
          </>
        )}

        {/* History button - shown in center for vscode mode (replaces files/git) */}
        {isVSCode() && (
          <button
            className={`btn-rollback ${showRollbackPanel ? 'active' : ''}`}
            onClick={() => {
              setShowRollbackPanel(!showRollbackPanel);
              setShowFilesPanel(false);
              setShowGitPanel(false);
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

      </div>

      {/* Center absolute - dictation + history */}
      <div className="context-center-absolute">
        {/* Dictation button - hidden in vscode mode (no Web Speech API access) */}
        {!isVSCode() && (
          <button
            className={`btn-context-icon ${isDictating ? 'active dictating' : ''}`}
            onClick={onToggleDictation}
            disabled={isReadOnly}
            title={isDictating ? 'stop dictation (F5)' : 'dictate (F5)'}
          >
            {isDictating ? (
              <IconMicrophone size={12} stroke={1.5} />
            ) : (
              <IconMicrophoneOff size={12} stroke={1.5} />
            )}
          </button>
        )}

        {/* History button - hidden in vscode mode (shown in center instead) */}
        {!isVSCode() && (
          <button
            className={`btn-rollback ${showRollbackPanel ? 'active' : ''}`}
            onClick={() => {
              setShowRollbackPanel(!showRollbackPanel);
              setShowFilesPanel(false);
              setShowGitPanel(false);
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
      </div>

      {/* Right - stats and clear */}
      <div className="context-info">
        <button
          className="btn-context-icon"
          onClick={onClearRequest}
          disabled={isReadOnly || !hasActivity || isStreaming}
          title={`clear context (${modKey}+l)`}
          style={{ opacity: (isReadOnly || !hasActivity || isStreaming) ? 0.5 : 1, pointerEvents: (isReadOnly || !hasActivity || isStreaming) ? 'none' : 'auto' }}
        >
          <IconCancel size={12} stroke={1.5} />
        </button>
        <button
          className="btn-context-icon"
          onClick={onCompactRequest}
          disabled={isReadOnly || !hasActivity || isStreaming}
          title={`compact context (${modKey}+m)`}
          style={{ opacity: (isReadOnly || !hasActivity || isStreaming) ? 0.5 : 1, pointerEvents: (isReadOnly || !hasActivity || isStreaming) ? 'none' : 'auto' }}
        >
          <IconArrowsMinimize size={12} stroke={1.5} />
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
          {/* 5h/7d limit bars */}
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
        </div>
      </div>
    </div>
  );
};

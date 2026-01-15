import React, { useState, useRef, useEffect, useCallback, useMemo } from 'react';
import { useShallow } from 'zustand/react/shallow';
import { invoke } from '@tauri-apps/api/core';
import {
  IconSend,
  IconPlayerStop,
  IconX,
  IconChartBubbleFilled,
  IconArtboardFilled,
  IconCoin,
  IconChevronUp,
  IconChevronDown,
  IconBrain,
  IconChartDots,
  IconMessage,
  IconGitBranch,
  IconFile,
  IconFolder,
  IconTool,
  IconChevronRight,
  IconHistory,
  IconPencil,
} from '@tabler/icons-react';
import { DiffViewer, DiffDisplay, DiffHunk, DiffLine } from './DiffViewer';
import { MessageRenderer } from './MessageRenderer';
import { VirtualizedMessageList, VirtualizedMessageListRef, ThinkingTimer, BashTimer, CompactingTimer } from './VirtualizedMessageList';
import { StreamIndicator } from './StreamIndicator';
import { InputArea } from './InputArea';
import { ContextBar } from './ContextBar';
import { useClaudeCodeStore } from '../../stores/claudeCodeStore';
import { ModelSelector } from '../ModelSelector/ModelSelector';
import { ModelToolsModal } from '../ModelSelector/ModelToolsModal';
import { WelcomeScreen } from '../Welcome/WelcomeScreen';
import { MentionAutocomplete } from '../MentionAutocomplete/MentionAutocomplete';
import { CommandAutocomplete } from '../CommandAutocomplete/CommandAutocomplete';
import { LoadingIndicator } from '../LoadingIndicator/LoadingIndicator';
import { Watermark } from '../Watermark/Watermark';
// ActivityIndicator removed - now showing inline with thinking indicator
import { ConfirmModal } from '../ConfirmModal/ConfirmModal';
// PERFORMANCE: Lazy load modals and heavy components - only loaded when user opens them
const RecentConversationsModal = React.lazy(() => import('../RecentConversationsModal').then(m => ({ default: m.RecentConversationsModal })));
const AgentExecutor = React.lazy(() => import('../AgentExecution/AgentExecutor').then(m => ({ default: m.AgentExecutor })));
const ClaudeMdEditorModal = React.lazy(() => import('../ClaudeMdEditor').then(m => ({ default: m.ClaudeMdEditorModal })));
import { FEATURE_FLAGS } from '../../config/features';
import { APP_NAME, appEventName, appStorageKey } from '../../config/app';
import { claudeCodeClient } from '../../services/claudeCodeClient';
import { pluginService } from '../../services/pluginService';
import { isBashPrefix } from '../../utils/helpers';
import { isVSCode, getVSCodePort } from '../../services/tauriApi';
import { getCachedCustomCommands, invalidateCommandsCache, formatResetTime, formatBytes } from '../../utils/chatHelpers';
import { TOOL_ICONS, PATH_STRIP_REGEX, binaryExtensions } from '../../constants/chat';
import { resolveModelId, getProviderForModel } from '../../config/models';
import { useVisibilityAwareInterval, useElapsedTimer, useDotsAnimation } from '../../hooks/useTimers';
import './ClaudeChat.css';

const USAGE_LIMITS_CACHE_KEY = appStorageKey('usage_limits_cache');
const TRIGGER_RESUME_EVENT = appEventName('trigger-resume');
const CHECK_RESUMABLE_EVENT = appEventName('check-resumable');
const RESTORE_INPUT_EVENT = appEventName('restore-input');
const RECENT_PROJECTS_KEY = appStorageKey('recent-projects');

// Re-export invalidateCommandsCache for external use
export { invalidateCommandsCache };

// Helper function to format tool displays - optimized to reuse pre-created icons
const getToolDisplay = (name: string, input: any) => {
  const icon = TOOL_ICONS[name as keyof typeof TOOL_ICONS] || TOOL_ICONS.default;
  const stripPath = (p: string) => p?.replace(PATH_STRIP_REGEX, '') || '';

  switch (name) {
    case 'Read':
      return { icon, name: 'reading', detail: stripPath(input?.file_path) || 'file' };
    case 'Write':
      return { icon, name: 'writing', detail: stripPath(input?.file_path) || 'file' };
    case 'Edit':
      return { icon, name: 'editing', detail: `${stripPath(input?.file_path) || 'file'}${input?.old_string ? ` (${input.old_string.substring(0, 20)}...)` : ''}` };
    case 'MultiEdit':
      return { icon, name: 'multi-edit', detail: `${stripPath(input?.file_path) || 'file'} (${input?.edits?.length || 0} changes)` };
    case 'Bash':
      return { icon, name: 'running', detail: input?.command || 'command' };
    case 'TodoWrite':
      return { icon, name: 'todos', detail: `${input?.todos?.length || 0} items` };
    case 'WebSearch':
      return { icon, name: 'searching', detail: input?.query || 'web' };
    case 'WebFetch':
      try {
        return { icon, name: 'fetching', detail: input?.url ? new URL(input.url).hostname : 'webpage' };
      } catch { return { icon, name: 'fetching', detail: 'webpage' }; }
    case 'Grep':
      return { icon, name: 'searching', detail: `"${input?.pattern || ''}" in ${stripPath(input?.path) || '.'}` };
    case 'Glob':
      return { icon, name: 'finding', detail: input?.pattern || 'files' };
    case 'LS':
      return { icon, name: 'listing', detail: stripPath(input?.path) || 'directory' };
    case 'Task':
      return { icon, name: 'task', detail: input?.description || 'running agent' };
    case 'ExitPlanMode':
      return { icon, name: 'plan ready', detail: 'exiting plan mode' };
    case 'NotebookEdit':
      return { icon, name: 'notebook', detail: input?.notebook_path || 'jupyter notebook' };
    default:
      return { icon, name: name || 'tool', detail: input ? JSON.stringify(input).substring(0, 50) + '...' : '' };
  }
};


// Recursive FileTreeNode component for nested folder navigation
interface FileTreeNodeProps {
  item: any;
  depth: number;
  selectedFile: string | null;
  expandedFolders: Set<string>;
  gitStatus: { modified: string[]; added: string[]; deleted: string[] } | null;
  workingDirectory: string;
  focusedPath: string | null;
  onToggleFolder: (path: string) => void;
  onFileClick: (path: string, hasGitChanges: boolean) => void;
  onContextMenu: (e: React.MouseEvent, path: string) => void;
}

// Memoized FileTreeNode to prevent unnecessary re-renders of the entire tree
const FileTreeNode: React.FC<FileTreeNodeProps> = React.memo(({
  item,
  depth,
  selectedFile,
  expandedFolders,
  gitStatus,
  workingDirectory,
  focusedPath,
  onToggleFolder,
  onFileClick,
  onContextMenu,
}) => {
  // Backend serializes as "type" not "file_type" due to serde rename
  const isDirectory = item.type === 'directory';
  const isExpanded = expandedFolders.has(item.path);
  const isSelected = selectedFile === item.path;
  const isFocused = focusedPath === item.path;

  // Get relative path for git status matching (normalize path separators for cross-platform)
  const normalizedPath = item.path.replace(/\\/g, '/');
  const normalizedWorkDir = workingDirectory.replace(/\\/g, '/');
  const relativePath = normalizedPath.replace(normalizedWorkDir, '').replace(/^\//, '');

  // Check git status for files
  const isModified = gitStatus?.modified.includes(relativePath) || false;
  const isAdded = gitStatus?.added.includes(relativePath) || false;
  const isDeleted = gitStatus?.deleted.includes(relativePath) || false;
  const hasGitChanges = isModified || isAdded || isDeleted;

  // For directories, check if any children have git changes
  const folderPrefix = relativePath ? `${relativePath}/` : '';
  const hasModifiedChildren = isDirectory && gitStatus?.modified.some(f => f.startsWith(folderPrefix));
  const hasAddedChildren = isDirectory && gitStatus?.added.some(f => f.startsWith(folderPrefix));
  const hasDeletedChildren = isDirectory && gitStatus?.deleted.some(f => f.startsWith(folderPrefix));
  const hasChangedChildren = hasModifiedChildren || hasAddedChildren || hasDeletedChildren;

  // Get git status indicator
  const getGitIndicator = () => {
    if (isModified) return <span className="file-git-status modified">M</span>;
    if (isAdded) return <span className="file-git-status added">A</span>;
    if (isDeleted) return <span className="file-git-status deleted">D</span>;
    // For folders with changed children, show a dot indicator
    if (hasChangedChildren) return <span className="file-git-status folder-changed">•</span>;
    return null;
  };

  // Get git status class for coloring - files use their status, folders use children status
  const getGitClass = () => {
    if (isModified) return 'git-modified';
    if (isAdded) return 'git-added';
    if (isDeleted) return 'git-deleted';
    // Folders: prioritize added (green) over modified (accent)
    if (hasAddedChildren) return 'git-added';
    if (hasModifiedChildren) return 'git-modified';
    if (hasDeletedChildren) return 'git-deleted';
    return '';
  };
  const gitClass = getGitClass();

  return (
    <React.Fragment>
      <div
        className={`file-tree-item ${isDirectory ? 'directory' : ''} ${isSelected ? 'selected' : ''} ${isFocused ? 'focused' : ''} ${gitClass}`}
        style={{ paddingLeft: `${6 + depth * 16}px` }}
        onClick={() => {
          if (isDirectory) {
            onToggleFolder(item.path);
          } else {
            onFileClick(item.path, hasGitChanges);
          }
        }}
        onContextMenu={(e) => {
          if (!isDirectory) {
            onContextMenu(e, item.path);
          }
        }}
      >
        {isDirectory ? (
          <>
            <IconChevronRight
              size={10}
              stroke={1.5}
              style={{
                transform: isExpanded ? 'rotate(90deg)' : 'none',
              }}
            />
            <IconFolder size={12} stroke={1.5} />
          </>
        ) : (
          <>
            <span style={{ width: 10 }} />
            <IconFile size={12} stroke={1.5} />
          </>
        )}
        <span className="file-tree-name">{item.name}</span>
        {getGitIndicator()}
      </div>
      {isDirectory && isExpanded && item.children && (
        <div className="file-tree-children">
          {item.children.map((child: any) => (
            <FileTreeNode
              key={child.path}
              item={child}
              depth={depth + 1}
              selectedFile={selectedFile}
              expandedFolders={expandedFolders}
              gitStatus={gitStatus}
              workingDirectory={workingDirectory}
              focusedPath={focusedPath}
              onToggleFolder={onToggleFolder}
              onFileClick={onFileClick}
              onContextMenu={onContextMenu}
            />
          ))}
        </div>
      )}
    </React.Fragment>
  );
}, (prevProps, nextProps) => {
  // Custom comparison for performance
  // Only re-render if the item itself changed or relevant state changed
  if (prevProps.item !== nextProps.item) return false;
  if (prevProps.depth !== nextProps.depth) return false;
  if (prevProps.selectedFile !== nextProps.selectedFile) return false;
  if (prevProps.focusedPath !== nextProps.focusedPath) return false;
  if (prevProps.workingDirectory !== nextProps.workingDirectory) return false;

  // Check if this item's expanded state changed
  const itemPath = prevProps.item.path;
  if (prevProps.expandedFolders.has(itemPath) !== nextProps.expandedFolders.has(itemPath)) {
    return false;
  }

  // Check if git status changed for this item (shallow check)
  if (prevProps.gitStatus !== nextProps.gitStatus) {
    // Only re-render if the change affects this item or its children
    const relativePath = itemPath.replace(prevProps.workingDirectory, '').replace(/^[/\\]/, '');
    const folderPrefix = relativePath ? `${relativePath}/` : '';

    const prevModified = prevProps.gitStatus?.modified || [];
    const nextModified = nextProps.gitStatus?.modified || [];
    const prevAdded = prevProps.gitStatus?.added || [];
    const nextAdded = nextProps.gitStatus?.added || [];

    // Check if this file's status changed
    const prevHasChange = prevModified.includes(relativePath) || prevAdded.includes(relativePath);
    const nextHasChange = nextModified.includes(relativePath) || nextAdded.includes(relativePath);
    if (prevHasChange !== nextHasChange) return false;

    // For directories, check if any children's status changed
    if (prevProps.item.type === 'directory') {
      const prevChildrenModified = prevModified.some(f => f.startsWith(folderPrefix));
      const nextChildrenModified = nextModified.some(f => f.startsWith(folderPrefix));
      if (prevChildrenModified !== nextChildrenModified) return false;
    }
  }

  // Callbacks are stable (created with useCallback in parent)
  return true;
});

interface Attachment {
  id: string;
  type: 'image' | 'text' | 'file';
  name: string;
  size?: number;
  content: string; // dataUrl for images, text content for text, file path for files
  preview?: string; // short preview for display
}

export const ClaudeChat: React.FC = () => {
  // Platform detection for keyboard shortcuts and feature support
  const isMac = navigator.platform.toLowerCase().includes('mac');
  const isWindows = navigator.platform.toLowerCase().includes('win');
  const modKey = isMac ? 'cmd' : 'ctrl';

  const [input, setInput] = useState('');
  const [attachments, setAttachments] = useState<Attachment[]>([]);
  const [isDragging, setIsDragging] = useState(false);
  const [isTextareaFocused, setIsTextareaFocused] = useState(false);
  const [showStatsModal, setShowStatsModal] = useState(false);
  const [showModelToolsModal, setShowModelToolsModal] = useState(false);
  const [modelToolsOpenedViaKeyboard, setModelToolsOpenedViaKeyboard] = useState(false);
  const [usageLimits, setUsageLimits] = useState<{
    five_hour?: { utilization: number; resets_at: string };
    seven_day?: { utilization: number; resets_at: string };
    subscription_type?: string;
    rate_limit_tier?: string;
  } | null>(null);
  const [showContextMenu, setShowContextMenu] = useState(false);
  const [isDictating, setIsDictating] = useState(false);
  const recognitionRef = useRef<any>(null);
  const dictationBaseTextRef = useRef<string>(''); // Text before dictation started
  const [searchQuery, setSearchQuery] = useState('');
  const [debouncedSearchQuery, setDebouncedSearchQuery] = useState('');
  const [searchVisible, setSearchVisible] = useState(false);
  const [showAgentExecutor, setShowAgentExecutor] = useState(false);
  const [searchIndex, setSearchIndex] = useState(0);
  const [searchMatches, setSearchMatches] = useState<number[]>([]);
  const [messageHistory, setMessageHistory] = useState<{ [sessionId: string]: string[] }>({});
  const [historyIndex, setHistoryIndex] = useState(-1);
  const [draftMessage, setDraftMessage] = useState<{ [sessionId: string]: string }>({});
  const [scrollPositions, setScrollPositions] = useState<{ [sessionId: string]: number }>({});
  const [inputContainerHeight, setInputContainerHeight] = useState(120);
  const [viewportHeight, setViewportHeight] = useState(window.innerHeight);
  const [zoomLevel, setZoomLevel] = useState(1);
  const [mentionTrigger, setMentionTrigger] = useState<string | null>(null);
  const [mentionCursorPos, setMentionCursorPos] = useState(0);
  const [commandTrigger, setCommandTrigger] = useState<string | null>(null);
  const [commandCursorPos, setCommandCursorPos] = useState(0);
  const [bashCommandMode, setBashCommandMode] = useState(false);
  const [isAtBottom, setIsAtBottom] = useState<{ [sessionId: string]: boolean }>({});
  const [pendingFollowupMessage, setPendingFollowupMessage] = useState<string | null>(null);
  const [showClearConfirm, setShowClearConfirm] = useState(false);
  const [showCompactConfirm, setShowCompactConfirm] = useState(false);
  const [showRollbackConfirm, setShowRollbackConfirm] = useState(false);
  const [pendingRollbackData, setPendingRollbackData] = useState<{
    messageIndex: number;
    messagesToRemove: number;
    messageContent: string; // content to restore to input field
    filesToRestore: Array<[string, { originalContent: string | null; isNewFile: boolean; mtime?: number }]>;
    conflicts?: Array<{ path: string; conflictType: string; source?: string }>;
    targetTimestamp?: number;
  } | null>(null);
  const [rollbackSelectedIndexes, setRollbackSelectedIndexes] = useState<Record<string, number | null>>({});
  const [rollbackHoveredIndex, setRollbackHoveredIndex] = useState<number | null>(null);
  const rollbackListRef = useRef<HTMLDivElement>(null);
  const rollbackInitializedSessions = useRef<Set<string>>(new Set());
  const [confirmDialogSelection, setConfirmDialogSelection] = useState(1); // 0 = cancel, 1 = confirm (default)
  const [showResumeModal, setShowResumeModal] = useState(false);
  const [showClaudeMdEditor, setShowClaudeMdEditor] = useState(false);
  const [hasResumableConversations, setHasResumableConversations] = useState<{ [sessionId: string]: boolean }>({});
  // Per-session panel states (derived values set after store destructuring)
  const [panelStates, setPanelStates] = useState<{ [sessionId: string]: { files: boolean; filesSubTab: 'files' | 'git'; rollback: boolean } }>({});
  // File browser state
  const [fileTree, setFileTree] = useState<any[]>([]);
  const [expandedFolders, setExpandedFolders] = useState<Set<string>>(new Set());
  const [selectedFile, setSelectedFile] = useState<string | null>(null);
  const [fileContent, setFileContent] = useState<string>('');
  const [fileLoading, setFileLoading] = useState(false);
  const [fileFullyLoaded, setFileFullyLoaded] = useState(false);
  const [fileTruncated, setFileTruncated] = useState(false);
  // Git panel state
  const [gitBranch, setGitBranch] = useState<string>('');
  const [gitAhead, setGitAhead] = useState<number>(0);
  const [gitStatus, setGitStatus] = useState<{ modified: string[]; added: string[]; deleted: string[]; untracked: string[] } | null>(null);
  const [gitLineStats, setGitLineStats] = useState<{ [file: string]: { added: number; deleted: number } }>({});
  const [gitDiff, setGitDiff] = useState<DiffDisplay | null>(null);
  const [selectedGitFile, setSelectedGitFile] = useState<string | null>(null);
  const [gitLoading, setGitLoading] = useState(false);
  const [isGitRepo, setIsGitRepo] = useState(false);
  const [previewCollapsed, setPreviewCollapsed] = useState(true); // Start collapsed
  const [focusedFileIndex, setFocusedFileIndex] = useState<number>(-1);
  const [focusedGitIndex, setFocusedGitIndex] = useState<number>(-1);
  const [bashStartTimes, setBashStartTimes] = useState<{ [sessionId: string]: number }>({});
  const [bashElapsedTimes, setBashElapsedTimes] = useState<{ [sessionId: string]: number }>({});
  const [bashDotCounts, setBashDotCounts] = useState<{ [sessionId: string]: number }>({});
  const [compactingStartTimes, setCompactingStartTimes] = useState<{ [sessionId: string]: number }>({});
  // Per-session textarea heights for persistence when switching tabs
  const [textareaHeights, setTextareaHeights] = useState<{ [sessionId: string]: number }>({});
  // Overlay height synced with textarea - use ref to avoid re-renders on every keystroke
  const overlayHeightRef = useRef(44);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const inputOverlayRef = useRef<HTMLDivElement>(null);
  const chatContainerRef = useRef<HTMLDivElement>(null);
  const inputContainerRef = useRef<HTMLDivElement>(null);
  const virtualizedMessageListRef = useRef<VirtualizedMessageListRef>(null);
  const previousSessionIdRef = useRef<string | null>(null);
  const isTabSwitchingRef = useRef(false);
  const streamingStartTimeRef = useRef<{ [sessionId: string]: number }>({});
  const userScrolledUpRef = useRef<{ [sessionId: string]: number }>({}); // Timestamp when user scrolled up
  const SCROLL_COOLDOWN_MS = 5000; // 5 seconds cooldown after user scrolls up
  const pendingFollowupRef = useRef<{ sessionId: string; content: string; attachments: Attachment[]; timeoutId?: NodeJS.Timeout } | null>(null);

  // macOS focus sentinel - tracks when textarea was last focused to detect glitch focus loss
  const lastFocusTimestampRef = useRef<number>(0);
  const windowFocusedRef = useRef<boolean>(true);

  // Use shallow comparison to prevent re-renders when object references change
  // but values remain the same (e.g., when other parts of the store update)
  const {
    sessions,
    currentSessionId,
    persistedSessionId,
    createSession,
    deleteSession,
    sendMessage,
    resumeSession,
    interruptSession,
    clearContext,
    selectedModel,
    setSelectedModel,
    toggleModel,
    enabledTools,
    setEnabledTools,
    loadPersistedSession,
    updateSessionDraft,
    addMessageToSession,
    renameSession,
    autoCompactEnabled,
    setAutoCompactEnabled,
    restoreToMessage,
    forkSession,
    forkSessionToProvider
  } = useClaudeCodeStore(useShallow(state => ({
    sessions: state.sessions,
    currentSessionId: state.currentSessionId,
    persistedSessionId: state.persistedSessionId,
    createSession: state.createSession,
    deleteSession: state.deleteSession,
    sendMessage: state.sendMessage,
    resumeSession: state.resumeSession,
    interruptSession: state.interruptSession,
    clearContext: state.clearContext,
    selectedModel: state.selectedModel,
    setSelectedModel: state.setSelectedModel,
    toggleModel: state.toggleModel,
    enabledTools: state.enabledTools,
    setEnabledTools: state.setEnabledTools,
    loadPersistedSession: state.loadPersistedSession,
    updateSessionDraft: state.updateSessionDraft,
    addMessageToSession: state.addMessageToSession,
    renameSession: state.renameSession,
    autoCompactEnabled: state.autoCompactEnabled,
    setAutoCompactEnabled: state.setAutoCompactEnabled,
    restoreToMessage: state.restoreToMessage,
    forkSession: state.forkSession,
    forkSessionToProvider: state.forkSessionToProvider
  })));

  // CRITICAL FIX: Subscribe to currentSession DIRECTLY from the store, not through useShallow
  // useShallow may not detect nested changes properly, causing bash output to not display
  // until the component re-renders for another reason (like tab switch)
  const currentSession = useClaudeCodeStore(state =>
    state.sessions.find(s => s.id === currentSessionId)
  );

  // Custom model change handler for cross-agent resumption
  const handleModelChange = useCallback((newModelId: string) => {
    const resolvedNewModel = resolveModelId(newModelId);
    const resolvedOldModel = resolveModelId(selectedModel);

    // If session has messages and provider is changing, fork it
    if (currentSession && currentSession.messages.length > 0 && 
        getProviderForModel(resolvedNewModel) !== getProviderForModel(resolvedOldModel)) {
      console.log(`[ClaudeChat] Provider change detected with active messages. Forking session to ${newModelId}...`);
      forkSessionToProvider(currentSession.id, newModelId);
    } else {
      setSelectedModel(newModelId);
    }
  }, [currentSession, selectedModel, setSelectedModel, forkSessionToProvider]);

  // Keep messageUpdateCounter subscription for additional safety (forces re-render on message add)
  const messageUpdateCounter = useClaudeCodeStore(state => {
    const session = state.sessions.find(s => s.id === currentSessionId);
    return session?.messageUpdateCounter || 0;
  });

  // Also subscribe to the messages array length as a backup trigger
  const messagesLength = useClaudeCodeStore(state => {
    const session = state.sessions.find(s => s.id === currentSessionId);
    return session?.messages?.length || 0;
  });

  // Subscribe to result message duration changes to force re-render when elapsed time becomes available
  // This is needed because the duration often arrives in a separate message after the initial result
  const resultDurationKey = useClaudeCodeStore(state => {
    const session = state.sessions.find(s => s.id === currentSessionId);
    if (!session?.messages) return '';
    // Create a key from all result message durations - if any changes, component re-renders
    return session.messages
      .filter(m => m.type === 'result')
      .map(m => `${m.id || 'r'}-${(m as any).duration_ms || 0}`)
      .join('|');
  });

  // Helper to reset hover states after modal interactions (Tauri webview workaround)
  // SKIP on macOS: pointer-events manipulation causes textarea focus loss on WKWebView
  const resetHoverStates = useCallback(() => {
    if (isMac) return; // macOS handles hover states fine, but loses focus with this workaround
    requestAnimationFrame(() => {
      document.body.style.pointerEvents = 'none';
      requestAnimationFrame(() => {
        document.body.style.pointerEvents = '';
      });
    });
  }, [isMac]);

  // Per-session rollback selected index (null = no selection)
  const rollbackSelectedIndex = currentSessionId ? (rollbackSelectedIndexes[currentSessionId] ?? null) : null;
  const setRollbackSelectedIndex = useCallback((value: number | null | ((prev: number | null) => number | null)) => {
    if (!currentSessionId) return;
    setRollbackSelectedIndexes(prev => ({
      ...prev,
      [currentSessionId]: typeof value === 'function' ? value(prev[currentSessionId] ?? null) : value
    }));
  }, [currentSessionId]);

  // Per-session panel state derived values and setters
  const showFilesPanel = currentSessionId ? panelStates[currentSessionId]?.files ?? false : false;
  const filesSubTab = currentSessionId ? panelStates[currentSessionId]?.filesSubTab ?? 'files' : 'files';
  const showGitPanel = showFilesPanel && filesSubTab === 'git'; // derived from sub-tab
  const showRollbackPanel = currentSessionId ? panelStates[currentSessionId]?.rollback ?? false : false;
  const setShowFilesPanel = useCallback((value: boolean | ((prev: boolean) => boolean), subTab?: 'files' | 'git') => {
    if (!currentSessionId) return;
    setPanelStates(prev => {
      const current = prev[currentSessionId] ?? { files: false, filesSubTab: 'files', rollback: false };
      const newFiles = typeof value === 'function' ? value(current.files) : value;
      return { ...prev, [currentSessionId]: { ...current, files: newFiles, filesSubTab: subTab ?? current.filesSubTab, rollback: newFiles ? false : current.rollback } };
    });
  }, [currentSessionId]);
  const setFilesSubTab = useCallback((subTab: 'files' | 'git') => {
    if (!currentSessionId) return;
    setPanelStates(prev => {
      const current = prev[currentSessionId] ?? { files: false, filesSubTab: 'files', rollback: false };
      return { ...prev, [currentSessionId]: { ...current, filesSubTab: subTab } };
    });
  }, [currentSessionId]);
  const setShowGitPanel = useCallback((value: boolean | ((prev: boolean) => boolean)) => {
    // For backwards compat - opens files panel on git tab
    if (!currentSessionId) return;
    setPanelStates(prev => {
      const current = prev[currentSessionId] ?? { files: false, filesSubTab: 'files', rollback: false };
      const newGit = typeof value === 'function' ? value(current.files && current.filesSubTab === 'git') : value;
      if (newGit) {
        return { ...prev, [currentSessionId]: { ...current, files: true, filesSubTab: 'git', rollback: false } };
      } else {
        // Closing git panel - close entire files panel
        return { ...prev, [currentSessionId]: { ...current, files: false, rollback: false } };
      }
    });
  }, [currentSessionId]);
  const setShowRollbackPanel = useCallback((value: boolean | ((prev: boolean) => boolean)) => {
    if (!currentSessionId) return;
    setPanelStates(prev => {
      const current = prev[currentSessionId] ?? { files: false, filesSubTab: 'files', rollback: false };
      const newRollback = typeof value === 'function' ? value(current.rollback) : value;
      return { ...prev, [currentSessionId]: { ...current, rollback: newRollback, files: newRollback ? false : current.files } };
    });
  }, [currentSessionId]);

  // Fetch usage limits with smart caching (shorter TTL for null values)
  // In VSCode mode, tauri invoke isn't available - skip fetching
  const fetchUsageLimits = useCallback((force = false) => {
    const CACHE_DURATION_VALID = 20 * 60 * 1000; // 20 min for valid data
    const CACHE_DURATION_NULL = 2 * 60 * 1000;   // 2 min for null data (retry sooner)

    // Helper to filter raw API data
    type UsageLimitsData = {
      five_hour?: { utilization: number; resets_at: string };
      seven_day?: { utilization: number; resets_at: string };
      subscription_type?: string;
      rate_limit_tier?: string;
    };
    const filterData = (data: {
      five_hour?: { utilization: number | null; resets_at: string | null };
      seven_day?: { utilization: number | null; resets_at: string | null };
      subscription_type?: string;
      rate_limit_tier?: string;
    }): UsageLimitsData => {
      const filtered: UsageLimitsData = {
        subscription_type: data.subscription_type,
        rate_limit_tier: data.rate_limit_tier,
      };
      if (data.five_hour?.utilization != null && data.five_hour?.resets_at != null) {
        filtered.five_hour = { utilization: data.five_hour.utilization, resets_at: data.five_hour.resets_at };
      }
      if (data.seven_day?.utilization != null && data.seven_day?.resets_at != null) {
        filtered.seven_day = { utilization: data.seven_day.utilization, resets_at: data.seven_day.resets_at };
      }
      return filtered;
    };

    // Check cache first (unless forced)
    if (!force) {
      try {
        const cached = localStorage.getItem(USAGE_LIMITS_CACHE_KEY);
        if (cached) {
          const { data, timestamp, hasNullUsage } = JSON.parse(cached);
          const age = Date.now() - timestamp;
          const maxAge = hasNullUsage ? CACHE_DURATION_NULL : CACHE_DURATION_VALID;
          if (age < maxAge) {
            console.log('[UsageLimits] Using cached data, age:', Math.round(age / 1000), 's, hasNull:', hasNullUsage);
            setUsageLimits(filterData(data));
            return;
          }
          console.log('[UsageLimits] Cache expired, age:', Math.round(age / 1000), 's, wasNull:', hasNullUsage);
        }
      } catch (e) {
        console.log('[UsageLimits] Cache read failed:', e);
      }
    }

    // In VSCode mode, use HTTP endpoint; otherwise use Tauri invoke
    if (isVSCode()) {
      const port = getVSCodePort();
      if (!port) {
        console.log('[UsageLimits] VSCode mode but no port');
        return;
      }
      fetch(`http://127.0.0.1:${port}/claude-usage-limits`)
        .then(res => res.ok ? res.json() : Promise.reject(res.statusText))
        .then(data => {
          console.log('[UsageLimits] HTTP response:', JSON.stringify(data));
          const filteredData = filterData(data);
          setUsageLimits(filteredData);
          const hasNullUsage = !filteredData.five_hour || !filteredData.seven_day;
          try {
            localStorage.setItem(USAGE_LIMITS_CACHE_KEY, JSON.stringify({ data, timestamp: Date.now(), hasNullUsage }));
          } catch (e) { /* ignore */ }
        })
        .catch(err => console.error('[UsageLimits] HTTP fetch failed:', err));
    } else {
      invoke<{
        five_hour?: { utilization: number | null; resets_at: string | null };
        seven_day?: { utilization: number | null; resets_at: string | null };
        subscription_type?: string;
        rate_limit_tier?: string;
      }>('get_claude_usage_limits')
        .then(data => {
          console.log('[UsageLimits] API response:', JSON.stringify(data));
          const filteredData = filterData(data);
          setUsageLimits(filteredData);
          // Cache with null flag (determines TTL on next read)
          const hasNullUsage = !filteredData.five_hour || !filteredData.seven_day;
          try {
            localStorage.setItem(USAGE_LIMITS_CACHE_KEY, JSON.stringify({ data, timestamp: Date.now(), hasNullUsage }));
          } catch (e) {
            // Cache write failed, ignore
          }
        })
        .catch(err => console.error('[UsageLimits] Failed to fetch:', err));
    }
  }, []);

  // Fetch usage limits on mount and refresh every 20min
  useEffect(() => {
    fetchUsageLimits();
    const interval = setInterval(() => fetchUsageLimits(true), 20 * 60 * 1000);
    return () => clearInterval(interval);
  }, [fetchUsageLimits]);

  // Also force refresh when modal opens
  useEffect(() => {
    if (showStatsModal) {
      fetchUsageLimits(true);
    }
  }, [showStatsModal, fetchUsageLimits]);

  // NO AUTO-CREATION and NO AUTO-RESUME
  // Sessions are ephemeral - they don't survive app restarts
  // User must manually create sessions with the + button

  // NO auto-selection - user must explicitly choose or create a session

  // Helper to determine if virtualization should be used
  // IMPORTANT: Always use virtualization for consistent scrollbar styling
  const shouldUseVirtualization = useCallback((_processedMessageCount: number) => {
    return FEATURE_FLAGS.USE_VIRTUALIZATION;
  }, []);

  // Check if user has recently scrolled up (within cooldown period)
  const isUserScrolledUp = useCallback(() => {
    if (!currentSessionId) return false;
    const scrolledAt = userScrolledUpRef.current[currentSessionId];
    if (!scrolledAt) return false;
    return Date.now() - scrolledAt < SCROLL_COOLDOWN_MS;
  }, [currentSessionId, SCROLL_COOLDOWN_MS]);

  // Helper function to scroll to bottom - uses the correct container based on virtualization
  // This respects the user's scroll position - won't scroll if user has scrolled up
  const scrollToBottomHelper = useCallback((behavior: 'auto' | 'smooth' = 'auto') => {
    // DON'T scroll if user has recently scrolled up
    if (isUserScrolledUp()) {
      console.log('[Scroll] Blocked - user scrolled up recently');
      return;
    }

    // Determine if we should use virtualization
    const estimatedProcessedCount = currentSession?.messages?.length || 0;
    const useVirtualization = shouldUseVirtualization(estimatedProcessedCount);

    if (useVirtualization && virtualizedMessageListRef.current) {
      // Use the virtualized list's scroll method (respects user scroll position)
      virtualizedMessageListRef.current.scrollToBottom(behavior);
    } else if (chatContainerRef.current) {
      // Fallback to regular scroll container
      chatContainerRef.current.scrollTop = chatContainerRef.current.scrollHeight;
    }
  }, [currentSession?.messages?.length, shouldUseVirtualization, isUserScrolledUp]);

  // Force scroll to bottom - always scrolls regardless of user scroll position
  // Use this when user sends a message
  const forceScrollToBottomHelper = useCallback((behavior: 'auto' | 'smooth' = 'auto') => {
    // Clear the user scrolled up flag
    if (currentSessionId) {
      userScrolledUpRef.current[currentSessionId] = 0;
    }

    const estimatedProcessedCount = currentSession?.messages?.length || 0;
    const useVirtualization = shouldUseVirtualization(estimatedProcessedCount);

    if (useVirtualization && virtualizedMessageListRef.current) {
      virtualizedMessageListRef.current.forceScrollToBottom(behavior);
    } else if (chatContainerRef.current) {
      chatContainerRef.current.scrollTop = chatContainerRef.current.scrollHeight;
    }
  }, [currentSession?.messages?.length, shouldUseVirtualization, currentSessionId]);

  // Track viewport and input container changes for zoom
  useEffect(() => {
    const handleResize = () => {
      setViewportHeight(window.innerHeight);
      
      // Get the current zoom level from body style
      const bodyZoom = document.body.style.zoom;
      const currentZoom = bodyZoom ? parseFloat(bodyZoom) : 1;
      setZoomLevel(currentZoom);
      
      if (inputContainerRef.current) {
        // Get actual rendered height
        const rect = inputContainerRef.current.getBoundingClientRect();
        setInputContainerHeight(rect.height);
      }
    };
    
    window.addEventListener('resize', handleResize);
    handleResize(); // Initial measurement
    
    // Watch for zoom changes via MutationObserver
    const observer = new MutationObserver((mutations) => {
      mutations.forEach((mutation) => {
        if (mutation.type === 'attributes' && mutation.attributeName === 'style') {
          const bodyZoom = document.body.style.zoom;
          const currentZoom = bodyZoom ? parseFloat(bodyZoom) : 1;
          setZoomLevel(currentZoom);
          handleResize();
        }
      });
    });
    
    observer.observe(document.body, {
      attributes: true,
      attributeFilter: ['style']
    });
    
    // Use ResizeObserver for input container
    const resizeObserver = new ResizeObserver(() => {
      if (inputContainerRef.current) {
        const height = inputContainerRef.current.getBoundingClientRect().height;
        setInputContainerHeight(height);
      }
    });
    
    if (inputContainerRef.current) {
      resizeObserver.observe(inputContainerRef.current);
    }
    
    return () => {
      window.removeEventListener('resize', handleResize);
      observer.disconnect();
      resizeObserver.disconnect();
    };
  }, []);

  // Close context menu on click outside
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      const target = e.target as HTMLElement;
      if (!target.closest('.context-menu-wrapper')) {
        setShowContextMenu(false);
      }
    };
    
    if (showContextMenu) {
      document.addEventListener('mousedown', handleClickOutside);
      return () => document.removeEventListener('mousedown', handleClickOutside);
    }
  }, [showContextMenu]);

  // Track scroll position and whether we're at bottom
  useEffect(() => {
    const handleScroll = () => {
      if (chatContainerRef.current && currentSessionId) {
        const container = chatContainerRef.current;

        // More reliable bottom detection with 50px threshold
        const scrollTop = container.scrollTop;
        const scrollHeight = container.scrollHeight;
        const clientHeight = container.clientHeight;
        const atBottom = scrollHeight - scrollTop - clientHeight < 50;

        // Track when user scrolls up (away from bottom)
        const wasAtBottom = isAtBottom[currentSessionId] !== false;
        if (wasAtBottom && !atBottom) {
          // User scrolled up - record the timestamp
          userScrolledUpRef.current[currentSessionId] = Date.now();
          console.log('[Scroll] User scrolled up - blocking auto-scroll for 5s');
        } else if (atBottom && !wasAtBottom) {
          // User scrolled back to bottom - clear the flag
          userScrolledUpRef.current[currentSessionId] = 0;
        }

        // Update isAtBottom state for this session
        setIsAtBottom(prev => ({
          ...prev,
          [currentSessionId]: atBottom
        }));

        // Save scroll position
        if (atBottom) {
          setScrollPositions(prev => ({
            ...prev,
            [currentSessionId]: -1 // Special value meaning "stick to bottom"
          }));
        } else {
          setScrollPositions(prev => ({
            ...prev,
            [currentSessionId]: scrollTop
          }));
        }
      }
    };

    const container = chatContainerRef.current;
    if (container) {
      container.addEventListener('scroll', handleScroll, { passive: true });
      // Initial check
      handleScroll();
      return () => container.removeEventListener('scroll', handleScroll);
    }
  }, [currentSessionId]);

  // Restore scroll position when switching tabs
  useEffect(() => {
    if (currentSessionId) {
      if (currentSessionId !== previousSessionIdRef.current) {
        // Mark that we're switching tabs
        isTabSwitchingRef.current = true;
        
        // Tab switched - restore position immediately without animation
        // Use requestAnimationFrame to ensure DOM is ready
        requestAnimationFrame(() => {
          const savedPosition = scrollPositions[currentSessionId];
          if (savedPosition !== undefined) {
            if (savedPosition === -1) {
              // Special value: user was at bottom, scroll to bottom
              scrollToBottomHelper('auto');
            } else if (chatContainerRef.current) {
              // Restore exact saved position (only works for non-virtualized scroll)
              chatContainerRef.current.scrollTop = savedPosition;
            }
          } else {
            // New session, check if has messages
            if (currentSession?.messages && currentSession.messages.length > 0) {
              // Has messages, scroll to bottom instantly
              scrollToBottomHelper('auto');
            }
            // No messages, stay at top
          }

          // Clear the tab switching flag after a short delay
          setTimeout(() => {
            isTabSwitchingRef.current = false;
          }, 100);
        });
      }
      // Always update the previous session ID ref
      previousSessionIdRef.current = currentSessionId;
    }
  }, [currentSessionId, scrollPositions, currentSession?.messages?.length]);

  // Check for resumable conversations when session has no messages
  useEffect(() => {
    if (!currentSessionId || !currentSession) return;
    // Only check if session has no messages and we haven't checked yet
    if (currentSession.messages.length > 0) return;
    if (hasResumableConversations[currentSessionId] !== undefined) return;

    const checkResumable = async () => {
      try {
        const port = claudeCodeClient.getServerPort() || 3001;
        const workDir = currentSession.workingDirectory;
        if (!workDir) return;

        const projectParam = `?project=${encodeURIComponent(workDir)}`;
        const response = await fetch(`http://localhost:${port}/claude-recent-conversations${projectParam}`);

        if (response.ok) {
          const data = await response.json();
          const hasConversations = (data.conversations?.length || 0) > 0;
          setHasResumableConversations(prev => ({
            ...prev,
            [currentSessionId]: hasConversations
          }));
        }
      } catch (err) {
        // silently fail - just don't show resume button
      }
    };

    checkResumable();
  }, [currentSessionId, currentSession?.messages?.length, currentSession?.workingDirectory]);

  // Listen for global resume trigger (from keyboard shortcut)
  useEffect(() => {
    const handleResumeEvent = () => {
      if (!currentSession || !currentSessionId) return;
      // Open modal if there are resumable conversations (will open in new tab if current has messages)
      if (hasResumableConversations[currentSessionId]) {
        setShowResumeModal(true);
      }
    };

    const handleCheckResumable = async () => {
      if (!currentSessionId || !currentSession) return;

      try {
        const port = claudeCodeClient.getServerPort() || 3001;
        const workDir = currentSession.workingDirectory;
        if (!workDir) return;

        const projectParam = `?project=${encodeURIComponent(workDir)}`;
        const response = await fetch(`http://localhost:${port}/claude-recent-conversations${projectParam}`);

        if (response.ok) {
          const data = await response.json();
          const hasConversations = (data.conversations?.length || 0) > 0;
          setHasResumableConversations(prev => ({
            ...prev,
            [currentSessionId]: hasConversations
          }));
        }
      } catch (err) {
        // silently fail
      }
    };

    window.addEventListener(TRIGGER_RESUME_EVENT, handleResumeEvent);
    window.addEventListener(CHECK_RESUMABLE_EVENT, handleCheckResumable);
    return () => {
      window.removeEventListener(TRIGGER_RESUME_EVENT, handleResumeEvent);
      window.removeEventListener(CHECK_RESUMABLE_EVENT, handleCheckResumable);
    };
  }, [currentSession, currentSessionId, hasResumableConversations]);

  // Listen for restore-input event (when compaction is interrupted)
  useEffect(() => {
    const handleRestoreInput = (e: CustomEvent<{ sessionId: string; message: string }>) => {
      const { sessionId, message } = e.detail;
      if (sessionId === currentSessionId && message) {
        console.log(`📝 [ClaudeChat] Restoring interrupted compact message to input: "${message.slice(0, 50)}..."`);
        setInput(message);
      }
    };

    window.addEventListener(RESTORE_INPUT_EVENT, handleRestoreInput as EventListener);
    return () => {
      window.removeEventListener(RESTORE_INPUT_EVENT, handleRestoreInput as EventListener);
    };
  }, [currentSessionId]);

  // Force scroll to bottom when user sends a message
  useEffect(() => {
    if (!currentSession || !currentSessionId) return;

    // Skip if we're switching tabs
    if (isTabSwitchingRef.current) return;

    const lastMessage = currentSession.messages[currentSession.messages.length - 1];

    // If the last message is from the user, force scroll to bottom and set isAtBottom
    if (lastMessage?.type === 'user') {
      // Mark as at bottom
      setIsAtBottom(prev => ({
        ...prev,
        [currentSessionId]: true
      }));

      // Force scroll with the helper - this resets user scroll tracking
      if (!isTabSwitchingRef.current) {
        requestAnimationFrame(() => {
          forceScrollToBottomHelper('auto');
        });
      }
    }
  }, [currentSession?.messages?.length, currentSessionId, forceScrollToBottomHelper]);

  // Clean up streaming start time after streaming ends
  useEffect(() => {
    if (currentSessionId && !currentSession?.streaming) {
      // Clean up streaming start time after streaming ends
      // (but only after a delay to ensure followups work correctly)
      setTimeout(() => {
        // Only clean up if streaming is still false (not restarted)
        const session = sessions.find(s => s.id === currentSessionId);
        if (!session?.streaming && streamingStartTimeRef.current[currentSessionId]) {
          console.log('[ClaudeChat] Cleaning up streaming start time for session:', currentSessionId);
          delete streamingStartTimeRef.current[currentSessionId];
        }
      }, 10000); // Clean up after 10 seconds
    }
  }, [currentSession?.streaming, currentSessionId, sessions]);

  // macOS focus sentinel: Smart focus restoration that detects glitch vs intentional focus loss
  // The key insight is that WKWebView can lose focus during state updates/DOM changes,
  // but this happens VERY fast (within 100-200ms). User-initiated focus loss is slower.
  // We also restore focus when the window regains focus if textarea was previously focused.
  useEffect(() => {
    if (!isMac) return;

    const GLITCH_THRESHOLD_MS = 150; // If focus lost within this time, it's likely a glitch

    const canRestoreFocus = () => {
      if (!document.hasFocus() || !inputRef.current) return false;
      // Skip if user is selecting text
      const selection = window.getSelection();
      if (selection && selection.toString().length > 0) return false;
      // Skip if any modal is open - check all overlay classes used in the app
      if (document.querySelector('.modal-overlay') ||
          document.querySelector('.recent-modal-overlay') ||
          document.querySelector('.projects-modal-overlay') ||
          document.querySelector('.settings-modal-overlay') ||
          document.querySelector('.mt-modal-overlay') ||
          document.querySelector('[role="dialog"]') ||
          showStatsModal || showResumeModal || showAgentExecutor || showModelToolsModal) return false;
      // Skip if session is read-only or context is almost full (>95%)
      const totalTokens = currentSession?.analytics?.tokens?.total || 0;
      const isContextFull = (totalTokens / 200000 * 100) > 95;
      if (currentSession?.readOnly || isContextFull) return false;
      // Skip if active element is another input (user clicked into something)
      const activeEl = document.activeElement;
      if (activeEl instanceof HTMLInputElement ||
          (activeEl instanceof HTMLTextAreaElement && activeEl !== inputRef.current) ||
          (activeEl instanceof HTMLElement && activeEl.isContentEditable)) return false;
      return true;
    };

    const restoreFocusIfGlitch = () => {
      if (!canRestoreFocus()) return;

      const timeSinceFocus = Date.now() - lastFocusTimestampRef.current;
      const isGlitch = timeSinceFocus < GLITCH_THRESHOLD_MS && lastFocusTimestampRef.current > 0;

      // Only restore if it was a glitch (very recent focus loss) or window just regained focus
      if (isGlitch || !windowFocusedRef.current) {
        requestAnimationFrame(() => {
          if (canRestoreFocus() && inputRef.current && document.activeElement !== inputRef.current) {
            inputRef.current.focus();
          }
        });
      }
    };

    // Focus out handler - detect when textarea loses focus
    const handleFocusOut = (e: FocusEvent) => {
      if (e.target !== inputRef.current) return;
      // Delay check to see if focus moved somewhere valid
      requestAnimationFrame(() => {
        restoreFocusIfGlitch();
      });
    };

    // Focus in handler - track when textarea gains focus
    const handleFocusIn = (e: FocusEvent) => {
      if (e.target === inputRef.current) {
        lastFocusTimestampRef.current = Date.now();
      }
    };

    // Window visibility change - restore focus when window becomes visible
    const handleVisibilityChange = () => {
      if (!document.hidden && canRestoreFocus()) {
        requestAnimationFrame(() => {
          if (inputRef.current && document.activeElement !== inputRef.current) {
            inputRef.current.focus();
          }
        });
      }
    };

    // Listen for Tauri window-focus-change event
    let cleanupWindowFocus: (() => void) | null = null;
    import('@tauri-apps/api/event').then(({ listen }) => {
      listen<boolean>('window-focus-change', (event) => {
        windowFocusedRef.current = event.payload;
        if (event.payload && canRestoreFocus()) {
          // Window gained focus - restore textarea focus with small delay
          // to let WKWebView settle its internal state
          setTimeout(() => {
            if (canRestoreFocus() && inputRef.current && document.activeElement !== inputRef.current) {
              inputRef.current.focus();
            }
          }, 50);
        }
      }).then(unlisten => {
        cleanupWindowFocus = unlisten;
      });
    }).catch(() => {
      // Not in Tauri environment
    });

    document.addEventListener('focusin', handleFocusIn, true);
    document.addEventListener('focusout', handleFocusOut, true);
    document.addEventListener('visibilitychange', handleVisibilityChange);

    return () => {
      document.removeEventListener('focusin', handleFocusIn, true);
      document.removeEventListener('focusout', handleFocusOut, true);
      document.removeEventListener('visibilitychange', handleVisibilityChange);
      if (cleanupWindowFocus) cleanupWindowFocus();
    };
  }, [currentSession?.streaming, currentSession?.readOnly, currentSession?.analytics?.tokens?.total, isMac, showStatsModal, showResumeModal, showAgentExecutor, showModelToolsModal]);

  // macOS streaming focus guard: During streaming, state updates can cause rapid focus loss
  // This periodic check catches focus loss that slips through the focus sentinel
  useEffect(() => {
    if (!isMac || !currentSession?.streaming) return;

    const canRestoreFocus = () => {
      if (!document.hasFocus() || !inputRef.current) return false;
      const selection = window.getSelection();
      if (selection && selection.toString().length > 0) return false;
      if (document.querySelector('.modal-overlay') ||
          document.querySelector('[role="dialog"]') ||
          showStatsModal || showResumeModal || showAgentExecutor || showModelToolsModal) return false;
      const activeEl = document.activeElement;
      if (activeEl instanceof HTMLInputElement ||
          (activeEl instanceof HTMLTextAreaElement && activeEl !== inputRef.current) ||
          (activeEl instanceof HTMLElement && activeEl.isContentEditable)) return false;
      return true;
    };

    // Check every 500ms during streaming - lightweight and non-intrusive
    const streamingFocusCheck = setInterval(() => {
      if (canRestoreFocus() && inputRef.current && document.activeElement !== inputRef.current) {
        // Only restore if focus went to body (typical WKWebView glitch symptom)
        if (document.activeElement === document.body) {
          inputRef.current.focus();
        }
      }
    }, 500);

    return () => clearInterval(streamingFocusCheck);
  }, [isMac, currentSession?.streaming, showStatsModal, showResumeModal, showAgentExecutor, showModelToolsModal]);

  // Handle bash running timer and dots animation per session
  useEffect(() => {
    if (!currentSessionId) return;
    
    if (currentSession?.runningBash || currentSession?.userBashRunning) {
      // Start timer for this session
      if (!bashStartTimes[currentSessionId]) {
        setBashStartTimes(prev => ({ ...prev, [currentSessionId]: Date.now() }));
        setBashDotCounts(prev => ({ ...prev, [currentSessionId]: 1 }));
      }
      
      // Update elapsed time every second for this session
      const timerInterval = setInterval(() => {
        const startTime = bashStartTimes[currentSessionId];
        if (startTime) {
          setBashElapsedTimes(prev => ({
            ...prev,
            [currentSessionId]: Math.floor((Date.now() - startTime) / 1000)
          }));
        }
      }, 1000);
      
      // Animate dots every 500ms for this session
      const dotsInterval = setInterval(() => {
        setBashDotCounts(prev => ({
          ...prev,
          [currentSessionId]: (prev[currentSessionId] || 1) >= 3 ? 1 : (prev[currentSessionId] || 1) + 1
        }));
      }, 500);
      
      return () => {
        clearInterval(timerInterval);
        clearInterval(dotsInterval);
      };
    } else {
      // Clean up when bash stops for this session
      setBashStartTimes(prev => {
        const newTimes = { ...prev };
        delete newTimes[currentSessionId];
        return newTimes;
      });
      setBashElapsedTimes(prev => {
        const newElapsed = { ...prev };
        delete newElapsed[currentSessionId];
        return newElapsed;
      });
      setBashDotCounts(prev => {
        const newCounts = { ...prev };
        delete newCounts[currentSessionId];
        return newCounts;
      });
    }
  }, [currentSession?.runningBash, currentSession?.userBashRunning, currentSessionId, currentSessionId ? bashStartTimes[currentSessionId] : undefined]);

  // Handle compacting timer per session
  useEffect(() => {
    if (!currentSessionId) return;

    const isCompacting = currentSession?.compactionState?.isCompacting;

    if (isCompacting) {
      // Start timer for this session
      if (!compactingStartTimes[currentSessionId]) {
        setCompactingStartTimes(prev => ({ ...prev, [currentSessionId]: Date.now() }));
      }
    } else {
      // Clean up when compacting stops for this session
      setCompactingStartTimes(prev => {
        const newTimes = { ...prev };
        delete newTimes[currentSessionId];
        return newTimes;
      });
    }
  }, [currentSession?.compactionState?.isCompacting, currentSessionId, currentSessionId ? compactingStartTimes[currentSessionId] : undefined]);

  // Speech recognition for dictation
  const startDictation = useCallback(async () => {
    // Check if Speech Recognition API is available
    if (!('webkitSpeechRecognition' in window) && !('SpeechRecognition' in window)) {
      console.error('[Dictation] Speech recognition not supported in this environment');

      // Platform-specific error messages
      let errorMsg = 'Dictation is not available.\n\n';
      if (isWindows) {
        errorMsg += 'On Windows, please ensure:\n' +
                    `1. Windows has microphone permission for ${APP_NAME}\n` +
                    '   Settings > Privacy & Security > Microphone > Let desktop apps access\n' +
                    '2. You have an active internet connection (uses Google Cloud)\n' +
                    `3. Try restarting ${APP_NAME}\n\n` +
                    'If still not working, try: Settings > Advanced > Reset Dictation Permissions';
      } else if (isMac) {
        errorMsg += 'On macOS, please ensure:\n' +
                    `1. ${APP_NAME} has microphone permission in System Settings > Privacy & Security > Microphone\n` +
                    '2. Dictation is enabled in System Settings > Keyboard > Dictation\n' +
                    '3. Restart the app after granting permissions';
      } else {
        errorMsg += 'Please ensure your browser supports the Web Speech API and microphone access is granted.';
      }
      alert(errorMsg);
      return;
    }

    // Check microphone permission first
    try {
      // Request microphone permission if needed
      if (navigator.mediaDevices && navigator.mediaDevices.getUserMedia) {
        console.log('[Dictation] Requesting microphone permission...');
        await navigator.mediaDevices.getUserMedia({ audio: true }).then(stream => {
          // Stop the stream immediately, we just needed permission
          stream.getTracks().forEach(track => track.stop());
          console.log('[Dictation] Microphone permission granted');
        });
      }
    } catch (err: any) {
      console.error('[Dictation] Microphone permission error:', err);
      let errorMsg = 'Microphone access denied.\n\n';
      if (isWindows) {
        errorMsg += 'Please check:\n' +
                    '1. Windows Settings > Privacy & Security > Microphone\n' +
                    '2. Enable "Let desktop apps access your microphone"\n' +
                    '3. Restart Yume after changing permissions\n\n' +
                    'If permissions are correct but still failing,\n' +
                    'try: Settings > Advanced > Reset Dictation Permissions';
      } else if (isMac) {
        errorMsg += 'Please grant permission in System Settings > Privacy & Security > Microphone';
      } else {
        errorMsg += 'Please grant microphone permission in your system settings.';
      }
      alert(errorMsg);
      return;
    }

    const SpeechRecognition = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
    const recognition = new SpeechRecognition();
    
    recognition.continuous = true;
    recognition.interimResults = true;
    recognition.lang = 'en-US';
    recognition.maxAlternatives = 1;
    
    recognition.onstart = () => {
      console.log('[Dictation] Started successfully');
      setIsDictating(true);
    };
    
    recognition.onresult = (event: any) => {
      // Collect all finals and current interim from the entire results array
      let allFinals = '';
      let currentInterim = '';

      for (let i = 0; i < event.results.length; i++) {
        const transcript = event.results[i][0].transcript;
        if (event.results[i].isFinal) {
          allFinals += transcript;
        } else {
          currentInterim += transcript;
        }
      }

      // Build full text: base + finals + interim (real-time update)
      const base = dictationBaseTextRef.current;
      const needsSpace = base && !base.endsWith(' ') && (allFinals || currentInterim);
      const fullText = base + (needsSpace ? ' ' : '') + allFinals + currentInterim;

      setInput(fullText);

      if (allFinals || currentInterim) {
        console.log('[Dictation] Real-time update - Finals:', allFinals, 'Interim:', currentInterim);
      }
    };
    
    recognition.onerror = (event: any) => {
      console.error('[Dictation] Error:', event.error, event);

      let errorMsg = 'Dictation error: ';
      switch(event.error) {
        case 'not-allowed':
          if (isWindows) {
            errorMsg = 'Microphone access denied.\n\n' +
                       'Please check Windows Settings > Privacy & Security > Microphone:\n' +
                       '1. "Microphone access" is ON\n' +
                       '2. "Let desktop apps access your microphone" is ON\n\n' +
                       'After enabling, restart Yume.\n\n' +
                       'If still not working, try:\n' +
                       'Settings > Advanced > Reset Dictation Permissions';
          } else {
            errorMsg += 'Microphone access denied. Please grant permission in System Settings.';
          }
          break;
        case 'no-speech':
          errorMsg += 'No speech detected. Please try again.';
          break;
        case 'network':
          errorMsg = 'Network error.\n\n' +
                     'Speech recognition requires an active internet connection\n' +
                     '(audio is processed by Google Cloud services).\n\n' +
                     'Please check your internet connection and try again.';
          break;
        case 'aborted':
          errorMsg += 'Dictation was aborted.';
          break;
        case 'audio-capture':
          if (isWindows) {
            errorMsg = 'Audio capture failed.\n\n' +
                       'This usually means:\n' +
                       '1. No microphone is connected\n' +
                       '2. Microphone is being used by another app\n' +
                       '3. WebView2 microphone permission was denied\n\n' +
                       'Try: Settings > Advanced > Reset Dictation Permissions\n' +
                       'Then restart Yume.';
          } else {
            errorMsg += 'Audio capture failed. Check your microphone connection.';
          }
          break;
        case 'service-not-allowed':
          if (isWindows) {
            errorMsg = 'Speech service not allowed.\n\n' +
                       'WebView2 has blocked speech recognition.\n\n' +
                       'Try: Settings > Advanced > Reset Dictation Permissions\n' +
                       'Then restart Yume.';
          } else {
            errorMsg += 'Speech recognition service not allowed.';
          }
          break;
        default:
          errorMsg += event.error;
      }

      if (event.error !== 'no-speech' && event.error !== 'aborted') {
        alert(errorMsg);
      }

      setIsDictating(false);
      recognitionRef.current = null;
    };
    
    recognition.onend = () => {
      console.log('[Dictation] Ended');
      setIsDictating(false);
      recognitionRef.current = null;
    };
    
    recognitionRef.current = recognition;

    // Capture current input as base text before starting
    dictationBaseTextRef.current = input;

    try {
      recognition.start();
      // Focus the input to show dictation is active
      inputRef.current?.focus();
      console.log('[Dictation] Starting recognition... Base text:', input);
    } catch (err) {
      console.error('[Dictation] Failed to start:', err);
      setIsDictating(false);
      recognitionRef.current = null;
      dictationBaseTextRef.current = '';
      alert('Failed to start dictation. Please try again.');
    }
  }, [input, inputRef]);
  
  const stopDictation = useCallback(() => {
    if (recognitionRef.current) {
      recognitionRef.current.stop();
      recognitionRef.current = null;
    }
    dictationBaseTextRef.current = ''; // Clear base text
    // Always reset state, even if ref is already null
    setIsDictating(false);
  }, []);
  
  const toggleDictation = useCallback(() => {
    if (isDictating) {
      stopDictation();
    } else {
      startDictation();
    }
  }, [isDictating, startDictation, stopDictation]);

  // Clear context with confirmation
  const handleClearContextRequest = useCallback(() => {
    if (currentSessionId && !currentSession?.readOnly && !currentSession?.streaming) {
      setShowClearConfirm(true);
    }
  }, [currentSessionId, currentSession?.readOnly, currentSession?.streaming]);

  const confirmClearContext = useCallback(() => {
    if (currentSessionId) {
      clearContext(currentSessionId);
      setIsAtBottom(prev => ({
        ...prev,
        [currentSessionId]: true
      }));
      setScrollPositions(prev => {
        const newPositions = { ...prev };
        delete newPositions[currentSessionId];
        return newPositions;
      });
      setInput('');
      if (inputRef.current) {
        inputRef.current.style.height = '44px';
        inputRef.current.style.overflow = 'hidden';
      }
      if (currentSessionId) {
        setTextareaHeights(prev => ({ ...prev, [currentSessionId]: 44 }));
      }
    }
    setShowClearConfirm(false);
  }, [currentSessionId, clearContext, setIsAtBottom, setScrollPositions]);

  // Stop bash command
  const handleStopBash = useCallback(() => {
    if (currentSession?.bashProcessId) {
      import('@tauri-apps/api/core').then(({ invoke }) => {
        invoke('kill_bash_process', {
          processId: currentSession.bashProcessId
        }).then(() => {
          // Add cancelled message with elapsed time
          const elapsedTime = bashElapsedTimes[currentSessionId || ''] || 0;
          const cancelMessage = {
            id: `bash-cancel-${Date.now()}`,
            type: 'system' as const,
            subtype: 'interrupted' as const,
            message: `bash command cancelled (${elapsedTime}s)`,
            timestamp: Date.now()
          };

          if (currentSessionId) {
            addMessageToSession(currentSessionId, cancelMessage);
          }

          // Clear flags immediately
          useClaudeCodeStore.setState(state => ({
            sessions: state.sessions.map(s =>
              s.id === currentSessionId
                ? { ...s, runningBash: false, userBashRunning: false, bashProcessId: undefined }
                : s
            )
          }));
        }).catch(error => {
          console.error('Failed to kill bash process:', error);
        });
      });
    } else if (currentSession?.streaming) {
      // Fallback to interrupting the session if no bash process but streaming
      interruptSession();
    }
  }, [currentSession?.bashProcessId, currentSession?.streaming, currentSessionId, bashElapsedTimes, addMessageToSession, interruptSession]);

  // Compact context with confirmation
  const handleCompactContextRequest = useCallback(() => {
    if (currentSessionId && !currentSession?.readOnly && !currentSession?.streaming) {
      setShowCompactConfirm(true);
    }
  }, [currentSessionId, currentSession?.readOnly, currentSession?.streaming]);

  const confirmCompactContext = useCallback(() => {
    if (currentSessionId) {
      sendMessage('/compact');
    }
    setShowCompactConfirm(false);
  }, [currentSessionId, sendMessage]);

  const confirmRollback = useCallback(async () => {
    if (!currentSessionId || !pendingRollbackData) {
      setShowRollbackConfirm(false);
      setPendingRollbackData(null);
      return;
    }

    // Check if session is currently streaming - don't allow rollback during active editing
    if (currentSession?.streaming) {
      console.warn('[Rollback] Cannot rollback while session is streaming');
      setShowRollbackConfirm(false);
      setPendingRollbackData(null);
      return;
    }

    const { messageIndex, messageContent, filesToRestore } = pendingRollbackData;

    // Re-verify file conflicts at confirmation time (TOCTOU protection)
    // Files may have changed between initial check and user clicking confirm
    if (filesToRestore.length > 0) {
      try {
        const { invoke } = await import('@tauri-apps/api/core');
        const filesToCheck: Array<[string, number | null, boolean]> = filesToRestore.map(([path, data]) => [
          path,
          data.mtime || null,
          data.isNewFile
        ]);

        const freshConflicts = await invoke<Array<{
          path: string;
          conflict_type: string;
        }>>('check_file_conflicts', { files: filesToCheck });

        const hasNewConflicts = freshConflicts.some(c => c.conflict_type !== 'none');
        if (hasNewConflicts) {
          console.warn('[Rollback] Files modified since conflict check, aborting');
          // Close the confirm dialog - user needs to re-initiate rollback
          setShowRollbackConfirm(false);
          setPendingRollbackData(null);
          // Could show a toast/notification here, but for now just abort silently
          return;
        }
      } catch (err) {
        console.error('[Rollback] Failed to re-verify conflicts:', err);
        setShowRollbackConfirm(false);
        setPendingRollbackData(null);
        return;
      }
    }

    // Restore files using atomic Tauri commands with backup for rollback on failure
    const backups: Array<{ path: string; content: string | null; wasDeleted: boolean }> = [];
    let rollbackError: Error | null = null;

    try {
      const { invoke } = await import('@tauri-apps/api/core');

      for (const [path, data] of filesToRestore) {
        try {
          if (data.isNewFile) {
            // File was created by Claude - delete it, keeping backup of current content
            console.log(`[Rollback] Deleting new file: ${path}`);
            const previousContent = await invoke<string | null>('atomic_file_delete', { path });
            backups.push({ path, content: previousContent, wasDeleted: true });
          } else if (data.originalContent !== null) {
            // File existed - restore original content, keeping backup of current
            console.log(`[Rollback] Restoring file: ${path}`);
            const previousContent = await invoke<string | null>('atomic_file_restore', {
              path,
              newContent: data.originalContent
            });
            backups.push({ path, content: previousContent, wasDeleted: false });
          }
        } catch (fileErr) {
          console.error(`[Rollback] Failed to process ${path}:`, fileErr);
          rollbackError = fileErr as Error;
          break; // Stop on first error to preserve consistency
        }
      }

      if (rollbackError) {
        // Rollback failed partway - restore all backups to original state
        console.log(`[Rollback] Error occurred, reverting ${backups.length} change(s)...`);
        for (const backup of backups.reverse()) {
          try {
            if (backup.wasDeleted && backup.content !== null) {
              // File was deleted, restore it
              await invoke('write_file_content', { path: backup.path, content: backup.content });
              console.log(`[Rollback] Reverted: restored deleted ${backup.path}`);
            } else if (!backup.wasDeleted && backup.content !== null) {
              // File was overwritten, restore previous content
              await invoke('write_file_content', { path: backup.path, content: backup.content });
              console.log(`[Rollback] Reverted: restored ${backup.path}`);
            } else if (!backup.wasDeleted && backup.content === null) {
              // File didn't exist before our restore created it, delete it
              await invoke('delete_file', { path: backup.path });
              console.log(`[Rollback] Reverted: removed ${backup.path}`);
            }
          } catch (restoreErr) {
            console.error(`[Rollback] CRITICAL: Failed to revert ${backup.path}:`, restoreErr);
          }
        }
        console.error('[Rollback] Rollback failed and changes were reverted');
        setShowRollbackConfirm(false);
        setPendingRollbackData(null);
        return;
      }

      console.log(`[Rollback] Successfully restored ${filesToRestore.length} file(s)`);
    } catch (err) {
      console.error('[Rollback] Error during rollback:', err);
      setShowRollbackConfirm(false);
      setPendingRollbackData(null);
      return;
    }

    // Restore conversation state to BEFORE the selected message
    // This removes the selected message and everything after it
    restoreToMessage(currentSessionId, messageIndex - 1);

    // Put the message content back into the input field
    setInput(messageContent);
    // Auto-resize the input to fit the content
    if (inputRef.current) {
      inputRef.current.style.height = 'auto';
      inputRef.current.style.height = `${Math.min(inputRef.current.scrollHeight, 300)}px`;
      // Focus the input
      setTimeout(() => inputRef.current?.focus(), 50);
    }

    setShowRollbackPanel(false);
    setShowRollbackConfirm(false);
    setPendingRollbackData(null);
    console.log(`[Rollback] Restored conversation, placed message in input`);
  }, [currentSessionId, currentSession?.streaming, pendingRollbackData, restoreToMessage, setShowRollbackPanel, setInput]);

  // Keyboard handler for confirmation dialogs
  useEffect(() => {
    if (!showClearConfirm && !showCompactConfirm && !showRollbackConfirm) return;

    // Reset selection to confirm button when dialog opens
    setConfirmDialogSelection(1);

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        setShowClearConfirm(false);
        setShowCompactConfirm(false);
        setShowRollbackConfirm(false);
        setPendingRollbackData(null);
        return;
      }

      if (e.key === 'ArrowLeft' || e.key === 'ArrowRight' || e.key === 'Tab') {
        e.preventDefault();
        setConfirmDialogSelection(prev => prev === 0 ? 1 : 0);
        return;
      }

      if (e.key === 'Enter' || e.key === ' ') {
        e.preventDefault();
        if (confirmDialogSelection === 1) {
          // Confirm action
          if (showClearConfirm) {
            confirmClearContext();
          } else if (showCompactConfirm) {
            confirmCompactContext();
          } else if (showRollbackConfirm) {
            confirmRollback();
          }
        } else {
          // Cancel
          setShowClearConfirm(false);
          setShowCompactConfirm(false);
          setShowRollbackConfirm(false);
          setPendingRollbackData(null);
        }
        return;
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [showClearConfirm, showCompactConfirm, showRollbackConfirm, confirmDialogSelection, confirmClearContext, confirmCompactContext, confirmRollback]);

  // Helper to filter user messages excluding bash commands
  const getNonBashUserMessages = useCallback((messages: any[] | undefined) => {
    return (messages || []).filter(msg => {
      if (msg.type !== 'user') return false;
      const content = msg.message?.content;
      let text = typeof content === 'string' ? content :
        Array.isArray(content) ? content.filter((c: any) => c.type === 'text').map((c: any) => c.text).join(' ') : '';
      return !isBashPrefix(text.trim());
    });
  }, []);

  // Rollback panel - no auto-selection, user controls selection via keyboard/mouse

  // Rollback panel keyboard navigation
  useEffect(() => {
    if (!showRollbackPanel || showRollbackConfirm) return;

    const userMessages = getNonBashUserMessages(currentSession?.messages);
    const maxIndex = userMessages.length - 1;

    const handleKeyDown = (e: KeyboardEvent) => {
      // Don't handle if confirm modal is open or streaming
      if (showRollbackConfirm || currentSession?.streaming) return;

      if (e.key === 'Escape') {
        e.preventDefault();
        e.stopPropagation();
        setShowRollbackPanel(false);
        return;
      }

      if (e.key === 'ArrowDown' || e.key === 'j') {
        e.preventDefault();
        setRollbackSelectedIndex(prev => prev === null ? 0 : Math.min(prev + 1, maxIndex));
        return;
      }

      if (e.key === 'ArrowUp' || e.key === 'k') {
        e.preventDefault();
        setRollbackSelectedIndex(prev => prev === null ? 0 : Math.max(prev - 1, 0));
        return;
      }

      if (e.key === 'Enter') {
        e.preventDefault();
        // Trigger click on active item (hover takes priority over keyboard selection)
        const activeIndex = rollbackHoveredIndex !== null ? rollbackHoveredIndex : (rollbackSelectedIndex ?? 0);
        const items = rollbackListRef.current?.querySelectorAll('.rollback-item');
        if (items && items[activeIndex]) {
          (items[activeIndex] as HTMLElement).click();
        }
        return;
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [showRollbackPanel, showRollbackConfirm, currentSession?.messages, currentSession?.streaming, rollbackSelectedIndex, rollbackHoveredIndex, setShowRollbackPanel, getNonBashUserMessages]);

  // Handle resume conversation selection from modal
  const handleResumeConversation = useCallback(async (conversation: any) => {
    console.log('[ClaudeChat] Resuming conversation:', conversation);

    // Check if current session has messages - if so, open in new tab
    const storeState = useClaudeCodeStore.getState();
    const currentSession = storeState.sessions.find(s => s.id === storeState.currentSessionId);
    const hasExistingMessages = currentSession && currentSession.messages.length > 0;

    // Decode the project path to get the working directory
    let workingDirectory = '/';
    try {
      // Project paths are encoded like -Users-yuru-projectname
      workingDirectory = conversation.projectPath.replace(/^-/, '/').replace(/-/g, '/');
    } catch (e) {
      console.error('Failed to decode project path:', e);
    }

    // Get project name for tab title
    const projectName = conversation.projectName || 'resumed';

    let targetSessionId: string;

    if (hasExistingMessages) {
      // Create a new tab for the resumed conversation
      console.log('[ClaudeChat] Current session has messages, creating new tab for resume');
      const newSessionId = await storeState.createSession(undefined, workingDirectory);
      if (!newSessionId) {
        console.error('[ClaudeChat] Failed to create new session for resume');
        return;
      }
      targetSessionId = newSessionId;
    } else {
      // Use current session (existing behavior)
      const existingSessionId = storeState.currentSessionId;
      if (!existingSessionId) {
        console.error('[ClaudeChat] No current session to resume into');
        return;
      }
      targetSessionId = existingSessionId;
    }

    try {
      // Load the session data from server
      const serverPort = claudeCodeClient.getServerPort();
      if (!serverPort) {
        console.error('[ClaudeChat] Server port not available for resume');
        return;
      }

      // Determine endpoint based on provider
      const provider = conversation.provider || 'claude';
      let endpoint: string;

      if (provider === 'claude') {
        // Claude sessions stored in ~/.claude/projects/
        endpoint = `http://localhost:${serverPort}/claude-session/${encodeURIComponent(conversation.projectPath)}/${encodeURIComponent(conversation.id)}`;
      } else {
        // Gemini/OpenAI sessions stored in ~/.yume/sessions/{provider}/
        endpoint = `http://localhost:${serverPort}/yume-session/${provider}/${encodeURIComponent(conversation.id)}`;
      }

      console.log('[ClaudeChat] Loading session data for resume:', conversation.id, 'provider:', provider);
      const response = await fetch(endpoint);

      if (!response.ok) {
        const errorText = await response.text();
        console.error('[ClaudeChat] Server response error:', response.status, errorText);
        throw new Error(`Failed to load session: ${response.status}`);
      }

      const data = await response.json();
      console.log('[ClaudeChat] Session data loaded:', {
        messageCount: data.messages?.length || 0,
        title: data.title,
        sessionId: data.sessionId
      });

      if (!data.messages || data.messages.length === 0) {
        console.warn('[ClaudeChat] No messages in session data');
      }

      // Get tab title from conversation or first message
      let tabTitle = conversation.title || data.title || projectName;
      if (tabTitle.length > 25) {
        tabTitle = tabTitle.substring(0, 25) + '...';
      }

      // Messages are already transformed by the server
      const messagesToLoad = data.messages || [];

      // Get token usage from server response
      // Server returns totalContextTokens, not totalTokens
      const serverUsage = data.usage || { inputTokens: 0, outputTokens: 0, totalContextTokens: 0 };
      const totalTokens = serverUsage.totalContextTokens || serverUsage.totalTokens || 0;

      // Create the restored session object
      const restoredSession = {
        id: targetSessionId,
        name: tabTitle,
        claudeTitle: tabTitle,
        status: 'active' as const,
        messages: messagesToLoad,
        workingDirectory: workingDirectory,
        createdAt: new Date(),
        updatedAt: new Date(),
        claudeSessionId: conversation.id,
        provider: data.provider || provider, // Set provider from session data or conversation
        model: data.model || undefined, // Set model from session data if available
        readOnly: false, // Allow interaction - will spawn with --resume on first message
        analytics: {
          totalMessages: messagesToLoad.length,
          userMessages: messagesToLoad.filter((m: any) => m.type === 'user').length,
          assistantMessages: messagesToLoad.filter((m: any) => m.type === 'assistant').length,
          toolUses: 0,
          tokens: {
            input: serverUsage.inputTokens || 0,
            output: serverUsage.outputTokens || 0,
            total: totalTokens
          },
          cost: { total: 0, byModel: { opus: 0, sonnet: 0 } },
          duration: 0,
          lastActivity: new Date(),
          thinkingTime: 0
        },
        pendingToolIds: new Set(),
        modifiedFiles: new Set<string>()
      };

      // Update the session in the store
      useClaudeCodeStore.setState((state: any) => ({
        sessions: state.sessions.map((s: any) =>
          s.id === targetSessionId ? restoredSession : s
        ),
        currentSessionId: targetSessionId // Switch to the target session
      }));

      // Register session with server so it knows about the claudeSessionId for --resume
      // This is critical - without this, server won't find the session when sendMessage is called
      try {
        console.log('[ClaudeChat] Registering resumed session with server...');
        await claudeCodeClient.createSession(tabTitle, workingDirectory, {
          sessionId: targetSessionId,
          existingSessionId: targetSessionId,
          claudeSessionId: conversation.id, // The real Claude session ID for --resume
          messages: messagesToLoad
        });
        console.log('[ClaudeChat] Session registered with server successfully');

        // Set up message listeners for the resumed session
        useClaudeCodeStore.getState().reconnectSession(targetSessionId, conversation.id);
        console.log('[ClaudeChat] Message listeners set up for resumed session');
      } catch (err) {
        console.error('[ClaudeChat] Failed to register session with server:', err);
        // Continue anyway - session is in UI, user can still view messages
      }

      console.log('[ClaudeChat] Session restored for resumption with', messagesToLoad.length, 'messages, claudeSessionId:', conversation.id);

    } catch (error) {
      console.error('[ClaudeChat] Failed to resume conversation:', error);
    }
  }, []);

  // Resume the most recent conversation directly (for right-click on resume button)
  const handleResumeLastConversation = useCallback(async () => {
    if (!currentSession || !currentSessionId) return;

    try {
      const port = claudeCodeClient.getServerPort() || 3001;
      const workDir = currentSession.workingDirectory;
      if (!workDir) return;

      const projectParam = `?project=${encodeURIComponent(workDir)}`;
      const response = await fetch(`http://localhost:${port}/claude-recent-conversations${projectParam}`);

      if (response.ok) {
        const data = await response.json();
        if (data.conversations?.length > 0) {
          // Resume the first (most recent) conversation
          handleResumeConversation(data.conversations[0]);
        }
      }
    } catch (err) {
      console.error('[ClaudeChat] Failed to resume last conversation:', err);
    }
  }, [currentSession, currentSessionId, handleResumeConversation]);

  // Handle Ctrl+F for search, Ctrl+L for clear, and ? for help
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      // Don't trigger shortcuts when typing in input fields (except for Ctrl+W and Ctrl+T)
      const target = e.target as HTMLElement;
      const isInputField = target.tagName === 'INPUT' || 
                           target.tagName === 'TEXTAREA' || 
                           target.contentEditable === 'true';
      
      // Ctrl+W and Ctrl+T handled in main.tsx to avoid duplicate handlers
      if ((e.ctrlKey || e.metaKey) && e.key === 'f') {
        e.preventDefault();
        setSearchVisible(true);
      } else if ((e.ctrlKey || e.metaKey) && e.key === 'l') {
        e.preventDefault();
        handleClearContextRequest();
      } else if ((e.ctrlKey || e.metaKey) && e.key === 'k') {
        e.preventDefault();
        // Insert ultrathink into chat
        if (inputRef.current && document.activeElement === inputRef.current) {
          const textarea = inputRef.current;
          const cursorPos = textarea.selectionStart;
          const textBefore = input.substring(0, cursorPos);
          const textAfter = input.substring(textarea.selectionEnd);

          // Check if there's whitespace before cursor
          const needsSpace = textBefore.length > 0 && !/\s$/.test(textBefore);
          const insertText = needsSpace ? ' ultrathink' : 'ultrathink';

          setInput(textBefore + insertText + textAfter);
          // Set cursor position after inserted text
          setTimeout(() => {
            if (inputRef.current) {
              const newPos = cursorPos + insertText.length;
              inputRef.current.selectionStart = newPos;
              inputRef.current.selectionEnd = newPos;
            }
          }, 0);
        } else {
          // Textarea not focused - insert at end with period
          setInput(prev => prev ? prev + ' ultrathink.' : 'ultrathink.');
          inputRef.current?.focus();
        }
      } else if ((e.ctrlKey || e.metaKey) && e.key === 'm') {
        e.preventDefault();
        // Trigger compact command with confirmation
        handleCompactContextRequest();
      } else if ((e.ctrlKey || e.metaKey) && e.key === 'r' && e.shiftKey) {
        e.preventDefault();
        // Open resume conversation modal (works even with messages - will open in new tab)
        if (hasResumableConversations[currentSessionId || '']) {
          setShowResumeModal(true);
        }
      } else if ((e.ctrlKey || e.metaKey) && e.key === 'r' && !e.shiftKey) {
        e.preventDefault();
        // Dispatch event to open recent modal in App
        const event = new CustomEvent('openRecentProjects');
        window.dispatchEvent(event);
      } else if ((e.ctrlKey || e.metaKey) && e.key === 'd') {
        e.preventDefault();
        // Create new session in same directory (fresh start, same working dir)
        if (currentSession?.workingDirectory) {
          createSession(undefined, currentSession.workingDirectory);
        }
      } else if ((e.ctrlKey || e.metaKey) && e.shiftKey && (e.key === '.' || e.key === '>' || e.code === 'Period')) {
        e.preventDefault();
        // Toggle auto-compact setting
        setAutoCompactEnabled(autoCompactEnabled === false ? true : false);
      } else if ((e.ctrlKey || e.metaKey) && !e.shiftKey && (e.key === '.' || e.code === 'Period')) {
        e.preventDefault();
        // Toggle stats modal
        setShowStatsModal(prev => !prev);
      } else if ((e.ctrlKey || e.metaKey) && e.shiftKey && e.key.toLowerCase() === 'o') {
        e.preventDefault();
        // Open model & tools modal via keyboard
        setModelToolsOpenedViaKeyboard(true);
        setShowModelToolsModal(prev => !prev);
      } else if ((e.ctrlKey || e.metaKey) && e.shiftKey && e.key.toLowerCase() === 'e') {
        e.preventDefault();
        // Open CLAUDE.md editor
        if (currentSession?.workingDirectory) {
          setShowClaudeMdEditor(true);
        }
      } else if ((e.ctrlKey || e.metaKey) && e.shiftKey && e.key.toLowerCase() === 'd') {
        e.preventDefault();
        // Fork session - duplicate current session with all messages and context %
        if (currentSession?.id && currentSession.messages.length > 0) {
          forkSession(currentSession.id);
        }
      } else if (e.key === 'F5') {
        e.preventDefault();
        // Toggle dictation
        toggleDictation();
      } else if ((e.ctrlKey || e.metaKey) && !e.shiftKey && e.key === 'o') {
        e.preventDefault();
        // Toggle model between opus/sonnet
        toggleModel();
      } else if ((e.ctrlKey || e.metaKey) && e.key === 'e') {
        e.preventDefault();
        // Toggle files panel on files sub-tab
        if (currentSession?.workingDirectory) {
          if (showFilesPanel && filesSubTab === 'files') {
            // Already on files tab - close panel
            setShowFilesPanel(false);
          } else {
            // Open panel on files tab
            setShowFilesPanel(true, 'files');
          }
          setFocusedFileIndex(-1);
          setFocusedGitIndex(-1);
        }
      } else if ((e.ctrlKey || e.metaKey) && e.key === 'g') {
        e.preventDefault();
        // Toggle files panel on git sub-tab (only if git repo)
        if (currentSession?.workingDirectory && isGitRepo) {
          if (showFilesPanel && filesSubTab === 'git') {
            // Already on git tab - close panel
            setShowFilesPanel(false);
          } else {
            // Open panel on git tab
            setShowFilesPanel(true, 'git');
          }
          setSelectedGitFile(null);
          setGitDiff(null);
          setFocusedFileIndex(-1);
          setFocusedGitIndex(-1);
        }
      } else if ((e.ctrlKey || e.metaKey) && e.key === 'h') {
        e.preventDefault();
        // Toggle rollback/history panel (exclude bash commands)
        const hasUserMessages = currentSession?.messages.filter(m => {
          if (m.type !== 'user') return false;
          const content = m.message?.content;
          let text = typeof content === 'string' ? content :
            Array.isArray(content) ? content.filter((c: any) => c.type === 'text').map((c: any) => c.text).join(' ') : '';
          return !isBashPrefix(text.trim());
        }).length ?? 0;
        if (hasUserMessages > 0) {
          setShowRollbackPanel(prev => !prev);
          setShowFilesPanel(false);
          setSelectedFile(null);
          setFileContent('');
          setSelectedGitFile(null);
          setGitDiff(null);
        }
      } else if (e.key === 'Escape') {
        // Skip if any modal is open - let modal handle its own escape
        if (showStatsModal || showResumeModal || showAgentExecutor || showModelToolsModal) return;

        // Priority: close panels/search first, only interrupt if nothing to close
        if (showFilesPanel || showRollbackPanel) {
          // Close side panels on Escape first (before interrupt)
          e.preventDefault();
          setShowFilesPanel(false);
          setShowRollbackPanel(false);
          setFocusedFileIndex(-1);
          setFocusedGitIndex(-1);
        } else if (searchVisible) {
          e.preventDefault();
          setSearchVisible(false);
          setSearchQuery('');
          setSearchMatches([]);
          setSearchIndex(0);
        } else if (currentSession?.streaming || currentSession?.userBashRunning || currentSession?.runningBash) {
          // Only interrupt if no panels/search are open
          e.preventDefault();
          console.log('[ClaudeChat] ESC pressed - interrupting');
          handleStopBash();
        }
      } else if (e.key === 'ArrowDown' || e.key === 'ArrowUp' || e.key === 'Enter') {
        // Panel keyboard navigation
        if (showFilesPanel && fileTree.length > 0) {
          e.preventDefault();
          // Inline calculation of visible files count
          const countVisibleFiles = (items: any[]): number => {
            let count = 0;
            for (const item of items) {
              count++;
              if (item.type === 'directory' && expandedFolders.has(item.path) && item.children) {
                count += countVisibleFiles(item.children);
              }
            }
            return count;
          };
          const totalFiles = countVisibleFiles(fileTree);
          if (totalFiles === 0) return;

          if (e.key === 'ArrowDown') {
            setFocusedFileIndex(prev => Math.min(prev + 1, totalFiles - 1));
          } else if (e.key === 'ArrowUp') {
            setFocusedFileIndex(prev => Math.max(prev - 1, 0));
          } else if (e.key === 'Enter' && focusedFileIndex >= 0) {
            // Find and click the focused element
            const focusedEl = document.querySelector('.file-tree-item.focused');
            if (focusedEl) {
              (focusedEl as HTMLElement).click();
            }
          }
        } else if (showGitPanel && gitStatus) {
          e.preventDefault();
          const totalGitFiles = gitStatus.modified.length + gitStatus.added.length + gitStatus.deleted.length;
          if (totalGitFiles === 0) return;

          if (e.key === 'ArrowDown') {
            setFocusedGitIndex(prev => Math.min(prev + 1, totalGitFiles - 1));
          } else if (e.key === 'ArrowUp') {
            setFocusedGitIndex(prev => Math.max(prev - 1, 0));
          } else if (e.key === 'Enter' && focusedGitIndex >= 0) {
            // Find and click the focused element
            const focusedEl = document.querySelector('.git-file-item.focused');
            if (focusedEl) {
              (focusedEl as HTMLElement).click();
            }
          }
        }
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [searchVisible, currentSessionId, handleClearContextRequest, currentSession, setShowStatsModal, interruptSession, setIsAtBottom, setScrollPositions, deleteSession, createSession, sessions.length, input, showFilesPanel, showGitPanel, showRollbackPanel, isGitRepo, fileTree, expandedFolders, focusedFileIndex, focusedGitIndex, gitStatus, autoCompactEnabled, setAutoCompactEnabled, toggleDictation, handleStopBash]);



  // Debounce search query to prevent expensive re-renders on every keystroke
  useEffect(() => {
    const timer = setTimeout(() => setDebouncedSearchQuery(searchQuery), 200);
    return () => clearTimeout(timer);
  }, [searchQuery]);

  // Search functionality - uses debounced query for performance
  useEffect(() => {
    if (!debouncedSearchQuery || !currentSession) {
      setSearchMatches([]);
      setSearchIndex(0);
      return;
    }

    const query = debouncedSearchQuery.toLowerCase();
    const matches: number[] = [];
    currentSession.messages.forEach((msg, idx) => {
      let content = '';
      if (msg.message?.content) {
        if (typeof msg.message.content === 'string') {
          content = msg.message.content;
        } else if (Array.isArray(msg.message.content)) {
          content = msg.message.content
            .filter((b: any) => b.type === 'text' && b.text)
            .map((b: any) => b.text)
            .join(' ');
        }
      }
      if (content.toLowerCase().includes(query)) {
        matches.push(idx);
      }
    });
    setSearchMatches(matches);
    setSearchIndex(0);

    // Scroll to first match - use virtualized scrollToIndex if available
    if (matches.length > 0) {
      if (virtualizedMessageListRef.current) {
        virtualizedMessageListRef.current.scrollToIndex(matches[0], 'auto');
      } else {
        // Fallback for non-virtualized list
        const element = document.querySelector(`[data-message-index="${matches[0]}"]`);
        element?.scrollIntoView({ behavior: 'instant', block: 'center' });
      }
    }
  }, [debouncedSearchQuery, currentSession]);

  const navigateSearch = (direction: 'next' | 'prev') => {
    if (searchMatches.length === 0) return;

    let newIndex = searchIndex;
    if (direction === 'next') {
      newIndex = (searchIndex + 1) % searchMatches.length;
    } else {
      newIndex = searchIndex === 0 ? searchMatches.length - 1 : searchIndex - 1;
    }

    setSearchIndex(newIndex);

    // Use virtualized scrollToIndex if available, fallback to DOM query
    if (virtualizedMessageListRef.current) {
      virtualizedMessageListRef.current.scrollToIndex(searchMatches[newIndex], 'smooth');
    } else {
      const element = document.querySelector(`[data-message-index="${searchMatches[newIndex]}"]`);
      element?.scrollIntoView({ behavior: 'smooth', block: 'center' });
    }
  };

  // Track the previous session ID to know when we're actually switching sessions
  const prevSessionIdRef = useRef<string | null>(null);

  // Check if current working directory is a git repo when session changes
  useEffect(() => {
    const checkGitRepo = async () => {
      if (!currentSession?.workingDirectory) {
        setIsGitRepo(false);
        return;
      }
      try {
        await invoke('get_git_status', { directory: currentSession.workingDirectory });
        setIsGitRepo(true);
      } catch (error) {
        // Only set isGitRepo to false if it's definitively not a git repo
        // Don't change state on transient errors like "Git is busy"
        const errorStr = String(error);
        if (errorStr.includes('Not a git repository') || errorStr.includes('Directory does not exist')) {
          setIsGitRepo(false);
        }
        // For other errors (like git lock), keep the previous state
      }
    };
    checkGitRepo();
  }, [currentSession?.workingDirectory]);

  // Load file tree when files panel is opened, also load git status if available
  useEffect(() => {
    const loadFileTree = async () => {
      if (!showFilesPanel || !currentSession?.workingDirectory) return;
      setFileLoading(true);
      try {
        const files = await invoke('get_folder_contents', {
          folderPath: currentSession.workingDirectory,
          maxResults: 100
        }) as any[];
        setFileTree(files);

        // Also load git status for file indicators (if git repo)
        if (isGitRepo) {
          try {
            const status = await invoke('get_git_status', { directory: currentSession.workingDirectory }) as any;
            setGitStatus({
              modified: status.modified || [],
              added: status.added || [],
              deleted: status.deleted || [],
              untracked: []
            });
          } catch {
            // Silently fail - not critical for file browser
          }
        }
      } catch (error) {
        console.error('Failed to load file tree:', error);
        setFileTree([]);
      } finally {
        setFileLoading(false);
      }
    };
    loadFileTree();
  }, [showFilesPanel, currentSession?.workingDirectory, isGitRepo]);

  // Load git status when git panel is opened, and refresh every 30s while open
  useEffect(() => {
    // Helper to fetch and parse line stats
    const fetchLineStats = async (workingDir: string) => {
      try {
        // Use dedicated native git command to avoid WSL issues on Windows
        const numstatResult = await invoke('get_git_diff_numstat', {
          directory: workingDir
        }) as string;
        const stats: { [file: string]: { added: number; deleted: number } } = {};
        // Split by \n and trim each line to handle Windows \r\n line endings
        for (const rawLine of numstatResult.trim().split('\n')) {
          const line = rawLine.trim(); // Remove \r on Windows
          if (!line) continue;
          const parts = line.split('\t');
          if (parts.length >= 3) {
            const added = parts[0] === '-' ? 0 : parseInt(parts[0], 10) || 0;
            const deleted = parts[1] === '-' ? 0 : parseInt(parts[1], 10) || 0;
            // Normalize path separators to forward slashes for consistent matching
            const file = parts[2].replace(/\\/g, '/');
            stats[file] = { added, deleted };
          }
        }
        return stats;
      } catch {
        return {};
      }
    };

    // Helper to normalize file paths for consistent matching across platforms
    const normalizePaths = (paths: string[]): string[] =>
      paths.map(p => p.replace(/\\/g, '/'));

    // Helper to get commits ahead of upstream (main/origin)
    const fetchAheadCount = async (workingDir: string): Promise<number> => {
      try {
        // Use native git command to avoid WSL issues on Windows
        const result = await invoke('get_git_ahead_count', { directory: workingDir }) as number;
        return result;
      } catch {
        return 0;
      }
    };

    // Silent refresh - doesn't show loading or clear current state
    const refreshGitStatus = async () => {
      if (!showFilesPanel || !isGitRepo || !currentSession?.workingDirectory) return;
      try {
        const status = await invoke('get_git_status', { directory: currentSession.workingDirectory }) as any;
        setGitStatus({
          modified: normalizePaths(status.modified || []),
          added: normalizePaths(status.added || []),
          deleted: normalizePaths(status.deleted || []),
          untracked: []
        });

        // Run git operations sequentially to avoid lock conflicts
        // Use native git commands to avoid WSL issues on Windows
        const branchResult = await invoke('get_git_branch', {
          directory: currentSession.workingDirectory
        }) as string;
        setGitBranch(branchResult);

        const lineStats = await fetchLineStats(currentSession.workingDirectory);
        setGitLineStats(lineStats);

        const aheadCount = await fetchAheadCount(currentSession.workingDirectory);
        setGitAhead(aheadCount);
      } catch (error) {
        console.error('Failed to refresh git status:', error);
        // Don't clear state on silent refresh failure
      }
    };

    // Initial load with loading state
    const loadGitStatus = async () => {
      if (!showFilesPanel || !isGitRepo || !currentSession?.workingDirectory) return;
      setGitLoading(true);
      try {
        const status = await invoke('get_git_status', { directory: currentSession.workingDirectory }) as any;
        setGitStatus({
          modified: normalizePaths(status.modified || []),
          added: normalizePaths(status.added || []),
          deleted: normalizePaths(status.deleted || []),
          untracked: []
        });

        // Run git operations sequentially to avoid lock conflicts
        // Use native git commands to avoid WSL issues on Windows
        const branchResult = await invoke('get_git_branch', {
          directory: currentSession.workingDirectory
        }) as string;
        setGitBranch(branchResult);

        const lineStats = await fetchLineStats(currentSession.workingDirectory);
        setGitLineStats(lineStats);

        const aheadCount = await fetchAheadCount(currentSession.workingDirectory);
        setGitAhead(aheadCount);
      } catch (error) {
        console.error('Failed to load git status:', error);
        setGitStatus(null);
        setGitBranch('');
        setGitLineStats({});
        setGitAhead(0);
      } finally {
        setGitLoading(false);
      }
    };

    // Load immediately when panel opens (with loading state)
    loadGitStatus();

    // Auto-refresh every 30 seconds while panel is open (silent, no loading state)
    let intervalId: ReturnType<typeof setInterval> | null = null;
    if (showFilesPanel && isGitRepo && currentSession?.workingDirectory) {
      intervalId = setInterval(refreshGitStatus, 30000);
    }

    return () => {
      if (intervalId) clearInterval(intervalId);
    };
  }, [showFilesPanel, isGitRepo, currentSession?.workingDirectory]);

  // Helper to get flat list of visible files from tree (for keyboard navigation)
  const getVisibleFiles = useCallback((items: any[], expanded: Set<string>): { path: string; isDirectory: boolean; hasGitChanges: boolean }[] => {
    const result: { path: string; isDirectory: boolean; hasGitChanges: boolean }[] = [];
    // Normalize path separators for cross-platform compatibility
    const workDir = (currentSession?.workingDirectory || '').replace(/\\/g, '/');

    const traverse = (nodes: any[]) => {
      for (const node of nodes) {
        const normalizedPath = node.path.replace(/\\/g, '/');
        const relativePath = normalizedPath.replace(workDir, '').replace(/^\//, '');
        const isModified = gitStatus?.modified.includes(relativePath) || false;
        const isAdded = gitStatus?.added.includes(relativePath) || false;
        const isDeleted = gitStatus?.deleted.includes(relativePath) || false;

        result.push({
          path: node.path,
          isDirectory: node.type === 'directory',
          hasGitChanges: isModified || isAdded || isDeleted
        });

        if (node.type === 'directory' && expanded.has(node.path) && node.children) {
          traverse(node.children);
        }
      }
    };

    traverse(items);
    return result;
  }, [currentSession?.workingDirectory, gitStatus]);

  // Get flat git file list for keyboard navigation
  const getGitFileList = useCallback((): string[] => {
    if (!gitStatus) return [];
    return [...gitStatus.modified, ...gitStatus.added, ...gitStatus.deleted];
  }, [gitStatus]);

  // Load file content when a file is selected in file browser
  const loadFileContent = useCallback(async (filePath: string, fullFile: boolean = false) => {
    setSelectedFile(filePath);

    // Check if file is a binary type
    const ext = filePath.split('.').pop()?.toLowerCase() || '';
    if (binaryExtensions.has(ext)) {
      setFileContent(`[Binary file: .${ext}]\n\nThis file type cannot be previewed.`);
      setFileLoading(false);
      setFileFullyLoaded(true);
      setFileTruncated(false);
      return;
    }

    setFileLoading(true);
    try {
      const isWindows = navigator.platform.toLowerCase().includes('win');
      const LINE_LIMIT = 400;

      let content: string;
      let isTruncated = false;

      try {
        if (fullFile) {
          // Load full file
          content = await invoke('execute_bash', {
            command: `cat "${filePath}"`,
            workingDir: currentSession?.workingDirectory
          }) as string;
        } else {
          // Load first N lines, check if there's more
          const headContent = await invoke('execute_bash', {
            command: `head -n ${LINE_LIMIT} "${filePath}"`,
            workingDir: currentSession?.workingDirectory
          }) as string;

          // Check if file has more lines
          const lineCount = await invoke('execute_bash', {
            command: `wc -l < "${filePath}"`,
            workingDir: currentSession?.workingDirectory
          }) as string;

          const totalLines = parseInt(lineCount.trim()) || 0;
          isTruncated = totalLines > LINE_LIMIT;
          content = headContent;
        }
      } catch {
        // Fallback for Windows or if head/wc fails
        if (isWindows) {
          const windowsPath = filePath.replace(/\//g, '\\');
          content = await invoke('execute_bash', {
            command: `type "${windowsPath}"`,
            workingDir: currentSession?.workingDirectory
          }) as string;
        } else {
          // Try full cat as fallback
          content = await invoke('execute_bash', {
            command: `cat "${filePath}"`,
            workingDir: currentSession?.workingDirectory
          }) as string;
        }
      }

      setFileContent(content);
      setFileFullyLoaded(fullFile || !isTruncated);
      setFileTruncated(isTruncated && !fullFile);
    } catch (error) {
      setFileContent(`Error loading file: ${error}`);
      setFileFullyLoaded(true);
      setFileTruncated(false);
    } finally {
      setFileLoading(false);
    }
  }, [currentSession?.workingDirectory]);

  // Load folder contents when expanded
  const loadFolderContents = useCallback(async (folderPath: string) => {
    try {
      const files = await invoke('get_folder_contents', {
        folderPath: folderPath,
        maxResults: 100
      }) as any[];
      return files;
    } catch (error) {
      console.error('Failed to load folder contents:', error);
      return [];
    }
  }, []);

  // Helper function to recursively update nested folder children
  const updateFolderChildren = (items: any[], folderPath: string, children: any[]): any[] => {
    return items.map(item => {
      if (item.path === folderPath) {
        return { ...item, children };
      }
      if (item.children) {
        return { ...item, children: updateFolderChildren(item.children, folderPath, children) };
      }
      return item;
    });
  };

  // Toggle folder expansion
  const toggleFolder = useCallback(async (folderPath: string) => {
    const newExpanded = new Set(expandedFolders);
    if (newExpanded.has(folderPath)) {
      newExpanded.delete(folderPath);
    } else {
      newExpanded.add(folderPath);
      // Load contents if not already loaded
      const contents = await loadFolderContents(folderPath);
      // Recursively update the folder's children in the tree
      setFileTree(prev => updateFolderChildren(prev, folderPath, contents));
    }
    setExpandedFolders(newExpanded);
  }, [expandedFolders, loadFolderContents]);

  // Parse git diff output into DiffHunk array
  const parseDiffOutput = useCallback((diffResult: string): DiffHunk[] => {
    const lines = diffResult.split('\n');
    const hunks: DiffHunk[] = [];
    let currentHunk: DiffHunk | null = null;
    let oldLineNum = 0;
    let newLineNum = 0;

    for (const line of lines) {
      if (line.startsWith('@@')) {
        // New hunk - parse both old and new line numbers: @@ -oldStart,oldCount +newStart,newCount @@
        const match = line.match(/@@ -(\d+)(?:,\d+)? \+(\d+)/);
        currentHunk = {
          startLine: match ? parseInt(match[1]) : 1,
          endLine: 0,
          lines: []
        };
        hunks.push(currentHunk);
        oldLineNum = match ? parseInt(match[1]) : 1;
        newLineNum = match ? parseInt(match[2]) : 1;
      } else if (currentHunk) {
        if (line.startsWith('+') && !line.startsWith('+++')) {
          currentHunk.lines.push({ type: 'add', content: line.substring(1), lineNumber: newLineNum++ });
        } else if (line.startsWith('-') && !line.startsWith('---')) {
          currentHunk.lines.push({ type: 'remove', content: line.substring(1), lineNumber: oldLineNum++ });
        } else if (!line.startsWith('diff ') && !line.startsWith('index ') && !line.startsWith('---') && !line.startsWith('+++')) {
          currentHunk.lines.push({ type: 'context', content: line.substring(1) || '', lineNumber: newLineNum++ });
          oldLineNum++; // Context lines exist in both old and new
        }
      }
    }
    return hunks;
  }, []);

  // Load git diff for a file
  const loadGitDiff = useCallback(async (filePath: string) => {
    setSelectedGitFile(filePath);
    setGitLoading(true);
    try {
      // Try staged changes first (--cached), then unstaged changes
      // This handles both newly added files (staged) and modified files (unstaged)
      // --ignore-cr-at-eol fixes Windows CRLF line ending issues
      const stagedDiff = await invoke('execute_bash', {
        command: `git diff --cached --ignore-cr-at-eol "${filePath}"`,
        workingDir: currentSession?.workingDirectory
      }) as string;

      const unstagedDiff = await invoke('execute_bash', {
        command: `git diff --ignore-cr-at-eol "${filePath}"`,
        workingDir: currentSession?.workingDirectory
      }) as string;

      // Parse both diffs
      const stagedHunks = parseDiffOutput(stagedDiff);
      const unstagedHunks = parseDiffOutput(unstagedDiff);

      // Combine hunks - prefer showing both staged and unstaged if they exist
      let hunks: DiffHunk[] = [];
      if (stagedHunks.length > 0 && unstagedHunks.length > 0) {
        // Both staged and unstaged changes exist - combine them
        hunks = [...stagedHunks, ...unstagedHunks];
      } else if (stagedHunks.length > 0) {
        hunks = stagedHunks;
      } else if (unstagedHunks.length > 0) {
        hunks = unstagedHunks;
      }

      setGitDiff({
        file: filePath,
        hunks: hunks.length > 0 ? hunks : [{ startLine: 1, endLine: 1, lines: [{ type: 'context', content: 'No changes' }] }]
      });
    } catch (error) {
      setGitDiff({
        file: filePath,
        hunks: [{ startLine: 1, endLine: 1, lines: [{ type: 'context', content: `Error: ${error}` }] }]
      });
    } finally {
      setGitLoading(false);
    }
  }, [currentSession?.workingDirectory, parseDiffOutput]);

  // Add effect to handle Ctrl+Arrow shortcuts at capture phase
  useEffect(() => {
    const handleGlobalKeyDown = (e: KeyboardEvent) => {
      // Only handle if textarea is focused
      if (document.activeElement !== inputRef.current) return;
      
      if ((e.ctrlKey || e.metaKey) && !e.shiftKey && !e.altKey) {
        if (e.key === 'ArrowLeft') {
          e.preventDefault();
          e.stopPropagation();
          if (inputRef.current) {
            inputRef.current.selectionStart = 0;
            inputRef.current.selectionEnd = 0;
          }
          return false;
        } else if (e.key === 'ArrowRight') {
          e.preventDefault();
          e.stopPropagation();
          if (inputRef.current) {
            const length = inputRef.current.value.length;
            inputRef.current.selectionStart = length;
            inputRef.current.selectionEnd = length;
          }
          return false;
        }
      }
    };
    
    // Use capture phase to intercept before browser default
    document.addEventListener('keydown', handleGlobalKeyDown, true);
    return () => document.removeEventListener('keydown', handleGlobalKeyDown, true);
  }, []);

  // Auto-focus input when typing anywhere with no input focused
  useEffect(() => {
    const handleGlobalTyping = (e: KeyboardEvent) => {
      // Skip if modifier keys (except shift for capitals)
      if (e.ctrlKey || e.metaKey || e.altKey) return;

      // Skip special keys
      if (e.key.length !== 1 && !['Backspace', 'Delete'].includes(e.key)) return;

      // Skip if any modal is open
      if (showStatsModal || showResumeModal || showAgentExecutor || showModelToolsModal) return;

      // Skip if user has text selected (they might be copying)
      const selection = window.getSelection();
      if (selection && selection.toString().length > 0) return;

      // Skip if already focused on an input/textarea/contenteditable
      const activeEl = document.activeElement;
      if (activeEl instanceof HTMLInputElement ||
          activeEl instanceof HTMLTextAreaElement ||
          (activeEl instanceof HTMLElement && activeEl.isContentEditable)) {
        return;
      }

      // Skip if inside a modal or dialog (DOM check as fallback)
      if (activeEl?.closest('[role="dialog"]') || activeEl?.closest('.modal') ||
          activeEl?.closest('.stats-modal-overlay') || activeEl?.closest('.resume-modal') ||
          activeEl?.closest('.mt-modal-overlay') || activeEl?.closest('.settings-modal-overlay') ||
          activeEl?.closest('.analytics-modal') || activeEl?.closest('.agents-modal') ||
          activeEl?.closest('.commands-modal')) return;

      // Skip if in a tool panel (file preview, git panel, etc.) - allow text selection there
      if (activeEl?.closest('.tool-panel') || activeEl?.closest('.tool-panel-preview-content')) return;

      // Focus the input and insert the character
      if (inputRef.current) {
        e.preventDefault();
        inputRef.current.focus();

        // Insert the typed character (skip for backspace/delete on empty)
        if (e.key.length === 1) {
          const currentValue = inputRef.current.value;
          const start = inputRef.current.selectionStart || 0;
          const end = inputRef.current.selectionEnd || 0;
          const newValue = currentValue.slice(0, start) + e.key + currentValue.slice(end);

          // Update state and position cursor after the inserted char
          setInput(newValue);

          // Detect command/bash mode from the new value
          if (isBashPrefix(newValue)) {
            setBashCommandMode(true);
          } else if (newValue.startsWith('/')) {
            // Set command trigger for visual styling
            setCommandTrigger(newValue);
          }

          requestAnimationFrame(() => {
            if (inputRef.current) {
              inputRef.current.selectionStart = inputRef.current.selectionEnd = start + 1;
            }
          });
        }
      }
    };

    document.addEventListener('keydown', handleGlobalTyping);
    return () => document.removeEventListener('keydown', handleGlobalTyping);
  }, [showStatsModal, showResumeModal, showAgentExecutor, showModelToolsModal, setBashCommandMode, setCommandTrigger]);

  // Stop dictation when component unmounts or session changes
  useEffect(() => {
    return () => {
      if (recognitionRef.current) {
        recognitionRef.current.stop();
        recognitionRef.current = null;
      }
    };
  }, [currentSessionId]);
  
  // Clean up pending followup if session changes
  useEffect(() => {
    if (pendingFollowupRef.current && pendingFollowupRef.current.sessionId !== currentSessionId) {
      console.log('[ClaudeChat] Cancelling pending followup due to session change');
      if (pendingFollowupRef.current.timeoutId) {
        clearTimeout(pendingFollowupRef.current.timeoutId);
      }
      pendingFollowupRef.current = null;
      setPendingFollowupMessage(null);
    }
  }, [currentSessionId]);

  // Cancel pending followup countdown when streaming ends or messages are received
  // IMPORTANT: Only handles messages with timeoutId (delayed countdown case).
  // The interrupt case (no timeoutId) is handled by the interruptSession().then() callback.
  useEffect(() => {
    // Only handle the countdown case (has timeoutId). Interrupt case handles itself.
    if (pendingFollowupRef.current &&
        pendingFollowupRef.current.sessionId === currentSessionId &&
        pendingFollowupRef.current.timeoutId) {
      const session = sessions.find(s => s.id === currentSessionId);

      // Check if streaming has ended or if we have received messages/results
      const hasAssistantResponse = session?.messages?.some(m => m.type === 'assistant') || false;
      const isStreamingEnded = !session?.streaming;
      const hasRecentResult = session?.messages?.some(m =>
        m.type === 'result' &&
        Date.now() - (m.timestamp || 0) < 5000 // Result received within last 5 seconds
      ) || false;

      if (isStreamingEnded || hasAssistantResponse || hasRecentResult) {
        console.log('[ClaudeChat] Streaming ended or messages received - cancelling waiting countdown and sending immediately');
        console.log(`[ClaudeChat] Debug: isStreamingEnded=${isStreamingEnded}, hasAssistantResponse=${hasAssistantResponse}, hasRecentResult=${hasRecentResult}`);

        // Cancel the timeout
        clearTimeout(pendingFollowupRef.current.timeoutId);

        // Send the message immediately
        const pendingMessage = pendingFollowupRef.current;
        pendingFollowupRef.current = null;
        setPendingFollowupMessage(null);

        // Send the delayed message now
        handleDelayedSend(
          pendingMessage.content,
          pendingMessage.attachments,
          pendingMessage.sessionId
        ).catch(error => {
          console.error('[ClaudeChat] Failed to send message immediately after streaming ended:', error);
        });
      }
    }
  }, [currentSessionId, currentSession?.streaming, currentSession?.messages?.length, sessions]);
  
  useEffect(() => {
    // Only load draft when actually switching to a different session
    // Don't reload if it's the same session (prevents losing typed text)
    if (prevSessionIdRef.current !== currentSessionId) {
      console.log('[ClaudeChat] Session changed:', { 
        from: prevSessionIdRef.current,
        to: currentSessionId,
        hasDraft: !!(currentSession?.draftInput),
        workingDir: currentSession?.workingDirectory 
      });
      
      prevSessionIdRef.current = currentSessionId;
      inputRef.current?.focus();
      
      if (currentSession) {
        setInput(currentSession.draftInput || '');
        setAttachments(currentSession.draftAttachments || []);
      } else {
        setInput('');
        setAttachments([]);
      }
    }
  }, [currentSessionId, currentSession?.draftInput, currentSession?.draftAttachments]); // Include draft values to ensure proper loading

  // Save drafts when input or attachments change
  useEffect(() => {
    if (currentSessionId && prevSessionIdRef.current === currentSessionId) {
      // Only save if we're still on the same session (not switching)
      const timeoutId = setTimeout(() => {
        updateSessionDraft(currentSessionId, input, attachments);
      }, 300); // Reduced debounce for faster saving
      return () => clearTimeout(timeoutId);
    }
  }, [input, attachments, currentSessionId, updateSessionDraft]);

  // Restore per-session textarea height when switching tabs or input changes
  useEffect(() => {
    if (inputRef.current && currentSessionId) {
      // Recalculate height based on actual content
      requestAnimationFrame(() => {
        if (inputRef.current) {
          // Reset to auto to get true scrollHeight
          inputRef.current.style.height = 'auto';
          const scrollHeight = inputRef.current.scrollHeight;
          const newHeight = Math.min(Math.max(scrollHeight, 44), 106);
          inputRef.current.style.height = `${newHeight}px`;
          inputRef.current.style.overflow = scrollHeight > 106 ? 'auto' : 'hidden';
          overlayHeightRef.current = newHeight;
          // Sync scroll position (CSS handles height via inset positioning)
          if (inputOverlayRef.current && inputRef.current) {
            inputOverlayRef.current.scrollTop = inputRef.current.scrollTop;
          }
        }
      });
    }
  }, [currentSessionId, input]);

  // Focus maintenance during streaming - disabled to allow text selection
  // The aggressive refocus was preventing users from selecting text while agent is active

  // Helper function to handle delayed sends
  const handleDelayedSend = async (content: string, attachments: Attachment[], sessionId: string, isBash = false) => {
    try {
      // Check if session is read-only before sending
      const targetSession = sessions.find(s => s.id === sessionId);
      if (targetSession?.readOnly) {
        console.log('[ClaudeChat] Cannot send delayed message - session is read-only');
        setPendingFollowupMessage(null);
        return;
      }
      
      // Build message content with attachments
      let messageContent = content;
      if (attachments.length > 0) {
        const contentBlocks = [];
        
        // Add all attachments as content blocks
        for (const attachment of attachments) {
          if (attachment.type === 'image') {
            contentBlocks.push({
              type: 'image',
              source: {
                type: 'base64',
                media_type: attachment.content.startsWith('data:image/png') ? 'image/png' : 'image/jpeg',
                data: attachment.content.split(',')[1]
              }
            });
          } else if (attachment.type === 'text') {
            // Include text attachments as part of the message
            contentBlocks.push({
              type: 'text',
              text: `[Attached text]:\n${attachment.content}`
            });
          }
        }
        
        // Add the main message text
        if (content.trim()) {
          contentBlocks.push({ type: 'text', text: content });
        }
        
        messageContent = JSON.stringify(contentBlocks);
      }
      
      // Clear drafts after sending
      updateSessionDraft(sessionId, '', []);
      
      // Track when streaming starts for this session
      // Don't clear if already streaming - preserve the tracking
      const session = sessions.find(s => s.id === sessionId);
      const isFirstMessage = !session?.messages?.some(m => m.type === 'user');
      if ((isFirstMessage || !streamingStartTimeRef.current[sessionId]) && !session?.streaming) {
        streamingStartTimeRef.current[sessionId] = Date.now();
        console.log('[ClaudeChat] Recording streaming start time for delayed send (first message):', sessionId);
      }
      
      await sendMessage(messageContent, isBash);

      // Clear pending message on success
      setPendingFollowupMessage(null);
      
      // Mark as at bottom and force scroll after sending message
      setIsAtBottom(prev => ({
        ...prev,
        [sessionId]: true
      }));

      // Force scroll to bottom with the helper (user sent a message)
      requestAnimationFrame(() => {
        forceScrollToBottomHelper('auto');
      });
    } catch (error) {
      console.error('[ClaudeChat] Failed to send delayed message:', error);
      setPendingFollowupMessage(null);
      
      // Restore the input on error
      setInput(content);
      setAttachments(attachments);
    }
  };

  const handleSend = async () => {
    console.log('[ClaudeChat] handleSend called', { 
      input: input.slice(0, 50), 
      attachments: attachments.length,
      streaming: currentSession?.streaming,
      sessionId: currentSessionId,
      bashCommandMode,
      streamingStartTime: streamingStartTimeRef.current[currentSessionId || ''],
      readOnly: currentSession?.readOnly
    });
    
    // Prevent sending messages if session is read-only
    if (currentSession?.readOnly) {
      console.log('[ClaudeChat] Cannot send message - session is read-only');
      return;
    }
    
    // Allow sending messages during streaming (they'll be queued)
    if (!input.trim() && attachments.length === 0) return;
    
    // Check if we need to delay this message (followup sent too soon after streaming started)
    // This prevents session crashes when sending followup messages too quickly
    if (currentSession?.streaming && currentSessionId) {
      // Check if we have at least one assistant message with content - if not, we can't safely interrupt
      // The session isn't established until Claude sends at least some response
      const hasAssistantResponse = currentSession.messages.some(m => 
        m.type === 'assistant' && m.content && m.content.length > 0
      );
      const streamingStartTime = streamingStartTimeRef.current[currentSessionId];
      
      // If we already have an assistant response, we can send immediately - no need to wait
      if (!hasAssistantResponse) {
        // No assistant response yet - must wait for Claude to establish session
        const effectiveStartTime = streamingStartTime || Date.now();
        const timeSinceStart = Date.now() - effectiveStartTime;
        const SAFE_DELAY = 10000; // 10 seconds - wait for Claude to establish session and respond
        
        if (timeSinceStart < SAFE_DELAY) {
          const remainingDelay = SAFE_DELAY - timeSinceStart;
          console.log(`[ClaudeChat] Waiting for Claude to establish session - delaying ${remainingDelay}ms`);
          
          // Clear any existing pending followup
          if (pendingFollowupRef.current?.timeoutId) {
            clearTimeout(pendingFollowupRef.current.timeoutId);
          }
          
          // Store the message to send later
          const messageToSend = input;
          const attachmentsToSend = [...attachments];

          // Clear input immediately to show user we got their message
          setInput('');
          setAttachments([]);
          if (inputRef.current) {
            inputRef.current.style.height = '44px';
            inputRef.current.style.overflow = 'hidden';
          }

          // Add to message history
          if (input.trim() && currentSessionId) {
            setMessageHistory(prev => ({
              ...prev,
              [currentSessionId]: [...(prev[currentSessionId] || []).filter(m => m !== input), input].slice(-50)
            }));
            setHistoryIndex(-1);
          }

          // Schedule the actual send with countdown
          let countdownActive = true;
          const updateCountdown = () => {
            if (!countdownActive) return; // Stop if countdown was cancelled
            const remaining = SAFE_DELAY - (Date.now() - effectiveStartTime);
            if (remaining > 0 && pendingFollowupRef.current) {
              setPendingFollowupMessage(`waiting for claude to respond (${Math.ceil(remaining / 1000)}s)...`);
              setTimeout(updateCountdown, 500);
            } else {
              setPendingFollowupMessage(null);
            }
          };

          // Start countdown updates
          setTimeout(updateCountdown, 500);

          // Schedule the actual send
          const timeoutId = setTimeout(() => {
            console.log('[ClaudeChat] Sending delayed followup message now');
            countdownActive = false; // Stop countdown updates
            pendingFollowupRef.current = null;
            setPendingFollowupMessage(null); // Clear immediately before sending
            // Call handleDelayedSend - it will also clear the pending message
            handleDelayedSend(messageToSend, attachmentsToSend, currentSessionId);
          }, remainingDelay);

          // Set the pending ref FIRST before showing the indicator
          // This ensures the preview component has data when it renders
          pendingFollowupRef.current = {
            sessionId: currentSessionId,
            content: messageToSend,
            attachments: attachmentsToSend,
            timeoutId
          };

          // Show pending indicator AFTER setting the ref
          // This ensures pendingFollowupRef.current is populated when the component renders
          setPendingFollowupMessage(`waiting for claude to respond (${Math.ceil(remainingDelay / 1000)}s)...`);

          return;
        }
      } else if (hasAssistantResponse) {
        // We have an assistant response - safe to interrupt and send immediately
        console.log('[ClaudeChat] Interrupting stream to send new message (session established)');
        
        // Store the message content before clearing
        const messageToSend = input;
        const attachmentsToSend = [...attachments];
        const bashMode = bashCommandMode;
        
        // Store the pending message in ref to preserve it during interrupt
        pendingFollowupRef.current = {
          sessionId: currentSessionId,
          content: messageToSend,
          attachments: attachmentsToSend
        };
        setPendingFollowupMessage('sending followup after interrupt...');
        
        // Clear input immediately
        setInput('');
        setAttachments([]);
        setBashCommandMode(false);
        if (inputRef.current) {
          inputRef.current.style.height = '44px';
          inputRef.current.style.overflow = 'hidden';
        }
        
        // Immediately set streaming state to show thinking indicator
        useClaudeCodeStore.setState(state => ({
          sessions: state.sessions.map(s => 
            s.id === currentSessionId 
              ? { ...s, streaming: true, thinkingStartTime: Date.now() } 
              : s
          )
        }))
        
        // Add to message history
        if (messageToSend.trim() && currentSessionId) {
          setMessageHistory(prev => ({
            ...prev,
            [currentSessionId]: [...(prev[currentSessionId] || []).filter(m => m !== messageToSend), messageToSend].slice(-50)
          }));
          setHistoryIndex(-1);
        }
        
        // Interrupt and then send
        interruptSession().then(async () => {
          // Small delay to ensure interrupt is processed
          await new Promise(resolve => setTimeout(resolve, 500));
          
          // Check if we still have the pending message for this session
          if (pendingFollowupRef.current && pendingFollowupRef.current.sessionId === currentSessionId) {
            try {
              await handleDelayedSend(
                pendingFollowupRef.current.content, 
                pendingFollowupRef.current.attachments, 
                currentSessionId,
                bashMode
              );
              pendingFollowupRef.current = null;
              setPendingFollowupMessage(null);
            } catch (error) {
              console.error('[ClaudeChat] Failed to send followup after interrupt:', error);
              setPendingFollowupMessage(null);
              pendingFollowupRef.current = null;
              
              // Restore the input if send failed
              setInput(messageToSend);
              setAttachments(attachmentsToSend);
              setBashCommandMode(bashMode);
            }
          } else {
            setPendingFollowupMessage(null);
          }
        }).catch(error => {
          console.error('[ClaudeChat] Failed to interrupt:', error);
          setPendingFollowupMessage(null);
          pendingFollowupRef.current = null;
          
          // Restore the input if interrupt failed
          setInput(messageToSend);
          setAttachments(attachmentsToSend);
          setBashCommandMode(bashMode);
        });
        
        return;
      }
    }
    
    // Check for bash mode command (starts with $)
    console.log('[ClaudeChat] Checking bash mode:', { bashCommandMode, startsWithBashPrefix: isBashPrefix(input), input: input.slice(0, 20) });
    if (bashCommandMode && isBashPrefix(input)) {
      let bashCommand = input.slice(1).trim(); // Remove the $ prefix
      const originalCommand = bashCommand; // Store original for display
      
      // Set userBashRunning to true when executing user bash command
      useClaudeCodeStore.setState(state => ({
        sessions: state.sessions.map(s => 
          s.id === currentSessionId ? { ...s, userBashRunning: true } : s
        )
      }));
      
      
      if (bashCommand) {
        console.log('[ClaudeChat] Executing bash command:', bashCommand);
        
        // Add the command to the messages as a user message with proper structure
        const commandMessage = {
          id: `bash-cmd-${Date.now()}`,
          type: 'user' as const,
          message: { content: `$${originalCommand}` }, // Show original input
          timestamp: Date.now()
        };
        
        // Add to session messages
        if (currentSessionId) {
          addMessageToSession(currentSessionId, commandMessage);
        }
        
        // Add to message history for up/down navigation
        if (input.trim() && currentSessionId) {
          setMessageHistory(prev => ({
            ...prev,
            [currentSessionId]: [...(prev[currentSessionId] || []).filter(m => m !== input), input].slice(-50) // Keep last 50 messages
          }));
          setHistoryIndex(-1); // Reset history navigation
        }
        
        // Clear input and reset bash mode
        setInput('');
        setBashCommandMode(false);
        if (inputRef.current) {
          inputRef.current.style.height = '44px';
          inputRef.current.style.overflow = 'hidden';
        }
        
        try {
          // Execute bash command directly via Tauri - NOT through AI
          console.log('[ClaudeChat] Executing bash command directly:', bashCommand);

          const result = await invoke('execute_bash', {
            command: bashCommand,
            workingDir: currentSession?.workingDirectory
          }) as string;

          // Add result as assistant message
          const resultMessage = {
            id: `bash-${Date.now()}`,
            type: 'assistant' as const,
            message: { content: result || '(no output)' },
            timestamp: Date.now(),
            streaming: false
          };

          if (currentSessionId) {
            addMessageToSession(currentSessionId, resultMessage);
          }

          // Focus restoration
          if (navigator.platform.includes('Win') && inputRef.current) {
            setTimeout(() => {
              inputRef.current?.focus();
            }, 100);
          }

          // Clear userBashRunning flag
          useClaudeCodeStore.setState(state => ({
            sessions: state.sessions.map(s =>
              s.id === currentSessionId
                ? { ...s, userBashRunning: false }
                : s
            )
          }));

        } catch (error) {
          console.error('[ClaudeChat] Bash command failed:', error);

          // Add error as assistant message
          const errorMessage = {
            id: `bash-${Date.now()}`,
            type: 'assistant' as const,
            message: { content: `Error: ${error instanceof Error ? error.message : String(error)}` },
            timestamp: Date.now(),
            streaming: false
          };

          if (currentSessionId) {
            addMessageToSession(currentSessionId, errorMessage);
          }

          // Clear userBashRunning flag on error
          useClaudeCodeStore.setState(state => ({
            sessions: state.sessions.map(s =>
              s.id === currentSessionId ? { ...s, userBashRunning: false, bashProcessId: undefined } : s
            )
          }));
        }
        
        return;
      }
    }
    
    // Check for slash commands and special inputs
    const trimmedInput = input.trim();
    console.log('[ClaudeChat] Checking slash commands, input:', trimmedInput, 'bashCommandMode:', bashCommandMode);
    
    if (trimmedInput === '/clear') {
      if (currentSession?.streaming) return; // Ignore during streaming
      console.log('[ClaudeChat] Clearing context for session:', currentSessionId);
      setInput('');
      handleClearContextRequest();
      return;
    } else if (trimmedInput === '/compact') {
      if (currentSession?.streaming) return; // Ignore during streaming
      // Falls through to send /compact to Claude CLI
    } else if (trimmedInput === '/model' || trimmedInput.startsWith('/model ')) {
      console.log('[ClaudeChat] Detected /model command - opening modal');
      setModelToolsOpenedViaKeyboard(false);
      setShowModelToolsModal(true);
      setInput('');
      // Reset textarea height
      if (inputRef.current) {
        inputRef.current.style.height = '44px';
        inputRef.current.style.overflow = 'hidden';
      }
      return;
    } else if (trimmedInput.startsWith('/title ')) {
      // Handle /title command - set tab title manually
      const newTitle = trimmedInput.slice(7).trim(); // Remove '/title ' prefix
      if (newTitle && currentSessionId) {
        renameSession(currentSessionId, newTitle);
      }
      setInput('');
      // Reset textarea height
      if (inputRef.current) {
        inputRef.current.style.height = '44px';
        inputRef.current.style.overflow = 'hidden';
      }
      return;
    } else if (trimmedInput.startsWith('/') && !trimmedInput.includes(' ')) {
      // Block invalid slash commands (just "/" or "/invalid" with no args)
      // Valid commands either have a space after them (args) or are known commands above
      // Check if this is a known plugin/custom command
      const baseCommand = trimmedInput.split(' ')[0];
      const commandName = baseCommand.slice(1); // Remove leading /
      const knownBuiltIn = ['/clear', '/compact', '/model', '/title', '/init'].includes(baseCommand);
      const customCommands = getCachedCustomCommands() || [];
      const isCustom = customCommands.some((cmd: any) => {
        const trigger = cmd.name.startsWith('/') ? cmd.name : '/' + cmd.name;
        return trigger === baseCommand && cmd.enabled;
      });
      // Check plugin commands (both short and full names)
      const pluginCommands = pluginService.getEnabledPluginCommands();
      const isPlugin = pluginCommands.some((cmd: any) => {
        const shortName = cmd.name.includes('--') ? cmd.name.split('--')[1] : cmd.name;
        return shortName === commandName || cmd.name === commandName;
      });

      if (!knownBuiltIn && !isCustom && !isPlugin) {
        // Not a known command - don't send, just clear
        console.log('[ClaudeChat] Blocking invalid slash command:', trimmedInput);
        setInput('');
        if (inputRef.current) {
          inputRef.current.style.height = '44px';
          inputRef.current.style.overflow = 'hidden';
        }
        return;
      }
    }

    try {
      // Don't create a new session here - sessions should only be created via the new tab button
      if (!currentSessionId) {
        console.error('[ClaudeChat] No active session - please create a new session first');
        return;
      }
      
      // Build message content with attachments
      let messageContent = input;
      if (attachments.length > 0) {
        const contentBlocks = [];
        
        // Add all attachments as content blocks
        for (const attachment of attachments) {
          if (attachment.type === 'image') {
            contentBlocks.push({
              type: 'image',
              source: {
                type: 'base64',
                media_type: attachment.content.startsWith('data:image/png') ? 'image/png' : 'image/jpeg',
                data: attachment.content.split(',')[1]
              }
            });
          } else if (attachment.type === 'text') {
            // Include text attachments as part of the message
            contentBlocks.push({
              type: 'text',
              text: `[Attached text]:\n${attachment.content}`
            });
          }
        }
        
        // Add the main message text
        if (input.trim()) {
          contentBlocks.push({ type: 'text', text: input });
        }
        
        messageContent = JSON.stringify(contentBlocks);
      }
      
      // Add to message history for this session (only text, not attachments)
      if (input.trim() && currentSessionId) {
        setMessageHistory(prev => ({
          ...prev,
          [currentSessionId]: [...(prev[currentSessionId] || []).filter(m => m !== input), input].slice(-50) // Keep last 50 messages
        }));
        setHistoryIndex(-1); // Reset history navigation
      }
      
      console.log('[ClaudeChat] Sending message:', { 
        sessionId: currentSessionId,
        messageLength: messageContent.length,
        hasAttachments: attachments.length > 0
      });
      
      setInput('');
      setAttachments([]);
      // Reset textarea height to minimum after sending
      if (inputRef.current) {
        inputRef.current.style.height = '44px'; // Reset to min-height
        inputRef.current.style.overflow = 'hidden';
      }
      // Reset per-session textarea height
      setTextareaHeights(prev => ({ ...prev, [currentSessionId]: 44 }));
      // Clear drafts after sending
      updateSessionDraft(currentSessionId, '', []);
      // Track when streaming starts for this session (for first message of a fresh session)
      // This helps prevent followup crashes when session is just starting
      // Don't clear if already streaming - preserve the tracking
      const isFirstMessage = !currentSession?.messages?.some(m => m.type === 'user');
      if ((isFirstMessage || !streamingStartTimeRef.current[currentSessionId]) && !currentSession?.streaming) {
        streamingStartTimeRef.current[currentSessionId] = Date.now();
        console.log('[ClaudeChat] Recording streaming start time for session (first message):', currentSessionId);
      }
      
      await sendMessage(messageContent, bashCommandMode);
      
      // Mark as at bottom and force scroll after sending message
      if (currentSessionId) {
        setIsAtBottom(prev => ({
          ...prev,
          [currentSessionId]: true
        }));
      }

      // Force scroll to bottom with the helper (user sent a message)
      requestAnimationFrame(() => {
        forceScrollToBottomHelper('auto');
      });
    } catch (error) {
      console.error('[ClaudeChat] Failed to send message:', error);
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    const textarea = e.currentTarget;
    const cursorPos = textarea.selectionStart;
    
    // Handle Ctrl+W to close current tab (with interrupt if streaming)
    if ((e.ctrlKey || e.metaKey) && e.key === 'w') {
      e.preventDefault();
      e.stopPropagation();
      
      if (currentSessionId) {
        // If streaming, interrupt first then close
        if (currentSession?.streaming) {
          console.log('[ClaudeChat] Interrupting stream before closing tab');
          interruptSession(currentSessionId).then(() => {  // Pass explicit session ID
            deleteSession(currentSessionId);
          });
        } else {
          deleteSession(currentSessionId);
        }
      }
      return;
    }
    
    // If mention or command autocomplete is open, let it handle arrow keys and tab
    if ((mentionTrigger !== null || commandTrigger) && (e.key === 'ArrowUp' || e.key === 'ArrowDown' || e.key === 'Tab')) {
      return; // Let the autocomplete component handle these
    }
    
    if (e.key === 'Escape' && (mentionTrigger !== null || commandTrigger)) {
      e.preventDefault();
      setMentionTrigger(null);
      setCommandTrigger(null);
      return;
    }

    if (e.key === 'Enter' && !e.shiftKey) {
      // Don't send if autocomplete is open - let autocomplete handle it
      if (mentionTrigger !== null || commandTrigger !== null) {
        return;
      }
      e.preventDefault();
      handleSend();
    } else if ((e.ctrlKey || e.metaKey) && e.key === 'u') {
      // Clear entire input when textarea is focused
      e.preventDefault();
      setInput('');
    } else if ((e.ctrlKey || e.metaKey) && e.key === 'ArrowLeft') {
      // Override default word navigation - go to start
      e.preventDefault();
      textarea.selectionStart = 0;
      textarea.selectionEnd = 0;
      return false;
    } else if ((e.ctrlKey || e.metaKey) && e.key === 'ArrowRight') {
      // Override default word navigation - go to end
      e.preventDefault();
      textarea.selectionStart = textarea.value.length;
      textarea.selectionEnd = textarea.value.length;
      return false;
    } else if (e.key === 'ArrowUp') {
      // Only navigate history if cursor is at the beginning of the text
      if (cursorPos === 0 && textarea.selectionEnd === 0 && currentSessionId) {
        e.preventDefault();

        const sessionHistory = messageHistory[currentSessionId] || [];

        // Navigate up in history
        if (historyIndex < sessionHistory.length - 1) {
          // Save current input as draft when first entering history mode
          if (historyIndex === -1) {
            setDraftMessage(prev => ({ ...prev, [currentSessionId]: input }));
          }
          const newIndex = historyIndex + 1;
          setHistoryIndex(newIndex);
          const historyValue = sessionHistory[sessionHistory.length - 1 - newIndex];
          setInput(historyValue);
          // Update bash mode if retrieved command starts with $
          setBashCommandMode(isBashPrefix(historyValue));
        }
      }
    } else if (e.key === 'ArrowDown') {
      // Only navigate history if we're in history navigation mode
      if (historyIndex >= 0 && currentSessionId) {
        const lines = input.split('\n');
        const currentLine = input.substring(0, cursorPos).split('\n').length - 1;
        const isOnLastLine = currentLine === lines.length - 1;
        
        // Only navigate if cursor is on the last line
        if (isOnLastLine) {
          e.preventDefault();
          
          const sessionHistory = messageHistory[currentSessionId] || [];
          
          if (historyIndex > 0) {
            const newIndex = historyIndex - 1;
            setHistoryIndex(newIndex);
            const historyValue = sessionHistory[sessionHistory.length - 1 - newIndex];
            setInput(historyValue);
            // Update bash mode if retrieved command starts with $
            setBashCommandMode(isBashPrefix(historyValue));
          } else if (historyIndex === 0) {
            // Return to the draft message
            setHistoryIndex(-1);
            const draft = draftMessage[currentSessionId] || '';
            setInput(draft);
            setBashCommandMode(isBashPrefix(draft));
          }
        }
      }
    }
  };

  // Handle paste event for images
  const handlePaste = async (e: React.ClipboardEvent) => {
    const items = e.clipboardData.items;
    const text = e.clipboardData.getData('text/plain');

    // Check if at bottom before paste (to scroll after if needed)
    const wasAtBottom = currentSessionId ? isAtBottom[currentSessionId] !== false : true;

    // Helper to scroll after attachment added
    const scrollAfterAttachment = () => {
      if (wasAtBottom) {
        requestAnimationFrame(() => scrollToBottomHelper('auto'));
      }
    };

    // Handle text paste - only create attachment if it's substantial text (5+ lines AND 512+ bytes)
    const lines = text.split('\n').length;
    const bytes = new Blob([text]).size;
    if (text && lines >= 5 && bytes > 512 && !text.startsWith('http')) {
      e.preventDefault();
      const newAttachment: Attachment = {
        id: Math.random().toString(36).substr(2, 9),
        type: 'text',
        name: `text_${Date.now()}.txt`,
        content: text,
        preview: `${lines} lines, ${formatBytes(bytes)}`
      };
      setAttachments(prev => [...prev, newAttachment]);
      scrollAfterAttachment();
      return;
    }

    // Handle image paste
    for (let i = 0; i < items.length; i++) {
      const item = items[i];
      if (item.type.indexOf('image') !== -1) {
        const blob = item.getAsFile();
        if (blob && attachments.length < 10) {
          const reader = new FileReader();
          reader.onload = (event) => {
            const dataUrl = event.target?.result as string;
            const newAttachment: Attachment = {
              id: Math.random().toString(36).substr(2, 9),
              type: 'image',
              name: blob.name || `image_${Date.now()}.png`,
              size: blob.size,
              content: dataUrl,
              preview: 'Image'
            };
            setAttachments(prev => [...prev, newAttachment]);
            scrollAfterAttachment();
          };
          reader.readAsDataURL(blob);
        }
      }
    }
  };

  // Handle drag and drop
  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    // Only show drag state for actual file drops
    if (e.dataTransfer.types.includes('Files')) {
      setIsDragging(true);
    }
  };

  const handleDragLeave = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
  };

  const handleDrop = async (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(false);
    
    console.log('Chat drop event:', e.dataTransfer);
    
    // Helper function to convert Windows path to WSL path
    const convertToWSLPath = (path: string): string => {
      if (path.match(/^[A-Z]:\\/)) {
        const driveLetter = path[0].toLowerCase();
        const pathWithoutDrive = path.substring(2).replace(/\\/g, '/');
        return `/mnt/${driveLetter}${pathWithoutDrive}`;
      }
      return path;
    };
    
    const files = Array.from(e.dataTransfer.files);
    
    // First check if any files are images - if so, attach them as base64
    const hasImages = files.some(file => file.type.startsWith('image/'));
    if (hasImages) {
      for (const file of files) {
        if (attachments.length >= 10) break;
        
        if (file.type.startsWith('image/')) {
          // Handle image files - convert to base64 for inline viewing
          const reader = new FileReader();
          reader.onload = (event) => {
            const dataUrl = event.target?.result as string;
            const newAttachment: Attachment = {
              id: Math.random().toString(36).substr(2, 9),
              type: 'image',
              name: file.name,
              size: file.size,
              content: dataUrl,
              preview: 'Image'
            };
            setAttachments(prev => [...prev, newAttachment]);
          };
          reader.readAsDataURL(file);
        }
      }
      return; // Exit early if we handled images
    }
    
    // Try to detect folders using webkitGetAsEntry
    const items = Array.from(e.dataTransfer.items);
    for (const item of items) {
      if (item.kind === 'file') {
        const entry = (item as any).webkitGetAsEntry?.();
        if (entry) {
          console.log('Entry:', entry.name, 'isDirectory:', entry.isDirectory, 'fullPath:', entry.fullPath);
          
          // If it's a directory, get the file to access its path
          if (entry.isDirectory) {
            const file = item.getAsFile();
            const path = (file as any)?.path;
            if (path) {
              const wslPath = convertToWSLPath(path);
              console.log('Creating session for folder:', path, '->', wslPath);
              const sessionName = path.split(/[/\\]/).pop() || 'new session';

              // Add to recent projects
              const newProject = { path: wslPath, name: sessionName, lastOpened: Date.now(), accessCount: 1 };
              const stored = localStorage.getItem(RECENT_PROJECTS_KEY);
              let recentProjects = [];
              try {
                if (stored) {
                  recentProjects = JSON.parse(stored);
                }
              } catch (err) {
                console.error('Failed to parse recent projects:', err);
              }
              const updated = [
                newProject,
                ...recentProjects.filter((p: any) => p.path !== wslPath)
              ].slice(0, 10);
              localStorage.setItem(RECENT_PROJECTS_KEY, JSON.stringify(updated));

              await createSession(sessionName, wslPath);
              return;
            }
          } else {
            // It's a file - check if it's an image first (shouldn't reach here due to early return above)
            const file = item.getAsFile();
            if (file && file.type.startsWith('image/') && attachments.length < 10) {
              // Handle as image attachment
              const reader = new FileReader();
              reader.onload = (event) => {
                const dataUrl = event.target?.result as string;
                const newAttachment: Attachment = {
                  id: Math.random().toString(36).substr(2, 9),
                  type: 'image',
                  name: file.name,
                  size: file.size,
                  content: dataUrl,
                  preview: 'Image'
                };
                setAttachments(prev => [...prev, newAttachment]);
              };
              reader.readAsDataURL(file);
              return;
            }
            
            // Not an image - insert path into input
            const path = (file as any)?.path;
            if (path) {
              const wslPath = convertToWSLPath(path);
              console.log('Inserting file path:', path, '->', wslPath);
              setInput(prev => prev + (prev ? ' ' : '') + wslPath);
              return;
            }
          }
        }
      }
    }
    
    // Fallback: Check files array (for browsers that don't support webkitGetAsEntry)
    if (files.length === 1) {
      const file = files[0];
      const path = (file as any).path;
      
      if (path) {
        // Check if it's likely a folder (no extension, or type is empty)
        const hasExtension = file.name.includes('.') && file.name.lastIndexOf('.') > 0;
        const isLikelyFolder = !hasExtension && file.type === '';
        
        if (isLikelyFolder) {
          const wslPath = convertToWSLPath(path);
          console.log('Creating session for folder (fallback):', path, '->', wslPath);
          const sessionName = path.split(/[/\\]/).pop() || 'new session';
          await createSession(sessionName, wslPath);
          return;
        } else {
          // It's a file - insert path into input
          const wslPath = convertToWSLPath(path);
          console.log('Inserting file path (fallback):', path, '->', wslPath);
          setInput(prev => prev + (prev ? ' ' : '') + wslPath);
          return;
        }
      }
    }
    
    // Handle multiple file drops - insert all paths
    if (files.length > 1) {
      const paths = files
        .map(file => (file as any).path)
        .filter(Boolean)
        .map(convertToWSLPath);
      
      if (paths.length > 0) {
        console.log('Inserting multiple file paths:', paths);
        setInput(prev => prev + (prev ? ' ' : '') + paths.join(' '));
        return;
      }
    }
    
    // If no path available, handle as attachment (text files only, images already handled above)
    for (const file of files) {
      if (attachments.length >= 10) break;
      
      if (file.type.startsWith('text/')) {
        // Handle text files
        const reader = new FileReader();
        reader.onload = (event) => {
          const text = event.target?.result as string;
          const lines = text.split('\n').length;
          const bytes = file.size;
          const newAttachment: Attachment = {
            id: Math.random().toString(36).substr(2, 9),
            type: 'text',
            name: file.name,
            size: file.size,
            content: text,
            preview: `${lines} lines, ${formatBytes(bytes)}`
          };
          setAttachments(prev => [...prev, newAttachment]);
        };
        reader.readAsText(file);
      }
    }
  };

  const removeAttachment = (id: string) => {
    setAttachments(prev => prev.filter(att => att.id !== id));
  };

  // Handle mention selection
  const handleMentionSelect = (replacement: string, start: number, end: number) => {
    const newValue = input.substring(0, start) + replacement + input.substring(end);
    setInput(newValue);
    setMentionTrigger(null);
    
    // Focus back on the input and set cursor after the replacement
    if (inputRef.current) {
      inputRef.current.focus();
      const newCursorPos = start + replacement.length;
      setTimeout(() => {
        if (inputRef.current) {
          inputRef.current.selectionStart = inputRef.current.selectionEnd = newCursorPos;
        }
      }, 0);
    }
  };

  // Handle command selection
  const handleCommandSelect = (replacement: string, start: number, end: number, submitAfter: boolean = false) => {
    // Check if this is a command we handle locally
    const command = replacement.trim();
    
    if (command === '/clear') {
      // Handle clear command locally with confirmation
      setInput('');
      setCommandTrigger(null);
      handleClearContextRequest();
    } else if (command === '/model') {
      // Handle model command locally - open model & tools modal
      setInput('');
      setCommandTrigger(null);
      setModelToolsOpenedViaKeyboard(false);
      setShowModelToolsModal(true);
    } else if (command.startsWith('/title ') || command === '/title') {
      // Handle title command locally - set tab title manually
      setInput('');
      setCommandTrigger(null);
      const newTitle = command.slice(7).trim(); // Remove '/title ' prefix
      if (newTitle && currentSessionId) {
        renameSession(currentSessionId, newTitle);
      }
    } else {
      // Check if this is a custom command (using cached version to avoid JSON.parse on every command)
      const customCommands = getCachedCustomCommands();

      // Extract the base command and any arguments
      const parts = command.split(/\s+/);
      const baseCommand = parts[0];
      const commandArgs = parts.slice(1).join(' ');

      const customCommand = customCommands?.find((cmd: any) => {
        const trigger = cmd.name.startsWith('/') ? cmd.name : '/' + cmd.name;
        return trigger === baseCommand && cmd.enabled;
      });

      if (customCommand) {
        // Execute custom command
        setInput('');
        setCommandTrigger(null);

        // Replace $ARGUMENTS placeholder with any arguments passed to the command
        const template = customCommand.template || customCommand.script || '';
        const finalContent = template.replace('$ARGUMENTS', commandArgs);

        if (finalContent) {
          setInput(finalContent);
          setTimeout(() => {
            handleSend();
          }, 0);
        }
      } else {
        // For other commands (plugin commands, /init, /compact etc), insert into input
        const newValue = input.substring(0, start) + replacement + input.substring(end);
        setInput(newValue);
        setCommandTrigger(null);

        // Auto-send commands (click or enter always sends now)
        setTimeout(() => {
          handleSend();
        }, 0);
      }
    }
  };

  // Auto-resize textarea and detect @mentions
  const handleTextareaChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    const newValue = e.target.value;
    const cursorPosition = e.target.selectionStart;
    
    // Check if ? is typed as first character when input was empty
    if (input === '' && newValue === '?') {
      // Prevent the ? from being typed and show help via event
      setInput('');
      window.dispatchEvent(new CustomEvent('showHelpModal'));
      return;
    }
    
    setInput(newValue);
    
    // Check for bash mode (starts with $)
    const wasInBashMode = bashCommandMode;
    const isNowBashMode = isBashPrefix(newValue);
    
    if (wasInBashMode !== isNowBashMode) {
      setBashCommandMode(isNowBashMode);
      // Preserve focus when entering/exiting bash mode on Windows
      if (navigator.platform.includes('Win')) {
        requestAnimationFrame(() => {
          inputRef.current?.focus();
        });
      }
    }
    
    // Only check for triggers if textarea is focused
    const isTextareaFocused = document.activeElement === e.target;
    
    if (isTextareaFocused) {
      // Check for @mention and /command triggers
      const beforeCursor = newValue.substring(0, cursorPosition);
      const lastAtIndex = beforeCursor.lastIndexOf('@');
      const lastSlashIndex = beforeCursor.lastIndexOf('/');
      
      // If no @ found and mention was open, close it (handles backspace deletion of @)
      if (lastAtIndex === -1 && mentionTrigger !== null) {
        setMentionTrigger(null);
        setCommandTrigger(null);
        return;
      }
      
      // Determine which trigger is more recent
      if (lastAtIndex >= 0 && lastAtIndex > lastSlashIndex) {
        // Check if @ is at the start or preceded by whitespace
        const charBefore = lastAtIndex > 0 ? beforeCursor[lastAtIndex - 1] : ' ';
        if (charBefore === ' ' || charBefore === '\n' || lastAtIndex === 0) {
          // Get the text after @ until cursor (excluding the @ itself)
          const mentionText = beforeCursor.substring(lastAtIndex + 1);
          
          // Check if there's no space in the mention text (still typing the mention)
          if (!mentionText.includes(' ') && !mentionText.includes('\n')) {
            // Pass empty string for just @ to show root directory
            setMentionTrigger(mentionText);
            setMentionCursorPos(cursorPosition);
            setCommandTrigger(null);
          } else {
            setMentionTrigger(null);
          }
        } else {
          setMentionTrigger(null);
        }
      } else if (lastSlashIndex === 0 && lastSlashIndex > lastAtIndex) {
        // Only trigger if / is at the very beginning of the message
        // Get the text after / until cursor
        const commandText = beforeCursor.substring(lastSlashIndex);
        
        // Check if there's no space in the command text (still typing the command)
        if (!commandText.includes(' ') && !commandText.includes('\n')) {
          setCommandTrigger(commandText);
          setCommandCursorPos(cursorPosition);
          setMentionTrigger(null);
        } else {
          setCommandTrigger(null);
        }
      } else {
        setMentionTrigger(null);
        setCommandTrigger(null);
      }
    } else {
      // Clear triggers if textarea is not focused
      setMentionTrigger(null);
      setCommandTrigger(null);
    }
    
    // Simple auto-resize without jumps
    const textarea = e.target;
    const minHeight = 44; // Match CSS min-height exactly
    const maxHeight = 106; // 5 lines * 18px + 16px padding (match CSS max-height)

    const container = chatContainerRef.current;
    const currentHeight = textarea.offsetHeight;

    // Measure content height without visual reset by using a hidden clone
    // This avoids the flicker caused by setting height='auto'
    const measureHeight = () => {
      // Create measurement element once and reuse
      let measurer = document.getElementById('textarea-measurer') as HTMLTextAreaElement;
      if (!measurer) {
        measurer = document.createElement('textarea');
        measurer.id = 'textarea-measurer';
        measurer.style.cssText = `
          position: absolute;
          top: -9999px;
          left: -9999px;
          visibility: hidden;
          height: auto;
          overflow: hidden;
          white-space: pre-wrap;
          word-wrap: break-word;
        `;
        document.body.appendChild(measurer);
      }
      // Copy styles that affect sizing
      const computed = window.getComputedStyle(textarea);
      measurer.style.width = computed.width;
      measurer.style.padding = computed.padding;
      measurer.style.fontSize = computed.fontSize;
      measurer.style.fontFamily = computed.fontFamily;
      measurer.style.lineHeight = computed.lineHeight;
      measurer.style.boxSizing = computed.boxSizing;
      measurer.style.border = computed.border;
      measurer.value = textarea.value;
      return measurer.scrollHeight;
    };

    const newScrollHeight = measureHeight();
    const newHeight = Math.min(Math.max(newScrollHeight, minHeight), maxHeight);

    if (newHeight !== currentHeight) {
      const heightDiff = newHeight - currentHeight;

      // Capture scroll state before height change
      const scrollTopBefore = container?.scrollTop || 0;
      const wasAtBottom = container &&
        (container.scrollHeight - container.scrollTop - container.clientHeight < 5);

      // Apply height change
      textarea.style.height = newHeight + 'px';
      textarea.style.overflow = newScrollHeight > maxHeight ? 'auto' : 'hidden';

      // Immediately adjust scroll to compensate for height change (sync, no rAF)
      if (container) {
        if (wasAtBottom) {
          // Stay at bottom
          container.scrollTop = container.scrollHeight;
        } else if (heightDiff > 0) {
          // Textarea grew - container shrank by same amount
          // Scroll down to maintain the same visual bottom edge
          container.scrollTop = scrollTopBefore + heightDiff;
        } else {
          // Textarea shrank - container grew, keep same scroll position
          // This naturally reveals more content at the bottom
          container.scrollTop = scrollTopBefore;
        }
      }

      // Update overlay height ref (CSS handles actual sizing via inset positioning)
      overlayHeightRef.current = newHeight;
      // Sync scroll position after height change
      if (inputOverlayRef.current && inputRef.current) {
        inputOverlayRef.current.scrollTop = inputRef.current.scrollTop;
      }
    }

    // macOS focus preservation: restore focus if it was lost during height manipulation
    // WKWebView can sometimes drop focus during rapid DOM/style changes
    if (isMac && document.activeElement !== textarea && inputRef.current) {
      requestAnimationFrame(() => {
        if (document.activeElement !== inputRef.current) {
          inputRef.current?.focus();
        }
      });
    }
  };

  // Get caret coordinates relative to textarea
  const getCaretCoordinates = useCallback((textarea: HTMLTextAreaElement): { x: number; y: number } => {
    const pos = textarea.selectionStart;

    // Create a mirror div to measure text
    const mirror = document.createElement('div');
    const computed = window.getComputedStyle(textarea);

    mirror.style.cssText = `
      position: absolute;
      visibility: hidden;
      white-space: pre-wrap;
      word-wrap: break-word;
      overflow: hidden;
      width: ${textarea.clientWidth}px;
      font: ${computed.font};
      padding: ${computed.padding};
      line-height: ${computed.lineHeight};
    `;

    const textBeforeCaret = textarea.value.substring(0, pos);
    mirror.textContent = textBeforeCaret;

    // Add a span at caret position
    const caretSpan = document.createElement('span');
    caretSpan.textContent = '|';
    mirror.appendChild(caretSpan);

    document.body.appendChild(mirror);

    const x = caretSpan.offsetLeft;
    const y = caretSpan.offsetTop - textarea.scrollTop;

    document.body.removeChild(mirror);

    return { x: Math.min(x, textarea.clientWidth - 10), y: Math.min(y, 36) };
  }, []);

  // Sync overlay scroll with textarea on any resize (including animations)
  useEffect(() => {
    if (!inputRef.current) return;

    const textareaObserver = new ResizeObserver((entries) => {
      for (const entry of entries) {
        const height = entry.contentRect.height + 8; // Add padding
        const newHeight = Math.max(44, Math.min(height, 106));
        overlayHeightRef.current = newHeight;
        // Sync scroll position after resize (CSS handles height via inset positioning)
        if (inputOverlayRef.current && inputRef.current) {
          inputOverlayRef.current.scrollTop = inputRef.current.scrollTop;
        }
      }
    });

    textareaObserver.observe(inputRef.current);

    return () => textareaObserver.disconnect();
  }, []);

  // Update input container height when it changes
  useEffect(() => {
    if (!inputContainerRef.current) return;

    const observer = new ResizeObserver(() => {
      const height = inputContainerRef.current?.offsetHeight || 120;
      setInputContainerHeight(height);
    });

    observer.observe(inputContainerRef.current);
    
    return () => observer.disconnect();
  }, []);

  // Sync overlay scroll with textarea when input changes (fixes ultrathink position on mount)
  useEffect(() => {
    // Use double-RAF to ensure layout is fully complete before syncing scroll
    // First RAF: queues for next frame after React render
    // Second RAF: ensures any browser layout/reflow has completed
    requestAnimationFrame(() => {
      requestAnimationFrame(() => {
        if (inputOverlayRef.current && inputRef.current) {
          inputOverlayRef.current.scrollTop = inputRef.current.scrollTop;
        }
      });
    });
  }, [input]);




  if (!currentSession) {
    return <WelcomeScreen />;
  }

  return (
    <div
      className="chat-container"
    >
      {/* Search bar */}
      {searchVisible && (
        <div className="search-bar">
          <input
            type="text"
            className="search-input"
            placeholder="search messages..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') {
                e.preventDefault();
                if (e.shiftKey) {
                  navigateSearch('prev');
                } else {
                  navigateSearch('next');
                }
              } else if (e.key === 'Escape') {
                e.preventDefault();
                setSearchVisible(false);
                setSearchQuery('');
                setSearchMatches([]);
                setSearchIndex(0);
              }
            }}
            autoFocus
          />
          <div className="search-controls">
            {searchMatches.length > 0 ? (
              <span className="search-count">
                {searchIndex + 1} / {searchMatches.length}
              </span>
            ) : searchQuery ? (
              <span className="search-count">0 / 0</span>
            ) : null}
            <button
              className="search-btn"
              onClick={() => navigateSearch('prev')}
              disabled={searchMatches.length === 0}
              title="Previous (Shift+Enter)"
            >
              <IconChevronUp size={14} />
            </button>
            <button
              className="search-btn"
              onClick={() => navigateSearch('next')}
              disabled={searchMatches.length === 0}
              title="Next (Enter)"
            >
              <IconChevronDown size={14} />
            </button>
            <button
              className="search-btn close"
              onClick={() => {
                setSearchVisible(false);
                setSearchQuery('');
                setSearchMatches([]);
                setSearchIndex(0);
              }}
              title="Close (Esc)"
            >
              <IconX size={14} />
            </button>
          </div>
        </div>
      )}
      {/* Tool Panel (replaces chat when active) */}
      {(showFilesPanel || showRollbackPanel) ? (
        <div className="tool-panel">
          <div className="tool-panel-header">
            {showFilesPanel ? (
              <>
                <div className="tool-panel-tabs">
                  <button
                    className={`tool-panel-tab ${filesSubTab === 'files' ? 'active' : ''}`}
                    onClick={() => setFilesSubTab('files')}
                    title={`files (${modKey}+e)`}
                  >
                    <IconFolder size={12} stroke={1.5} />
                    <span>files</span>
                  </button>
                  <button
                    className={`tool-panel-tab ${filesSubTab === 'git' ? 'active' : ''}`}
                    onClick={() => setFilesSubTab('git')}
                    disabled={!isGitRepo}
                    title={isGitRepo ? `git (${modKey}+g)` : 'not a git repo'}
                  >
                    <IconGitBranch size={12} stroke={1.5} />
                    <span>git</span>
                    {gitStatus && (gitStatus.modified.length + gitStatus.added.length + gitStatus.deleted.length) > 0 && (
                      <span className="git-changes-badge">{gitStatus.modified.length + gitStatus.added.length + gitStatus.deleted.length}</span>
                    )}
                    {gitAhead > 0 && <span className="git-ahead-badge">↑{gitAhead}</span>}
                  </button>
                  {Object.keys(gitLineStats).length > 0 && (
                    <span className="tool-panel-git-stats">
                      <span className="git-total-added">+{Object.values(gitLineStats).reduce((sum, s) => sum + s.added, 0)}</span>
                      <span className="git-total-deleted">-{Object.values(gitLineStats).reduce((sum, s) => sum + s.deleted, 0)}</span>
                    </span>
                  )}
                </div>
              </>
            ) : (
              <span className="tool-panel-title">
                <IconHistory size={12} stroke={1.5} /> history
                <span className="tool-panel-hint">click to rollback</span>
              </span>
            )}
            <div className="tool-panel-header-actions">
              {showFilesPanel && filesSubTab === 'files' && currentSession?.workingDirectory && (
                <button
                  className="tool-panel-edit-claude-md"
                  onClick={() => setShowClaudeMdEditor(true)}
                  title="edit CLAUDE.md"
                >
                  <IconPencil size={12} stroke={1.5} />
                  <span>CLAUDE.md</span>
                </button>
              )}
              <button
                className="tool-panel-close"
                onClick={() => {
                  setShowFilesPanel(false);
                  setShowRollbackPanel(false);
                  setSelectedFile(null);
                  setFileContent('');
                  setSelectedGitFile(null);
                  setGitDiff(null);
                  setPreviewCollapsed(true);
                }}
              >
                <IconX size={14} />
              </button>
            </div>
          </div>
          <div className="tool-panel-body">
            {/* Files Panel - Files Tab */}
            {showFilesPanel && filesSubTab === 'files' && (
              <>
                <div className="tool-panel-list">
                  {fileLoading && !fileTree.length ? (
                    <div className="tool-panel-loading">loading...</div>
                  ) : fileTree.length === 0 ? (
                    <div className="tool-panel-empty">no files</div>
                  ) : (
                    <div className="file-tree">
                      {(() => {
                        const visibleFiles = getVisibleFiles(fileTree, expandedFolders);
                        const focusedPath = focusedFileIndex >= 0 && focusedFileIndex < visibleFiles.length
                          ? visibleFiles[focusedFileIndex].path
                          : null;
                        return fileTree.map((item) => (
                        <FileTreeNode
                          key={item.path}
                          item={item}
                          depth={0}
                          selectedFile={selectedFile}
                          expandedFolders={expandedFolders}
                          gitStatus={gitStatus}
                          workingDirectory={currentSession?.workingDirectory || ''}
                          focusedPath={focusedPath}
                          onToggleFolder={toggleFolder}
                          onFileClick={(path, hasGitChanges) => {
                            loadFileContent(path);
                            setPreviewCollapsed(false);
                            // Load git diff if file has changes
                            if (hasGitChanges) {
                              // Normalize path separators for cross-platform compatibility
                              const normalizedPath = path.replace(/\\/g, '/');
                              const normalizedWorkDir = (currentSession?.workingDirectory || '').replace(/\\/g, '/');
                              const relativePath = normalizedPath.replace(normalizedWorkDir, '').replace(/^\//, '');
                              loadGitDiff(relativePath);
                            } else {
                              setGitDiff(null);
                              setSelectedGitFile(null);
                            }
                          }}
                          onContextMenu={(e, path) => {
                            e.preventDefault();
                            e.stopPropagation();
                            // Normalize path separators for cross-platform compatibility
                            const normalizedPath = path.replace(/\\/g, '/');
                            const normalizedWorkDir = (currentSession?.workingDirectory || '').replace(/\\/g, '/');
                            const relativePath = normalizedPath.replace(normalizedWorkDir, '').replace(/^\//, '');
                            setInput(prev => prev + (prev.endsWith(' ') || !prev ? '' : ' ') + `@${relativePath} `);
                            setShowFilesPanel(false);
                            inputRef.current?.focus();
                          }}
                        />
                      ));
                      })()}
                    </div>
                  )}
                </div>
                {!previewCollapsed && selectedFile && (
                  <div className="tool-panel-preview">
                    <div className="tool-panel-preview-header">
                      <span className="tool-panel-preview-filename">
                        {selectedFile.replace(/\\/g, '/').replace((currentSession?.workingDirectory || '').replace(/\\/g, '/'), '').replace(/^\//, '')}
                        {gitDiff && <span className="preview-diff-indicator">diff</span>}
                      </span>
                      <button
                        className="tool-panel-preview-close"
                        onClick={() => {
                          setPreviewCollapsed(true);
                          setSelectedFile(null);
                          setFileContent('');
                          setGitDiff(null);
                          setSelectedGitFile(null);
                        }}
                      >
                        <IconX size={10} stroke={1.5} />
                      </button>
                    </div>
                    {gitDiff ? (
                      <div className="tool-panel-preview-diff">
                        <DiffViewer diff={gitDiff} />
                      </div>
                    ) : (
                      <pre
                        className="tool-panel-preview-content"
                        onScroll={(e) => {
                          if (fileTruncated && !fileFullyLoaded && selectedFile) {
                            const el = e.currentTarget;
                            const nearBottom = el.scrollHeight - el.scrollTop - el.clientHeight < 100;
                            if (nearBottom) {
                              loadFileContent(selectedFile, true);
                            }
                          }
                        }}
                      >
                        {fileLoading ? 'loading...' : fileContent}
                        {fileTruncated && !fileFullyLoaded && (
                          <span className="file-truncated-indicator">{'\n\n'}↓ scroll to load more...</span>
                        )}
                      </pre>
                    )}
                  </div>
                )}
              </>
            )}
            {/* Files Panel - Git Tab */}
            {showFilesPanel && filesSubTab === 'git' && (
              <>
                <div className="tool-panel-list">
                  {gitLoading && !gitStatus ? (
                    <div className="tool-panel-loading">loading...</div>
                  ) : !gitStatus ? (
                    <div className="tool-panel-empty">not a git repo</div>
                  ) : (
                    <div className="git-file-list">
                      {gitStatus.modified.length === 0 && gitStatus.added.length === 0 && gitStatus.deleted.length === 0 ? (
                        <div className="tool-panel-empty">no changes</div>
                      ) : (
                        <>
                          {gitStatus.modified.map((file, idx) => {
                            const stats = gitLineStats[file];
                            return (
                            <div
                              key={file}
                              className={`git-file-item ${selectedGitFile === file ? 'selected' : ''} ${focusedGitIndex === idx ? 'focused' : ''}`}
                              onClick={() => loadGitDiff(file)}
                              onContextMenu={(e) => {
                                e.preventDefault();
                                e.stopPropagation();
                                setInput(prev => prev + (prev.endsWith(' ') || !prev ? '' : ' ') + `@${file} `);
                                setShowFilesPanel(false);
                                inputRef.current?.focus();
                              }}
                            >
                              <span className="git-status modified">M</span>
                              <span className="git-file-name">{file}</span>
                              {stats && <span className="git-line-stats"><span className="git-lines-added">+{stats.added}</span><span className="git-lines-deleted">-{stats.deleted}</span></span>}
                            </div>
                            );
                          })}
                          {gitStatus.added.map((file, idx) => {
                            const stats = gitLineStats[file];
                            return (
                            <div
                              key={file}
                              className={`git-file-item ${selectedGitFile === file ? 'selected' : ''} ${focusedGitIndex === gitStatus.modified.length + idx ? 'focused' : ''}`}
                              onClick={() => loadGitDiff(file)}
                              onContextMenu={(e) => {
                                e.preventDefault();
                                e.stopPropagation();
                                setInput(prev => prev + (prev.endsWith(' ') || !prev ? '' : ' ') + `@${file} `);
                                setShowFilesPanel(false);
                                inputRef.current?.focus();
                              }}
                            >
                              <span className="git-status added">A</span>
                              <span className="git-file-name">{file}</span>
                              {stats && <span className="git-line-stats"><span className="git-lines-added">+{stats.added}</span><span className="git-lines-deleted">-{stats.deleted}</span></span>}
                            </div>
                            );
                          })}
                          {gitStatus.deleted.map((file, idx) => {
                            const stats = gitLineStats[file];
                            return (
                            <div
                              key={file}
                              className={`git-file-item ${selectedGitFile === file ? 'selected' : ''} ${focusedGitIndex === gitStatus.modified.length + gitStatus.added.length + idx ? 'focused' : ''}`}
                              onClick={() => loadGitDiff(file)}
                              onContextMenu={(e) => {
                                e.preventDefault();
                                e.stopPropagation();
                                setInput(prev => prev + (prev.endsWith(' ') || !prev ? '' : ' ') + `@${file} `);
                                setShowFilesPanel(false);
                                inputRef.current?.focus();
                              }}
                            >
                              <span className="git-status deleted">D</span>
                              <span className="git-file-name">{file}</span>
                              {stats && <span className="git-line-stats"><span className="git-lines-added">+{stats.added}</span><span className="git-lines-deleted">-{stats.deleted}</span></span>}
                            </div>
                            );
                          })}
                        </>
                      )}
                    </div>
                  )}
                </div>
                {selectedGitFile && gitDiff && (
                  <div className="tool-panel-preview">
                    <div className="tool-panel-preview-header">
                      <span className="tool-panel-preview-filename">{selectedGitFile}</span>
                      <button
                        className="tool-panel-preview-close"
                        onClick={() => {
                          setSelectedGitFile(null);
                          setGitDiff(null);
                        }}
                      >
                        <IconX size={10} stroke={1.5} />
                      </button>
                    </div>
                    <div className="tool-panel-preview-diff">
                      <DiffViewer diff={gitDiff} />
                    </div>
                  </div>
                )}
              </>
            )}
            {/* Rollback Panel */}
            {showRollbackPanel && (
              <div className="rollback-panel">
                <div className="rollback-list" ref={rollbackListRef} tabIndex={-1}>
                  {(() => {
                    // Get user messages with their indices for rollback (exclude bash commands)
                    const userMessages = currentSession.messages
                      .map((msg, idx) => ({ msg, idx }))
                      .filter(({ msg }) => {
                        if (msg.type !== 'user') return false;
                        // Extract text content to check for bash prefix
                        const content = msg.message?.content;
                        let text = '';
                        if (typeof content === 'string') {
                          text = content;
                        } else if (Array.isArray(content)) {
                          text = content
                            .filter((c: any) => c.type === 'text')
                            .map((c: any) => c.text)
                            .join(' ');
                        }
                        // Filter out bash commands ($ or ! prefix)
                        return !isBashPrefix(text.trim());
                      })
                      .reverse(); // Reverse to show latest first

                    if (userMessages.length === 0) {
                      return <div className="tool-panel-empty">no messages to rollback</div>;
                    }

                    return userMessages.map(({ msg, idx }, userIdx) => {
                      // Extract user text from message
                      const content = msg.message?.content;
                      let userText = '';
                      if (typeof content === 'string') {
                        userText = content;
                      } else if (Array.isArray(content)) {
                        userText = content
                          .filter((c: any) => c.type === 'text')
                          .map((c: any) => c.text)
                          .join(' ');
                      }

                      // Truncate long text
                      const displayText = userText.length > 100
                        ? userText.substring(0, 100) + '...'
                        : userText;

                      // Format timestamp
                      const timestamp = msg.timestamp
                        ? new Date(msg.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
                        : '';

                      // Check if streaming - disable rollback during streaming
                      const isStreaming = currentSession?.streaming;

                      // Determine active index: hover takes priority over keyboard selection
                      const activeIndex = rollbackHoveredIndex !== null ? rollbackHoveredIndex : rollbackSelectedIndex;
                      const isActive = activeIndex === userIdx;
                      const isHovered = rollbackHoveredIndex === userIdx;

                      return (
                        <div
                          key={msg.id || idx}
                          className={`rollback-item ${isStreaming ? 'disabled' : ''} ${isActive ? (isHovered ? 'hovered' : 'selected') : ''}`}
                          onMouseEnter={() => {
                            setRollbackHoveredIndex(userIdx);
                            setRollbackSelectedIndex(null); // Clear keyboard selection when hovering
                          }}
                          onMouseLeave={() => setRollbackHoveredIndex(null)}
                          onClick={async () => {
                            if (isStreaming) return;

                            // Get files changed after this message
                            const restorePoints = currentSession.restorePoints || [];
                            const fileRestoreMap = new Map<string, { originalContent: string | null; isNewFile: boolean; mtime?: number }>();
                            let earliestTimestamp = Date.now();

                            restorePoints
                              .filter(rp => rp.messageIndex > idx)
                              .sort((a, b) => a.messageIndex - b.messageIndex)
                              .forEach(rp => {
                                // Track earliest timestamp for cross-session conflict check
                                if (rp.timestamp < earliestTimestamp) {
                                  earliestTimestamp = rp.timestamp;
                                }
                                rp.fileSnapshots.forEach(snap => {
                                  if (!fileRestoreMap.has(snap.path) && snap.originalContent !== undefined) {
                                    fileRestoreMap.set(snap.path, {
                                      originalContent: snap.originalContent,
                                      isNewFile: snap.isNewFile || false,
                                      mtime: snap.mtime
                                    });
                                  }
                                });
                              });

                            const filesToRestore = Array.from(fileRestoreMap.entries());

                            // Check for conflicts before showing confirmation
                            const conflicts: Array<{ path: string; conflictType: string; source?: string }> = [];

                            if (filesToRestore.length > 0) {
                              try {
                                // Check mtime conflicts (file modified externally or by other sessions)
                                const filesToCheck: Array<[string, number | null, boolean]> = filesToRestore.map(([path, data]) => [
                                  path,
                                  data.mtime || null,
                                  data.isNewFile
                                ]);

                                const mtimeConflicts = await invoke<Array<{
                                  path: string;
                                  snapshot_mtime: number | null;
                                  current_mtime: number | null;
                                  exists: boolean;
                                  conflict_type: string;
                                }>>('check_file_conflicts', { files: filesToCheck });

                                for (const conflict of mtimeConflicts) {
                                  if (conflict.conflict_type !== 'none') {
                                    conflicts.push({
                                      path: conflict.path,
                                      conflictType: conflict.conflict_type,
                                      source: 'external or other session'
                                    });
                                  }
                                }

                                // Check cross-session edits from global registry
                                const paths = filesToRestore.map(([path]) => path);
                                const crossSessionEdits = await invoke<Array<{
                                  path: string;
                                  session_id: string;
                                  timestamp: number;
                                  operation: string;
                                }>>('get_conflicting_edits', {
                                  paths,
                                  currentSessionId: currentSessionId || '',
                                  afterTimestamp: earliestTimestamp
                                });

                                for (const edit of crossSessionEdits) {
                                  // Only add if not already in conflicts
                                  if (!conflicts.some(c => c.path === edit.path)) {
                                    conflicts.push({
                                      path: edit.path,
                                      conflictType: 'cross-session',
                                      source: `another tab (${edit.operation})`
                                    });
                                  }
                                }
                              } catch (err) {
                                console.warn('[Rollback] Error checking conflicts:', err);
                                // Continue with rollback even if conflict check fails
                              }
                            }

                            // Set pending data and show confirm modal
                            setPendingRollbackData({
                              messageIndex: idx,
                              messagesToRemove: userMessages.length - userIdx, // +1 because we also remove the selected message
                              messageContent: userText, // store full content for input field
                              filesToRestore,
                              conflicts: conflicts.length > 0 ? conflicts : undefined,
                              targetTimestamp: earliestTimestamp
                            });
                            setShowRollbackConfirm(true);
                          }}
                          title={isStreaming ? 'cannot rollback while streaming' : `edit #${userIdx + 1}`}
                        >
                          <span className="rollback-item-number">#{userIdx + 1}</span>
                          <span className="rollback-item-text">{displayText || '(empty)'}</span>
                        </div>
                      );
                    });
                  })()}
                </div>
              </div>
            )}
          </div>
        </div>
      ) : (
      <div
        className="chat-messages"
        ref={chatContainerRef}
      >
        {/* Show resume button for empty sessions only if there are conversations to resume */}
        {currentSession.messages.length === 0 && !currentSession.streaming && hasResumableConversations[currentSessionId || ''] && (
          <div className="empty-chat-state">
            <button
              className="resume-conversation-btn"
              onClick={() => setShowResumeModal(true)}
              onContextMenu={(e) => {
                e.preventDefault();
                e.stopPropagation();
                handleResumeLastConversation();
              }}
              title={`resume (${modKey}+shift+r) • rmb: last session`}
            >
              resume {currentSession.workingDirectory?.split(/[/\\]/).pop() || ''}
            </button>
          </div>
        )}
        {(() => {
          // Process all messages once at the beginning
          const processedMessages = currentSession.messages
            .reduce((acc: any[], message: any, index: number, array: any[]) => {
            // Group messages by type and only show final versions

            // Always show user messages (but deduplicate)
            if (message.type === 'user') {
              // Skip empty messages
              const content = message.message?.content;
              if (!content || (typeof content === 'string' && !content.trim())) {
                return acc;
              }

              // Check if this exact user message already exists by ID
              const existsById = acc.some((m: any) =>
                m.type === 'user' &&
                m.id &&
                message.id &&
                m.id === message.id
              );

              if (existsById) {
                return acc; // Skip if ID already exists
              }

              // Also check for duplicate content within 2 seconds
              const contentDuplicate = acc.some((m: any) =>
                m.type === 'user' &&
                JSON.stringify(m.message?.content) === JSON.stringify(message.message?.content) &&
                Math.abs((m.timestamp || 0) - (message.timestamp || 0)) < 2000
              );

              if (!contentDuplicate) {
                acc.push(message);
              }
              return acc;
            }

            // For assistant messages, deduplicate properly
            if (message.type === 'assistant') {
              // First check by ID if both have IDs
              if (message.id) {
                const existingIndex = acc.findIndex((m: any) =>
                  m.type === 'assistant' &&
                  m.id &&
                  m.id === message.id
                );

                if (existingIndex >= 0) {
                  // Update existing message (for streaming updates)
                  acc[existingIndex] = message;
                  return acc;
                }
              }

              // Check for duplicate content within a short time window
              const contentDuplicate = acc.some((m: any) =>
                m.type === 'assistant' &&
                JSON.stringify(m.message?.content) === JSON.stringify(message.message?.content) &&
                Math.abs((m.timestamp || 0) - (message.timestamp || 0)) < 2000
              );

              if (!contentDuplicate) {
                acc.push(message);
              }
              return acc;
            }

            // Show tool messages but deduplicate by ID
            if (message.type === 'tool_use' || message.type === 'tool_result') {
              // Check for duplicate by ID
              if (message.id) {
                const existingIndex = acc.findIndex((m: any) =>
                  (m.type === 'tool_use' || m.type === 'tool_result') &&
                  m.id === message.id
                );
                if (existingIndex >= 0) {
                  // Update existing message
                  acc[existingIndex] = message;
                  return acc;
                }
              }

              // Also check for duplicate by tool_use_id for tool_result
              if (message.type === 'tool_result' && message.message?.tool_use_id) {
                const existingIndex = acc.findIndex((m: any) =>
                  m.type === 'tool_result' &&
                  m.message?.tool_use_id === message.message.tool_use_id
                );
                if (existingIndex >= 0) {
                  acc[existingIndex] = message;
                  return acc;
                }
              }

              acc.push(message);
              return acc;
            }
            
            // For system messages (session started, errors, etc)
            if (message.type === 'system') {
              acc.push(message);
              return acc;
            }
            
            // For result messages (completion) - only ONE result per turn
            // Claude sends one result per turn, so merge any duplicates aggressively
            if (message.type === 'result') {
              // Find the last user message index to define current turn boundary
              let lastUserIndex = -1;
              for (let i = acc.length - 1; i >= 0; i--) {
                if (acc[i].type === 'user') {
                  lastUserIndex = i;
                  break;
                }
              }

              // Find any existing result message after the last user message (same turn)
              const existingResultIndex = acc.findIndex((m: any, idx: number) =>
                m.type === 'result' && idx > lastUserIndex
              );

              if (existingResultIndex >= 0) {
                // Merge with existing result - keep the one with more data
                const existing = acc[existingResultIndex];
                const merged = {
                  ...existing,
                  ...message,
                  // Prefer non-undefined values from either
                  usage: message.usage || existing.usage,
                  duration_ms: message.duration_ms || existing.duration_ms,
                  total_cost_usd: message.total_cost_usd || existing.total_cost_usd,
                  model: message.model || existing.model,
                  result: message.result || existing.result
                };
                acc[existingResultIndex] = merged;
              } else {
                acc.push(message);
              }
              return acc;
            }

            return acc;
            }, [] as typeof currentSession.messages);

          // Ensure result messages appear after any assistant messages in the same turn
          // This fixes race condition where result arrives before final assistant message update
          const sortedMessages = [...processedMessages];
          for (let i = sortedMessages.length - 1; i > 0; i--) {
            // If we find a result message followed by an assistant message, swap them
            if (sortedMessages[i].type === 'assistant' && sortedMessages[i - 1].type === 'result') {
              [sortedMessages[i - 1], sortedMessages[i]] = [sortedMessages[i], sortedMessages[i - 1]];
            }
          }

          const filteredMessages = sortedMessages;

          // Find the index of the last user or assistant message for restore button logic
          let lastRestorableIndex = -1;
          for (let i = filteredMessages.length - 1; i >= 0; i--) {
            if (filteredMessages[i].type === 'user' || filteredMessages[i].type === 'assistant') {
              lastRestorableIndex = i;
              break;
            }
          }
          
          // Use virtualization for better performance with many messages
          const useVirtualization = shouldUseVirtualization(filteredMessages.length);
          const isStreaming = currentSession?.streaming === true;
          const hasPendingTools = (currentSession?.pendingToolIds?.size || 0) > 0;
          const isRunningBash = currentSession?.runningBash === true;
          const isUserBash = currentSession?.userBashRunning === true;
          // Show thinking only when not running bash (bash indicator takes priority)
          const shouldShowThinking = (isStreaming || hasPendingTools) && !isRunningBash && !isUserBash;

          // Compute activity label based on last tool_use without a matching tool_result
          const getActivityLabel = (): string => {
            const TOOL_ACTION_LABELS: Record<string, string> = {
              'Read': 'reading',
              'Write': 'writing',
              'Edit': 'editing',
              'MultiEdit': 'editing',
              'Bash': 'running',
              'Grep': 'searching',
              'Glob': 'finding',
              'LS': 'listing',
              'WebSearch': 'searching',
              'WebFetch': 'fetching',
              'Task': 'delegating',
              'TodoWrite': 'planning',
              'NotebookEdit': 'editing',
            };

            // Walk backwards through messages to find last incomplete tool_use
            for (let i = filteredMessages.length - 1; i >= 0; i--) {
              const msg = filteredMessages[i];

              // Check for tool_use in message content blocks (assistant messages)
              if (msg.type === 'assistant' && Array.isArray(msg.content)) {
                // Find tool_uses that don't have matching tool_results yet
                for (let j = msg.content.length - 1; j >= 0; j--) {
                  const block = msg.content[j];
                  if (block?.type === 'tool_use' && block.name) {
                    // Check if there's a matching tool_result after this
                    const toolUseId = block.id;
                    let hasResult = false;
                    for (let k = i + 1; k < filteredMessages.length; k++) {
                      const laterMsg = filteredMessages[k];
                      if (laterMsg.type === 'tool_result' && laterMsg.message?.tool_use_id === toolUseId) {
                        hasResult = true;
                        break;
                      }
                    }
                    if (!hasResult) {
                      return TOOL_ACTION_LABELS[block.name] || 'thinking';
                    }
                  }
                }
              }

              // Check standalone tool_use messages
              if (msg.type === 'tool_use' && msg.message?.name) {
                // Check if there's a matching tool_result after this
                const toolUseId = msg.message?.id || msg.id;
                let hasResult = false;
                for (let k = i + 1; k < filteredMessages.length; k++) {
                  const laterMsg = filteredMessages[k];
                  if (laterMsg.type === 'tool_result' && (laterMsg.message?.tool_use_id === toolUseId || laterMsg.tool_use_id === toolUseId)) {
                    hasResult = true;
                    break;
                  }
                }
                if (!hasResult) {
                  return TOOL_ACTION_LABELS[msg.message.name] || 'thinking';
                }
              }

              // If we hit a user message or result, we're past the current turn
              if (msg.type === 'user' || msg.type === 'result') {
                break;
              }
            }
            return 'thinking';
          };
          const activityLabel = getActivityLabel();

          if (useVirtualization) {
            return (
              <>
                <VirtualizedMessageList
                  ref={virtualizedMessageListRef}
                  messages={filteredMessages}
                  sessionId={currentSessionId || ''}
                  isStreaming={isStreaming}
                  lastAssistantMessageIds={currentSession?.lastAssistantMessageIds || []}
                  className="virtualized-messages-container"
                  showThinking={shouldShowThinking}
                  thinkingStartTime={(currentSession as any)?.thinkingStartTime}
                  activityLabel={activityLabel}
                  showBash={isRunningBash}
                  showUserBash={isUserBash}
                  bashStartTime={currentSessionId ? bashStartTimes[currentSessionId] : undefined}
                  showCompacting={currentSession?.compactionState?.isCompacting}
                  compactingStartTime={currentSessionId ? compactingStartTimes[currentSessionId] : undefined}
                  compactingFollowupMessage={currentSession?.compactionState?.pendingAutoCompactMessage}
                  pendingFollowup={pendingFollowupRef.current && pendingFollowupMessage ? { content: pendingFollowupRef.current.content } : null}
                  onScrollStateChange={(atBottom) => {
                    if (currentSessionId) {
                      setIsAtBottom(prev => ({ ...prev, [currentSessionId]: atBottom }));
                    }
                  }}
                  searchQuery={debouncedSearchQuery}
                  searchMatches={searchMatches}
                  searchIndex={searchIndex}
                />
                <div ref={messagesEndRef} />
              </>
            );
          }
          
          // Fallback to regular rendering for small message lists or when flag is disabled
          return filteredMessages.map((message, idx) => {
            const isHighlighted = searchMatches.includes(idx) && searchMatches[searchIndex] === idx;
            // Only mark as last if it's the last user/assistant message
            const isLastRestorable = idx === lastRestorableIndex;
            
            // Get previous message for bash response styling
            const prevMessage = idx > 0 ? filteredMessages[idx - 1] : null;

            // For result messages, include duration_ms in key to force re-render when it becomes available
            const resultKey = message.type === 'result' ? `-${message.duration_ms || 0}` : '';

            return (
              <div
                key={`${message.id || message.type}-${idx}${resultKey}`}
                data-message-index={idx}
                className={isHighlighted ? 'message-highlighted' : ''}
              >
                <MessageRenderer
                  message={message}
                  index={idx}
                  isLast={isLastRestorable}
                  searchQuery={searchQuery}
                  isCurrentMatch={searchMatches[searchIndex] === idx}
                  previousMessage={prevMessage}
                />
              </div>
            );
          });
        })()}
        {/* Show status indicators (thinking, bash, queued) as last message */}
        {(() => {
          // Calculate visibility and state
          const processedMessages = currentSession.messages
            .reduce((acc, message) => {
              if (message.type === 'user' || message.type === 'assistant' ||
                  message.type === 'tool_use' || message.type === 'tool_result' ||
                  message.type === 'system' || message.type === 'result') {
                acc.push(message);
              }
              return acc;
            }, [] as typeof currentSession.messages);
          const useVirtualization = shouldUseVirtualization(processedMessages.length);
          const isStreaming = currentSession?.streaming === true;
          const hasPendingTools = (currentSession?.pendingToolIds?.size || 0) > 0;
          const isRunningBash = currentSession?.runningBash === true;
          const isUserBash = currentSession?.userBashRunning === true;
          const hasPendingFollowup = !!pendingFollowupMessage && !!pendingFollowupRef.current;

          // Show indicator if any activity is happening
          const shouldShowIndicator = isStreaming || hasPendingTools || isRunningBash || isUserBash || hasPendingFollowup;
          if (!shouldShowIndicator || useVirtualization) return null;

          // Compute activity label for fallback indicator
          const getFallbackActivityLabel = (): string => {
            const TOOL_ACTION_LABELS: Record<string, string> = {
              'Read': 'reading', 'Write': 'writing', 'Edit': 'editing', 'MultiEdit': 'editing',
              'Bash': 'running', 'Grep': 'searching', 'Glob': 'finding', 'LS': 'listing',
              'WebSearch': 'searching', 'WebFetch': 'fetching', 'Task': 'delegating',
              'TodoWrite': 'planning', 'NotebookEdit': 'editing',
            };
            for (let i = processedMessages.length - 1; i >= 0; i--) {
              const msg = processedMessages[i];
              if (msg.type === 'assistant' && Array.isArray(msg.content)) {
                for (let j = msg.content.length - 1; j >= 0; j--) {
                  const block = msg.content[j];
                  if (block?.type === 'tool_use' && block.name) {
                    const toolUseId = block.id;
                    let hasResult = false;
                    for (let k = i + 1; k < processedMessages.length; k++) {
                      if (processedMessages[k].type === 'tool_result' && processedMessages[k].message?.tool_use_id === toolUseId) {
                        hasResult = true; break;
                      }
                    }
                    if (!hasResult) return TOOL_ACTION_LABELS[block.name] || 'thinking';
                  }
                }
              }
              if (msg.type === 'tool_use' && msg.message?.name) {
                const toolUseId = msg.message?.id || msg.id;
                let hasResult = false;
                for (let k = i + 1; k < processedMessages.length; k++) {
                  const laterMsg = processedMessages[k];
                  if (laterMsg.type === 'tool_result' && (laterMsg.message?.tool_use_id === toolUseId || laterMsg.tool_use_id === toolUseId)) {
                    hasResult = true; break;
                  }
                }
                if (!hasResult) return TOOL_ACTION_LABELS[msg.message.name] || 'thinking';
              }
              if (msg.type === 'user' || msg.type === 'result') break;
            }
            return 'thinking';
          };

          return (
            <StreamIndicator
              isStreaming={isStreaming}
              hasPendingTools={hasPendingTools}
              isRunningBash={isRunningBash}
              isUserBash={isUserBash}
              hasPendingFollowup={hasPendingFollowup}
              pendingFollowup={pendingFollowupRef.current}
              activityLabel={getFallbackActivityLabel()}
              thinkingStartTime={(currentSession as any)?.thinkingStartTime}
              bashStartTime={currentSessionId ? bashStartTimes[currentSessionId] : undefined}
              compactionState={currentSession?.compactionState}
              compactingStartTime={currentSessionId ? compactingStartTimes[currentSessionId] : undefined}
              onStopBash={handleStopBash}
            />
          );
        })()}
        <div ref={messagesEndRef} />
      </div>
      )}

      {/* Timeline Navigator - REMOVED: Unnecessary complexity */}
      {/* {showTimeline && currentSessionId && FEATURE_FLAGS.SHOW_TIMELINE && (
        <React.Suspense fallback={<div>Loading timeline...</div>}>
          <TimelineNavigator
            sessionId={currentSessionId}
            currentMessageCount={currentSession?.messages?.length || 0}
            onRestoreCheckpoint={(checkpointId) => {
              console.log('Restoring checkpoint:', checkpointId);
              // TODO: Implement actual restoration
            }}
            onClose={() => setShowTimeline(false)}
          />
        </React.Suspense>
      )} */}
      
      {/* Agent Executor */}
      {currentSessionId && FEATURE_FLAGS.ENABLE_AGENT_EXECUTION && (
        <React.Suspense fallback={<div>&nbsp;</div>}>
          <AgentExecutor
            sessionId={currentSessionId}
            isOpen={showAgentExecutor}
            onClose={() => { setShowAgentExecutor(false); resetHoverStates(); }}
          />
        </React.Suspense>
      )}
      
      {/* Activity indicator moved inline with thinking indicator at end of messages */}

      {/* Input Area - textarea with attachments, drag-drop, and streaming controls */}
      {(() => {
        // Calculate context percentage for isContextFull
        const totalContextTokens = currentSession?.analytics?.tokens?.total || 0;
        const contextWindowTokens = 200000;
        const contextPercentage = (totalContextTokens / contextWindowTokens * 100);
        const isContextFull = contextPercentage > 95;

        return (
          <InputArea
            input={input}
            setInput={setInput}
            attachments={attachments}
            removeAttachment={removeAttachment}
            isDragging={isDragging}
            isReadOnly={currentSession?.readOnly || false}
            isStreaming={currentSession?.streaming || false}
            isRunningBash={currentSession?.runningBash || false}
            isUserBash={currentSession?.userBashRunning || false}
            isContextFull={isContextFull}
            isDictating={isDictating}
            isCommandMode={commandTrigger !== null}
            contextPercentage={contextPercentage}
            bashCommandMode={bashCommandMode}
            workingDirectory={currentSession?.workingDirectory}
            inputRef={inputRef}
            inputOverlayRef={inputOverlayRef}
            inputContainerRef={inputContainerRef}
            isTextareaFocused={isTextareaFocused}
            setIsTextareaFocused={setIsTextareaFocused}
            setMentionTrigger={setMentionTrigger}
            setCommandTrigger={setCommandTrigger}
            onTextareaChange={handleTextareaChange}
            onKeyDown={handleKeyDown}
            onPaste={handlePaste}
            onDragOver={handleDragOver}
            onDragLeave={handleDragLeave}
            onDrop={handleDrop}
            onInterrupt={handleStopBash}
            onCompactRequest={handleCompactContextRequest}
            onClearRequest={handleClearContextRequest}
          >
            <ContextBar
              selectedModel={currentSession?.model || selectedModel}
              onModelChange={handleModelChange}
              enabledToolsCount={enabledTools.length}
              onOpenModelModal={() => {
                setModelToolsOpenedViaKeyboard(false);
                setShowModelToolsModal(true);
              }}
              showFilesPanel={showFilesPanel}
              showRollbackPanel={showRollbackPanel}
              setShowFilesPanel={setShowFilesPanel}
              setShowRollbackPanel={setShowRollbackPanel}
              setSelectedFile={setSelectedFile}
              setFileContent={setFileContent}
              setSelectedGitFile={setSelectedGitFile}
              setGitDiff={setGitDiff}
              setFocusedFileIndex={setFocusedFileIndex}
              setFocusedGitIndex={setFocusedGitIndex}
              workingDirectory={currentSession?.workingDirectory}
              isReadOnly={currentSession?.readOnly || false}
              isStreaming={currentSession?.streaming || false}
              messages={currentSession?.messages || []}
              totalContextTokens={totalContextTokens}
              isTokensPending={currentSession?.analytics?.compactPending === true}
              autoCompactEnabled={autoCompactEnabled !== false}
              setAutoCompactEnabled={(enabled) => setAutoCompactEnabled(enabled ? true : false)}
              isPendingCompact={currentSession?.compactionState?.pendingAutoCompact || false}
              usageLimits={usageLimits}
              currentProvider={getProviderForModel(currentSession?.model || selectedModel)}
              onClearRequest={handleClearContextRequest}
              onCompactRequest={handleCompactContextRequest}
              onOpenStatsModal={() => setShowStatsModal(true)}
              isDictating={isDictating}
              onToggleDictation={toggleDictation}
              modKey={modKey}
            />
          </InputArea>
        );
      })()}

      {/* Mention Autocomplete */}
      {mentionTrigger !== null && (
        <MentionAutocomplete
          trigger={mentionTrigger}
          cursorPosition={mentionCursorPos}
          inputRef={inputRef}
          onSelect={handleMentionSelect}
          onClose={() => setMentionTrigger(null)}
          workingDirectory={currentSession?.workingDirectory}
        />
      )}
      
      {/* Command Autocomplete */}
      {commandTrigger && (
        <CommandAutocomplete
          trigger={commandTrigger}
          cursorPosition={commandCursorPos}
          inputRef={inputRef}
          onSelect={handleCommandSelect}
          onClose={() => setCommandTrigger(null)}
        />
      )}

      {/* Model & Tools Modal */}
      <ModelToolsModal
        isOpen={showModelToolsModal}
        onClose={() => { setShowModelToolsModal(false); resetHoverStates(); }}
        selectedModel={currentSession?.model || selectedModel}
        onModelChange={handleModelChange}
        enabledTools={enabledTools}
        onToolsChange={setEnabledTools}
        openedViaKeyboard={modelToolsOpenedViaKeyboard}
        lockedProvider={currentSession?.messages?.length ? currentSession.provider : null}
      />

      {showStatsModal && (
        <div className="stats-modal-overlay" onClick={() => { setShowStatsModal(false); resetHoverStates(); }}>
          <div className="stats-modal" onClick={(e) => e.stopPropagation()}>
            <div className="stats-header">
              <h3>
                <IconChartDots size={14} stroke={1.5} style={{ marginRight: '6px' }} />
                context usage
              </h3>
              <div className="stats-header-right">
                <div className="stats-toggle-container">
                  <span className="stats-toggle-label">auto-compact:</span>
                  <div
                    className={`toggle-switch compact ${autoCompactEnabled !== false ? 'active' : ''}`}
                    onClick={(e) => {
                      e.stopPropagation();
                      setAutoCompactEnabled(autoCompactEnabled === false ? true : false);
                    }}
                    title={autoCompactEnabled !== false ? `auto-compact on (60%) • ${modKey}+shift+. to toggle` : `auto-compact off • ${modKey}+shift+. to toggle`}
                  >
                    <span className="toggle-switch-label off">off</span>
                    <span className="toggle-switch-label on">on</span>
                    <div className="toggle-switch-slider" />
                  </div>
                </div>
                <button className="stats-close" title="close (esc)" onClick={() => { setShowStatsModal(false); resetHoverStates(); }}>
                  <IconX size={16} />
                </button>
              </div>
            </div>
            <div className="stats-content">
              {(() => {
                // Calculate total context usage - only conversation tokens count
                if (currentSession?.analytics?.tokens?.total || currentSession?.analytics?.tokens?.total === 0) {
                  console.log('📱 [UI-ANALYTICS] Session analytics in UI:', {
                    sessionId: currentSession?.id,
                    totalTokens: currentSession?.analytics?.tokens?.total,
                    hasAnalytics: !!currentSession?.analytics,
                    analyticsKeys: currentSession?.analytics ? Object.keys(currentSession.analytics) : []
                  });
                }
                // tokens.total already includes all tokens
                const totalContextTokens = currentSession?.analytics?.tokens?.total || 0;
                const contextWindowTokens = 200000;
                const rawPercentage = (totalContextTokens / contextWindowTokens * 100);
                // Don't cap at 100% - show real percentage for context usage awareness
                const percentageNum = rawPercentage;
                // Check if tokens are pending after compact
                const isTokensPending = currentSession?.analytics?.compactPending === true;
                const percentage = isTokensPending ? '?' : percentageNum.toFixed(2);

                return (
                  <>
                    <div className="stats-column" style={{ gridColumn: 'span 2' }}>
                      <div className="stats-section">
                        <div className="usage-bar-container" style={{ marginBottom: '8px' }}>
                          <div className="usage-bar-label">
                            <span>{isTokensPending ? '?' : (currentSession?.analytics?.tokens?.total || 0).toLocaleString()} / 200k</span>
                            <span className={((currentSession?.analytics?.tokens?.total || 0) / 200000 * 100) >= 60 ? 'usage-negative' : ''}>{isTokensPending ? '?%' : `${((currentSession?.analytics?.tokens?.total || 0) / 200000 * 100).toFixed(2)}%`}</span>
                          </div>
                          <div className="usage-bar">
                            <div className="usage-bar-fill" style={{
                              width: `${Math.min((currentSession?.analytics?.tokens?.total || 0) / 200000 * 100, 100)}%`,
                              background: ((currentSession?.analytics?.tokens?.total || 0) / 200000 * 100) >= 60
                                ? 'var(--negative-color, #ff6b6b)'
                                : 'var(--accent-color)'
                            }} />
                          </div>
                          <div className="usage-bar-ticks">
                            {/* Ticks every 10% */}
                            {Array.from({ length: 11 }, (_, i) => (
                              <div key={i} className="usage-bar-tick" />
                            ))}
                          </div>
                        </div>
                        <div className="stat-row">
                          <div className="stat-keys">
                            <IconMessage size={14} />
                            <span className="stat-name">actual tokens</span>
                          </div>
                          <span className="stat-dots"></span>
                          <span className="stat-desc">
                            {((currentSession?.analytics?.tokens?.input || 0) + (currentSession?.analytics?.tokens?.output || 0)).toLocaleString()} (in: {(currentSession?.analytics?.tokens?.input || 0).toLocaleString()}, out: {(currentSession?.analytics?.tokens?.output || 0).toLocaleString()})
                          </span>
                        </div>
                        <div className="stat-row">
                          <div className="stat-keys">
                            <IconArtboardFilled size={14} />
                            <span className="stat-name">cache tokens</span>
                          </div>
                          <span className="stat-dots"></span>
                          <span className="stat-desc">
                            {((currentSession?.analytics?.tokens?.cacheSize || 0) + (currentSession?.analytics?.tokens?.cacheCreation || 0)).toLocaleString()} (read: {(currentSession?.analytics?.tokens?.cacheSize || 0).toLocaleString()}, new: {(currentSession?.analytics?.tokens?.cacheCreation || 0).toLocaleString()})
                          </span>
                        </div>
                      </div>
                    </div>
              <div className="stats-column">
                <div className="stats-section">
                  <div className="stat-row">
                    <div className="stat-keys">
                      <IconSend size={14} />
                      <span className="stat-name">messages</span>
                    </div>
                    <span className="stat-dots"></span>
                    <span className="stat-desc">
                      {(() => {
                        const messageCount = currentSession?.analytics?.totalMessages || 0;
                        console.log(`📊 [UI MESSAGES] Displaying message count:`, { 
                          sessionId: currentSession?.id,
                          totalMessages: messageCount,
                          hasAnalytics: !!currentSession?.analytics,
                          analytics: currentSession?.analytics
                        });
                        return messageCount;
                      })()}
                    </span>
                  </div>
                  <div className="stat-row">
                    <div className="stat-keys">
                      <IconTool size={14} />
                      <span className="stat-name">tool uses</span>
                    </div>
                    <span className="stat-dots"></span>
                    <span className="stat-desc">
                      {(() => {
                        const toolCount = currentSession?.analytics?.toolUses || 0;
                        console.log(`📊 [UI TOOLS] Displaying tool count:`, { 
                          sessionId: currentSession?.id,
                          toolUses: toolCount,
                          hasAnalytics: !!currentSession?.analytics
                        });
                        return toolCount;
                      })()}
                    </span>
                  </div>
                </div>
              </div>
              
              <div className="stats-column">
                <div className="stats-section">
                  <div className="stat-row">
                    <div className="stat-keys">
                      <IconBrain size={14} />
                      <span className="stat-name">opus %</span>
                    </div>
                    <span className="stat-dots"></span>
                    <span className="stat-desc">
                      {(() => {
                        const opusTokens = currentSession?.analytics?.tokens?.byModel?.opus?.total || 0;
                        const sonnetTokens = currentSession?.analytics?.tokens?.byModel?.sonnet?.total || 0;
                        // Use only NEW tokens (not cache) for model percentage
                        const totalNewTokens = opusTokens + sonnetTokens || 1;
                        const percentage = Math.round((opusTokens / totalNewTokens) * 100);
                        console.log('🎨 [OPUS UI] Rendering opus percentage:', {
                          opusTokens,
                          sonnetTokens,
                          totalNewTokens,
                          percentage,
                          byModel: currentSession?.analytics?.tokens?.byModel
                        });
                        return `${percentage}%`;
                      })()}
                    </span>
                  </div>
                  <div className="stat-row">
                    <div className="stat-keys">
                      <IconCoin size={14} />
                      <span className="stat-name">total</span>
                    </div>
                    <span className="stat-dots"></span>
                    <span className="stat-desc">
                      ${(() => {
                        // Use actual cost from Claude if available
                        if (currentSession?.analytics?.cost?.total) {
                          // Format cost to 2 decimal places for display
                          return currentSession.analytics.cost.total.toFixed(2);
                        }
                        
                        // Otherwise calculate based on token usage
                        const opusInput = currentSession?.analytics?.tokens?.byModel?.opus?.input || 0;
                        const opusOutput = currentSession?.analytics?.tokens?.byModel?.opus?.output || 0;
                        const sonnetInput = currentSession?.analytics?.tokens?.byModel?.sonnet?.input || 0;
                        const sonnetOutput = currentSession?.analytics?.tokens?.byModel?.sonnet?.output || 0;
                        
                        const opusCost = (opusInput / 1000000) * 15.00 + (opusOutput / 1000000) * 75.00;
                        const sonnetCost = (sonnetInput / 1000000) * 3.00 + (sonnetOutput / 1000000) * 15.00;
                        
                        return (opusCost + sonnetCost).toFixed(2);
                      })()}
                    </span>
                  </div>
                </div>
              </div>

                  </>
                );
              })()}
            </div>
            {/* Usage limits footer - only shown for Claude provider */}
            {(() => {
              const statsProvider = getProviderForModel(currentSession?.model || selectedModel);
              if (statsProvider !== 'claude') {
                return (
                  <div className="stats-footer">
                    <div className="stats-footer-row" style={{ opacity: 0.5, justifyContent: 'center' }}>
                      <span className="stats-footer-label">rate limits not available for {statsProvider}</span>
                    </div>
                  </div>
                );
              }
              return (
                <div className="stats-footer">
                  {/* Session Limit (5-hour) */}
                  <div className="stats-footer-row">
                    <span className="stats-footer-label"><span className="stats-footer-limit-name">claude 5h</span> - resets in {usageLimits?.five_hour?.resets_at ? formatResetTime(usageLimits.five_hour.resets_at) : '?'}</span>
                    <span className={`stats-footer-value ${(usageLimits?.five_hour?.utilization ?? 0) >= 90 ? 'usage-negative' : ''}`}>{usageLimits?.five_hour?.utilization != null ? Math.round(usageLimits.five_hour.utilization) + '%' : '?'}</span>
                  </div>
                  <div className="usage-bar">
                    <div
                      className="usage-bar-fill"
                      style={{
                        width: `${Math.min(usageLimits?.five_hour?.utilization ?? 0, 100)}%`,
                        background: (usageLimits?.five_hour?.utilization ?? 0) >= 90
                          ? 'var(--negative-color, #ff6b6b)'
                          : 'var(--accent-color)'
                      }}
                    />
                  </div>
                  <div className="usage-bar-ticks" style={{ marginBottom: '8px' }}>
                    {/* Ticks every 1h */}
                    {Array.from({ length: 6 }, (_, i) => (
                      <div key={i} className="usage-bar-tick" />
                    ))}
                  </div>

                  {/* Weekly Limit (7-day) */}
                  <div className="stats-footer-row">
                    <span className="stats-footer-label stats-footer-label-bold"><span className="stats-footer-limit-name">claude 7d</span> - resets in {usageLimits?.seven_day?.resets_at ? formatResetTime(usageLimits.seven_day.resets_at) : '?'}</span>
                    <span className={`stats-footer-value ${(usageLimits?.seven_day?.utilization ?? 0) >= 90 ? 'usage-negative' : ''}`}>{usageLimits?.seven_day?.utilization != null ? Math.round(usageLimits.seven_day.utilization) + '%' : '?'}</span>
                  </div>
                  <div className="usage-bar">
                    <div
                      className="usage-bar-fill"
                      style={{
                        width: `${Math.min(usageLimits?.seven_day?.utilization ?? 0, 100)}%`,
                        background: (usageLimits?.seven_day?.utilization ?? 0) >= 90
                          ? 'var(--negative-color, #ff6b6b)'
                          : 'var(--accent-color)'
                      }}
                    />
                  </div>
                  <div className="usage-bar-ticks">
                    {/* Ticks every 1d */}
                    {Array.from({ length: 8 }, (_, i) => (
                      <div key={i} className="usage-bar-tick" />
                    ))}
                  </div>
                </div>
              );
            })()}
          </div>
        </div>
      )}

      {/* Clear context confirmation dialog */}
      <ConfirmModal
        isOpen={showClearConfirm}
        title="clear context"
        message="this will clear all messages in this session. this cannot be undone."
        confirmText="clear"
        cancelText="no"
        isDangerous={true}
        onConfirm={confirmClearContext}
        onCancel={() => setShowClearConfirm(false)}
      />

      {/* Compact context confirmation dialog */}
      <ConfirmModal
        isOpen={showCompactConfirm}
        title="compact context"
        message="this will summarize the conversation to reduce token usage."
        confirmText="compact"
        cancelText="no"
        isDangerous={true}
        onConfirm={confirmCompactContext}
        onCancel={() => setShowCompactConfirm(false)}
      />

      {/* Rollback confirmation dialog */}
      <ConfirmModal
        isOpen={showRollbackConfirm}
        title="rollback"
        message={pendingRollbackData ? (
          pendingRollbackData.conflicts && pendingRollbackData.conflicts.length > 0
            ? `⚠️ CONFLICT WARNING\n\n${pendingRollbackData.conflicts.length} file(s) modified since snapshot:\n${pendingRollbackData.conflicts.slice(0, 3).map(c => `• ${c.path.split(/[/\\]/).pop()} (${c.source || c.conflictType})`).join('\n')}${pendingRollbackData.conflicts.length > 3 ? `\n• ...and ${pendingRollbackData.conflicts.length - 3} more` : ''}\n\nrollback will OVERWRITE these changes.\nremove ${pendingRollbackData.messagesToRemove} message(s)${pendingRollbackData.filesToRestore.length > 0 ? ` and restore ${pendingRollbackData.filesToRestore.length} file(s)` : ''}?`
            : `remove ${pendingRollbackData.messagesToRemove} message(s)${pendingRollbackData.filesToRestore.length > 0 ? ` and restore ${pendingRollbackData.filesToRestore.length} file(s)` : ''}?`
        ) : 'rollback to this point?'}
        confirmText={pendingRollbackData?.conflicts?.length ? "force rollback" : "rollback"}
        cancelText="no"
        isDangerous={true}
        onConfirm={confirmRollback}
        onCancel={() => {
          setShowRollbackConfirm(false);
          setPendingRollbackData(null);
        }}
      />

      {/* Resume conversations modal */}
      <RecentConversationsModal
        isOpen={showResumeModal}
        onClose={() => { setShowResumeModal(false); resetHoverStates(); }}
        onConversationSelect={handleResumeConversation}
        workingDirectory={currentSession?.workingDirectory}
      />

      {/* CLAUDE.md Editor Modal */}
      {showClaudeMdEditor && currentSession?.workingDirectory && (
        <React.Suspense fallback={null}>
          <ClaudeMdEditorModal
            isOpen={showClaudeMdEditor}
            onClose={() => { setShowClaudeMdEditor(false); resetHoverStates(); }}
            workingDirectory={currentSession.workingDirectory}
          />
        </React.Suspense>
      )}
    </div>
  );
};

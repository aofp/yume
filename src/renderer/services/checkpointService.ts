import { claudeCodeClient } from './claudeCodeClient';
import { logger } from '../utils/structuredLogger';

export interface FileSnapshot {
  path: string;
  content: string;
  timestamp: number;
}

export interface TimelineCheckpoint {
  id: string;
  sessionId: string;
  projectPath: string;
  parentId: string | null;
  createdAt: string;
  messageCount: number;
  metadata: {
    description: string;
    trigger: 'manual' | 'auto' | 'fork';
    tokensUsed: number;
    model: string;
    messageIds: string[];
  };
  fileSnapshots: FileSnapshot[];
}

export interface TimelineBranch {
  id: string;
  name: string;
  parentCheckpointId: string;
  createdAt: string;
}

export interface Timeline {
  sessionId: string;
  rootCheckpoint: string;
  currentCheckpoint: string;
  checkpoints: Map<string, TimelineCheckpoint>;
  branches: TimelineBranch[];
}

class CheckpointService {
  private checkpointsCache = new Map<string, TimelineCheckpoint[]>();
  private timelinesCache = new Map<string, Timeline>();

  private get socket() {
    return claudeCodeClient.getSocket();
  }

  constructor() {
    this.setupListeners();
  }

  private setupListeners() {
    // DISABLED: Timeline/checkpoint feature is not used (see ClaudeChat.tsx line 3684)
    // Socket listeners are not needed since TimelineNavigator is commented out
    return;

    /* Dead code - kept for reference
    const socket = this.socket;
    if (!socket) return;

    socket.on('checkpoint-created', (data: { sessionId: string; checkpoint: TimelineCheckpoint }) => {
      logger.info('[Checkpoint] Created:', data);
      const { sessionId, checkpoint } = data;

      // Update cache
      if (!this.checkpointsCache.has(sessionId)) {
        this.checkpointsCache.set(sessionId, []);
      }
      this.checkpointsCache.get(sessionId)?.push(checkpoint);

      // Notify UI components
      window.dispatchEvent(new CustomEvent('checkpoint-created', {
        detail: { sessionId, checkpoint }
      }));
    });

    socket.on('checkpoint-restored', (data: { sessionId: string; checkpointId: string; messages: unknown[] }) => {
      logger.info('[Checkpoint] Restored:', data);
      const { sessionId, checkpointId, messages } = data;

      // Update timeline cache
      const timeline = this.timelinesCache.get(sessionId);
      if (timeline) {
        timeline.currentCheckpoint = checkpointId;
      }

      // Notify UI components
      window.dispatchEvent(new CustomEvent('checkpoint-restored', {
        detail: { sessionId, checkpointId, messages }
      }));
    });

    socket.on('checkpoint-error', (data: { sessionId?: string; error: string }) => {
      logger.error('[Checkpoint] Error:', data);
      window.dispatchEvent(new CustomEvent('checkpoint-error', {
        detail: data
      }));
    });

    socket.on('timeline-data', (data: { sessionId: string; timeline?: Timeline; checkpoints?: TimelineCheckpoint[] }) => {
      logger.info('[Checkpoint] Timeline data received:', data);
      const { sessionId, timeline, checkpoints } = data;

      // Update caches
      if (timeline) {
        this.timelinesCache.set(sessionId, timeline);
      }
      if (checkpoints) {
        this.checkpointsCache.set(sessionId, checkpoints);
      }

      // Notify UI components
      window.dispatchEvent(new CustomEvent('timeline-updated', {
        detail: { sessionId, timeline, checkpoints }
      }));
    });
    */
  }

  // Create a new checkpoint
  createCheckpoint(sessionId: string, description: string, trigger: 'manual' | 'auto' | 'fork' = 'manual'): Promise<TimelineCheckpoint> {
    return new Promise((resolve, reject) => {
      logger.info(`[Checkpoint] Creating for session ${sessionId}: ${description}`);

      const handleCreated = (event: CustomEvent<{ sessionId: string; checkpoint: TimelineCheckpoint }>) => {
        const detail = event.detail;
        if (detail.sessionId === sessionId) {
          window.removeEventListener('checkpoint-created', handleCreated as EventListener);
          window.removeEventListener('checkpoint-error', handleError as EventListener);
          resolve(detail.checkpoint);
        }
      };

      const handleError = (event: CustomEvent<{ sessionId?: string; error: string }>) => {
        const detail = event.detail;
        if (detail.sessionId === sessionId) {
          window.removeEventListener('checkpoint-created', handleCreated as EventListener);
          window.removeEventListener('checkpoint-error', handleError as EventListener);
          reject(new Error(detail.error));
        }
      };

      window.addEventListener('checkpoint-created', handleCreated as EventListener);
      window.addEventListener('checkpoint-error', handleError as EventListener);

      this.socket?.emit('create-checkpoint', {
        sessionId,
        description,
        trigger,
      });

      // Timeout after 10 seconds
      setTimeout(() => {
        window.removeEventListener('checkpoint-created', handleCreated as EventListener);
        window.removeEventListener('checkpoint-error', handleError as EventListener);
        reject(new Error('Checkpoint creation timeout'));
      }, 10000);
    });
  }

  // Restore to a checkpoint
  restoreCheckpoint(sessionId: string, checkpointId: string): Promise<void> {
    return new Promise((resolve, reject) => {
      logger.info(`[Checkpoint] Restoring ${checkpointId} for session ${sessionId}`);

      const handleRestored = (event: CustomEvent<{ sessionId: string; checkpointId: string; messages: unknown[] }>) => {
        const detail = event.detail;
        if (detail.sessionId === sessionId && detail.checkpointId === checkpointId) {
          window.removeEventListener('checkpoint-restored', handleRestored as EventListener);
          window.removeEventListener('checkpoint-error', handleError as EventListener);
          resolve();
        }
      };

      const handleError = (event: CustomEvent<{ sessionId?: string; error: string }>) => {
        const detail = event.detail;
        if (detail.sessionId === sessionId) {
          window.removeEventListener('checkpoint-restored', handleRestored as EventListener);
          window.removeEventListener('checkpoint-error', handleError as EventListener);
          reject(new Error(detail.error));
        }
      };

      window.addEventListener('checkpoint-restored', handleRestored as EventListener);
      window.addEventListener('checkpoint-error', handleError as EventListener);

      this.socket?.emit('restore-checkpoint', {
        sessionId,
        checkpointId,
      });

      // Timeout after 10 seconds
      setTimeout(() => {
        window.removeEventListener('checkpoint-restored', handleRestored as EventListener);
        window.removeEventListener('checkpoint-error', handleError as EventListener);
        reject(new Error('Checkpoint restoration timeout'));
      }, 10000);
    });
  }

  // Get timeline for a session
  getTimeline(sessionId: string): Promise<{ timeline: Timeline | null; checkpoints: TimelineCheckpoint[] }> {
    return new Promise((resolve) => {
      logger.info(`[Checkpoint] Getting timeline for session ${sessionId}`);

      // Check cache first
      const cachedTimeline = this.timelinesCache.get(sessionId);
      const cachedCheckpoints = this.checkpointsCache.get(sessionId) || [];

      if (cachedTimeline || cachedCheckpoints.length > 0) {
        resolve({
          timeline: cachedTimeline || null,
          checkpoints: cachedCheckpoints,
        });
      }

      const handleTimeline = (event: CustomEvent<{ sessionId: string; timeline?: Timeline; checkpoints?: TimelineCheckpoint[] }>) => {
        const detail = event.detail;
        if (detail.sessionId === sessionId) {
          window.removeEventListener('timeline-updated', handleTimeline as EventListener);
          resolve({
            timeline: detail.timeline || null,
            checkpoints: detail.checkpoints || [],
          });
        }
      };

      window.addEventListener('timeline-updated', handleTimeline as EventListener);

      this.socket?.emit('get-timeline', { sessionId });

      // Return cached data after 2 seconds if no response
      setTimeout(() => {
        window.removeEventListener('timeline-updated', handleTimeline as EventListener);
        resolve({
          timeline: cachedTimeline || null,
          checkpoints: cachedCheckpoints,
        });
      }, 2000);
    });
  }

  // Fork from a checkpoint
  async forkCheckpoint(sessionId: string, checkpointId: string, description: string): Promise<TimelineCheckpoint> {
    // First restore to the checkpoint
    await this.restoreCheckpoint(sessionId, checkpointId);
    
    // Then create a new checkpoint with fork trigger
    return this.createCheckpoint(sessionId, description, 'fork');
  }

  // Get checkpoints for a session
  getCheckpoints(sessionId: string): TimelineCheckpoint[] {
    return this.checkpointsCache.get(sessionId) || [];
  }

  // Clear cache for a session
  clearCache(sessionId: string) {
    this.checkpointsCache.delete(sessionId);
    this.timelinesCache.delete(sessionId);
  }

  // Auto-checkpoint logic
  shouldAutoCheckpoint(messageCount: number, tokenCount: number): boolean {
    // Auto-checkpoint every 10 messages or 5000 tokens
    return messageCount % 10 === 0 || tokenCount > 5000;
  }
}

export const checkpointService = new CheckpointService();
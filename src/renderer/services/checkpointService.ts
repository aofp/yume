import { claudeCodeClient } from './claudeCodeClient';

export interface Checkpoint {
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
  fileSnapshots: any[]; // TODO: Add proper file snapshot types
}

export interface Timeline {
  sessionId: string;
  rootCheckpoint: string;
  currentCheckpoint: string;
  checkpoints: Map<string, Checkpoint>;
  branches: any[]; // TODO: Add branch types
}

class CheckpointService {
  private socket = claudeCodeClient.socket;
  private checkpointsCache = new Map<string, Checkpoint[]>();
  private timelinesCache = new Map<string, Timeline>();

  constructor() {
    this.setupListeners();
  }

  private setupListeners() {
    this.socket.on('checkpoint-created', (data: any) => {
      console.log('✅ Checkpoint created:', data);
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

    this.socket.on('checkpoint-restored', (data: any) => {
      console.log('✅ Checkpoint restored:', data);
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

    this.socket.on('checkpoint-error', (data: any) => {
      console.error('❌ Checkpoint error:', data);
      window.dispatchEvent(new CustomEvent('checkpoint-error', { 
        detail: data 
      }));
    });

    this.socket.on('timeline-data', (data: any) => {
      console.log('📊 Timeline data received:', data);
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
  }

  // Create a new checkpoint
  createCheckpoint(sessionId: string, description: string, trigger: 'manual' | 'auto' | 'fork' = 'manual'): Promise<Checkpoint> {
    return new Promise((resolve, reject) => {
      console.log(`📸 Creating checkpoint for session ${sessionId}: ${description}`);
      
      const handleCreated = (event: any) => {
        const detail = event.detail;
        if (detail.sessionId === sessionId) {
          window.removeEventListener('checkpoint-created', handleCreated);
          window.removeEventListener('checkpoint-error', handleError);
          resolve(detail.checkpoint);
        }
      };
      
      const handleError = (event: any) => {
        const detail = event.detail;
        if (detail.sessionId === sessionId) {
          window.removeEventListener('checkpoint-created', handleCreated);
          window.removeEventListener('checkpoint-error', handleError);
          reject(new Error(detail.error));
        }
      };
      
      window.addEventListener('checkpoint-created', handleCreated);
      window.addEventListener('checkpoint-error', handleError);
      
      this.socket.emit('create-checkpoint', {
        sessionId,
        description,
        trigger,
      });
      
      // Timeout after 10 seconds
      setTimeout(() => {
        window.removeEventListener('checkpoint-created', handleCreated);
        window.removeEventListener('checkpoint-error', handleError);
        reject(new Error('Checkpoint creation timeout'));
      }, 10000);
    });
  }

  // Restore to a checkpoint
  restoreCheckpoint(sessionId: string, checkpointId: string): Promise<void> {
    return new Promise((resolve, reject) => {
      console.log(`⏮️ Restoring checkpoint ${checkpointId} for session ${sessionId}`);
      
      const handleRestored = (event: any) => {
        const detail = event.detail;
        if (detail.sessionId === sessionId && detail.checkpointId === checkpointId) {
          window.removeEventListener('checkpoint-restored', handleRestored);
          window.removeEventListener('checkpoint-error', handleError);
          resolve();
        }
      };
      
      const handleError = (event: any) => {
        const detail = event.detail;
        if (detail.sessionId === sessionId) {
          window.removeEventListener('checkpoint-restored', handleRestored);
          window.removeEventListener('checkpoint-error', handleError);
          reject(new Error(detail.error));
        }
      };
      
      window.addEventListener('checkpoint-restored', handleRestored);
      window.addEventListener('checkpoint-error', handleError);
      
      this.socket.emit('restore-checkpoint', {
        sessionId,
        checkpointId,
      });
      
      // Timeout after 10 seconds
      setTimeout(() => {
        window.removeEventListener('checkpoint-restored', handleRestored);
        window.removeEventListener('checkpoint-error', handleError);
        reject(new Error('Checkpoint restoration timeout'));
      }, 10000);
    });
  }

  // Get timeline for a session
  getTimeline(sessionId: string): Promise<{ timeline: Timeline | null; checkpoints: Checkpoint[] }> {
    return new Promise((resolve) => {
      console.log(`📊 Getting timeline for session ${sessionId}`);
      
      // Check cache first
      const cachedTimeline = this.timelinesCache.get(sessionId);
      const cachedCheckpoints = this.checkpointsCache.get(sessionId) || [];
      
      if (cachedTimeline || cachedCheckpoints.length > 0) {
        resolve({
          timeline: cachedTimeline || null,
          checkpoints: cachedCheckpoints,
        });
      }
      
      const handleTimeline = (event: any) => {
        const detail = event.detail;
        if (detail.sessionId === sessionId) {
          window.removeEventListener('timeline-updated', handleTimeline);
          resolve({
            timeline: detail.timeline,
            checkpoints: detail.checkpoints,
          });
        }
      };
      
      window.addEventListener('timeline-updated', handleTimeline);
      
      this.socket.emit('get-timeline', { sessionId });
      
      // Return cached data after 2 seconds if no response
      setTimeout(() => {
        window.removeEventListener('timeline-updated', handleTimeline);
        resolve({
          timeline: cachedTimeline || null,
          checkpoints: cachedCheckpoints,
        });
      }, 2000);
    });
  }

  // Fork from a checkpoint
  async forkCheckpoint(sessionId: string, checkpointId: string, description: string): Promise<Checkpoint> {
    // First restore to the checkpoint
    await this.restoreCheckpoint(sessionId, checkpointId);
    
    // Then create a new checkpoint with fork trigger
    return this.createCheckpoint(sessionId, description, 'fork');
  }

  // Get checkpoints for a session
  getCheckpoints(sessionId: string): Checkpoint[] {
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
import { io, Socket } from 'socket.io-client';
import { APIClient } from './api';
import type {
  RepoCommentsConfig,
  Thread,
  Message,
  CreateThreadInput,
  Context,
  EventType,
  EventHandler,
} from './types';

class RepoCommentsSDK {
  private config: RepoCommentsConfig | null = null;
  private api: APIClient | null = null;
  private socket: Socket | null = null;
  private eventHandlers: Map<EventType, Set<EventHandler>> = new Map();
  private uiRoot: HTMLElement | null = null;
  private isInitialized: boolean = false;

  /**
   * Initialize the RepoComments SDK
   */
  init(config: RepoCommentsConfig): void {
    if (this.isInitialized) {
      console.warn('RepoComments already initialized');
      return;
    }

    this.config = {
      branch: this.detectGitBranch(),
      commit: this.detectGitCommit(),
      enableUIComments: true,
      enableCodeComments: false,
      mode: 'full',
      position: 'right',
      theme: 'auto',
      ...config,
    };

    this.api = new APIClient(this.config.apiUrl);
    this.connectWebSocket();
    this.injectUI();
    this.isInitialized = true;

    console.log('[RepoComments] Initialized', this.config);
  }

  /**
   * Get current context
   */
  getContext(): Context {
    if (!this.config) {
      throw new Error('RepoComments not initialized');
    }

    return {
      repo: this.config.repo,
      branch: this.config.branch!,
      commit: this.config.commit,
    };
  }

  /**
   * Create a new thread programmatically
   */
  async createThread(input: CreateThreadInput): Promise<Thread> {
    if (!this.api || !this.config) {
      throw new Error('RepoComments not initialized');
    }

    const thread = await this.api.createThread({
      repo: this.config.repo,
      branch: this.config.branch!,
      commit_hash: this.config.commit,
      context_type: input.type,
      file_path: input.filePath,
      line_start: input.lineStart,
      line_end: input.lineEnd,
      code_snippet: input.codeSnippet,
      selector: input.selector,
      xpath: input.xpath,
      coordinates: input.coordinates,
      message: input.message,
      priority: input.priority,
      tags: input.tags,
    });

    this.emit('thread:created', thread);
    return thread;
  }

  /**
   * Get threads for current context
   */
  async getThreads(filters?: {
    status?: 'open' | 'resolved';
    context_type?: 'code' | 'ui';
  }): Promise<Thread[]> {
    if (!this.api || !this.config) {
      throw new Error('RepoComments not initialized');
    }

    return this.api.getThreads({
      repo: this.config.repo,
      branch: this.config.branch,
      ...filters,
    });
  }

  /**
   * Add message to a thread
   */
  async addMessage(threadId: string, content: string): Promise<Message> {
    if (!this.api) {
      throw new Error('RepoComments not initialized');
    }

    return this.api.addMessage(threadId, { content });
  }

  /**
   * Resolve a thread
   */
  async resolveThread(threadId: string): Promise<Thread> {
    if (!this.api) {
      throw new Error('RepoComments not initialized');
    }

    return this.api.updateThread(threadId, { status: 'resolved' });
  }

  /**
   * Reopen a thread
   */
  async reopenThread(threadId: string): Promise<Thread> {
    if (!this.api) {
      throw new Error('RepoComments not initialized');
    }

    return this.api.updateThread(threadId, { status: 'open' });
  }

  /**
   * Set authentication token
   */
  setToken(token: string): void {
    if (!this.api) {
      throw new Error('RepoComments not initialized');
    }

    this.api.setToken(token);

    // Reconnect WebSocket with new token
    if (this.socket) {
      this.socket.disconnect();
      this.connectWebSocket();
    }
  }

  /**
   * Get current user
   */
  async getCurrentUser() {
    if (!this.api) {
      throw new Error('RepoComments not initialized');
    }

    return this.api.getCurrentUser();
  }

  /**
   * Listen to events
   */
  on<T = any>(event: EventType, handler: EventHandler<T>): void {
    if (!this.eventHandlers.has(event)) {
      this.eventHandlers.set(event, new Set());
    }
    this.eventHandlers.get(event)!.add(handler);
  }

  /**
   * Remove event listener
   */
  off(event: EventType, handler: EventHandler): void {
    const handlers = this.eventHandlers.get(event);
    if (handlers) {
      handlers.delete(handler);
    }
  }

  /**
   * Destroy the SDK and cleanup
   */
  destroy(): void {
    if (this.socket) {
      this.socket.disconnect();
      this.socket = null;
    }

    if (this.uiRoot) {
      this.uiRoot.remove();
      this.uiRoot = null;
    }

    this.eventHandlers.clear();
    this.config = null;
    this.api = null;
    this.isInitialized = false;

    console.log('[RepoComments] Destroyed');
  }

  // Private methods

  private emit(event: EventType, data: any): void {
    const handlers = this.eventHandlers.get(event);
    if (handlers) {
      handlers.forEach((handler) => handler(data));
    }

    // Call config callbacks
    if (this.config) {
      if (event === 'thread:created' && this.config.onThreadCreated) {
        this.config.onThreadCreated(data);
      }
      if (event === 'thread:resolved' && this.config.onThreadResolved) {
        this.config.onThreadResolved(data);
      }
      if (event === 'message:added' && this.config.onMessageAdded) {
        this.config.onMessageAdded(data);
      }
    }
  }

  private connectWebSocket(): void {
    if (!this.config || !this.api) return;

    const token = this.api.getToken();
    if (!token) {
      console.warn('[RepoComments] No auth token, WebSocket not connected');
      return;
    }

    this.socket = io(this.config.apiUrl, {
      auth: { token },
      transports: ['websocket'],
    });

    this.socket.on('connect', () => {
      console.log('[RepoComments] WebSocket connected');
      // Subscribe to current repo
      this.socket?.emit('subscribe', {
        repo: this.config!.repo,
        branch: this.config!.branch,
      });
    });

    this.socket.on('disconnect', () => {
      console.log('[RepoComments] WebSocket disconnected');
    });

    this.socket.on('thread:created', (thread: Thread) => {
      this.emit('thread:created', thread);
    });

    this.socket.on('thread:updated', (thread: Thread) => {
      this.emit('thread:updated', thread);
      if (thread.status === 'resolved') {
        this.emit('thread:resolved', thread);
      }
    });

    this.socket.on('message:added', ({ threadId, message }: any) => {
      this.emit('message:added', { threadId, message });
    });

    this.socket.on('error', (error: any) => {
      console.error('[RepoComments] WebSocket error', error);
    });
  }

  private injectUI(): void {
    // Create root container for React UI
    const root = document.createElement('div');
    root.id = 'repo-comments-root';
    root.setAttribute('data-theme', this.config!.theme!);
    root.setAttribute('data-position', this.config!.position!);
    document.body.appendChild(root);
    this.uiRoot = root;

    // Dynamically import and render React UI
    // This will be handled by the UI components
    import('./components/App').then((module) => {
      module.renderApp(root, this);
    });
  }

  private detectGitBranch(): string | undefined {
    // Try to detect from environment variables (common in CI/CD)
    return (
      process.env.GIT_BRANCH ||
      process.env.BRANCH_NAME ||
      process.env.GITHUB_REF_NAME ||
      undefined
    );
  }

  private detectGitCommit(): string | undefined {
    return (
      process.env.GIT_COMMIT ||
      process.env.COMMIT_SHA ||
      process.env.GITHUB_SHA ||
      undefined
    );
  }
}

// Singleton instance
const RepoComments = new RepoCommentsSDK();

export default RepoComments;
export { RepoComments };

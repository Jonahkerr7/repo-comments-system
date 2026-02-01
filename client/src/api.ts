import type {
  Thread,
  ThreadWithMessages,
  Message,
  User,
  CreateThreadInput,
} from './types';

export class APIClient {
  private baseUrl: string;
  private token: string | null = null;

  constructor(baseUrl: string) {
    this.baseUrl = baseUrl.replace(/\/$/, '');
  }

  setToken(token: string) {
    this.token = token;
    localStorage.setItem('repo-comments-token', token);
  }

  getToken(): string | null {
    if (!this.token) {
      this.token = localStorage.getItem('repo-comments-token');
    }
    return this.token;
  }

  clearToken() {
    this.token = null;
    localStorage.removeItem('repo-comments-token');
  }

  private async request<T>(
    endpoint: string,
    options: RequestInit = {}
  ): Promise<T> {
    const token = this.getToken();

    const headers: HeadersInit = {
      'Content-Type': 'application/json',
      ...options.headers,
    };

    if (token) {
      headers['Authorization'] = `Bearer ${token}`;
    }

    const response = await fetch(`${this.baseUrl}${endpoint}`, {
      ...options,
      headers,
      credentials: 'include',
    });

    if (!response.ok) {
      const error = await response.json().catch(() => ({ error: 'Request failed' }));
      throw new Error(error.error || `HTTP ${response.status}`);
    }

    if (response.status === 204) {
      return undefined as T;
    }

    return response.json();
  }

  // Auth
  async getCurrentUser(): Promise<User> {
    return this.request<User>('/api/v1/auth/user');
  }

  async logout(): Promise<void> {
    await this.request('/api/v1/auth/logout', { method: 'POST' });
    this.clearToken();
  }

  // Threads
  async getThreads(params: {
    repo: string;
    branch?: string;
    status?: 'open' | 'resolved';
    context_type?: 'code' | 'ui';
  }): Promise<Thread[]> {
    const searchParams = new URLSearchParams();
    Object.entries(params).forEach(([key, value]) => {
      if (value !== undefined) {
        searchParams.append(key, value);
      }
    });

    return this.request<Thread[]>(`/api/v1/threads?${searchParams}`);
  }

  async getThread(id: string): Promise<ThreadWithMessages> {
    return this.request<ThreadWithMessages>(`/api/v1/threads/${id}`);
  }

  async createThread(data: {
    repo: string;
    branch: string;
    commit_hash?: string;
    context_type: 'code' | 'ui';
    file_path?: string;
    line_start?: number;
    line_end?: number;
    code_snippet?: string;
    selector?: string;
    xpath?: string;
    coordinates?: any;
    screenshot_url?: string;
    message: string;
    priority?: string;
    tags?: string[];
  }): Promise<Thread> {
    return this.request<Thread>('/api/v1/threads', {
      method: 'POST',
      body: JSON.stringify(data),
    });
  }

  async updateThread(
    id: string,
    data: {
      status?: 'open' | 'resolved';
      priority?: 'low' | 'normal' | 'high' | 'critical';
      tags?: string[];
    }
  ): Promise<Thread> {
    return this.request<Thread>(`/api/v1/threads/${id}`, {
      method: 'PATCH',
      body: JSON.stringify(data),
    });
  }

  async deleteThread(id: string): Promise<void> {
    return this.request(`/api/v1/threads/${id}`, { method: 'DELETE' });
  }

  // Messages
  async addMessage(
    threadId: string,
    data: {
      content: string;
      parent_message_id?: string;
    }
  ): Promise<Message> {
    return this.request<Message>(`/api/v1/threads/${threadId}/messages`, {
      method: 'POST',
      body: JSON.stringify(data),
    });
  }

  async updateMessage(
    threadId: string,
    messageId: string,
    content: string
  ): Promise<Message> {
    return this.request<Message>(
      `/api/v1/threads/${threadId}/messages/${messageId}`,
      {
        method: 'PATCH',
        body: JSON.stringify({ content }),
      }
    );
  }

  async deleteMessage(threadId: string, messageId: string): Promise<void> {
    return this.request(`/api/v1/threads/${threadId}/messages/${messageId}`, {
      method: 'DELETE',
    });
  }

  async addReaction(
    threadId: string,
    messageId: string,
    emoji: string
  ): Promise<void> {
    return this.request(
      `/api/v1/threads/${threadId}/messages/${messageId}/reactions`,
      {
        method: 'POST',
        body: JSON.stringify({ emoji }),
      }
    );
  }

  async removeReaction(
    threadId: string,
    messageId: string,
    emoji: string
  ): Promise<void> {
    return this.request(
      `/api/v1/threads/${threadId}/messages/${messageId}/reactions/${emoji}`,
      {
        method: 'DELETE',
      }
    );
  }
}

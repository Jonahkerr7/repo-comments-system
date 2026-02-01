export interface RepoCommentsConfig {
  apiUrl: string;
  repo: string;
  branch?: string;
  commit?: string;
  enableUIComments?: boolean;
  enableCodeComments?: boolean;
  mode?: 'full' | 'readonly';
  position?: 'right' | 'left';
  theme?: 'light' | 'dark' | 'auto';
  onThreadCreated?: (thread: Thread) => void;
  onThreadResolved?: (thread: Thread) => void;
  onMessageAdded?: (message: Message) => void;
}

export interface Coordinates {
  x: number;
  y: number;
  width?: number;
  height?: number;
}

export interface Thread {
  id: string;
  repo: string;
  branch: string;
  commit_hash: string | null;
  context_type: 'code' | 'ui';
  file_path: string | null;
  line_start: number | null;
  line_end: number | null;
  code_snippet: string | null;
  selector: string | null;
  xpath: string | null;
  coordinates: Coordinates | null;
  screenshot_url: string | null;
  status: 'open' | 'resolved';
  priority: 'low' | 'normal' | 'high' | 'critical';
  tags: string[];
  created_by: string;
  resolved_by: string | null;
  created_at: string;
  updated_at: string;
  resolved_at: string | null;
}

export interface ThreadWithMessages extends Thread {
  messages: MessageWithAuthor[];
  message_count: number;
  creator_name: string;
  creator_email: string;
  creator_avatar: string | null;
}

export interface Message {
  id: string;
  thread_id: string;
  author_id: string;
  content: string;
  parent_message_id: string | null;
  mentions: string[];
  attachments: Attachment[] | null;
  created_at: string;
  updated_at: string;
  edited: boolean;
}

export interface MessageWithAuthor extends Message {
  author_name: string;
  author_email: string;
  author_avatar: string | null;
}

export interface Attachment {
  url: string;
  type: string;
  name: string;
  size?: number;
}

export interface User {
  id: string;
  email: string;
  name: string;
  avatar_url: string | null;
}

export interface CreateThreadInput {
  type: 'ui' | 'code';
  selector?: string;
  xpath?: string;
  coordinates?: Coordinates;
  filePath?: string;
  lineStart?: number;
  lineEnd?: number;
  codeSnippet?: string;
  message: string;
  priority?: 'low' | 'normal' | 'high' | 'critical';
  tags?: string[];
}

export interface Context {
  repo: string;
  branch: string;
  commit?: string;
}

export type EventType =
  | 'thread:created'
  | 'thread:updated'
  | 'thread:resolved'
  | 'message:added';

export type EventHandler<T = any> = (data: T) => void;

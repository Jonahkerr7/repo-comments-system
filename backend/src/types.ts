export interface User {
  id: string;
  email: string;
  name: string;
  avatar_url: string | null;
  provider: 'github' | 'google' | 'okta' | 'internal';
  provider_id: string;
  created_at: Date;
  last_login: Date | null;
}

export interface Thread {
  id: string;
  repo: string;
  branch: string;
  commit_hash: string | null;
  context_type: 'code' | 'ui';

  // Code context
  file_path: string | null;
  line_start: number | null;
  line_end: number | null;
  code_snippet: string | null;

  // UI context
  selector: string | null;
  xpath: string | null;
  coordinates: Coordinates | null;
  screenshot_url: string | null;
  view_context: ViewContext | null;

  // Metadata
  status: 'open' | 'resolved';
  priority: 'low' | 'normal' | 'high' | 'critical';
  tags: string[];

  // Audit
  created_by: string;
  resolved_by: string | null;
  created_at: Date;
  updated_at: Date;
  resolved_at: Date | null;
}

export interface Coordinates {
  x: number;
  y: number;
  width?: number;
  height?: number;
}

export interface ViewContext {
  hash?: string;
  pathname?: string;
  activeTabs?: string[];
  activeModal?: string | null;
}

export interface Message {
  id: string;
  thread_id: string;
  author_id: string;
  content: string;
  parent_message_id: string | null;
  mentions: string[];
  attachments: Attachment[] | null;
  created_at: Date;
  updated_at: Date;
  edited: boolean;
}

export interface Attachment {
  url: string;
  type: string;
  name: string;
  size?: number;
}

export interface Permission {
  id: string;
  repo: string;
  user_id: string | null;
  team_id: string | null;
  role: 'admin' | 'write' | 'read';
  created_at: Date;
}

export interface ThreadSummary extends Thread {
  creator_name: string;
  creator_email: string;
  creator_avatar: string | null;
  message_count: number;
  last_activity: Date | null;
}

export interface CreateThreadRequest {
  repo: string;
  branch: string;
  commit_hash?: string;
  context_type: 'code' | 'ui';

  // Code context
  file_path?: string;
  line_start?: number;
  line_end?: number;
  code_snippet?: string;

  // UI context
  selector?: string;
  xpath?: string;
  coordinates?: Coordinates;
  screenshot_url?: string;
  screenshot?: string; // Base64 data URL
  element_tag?: string;
  element_text?: string;
  view_context?: ViewContext;

  // Initial message
  message: string;

  // Optional metadata
  priority?: 'low' | 'normal' | 'high' | 'critical';
  tags?: string[];
}

export interface CreateMessageRequest {
  content: string;
  parent_message_id?: string;
}

export interface UpdateThreadRequest {
  status?: 'open' | 'resolved';
  priority?: 'low' | 'normal' | 'high' | 'critical';
  tags?: string[];
  coordinates?: { x: number; y: number };
  selector?: string;
  view_context?: ViewContext;
}

import { Request } from 'express';

export interface AuthenticatedRequest extends Request {
  user?: User;
}

export interface JWTPayload {
  id: string;
  email: string;
  name: string;
}

export interface WebSocketMessage {
  type: 'subscribe' | 'unsubscribe' | 'thread:created' | 'thread:updated' | 'message:added';
  data?: any;
  repo?: string;
  branch?: string;
}

export interface UserPermission {
  user_id: string;
  email: string;
  repo: string;
  role: 'admin' | 'write' | 'read';
  source: string;
}

export interface Notification {
  id: string;
  user_id: string;
  thread_id: string | null;
  message_id: string | null;
  type: 'mention' | 'reply' | 'resolved' | 'assigned';
  content: string;
  read: boolean;
  created_at: Date;
  read_at: Date | null;
}

export interface AuditLog {
  id: string;
  user_id: string | null;
  action: string;
  resource_type: string;
  resource_id: string | null;
  metadata: Record<string, any> | null;
  ip_address: string | null;
  user_agent: string | null;
  created_at: Date;
}

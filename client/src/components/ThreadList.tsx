import React from 'react';
import type { Thread } from '../types';
import { formatRelativeTime } from '../utils/time';

interface ThreadListProps {
  threads: Thread[];
  onThreadSelect: (thread: Thread) => void;
  onStartAddComment: () => void;
}

export function ThreadList({ threads, onThreadSelect, onStartAddComment }: ThreadListProps) {
  if (threads.length === 0) {
    return (
      <div className="rc-thread-list">
        <div className="rc-empty">
          <div className="rc-empty-icon">💬</div>
          <p className="rc-empty-text">No comments yet</p>
          <button
            className="rc-button"
            onClick={onStartAddComment}
            style={{ marginTop: '16px' }}
          >
            Add comment
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="rc-thread-list">
      <button
        className="rc-button"
        onClick={onStartAddComment}
        style={{ width: '100%', marginBottom: '16px' }}
      >
        + Add comment
      </button>

      {threads.map((thread) => (
        <ThreadItem key={thread.id} thread={thread} onClick={() => onThreadSelect(thread)} />
      ))}
    </div>
  );
}

interface ThreadItemProps {
  thread: Thread;
  onClick: () => void;
}

function ThreadItem({ thread, onClick }: ThreadItemProps) {
  const isResolved = thread.status === 'resolved';
  const firstMessage = thread.messages?.[0];
  const messageCount = thread.message_count || thread.messages?.length || 0;

  return (
    <div className="rc-thread" onClick={onClick}>
      <div className="rc-thread-header">
        <div className="rc-avatar">
          {thread.creator_avatar ? (
            <img src={thread.creator_avatar} alt={thread.creator_name} />
          ) : (
            thread.creator_name?.charAt(0).toUpperCase() || '?'
          )}
        </div>
        <div className="rc-thread-meta">
          <div>
            <span className="rc-thread-author">{thread.creator_name}</span>
            <span className="rc-thread-time">{formatRelativeTime(thread.created_at)}</span>
          </div>
        </div>
      </div>

      {firstMessage && (
        <div className="rc-thread-content">{firstMessage.content}</div>
      )}

      <div className="rc-thread-footer">
        {messageCount > 1 && (
          <div className="rc-thread-replies">
            <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
              <path
                d="M13 9.5a6.5 6.5 0 0 1-11 4.5H1"
                stroke="currentColor"
                strokeWidth="1.5"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
            </svg>
            <span>{messageCount - 1} {messageCount === 2 ? 'reply' : 'replies'}</span>
          </div>
        )}

        {isResolved && (
          <div className="rc-thread-status resolved">
            <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
              <path
                d="M11.667 3.5L5.25 9.917 2.333 7"
                stroke="currentColor"
                strokeWidth="1.5"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
            </svg>
            <span>Resolved</span>
          </div>
        )}

        {thread.context_type && (
          <div style={{ marginLeft: 'auto', fontSize: '11px', textTransform: 'uppercase' }}>
            {thread.context_type}
          </div>
        )}
      </div>
    </div>
  );
}

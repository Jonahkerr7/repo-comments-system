import React, { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import type { Thread, ThreadWithMessages, MessageWithAuthor } from '../types';
import { formatRelativeTime } from '../utils/time';

interface ThreadDetailProps {
  thread: Thread;
  onBack: () => void;
  sdk: any;
}

export function ThreadDetail({ thread, onBack, sdk }: ThreadDetailProps) {
  const [replyText, setReplyText] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const queryClient = useQueryClient();

  // Fetch full thread with messages
  const { data: fullThread, isLoading } = useQuery<ThreadWithMessages>({
    queryKey: ['thread', thread.id],
    queryFn: () => sdk.api.getThread(thread.id),
  });

  // Reply mutation
  const replyMutation = useMutation({
    mutationFn: (content: string) => sdk.addMessage(thread.id, content),
    onSuccess: () => {
      setReplyText('');
      queryClient.invalidateQueries({ queryKey: ['thread', thread.id] });
      queryClient.invalidateQueries({ queryKey: ['threads'] });
    },
  });

  // Resolve/reopen mutation
  const toggleResolveMutation = useMutation({
    mutationFn: () => {
      return thread.status === 'resolved'
        ? sdk.reopenThread(thread.id)
        : sdk.resolveThread(thread.id);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['thread', thread.id] });
      queryClient.invalidateQueries({ queryKey: ['threads'] });
    },
  });

  const handleSubmitReply = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!replyText.trim() || isSubmitting) return;

    setIsSubmitting(true);
    try {
      await replyMutation.mutateAsync(replyText);
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleToggleResolve = () => {
    toggleResolveMutation.mutate();
  };

  if (isLoading || !fullThread) {
    return (
      <div className="rc-thread-detail">
        <div className="rc-thread-detail-header">
          <button className="rc-back-button" onClick={onBack}>
            <svg width="20" height="20" viewBox="0 0 20 20" fill="none">
              <path
                d="M12.5 15l-5-5 5-5"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
            </svg>
          </button>
          <h3 className="rc-panel-title">Thread</h3>
        </div>
        <div style={{ padding: '20px', textAlign: 'center' }}>
          <div className="rc-spinner" style={{ margin: '0 auto' }} />
        </div>
      </div>
    );
  }

  return (
    <div className="rc-thread-detail">
      {/* Header */}
      <div className="rc-thread-detail-header">
        <button className="rc-back-button" onClick={onBack}>
          <svg width="20" height="20" viewBox="0 0 20 20" fill="none">
            <path
              d="M12.5 15l-5-5 5-5"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          </svg>
        </button>
        <h3 className="rc-panel-title">Thread</h3>
        <button
          className={`rc-button ${fullThread.status === 'resolved' ? 'rc-button-secondary' : ''}`}
          onClick={handleToggleResolve}
          disabled={toggleResolveMutation.isPending}
          style={{ marginLeft: 'auto', fontSize: '12px', padding: '6px 12px' }}
        >
          {fullThread.status === 'resolved' ? (
            <>
              <svg width="14" height="14" viewBox="0 0 14 14" fill="none" style={{ marginRight: '4px' }}>
                <path
                  d="M7 13A6 6 0 1 0 7 1a6 6 0 0 0 0 12z"
                  stroke="currentColor"
                  strokeWidth="1.5"
                />
              </svg>
              Reopen
            </>
          ) : (
            <>
              <svg width="14" height="14" viewBox="0 0 14 14" fill="none" style={{ marginRight: '4px' }}>
                <path
                  d="M11.667 3.5L5.25 9.917 2.333 7"
                  stroke="currentColor"
                  strokeWidth="1.5"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                />
              </svg>
              Resolve
            </>
          )}
        </button>
      </div>

      {/* Messages */}
      <div className="rc-thread-detail-body">
        {fullThread.messages.map((message: MessageWithAuthor) => (
          <MessageItem key={message.id} message={message} />
        ))}
      </div>

      {/* Reply input */}
      {fullThread.status !== 'resolved' && (
        <div className="rc-input-container">
          <form onSubmit={handleSubmitReply}>
            <div className="rc-input-wrapper">
              <textarea
                className="rc-input"
                placeholder="Add a reply..."
                value={replyText}
                onChange={(e) => setReplyText(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' && !e.shiftKey) {
                    e.preventDefault();
                    handleSubmitReply(e);
                  }
                }}
                rows={1}
              />
              <button
                type="submit"
                className="rc-button"
                disabled={!replyText.trim() || isSubmitting}
              >
                {isSubmitting ? (
                  <div className="rc-spinner" style={{ width: '16px', height: '16px' }} />
                ) : (
                  <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
                    <path
                      d="M14.667 1.333L7.333 8.667M14.667 1.333l-4 12-3.334-5.333-5.333-3.333 12.667-4z"
                      stroke="currentColor"
                      strokeWidth="1.5"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                    />
                  </svg>
                )}
              </button>
            </div>
          </form>
        </div>
      )}
    </div>
  );
}

interface MessageItemProps {
  message: MessageWithAuthor;
}

function MessageItem({ message }: MessageItemProps) {
  return (
    <div className="rc-message">
      <div className="rc-avatar">
        {message.author_avatar ? (
          <img src={message.author_avatar} alt={message.author_name} />
        ) : (
          message.author_name?.charAt(0).toUpperCase() || '?'
        )}
      </div>
      <div className="rc-message-content">
        <div className="rc-message-header">
          <span className="rc-message-author">{message.author_name}</span>
          <span className="rc-message-time">{formatRelativeTime(message.created_at)}</span>
          {message.edited && (
            <span className="rc-message-time" style={{ fontStyle: 'italic' }}>
              (edited)
            </span>
          )}
        </div>
        <p className="rc-message-text">{message.content}</p>
      </div>
    </div>
  );
}

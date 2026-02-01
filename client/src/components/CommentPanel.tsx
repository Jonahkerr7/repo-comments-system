import React, { useState } from 'react';
import { ThreadList } from './ThreadList';
import { ThreadDetail } from './ThreadDetail';
import { NewThreadForm } from './NewThreadForm';
import type { Thread } from '../types';

interface CommentPanelProps {
  isOpen: boolean;
  onClose: () => void;
  threads: Thread[];
  selectedThread: Thread | null;
  onThreadSelect: (thread: Thread) => void;
  onBack: () => void;
  onStartAddComment: () => void;
  pendingPosition: { x: number; y: number } | null;
  sdk: any;
}

export function CommentPanel({
  isOpen,
  onClose,
  threads,
  selectedThread,
  onThreadSelect,
  onBack,
  onStartAddComment,
  pendingPosition,
  sdk,
}: CommentPanelProps) {
  const [activeTab, setActiveTab] = useState<'open' | 'resolved'>('open');
  const [filter, setFilter] = useState<'all' | 'code' | 'ui'>('all');

  const filteredThreads = threads.filter((thread) => {
    if (activeTab === 'resolved' && thread.status !== 'resolved') return false;
    if (activeTab === 'open' && thread.status !== 'open') return false;
    if (filter === 'code' && thread.context_type !== 'code') return false;
    if (filter === 'ui' && thread.context_type !== 'ui') return false;
    return true;
  });

  const openCount = threads.filter((t) => t.status === 'open').length;

  return (
    <div className={`rc-panel ${isOpen ? 'open' : ''}`}>
      {/* Header */}
      <div className="rc-panel-header">
        <h2 className="rc-panel-title">Comments</h2>
        <button className="rc-panel-close" onClick={onClose} aria-label="Close">
          <svg width="20" height="20" viewBox="0 0 20 20" fill="none">
            <path
              d="M15 5L5 15M5 5l10 10"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
            />
          </svg>
        </button>
      </div>

      {/* Show thread detail if a thread is selected */}
      {selectedThread ? (
        <ThreadDetail thread={selectedThread} onBack={onBack} sdk={sdk} />
      ) : pendingPosition ? (
        /* Show new thread form if we have a pending position */
        <NewThreadForm
          position={pendingPosition}
          onBack={onBack}
          onCancel={onBack}
          sdk={sdk}
        />
      ) : (
        /* Otherwise show thread list */
        <>
          {/* Tabs */}
          <div className="rc-panel-tabs">
            <button
              className={`rc-panel-tab ${activeTab === 'open' ? 'active' : ''}`}
              onClick={() => setActiveTab('open')}
            >
              Open
              {openCount > 0 && <span className="rc-panel-tab-badge">{openCount}</span>}
            </button>
            <button
              className={`rc-panel-tab ${activeTab === 'resolved' ? 'active' : ''}`}
              onClick={() => setActiveTab('resolved')}
            >
              Resolved
            </button>
          </div>

          {/* Thread list */}
          <ThreadList
            threads={filteredThreads}
            onThreadSelect={onThreadSelect}
            onStartAddComment={onStartAddComment}
          />
        </>
      )}
    </div>
  );
}

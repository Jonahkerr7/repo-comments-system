import React, { useState, useEffect } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { CommentMarker } from './CommentMarker';
import { CommentPanel } from './CommentPanel';
import { ThreadDetail } from './ThreadDetail';
import type { Thread } from '../types';

interface CommentOverlayProps {
  sdk: any;
}

export function CommentOverlay({ sdk }: CommentOverlayProps) {
  const [isPanelOpen, setIsPanelOpen] = useState(false);
  const [isAddingComment, setIsAddingComment] = useState(false);
  const [selectedThread, setSelectedThread] = useState<Thread | null>(null);
  const [pendingPosition, setPendingPosition] = useState<{ x: number; y: number } | null>(null);

  const queryClient = useQueryClient();

  // Fetch threads for current context
  const { data: threads = [], refetch } = useQuery({
    queryKey: ['threads', sdk.getContext()],
    queryFn: async () => {
      return sdk.getThreads({ status: 'open' });
    },
    refetchInterval: 30000, // Refetch every 30 seconds
  });

  // Listen to real-time events
  useEffect(() => {
    const handleThreadCreated = (thread: Thread) => {
      queryClient.invalidateQueries({ queryKey: ['threads'] });
    };

    const handleThreadUpdated = (thread: Thread) => {
      queryClient.invalidateQueries({ queryKey: ['threads'] });
    };

    const handleMessageAdded = () => {
      queryClient.invalidateQueries({ queryKey: ['threads'] });
    };

    sdk.on('thread:created', handleThreadCreated);
    sdk.on('thread:updated', handleThreadUpdated);
    sdk.on('message:added', handleMessageAdded);

    return () => {
      sdk.off('thread:created', handleThreadCreated);
      sdk.off('thread:updated', handleThreadUpdated);
      sdk.off('message:added', handleMessageAdded);
    };
  }, [sdk, queryClient]);

  // Handle click to add comment (Figma-style)
  useEffect(() => {
    if (!isAddingComment) return;

    const handleClick = (e: MouseEvent) => {
      // Don't add comment if clicking on panel or existing marker
      const target = e.target as HTMLElement;
      if (
        target.closest('.rc-panel') ||
        target.closest('.rc-marker') ||
        target.closest('.rc-toggle-button')
      ) {
        return;
      }

      setPendingPosition({ x: e.clientX, y: e.clientY });
      setIsPanelOpen(true);
      setIsAddingComment(false);
    };

    const handleEscape = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        setIsAddingComment(false);
        document.body.style.cursor = '';
      }
    };

    document.body.style.cursor = 'crosshair';
    document.addEventListener('click', handleClick);
    document.addEventListener('keydown', handleEscape);

    return () => {
      document.body.style.cursor = '';
      document.removeEventListener('click', handleClick);
      document.removeEventListener('keydown', handleEscape);
    };
  }, [isAddingComment]);

  const handleMarkerClick = (thread: Thread) => {
    setSelectedThread(thread);
    setIsPanelOpen(true);
  };

  const handleTogglePanel = () => {
    setIsPanelOpen(!isPanelOpen);
    if (!isPanelOpen) {
      setSelectedThread(null);
      setPendingPosition(null);
    }
  };

  const handleStartAddComment = () => {
    setIsAddingComment(true);
  };

  const handleClosePanel = () => {
    setIsPanelOpen(false);
    setSelectedThread(null);
    setPendingPosition(null);
  };

  const handleThreadSelect = (thread: Thread) => {
    setSelectedThread(thread);
  };

  const handleBack = () => {
    setSelectedThread(null);
    setPendingPosition(null);
  };

  return (
    <>
      {/* Comment markers on the page */}
      {threads.map((thread, index) => (
        thread.coordinates && (
          <CommentMarker
            key={thread.id}
            thread={thread}
            number={index + 1}
            onClick={() => handleMarkerClick(thread)}
            isActive={selectedThread?.id === thread.id}
          />
        )
      ))}

      {/* Pending comment marker */}
      {pendingPosition && !selectedThread && (
        <div
          className="rc-marker new"
          style={{
            left: `${pendingPosition.x}px`,
            top: `${pendingPosition.y}px`,
          }}
        >
          +
        </div>
      )}

      {/* Side panel */}
      <CommentPanel
        isOpen={isPanelOpen}
        onClose={handleClosePanel}
        threads={threads}
        selectedThread={selectedThread}
        onThreadSelect={handleThreadSelect}
        onBack={handleBack}
        onStartAddComment={handleStartAddComment}
        pendingPosition={pendingPosition}
        sdk={sdk}
      />

      {/* Toggle button (Figma-style floating action button) */}
      <button
        className="rc-toggle-button"
        onClick={handleTogglePanel}
        title={isPanelOpen ? 'Close comments' : 'Open comments'}
      >
        <svg width="24" height="24" viewBox="0 0 24 24" fill="none">
          <path
            d="M21 11.5a8.38 8.38 0 0 1-.9 3.8 8.5 8.5 0 0 1-7.6 4.7 8.38 8.38 0 0 1-3.8-.9L3 21l1.9-5.7a8.38 8.38 0 0 1-.9-3.8 8.5 8.5 0 0 1 4.7-7.6 8.38 8.38 0 0 1 3.8-.9h.5a8.48 8.48 0 0 1 8 8v.5z"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        </svg>
        {threads.length > 0 && (
          <span
            style={{
              position: 'absolute',
              top: '-4px',
              right: '-4px',
              background: '#FF4757',
              color: 'white',
              borderRadius: '10px',
              padding: '2px 6px',
              fontSize: '11px',
              fontWeight: 600,
            }}
          >
            {threads.length}
          </span>
        )}
      </button>
    </>
  );
}

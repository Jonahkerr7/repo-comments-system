import React, { useState } from 'react';
import type { Thread } from '../types';

interface CommentMarkerProps {
  thread: Thread;
  number: number;
  onClick: () => void;
  isActive: boolean;
}

export function CommentMarker({ thread, number, onClick, isActive }: CommentMarkerProps) {
  const [showPreview, setShowPreview] = useState(false);

  if (!thread.coordinates) return null;

  const { x, y } = thread.coordinates;
  const isResolved = thread.status === 'resolved';

  return (
    <div
      className={`rc-marker ${isResolved ? 'resolved' : ''} ${isActive ? 'active' : ''}`}
      style={{
        left: `${x}px`,
        top: `${y}px`,
        transform: 'translate(-50%, -50%)', // Center the marker on the point
      }}
      onClick={onClick}
      onMouseEnter={() => setShowPreview(true)}
      onMouseLeave={() => setShowPreview(false)}
    >
      {isResolved ? (
        <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
          <path
            d="M13.3333 4L6 11.3333L2.66667 8"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        </svg>
      ) : (
        number
      )}

      {/* Preview bubble on hover */}
      {showPreview && thread.messages && thread.messages.length > 0 && (
        <div className="rc-marker-preview">
          <p className="rc-marker-preview-content">
            {thread.messages[0].content}
          </p>
        </div>
      )}
    </div>
  );
}

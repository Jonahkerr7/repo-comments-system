import React, { useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';

interface NewThreadFormProps {
  position: { x: number; y: number };
  onBack: () => void;
  onCancel: () => void;
  sdk: any;
}

export function NewThreadForm({ position, onBack, onCancel, sdk }: NewThreadFormProps) {
  const [message, setMessage] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const queryClient = useQueryClient();

  const createThreadMutation = useMutation({
    mutationFn: async (content: string) => {
      return sdk.createThread({
        type: 'ui',
        coordinates: position,
        message: content,
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['threads'] });
      onBack();
    },
  });

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!message.trim() || isSubmitting) return;

    setIsSubmitting(true);
    try {
      await createThreadMutation.mutateAsync(message);
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="rc-thread-detail">
      <div className="rc-thread-detail-header">
        <button className="rc-back-button" onClick={onCancel}>
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
        <h3 className="rc-panel-title">New comment</h3>
      </div>

      <div className="rc-thread-detail-body">
        <div style={{ marginBottom: '12px', color: 'var(--figma-text-secondary)', fontSize: '13px' }}>
          Position: ({Math.round(position.x)}, {Math.round(position.y)})
        </div>

        <form onSubmit={handleSubmit}>
          <textarea
            className="rc-input"
            placeholder="What's on your mind?"
            value={message}
            onChange={(e) => setMessage(e.target.value)}
            autoFocus
            rows={4}
            style={{ width: '100%', marginBottom: '12px' }}
          />

          <div style={{ display: 'flex', gap: '8px', justifyContent: 'flex-end' }}>
            <button
              type="button"
              className="rc-button rc-button-secondary"
              onClick={onCancel}
              disabled={isSubmitting}
            >
              Cancel
            </button>
            <button
              type="submit"
              className="rc-button"
              disabled={!message.trim() || isSubmitting}
            >
              {isSubmitting ? (
                <>
                  <div className="rc-spinner" style={{ width: '16px', height: '16px', display: 'inline-block', marginRight: '8px' }} />
                  Creating...
                </>
              ) : (
                'Add comment'
              )}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

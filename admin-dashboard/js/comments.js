// Comments Management

class CommentsManager {
  static async loadComments() {
    const commentsList = document.getElementById('comments-list');
    commentsList.innerHTML = '<div style="text-align: center; padding: 2rem;">Loading...</div>';

    try {
      const filters = {
        repo: document.getElementById('filter-repo').value,
        status: document.getElementById('filter-status').value,
      };

      // For now, we'll query threads directly since we don't have /admin/threads yet
      // We'll need to create that endpoint
      let threads = [];

      // Get all unique repos first
      if (filters.repo) {
        const response = await api.request(`/threads?repo=${encodeURIComponent(filters.repo)}`);
        threads = response;
      } else {
        // Try to get threads from known repos
        try {
          const permissions = await api.request('/permissions');
          const repos = [...new Set(permissions.map(p => p.repo))];

          for (const repo of repos) {
            try {
              const repoThreads = await api.request(`/threads?repo=${encodeURIComponent(repo)}`);
              threads = threads.concat(repoThreads);
            } catch (e) {
              console.log(`No threads for ${repo}`);
            }
          }
        } catch (e) {
          console.error('Error fetching threads:', e);
        }
      }

      // Apply status filter
      if (filters.status) {
        threads = threads.filter(t => t.status === filters.status);
      }

      if (threads.length === 0) {
        commentsList.innerHTML = `
          <div style="text-align: center; padding: 3rem; color: #a0aec0; background: white; border-radius: 8px; border: 1px solid #e2e8f0;">
            <p>No comments found matching the filters.</p>
          </div>
        `;
        return;
      }

      commentsList.innerHTML = threads.map(thread => this.renderCommentCard(thread)).join('');

      // Attach event listeners
      this.attachEventListeners();
    } catch (error) {
      console.error('Error loading comments:', error);
      commentsList.innerHTML = `
        <div style="text-align: center; padding: 3rem; color: #f56565;">
          <p>Error loading comments. Please try again.</p>
        </div>
      `;
    }
  }

  static renderCommentCard(thread) {
    const createdDate = new Date(thread.created_at).toLocaleDateString();
    const contextLabel = thread.context_type === 'code'
      ? `📄 ${thread.file_path}${thread.line_start ? `:${thread.line_start}` : ''}`
      : `🎨 UI Comment`;

    const messageCount = thread.message_count || 0;

    return `
      <div class="comment-card" data-thread-id="${thread.id}">
        <div class="comment-header">
          <div class="comment-info">
            <h4>${thread.repo} - ${thread.branch}</h4>
            <div class="comment-meta">
              ${contextLabel} • ${createdDate} • by ${thread.creator_name || 'Unknown'}
            </div>
          </div>
          <span class="comment-status status-${thread.status}">${thread.status}</span>
        </div>
        <div class="comment-content">
          ${thread.first_message || 'No content'}
        </div>
        <div class="comment-replies">
          💬 ${messageCount} message${messageCount !== 1 ? 's' : ''}
          ${thread.priority ? `• 🏷️ ${thread.priority}` : ''}
          ${thread.tags && thread.tags.length > 0 ? `• ${thread.tags.join(', ')}` : ''}
        </div>
      </div>
    `;
  }

  static attachEventListeners() {
    document.querySelectorAll('.comment-card').forEach(card => {
      card.addEventListener('click', (e) => {
        const threadId = card.dataset.threadId;
        this.viewThreadDetails(threadId);
      });
      card.style.cursor = 'pointer';
    });
  }

  static async viewThreadDetails(threadId) {
    try {
      const thread = await api.getThread(threadId);

      alert(`Thread Details:\n\n` +
        `Repo: ${thread.repo}\n` +
        `Branch: ${thread.branch}\n` +
        `Status: ${thread.status}\n` +
        `Messages: ${thread.messages?.length || 0}\n\n` +
        `First Message:\n${thread.messages?.[0]?.content || 'No content'}\n\n` +
        `Click OK to close.`);
    } catch (error) {
      app.showNotification('Failed to load thread details: ' + error.message, 'error');
    }
  }
}

window.CommentsManager = CommentsManager;

// Comments Management

class CommentsManager {
  static deployments = new Map(); // repo/branch -> deployment
  static expandedThreads = new Set(); // track which threads show full messages

  static async loadComments() {
    const commentsList = document.getElementById('comments-list');
    commentsList.innerHTML = '<div style="text-align: center; padding: 2rem;">Loading...</div>';

    try {
      const filters = {
        repo: document.getElementById('filter-repo').value,
        status: document.getElementById('filter-status').value,
      };

      // Load deployments to associate with threads
      try {
        const allDeployments = await api.getDeployments({ limit: 100 });
        this.deployments.clear();
        allDeployments.forEach(d => {
          const key = `${d.repo}/${d.branch}`;
          if (!this.deployments.has(key) || new Date(d.created_at) > new Date(this.deployments.get(key).created_at)) {
            this.deployments.set(key, d);
          }
        });
      } catch (e) {
        console.warn('Could not load deployments:', e);
      }

      let threads = [];

      if (filters.repo) {
        const response = await api.request(`/threads?repo=${encodeURIComponent(filters.repo)}`);
        threads = response;
      } else {
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

      // Load full thread data with messages for each thread
      const fullThreads = await Promise.all(
        threads.map(async t => {
          try {
            return await api.getThread(t.id);
          } catch (e) {
            return { ...t, messages: [] };
          }
        })
      );

      commentsList.innerHTML = fullThreads.map(thread => this.renderCommentCard(thread)).join('');
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
      ? `${thread.file_path || 'Unknown file'}${thread.line_start ? `:${thread.line_start}` : ''}`
      : 'UI Element';

    const deploymentKey = `${thread.repo}/${thread.branch}`;
    const deployment = this.deployments.get(deploymentKey);
    const phaseColors = {
      discover: '#6366f1',
      define: '#8b5cf6',
      develop: '#06b6d4',
      deliver: '#10b981'
    };

    const messages = thread.messages || [];
    const repoName = thread.repo.split('/')[1] || thread.repo;

    return `
      <div class="comment-card" data-thread-id="${thread.id}">
        <div class="comment-card-top">
          <div class="comment-card-left">
            <div class="comment-repo-info">
              <span class="comment-repo-name">${repoName}</span>
              <span class="branch-badge">${thread.branch}</span>
              ${deployment ? `
                <span class="phase-badge" style="background: ${phaseColors[deployment.phase] || '#718096'}">
                  ${deployment.phase || 'discover'}
                </span>
              ` : ''}
              ${deployment?.pr_number ? `<span class="pr-badge">PR #${deployment.pr_number}</span>` : ''}
            </div>
            <div class="comment-context">
              ${thread.context_type === 'code' ? '📄' : '🎨'} ${contextLabel}
            </div>
          </div>
          <div class="comment-card-right">
            ${deployment?.url ? `<a href="${deployment.url}" target="_blank" class="btn-small btn-launch">Launch</a>` : ''}
            <span class="comment-status status-${thread.status}">${thread.status}</span>
            ${thread.priority && thread.priority !== 'normal' ? `
              <span class="priority-badge priority-${thread.priority}">${thread.priority}</span>
            ` : ''}
          </div>
        </div>

        <div class="comment-messages">
          ${messages.length > 0 ? messages.map((msg, idx) => `
            <div class="comment-message ${idx === 0 ? 'first-message' : ''}">
              <span class="message-header">
                <span class="message-author">${msg.author_name || 'Unknown'}</span>
                <span class="message-time">${this.formatTimeAgo(msg.created_at)}</span>
              </span>
              <span class="message-content">${this.escapeHtml(msg.content)}</span>
            </div>
          `).join('') : '<div class="no-messages">No messages</div>'}
        </div>

        <div class="comment-card-footer">
          <div class="comment-meta">
            <span>Created ${createdDate} by ${thread.creator_name || 'Unknown'}</span>
          </div>
          <div class="comment-actions">
            ${thread.status === 'open' ? `
              <button class="btn-small btn-resolve" data-thread-id="${thread.id}" data-repo="${thread.repo}">Resolve</button>
            ` : `
              <button class="btn-small btn-reopen" data-thread-id="${thread.id}" data-repo="${thread.repo}">Reopen</button>
            `}
          </div>
        </div>
      </div>
    `;
  }

  static escapeHtml(text) {
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
  }

  static formatTimeAgo(dateString) {
    const date = new Date(dateString);
    const now = new Date();
    const seconds = Math.floor((now - date) / 1000);

    if (seconds < 60) return 'just now';
    if (seconds < 3600) return `${Math.floor(seconds / 60)}m ago`;
    if (seconds < 86400) return `${Math.floor(seconds / 3600)}h ago`;
    if (seconds < 604800) return `${Math.floor(seconds / 86400)}d ago`;
    return date.toLocaleDateString();
  }

  static attachEventListeners() {
    // Resolve buttons
    document.querySelectorAll('.btn-resolve').forEach(btn => {
      btn.addEventListener('click', async (e) => {
        e.stopPropagation();
        const threadId = btn.dataset.threadId;
        const repo = btn.dataset.repo;
        try {
          await api.request(`/threads/${threadId}`, {
            method: 'PATCH',
            body: JSON.stringify({ status: 'resolved', repo }),
          });
          app.showNotification('Thread resolved');
          this.loadComments();
        } catch (error) {
          app.showNotification('Failed to resolve: ' + error.message, 'error');
        }
      });
    });

    // Reopen buttons
    document.querySelectorAll('.btn-reopen').forEach(btn => {
      btn.addEventListener('click', async (e) => {
        e.stopPropagation();
        const threadId = btn.dataset.threadId;
        const repo = btn.dataset.repo;
        try {
          await api.request(`/threads/${threadId}`, {
            method: 'PATCH',
            body: JSON.stringify({ status: 'open', repo }),
          });
          app.showNotification('Thread reopened');
          this.loadComments();
        } catch (error) {
          app.showNotification('Failed to reopen: ' + error.message, 'error');
        }
      });
    });
  }
}

window.CommentsManager = CommentsManager;

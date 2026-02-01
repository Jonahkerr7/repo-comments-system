// Comments Management

class CommentsManager {
  static deployments = new Map(); // repo/branch -> deployment

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
          // Keep the most recent deployment for each repo/branch
          if (!this.deployments.has(key) || new Date(d.created_at) > new Date(this.deployments.get(key).created_at)) {
            this.deployments.set(key, d);
          }
        });
      } catch (e) {
        console.warn('Could not load deployments:', e);
      }

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
      ? `${thread.file_path}${thread.line_start ? `:${thread.line_start}` : ''}`
      : `UI Comment`;

    const messageCount = thread.message_count || 0;

    // Find associated deployment
    const deploymentKey = `${thread.repo}/${thread.branch}`;
    const deployment = this.deployments.get(deploymentKey);
    const phaseColors = {
      discover: '#6366f1',
      define: '#8b5cf6',
      develop: '#06b6d4',
      deliver: '#10b981'
    };

    return `
      <div class="comment-card" data-thread-id="${thread.id}">
        <div class="comment-header">
          <div class="comment-info">
            <h4>${thread.repo}</h4>
            <div class="comment-branch">
              <span class="branch-badge">${thread.branch}</span>
              ${deployment ? `
                <span class="phase-badge" style="background: ${phaseColors[deployment.phase] || '#718096'}">
                  ${deployment.phase || 'discover'}
                </span>
                ${deployment.pr_number ? `<span class="pr-badge">PR #${deployment.pr_number}</span>` : ''}
              ` : ''}
            </div>
          </div>
          <div class="comment-actions-header">
            ${deployment?.url ? `<a href="${deployment.url}" target="_blank" class="btn-small btn-launch" onclick="event.stopPropagation()">Launch</a>` : ''}
            <span class="comment-status status-${thread.status}">${thread.status}</span>
          </div>
        </div>
        <div class="comment-context">
          ${thread.context_type === 'code' ? '📄' : '🎨'} ${contextLabel}
        </div>
        <div class="comment-content">
          ${thread.first_message || 'No content'}
        </div>
        <div class="comment-footer">
          <div class="comment-meta-left">
            💬 ${messageCount} message${messageCount !== 1 ? 's' : ''}
            ${thread.priority && thread.priority !== 'normal' ? `<span class="priority-badge priority-${thread.priority}">${thread.priority}</span>` : ''}
          </div>
          <div class="comment-meta-right">
            ${createdDate} by ${thread.creator_name || 'Unknown'}
          </div>
        </div>
      </div>
    `;
  }

  static attachEventListeners() {
    document.querySelectorAll('.comment-card').forEach(card => {
      card.addEventListener('click', (e) => {
        // Don't trigger if clicking a link
        if (e.target.tagName === 'A') return;
        const threadId = card.dataset.threadId;
        this.viewThreadDetails(threadId);
      });
      card.style.cursor = 'pointer';
    });
  }

  static async viewThreadDetails(threadId) {
    try {
      const thread = await api.getThread(threadId);

      // Find associated deployment
      const deploymentKey = `${thread.repo}/${thread.branch}`;
      const deployment = this.deployments.get(deploymentKey);

      // Build message list
      const messageList = thread.messages?.map((m, i) =>
        `${i + 1}. ${m.author_name || 'Unknown'}: ${m.content.substring(0, 100)}${m.content.length > 100 ? '...' : ''}`
      ).join('\n') || 'No messages';

      const details = [
        `Repo: ${thread.repo}`,
        `Branch: ${thread.branch}`,
        `Status: ${thread.status}`,
        `Priority: ${thread.priority || 'normal'}`,
        deployment ? `Phase: ${deployment.phase || 'discover'}` : null,
        deployment?.pr_number ? `PR: #${deployment.pr_number} - ${deployment.pr_title}` : null,
        '',
        `Messages (${thread.messages?.length || 0}):`,
        messageList,
      ].filter(Boolean).join('\n');

      alert(`Thread Details\n\n${details}`);
    } catch (error) {
      app.showNotification('Failed to load thread details: ' + error.message, 'error');
    }
  }
}

window.CommentsManager = CommentsManager;

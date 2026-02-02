// Comments Management - Enhanced with expand/collapse and context panel

class CommentsManager {
  static deployments = new Map(); // repo/branch -> deployment
  static expandedThreads = new Set(); // track which threads are expanded

  static async loadComments() {
    const commentsList = document.getElementById('comments-list');
    commentsList.innerHTML = `
      <div class="loading-state animate-pulse">
        <div class="loading-card"></div>
        <div class="loading-card"></div>
        <div class="loading-card"></div>
      </div>
    `;

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
          <div class="empty-state glass-card animate-fade-in">
            <div class="empty-icon">💬</div>
            <h3>No comments found</h3>
            <p>Try adjusting your filters or add comments via the extension</p>
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

      // Sort by last activity
      fullThreads.sort((a, b) => {
        const aTime = a.messages?.length ? new Date(a.messages[a.messages.length - 1].created_at) : new Date(a.created_at);
        const bTime = b.messages?.length ? new Date(b.messages[b.messages.length - 1].created_at) : new Date(b.created_at);
        return bTime - aTime;
      });

      commentsList.innerHTML = fullThreads.map((thread, idx) =>
        this.renderCommentCard(thread, idx)
      ).join('');

      this.attachEventListeners();
    } catch (error) {
      console.error('Error loading comments:', error);
      commentsList.innerHTML = `
        <div class="error-state glass-card">
          <div class="error-icon">⚠️</div>
          <h3>Error loading comments</h3>
          <p>${error.message}</p>
          <button class="btn-primary" onclick="CommentsManager.loadComments()">Try Again</button>
        </div>
      `;
    }
  }

  static renderCommentCard(thread, index = 0) {
    const createdDate = new Date(thread.created_at).toLocaleDateString();
    const deploymentKey = `${thread.repo}/${thread.branch}`;
    const deployment = this.deployments.get(deploymentKey);
    const messages = thread.messages || [];
    const repoName = thread.repo.split('/')[1] || thread.repo;
    const isExpanded = this.expandedThreads.has(thread.id);
    const firstMessage = messages[0];
    const additionalMessages = messages.slice(1);

    // Screenshot (if available) or fallback
    const hasScreenshot = thread.screenshot_url;
    const screenshotUrl = thread.screenshot_url;

    // Context label - user-friendly for UI comments
    const contextLabel = thread.context_type === 'code'
      ? `${thread.file_path || 'Unknown file'}${thread.line_start ? `:${thread.line_start}` : ''}`
      : this.getElementDescription(thread);

    // Priority indicator
    const priorityClass = thread.priority === 'critical' ? 'priority-critical' :
                          thread.priority === 'high' ? 'priority-high' : '';

    return `
      <div class="comment-card glass-card animate-slide-up ${priorityClass}"
           data-thread-id="${thread.id}"
           style="animation-delay: ${index * 50}ms">

        <!-- Clickable Header with Screenshot -->
        <div class="comment-header" onclick="CommentsManager.toggleExpand('${thread.id}')">
          ${thread.context_type === 'ui' ? `
            <div class="comment-screenshot-thumb">
              ${hasScreenshot
                ? `<img src="${screenshotUrl}" alt="Element screenshot" class="screenshot-img" />`
                : `<div class="screenshot-placeholder">
                    <span class="placeholder-icon">🎯</span>
                  </div>`
              }
            </div>
          ` : ''}
          <div class="comment-header-left">
            <div class="comment-meta-row">
              <span class="comment-repo-name">${repoName}</span>
              <span class="branch-badge">${thread.branch}</span>
              ${deployment?.phase ? `
                <span class="phase-badge phase-${deployment.phase}">${deployment.phase}</span>
              ` : ''}
              ${deployment?.pr_number ? `<span class="pr-badge">PR #${deployment.pr_number}</span>` : ''}
            </div>
            <div class="comment-context-row">
              <span class="context-icon">${thread.context_type === 'code' ? '📄' : '🎯'}</span>
              <span class="context-label">${contextLabel}</span>
            </div>
          </div>
          <div class="comment-header-right">
            <span class="comment-status status-${thread.status}">${thread.status}</span>
            ${thread.priority && thread.priority !== 'normal' ? `
              <span class="priority-indicator priority-${thread.priority}"></span>
            ` : ''}
            <span class="expand-icon ${isExpanded ? 'expanded' : ''}">
              <svg width="16" height="16" viewBox="0 0 16 16" fill="currentColor">
                <path d="M4.5 6L8 9.5L11.5 6" stroke="currentColor" stroke-width="1.5" fill="none"/>
              </svg>
            </span>
          </div>
        </div>

        <!-- Preview (always visible) -->
        <div class="comment-preview" onclick="CommentsManager.toggleExpand('${thread.id}')">
          ${firstMessage ? `
            <div class="preview-message">
              <span class="preview-author">${firstMessage.author_name || 'Unknown'}</span>
              <span class="preview-content">${this.escapeHtml(this.truncate(firstMessage.content, 120))}</span>
            </div>
          ` : '<div class="no-messages">No messages yet</div>'}
          ${additionalMessages.length > 0 ? `
            <span class="expand-hint">+${additionalMessages.length} more ${additionalMessages.length === 1 ? 'reply' : 'replies'}</span>
          ` : ''}
        </div>

        <!-- Expanded Content -->
        <div class="comment-body ${isExpanded ? 'expanded' : 'collapsed'}">
          <!-- Full Message Thread -->
          <div class="message-thread">
            ${messages.map((msg, idx) => `
              <div class="thread-message ${idx === 0 ? 'first-message' : ''}">
                <div class="message-avatar">${this.getInitials(msg.author_name)}</div>
                <div class="message-content-wrap">
                  <div class="message-meta">
                    <span class="message-author">${msg.author_name || 'Unknown'}</span>
                    <span class="message-time">${this.formatTimeAgo(msg.created_at)}</span>
                    ${msg.edited ? '<span class="edited-tag">edited</span>' : ''}
                  </div>
                  <div class="message-text">${this.escapeHtml(msg.content)}</div>
                  ${msg.reactions?.length ? `
                    <div class="message-reactions">
                      ${msg.reactions.map(r => `<span class="reaction">${r.emoji}</span>`).join('')}
                    </div>
                  ` : ''}
                </div>
              </div>
            `).join('')}
          </div>

          <!-- Context Panel -->
          <div class="context-panel">
            <div class="context-header">
              <span class="context-title">Context</span>
            </div>
            <div class="context-content">
              ${thread.context_type === 'ui' && hasScreenshot ? `
                <div class="context-screenshot">
                  <img src="${screenshotUrl}" alt="Element screenshot" class="context-screenshot-img" />
                </div>
              ` : ''}
              ${deployment?.url ? `
                <a href="${deployment.url}" target="_blank" class="context-preview-link">
                  <span class="preview-icon">🔗</span>
                  <span class="preview-url">${new URL(deployment.url).hostname}</span>
                  <span class="preview-arrow">→</span>
                </a>
              ` : ''}
              <div class="context-details">
                <div class="context-item">
                  <span class="context-item-label">Type</span>
                  <span class="context-item-value">${thread.context_type === 'code' ? 'Code Comment' : 'UI Comment'}</span>
                </div>
                ${thread.context_type === 'code' && thread.file_path ? `
                  <div class="context-item">
                    <span class="context-item-label">File</span>
                    <span class="context-item-value code">${thread.file_path}${thread.line_start ? `:${thread.line_start}` : ''}</span>
                  </div>
                  ${thread.code_snippet ? `
                    <div class="context-code">
                      <pre><code>${this.escapeHtml(thread.code_snippet)}</code></pre>
                    </div>
                  ` : ''}
                ` : ''}
                ${thread.context_type === 'ui' ? `
                  <div class="context-item">
                    <span class="context-item-label">Element</span>
                    <span class="context-item-value">${this.getElementDescription(thread)}</span>
                  </div>
                ` : ''}
              </div>
            </div>
          </div>
        </div>

        <!-- Footer Actions -->
        <div class="comment-footer">
          <div class="footer-left">
            <span class="footer-meta">Created ${createdDate} by ${thread.creator_name || 'Unknown'}</span>
          </div>
          <div class="footer-actions">
            ${deployment?.url ? `
              <a href="${deployment.url}" target="_blank" class="btn-action btn-launch">
                <span>Launch</span>
              </a>
            ` : ''}
            ${thread.status === 'open' ? `
              <button class="btn-action btn-resolve" data-thread-id="${thread.id}" data-repo="${thread.repo}">
                <span>Resolve</span>
              </button>
            ` : `
              <button class="btn-action btn-reopen" data-thread-id="${thread.id}" data-repo="${thread.repo}">
                <span>Reopen</span>
              </button>
            `}
          </div>
        </div>
      </div>
    `;
  }

  static toggleExpand(threadId) {
    if (this.expandedThreads.has(threadId)) {
      this.expandedThreads.delete(threadId);
    } else {
      this.expandedThreads.add(threadId);
    }

    const card = document.querySelector(`[data-thread-id="${threadId}"]`);
    if (card) {
      const body = card.querySelector('.comment-body');
      const icon = card.querySelector('.expand-icon');

      if (this.expandedThreads.has(threadId)) {
        body.classList.remove('collapsed');
        body.classList.add('expanded');
        icon.classList.add('expanded');
      } else {
        body.classList.remove('expanded');
        body.classList.add('collapsed');
        icon.classList.remove('expanded');
      }
    }
  }

  static truncate(text, maxLength) {
    if (!text) return '';
    if (text.length <= maxLength) return text;
    return text.substring(0, maxLength) + '...';
  }

  static getInitials(name) {
    if (!name) return '?';
    return name.split(' ').map(n => n[0]).join('').toUpperCase().substring(0, 2);
  }

  static escapeHtml(text) {
    if (!text) return '';
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

  // Convert CSS selector to user-friendly element description
  static getElementDescription(thread) {
    // Use element_text if available (captured from the element's text content)
    if (thread.element_text) {
      return `"${this.truncate(thread.element_text, 40)}"`;
    }

    // Use element_tag + element_class if available
    if (thread.element_tag) {
      const tag = thread.element_tag.toLowerCase();
      const friendlyNames = {
        'h1': 'Heading',
        'h2': 'Subheading',
        'h3': 'Section Title',
        'p': 'Paragraph',
        'button': 'Button',
        'a': 'Link',
        'img': 'Image',
        'input': 'Input Field',
        'form': 'Form',
        'nav': 'Navigation',
        'header': 'Header',
        'footer': 'Footer',
        'main': 'Main Content',
        'section': 'Section',
        'div': 'Container',
        'span': 'Text',
        'ul': 'List',
        'li': 'List Item',
        'table': 'Table',
        'card': 'Card'
      };
      return friendlyNames[tag] || tag.charAt(0).toUpperCase() + tag.slice(1);
    }

    // Parse selector to extract meaningful info
    const selector = thread.selector || '';
    if (!selector) return 'UI Element';

    // Try to get the last meaningful part of the selector
    const parts = selector.split('>').map(s => s.trim());
    const lastPart = parts[parts.length - 1] || '';

    // Extract tag name
    const tagMatch = lastPart.match(/^(\w+)/);
    const tag = tagMatch ? tagMatch[1].toLowerCase() : '';

    // Extract class names
    const classMatch = lastPart.match(/\.([a-zA-Z][\w-]*)/g);
    const classes = classMatch ? classMatch.map(c => c.slice(1)) : [];

    // Build description
    const tagNames = {
      'h1': 'Heading', 'h2': 'Subheading', 'h3': 'Title',
      'button': 'Button', 'a': 'Link', 'img': 'Image',
      'input': 'Input', 'nav': 'Navigation', 'header': 'Header',
      'footer': 'Footer', 'main': 'Main Area', 'p': 'Text'
    };

    let description = tagNames[tag] || 'Element';

    // Add context from class names
    const meaningfulClasses = classes.filter(c =>
      !c.match(/^(ng-|_|css-|sc-|jsx-)/) && c.length > 2
    );

    if (meaningfulClasses.length > 0) {
      const className = meaningfulClasses[0]
        .replace(/-/g, ' ')
        .replace(/([A-Z])/g, ' $1')
        .trim();
      description = className.charAt(0).toUpperCase() + className.slice(1);
    }

    return description;
  }

  static attachEventListeners() {
    // Resolve buttons
    document.querySelectorAll('.btn-resolve').forEach(btn => {
      btn.addEventListener('click', async (e) => {
        e.stopPropagation();
        const threadId = btn.dataset.threadId;
        const repo = btn.dataset.repo;
        btn.disabled = true;
        btn.innerHTML = '<span>Resolving...</span>';
        try {
          await api.request(`/threads/${threadId}`, {
            method: 'PATCH',
            body: JSON.stringify({ status: 'resolved', repo }),
          });
          app.showNotification('Thread resolved');
          this.loadComments();
        } catch (error) {
          app.showNotification('Failed to resolve: ' + error.message, 'error');
          btn.disabled = false;
          btn.innerHTML = '<span>Resolve</span>';
        }
      });
    });

    // Reopen buttons
    document.querySelectorAll('.btn-reopen').forEach(btn => {
      btn.addEventListener('click', async (e) => {
        e.stopPropagation();
        const threadId = btn.dataset.threadId;
        const repo = btn.dataset.repo;
        btn.disabled = true;
        btn.innerHTML = '<span>Reopening...</span>';
        try {
          await api.request(`/threads/${threadId}`, {
            method: 'PATCH',
            body: JSON.stringify({ status: 'open', repo }),
          });
          app.showNotification('Thread reopened');
          this.loadComments();
        } catch (error) {
          app.showNotification('Failed to reopen: ' + error.message, 'error');
          btn.disabled = false;
          btn.innerHTML = '<span>Reopen</span>';
        }
      });
    });
  }
}

window.CommentsManager = CommentsManager;

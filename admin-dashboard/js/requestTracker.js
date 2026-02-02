// Request Tracker - Surfaces open comments as actionable items
// Groups by: Critical, My Assigned, Pending Review, Recently Updated

class RequestTracker {
  static requests = [];
  static currentUser = null;
  static activeFilter = 'all';

  static async init() {
    // Get current user
    try {
      const userStr = localStorage.getItem('admin_user');
      this.currentUser = userStr ? JSON.parse(userStr) : null;
    } catch (e) {
      console.warn('Could not load user:', e);
    }
  }

  static async loadRequests() {
    const container = document.getElementById('request-tracker');
    if (!container) return;

    container.innerHTML = `
      <div class="request-tracker-loading animate-pulse">
        <div class="loading-card" style="height: 60px;"></div>
        <div class="loading-card" style="height: 60px;"></div>
        <div class="loading-card" style="height: 60px;"></div>
      </div>
    `;

    try {
      // Fetch open threads from all repos
      const permissions = await api.request('/permissions');
      const repos = [...new Set(permissions.map(p => p.repo))];

      let allThreads = [];
      for (const repo of repos) {
        try {
          const threads = await api.request(`/threads?repo=${encodeURIComponent(repo)}&status=open`);
          // Load full thread data
          const fullThreads = await Promise.all(
            threads.map(async t => {
              try {
                return await api.getThread(t.id);
              } catch (e) {
                return { ...t, messages: [] };
              }
            })
          );
          allThreads = allThreads.concat(fullThreads);
        } catch (e) {
          console.log(`No threads for ${repo}`);
        }
      }

      // Group threads
      this.requests = this.categorizeRequests(allThreads);

      this.render();
    } catch (error) {
      console.error('Error loading requests:', error);
      container.innerHTML = `
        <div class="request-tracker-error">
          <p>Failed to load requests</p>
        </div>
      `;
    }
  }

  static categorizeRequests(threads) {
    const now = new Date();
    const oneDayAgo = new Date(now - 24 * 60 * 60 * 1000);

    return {
      critical: threads.filter(t => t.priority === 'critical'),
      high: threads.filter(t => t.priority === 'high'),
      myAssigned: threads.filter(t => {
        // Check if current user is mentioned or created the thread
        if (!this.currentUser) return false;
        const userMentioned = t.messages?.some(m =>
          m.mentions?.includes(this.currentUser.id) ||
          m.content?.includes(`@${this.currentUser.name}`)
        );
        return userMentioned || t.created_by === this.currentUser.id;
      }),
      recentlyUpdated: threads.filter(t => {
        const lastMessage = t.messages?.[t.messages.length - 1];
        if (!lastMessage) return false;
        return new Date(lastMessage.created_at) > oneDayAgo;
      }).sort((a, b) => {
        const aTime = new Date(a.messages?.[a.messages.length - 1]?.created_at || a.created_at);
        const bTime = new Date(b.messages?.[b.messages.length - 1]?.created_at || b.created_at);
        return bTime - aTime;
      }),
      all: threads
    };
  }

  static render() {
    const container = document.getElementById('request-tracker');
    if (!container) return;

    const counts = {
      critical: this.requests.critical?.length || 0,
      high: this.requests.high?.length || 0,
      myAssigned: this.requests.myAssigned?.length || 0,
      recentlyUpdated: this.requests.recentlyUpdated?.length || 0,
      all: this.requests.all?.length || 0
    };

    const filteredRequests = this.requests[this.activeFilter] || [];

    container.innerHTML = `
      <div class="request-tracker-header">
        <h3>Open Requests</h3>
        <span class="request-count">${counts.all} open</span>
      </div>

      <div class="request-filters">
        <button class="filter-chip ${this.activeFilter === 'all' ? 'active' : ''}"
                onclick="RequestTracker.setFilter('all')">
          All <span class="chip-count">${counts.all}</span>
        </button>
        ${counts.critical > 0 ? `
          <button class="filter-chip filter-critical ${this.activeFilter === 'critical' ? 'active' : ''}"
                  onclick="RequestTracker.setFilter('critical')">
            Critical <span class="chip-count">${counts.critical}</span>
          </button>
        ` : ''}
        ${counts.high > 0 ? `
          <button class="filter-chip filter-high ${this.activeFilter === 'high' ? 'active' : ''}"
                  onclick="RequestTracker.setFilter('high')">
            High <span class="chip-count">${counts.high}</span>
          </button>
        ` : ''}
        ${counts.myAssigned > 0 ? `
          <button class="filter-chip filter-mine ${this.activeFilter === 'myAssigned' ? 'active' : ''}"
                  onclick="RequestTracker.setFilter('myAssigned')">
            Mine <span class="chip-count">${counts.myAssigned}</span>
          </button>
        ` : ''}
        <button class="filter-chip ${this.activeFilter === 'recentlyUpdated' ? 'active' : ''}"
                onclick="RequestTracker.setFilter('recentlyUpdated')">
          Recent <span class="chip-count">${counts.recentlyUpdated}</span>
        </button>
      </div>

      <div class="request-list">
        ${filteredRequests.length > 0 ?
          filteredRequests.slice(0, 10).map(thread => this.renderRequestCard(thread)).join('')
          : `
            <div class="request-empty">
              <p>No requests in this category</p>
            </div>
          `
        }
        ${filteredRequests.length > 10 ? `
          <div class="request-more">
            <a href="#" onclick="app.loadPage('comments'); return false;">
              View all ${filteredRequests.length} requests →
            </a>
          </div>
        ` : ''}
      </div>
    `;
  }

  static renderRequestCard(thread) {
    const repoName = thread.repo.split('/')[1] || thread.repo;
    const firstMessage = thread.messages?.[0];
    const messageCount = thread.messages?.length || 0;
    const lastActivity = thread.messages?.length
      ? this.formatTimeAgo(thread.messages[thread.messages.length - 1].created_at)
      : this.formatTimeAgo(thread.created_at);

    const priorityClass = thread.priority === 'critical' ? 'priority-critical' :
                          thread.priority === 'high' ? 'priority-high' : '';

    return `
      <div class="request-card glass-card-solid ${priorityClass}" data-thread-id="${thread.id}">
        <div class="request-priority-bar priority-${thread.priority || 'normal'}"></div>
        <div class="request-content">
          <div class="request-header">
            <span class="request-repo">${repoName}</span>
            <span class="request-branch">${thread.branch}</span>
            <span class="request-time">${lastActivity}</span>
          </div>
          <div class="request-message">
            ${firstMessage ? this.truncate(firstMessage.content, 80) : 'No message'}
          </div>
          <div class="request-footer">
            <span class="request-context">
              ${thread.context_type === 'code' ? '📄' : '🎯'}
              ${thread.context_type === 'code' ? (thread.file_path || 'Code') : 'UI Element'}
            </span>
            ${messageCount > 1 ? `
              <span class="request-replies">💬 ${messageCount}</span>
            ` : ''}
          </div>
        </div>
        <div class="request-actions">
          <button class="btn-request-action" onclick="RequestTracker.openThread('${thread.id}')" title="View">
            →
          </button>
        </div>
      </div>
    `;
  }

  static setFilter(filter) {
    this.activeFilter = filter;
    this.render();
  }

  static async openThread(threadId) {
    // Navigate to comments page and expand the thread
    CommentsManager.expandedThreads.add(threadId);
    app.loadPage('comments');
  }

  static async markAddressed(threadId, repo) {
    try {
      await api.request(`/threads/${threadId}`, {
        method: 'PATCH',
        body: JSON.stringify({ status: 'resolved', repo }),
      });
      app.showNotification('Marked as addressed');
      this.loadRequests();
    } catch (error) {
      app.showNotification('Failed to update: ' + error.message, 'error');
    }
  }

  static truncate(text, maxLength) {
    if (!text) return '';
    if (text.length <= maxLength) return text;
    return text.substring(0, maxLength) + '...';
  }

  static formatTimeAgo(dateString) {
    const date = new Date(dateString);
    const now = new Date();
    const seconds = Math.floor((now - date) / 1000);

    if (seconds < 60) return 'just now';
    if (seconds < 3600) return `${Math.floor(seconds / 60)}m`;
    if (seconds < 86400) return `${Math.floor(seconds / 3600)}h`;
    if (seconds < 604800) return `${Math.floor(seconds / 86400)}d`;
    return date.toLocaleDateString();
  }

  // Get summary stats for dashboard
  static getStats() {
    return {
      total: this.requests.all?.length || 0,
      critical: this.requests.critical?.length || 0,
      high: this.requests.high?.length || 0,
      mine: this.requests.myAssigned?.length || 0,
      recent: this.requests.recentlyUpdated?.length || 0
    };
  }
}

window.RequestTracker = RequestTracker;

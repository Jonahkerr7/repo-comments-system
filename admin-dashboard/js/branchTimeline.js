// Branch Timeline - Visualizes branch evolution through deployments, comments, and feedback
// Shows: Deployments, Comments Added, Resolutions, Phase Changes, Approvals

class BranchTimeline {
  static currentRepo = null;
  static currentBranch = null;
  static timelineData = [];

  static async init(repo, branch) {
    this.currentRepo = repo;
    this.currentBranch = branch;
  }

  static async loadTimeline(repo, branch) {
    const container = document.getElementById('branch-timeline');
    if (!container) return;

    this.currentRepo = repo || this.currentRepo;
    this.currentBranch = branch || this.currentBranch;

    container.innerHTML = `
      <div class="timeline-loading animate-pulse">
        <div class="loading-bar" style="height: 60px; width: 100%;"></div>
      </div>
    `;

    try {
      // Fetch deployments for this branch
      const deployments = await api.getDeployments({
        repo: this.currentRepo,
        branch: this.currentBranch,
        limit: 20
      });

      // Fetch threads for this branch
      const threads = await api.request(
        `/threads?repo=${encodeURIComponent(this.currentRepo)}&branch=${encodeURIComponent(this.currentBranch)}`
      );

      // Build timeline events
      this.timelineData = this.buildTimelineEvents(deployments, threads);

      this.render();
    } catch (error) {
      console.error('Error loading timeline:', error);
      container.innerHTML = `
        <div class="timeline-error glass-card">
          <p>Could not load timeline</p>
          <button class="btn-secondary" onclick="BranchTimeline.loadTimeline()">Retry</button>
        </div>
      `;
    }
  }

  static buildTimelineEvents(deployments, threads) {
    const events = [];

    // Add deployment events
    deployments.forEach(d => {
      events.push({
        id: `deploy-${d.id}`,
        type: 'deployment',
        icon: '🚀',
        title: `Deployed to ${d.phase || 'preview'}`,
        description: d.url ? new URL(d.url).hostname : 'Preview deployment',
        timestamp: new Date(d.created_at),
        data: d,
        phase: d.phase
      });

      // Add phase change if present
      if (d.phase && d.phase !== 'discover') {
        events.push({
          id: `phase-${d.id}`,
          type: 'phase-change',
          icon: this.getPhaseIcon(d.phase),
          title: `Entered ${this.capitalizeFirst(d.phase)} phase`,
          description: this.getPhaseDescription(d.phase),
          timestamp: new Date(d.created_at),
          data: d,
          phase: d.phase
        });
      }
    });

    // Add thread/comment events
    threads.forEach(t => {
      // Thread creation
      events.push({
        id: `thread-${t.id}`,
        type: 'comment',
        icon: '💬',
        title: 'Feedback added',
        description: t.messages?.[0]?.content?.substring(0, 60) + '...' || 'New comment thread',
        timestamp: new Date(t.created_at),
        data: t,
        priority: t.priority
      });

      // Thread resolution
      if (t.status === 'resolved' && t.resolved_at) {
        events.push({
          id: `resolved-${t.id}`,
          type: 'resolution',
          icon: '✅',
          title: 'Feedback addressed',
          description: t.messages?.[0]?.content?.substring(0, 40) + '...' || 'Issue resolved',
          timestamp: new Date(t.resolved_at),
          data: t
        });
      }
    });

    // Sort by timestamp (newest first for display, but we'll reverse for timeline)
    events.sort((a, b) => a.timestamp - b.timestamp);

    return events;
  }

  static render() {
    const container = document.getElementById('branch-timeline');
    if (!container) return;

    if (this.timelineData.length === 0) {
      container.innerHTML = `
        <div class="timeline-empty glass-card">
          <div class="empty-icon">📊</div>
          <h3>No activity yet</h3>
          <p>Deploy a preview or add comments to see the timeline</p>
        </div>
      `;
      return;
    }

    // Calculate time range
    const firstEvent = this.timelineData[0];
    const lastEvent = this.timelineData[this.timelineData.length - 1];
    const timeRange = lastEvent.timestamp - firstEvent.timestamp;

    // Build stats
    const stats = this.calculateStats();

    container.innerHTML = `
      <div class="timeline-header">
        <div class="timeline-info">
          <h3>Branch Evolution</h3>
          <span class="timeline-branch">${this.currentBranch}</span>
        </div>
        <div class="timeline-stats">
          <div class="stat-item">
            <span class="stat-value">${stats.deployments}</span>
            <span class="stat-label">Deploys</span>
          </div>
          <div class="stat-item">
            <span class="stat-value">${stats.comments}</span>
            <span class="stat-label">Comments</span>
          </div>
          <div class="stat-item">
            <span class="stat-value">${stats.resolved}</span>
            <span class="stat-label">Resolved</span>
          </div>
          <div class="stat-item stat-highlight">
            <span class="stat-value">${stats.resolutionRate}%</span>
            <span class="stat-label">Resolution</span>
          </div>
        </div>
      </div>

      <div class="timeline-container">
        <div class="timeline-track">
          <div class="timeline-line"></div>
          ${this.timelineData.map((event, idx) => {
            const position = timeRange > 0
              ? ((event.timestamp - firstEvent.timestamp) / timeRange) * 100
              : 50;
            return this.renderTimelineEvent(event, position, idx);
          }).join('')}
        </div>
      </div>

      <div class="timeline-legend">
        <div class="legend-item"><span class="legend-dot type-deployment"></span> Deployment</div>
        <div class="legend-item"><span class="legend-dot type-comment"></span> Feedback</div>
        <div class="legend-item"><span class="legend-dot type-resolution"></span> Resolved</div>
        <div class="legend-item"><span class="legend-dot type-phase-change"></span> Phase Change</div>
      </div>

      <div class="timeline-events-list">
        <h4>Activity Feed</h4>
        ${this.timelineData.slice().reverse().map(event => this.renderEventCard(event)).join('')}
      </div>
    `;

    this.attachEventListeners();
  }

  static renderTimelineEvent(event, position, index) {
    const typeClass = `event-${event.type}`;
    const priorityClass = event.priority ? `priority-${event.priority}` : '';
    const phaseClass = event.phase ? `phase-${event.phase}` : '';

    return `
      <div class="timeline-event ${typeClass} ${priorityClass} ${phaseClass}"
           style="left: ${Math.min(Math.max(position, 5), 95)}%"
           data-event-id="${event.id}"
           data-index="${index}">
        <div class="event-marker">${event.icon}</div>
        <div class="event-tooltip">
          <div class="tooltip-title">${event.title}</div>
          <div class="tooltip-description">${event.description}</div>
          <div class="tooltip-time">${this.formatTimeAgo(event.timestamp)}</div>
        </div>
      </div>
    `;
  }

  static renderEventCard(event) {
    const typeClass = `event-${event.type}`;
    const priorityClass = event.priority ? `priority-${event.priority}` : '';

    return `
      <div class="event-card glass-card-solid ${typeClass} ${priorityClass}">
        <div class="event-icon">${event.icon}</div>
        <div class="event-content">
          <div class="event-title">${event.title}</div>
          <div class="event-description">${event.description}</div>
        </div>
        <div class="event-time">${this.formatTimeAgo(event.timestamp)}</div>
      </div>
    `;
  }

  static calculateStats() {
    const deployments = this.timelineData.filter(e => e.type === 'deployment').length;
    const comments = this.timelineData.filter(e => e.type === 'comment').length;
    const resolved = this.timelineData.filter(e => e.type === 'resolution').length;
    const resolutionRate = comments > 0 ? Math.round((resolved / comments) * 100) : 0;

    return { deployments, comments, resolved, resolutionRate };
  }

  static getPhaseIcon(phase) {
    const icons = {
      discover: '🔍',
      define: '📐',
      develop: '⚡',
      deliver: '🎯'
    };
    return icons[phase] || '📊';
  }

  static getPhaseDescription(phase) {
    const descriptions = {
      discover: 'Research and exploration phase',
      define: 'Defining requirements and scope',
      develop: 'Active development and iteration',
      deliver: 'Final review and delivery'
    };
    return descriptions[phase] || '';
  }

  static capitalizeFirst(str) {
    return str.charAt(0).toUpperCase() + str.slice(1);
  }

  static formatTimeAgo(date) {
    const now = new Date();
    const seconds = Math.floor((now - date) / 1000);

    if (seconds < 60) return 'just now';
    if (seconds < 3600) return `${Math.floor(seconds / 60)}m ago`;
    if (seconds < 86400) return `${Math.floor(seconds / 3600)}h ago`;
    if (seconds < 604800) return `${Math.floor(seconds / 86400)}d ago`;
    return date.toLocaleDateString();
  }

  static attachEventListeners() {
    // Hover events for timeline markers
    document.querySelectorAll('.timeline-event').forEach(el => {
      el.addEventListener('mouseenter', () => {
        el.classList.add('active');
      });
      el.addEventListener('mouseleave', () => {
        el.classList.remove('active');
      });
    });
  }

  // Get timeline for a specific deployment
  static async loadDeploymentTimeline(deploymentId) {
    try {
      const deployment = await api.request(`/deployments/${deploymentId}`);
      if (deployment) {
        await this.loadTimeline(deployment.repo, deployment.branch);
      }
    } catch (error) {
      console.error('Error loading deployment timeline:', error);
    }
  }
}

window.BranchTimeline = BranchTimeline;

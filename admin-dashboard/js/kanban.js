// Double Diamond Kanban Board Management
// Enhanced with WIP limits, progress visualization, and animations

class KanbanManager {
  static deployments = [];
  static stats = {};
  static phases = ['discover', 'define', 'develop', 'deliver'];
  static phaseLabels = {
    discover: 'Discover',
    define: 'Define',
    develop: 'Develop',
    deliver: 'Deliver'
  };
  static phaseDescriptions = {
    discover: 'Research & explore the problem space',
    define: 'Synthesize insights and define requirements',
    develop: 'Create and iterate on solutions',
    deliver: 'Final review and deployment'
  };
  static phaseColors = {
    discover: '#6366f1',
    define: '#8b5cf6',
    develop: '#06b6d4',
    deliver: '#10b981'
  };
  static phaseIcons = {
    discover: '🔍',
    define: '📐',
    develop: '⚡',
    deliver: '🎯'
  };
  // WIP limits per phase (0 = unlimited)
  static wipLimits = {
    discover: 0,
    define: 5,
    develop: 8,
    deliver: 3
  };
  static draggedElement = null;

  static async loadKanban() {
    const kanbanBoard = document.getElementById('kanban-board');

    try {
      // Get filters
      const repo = document.getElementById('filter-kanban-repo')?.value;
      const filters = { limit: 100 };
      if (repo) filters.repo = repo;

      // Load deployments and stats in parallel
      const [deployments, stats] = await Promise.all([
        api.getDeployments(filters),
        api.getKanbanStats(repo || null)
      ]);

      // Filter out closed deployments for kanban
      this.deployments = deployments.filter(d => d.status !== 'closed');
      this.stats = stats;

      this.renderKanbanBoard();
      this.populateRepoFilter();
      this.attachEventListeners();
    } catch (error) {
      console.error('Error loading kanban:', error);
      kanbanBoard.innerHTML = `
        <div style="text-align: center; padding: 3rem; color: #f56565; grid-column: 1 / -1;">
          <p>Error loading kanban board. Please try again.</p>
        </div>
      `;
    }
  }

  static renderKanbanBoard() {
    const kanbanBoard = document.getElementById('kanban-board');

    // Calculate phase progress
    const totalItems = this.deployments.length || 1;
    const phaseCounts = {};
    this.phases.forEach(phase => {
      phaseCounts[phase] = this.deployments.filter(d => (d.phase || 'discover') === phase).length;
    });

    // Render progress header + columns
    kanbanBoard.innerHTML = `
      <!-- Phase Progress Visualization -->
      <div class="kanban-progress-header">
        <div class="kanban-progress-track">
          ${this.phases.map((phase, idx) => {
            const count = phaseCounts[phase];
            const percentage = (count / totalItems) * 100;
            return `
              <div class="progress-phase phase-${phase}" style="--phase-color: ${this.phaseColors[phase]}">
                <div class="progress-phase-icon">${this.phaseIcons[phase]}</div>
                <div class="progress-phase-info">
                  <span class="progress-phase-name">${this.phaseLabels[phase]}</span>
                  <span class="progress-phase-count">${count}</span>
                </div>
                <div class="progress-phase-bar">
                  <div class="progress-phase-fill" style="width: ${percentage}%"></div>
                </div>
              </div>
              ${idx < this.phases.length - 1 ? '<div class="progress-connector"></div>' : ''}
            `;
          }).join('')}
        </div>
        <div class="kanban-total-stats">
          <span class="total-stat"><strong>${totalItems}</strong> Total Items</span>
          <span class="total-stat"><strong>${phaseCounts.deliver}</strong> Delivered</span>
        </div>
      </div>

      <!-- Kanban Columns -->
      <div class="kanban-columns-wrapper">
        ${this.phases.map(phase => {
          const phaseDeployments = this.deployments.filter(d => (d.phase || 'discover') === phase);
          const stat = this.stats[phase] || { count: 0, pending_review: 0, open_threads: 0 };
          const wipLimit = this.wipLimits[phase];
          const isOverWip = wipLimit > 0 && phaseDeployments.length > wipLimit;
          const isAtWip = wipLimit > 0 && phaseDeployments.length === wipLimit;

          return `
            <div class="kanban-column ${isOverWip ? 'wip-exceeded' : ''} ${isAtWip ? 'wip-at-limit' : ''}"
                 data-phase="${phase}">
              <div class="kanban-column-header" style="--phase-color: ${this.phaseColors[phase]}">
                <div class="kanban-column-title">
                  <span class="kanban-phase-icon">${this.phaseIcons[phase]}</span>
                  <h3>${this.phaseLabels[phase]}</h3>
                  <span class="kanban-count">${stat.count}</span>
                  ${wipLimit > 0 ? `<span class="kanban-wip-limit ${isOverWip ? 'exceeded' : ''}">${wipLimit} max</span>` : ''}
                </div>
                <p class="kanban-column-desc">${this.phaseDescriptions[phase]}</p>
                ${stat.open_threads > 0 ? `
                  <div class="kanban-column-alerts">
                    <span class="alert-badge">🔓 ${stat.open_threads} open threads</span>
                  </div>
                ` : ''}
              </div>
              <div class="kanban-column-content"
                   data-phase="${phase}"
                   ondragover="KanbanManager.handleDragOver(event)"
                   ondragleave="KanbanManager.handleDragLeave(event)"
                   ondrop="KanbanManager.handleDrop(event, '${phase}')">
                ${phaseDeployments.length > 0
                  ? phaseDeployments.map((d, idx) => this.renderKanbanCard(d, idx)).join('')
                  : '<div class="kanban-empty">Drop items here</div>'
                }
              </div>
            </div>
          `;
        }).join('')}
      </div>
    `;
  }

  static renderKanbanCard(deployment, index = 0) {
    const statusClass = IterationsManager.getStatusClass(deployment.status);
    const reviewClass = IterationsManager.getReviewStatusClass(deployment.review_status);
    const timeAgo = IterationsManager.formatTimeAgo(deployment.deployed_at || deployment.created_at);
    const repoName = deployment.repo.split('/')[1] || deployment.repo;
    const phase = deployment.phase || 'discover';
    const hasOpenThreads = (deployment.open_threads || 0) > 0;
    const hasCriticalComments = deployment.has_critical_comments;

    return `
      <div class="kanban-card glass-card-solid animate-slide-up ${hasOpenThreads ? 'has-open-threads' : ''} ${hasCriticalComments ? 'has-critical' : ''}"
           data-deployment-id="${deployment.id}"
           data-phase="${phase}"
           style="animation-delay: ${index * 50}ms"
           draggable="true"
           ondragstart="KanbanManager.handleDragStart(event, '${deployment.id}')"
           ondragend="KanbanManager.handleDragEnd(event)">
        <div class="kanban-card-phase-indicator" style="background: ${this.phaseColors[phase]}"></div>
        <div class="kanban-card-header">
          <span class="kanban-card-repo">${repoName}</span>
          ${deployment.pr_number ? `<span class="kanban-card-pr">#${deployment.pr_number}</span>` : ''}
        </div>
        <div class="kanban-card-branch">${deployment.branch}</div>
        ${deployment.pr_title ? `<div class="kanban-card-title">${this.truncate(deployment.pr_title, 50)}</div>` : ''}
        <div class="kanban-card-meta">
          <div class="kanban-card-badges">
            <span class="status-badge small ${statusClass}">${deployment.status}</span>
            <span class="review-badge small ${reviewClass}">${deployment.review_status}</span>
          </div>
          <span class="kanban-card-time">${timeAgo}</span>
        </div>
        <div class="kanban-card-stats">
          <span class="stat-comments ${(deployment.comment_count || 0) > 0 ? 'has-comments' : ''}" title="Comments">
            💬 ${deployment.comment_count || 0}
          </span>
          <span class="stat-threads ${hasOpenThreads ? 'has-open' : ''}" title="Open threads">
            🔓 ${deployment.open_threads || 0}
          </span>
          ${(deployment.resolved_threads || 0) > 0 ? `
            <span class="stat-resolved" title="Resolved">✅ ${deployment.resolved_threads}</span>
          ` : ''}
        </div>
        <div class="kanban-card-actions">
          ${deployment.url ? `<a href="${deployment.url}" target="_blank" class="btn-small btn-launch">Launch</a>` : ''}
          <button class="btn-small btn-secondary btn-kanban-details" data-id="${deployment.id}">Details</button>
        </div>
      </div>
    `;
  }

  // Drag and Drop handlers
  static handleDragStart(event, id) {
    event.target.classList.add('dragging');
    event.dataTransfer.effectAllowed = 'move';
    event.dataTransfer.setData('text/plain', id);
  }

  static handleDragEnd(event) {
    event.target.classList.remove('dragging');
    document.querySelectorAll('.kanban-column-content').forEach(col => {
      col.classList.remove('drag-over');
    });
  }

  static handleDragOver(event) {
    event.preventDefault();
    event.dataTransfer.dropEffect = 'move';
    event.currentTarget.classList.add('drag-over');
  }

  static handleDragLeave(event) {
    event.currentTarget.classList.remove('drag-over');
  }

  static async handleDrop(event, newPhase) {
    event.preventDefault();
    event.currentTarget.classList.remove('drag-over');

    const deploymentId = event.dataTransfer.getData('text/plain');
    const deployment = this.deployments.find(d => d.id === deploymentId);

    if (!deployment) return;

    const currentPhase = deployment.phase || 'discover';
    if (currentPhase === newPhase) return;

    // Check WIP limit before allowing drop
    const wipLimit = this.wipLimits[newPhase];
    const currentCount = this.deployments.filter(d => (d.phase || 'discover') === newPhase).length;
    if (wipLimit > 0 && currentCount >= wipLimit) {
      app.showNotification(`WIP limit reached for ${this.phaseLabels[newPhase]} (max ${wipLimit})`, 'error');
      return;
    }

    try {
      await api.updateDeploymentPhase(deploymentId, newPhase);

      // Celebrate if moving to Deliver phase
      if (newPhase === 'deliver') {
        this.celebrateDelivery();
        app.showNotification(`🎉 ${deployment.branch} moved to Deliver!`);
      } else {
        app.showNotification(`Moved to ${this.phaseLabels[newPhase]}`);
      }

      await this.loadKanban();
    } catch (error) {
      console.error('Error updating phase:', error);
      app.showNotification('Failed to move item: ' + error.message, 'error');
    }
  }

  // Confetti celebration for Deliver phase
  static celebrateDelivery() {
    const colors = ['#10b981', '#8b5cf6', '#06b6d4', '#f59e0b', '#ec4899'];
    const confettiCount = 50;

    for (let i = 0; i < confettiCount; i++) {
      const confetti = document.createElement('div');
      confetti.className = 'confetti';
      confetti.style.cssText = `
        position: fixed;
        width: 10px;
        height: 10px;
        background: ${colors[Math.floor(Math.random() * colors.length)]};
        left: ${Math.random() * 100}vw;
        top: -10px;
        border-radius: ${Math.random() > 0.5 ? '50%' : '2px'};
        animation: confetti-fall ${2 + Math.random() * 2}s linear forwards;
        animation-delay: ${Math.random() * 0.5}s;
        z-index: 10000;
        pointer-events: none;
      `;
      document.body.appendChild(confetti);

      // Remove after animation
      setTimeout(() => confetti.remove(), 4000);
    }
  }

  static populateRepoFilter() {
    const filterSelect = document.getElementById('filter-kanban-repo');
    if (!filterSelect) return;

    const currentValue = filterSelect.value;
    const repos = [...new Set(this.deployments.map(d => d.repo))];

    filterSelect.innerHTML = `
      <option value="">All Repositories</option>
      ${repos.map(repo => `<option value="${repo}">${repo}</option>`).join('')}
    `;

    if (currentValue) {
      filterSelect.value = currentValue;
    }
  }

  static attachEventListeners() {
    // Filter change
    const filterSelect = document.getElementById('filter-kanban-repo');
    if (filterSelect) {
      filterSelect.removeEventListener('change', this.handleFilterChange);
      filterSelect.addEventListener('change', this.handleFilterChange.bind(this));
    }

    // Details buttons
    document.querySelectorAll('.btn-kanban-details').forEach(btn => {
      btn.addEventListener('click', (e) => {
        e.stopPropagation();
        const id = btn.dataset.id;
        IterationsManager.showDeploymentDetails(id);
      });
    });
  }

  static handleFilterChange() {
    this.loadKanban();
  }

  static truncate(str, length) {
    if (!str) return '';
    return str.length > length ? str.substring(0, length) + '...' : str;
  }
}

window.KanbanManager = KanbanManager;

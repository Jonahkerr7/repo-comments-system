// Double Diamond Kanban Board Management

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

    kanbanBoard.innerHTML = this.phases.map(phase => {
      const phaseDeployments = this.deployments.filter(d => (d.phase || 'discover') === phase);
      const stat = this.stats[phase] || { count: 0, pending_review: 0, open_threads: 0 };

      return `
        <div class="kanban-column" data-phase="${phase}">
          <div class="kanban-column-header">
            <div class="kanban-column-title">
              <h3>${this.phaseLabels[phase]}</h3>
              <span class="kanban-count">${stat.count}</span>
            </div>
            <p class="kanban-column-desc">${this.phaseDescriptions[phase]}</p>
          </div>
          <div class="kanban-column-content"
               data-phase="${phase}"
               ondragover="KanbanManager.handleDragOver(event)"
               ondragleave="KanbanManager.handleDragLeave(event)"
               ondrop="KanbanManager.handleDrop(event, '${phase}')">
            ${phaseDeployments.length > 0
              ? phaseDeployments.map(d => this.renderKanbanCard(d)).join('')
              : '<div class="kanban-empty">No items</div>'
            }
          </div>
        </div>
      `;
    }).join('');
  }

  static renderKanbanCard(deployment) {
    const statusClass = IterationsManager.getStatusClass(deployment.status);
    const reviewClass = IterationsManager.getReviewStatusClass(deployment.review_status);
    const timeAgo = IterationsManager.formatTimeAgo(deployment.deployed_at || deployment.created_at);
    const repoName = deployment.repo.split('/')[1] || deployment.repo;

    return `
      <div class="kanban-card"
           data-deployment-id="${deployment.id}"
           draggable="true"
           ondragstart="KanbanManager.handleDragStart(event, '${deployment.id}')"
           ondragend="KanbanManager.handleDragEnd(event)">
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
          <span title="Comments">💬 ${deployment.comment_count || 0}</span>
          <span title="Open threads">🔓 ${deployment.open_threads || 0}</span>
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

    try {
      await api.updateDeploymentPhase(deploymentId, newPhase);
      app.showNotification(`Moved to ${this.phaseLabels[newPhase]}`);
      await this.loadKanban();
    } catch (error) {
      console.error('Error updating phase:', error);
      app.showNotification('Failed to move item: ' + error.message, 'error');
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

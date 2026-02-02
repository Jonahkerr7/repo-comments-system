// Iterations/Deployments Management

class IterationsManager {
  static deployments = [];
  static selectedDeployment = null;

  static async loadIterations() {
    const iterationsList = document.getElementById('iterations-list');

    try {
      // Get filters
      const repo = document.getElementById('filter-iteration-repo')?.value;
      const status = document.getElementById('filter-iteration-status')?.value;
      const environment = document.getElementById('filter-iteration-env')?.value;

      const filters = {};
      if (repo) filters.repo = repo;
      if (status) filters.status = status;
      if (environment) filters.environment = environment;

      this.deployments = await api.getDeployments(filters);

      if (this.deployments.length === 0) {
        iterationsList.innerHTML = `
          <div style="text-align: center; padding: 3rem; color: #a0aec0; background: white; border-radius: 8px; border: 1px solid #e2e8f0;">
            <p>No deployments found.</p>
            <p style="margin-top: 0.5rem; font-size: 0.875rem;">Deployments will appear here when GitHub Actions sends deployment info.</p>
          </div>
        `;
        return;
      }

      iterationsList.innerHTML = this.deployments.map(d => this.renderDeploymentCard(d)).join('');
      this.attachEventListeners();
      await this.loadStats();
      this.populateRepoFilter();
    } catch (error) {
      console.error('Error loading iterations:', error);
      iterationsList.innerHTML = `
        <div style="text-align: center; padding: 3rem; color: #f56565;">
          <p>Error loading deployments. Please try again.</p>
        </div>
      `;
    }
  }

  static async loadStats() {
    try {
      const stats = await api.getDeploymentStats();
      document.getElementById('stat-active-deployments').textContent = stats.active_deployments || 0;
      document.getElementById('stat-pending-review').textContent = stats.pending_review || 0;
      document.getElementById('stat-open-threads').textContent = stats.total_open_threads || 0;
      document.getElementById('stat-approved-today').textContent = stats.approved_today || 0;
    } catch (error) {
      console.error('Error loading stats:', error);
    }
  }

  static renderDeploymentCard(deployment) {
    const timeAgo = this.formatTimeAgo(deployment.deployed_at || deployment.created_at);
    const statusClass = this.getStatusClass(deployment.status);
    const reviewStatusClass = this.getReviewStatusClass(deployment.review_status);

    return `
      <div class="deployment-card" data-deployment-id="${deployment.id}">
        <div class="deployment-main">
          <div class="deployment-info">
            <div class="deployment-title">
              <span class="deployment-repo">${deployment.repo}</span>
              ${deployment.pr_number ? `<span class="deployment-pr">#${deployment.pr_number}</span>` : ''}
            </div>
            <div class="deployment-branch">${deployment.branch}</div>
            ${deployment.pr_title ? `<div class="deployment-pr-title">${deployment.pr_title}</div>` : ''}
            ${deployment.commit_message ? `<div class="deployment-commit">${this.truncate(deployment.commit_message, 60)}</div>` : ''}
          </div>
          <div class="deployment-badges">
            <span class="status-badge ${statusClass}">${deployment.status}</span>
            <span class="review-badge ${reviewStatusClass}">${deployment.review_status}</span>
            <span class="env-badge env-${deployment.environment}">${deployment.environment}</span>
          </div>
        </div>
        <div class="deployment-stats-mini">
          <span class="stat-item" title="Comments">
            <span class="stat-icon">💬</span> ${deployment.comment_count || 0}
          </span>
          <span class="stat-item" title="Open Threads">
            <span class="stat-icon">🔓</span> ${deployment.open_threads || 0}
          </span>
          <span class="stat-item" title="Resolved">
            <span class="stat-icon">✅</span> ${deployment.resolved_threads || 0}
          </span>
          <span class="deployment-time">${timeAgo}</span>
        </div>
        <div class="deployment-actions">
          <button class="btn-primary btn-small btn-launch" title="Open deployment URL">Launch</button>
          <button class="btn-secondary btn-small btn-details">Details</button>
          ${deployment.review_status === 'pending' ? `<button class="btn-success btn-small btn-approve">Approve</button>` : ''}
        </div>
      </div>
    `;
  }

  static attachEventListeners() {
    // Launch buttons
    document.querySelectorAll('.btn-launch').forEach(btn => {
      btn.addEventListener('click', (e) => {
        e.stopPropagation();
        const card = e.target.closest('.deployment-card');
        const id = card.dataset.deploymentId;
        const deployment = this.deployments.find(d => d.id === id);
        if (deployment?.url) {
          window.open(deployment.url, '_blank');
          // Log the view activity
          api.logDeploymentActivity(id, 'viewed').catch(console.error);
        }
      });
    });

    // Details buttons
    document.querySelectorAll('.btn-details').forEach(btn => {
      btn.addEventListener('click', (e) => {
        e.stopPropagation();
        const card = e.target.closest('.deployment-card');
        const id = card.dataset.deploymentId;
        this.showDeploymentDetails(id);
      });
    });

    // Approve buttons
    document.querySelectorAll('.btn-approve').forEach(btn => {
      btn.addEventListener('click', async (e) => {
        e.stopPropagation();
        const card = e.target.closest('.deployment-card');
        const id = card.dataset.deploymentId;
        await this.approveDeployment(id);
      });
    });

    // Filter change handlers
    ['filter-iteration-repo', 'filter-iteration-status', 'filter-iteration-env'].forEach(filterId => {
      const el = document.getElementById(filterId);
      if (el) {
        el.addEventListener('change', () => this.loadIterations());
      }
    });
  }

  static async showDeploymentDetails(id) {
    const deployment = this.deployments.find(d => d.id === id);
    if (!deployment) return;

    this.selectedDeployment = deployment;

    // Populate modal
    const meta = document.getElementById('deployment-meta');
    meta.innerHTML = `
      <div class="detail-row">
        <strong>Repository:</strong> ${deployment.repo}
      </div>
      <div class="detail-row">
        <strong>Branch:</strong> ${deployment.branch}
      </div>
      ${deployment.commit_sha ? `
        <div class="detail-row">
          <strong>Commit:</strong> <code>${deployment.commit_sha.substring(0, 7)}</code>
        </div>
      ` : ''}
      ${deployment.pr_number ? `
        <div class="detail-row">
          <strong>PR:</strong> #${deployment.pr_number} - ${deployment.pr_title || ''}
        </div>
      ` : ''}
      ${deployment.pr_author ? `
        <div class="detail-row">
          <strong>Author:</strong> ${deployment.pr_author}
        </div>
      ` : ''}
      <div class="detail-row">
        <strong>URL:</strong> <a href="${deployment.url}" target="_blank">${deployment.url}</a>
      </div>
      <div class="detail-row">
        <strong>Status:</strong>
        <span class="status-badge ${this.getStatusClass(deployment.status)}">${deployment.status}</span>
        <span class="review-badge ${this.getReviewStatusClass(deployment.review_status)}">${deployment.review_status}</span>
      </div>
      <div class="detail-row">
        <strong>Deployed:</strong> ${new Date(deployment.deployed_at || deployment.created_at).toLocaleString()}
      </div>
    `;

    // Update stats
    document.getElementById('deployment-comment-count').textContent = deployment.comment_count || 0;
    document.getElementById('deployment-open-threads').textContent = deployment.open_threads || 0;
    document.getElementById('deployment-resolved-threads').textContent = deployment.resolved_threads || 0;

    // Load activity
    try {
      const activity = await api.getDeploymentActivity(id);
      const activityList = document.getElementById('deployment-activity-list');
      if (activity.length > 0) {
        activityList.innerHTML = activity.map(a => `
          <div class="activity-item">
            <span class="activity-action">${a.action}</span>
            ${a.user_name ? `<span class="activity-user">by ${a.user_name}</span>` : ''}
            <span class="activity-time">${this.formatTimeAgo(a.created_at)}</span>
            ${a.details ? `<span class="activity-details">${a.details}</span>` : ''}
          </div>
        `).join('');
      } else {
        activityList.innerHTML = '<p style="color: #a0aec0; font-size: 0.875rem;">No activity yet</p>';
      }
    } catch (error) {
      console.error('Error loading activity:', error);
    }

    // Load branch timeline
    if (typeof BranchTimeline !== 'undefined') {
      BranchTimeline.loadTimeline(deployment.repo, deployment.branch);
    }

    // Setup modal buttons
    document.getElementById('btn-launch-deployment').onclick = () => {
      window.open(deployment.url, '_blank');
      api.logDeploymentActivity(id, 'viewed').catch(console.error);
    };

    document.getElementById('btn-approve-deployment').onclick = () => {
      this.approveDeployment(id);
    };

    // Update approve button state
    const approveBtn = document.getElementById('btn-approve-deployment');
    if (deployment.review_status === 'approved') {
      approveBtn.textContent = 'Approved';
      approveBtn.disabled = true;
      approveBtn.classList.add('btn-disabled');
    } else {
      approveBtn.textContent = 'Approve';
      approveBtn.disabled = false;
      approveBtn.classList.remove('btn-disabled');
    }

    document.getElementById('modal-deployment').classList.add('active');
  }

  static async approveDeployment(id) {
    try {
      await api.updateDeployment(id, {
        review_status: 'approved',
        status: 'approved'
      });
      app.showNotification('Deployment approved!');
      await this.loadIterations();

      // Close modal if open
      document.getElementById('modal-deployment').classList.remove('active');
    } catch (error) {
      console.error('Error approving deployment:', error);
      app.showNotification('Failed to approve: ' + error.message, 'error');
    }
  }

  static populateRepoFilter() {
    const filterSelect = document.getElementById('filter-iteration-repo');
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

  static truncate(str, length) {
    if (!str) return '';
    return str.length > length ? str.substring(0, length) + '...' : str;
  }

  static getStatusClass(status) {
    const classes = {
      pending: 'status-pending',
      building: 'status-building',
      deployed: 'status-deployed',
      reviewed: 'status-reviewed',
      approved: 'status-approved',
      closed: 'status-closed'
    };
    return classes[status] || 'status-default';
  }

  static getReviewStatusClass(status) {
    const classes = {
      pending: 'review-pending',
      in_review: 'review-in-progress',
      changes_requested: 'review-changes',
      approved: 'review-approved'
    };
    return classes[status] || 'review-default';
  }
}

window.IterationsManager = IterationsManager;

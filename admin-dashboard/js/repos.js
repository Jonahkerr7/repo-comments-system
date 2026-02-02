// Repository Management

class ReposManager {
  static repos = new Set();
  static githubRepos = [];
  static connectedRepos = new Set();
  static deploymentUrls = new Map(); // repo -> latest deployment URL

  static async loadRepos() {
    const reposList = document.getElementById('repos-list');

    try {
      // Get connected repos from permissions
      const permissions = await api.request('/permissions');
      this.connectedRepos = new Set(permissions.map(p => p.repo));

      // Fetch deployments to get URLs for launch buttons
      try {
        const deployments = await api.getDeployments({ limit: 100 });
        this.deploymentUrls.clear();
        // Group by repo, prefer production/main branch deployments
        deployments.forEach(d => {
          if (!d.url) return;
          const existing = this.deploymentUrls.get(d.repo);
          // Prefer: production env, or main/master branch, or most recent
          if (!existing ||
              (d.environment === 'production' && existing.environment !== 'production') ||
              ((d.branch === 'main' || d.branch === 'master') && existing.branch !== 'main' && existing.branch !== 'master')) {
            this.deploymentUrls.set(d.repo, d);
          }
        });
      } catch (e) {
        console.warn('Could not load deployments:', e);
      }

      // Try to get GitHub repos
      let githubError = null;
      try {
        this.githubRepos = await api.getGitHubRepos();
      } catch (e) {
        githubError = e;
        this.githubRepos = [];
      }

      // Group permissions by repo
      const repoPermissions = {};
      permissions.forEach(perm => {
        if (!repoPermissions[perm.repo]) {
          repoPermissions[perm.repo] = [];
        }
        repoPermissions[perm.repo].push(perm);
      });

      // Build the repos list
      let html = '';

      // Show connected repos as primary content
      if (this.connectedRepos.size > 0) {
        html += `
          <div class="connected-repos-section">
            <div class="connected-repos-grid">
              ${Array.from(this.connectedRepos)
                .map(repo => this.renderConnectedRepoCard(repo, repoPermissions[repo]))
                .join('')}
            </div>
          </div>
        `;
      } else {
        html = `
          <div class="repos-empty-state glass-card">
            <div class="empty-icon">📦</div>
            <h3>No repositories connected</h3>
            <p>Connect your GitHub repositories to enable commenting</p>
            ${this.githubRepos.length > 0
              ? '<button class="btn-primary" onclick="ReposManager.openConnectModal()">Connect Repository</button>'
              : '<button class="btn-primary" onclick="api.login()">Login with GitHub</button>'
            }
          </div>
        `;
      }

      // Store modal content for later
      this.updateConnectModal();

      reposList.innerHTML = html;

      // Attach event listeners
      this.attachEventListeners();
      this.attachGitHubListeners();

      // Populate filter dropdown
      this.repos = this.connectedRepos;
      this.populateRepoFilter();

      // Load branches after repos are loaded (ensures connectedRepos is populated)
      await this.loadActiveBranches();
    } catch (error) {
      console.error('Error loading repositories:', error);
      reposList.innerHTML = `
        <div style="text-align: center; padding: 3rem; color: #f56565;">
          <p>Error loading repositories. Please try again.</p>
        </div>
      `;
    }
  }

  // Compact card for connected repos on main page
  static renderConnectedRepoCard(repo, permissions = []) {
    const deployment = this.deploymentUrls.get(repo);
    const previewUrl = deployment?.url;
    const repoName = repo.split('/')[1] || repo;
    const owner = repo.split('/')[0] || '';
    const permCount = permissions?.length || 0;
    const env = deployment?.environment || 'preview';

    return `
      <div class="connected-repo-card glass-card-solid" data-repo="${repo}">
        <div class="connected-repo-header">
          <div class="connected-repo-icon">📦</div>
          <div class="connected-repo-info">
            <span class="connected-repo-name">${repoName}</span>
            <span class="connected-repo-owner">${owner}</span>
          </div>
        </div>
        <div class="connected-repo-meta">
          ${deployment ? `<span class="repo-env env-${env}">${env}</span>` : '<span class="repo-env" style="background:#f3f4f6;color:#6b7280;">no deploy</span>'}
          <span class="repo-stat">👥 ${permCount}</span>
        </div>
        <div class="connected-repo-actions">
          ${previewUrl
            ? `<a href="${previewUrl}" target="_blank" class="btn-small btn-launch">Launch</a>`
            : '<span class="btn-small btn-secondary" style="opacity:0.5;cursor:default;">No URL</span>'
          }
          <button class="btn-small btn-secondary btn-view-comments" title="View Comments">💬</button>
          <button class="btn-small btn-secondary btn-manage-permissions" title="Settings">⚙️</button>
        </div>
      </div>
    `;
  }

  // Modal for connecting new repos
  static updateConnectModal() {
    const modalContent = document.getElementById('connect-repos-grid');
    if (!modalContent) return;

    if (this.githubRepos.length === 0) {
      modalContent.innerHTML = `
        <div class="connect-empty">
          <p>No GitHub repositories found</p>
          <button class="btn-primary" onclick="api.login()">Reconnect GitHub</button>
        </div>
      `;
      return;
    }

    // Separate connected and unconnected repos
    const unconnected = this.githubRepos.filter(r => !this.connectedRepos.has(r.full_name));
    const connected = this.githubRepos.filter(r => this.connectedRepos.has(r.full_name));

    modalContent.innerHTML = `
      ${unconnected.length > 0 ? `
        <div class="connect-section">
          <h4 class="connect-section-title">Available to Connect</h4>
          <div class="connect-repos-grid">
            ${unconnected.map(repo => this.renderConnectRepoItem(repo, false)).join('')}
          </div>
        </div>
      ` : ''}
      ${connected.length > 0 ? `
        <div class="connect-section">
          <h4 class="connect-section-title">Already Connected</h4>
          <div class="connect-repos-grid">
            ${connected.map(repo => this.renderConnectRepoItem(repo, true)).join('')}
          </div>
        </div>
      ` : ''}
    `;

    this.attachConnectModalListeners();
  }

  // Compact repo item for connect modal
  static renderConnectRepoItem(repo, isConnected) {
    return `
      <div class="connect-repo-item ${isConnected ? 'connected' : ''}" data-repo="${repo.full_name}">
        <div class="connect-repo-info">
          <span class="connect-repo-name">${repo.name}</span>
          ${repo.private ? '<span class="connect-repo-private">🔒</span>' : ''}
        </div>
        ${isConnected
          ? '<span class="connect-repo-status">✓ Connected</span>'
          : '<button class="btn-connect-repo">Connect</button>'
        }
      </div>
    `;
  }

  static openConnectModal() {
    this.updateConnectModal();
    document.getElementById('modal-connect-repos').classList.add('active');
  }

  static attachConnectModalListeners() {
    // Connect repo buttons in modal
    document.querySelectorAll('#modal-connect-repos .btn-connect-repo').forEach(btn => {
      btn.addEventListener('click', async (e) => {
        const item = e.target.closest('.connect-repo-item');
        const repo = item.dataset.repo;

        btn.disabled = true;
        btn.textContent = '...';

        try {
          await api.connectRepo(repo);
          app.showNotification(`Connected ${repo}`);
          item.classList.add('connected');
          btn.replaceWith(Object.assign(document.createElement('span'), {
            className: 'connect-repo-status',
            textContent: '✓ Connected'
          }));
          this.loadRepos(); // Refresh main page
        } catch (error) {
          app.showNotification('Failed to connect: ' + error.message, 'error');
          btn.disabled = false;
          btn.textContent = 'Connect';
        }
      });
    });
  }

  static attachGitHubListeners() {
    // Legacy - kept for backwards compatibility
  }

  static renderRepoCard(repo, permissions = []) {
    const userPerms = permissions.filter(p => p.user_id);
    const teamPerms = permissions.filter(p => p.team_id);
    // Use deployment URL if available
    const deployment = this.deploymentUrls.get(repo);
    const previewUrl = deployment?.url;

    return `
      <div class="repo-card" data-repo="${repo}">
        <div class="repo-info">
          <h3>${repo}</h3>
          <div class="repo-meta">
            ${userPerms.length} user permission${userPerms.length !== 1 ? 's' : ''},
            ${teamPerms.length} team permission${teamPerms.length !== 1 ? 's' : ''}
          </div>
        </div>
        <div class="repo-actions">
          ${previewUrl ? `<a href="${previewUrl}" target="_blank" class="btn-small btn-success">Launch</a>` : ''}
          <button class="btn-small btn-primary btn-manage-permissions">Permissions</button>
          <button class="btn-small btn-secondary btn-view-comments">Comments</button>
        </div>
      </div>
    `;
  }

  static attachEventListeners() {
    // Manage permissions
    document.querySelectorAll('.btn-manage-permissions').forEach(btn => {
      btn.addEventListener('click', (e) => {
        const repoCard = e.target.closest('.connected-repo-card');
        const repo = repoCard?.dataset.repo;
        if (repo) this.managePermissions(repo);
      });
    });

    // View comments
    document.querySelectorAll('.btn-view-comments').forEach(btn => {
      btn.addEventListener('click', (e) => {
        const repoCard = e.target.closest('.connected-repo-card');
        const repo = repoCard?.dataset.repo;
        if (repo) this.viewComments(repo);
      });
    });
  }

  static async managePermissions(repo) {
    const modal = document.getElementById('modal-permissions');
    document.getElementById('permissions-repo-name').textContent = repo;

    try {
      const permissions = await api.getPermissions(repo);
      const teams = await api.getTeams();
      const users = await api.getUsers();

      // Render team permissions
      const teamPerms = permissions.filter(p => p.team_id);
      const teamPermsList = document.getElementById('team-permissions-list');
      teamPermsList.innerHTML = teamPerms.length > 0
        ? teamPerms.map(p => {
            const team = teams.find(t => t.id === p.team_id);
            return this.renderPermissionItem(p, team?.name || 'Unknown Team');
          }).join('')
        : '<p style="color: #a0aec0; font-size: 0.875rem;">No team permissions</p>';

      // Render user permissions
      const userPerms = permissions.filter(p => p.user_id);
      const userPermsList = document.getElementById('user-permissions-list');
      userPermsList.innerHTML = userPerms.length > 0
        ? userPerms.map(p => {
            const user = users.find(u => u.id === p.user_id);
            return this.renderPermissionItem(p, user?.name || user?.email || 'Unknown User');
          }).join('')
        : '<p style="color: #a0aec0; font-size: 0.875rem;">No user permissions</p>';

      // Add permission buttons
      document.getElementById('btn-add-team-permission').onclick = async () => {
        const teamName = prompt(`Available teams:\n${teams.map((t, i) => `${i + 1}. ${t.name}`).join('\n')}\n\nEnter team number:`);
        if (teamName) {
          const team = teams[parseInt(teamName) - 1];
          const role = prompt('Enter role (read/write/admin):') || 'read';
          if (team) {
            await api.createPermission({ repo, team_id: team.id, role });
            this.managePermissions(repo);
            app.showNotification('Team permission added');
          }
        }
      };

      document.getElementById('btn-add-user-permission').onclick = async () => {
        const userName = prompt(`Available users:\n${users.map((u, i) => `${i + 1}. ${u.name} (${u.email})`).join('\n')}\n\nEnter user number:`);
        if (userName) {
          const user = users[parseInt(userName) - 1];
          const role = prompt('Enter role (read/write/admin):') || 'read';
          if (user) {
            await api.createPermission({ repo, user_id: user.id, role });
            this.managePermissions(repo);
            app.showNotification('User permission added');
          }
        }
      };

      modal.classList.add('active');
    } catch (error) {
      console.error('Error loading permissions:', error);
      app.showNotification('Failed to load permissions: ' + error.message, 'error');
    }
  }

  static renderPermissionItem(permission, name) {
    return `
      <div class="permission-item" data-perm-id="${permission.id}">
        <div class="permission-info">
          <strong>${name}</strong>
        </div>
        <div style="display: flex; align-items: center; gap: 0.5rem;">
          <span class="permission-role role-${permission.role}">${permission.role}</span>
          <button class="btn-small btn-secondary btn-delete-permission">Remove</button>
        </div>
      </div>
    `;
  }

  static viewComments(repo) {
    // Switch to comments page with filter
    document.getElementById('filter-repo').value = repo;
    app.loadPage('comments');
  }

  static populateRepoFilter() {
    const filterSelect = document.getElementById('filter-repo');
    const currentValue = filterSelect.value;

    filterSelect.innerHTML = `
      <option value="">All Repositories</option>
      ${Array.from(this.repos)
        .map(repo => `<option value="${repo}">${repo}</option>`)
        .join('')}
    `;

    if (currentValue) {
      filterSelect.value = currentValue;
    }
  }

  // Store all branches data for filtering
  static allBranches = [];
  static currentFilter = 'overview';

  // Active Branches (from deployments + GitHub API)
  static async loadActiveBranches() {
    const branchesList = document.getElementById('branches-list');

    try {
      // Get deployments to discover branches
      const deployments = await api.getDeployments({ limit: 50 });

      // Also try to get branches from GitHub API for connected repos
      let githubBranches = [];
      for (const repo of this.connectedRepos) {
        try {
          const [owner, repoName] = repo.split('/');
          const branches = await api.getGitHubBranches(owner, repoName);
          githubBranches = githubBranches.concat(branches.map(b => ({
            ...b,
            repo,
            fromGitHub: true
          })));
        } catch (e) {
          console.warn(`Could not fetch branches for ${repo}:`, e);
        }
      }

      // Group deployments by repo and branch, get latest deployment for each
      const branchMap = new Map();
      deployments.forEach(d => {
        const key = `${d.repo}:${d.branch}`;
        if (!branchMap.has(key) || new Date(d.created_at) > new Date(branchMap.get(key).created_at)) {
          branchMap.set(key, d);
        }
      });

      // Merge GitHub branches with deployment data
      const allBranchesData = [];

      // Add deployed branches first
      branchMap.forEach((deployment, key) => {
        allBranchesData.push({
          ...deployment,
          hasDeployment: true,
          isDefault: deployment.branch === 'main' || deployment.branch === 'master',
          lastUpdated: new Date(deployment.deployed_at || deployment.created_at)
        });
      });

      // Add GitHub branches that don't have deployments
      githubBranches.forEach(ghBranch => {
        const key = `${ghBranch.repo}:${ghBranch.name}`;
        if (!branchMap.has(key)) {
          allBranchesData.push({
            repo: ghBranch.repo,
            branch: ghBranch.name,
            hasDeployment: false,
            isDefault: ghBranch.name === 'main' || ghBranch.name === 'master',
            lastUpdated: new Date(),
            status: 'no-deployment',
            fromGitHub: true
          });
        }
      });

      // Sort: default branches first, then by last updated
      allBranchesData.sort((a, b) => {
        if (a.isDefault && !b.isDefault) return -1;
        if (!a.isDefault && b.isDefault) return 1;
        return b.lastUpdated - a.lastUpdated;
      });

      this.allBranches = allBranchesData;
      this.renderBranchesTable(this.currentFilter);
      this.attachBranchTabListeners();

    } catch (error) {
      console.error('Error loading branches:', error);
      branchesList.innerHTML = `
        <tr><td colspan="6" class="branches-empty">
          <p>Error loading branches.</p>
        </td></tr>
      `;
    }
  }

  static attachBranchTabListeners() {
    document.querySelectorAll('.branch-tab').forEach(tab => {
      tab.addEventListener('click', (e) => {
        document.querySelectorAll('.branch-tab').forEach(t => t.classList.remove('active'));
        e.target.classList.add('active');
        this.currentFilter = e.target.dataset.filter;
        this.renderBranchesTable(this.currentFilter);
      });
    });
  }

  static renderBranchesTable(filter = 'overview') {
    const branchesList = document.getElementById('branches-list');

    let filteredBranches = [...this.allBranches];
    const now = new Date();
    const oneWeekAgo = new Date(now - 7 * 24 * 60 * 60 * 1000);
    const oneMonthAgo = new Date(now - 30 * 24 * 60 * 60 * 1000);

    switch (filter) {
      case 'active':
        filteredBranches = filteredBranches.filter(b => b.lastUpdated > oneWeekAgo);
        break;
      case 'stale':
        filteredBranches = filteredBranches.filter(b => b.lastUpdated < oneMonthAgo);
        break;
      case 'overview':
        // Show default branches + recent active
        filteredBranches = filteredBranches.filter(b => b.isDefault || b.lastUpdated > oneWeekAgo);
        break;
      case 'all':
      default:
        // Show all
        break;
    }

    if (filteredBranches.length === 0) {
      branchesList.innerHTML = `
        <tr><td colspan="6" class="branches-empty">
          <p>No branches found.</p>
          <p>Branches appear when GitHub Actions sends deployment info.</p>
        </td></tr>
      `;
      return;
    }

    branchesList.innerHTML = filteredBranches.map(b => this.renderBranchRow(b)).join('');
  }

  static renderBranchRow(branch) {
    const timeAgo = this.formatTimeAgo(branch.deployed_at || branch.created_at || branch.lastUpdated);
    const isDefault = branch.isDefault;
    const hasDeployment = branch.hasDeployment;

    // Status icon
    let statusIcon = '';
    if (hasDeployment) {
      if (branch.status === 'deployed') {
        statusIcon = '<span class="status-icon success" title="Deployed">&#10003;</span>';
      } else if (branch.status === 'failed') {
        statusIcon = '<span class="status-icon failure" title="Failed">&#10007;</span>';
      } else {
        statusIcon = '<span class="status-icon pending" title="Pending">&#8226;</span>';
      }
    } else {
      statusIcon = '<span class="status-icon" style="color: #8b949e;" title="No deployment">-</span>';
    }

    // Environment badge
    const envBadge = branch.environment
      ? `<span class="env-badge env-${branch.environment}">${branch.environment}</span>`
      : '<span style="color: #8b949e;">-</span>';

    // PR link
    const prLink = branch.pr_number
      ? `<a href="https://github.com/${branch.repo}/pull/${branch.pr_number}" target="_blank" class="branch-pr-link">#${branch.pr_number}</a>`
      : '<span style="color: #8b949e;">-</span>';

    // Launch button
    const launchBtn = hasDeployment && branch.url
      ? `<a href="${branch.url}" target="_blank" class="btn-launch">Launch</a>`
      : '';

    return `
      <tr class="${isDefault ? 'default-branch' : ''}" data-repo="${branch.repo}" data-branch="${branch.branch}">
        <td>
          <div class="branch-name-cell">
            <span class="branch-name">${branch.branch}</span>
            ${isDefault ? '<span class="default-badge">Default</span>' : ''}
          </div>
          <div style="font-size: 0.75rem; color: #57606a; margin-top: 0.25rem;">${branch.repo}</div>
        </td>
        <td><span class="branch-time">${timeAgo}</span></td>
        <td>${statusIcon}</td>
        <td>${envBadge}</td>
        <td>${prLink}</td>
        <td class="branch-actions">${launchBtn}</td>
      </tr>
    `;
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
}

window.ReposManager = ReposManager;

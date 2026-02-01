// Repository Management

class ReposManager {
  static repos = new Set();
  static githubRepos = [];
  static connectedRepos = new Set();

  static async loadRepos() {
    const reposList = document.getElementById('repos-list');

    try {
      // Get connected repos from permissions
      const permissions = await api.request('/permissions');
      this.connectedRepos = new Set(permissions.map(p => p.repo));

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

      // Show GitHub repos section if we have GitHub access
      if (this.githubRepos.length > 0) {
        html += `
          <div class="github-repos-section">
            <h3 class="repos-section-title">Your GitHub Repositories</h3>
            <p class="repos-section-desc">Click "Connect" to enable commenting on a repo</p>
            <div class="github-repos-grid">
              ${this.githubRepos.slice(0, 12).map(repo => this.renderGitHubRepoCard(repo)).join('')}
            </div>
            ${this.githubRepos.length > 12 ? `
              <button class="btn-secondary btn-show-all-repos" style="margin-top: 1rem;">
                Show all ${this.githubRepos.length} repositories
              </button>
            ` : ''}
          </div>
        `;
      } else if (githubError) {
        html += `
          <div class="github-connect-prompt">
            <p>Login with GitHub to see your repositories</p>
            <button class="btn-primary" onclick="api.login()">Connect GitHub</button>
          </div>
        `;
      }

      // Show connected repos
      if (this.connectedRepos.size > 0) {
        html += `
          <div class="connected-repos-section">
            <h3 class="repos-section-title">Connected Repositories</h3>
            ${Array.from(this.connectedRepos)
              .map(repo => this.renderRepoCard(repo, repoPermissions[repo]))
              .join('')}
          </div>
        `;
      }

      if (html === '') {
        html = `
          <div style="text-align: center; padding: 3rem; color: #a0aec0; background: white; border-radius: 8px; border: 1px solid #e2e8f0;">
            <p>No repositories connected yet.</p>
            <p style="margin-top: 0.5rem; font-size: 0.875rem;">Connect your GitHub account to see your repos.</p>
          </div>
        `;
      }

      reposList.innerHTML = html;

      // Attach event listeners
      this.attachEventListeners();
      this.attachGitHubListeners();

      // Populate filter dropdown
      this.repos = this.connectedRepos;
      this.populateRepoFilter();
    } catch (error) {
      console.error('Error loading repositories:', error);
      reposList.innerHTML = `
        <div style="text-align: center; padding: 3rem; color: #f56565;">
          <p>Error loading repositories. Please try again.</p>
        </div>
      `;
    }
  }

  static renderGitHubRepoCard(repo) {
    const isConnected = this.connectedRepos.has(repo.full_name);
    const previewUrl = `http://localhost:8080?repo=${encodeURIComponent(repo.full_name)}`;

    return `
      <div class="github-repo-card ${isConnected ? 'connected' : ''}" data-repo="${repo.full_name}">
        <div class="github-repo-info">
          <span class="github-repo-name">${repo.name}</span>
          <span class="github-repo-owner">${repo.owner}</span>
          ${repo.private ? '<span class="github-repo-private">Private</span>' : ''}
        </div>
        <div class="github-repo-actions">
          ${isConnected
            ? `<a href="${previewUrl}" target="_blank" class="btn-success btn-small">Launch</a>
               <span class="connected-badge">Connected</span>`
            : '<button class="btn-primary btn-small btn-connect-repo">Connect</button>'
          }
        </div>
      </div>
    `;
  }

  static attachGitHubListeners() {
    // Connect repo buttons
    document.querySelectorAll('.btn-connect-repo').forEach(btn => {
      btn.addEventListener('click', async (e) => {
        const card = e.target.closest('.github-repo-card');
        const repo = card.dataset.repo;

        btn.disabled = true;
        btn.textContent = 'Connecting...';

        try {
          await api.connectRepo(repo);
          app.showNotification(`Connected ${repo}`);
          this.loadRepos(); // Refresh
        } catch (error) {
          app.showNotification('Failed to connect: ' + error.message, 'error');
          btn.disabled = false;
          btn.textContent = 'Connect';
        }
      });
    });

    // Show all repos button
    const showAllBtn = document.querySelector('.btn-show-all-repos');
    if (showAllBtn) {
      showAllBtn.addEventListener('click', () => {
        const grid = document.querySelector('.github-repos-grid');
        grid.innerHTML = this.githubRepos.map(repo => this.renderGitHubRepoCard(repo)).join('');
        showAllBtn.remove();
        this.attachGitHubListeners();
      });
    }
  }

  static renderRepoCard(repo, permissions = []) {
    const userPerms = permissions.filter(p => p.user_id);
    const teamPerms = permissions.filter(p => p.team_id);
    const previewUrl = `http://localhost:8080?repo=${encodeURIComponent(repo)}`;

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
          <a href="${previewUrl}" target="_blank" class="btn-small btn-success">Launch Preview</a>
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
        const repoCard = e.target.closest('.repo-card');
        const repo = repoCard.dataset.repo;
        this.managePermissions(repo);
      });
    });

    // View comments
    document.querySelectorAll('.btn-view-comments').forEach(btn => {
      btn.addEventListener('click', (e) => {
        const repoCard = e.target.closest('.repo-card');
        const repo = repoCard.dataset.repo;
        this.viewComments(repo);
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

  // Active Branches (from deployments)
  static async loadActiveBranches() {
    const branchesList = document.getElementById('branches-list');

    try {
      // Get deployments to discover branches
      const deployments = await api.getDeployments({ limit: 50 });

      if (deployments.length === 0) {
        branchesList.innerHTML = `
          <div style="text-align: center; padding: 1.5rem; color: #a0aec0; background: white; border-radius: 8px; border: 1px solid #e2e8f0;">
            <p>No branches discovered yet.</p>
            <p style="margin-top: 0.5rem; font-size: 0.875rem;">Branches appear automatically when GitHub Actions sends deployment info.</p>
          </div>
        `;
        return;
      }

      // Group by repo and branch, get latest deployment for each
      const branchMap = new Map();
      deployments.forEach(d => {
        const key = `${d.repo}:${d.branch}`;
        if (!branchMap.has(key) || new Date(d.created_at) > new Date(branchMap.get(key).created_at)) {
          branchMap.set(key, d);
        }
      });

      // Group by repo
      const repoGroups = new Map();
      branchMap.forEach((deployment, key) => {
        const repo = deployment.repo;
        if (!repoGroups.has(repo)) {
          repoGroups.set(repo, []);
        }
        repoGroups.get(repo).push(deployment);
      });

      branchesList.innerHTML = Array.from(repoGroups.entries())
        .map(([repo, branches]) => this.renderBranchGroup(repo, branches))
        .join('');

    } catch (error) {
      console.error('Error loading branches:', error);
      branchesList.innerHTML = `
        <div style="text-align: center; padding: 1.5rem; color: #f56565;">
          <p>Error loading branches.</p>
        </div>
      `;
    }
  }

  static renderBranchGroup(repo, branches) {
    return `
      <div class="branch-group">
        <h4 class="branch-repo-name">${repo}</h4>
        <div class="branch-items">
          ${branches.map(b => this.renderBranchItem(b)).join('')}
        </div>
      </div>
    `;
  }

  static renderBranchItem(deployment) {
    const timeAgo = this.formatTimeAgo(deployment.deployed_at || deployment.created_at);
    const isMain = deployment.branch === 'main' || deployment.branch === 'master';

    return `
      <div class="branch-item ${isMain ? 'branch-main' : ''}">
        <div class="branch-info">
          <span class="branch-name">${deployment.branch}</span>
          ${deployment.pr_number ? `<span class="branch-pr">#${deployment.pr_number}</span>` : ''}
          <span class="branch-time">${timeAgo}</span>
        </div>
        <div class="branch-actions">
          <span class="env-badge env-${deployment.environment}">${deployment.environment}</span>
          <a href="${deployment.url}" target="_blank" class="btn-small btn-primary">Launch</a>
        </div>
      </div>
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

  // URL Mappings
  static async loadUrlMappings() {
    const urlMappingsList = document.getElementById('url-mappings-list');

    try {
      const mappings = await api.getRepoUrls();

      if (mappings.length === 0) {
        urlMappingsList.innerHTML = `
          <div style="text-align: center; padding: 2rem; color: #a0aec0; background: white; border-radius: 8px; border: 1px solid #e2e8f0;">
            <p>No URL mappings configured yet.</p>
            <p style="margin-top: 0.5rem; font-size: 0.875rem;">Add a URL mapping to enable auto-detection of repositories.</p>
          </div>
        `;
        return;
      }

      urlMappingsList.innerHTML = mappings.map(m => this.renderUrlMappingCard(m)).join('');
      this.attachUrlMappingListeners();
    } catch (error) {
      console.error('Error loading URL mappings:', error);
      urlMappingsList.innerHTML = `
        <div style="text-align: center; padding: 2rem; color: #f56565;">
          <p>Error loading URL mappings.</p>
        </div>
      `;
    }
  }

  static renderUrlMappingCard(mapping) {
    return `
      <div class="url-mapping-card" data-mapping-id="${mapping.id}">
        <div class="url-mapping-info">
          <h4>${mapping.url_pattern}</h4>
          <div class="url-mapping-meta">
            <span>Repo: <strong>${mapping.repo}</strong></span>
            <span class="env-badge env-${mapping.environment}">${mapping.environment}</span>
            ${mapping.branch ? `<span>Branch: ${mapping.branch}</span>` : ''}
            ${mapping.description ? `<span>${mapping.description}</span>` : ''}
          </div>
        </div>
        <div class="url-mapping-actions">
          <button class="btn-small btn-secondary btn-delete-url-mapping">Delete</button>
        </div>
      </div>
    `;
  }

  static attachUrlMappingListeners() {
    document.querySelectorAll('.btn-delete-url-mapping').forEach(btn => {
      btn.addEventListener('click', async (e) => {
        const card = e.target.closest('.url-mapping-card');
        const id = card.dataset.mappingId;

        if (confirm('Are you sure you want to delete this URL mapping?')) {
          try {
            await api.deleteRepoUrl(id);
            this.loadUrlMappings();
            app.showNotification('URL mapping deleted');
          } catch (error) {
            app.showNotification('Failed to delete: ' + error.message, 'error');
          }
        }
      });
    });
  }
}

window.ReposManager = ReposManager;

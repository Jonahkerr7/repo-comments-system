// API Client for Admin Dashboard

class API {
  constructor() {
    // Use production API
    this.baseURL = 'https://repo-comments-system-production.up.railway.app/api/v1';
    this.token = localStorage.getItem('admin_token');
  }

  // Set authentication token
  setToken(token) {
    this.token = token;
    localStorage.setItem('admin_token', token);
  }

  // Clear authentication
  clearAuth() {
    this.token = null;
    localStorage.removeItem('admin_token');
    localStorage.removeItem('admin_user');
  }

  // Generic request method
  async request(endpoint, options = {}) {
    const headers = {
      'Content-Type': 'application/json',
      ...options.headers,
    };

    if (this.token) {
      headers['Authorization'] = `Bearer ${this.token}`;
    }

    const config = {
      ...options,
      headers,
    };

    try {
      const response = await fetch(`${this.baseURL}${endpoint}`, config);

      if (response.status === 401) {
        // Never reload on 401 - let the app handle it
        throw new Error('Unauthorized');
      }

      if (!response.ok) {
        const error = await response.json().catch(() => ({ error: 'Request failed' }));
        throw new Error(error.error || 'Request failed');
      }

      if (response.status === 204) {
        return null;
      }

      return await response.json();
    } catch (error) {
      console.error('API Error:', error);
      throw error;
    }
  }

  // Auth endpoints
  async login() {
    // Use GitHub OAuth for full repo access
    const redirectUri = window.location.origin;
    const state = btoa(JSON.stringify({ redirect_uri: redirectUri }));
    window.location.href = `${this.baseURL}/auth/github?state=${encodeURIComponent(state)}`;
  }

  async getMe() {
    return this.request('/auth/user');
  }

  // Dashboard stats
  async getStats() {
    // This will be a custom endpoint we'll create
    return this.request('/admin/stats');
  }

  async getRecentActivity() {
    return this.request('/admin/activity');
  }

  // Teams endpoints
  async getTeams() {
    return this.request('/teams');
  }

  async createTeam(data) {
    return this.request('/teams', {
      method: 'POST',
      body: JSON.stringify(data),
    });
  }

  async updateTeam(id, data) {
    return this.request(`/teams/${id}`, {
      method: 'PATCH',
      body: JSON.stringify(data),
    });
  }

  async deleteTeam(id) {
    return this.request(`/teams/${id}`, {
      method: 'DELETE',
    });
  }

  async getTeamMembers(id) {
    return this.request(`/teams/${id}/members`);
  }

  async addTeamMember(teamId, userId, role = 'member') {
    return this.request(`/teams/${teamId}/members`, {
      method: 'POST',
      body: JSON.stringify({ user_id: userId, role }),
    });
  }

  async removeTeamMember(teamId, userId) {
    return this.request(`/teams/${teamId}/members/${userId}`, {
      method: 'DELETE',
    });
  }

  // Users endpoints
  async getUsers() {
    return this.request('/users');
  }

  async getUser(id) {
    return this.request(`/users/${id}`);
  }

  async updateUser(id, data) {
    return this.request(`/users/${id}`, {
      method: 'PATCH',
      body: JSON.stringify(data),
    });
  }

  // Permissions endpoints
  async getPermissions(repo) {
    return this.request(`/permissions?repo=${encodeURIComponent(repo)}`);
  }

  async createPermission(data) {
    return this.request('/permissions', {
      method: 'POST',
      body: JSON.stringify(data),
    });
  }

  async updatePermission(id, data) {
    return this.request(`/permissions/${id}`, {
      method: 'PATCH',
      body: JSON.stringify(data),
    });
  }

  async deletePermission(id) {
    return this.request(`/permissions/${id}`, {
      method: 'DELETE',
    });
  }

  // Threads/Comments endpoints
  async getAllThreads(filters = {}) {
    const params = new URLSearchParams();
    Object.keys(filters).forEach(key => {
      if (filters[key]) params.append(key, filters[key]);
    });

    return this.request(`/admin/threads?${params.toString()}`);
  }

  async getThread(id) {
    return this.request(`/threads/${id}`);
  }

  // Deployments/Iterations endpoints
  async getDeployments(filters = {}) {
    const params = new URLSearchParams();
    Object.keys(filters).forEach(key => {
      if (filters[key]) params.append(key, filters[key]);
    });
    return this.request(`/deployments?${params.toString()}`);
  }

  async getDeployment(id) {
    return this.request(`/deployments/${id}`);
  }

  async createDeployment(data) {
    return this.request('/deployments', {
      method: 'POST',
      body: JSON.stringify(data),
    });
  }

  async updateDeployment(id, data) {
    return this.request(`/deployments/${id}`, {
      method: 'PATCH',
      body: JSON.stringify(data),
    });
  }

  async getDeploymentStats() {
    return this.request('/deployments/stats/overview');
  }

  async logDeploymentActivity(id, action, details = null) {
    return this.request(`/deployments/${id}/activity`, {
      method: 'POST',
      body: JSON.stringify({ action, details }),
    });
  }

  async getDeploymentActivity(id) {
    return this.request(`/deployments/${id}/activity`);
  }

  // Kanban/Double Diamond endpoints
  async getKanbanStats(repo = null) {
    const params = repo ? `?repo=${encodeURIComponent(repo)}` : '';
    return this.request(`/deployments/stats/kanban${params}`);
  }

  async updateDeploymentPhase(id, phase) {
    return this.request(`/deployments/${id}`, {
      method: 'PATCH',
      body: JSON.stringify({ phase }),
    });
  }

  // GitHub integration
  async getGitHubRepos() {
    return this.request('/github/repos');
  }

  async getGitHubBranches(owner, repo) {
    return this.request(`/github/repos/${owner}/${repo}/branches`);
  }

  async connectRepo(repo, defaultRole = 'write') {
    return this.request('/github/connect', {
      method: 'POST',
      body: JSON.stringify({ repo, default_role: defaultRole }),
    });
  }
}

// Create global API instance
window.api = new API();

import apiClient from './client';
import { authApi } from './auth';

// Teams API
export const teamsApi = {
  getTeams: () => apiClient.get('/teams').then((r) => r.data),
  getTeam: (id: string) => apiClient.get(`/teams/${id}`).then((r) => r.data),
  createTeam: (data: { name: string; org: string; description?: string }) =>
    apiClient.post('/teams', data).then((r) => r.data),
  updateTeam: (id: string, data: Partial<{ name: string; description: string }>) =>
    apiClient.patch(`/teams/${id}`, data).then((r) => r.data),
  deleteTeam: (id: string) => apiClient.delete(`/teams/${id}`),
  getTeamMembers: (id: string) => apiClient.get(`/teams/${id}/members`).then((r) => r.data),
  addTeamMember: (teamId: string, userId: string, role: string) =>
    apiClient.post(`/teams/${teamId}/members`, { user_id: userId, role }).then((r) => r.data),
  removeTeamMember: (teamId: string, userId: string) =>
    apiClient.delete(`/teams/${teamId}/members/${userId}`),
};

// Users API
export const usersApi = {
  getUsers: () => apiClient.get('/users').then((r) => r.data),
  getUser: (id: string) => apiClient.get(`/users/${id}`).then((r) => r.data),
};

// GitHub Repos API
export const reposApi = {
  // Get user's GitHub repositories (from GitHub API via backend)
  getRepos: () => apiClient.get('/github/repos').then((r) => r.data),
  getGitHubRepos: () => apiClient.get('/github/repos').then((r) => r.data),
  // Get only connected repositories (repos user has permissions for)
  getConnectedRepos: () => apiClient.get('/github/connected').then((r) => r.data),
  getRepoBranches: (owner: string, repo: string) =>
    apiClient.get(`/github/repos/${owner}/${repo}/branches`).then((r) => r.data),
  connectRepo: (repo: string, defaultRole?: string) =>
    apiClient.post('/github/connect', { repo, default_role: defaultRole }).then((r) => r.data),
  disconnectRepo: (owner: string, repo: string) =>
    apiClient.delete(`/github/disconnect/${owner}/${repo}`),
};

// Repo URL Mappings API (for Chrome extension URL-to-repo mapping)
export const repoUrlsApi = {
  getRepoUrls: (repo?: string) =>
    apiClient.get('/repo-urls', { params: repo ? { repo } : undefined }).then((r) => r.data),
  lookupUrl: (url: string) =>
    apiClient.get('/repo-urls/lookup', { params: { url } }).then((r) => r.data),
  createRepoUrl: (data: {
    repo: string;
    url_pattern: string;
    environment?: 'development' | 'staging' | 'production';
    branch?: string;
    description?: string;
  }) => apiClient.post('/repo-urls', data).then((r) => r.data),
  updateRepoUrl: (id: string, data: Partial<{
    url_pattern: string;
    environment: string;
    branch: string;
    description: string;
    is_active: boolean;
  }>) => apiClient.patch(`/repo-urls/${id}`, data).then((r) => r.data),
  deleteRepoUrl: (id: string) => apiClient.delete(`/repo-urls/${id}`),
};

// Deployments API
export const deploymentsApi = {
  getDeployments: (params?: { repo?: string; status?: string; environment?: string }) =>
    apiClient.get('/deployments', { params }).then((r) => r.data),
  getDeployment: (id: string) => apiClient.get(`/deployments/${id}`).then((r) => r.data),
  updateDeploymentPhase: (id: string, phase: string) =>
    apiClient.patch(`/deployments/${id}/phase`, { phase }).then((r) => r.data),
  approveDeployment: (id: string) => apiClient.post(`/deployments/${id}/approve`).then((r) => r.data),
  getDeploymentActivity: (id: string) =>
    apiClient.get(`/deployments/${id}/activity`).then((r) => r.data),
  getDeploymentStats: () => apiClient.get('/deployments/stats').then((r) => r.data),
};

// Threads (Comments) API
export const threadsApi = {
  getThreads: (params?: { repo?: string; status?: string }) =>
    apiClient.get('/threads', { params }).then((r) => r.data),
  getThread: (id: string) => apiClient.get(`/threads/${id}`).then((r) => r.data),
  createThread: (data: {
    repo: string;
    branch: string;
    context_type: string;
    coordinates?: { x: number; y: number };
    selector?: string;
    message: string;
  }) => apiClient.post('/threads', data).then((r) => r.data),
  resolveThread: (id: string) => apiClient.post(`/threads/${id}/resolve`).then((r) => r.data),
  reopenThread: (id: string) => apiClient.post(`/threads/${id}/reopen`).then((r) => r.data),
  addMessage: (threadId: string, content: string) =>
    apiClient.post(`/threads/${threadId}/messages`, { content }).then((r) => r.data),
};

// Stats API
export const statsApi = {
  getDashboardStats: () => apiClient.get('/stats/dashboard').then((r) => r.data),
  getRecentActivity: () => apiClient.get('/activity/recent').then((r) => r.data),
};

// Alias for backward compatibility
export const repositoriesApi = reposApi;

export { authApi };
export { default as apiClient } from './client';

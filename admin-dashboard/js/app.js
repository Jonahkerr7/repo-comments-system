// Main Application Logic

class AdminApp {
  constructor() {
    this.currentPage = 'dashboard';
    this.user = null;
    this.init();
  }

  async init() {
    // Check for OAuth callback
    this.handleOAuthCallback();

    // Setup event listeners
    this.setupEventListeners();

    // Check if user is authenticated
    const isAuthenticated = await this.checkAuth();

    // Only load initial page if authenticated
    if (isAuthenticated) {
      this.loadPage('dashboard');
    }
  }

  handleOAuthCallback() {
    const urlParams = new URLSearchParams(window.location.search);
    const token = urlParams.get('token');

    if (token) {
      api.setToken(token);
      // Remove token from URL
      window.history.replaceState({}, document.title, window.location.pathname);
    }
  }

  async checkAuth() {
    const token = localStorage.getItem('admin_token');

    if (!token) {
      this.showLoginModal();
      return false;
    }

    try {
      this.user = await api.getMe();
      localStorage.setItem('admin_user', JSON.stringify(this.user));
      this.renderUserInfo();
      return true;
    } catch (error) {
      console.error('Auth check failed:', error);
      api.clearAuth();
      this.showLoginModal();
      return false;
    }
  }

  showLoginModal() {
    const modal = document.getElementById('modal-login');
    modal.classList.add('active');
  }

  renderUserInfo() {
    const userInfo = document.getElementById('user-info');
    if (!this.user) return;

    const initials = this.user.name
      ? this.user.name.split(' ').map(n => n[0]).join('').toUpperCase()
      : 'A';

    userInfo.innerHTML = `
      <div class="user-avatar">${initials}</div>
      <div>
        <div style="font-weight: 500; font-size: 0.875rem;">${this.user.name || 'Admin'}</div>
        <div style="font-size: 0.75rem; color: #718096;">${this.user.email || ''}</div>
      </div>
    `;
  }

  setupEventListeners() {
    // Navigation
    document.querySelectorAll('.nav-item').forEach(item => {
      item.addEventListener('click', (e) => {
        e.preventDefault();
        const page = item.dataset.page;
        this.loadPage(page);
      });
    });

    // Logout
    document.getElementById('logout-btn').addEventListener('click', () => {
      api.clearAuth();
      window.location.reload();
    });

    // GitHub Login
    document.getElementById('btn-github-login').addEventListener('click', () => {
      api.login();
    });

    // Create Team
    document.getElementById('btn-create-team').addEventListener('click', () => {
      this.openModal('modal-create-team');
    });

    document.getElementById('form-create-team').addEventListener('submit', async (e) => {
      e.preventDefault();
      const formData = new FormData(e.target);
      const data = Object.fromEntries(formData);

      try {
        await api.createTeam(data);
        this.closeModal('modal-create-team');
        e.target.reset();
        TeamsManager.loadTeams();
        this.showNotification('Team created successfully');
      } catch (error) {
        this.showNotification('Failed to create team: ' + error.message, 'error');
      }
    });

    // Add Repository
    document.getElementById('btn-add-repo').addEventListener('click', () => {
      this.openModal('modal-add-repo');
    });

    document.getElementById('form-add-repo').addEventListener('submit', async (e) => {
      e.preventDefault();
      const formData = new FormData(e.target);
      const data = Object.fromEntries(formData);

      this.closeModal('modal-add-repo');
      e.target.reset();
      ReposManager.loadRepos();
      this.showNotification('Repository configuration saved');
    });

    // Modal close buttons
    document.querySelectorAll('.modal-close').forEach(btn => {
      btn.addEventListener('click', () => {
        btn.closest('.modal').classList.remove('active');
      });
    });

    // Close modal on backdrop click
    document.querySelectorAll('.modal').forEach(modal => {
      modal.addEventListener('click', (e) => {
        if (e.target === modal) {
          modal.classList.remove('active');
        }
      });
    });

    // Comment filters
    document.getElementById('filter-repo').addEventListener('change', () => {
      CommentsManager.loadComments();
    });

    document.getElementById('filter-status').addEventListener('change', () => {
      CommentsManager.loadComments();
    });
  }

  loadPage(page) {
    // Update navigation
    document.querySelectorAll('.nav-item').forEach(item => {
      item.classList.toggle('active', item.dataset.page === page);
    });

    // Update content
    document.querySelectorAll('.page').forEach(p => {
      p.classList.toggle('active', p.id === `page-${page}`);
    });

    this.currentPage = page;

    // Load page-specific data
    switch (page) {
      case 'dashboard':
        this.loadDashboard();
        break;
      case 'teams':
        TeamsManager.loadTeams();
        break;
      case 'users':
        UsersManager.loadUsers();
        break;
      case 'repositories':
        ReposManager.loadRepos();
        ReposManager.loadActiveBranches();
        break;
      case 'iterations':
        IterationsManager.loadIterations();
        break;
      case 'kanban':
        KanbanManager.loadKanban();
        break;
      case 'comments':
        CommentsManager.loadComments();
        break;
    }
  }

  async loadDashboard() {
    try {
      // Load stats (we'll create a mock for now, then implement backend endpoint)
      const users = await api.getUsers().catch(() => []);
      const teams = await api.getTeams().catch(() => []);

      document.getElementById('stat-users').textContent = users.length || 0;
      document.getElementById('stat-teams').textContent = teams.length || 0;
      document.getElementById('stat-comments').textContent = '-';
      document.getElementById('stat-repos').textContent = '-';

      // Load recent activity
      this.loadRecentActivity();
    } catch (error) {
      console.error('Error loading dashboard:', error);
    }
  }

  async loadRecentActivity() {
    const activityList = document.getElementById('recent-activity-list');

    // Mock activity for now
    activityList.innerHTML = `
      <div class="activity-item">
        <div>
          <strong>${this.user?.name || 'User'}</strong> created a new team
        </div>
        <span class="activity-time">Just now</span>
      </div>
      <div class="activity-item">
        <div>
          <strong>System</strong> initialized admin dashboard
        </div>
        <span class="activity-time">1 minute ago</span>
      </div>
    `;
  }

  openModal(modalId) {
    document.getElementById(modalId).classList.add('active');
  }

  closeModal(modalId) {
    document.getElementById(modalId).classList.remove('active');
  }

  showNotification(message, type = 'success') {
    // Simple notification (could enhance with a toast library)
    const color = type === 'success' ? '#48bb78' : '#f56565';
    const notification = document.createElement('div');
    notification.style.cssText = `
      position: fixed;
      top: 80px;
      right: 20px;
      background: ${color};
      color: white;
      padding: 1rem 1.5rem;
      border-radius: 6px;
      box-shadow: 0 4px 6px rgba(0,0,0,0.1);
      z-index: 10000;
      animation: slideIn 0.3s ease;
    `;
    notification.textContent = message;
    document.body.appendChild(notification);

    setTimeout(() => {
      notification.remove();
    }, 3000);
  }
}

// Initialize app when DOM is ready
document.addEventListener('DOMContentLoaded', () => {
  window.app = new AdminApp();
});

// Add slide-in animation
const style = document.createElement('style');
style.textContent = `
  @keyframes slideIn {
    from {
      transform: translateX(400px);
      opacity: 0;
    }
    to {
      transform: translateX(0);
      opacity: 1;
    }
  }
`;
document.head.appendChild(style);

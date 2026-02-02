// Main Application Logic

// Persona configurations for dashboard personalization
const personaConfigs = {
  designer: {
    id: 'designer',
    label: 'Designer',
    icon: '🎨',
    defaultPage: 'comments',
    dashboardWidgets: ['requestTracker', 'myThreads', 'recentActivity'],
    quickActions: [
      { label: 'View Comments', page: 'comments', icon: '💬' },
      { label: 'Kanban Board', page: 'kanban', icon: '◆' },
      { label: 'My Reviews', page: 'iterations', icon: '📝' }
    ],
    description: 'Focus on feedback and design iteration'
  },
  stakeholder: {
    id: 'stakeholder',
    label: 'Stakeholder',
    icon: '📊',
    defaultPage: 'kanban',
    dashboardWidgets: ['phaseProgress', 'approvalQueue', 'teamStats'],
    quickActions: [
      { label: 'Pending Approvals', page: 'iterations', icon: '✅' },
      { label: 'Phase Overview', page: 'kanban', icon: '◆' },
      { label: 'Team Activity', page: 'teams', icon: '👥' }
    ],
    description: 'High-level project oversight and approvals'
  },
  developer: {
    id: 'developer',
    label: 'Developer',
    icon: '💻',
    defaultPage: 'comments',
    dashboardWidgets: ['myAssigned', 'prComments', 'recentlyResolved'],
    quickActions: [
      { label: 'My Assigned', page: 'comments', icon: '📌' },
      { label: 'My PRs', page: 'iterations', icon: '🔀' },
      { label: 'Resolved Today', page: 'comments', icon: '✅' }
    ],
    description: 'Focus on actionable feedback and PR comments'
  }
};

class AdminApp {
  constructor() {
    this.currentPage = 'dashboard';
    this.user = null;
    this.currentPersona = 'designer'; // default
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

    // Load saved persona preference
    const savedPersona = localStorage.getItem('admin_persona');
    if (savedPersona && personaConfigs[savedPersona]) {
      this.currentPersona = savedPersona;
    }

    const initials = this.user.name
      ? this.user.name.split(' ').map(n => n[0]).join('').toUpperCase()
      : 'A';

    const persona = personaConfigs[this.currentPersona];

    userInfo.innerHTML = `
      <div class="persona-switcher">
        <button class="persona-current" id="persona-toggle">
          <span class="persona-icon">${persona.icon}</span>
          <span class="persona-label">${persona.label}</span>
          <svg class="persona-chevron" width="12" height="12" viewBox="0 0 12 12">
            <path d="M3 4.5L6 7.5L9 4.5" stroke="currentColor" fill="none" stroke-width="1.5"/>
          </svg>
        </button>
        <div class="persona-dropdown" id="persona-dropdown">
          ${Object.values(personaConfigs).map(p => `
            <button class="persona-option ${p.id === this.currentPersona ? 'active' : ''}" data-persona="${p.id}">
              <span class="persona-option-icon">${p.icon}</span>
              <div class="persona-option-info">
                <span class="persona-option-label">${p.label}</span>
                <span class="persona-option-desc">${p.description}</span>
              </div>
              ${p.id === this.currentPersona ? '<span class="persona-check">✓</span>' : ''}
            </button>
          `).join('')}
        </div>
      </div>
      <div class="user-avatar">${initials}</div>
      <div class="user-details">
        <div style="font-weight: 500; font-size: 0.875rem;">${this.user.name || 'Admin'}</div>
        <div style="font-size: 0.75rem; color: #718096;">${this.user.email || ''}</div>
      </div>
    `;

    this.setupPersonaSwitcher();
  }

  setupPersonaSwitcher() {
    const toggle = document.getElementById('persona-toggle');
    const dropdown = document.getElementById('persona-dropdown');

    if (!toggle || !dropdown) return;

    toggle.addEventListener('click', (e) => {
      e.stopPropagation();
      dropdown.classList.toggle('active');
    });

    // Close dropdown when clicking outside
    document.addEventListener('click', () => {
      dropdown.classList.remove('active');
    });

    // Handle persona selection
    dropdown.querySelectorAll('.persona-option').forEach(btn => {
      btn.addEventListener('click', (e) => {
        e.stopPropagation();
        const personaId = btn.dataset.persona;
        this.switchPersona(personaId);
        dropdown.classList.remove('active');
      });
    });
  }

  switchPersona(personaId) {
    if (!personaConfigs[personaId]) return;

    this.currentPersona = personaId;
    localStorage.setItem('admin_persona', personaId);

    // Re-render user info to update the switcher
    this.renderUserInfo();

    // Reload the dashboard with new persona widgets
    if (this.currentPage === 'dashboard') {
      this.loadDashboard();
    }

    this.showNotification(`Switched to ${personaConfigs[personaId].label} view`);
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

    // Theme Toggle
    this.initTheme();
    document.getElementById('theme-toggle').addEventListener('click', () => {
      this.toggleTheme();
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

    // Add Repository - opens the connect repos modal
    document.getElementById('btn-add-repo').addEventListener('click', () => {
      ReposManager.openConnectModal();
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

  // Theme Management
  initTheme() {
    // Check for saved preference, then system preference
    const savedTheme = localStorage.getItem('admin_theme');
    const prefersDark = window.matchMedia('(prefers-color-scheme: dark)').matches;

    if (savedTheme) {
      document.documentElement.setAttribute('data-theme', savedTheme);
    } else if (prefersDark) {
      document.documentElement.setAttribute('data-theme', 'dark');
    }

    // Listen for system theme changes
    window.matchMedia('(prefers-color-scheme: dark)').addEventListener('change', (e) => {
      if (!localStorage.getItem('admin_theme')) {
        document.documentElement.setAttribute('data-theme', e.matches ? 'dark' : 'light');
      }
    });
  }

  toggleTheme() {
    const currentTheme = document.documentElement.getAttribute('data-theme');
    const newTheme = currentTheme === 'dark' ? 'light' : 'dark';

    document.documentElement.setAttribute('data-theme', newTheme);
    localStorage.setItem('admin_theme', newTheme);

    this.showNotification(`Switched to ${newTheme} mode`);
  }

  async loadDashboard() {
    try {
      const persona = personaConfigs[this.currentPersona];

      // Load stats
      const users = await api.getUsers().catch(() => []);
      const teams = await api.getTeams().catch(() => []);

      document.getElementById('stat-users').textContent = users.length || 0;
      document.getElementById('stat-teams').textContent = teams.length || 0;
      document.getElementById('stat-comments').textContent = '-';
      document.getElementById('stat-repos').textContent = '-';

      // Render quick actions based on persona
      this.renderQuickActions(persona);

      // Load Request Tracker
      if (typeof RequestTracker !== 'undefined') {
        await RequestTracker.init();
        RequestTracker.loadRequests();
      }

      // Load recent activity
      this.loadRecentActivity();
    } catch (error) {
      console.error('Error loading dashboard:', error);
    }
  }

  renderQuickActions(persona) {
    // Check if quick actions container exists, if not create it
    let quickActionsContainer = document.getElementById('quick-actions');
    const statsGrid = document.querySelector('#page-dashboard .stats-grid');

    if (!quickActionsContainer && statsGrid) {
      quickActionsContainer = document.createElement('div');
      quickActionsContainer.id = 'quick-actions';
      quickActionsContainer.className = 'quick-actions-container';
      statsGrid.insertAdjacentElement('afterend', quickActionsContainer);
    }

    if (!quickActionsContainer) return;

    quickActionsContainer.innerHTML = `
      <div class="quick-actions-header">
        <span class="quick-actions-persona">${persona.icon} ${persona.label} View</span>
        <span class="quick-actions-hint">Quick actions tailored for you</span>
      </div>
      <div class="quick-actions-grid">
        ${persona.quickActions.map(action => `
          <button class="quick-action-btn glass-card-solid" onclick="app.loadPage('${action.page}')">
            <span class="quick-action-icon">${action.icon}</span>
            <span class="quick-action-label">${action.label}</span>
          </button>
        `).join('')}
      </div>
    `;
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

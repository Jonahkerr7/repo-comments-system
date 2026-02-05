// Popup script for RepoComments extension

const API_URL = 'https://renewed-appreciation-production-55e2.up.railway.app';
const DASHBOARD_URL = 'http://localhost:9000'; // Admin dashboard

// Load state on popup open
document.addEventListener('DOMContentLoaded', async () => {
  const result = await chrome.storage.local.get(['token', 'user', 'enabled']);

  if (result.token && result.user) {
    showLoggedInState(result.user, result.enabled);
  } else {
    showNotLoggedInState();
  }
});

function showNotLoggedInState() {
  document.getElementById('not-logged-in').classList.remove('hidden');
  document.getElementById('logged-in').classList.add('hidden');
}

function showLoggedInState(user, enabled) {
  document.getElementById('not-logged-in').classList.add('hidden');
  document.getElementById('logged-in').classList.remove('hidden');

  // Show user info
  const userInfo = document.getElementById('user-info');
  const initials = user.name ? user.name.split(' ').map(n => n[0]).join('').toUpperCase() : 'U';
  userInfo.innerHTML = `
    <div class="avatar">${initials}</div>
    <div class="user-details">
      <div class="user-name">${user.name || 'User'}</div>
      <div class="user-email">${user.email || ''}</div>
    </div>
  `;

  // Update status
  updateStatus(enabled);
}

function updateStatus(enabled) {
  const indicator = document.getElementById('status-indicator');
  const text = document.getElementById('status-text');
  const toggleBtn = document.getElementById('toggle-btn');

  if (enabled) {
    indicator.classList.add('active');
    text.textContent = 'Comments enabled';
    toggleBtn.textContent = 'Disable Comments';
  } else {
    indicator.classList.remove('active');
    text.textContent = 'Comments disabled';
    toggleBtn.textContent = 'Enable Comments';
  }
}

// Login button
document.getElementById('login-btn').addEventListener('click', async () => {
  // Create state with dashboard as redirect URI
  const state = btoa(JSON.stringify({ redirect_uri: DASHBOARD_URL }));

  // Open OAuth flow in new tab - will redirect to dashboard after auth
  chrome.tabs.create({
    url: `${API_URL}/api/v1/auth/github?state=${encodeURIComponent(state)}`,
    active: true
  });

  // Listen for the OAuth callback (user lands on dashboard with token)
  chrome.tabs.onUpdated.addListener(function listener(tabId, info, tab) {
    if (info.status === 'complete' && tab.url && tab.url.includes('token=')) {
      const url = new URL(tab.url);
      const token = url.searchParams.get('token');

      if (token) {
        // Fetch user info
        fetch(`${API_URL}/api/v1/auth/me`, {
          headers: { 'Authorization': `Bearer ${token}` }
        })
        .then(res => res.json())
        .then(user => {
          // Store token and user in extension storage
          chrome.runtime.sendMessage({
            type: 'SET_AUTH_TOKEN',
            token: token,
            user: user
          }, () => {
            // Auto-enable comments after login
            chrome.storage.local.set({ enabled: true }, () => {
              showLoggedInState(user, true);
              chrome.action.setBadgeText({ text: 'ON' });
              chrome.action.setBadgeBackgroundColor({ color: '#1677ff' });
            });
          });
        })
        .catch(err => {
          console.error('[RepoComments] Failed to fetch user:', err);
        });

        chrome.tabs.onUpdated.removeListener(listener);
      }
    }
  });

  window.close();
});

// Toggle comments button
document.getElementById('toggle-btn').addEventListener('click', () => {
  chrome.runtime.sendMessage({ type: 'TOGGLE_COMMENTS' }, (response) => {
    updateStatus(response.enabled);
  });
});

// Logout button
document.getElementById('logout-btn').addEventListener('click', () => {
  chrome.runtime.sendMessage({ type: 'LOGOUT' }, () => {
    showNotLoggedInState();
  });
});

// Settings link
document.getElementById('settings-link').addEventListener('click', (e) => {
  e.preventDefault();
  // TODO: Open settings page
  alert('Settings coming soon!');
});

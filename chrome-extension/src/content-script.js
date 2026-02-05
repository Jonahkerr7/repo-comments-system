// Content script - injected into all pages
// Manages RepoComments UI injection based on extension state
console.log('[RepoComments CS] Content script loaded - v2.0 with screenshot bridge');

let commentsEnabled = false;
let commentsInstance = null;

// Check if comments should be enabled on page load
chrome.storage.local.get(['enabled', 'token', 'apiUrl'], (result) => {
  console.log('[RepoComments CS] Storage state:', {
    enabled: result.enabled,
    hasToken: !!result.token,
    apiUrl: result.apiUrl
  });
  if (result.enabled && result.token) {
    enableComments(result);
  } else {
    console.log('[RepoComments CS] Comments not enabled - enabled:', result.enabled, 'hasToken:', !!result.token);
  }
});

// Listen for messages from page scripts (comments-ui.js runs in page context)
// This bridges communication between page scripts and the extension background
window.addEventListener('message', async (event) => {
  // Only accept messages from this window
  if (event.source !== window) return;

  if (event.data?.type === 'RC_CAPTURE_SCREENSHOT') {
    const { requestId, elementRect, devicePixelRatio } = event.data;
    console.log('[RepoComments CS] Received screenshot request:', requestId);

    try {
      // Forward to background script
      chrome.runtime.sendMessage({
        type: 'CAPTURE_ELEMENT_SCREENSHOT',
        elementRect,
        devicePixelRatio
      }, (response) => {
        console.log('[RepoComments CS] Got response from background:', response ? 'success' : 'null', response?.error);
        // Send result back to page script
        window.postMessage({
          type: 'RC_SCREENSHOT_RESULT',
          requestId,
          screenshot: response?.screenshot || null,
          error: response?.error || null
        }, '*');
      });
    } catch (err) {
      console.error('[RepoComments CS] Error forwarding to background:', err);
      window.postMessage({
        type: 'RC_SCREENSHOT_RESULT',
        requestId,
        screenshot: null,
        error: err.message
      }, '*');
    }
  }
});

// Listen for messages from background script
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  if (request.type === 'ENABLE_COMMENTS') {
    chrome.storage.local.get(['token', 'apiUrl'], (result) => {
      enableComments(result);
    });
  }

  if (request.type === 'DISABLE_COMMENTS') {
    disableComments();
  }

  if (request.type === 'REINIT_COMMENTS') {
    chrome.storage.local.get(['enabled', 'token', 'apiUrl'], (result) => {
      if (result.enabled && result.token) {
        disableComments();
        enableComments(result);
      }
    });
  }
});

async function enableComments(config) {
  if (commentsEnabled) return;

  console.log('[RepoComments] Enabling comments on page');

  const apiUrl = config.apiUrl || 'https://renewed-appreciation-production-55e2.up.railway.app';
  const currentUrl = window.location.href;

  // First, try to look up the repo from the URL pattern in the backend
  let repoConfig = null;
  try {
    const response = await fetch(`${apiUrl}/api/v1/repo-urls/lookup?url=${encodeURIComponent(currentUrl)}`);
    if (response.ok) {
      repoConfig = await response.json();
      console.log('[RepoComments] Found repo config from URL lookup:', repoConfig);
    }
  } catch (e) {
    console.log('[RepoComments] URL lookup failed, using fallback detection');
  }

  // Fallback: detect repo from URL patterns
  if (!repoConfig) {
    repoConfig = {
      repo: detectRepoFromURL(),
      branch: detectBranchFromURL()
    };

    // Auto-register this URL mapping so it appears in the dashboard
    autoRegisterUrlMapping(apiUrl, config.token, repoConfig.repo, currentUrl);
  }

  // Check if script already injected (prevent double-load)
  if (document.querySelector('script[data-repo-comments]')) {
    console.log('[RepoComments CS] Script already injected, sending init message');
    window.postMessage({
      type: 'RC_INIT',
      config: {
        apiUrl,
        repo: repoConfig.repo,
        branch: repoConfig.branch || 'main',
        token: config.token
      }
    }, '*');
    commentsEnabled = true;
    return;
  }

  // Inject the comments UI script
  const script = document.createElement('script');
  script.src = chrome.runtime.getURL('src/comments-ui.js');
  script.setAttribute('data-repo-comments', 'true');
  script.onload = () => {
    console.log('[RepoComments CS] Script loaded, sending init via postMessage');
    // Use postMessage instead of inline script (CSP-safe)
    window.postMessage({
      type: 'RC_INIT',
      config: {
        apiUrl,
        repo: repoConfig.repo,
        branch: repoConfig.branch || 'main',
        token: config.token
      }
    }, '*');
    commentsEnabled = true;
    console.log('[RepoComments CS] Comments UI initialized successfully');
  };
  script.onerror = (err) => {
    console.error('[RepoComments CS] Failed to load comments-ui.js:', err);
  };
  document.head.appendChild(script);
}

function detectRepoFromURL() {
  const url = window.location.href;
  const hostname = window.location.hostname;

  // Common patterns for preview deployments:

  // Vercel: project-name-git-branch-team.vercel.app
  const vercelMatch = hostname.match(/^([^-]+)-.*\.vercel\.app$/);
  if (vercelMatch) {
    return `vercel/${vercelMatch[1]}`;
  }

  // Netlify: deploy-preview-123--project.netlify.app
  const netlifyMatch = hostname.match(/^.*--([^.]+)\.netlify\.app$/);
  if (netlifyMatch) {
    return `netlify/${netlifyMatch[1]}`;
  }

  // GitHub Pages: username.github.io/repo
  if (hostname.endsWith('.github.io')) {
    const pathParts = window.location.pathname.split('/').filter(p => p);
    const username = hostname.replace('.github.io', '');
    const repo = pathParts[0] || 'website';
    return `${username}/${repo}`;
  }

  // Localhost with port
  if (hostname === 'localhost' || hostname === '127.0.0.1') {
    return 'acme-corp/design-system';  // Default for local dev
  }

  // Generic: use subdomain/domain
  const parts = hostname.split('.');
  if (parts.length >= 2) {
    return `${parts[parts.length - 2]}/${parts[0]}`;
  }

  return 'default/repo';
}

function detectBranchFromURL() {
  const url = window.location.href;

  // Check URL params
  const urlParams = new URLSearchParams(window.location.search);
  if (urlParams.get('branch')) {
    return urlParams.get('branch');
  }

  // Vercel: project-name-git-BRANCH-team.vercel.app
  const hostname = window.location.hostname;
  const vercelMatch = hostname.match(/^.*-git-([^-]+)-.*\.vercel\.app$/);
  if (vercelMatch) {
    return vercelMatch[1];
  }

  // Netlify PR: deploy-preview-123--project.netlify.app
  const netlifyMatch = hostname.match(/^deploy-preview-(\d+)--/);
  if (netlifyMatch) {
    return `pr-${netlifyMatch[1]}`;
  }

  return 'main';
}

function disableComments() {
  if (!commentsEnabled) return;

  console.log('[RepoComments] Disabling comments on page');

  // Send message to page to cleanup
  window.postMessage({ type: 'RC_DISABLE' }, '*');

  // Remove UI elements
  const root = document.querySelector('.rc-root');
  if (root) root.remove();

  commentsEnabled = false;
}

// Auto-register URL mapping so it appears in dashboard
async function autoRegisterUrlMapping(apiUrl, token, repo, currentUrl) {
  try {
    // Create a URL pattern from the current URL (use base URL + wildcard)
    const url = new URL(currentUrl);
    const urlPattern = `${url.origin}${url.pathname.split('/').slice(0, 2).join('/')}/*`;

    // Detect environment from URL
    let environment = 'production';
    if (url.hostname === 'localhost' || url.hostname === '127.0.0.1') {
      environment = 'development';
    } else if (url.hostname.includes('preview') || url.hostname.includes('staging')) {
      environment = 'staging';
    }

    console.log('[RepoComments] Auto-registering URL mapping:', { repo, urlPattern, environment });

    const response = await fetch(`${apiUrl}/api/v1/repo-urls`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${token}`
      },
      body: JSON.stringify({
        repo,
        url_pattern: urlPattern,
        environment,
        description: 'Auto-registered by Chrome extension'
      })
    });

    if (response.ok) {
      const data = await response.json();
      console.log('[RepoComments] URL mapping registered:', data.url_pattern);
    } else {
      const errorText = await response.text();
      console.log('[RepoComments] Failed to register URL mapping:', response.status, errorText);
    }
  } catch (e) {
    console.log('[RepoComments] Error auto-registering URL mapping:', e.message);
  }
}

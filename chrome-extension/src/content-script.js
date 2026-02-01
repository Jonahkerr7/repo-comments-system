// Content script - injected into all pages
// Manages RepoComments UI injection based on extension state

let commentsEnabled = false;
let commentsInstance = null;

// Check if comments should be enabled on page load
chrome.storage.local.get(['enabled', 'token', 'apiUrl'], (result) => {
  if (result.enabled && result.token) {
    enableComments(result);
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

  const apiUrl = config.apiUrl || 'http://localhost:3000';
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
  }

  // Inject the comments UI script
  const script = document.createElement('script');
  script.src = chrome.runtime.getURL('src/comments-ui.js');
  script.onload = () => {
    // Initialize RepoComments with config
    const initScript = document.createElement('script');
    initScript.textContent = `
      (function() {
        // Store token in localStorage for RepoComments to use
        localStorage.setItem('repo-comments-token', '${config.token}');

        // Initialize with detected/configured repo
        if (window.RepoComments) {
          window.repoCommentsInstance = new RepoComments({
            apiUrl: '${apiUrl}',
            repo: '${repoConfig.repo}',
            branch: '${repoConfig.branch || 'main'}'
          });
          console.log('[RepoComments] Initialized with repo:', '${repoConfig.repo}', 'branch:', '${repoConfig.branch || 'main'}');
        }
      })();
    `;
    document.head.appendChild(initScript);
    commentsEnabled = true;
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

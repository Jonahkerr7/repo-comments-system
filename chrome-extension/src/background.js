// Background service worker for RepoComments Chrome Extension

// Initialize extension on install
chrome.runtime.onInstalled.addListener(() => {
  console.log('[RepoComments] Extension installed');

  // Set default settings
  chrome.storage.local.set({
    enabled: false,
    apiUrl: 'https://renewed-appreciation-production-55e2.up.railway.app',
    token: null,
    user: null
  });
});

// Listen for messages from content script or popup
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  if (request.type === 'GET_AUTH_TOKEN') {
    chrome.storage.local.get(['token', 'user'], (result) => {
      sendResponse({ token: result.token, user: result.user });
    });
    return true; // Keep channel open for async response
  }

  if (request.type === 'SET_AUTH_TOKEN') {
    chrome.storage.local.set({
      token: request.token,
      user: request.user,
      enabled: true,
      apiUrl: 'https://renewed-appreciation-production-55e2.up.railway.app'
    }, () => {
      console.log('[RepoComments BG] Token saved, enabled=true, notifying tabs');

      // Set badge to show enabled
      chrome.action.setBadgeText({ text: 'ON' });
      chrome.action.setBadgeBackgroundColor({ color: '#1677ff' });

      // Notify all tabs to enable comments
      chrome.tabs.query({}, (tabs) => {
        tabs.forEach(tab => {
          chrome.tabs.sendMessage(tab.id, { type: 'ENABLE_COMMENTS' }).catch(() => {});
        });
      });

      sendResponse({ success: true });
    });
    return true;
  }

  if (request.type === 'LOGOUT') {
    chrome.storage.local.set({
      token: null,
      user: null
    }, () => {
      sendResponse({ success: true });

      // Notify all tabs to disable
      chrome.tabs.query({}, (tabs) => {
        tabs.forEach(tab => {
          chrome.tabs.sendMessage(tab.id, { type: 'DISABLE_COMMENTS' }).catch(() => {});
        });
      });
    });
    return true;
  }

  if (request.type === 'TOGGLE_COMMENTS') {
    chrome.storage.local.get(['enabled'], (result) => {
      const newState = !result.enabled;
      chrome.storage.local.set({ enabled: newState }, () => {
        sendResponse({ enabled: newState });

        // Update icon badge
        chrome.action.setBadgeText({
          text: newState ? 'ON' : ''
        });
        chrome.action.setBadgeBackgroundColor({
          color: newState ? '#1677ff' : '#999999'
        });

        // Notify current tab
        chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
          if (tabs[0]) {
            chrome.tabs.sendMessage(tabs[0].id, {
              type: newState ? 'ENABLE_COMMENTS' : 'DISABLE_COMMENTS'
            }).catch(() => {});
          }
        });
      });
    });
    return true;
  }

  // Capture element screenshot
  if (request.type === 'CAPTURE_ELEMENT_SCREENSHOT') {
    const { elementRect, devicePixelRatio } = request;
    console.log('[RepoComments BG] Screenshot request received:', elementRect);

    // Use sender's tab windowId for more reliable capture
    const windowId = sender.tab?.windowId || null;

    chrome.tabs.captureVisibleTab(windowId, { format: 'png' }, (dataUrl) => {
      if (chrome.runtime.lastError) {
        console.error('[RepoComments BG] Screenshot capture failed:', chrome.runtime.lastError);
        sendResponse({ error: chrome.runtime.lastError.message });
        return;
      }

      if (!dataUrl) {
        console.error('[RepoComments BG] No dataUrl returned');
        sendResponse({ error: 'No screenshot data returned' });
        return;
      }

      console.log('[RepoComments BG] Screenshot captured, cropping...');

      // Crop the image to the element bounds
      cropImage(dataUrl, elementRect, devicePixelRatio)
        .then(croppedDataUrl => {
          console.log('[RepoComments BG] Crop complete, size:', croppedDataUrl?.length);
          sendResponse({ screenshot: croppedDataUrl });
        })
        .catch(err => {
          console.error('[RepoComments BG] Crop failed:', err);
          sendResponse({ error: err.message });
        });
    });

    return true; // Keep channel open for async response
  }

  // Return false for unhandled messages to avoid keeping channel open
  return false;
});

// Helper function to crop image to element bounds
// Uses createImageBitmap instead of Image (not available in service workers)
async function cropImage(dataUrl, rect, dpr = 1) {
  try {
    // Convert data URL to blob
    const response = await fetch(dataUrl);
    const blob = await response.blob();

    // Create image bitmap (works in service workers)
    const imageBitmap = await createImageBitmap(blob);

    // Create canvas for cropping
    const scale = Math.min(400 / (rect.width * dpr), 300 / (rect.height * dpr), 1);
    const canvas = new OffscreenCanvas(
      Math.round(rect.width * dpr * scale),
      Math.round(rect.height * dpr * scale)
    );
    const ctx = canvas.getContext('2d');

    // Draw cropped portion
    ctx.drawImage(
      imageBitmap,
      rect.x * dpr, rect.y * dpr,    // Source x, y
      rect.width * dpr, rect.height * dpr, // Source width, height
      0, 0,                              // Dest x, y
      canvas.width, canvas.height        // Dest width, height
    );

    // Convert to data URL
    const croppedBlob = await canvas.convertToBlob({ type: 'image/png' });
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onloadend = () => resolve(reader.result);
      reader.onerror = reject;
      reader.readAsDataURL(croppedBlob);
    });
  } catch (error) {
    console.error('[RepoComments BG] cropImage error:', error);
    throw error;
  }
}

// Update badge when tabs change
chrome.tabs.onActivated.addListener(() => {
  chrome.storage.local.get(['enabled'], (result) => {
    chrome.action.setBadgeText({
      text: result.enabled ? 'ON' : ''
    });
  });
});

// Listen for OAuth callback - capture token from URL
const API_URL = 'https://renewed-appreciation-production-55e2.up.railway.app';

// Trusted domains for token capture (security: only accept tokens from known sources)
const TRUSTED_AUTH_HOSTS = [
  'renewed-appreciation-production-55e2.up.railway.app',
  'localhost',
  '127.0.0.1',
  'jonahkerr7.github.io'
];

chrome.tabs.onUpdated.addListener((tabId, info, tab) => {
  // Check if this is the OAuth callback with token
  if (info.status === 'complete' && tab.url && tab.url.includes('token=')) {
    console.log('[RepoComments BG] Detected potential OAuth callback');

    try {
      const url = new URL(tab.url);

      // Security: Only capture tokens from trusted domains
      const isTrustedHost = TRUSTED_AUTH_HOSTS.some(host =>
        url.hostname === host || url.hostname.endsWith('.' + host)
      );

      if (!isTrustedHost) {
        console.log('[RepoComments BG] Ignoring token from untrusted domain:', url.hostname);
        return;
      }

      console.log('[RepoComments BG] Token from trusted domain:', url.hostname);
      const token = url.searchParams.get('token');

      if (token) {
        console.log('[RepoComments BG] Token found, fetching user info');

        // Fetch user info
        fetch(`${API_URL}/api/v1/auth/me`, {
          headers: { 'Authorization': `Bearer ${token}` }
        })
        .then(res => res.json())
        .then(user => {
          console.log('[RepoComments BG] User fetched:', user.name);

          // Store everything
          chrome.storage.local.set({
            token: token,
            user: user,
            enabled: true,
            apiUrl: API_URL
          }, () => {
            console.log('[RepoComments BG] Auth saved, enabling comments');

            // Set badge
            chrome.action.setBadgeText({ text: 'ON' });
            chrome.action.setBadgeBackgroundColor({ color: '#1677ff' });

            // Notify all tabs
            chrome.tabs.query({}, (tabs) => {
              tabs.forEach(t => {
                chrome.tabs.sendMessage(t.id, { type: 'ENABLE_COMMENTS' }).catch(() => {});
              });
            });
          });
        })
        .catch(err => {
          console.error('[RepoComments BG] Failed to fetch user:', err);
        });
      }
    } catch (e) {
      console.error('[RepoComments BG] Error parsing OAuth URL:', e);
    }
  }
});

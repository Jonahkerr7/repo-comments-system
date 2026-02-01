// Background service worker for RepoComments Chrome Extension

// Initialize extension on install
chrome.runtime.onInstalled.addListener(() => {
  console.log('[RepoComments] Extension installed');

  // Set default settings
  chrome.storage.local.set({
    enabled: false,
    apiUrl: 'http://localhost:3000',
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
      user: request.user
    }, () => {
      sendResponse({ success: true });

      // Notify all tabs to reinitialize
      chrome.tabs.query({}, (tabs) => {
        tabs.forEach(tab => {
          chrome.tabs.sendMessage(tab.id, { type: 'REINIT_COMMENTS' }).catch(() => {});
        });
      });
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
          color: newState ? '#7B61FF' : '#999999'
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
});

// Update badge when tabs change
chrome.tabs.onActivated.addListener(() => {
  chrome.storage.local.get(['enabled'], (result) => {
    chrome.action.setBadgeText({
      text: result.enabled ? 'ON' : ''
    });
  });
});

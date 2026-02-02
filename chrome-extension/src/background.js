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
async function cropImage(dataUrl, rect, dpr = 1) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => {
      // Create canvas for cropping
      const canvas = new OffscreenCanvas(
        Math.min(rect.width * dpr, 400), // Max width 400px
        Math.min(rect.height * dpr, 300) // Max height 300px
      );
      const ctx = canvas.getContext('2d');

      // Calculate scale to fit within max dimensions
      const scale = Math.min(400 / (rect.width * dpr), 300 / (rect.height * dpr), 1);
      canvas.width = rect.width * dpr * scale;
      canvas.height = rect.height * dpr * scale;

      // Draw cropped portion
      ctx.drawImage(
        img,
        rect.x * dpr, rect.y * dpr,    // Source x, y
        rect.width * dpr, rect.height * dpr, // Source width, height
        0, 0,                              // Dest x, y
        canvas.width, canvas.height        // Dest width, height
      );

      // Convert to data URL
      canvas.convertToBlob({ type: 'image/png', quality: 0.8 })
        .then(blob => {
          const reader = new FileReader();
          reader.onloadend = () => resolve(reader.result);
          reader.onerror = reject;
          reader.readAsDataURL(blob);
        })
        .catch(reject);
    };
    img.onerror = reject;
    img.src = dataUrl;
  });
}

// Update badge when tabs change
chrome.tabs.onActivated.addListener(() => {
  chrome.storage.local.get(['enabled'], (result) => {
    chrome.action.setBadgeText({
      text: result.enabled ? 'ON' : ''
    });
  });
});

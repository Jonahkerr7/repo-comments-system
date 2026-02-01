# Chrome Extension Testing Guide

## Quick Start

### 1. Load the Extension

1. Open Chrome and navigate to `chrome://extensions/`
2. Enable "Developer mode" (toggle in top-right corner)
3. Click "Load unpacked"
4. Select the folder: `/Users/jonah.kerr/repo-comments-system/chrome-extension`
5. The RepoComments extension should now appear in your extensions list

### 2. Start the Backend

Make sure your backend is running:

```bash
cd /Users/jonah.kerr/repo-comments-system
docker-compose up
```

The backend should be accessible at `http://localhost:3000`

### 3. Test the Extension

#### Login Flow

1. Click the RepoComments extension icon in Chrome toolbar
2. Click "Login with GitHub" button
3. You'll be redirected to GitHub OAuth (opens new tab)
4. After successful auth, the tab will redirect to a callback URL with a token
5. The extension will capture the token and close the OAuth tab
6. You should now see your user info in the popup

#### Enable Comments

1. Navigate to `http://localhost:8080` (your example-simple app)
2. Click the extension icon
3. Click "Enable Comments"
4. The badge on the extension icon should turn green
5. You should now see comment markers on the page

#### Add a Comment

1. **Option A: Click on an element**
   - Hold `Cmd` (Mac) or `Ctrl` (Windows/Linux)
   - Click on any element you want to comment on
   - A comment creation modal will appear

2. **Option B: Click the "Add Comment" button**
   - Look for the floating "+ Comment" button
   - Click it and select an element

3. Fill in the comment details and submit

#### View Comments

1. Click on any purple comment marker (numbered circles)
2. A modal will open showing the full thread
3. You can:
   - Read all messages in the thread
   - Add replies
   - Resolve/reopen the thread
   - Drag the marker to reposition it

#### Test on Different Pages

The extension auto-detects the repository from the URL. Test on:

- `http://localhost:8080` - Should detect as default repo
- Any GitHub-hosted page
- Any internal staging/dev environment

## Troubleshooting

### Extension not loading

- Check that all files are present in the chrome-extension folder
- Check for syntax errors in manifest.json
- Look at Chrome DevTools console for errors

### OAuth not working

- Verify backend is running on `http://localhost:3000`
- Check that OAuth callback URL is configured correctly
- Look at Network tab in DevTools to see OAuth redirect

### Comments not appearing

- Make sure comments are enabled (click extension icon and check status)
- Open DevTools console and look for errors
- Check that you're on a page that matches the repo/branch

### Can't add comments

- Verify you're logged in (check extension popup)
- Check that you have write permissions for the repo
- Open DevTools console for error messages

## Testing Checklist

- [ ] Extension loads without errors
- [ ] Can login with GitHub OAuth
- [ ] User info displays correctly in popup
- [ ] Can enable/disable comments
- [ ] Badge updates when enabling/disabling
- [ ] Can add new comments
- [ ] Comment markers appear on page
- [ ] Can click markers to view threads
- [ ] Can add replies to threads
- [ ] Can resolve/reopen threads
- [ ] Can drag markers to reposition
- [ ] Comments persist across page reloads
- [ ] MutationObserver updates markers when DOM changes
- [ ] Works across different tabs on same page

## Development

### View Extension Logs

**Background Service Worker:**
1. Go to `chrome://extensions/`
2. Find RepoComments extension
3. Click "service worker" link
4. DevTools will open showing background script console

**Content Script:**
1. Open DevTools on any page (F12)
2. Look at Console tab
3. Content script logs will appear here

**Popup:**
1. Right-click extension icon
2. Select "Inspect popup"
3. DevTools will open for the popup

### Make Changes

After editing extension files:
1. Go to `chrome://extensions/`
2. Click the reload icon (↻) on the RepoComments extension
3. Reload any pages where the extension is active

### Common Issues

**OAuth redirect not captured:**
- Check that content script is injecting properly
- Verify the URL pattern in manifest.json matches your OAuth callback
- Add console.logs to content-script.js to debug

**Comments not injecting:**
- Check that comments-ui.js is in the correct location
- Verify chrome.storage has the correct enabled state
- Check content script is loading on the target page

**Storage not persisting:**
- Use `chrome.storage.local.get(null, console.log)` to inspect storage
- Check that background.js is handling messages correctly

## Next Steps

Once basic functionality is working:

1. **Test with real GitHub repos** - Try on actual GitHub-hosted prototypes
2. **Test multi-user** - Login with different accounts and verify collaboration
3. **Test WebSocket** - Implement real-time updates when someone else comments
4. **Package for distribution** - Create a .crx file or publish to Chrome Web Store
5. **Add keyboard shortcuts** - Implement Cmd+Shift+C to toggle comments

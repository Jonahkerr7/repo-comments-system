# RepoComments Chrome Extension

Git-native design review for web apps. Comment on live prototypes with branch awareness.

## Features

- ✅ Comment on any website without code changes
- ✅ Drag and reposition comment markers
- ✅ Tab-aware comments (only show on correct tab)
- ✅ Selector-based positioning (follows elements)
- ✅ Thread conversations with replies
- ✅ Resolve/reopen comments
- ✅ GitHub OAuth authentication
- ✅ Works on localhost, staging, and production

## Installation (Development)

### 1. Load Extension in Chrome

1. Open Chrome and navigate to `chrome://extensions/`
2. Enable **Developer mode** (toggle in top-right)
3. Click **Load unpacked**
4. Select the `chrome-extension` folder from this repo

### 2. Start the Backend

Make sure the RepoComments backend is running:

```bash
cd /path/to/repo-comments-system
docker compose up
```

The backend should be running at `http://localhost:3000`

### 3. Use the Extension

1. **Login**: Click the extension icon → "Login with GitHub"
2. **Enable**: After login, click "Enable Comments"
3. **Comment**: Navigate to any website and click anywhere to add a comment
4. **View**: Click comment markers to view and reply
5. **Resolve**: Mark comments as resolved when done

## Usage

### Adding Comments

1. Click extension icon → "Enable Comments"
2. Navigate to the page you want to comment on
3. Click the purple floating button (bottom-right)
4. Click "Add Comment"
5. Click anywhere on the page
6. Enter your comment in the prompt

### Viewing Comments

- Purple numbered markers show open comments
- Green markers show resolved comments
- Click a marker to view the full thread
- Drag markers to reposition them

### Managing Comments

- **Reply**: Click marker → type in reply box → Send
- **Resolve**: Click marker → "Resolve" button
- **Reopen**: Click resolved marker → "Reopen" button

## Configuration

The extension detects repo/branch from the URL automatically:

- `staging.acme-corp.com` → repo: `acme-corp/staging`, branch: `main`
- `localhost:3000?branch=feature-x` → repo: `default/repo`, branch: `feature-x`

You can customize this logic in `src/content-script.js`

## Keyboard Shortcuts

(Coming soon)

- `Cmd+Shift+C` - Toggle comments on/off
- `Esc` - Cancel adding comment

## Troubleshooting

### Extension not working?

1. Check that backend is running: `docker compose ps`
2. Check browser console for errors (F12 → Console)
3. Try disabling and re-enabling the extension
4. Reload the page

### Comments not showing?

1. Make sure you clicked "Enable Comments" in the popup
2. Check that you're logged in
3. Try hard-refreshing the page (Cmd+Shift+R)

### Can't login?

1. Make sure backend is running at `http://localhost:3000`
2. Check that GitHub OAuth is configured in `.env`
3. Try logging out and back in

## Development

### File Structure

```
chrome-extension/
├── manifest.json           # Extension config
├── popup.html             # Extension popup UI
├── icons/                 # Extension icons
├── src/
│   ├── background.js      # Background service worker
│   ├── content-script.js  # Injected into pages
│   ├── popup.js           # Popup logic
│   └── comments-ui.js     # Main commenting UI
└── README.md             # This file
```

### Making Changes

1. Edit files in `chrome-extension/src/`
2. Go to `chrome://extensions/`
3. Click the refresh icon on the RepoComments extension
4. Reload any pages you're testing on

### Debugging

- **Background script**: `chrome://extensions/` → RepoComments → "service worker" link
- **Content script**: Open DevTools on any page (F12) → Console
- **Popup**: Right-click extension icon → "Inspect popup"

## Publishing

(Coming soon - guide for publishing to Chrome Web Store)

## License

MIT

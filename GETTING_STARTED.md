# Getting Started with RepoComments

This guide will get you up and running with the repository-native commenting system in under 10 minutes.

---

## Prerequisites

- **Node.js** 20+
- **Docker** (for easiest setup) OR **PostgreSQL** 15+
- **GitHub account** (for OAuth, or use Google)

---

## Step 1: Clone and Setup

```bash
git clone <your-repo-url>
cd repo-comments-system
```

---

## Step 2: Start the Backend

### Option A: Docker (Recommended)

```bash
# Start PostgreSQL + Backend API
docker-compose up

# In another terminal, check that services are running
curl http://localhost:3000/health
# Should return: {"status":"ok",...}
```

### Option B: Manual Setup

```bash
# Install backend dependencies
cd backend
npm install

# Create database
createdb repo_comments
psql repo_comments < ../database/schema.sql
psql repo_comments < ../database/seed.sql

# Create .env file
cp .env.example .env

# Start backend
npm run dev
```

---

## Step 3: Configure OAuth

You need OAuth credentials to enable login.

### GitHub OAuth App

1. Go to https://github.com/settings/developers
2. Click **"New OAuth App"**
3. Fill in:
   - **Application name**: `RepoComments Local`
   - **Homepage URL**: `http://localhost:3000`
   - **Authorization callback URL**: `http://localhost:3000/api/v1/auth/github/callback`
4. Click **"Register application"**
5. Copy **Client ID** and **Client Secret**

### Update Environment Variables

Edit `backend/.env`:

```env
GITHUB_CLIENT_ID=your_client_id_here
GITHUB_CLIENT_SECRET=your_client_secret_here
GITHUB_CALLBACK_URL=http://localhost:3000/api/v1/auth/github/callback
```

### Restart Backend

```bash
# If using Docker
docker-compose restart backend

# If running manually
# Ctrl+C and then npm run dev again
```

---

## Step 4: Build the Client SDK

```bash
cd client
npm install
npm run build

# Link locally for development
npm link
```

---

## Step 5: Run the Example App

```bash
cd ../example
npm install

# Link the local client SDK
npm link @repo-comments/client

# Start example app
npm run dev
```

Open http://localhost:5173

---

## Step 6: Login and Add Your First Comment

1. **Click "Login with GitHub"** (top-right)
2. Authorize the app
3. You'll be redirected back to the example app
4. **Click the purple comment button** (bottom-right floating button)
5. **Click "Add comment"** in the panel
6. **Click anywhere on the page**
7. **Type your comment** and click "Add comment"

You should see:
- A purple marker appears at the click location
- The comment shows in the side panel
- Real-time updates if you open the app in another tab

---

## Step 7: Explore Features

### Add a Reply

1. Click on a comment marker
2. The thread opens in the side panel
3. Type a reply in the input box
4. Press Enter or click send

### Resolve a Thread

1. Open a thread
2. Click **"Resolve"** button (top-right)
3. The marker changes to green with a checkmark
4. Thread moves to the "Resolved" tab

### View Resolved Comments

1. Click the **"Resolved"** tab in the panel
2. See all resolved threads
3. Click **"Reopen"** to bring them back

---

## Step 8: Integrate into Your Own App

### Install in Your React/Vue/Vanilla App

```bash
# In your app directory
npm install @repo-comments/client

# Or if using local development
npm link @repo-comments/client
```

### Add to Your App

**React Example:**

```tsx
// src/App.tsx or src/main.tsx
import { useEffect } from 'react';
import RepoComments from '@repo-comments/client';

function App() {
  useEffect(() => {
    RepoComments.init({
      apiUrl: 'http://localhost:3000',
      repo: 'your-org/your-repo',
      branch: 'main', // or detect dynamically
      enableUIComments: true,
    });

    // Handle OAuth callback
    const params = new URLSearchParams(window.location.search);
    const token = params.get('token');
    if (token) {
      RepoComments.setToken(token);
      window.history.replaceState({}, '', window.location.pathname);
    }

    return () => RepoComments.destroy();
  }, []);

  return <div>Your App</div>;
}
```

**Vanilla JavaScript:**

```html
<script type="module">
  import RepoComments from '@repo-comments/client';

  RepoComments.init({
    apiUrl: 'http://localhost:3000',
    repo: 'your-org/your-repo',
    branch: 'main',
  });

  const token = new URLSearchParams(window.location.search).get('token');
  if (token) {
    RepoComments.setToken(token);
  }
</script>
```

---

## Troubleshooting

### Backend won't start

**Error:** `ECONNREFUSED ::1:5432`
- PostgreSQL isn't running
- **Fix:** `docker-compose up` or `brew services start postgresql`

**Error:** `Invalid JWT secret`
- Missing or default JWT_SECRET
- **Fix:** Generate one with `openssl rand -base64 32` and add to `.env`

### OAuth redirect fails

**Error:** `Redirect URI mismatch`
- OAuth callback URL doesn't match
- **Fix:** Check GitHub OAuth app settings match `.env` exactly

### Client SDK not working

**Error:** `Cannot find module '@repo-comments/client'`
- SDK not installed or linked
- **Fix:** `npm link @repo-comments/client` in your app directory

### Comments not appearing

**Check:**
1. Is backend running? `curl http://localhost:3000/health`
2. Are you logged in? Check network tab for 401 errors
3. Console errors? Open browser DevTools

### Real-time updates not working

**Check:**
1. WebSocket connection in DevTools Network tab
2. Token is valid (try re-logging in)
3. Backend WebSocket server is running (check logs)

---

## Next Steps

- Read the [Architecture Documentation](ARCHITECTURE.md)
- Check the [API Reference](README.md#api-reference)
- Explore [Extension Points](README.md#extension-points)
- Deploy to production (see [Deployment Guide](README.md#deployment))

---

## Need Help?

- **Issues**: Open a GitHub issue
- **Questions**: Check GitHub Discussions
- **Email**: support@yourcompany.com

Happy commenting! 🎉

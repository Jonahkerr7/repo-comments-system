# RepoComments Production Deployment Guide

## Overview

To use RepoComments on your GitHub Pages site, you need:
1. A deployed backend (API server)
2. The widget script added to your site
3. GitHub OAuth configured for production

---

## Step 1: Deploy Backend to Railway

### Option A: Railway (Recommended - Free tier available)

1. **Install Railway CLI**
   ```bash
   npm install -g @railway/cli
   railway login
   ```

2. **Create new project**
   ```bash
   cd /Users/jonah.kerr/repo-comments-system/backend
   railway init
   ```

3. **Add PostgreSQL**
   ```bash
   railway add --plugin postgresql
   ```

4. **Set environment variables**
   ```bash
   railway variables set NODE_ENV=production
   railway variables set JWT_SECRET=$(openssl rand -base64 32)
   railway variables set GITHUB_CLIENT_ID=your-github-client-id
   railway variables set GITHUB_CLIENT_SECRET=your-github-client-secret
   railway variables set GITHUB_CALLBACK_URL=https://your-app.railway.app/api/v1/auth/github/callback
   railway variables set CORS_ORIGIN=https://jonahkerr7.github.io
   ```

5. **Deploy**
   ```bash
   railway up
   ```

6. **Run database migrations**
   ```bash
   railway run psql $DATABASE_URL -f ../database/schema.sql
   ```

7. **Get your deployment URL**
   ```bash
   railway domain
   ```
   This gives you something like: `https://repo-comments-production.up.railway.app`

### Option B: Render (Alternative)

1. Go to https://render.com
2. Create a new Web Service from your GitHub repo
3. Set build command: `npm ci && npm run build`
4. Set start command: `npm start`
5. Add PostgreSQL database
6. Set environment variables (same as Railway)

---

## Step 2: Configure GitHub OAuth for Production

1. Go to https://github.com/settings/developers
2. Find your OAuth App (or create new one)
3. Update **Authorization callback URL** to:
   ```
   https://your-backend.railway.app/api/v1/auth/github/callback
   ```
4. Copy Client ID and Client Secret
5. Update your Railway environment variables with these values

---

## Step 3: Add Widget to Your GitHub Pages Site

### For Vite/React projects (like new-ui-workflow):

Update `index.html`:

```html
<!doctype html>
<html lang="en">
  <head>
    <meta charset="UTF-8" />
    <link rel="icon" type="image/svg+xml" href="/vite.svg" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>new-ui-workflow</title>
  </head>
  <body>
    <div id="root"></div>
    <script type="module" src="/src/main.jsx"></script>

    <!-- RepoComments Widget -->
    <script
      src="https://your-backend.railway.app/widget/repo-comments.js"
      data-api="https://your-backend.railway.app"
      data-repo="Jonahkerr7/new-ui-workflow"
      data-branch="main">
    </script>
  </body>
</html>
```

**OR** inline the widget configuration:

```html
<script>
  window.REPO_COMMENTS_API_URL = 'https://your-backend.railway.app';
  window.REPO_COMMENTS_REPO = 'Jonahkerr7/new-ui-workflow';
  window.REPO_COMMENTS_BRANCH = 'main';
</script>
<script src="https://your-backend.railway.app/widget/repo-comments.js"></script>
```

---

## Step 4: Serve Widget from Backend

Add static file serving to serve the widget:

In `backend/src/index.ts`, add:

```typescript
import path from 'path';

// Serve widget files
app.use('/widget', express.static(path.join(__dirname, '../../widget')));
```

---

## Step 5: Deploy to GitHub Pages

1. **Build your site**
   ```bash
   cd /Users/jonah.kerr/new-ui-workflow
   npm run build
   ```

2. **Deploy to GitHub Pages**
   ```bash
   npm run deploy
   ```
   (or push to main branch if using GitHub Actions)

---

## Quick Setup Commands

```bash
# 1. Deploy backend
cd /Users/jonah.kerr/repo-comments-system/backend
railway init
railway add --plugin postgresql
railway variables set NODE_ENV=production
railway variables set JWT_SECRET=$(openssl rand -base64 32)
railway variables set GITHUB_CLIENT_ID=<your-client-id>
railway variables set GITHUB_CLIENT_SECRET=<your-client-secret>
railway variables set GITHUB_CALLBACK_URL=https://<your-railway-app>.railway.app/api/v1/auth/github/callback
railway variables set CORS_ORIGIN=https://jonahkerr7.github.io
railway up

# 2. Get deployment URL
railway domain

# 3. Run migrations
railway run psql \$DATABASE_URL -f ../database/schema.sql

# 4. Update index.html with your railway URL

# 5. Deploy GitHub Pages
cd /Users/jonah.kerr/new-ui-workflow
npm run build
# Push to GitHub
```

---

## Testing

1. Open your GitHub Pages site: https://jonahkerr7.github.io/new-ui-workflow/
2. You should see a purple comment button in the bottom-right corner
3. Click it to open the comments panel
4. Click "Sign in with GitHub" to authenticate
5. After authentication, you can add comments to any element on the page

---

## Troubleshooting

### Widget not appearing
- Check browser console for errors
- Ensure backend is running and accessible
- Verify CORS_ORIGIN includes your GitHub Pages domain

### OAuth not working
- Verify callback URL in GitHub OAuth app settings
- Check GITHUB_CLIENT_ID and GITHUB_CLIENT_SECRET are set correctly
- Ensure the callback URL matches exactly

### CORS errors
- Add your GitHub Pages domain to CORS_ORIGIN
- Example: `https://jonahkerr7.github.io`

### Database connection issues
- Verify DATABASE_URL is set correctly
- Run migrations: `railway run psql $DATABASE_URL -f ../database/schema.sql`

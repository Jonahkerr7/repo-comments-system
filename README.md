# Repository-Native Commenting System

A Figma-like commenting system for design handoffs and prototype collaboration. Add contextual, threaded comments directly to your running applications and prototypes—no design tools required.

![License](https://img.shields.io/badge/license-MIT-blue.svg)
![Node](https://img.shields.io/badge/node-%3E%3D20.0.0-green.svg)
![React](https://img.shields.io/badge/react-%5E18.0.0-blue.svg)

---

## Table of Contents

- [Overview](#overview)
- [Features](#features)
- [Quick Start](#quick-start)
- [Installation](#installation)
- [Usage](#usage)
- [Deployment](#deployment)
- [API Reference](#api-reference)
- [Extension Points](#extension-points)
- [Contributing](#contributing)

---

## Overview

This system bridges the gap between design and engineering by providing a **repository-first commenting layer** that works on running applications, not inside design tools.

### The Problem

- Design teams annotate work in Figma
- Prototypes are handed off to engineering/product
- **There's no shared commenting layer** once the work leaves the design tool
- PRs and Issues don't provide the same contextual, visual feedback

### The Solution

A **decoupled commenting platform** that:
- Works directly with repositories (context: repo, branch, commit)
- Provides Figma-like UI/UX for adding comments
- Supports threaded conversations, mentions, and resolution
- Persists comments outside of git (survives rebases, redeploys)
- Can be dropped into any web application as an npm package

---

## Features

### Core Functionality

- **✨ Figma-Style UI**: Purple markers, hover previews, side panel, identical UX
- **💬 Threaded Comments**: Full conversation threads with replies
- **📍 Contextual Anchors**: Pin comments to UI elements or code locations
- **✅ Resolve/Reopen**: Mark threads as resolved when addressed
- **🔔 Real-time Updates**: WebSocket for live collaboration
- **🔐 OAuth Authentication**: GitHub, Google, or custom providers
- **🎨 Light/Dark Themes**: Matches your application's theme
- **📱 Responsive**: Works on desktop and tablet

### Technical Features

- **Framework Agnostic**: Works with React, Vue, vanilla JS, or any web app
- **TypeScript**: Fully typed SDK and backend
- **Self-Hosted**: Run on your infrastructure, own your data
- **Extensible**: Plugin system for integrations (Slack, Linear, Jira)
- **Scalable**: PostgreSQL backend, containerized deployment

---

## Quick Start

### 1. Run the Backend

```bash
cd repo-comments-system
docker-compose up
```

This starts:
- PostgreSQL database (port 5432)
- Backend API service (port 3000)

### 2. Configure OAuth

Create a GitHub OAuth App at https://github.com/settings/developers:
- **Homepage URL**: `http://localhost:3000`
- **Callback URL**: `http://localhost:3000/api/v1/auth/github/callback`

Update `backend/.env`:
```env
GITHUB_CLIENT_ID=your-client-id
GITHUB_CLIENT_SECRET=your-client-secret
```

### 3. Install Client SDK

```bash
npm install @repo-comments/client
```

### 4. Integrate into Your App

```typescript
import RepoComments from '@repo-comments/client';

RepoComments.init({
  apiUrl: 'http://localhost:3000',
  repo: 'your-org/your-repo',
  branch: 'main',
  enableUIComments: true,
});
```

### 5. Login and Comment

1. Visit your app
2. Click the login button (redirects to GitHub OAuth)
3. Click the floating comment button (bottom-right)
4. Click anywhere on your app to add a comment

---

## Installation

### Backend

#### Option 1: Docker (Recommended)

```bash
git clone <your-repo-url>
cd repo-comments-system
cp backend/.env.example backend/.env
# Edit backend/.env with your OAuth credentials
docker-compose up -d
```

#### Option 2: Manual Setup

**Requirements:**
- Node.js 20+
- PostgreSQL 15+

```bash
cd backend
npm install

# Setup database
createdb repo_comments
psql repo_comments < ../database/schema.sql
psql repo_comments < ../database/seed.sql

# Start server
npm run dev
```

### Client SDK

#### From npm (when published)

```bash
npm install @repo-comments/client
```

#### From source

```bash
cd client
npm install
npm run build
npm link

# In your app
npm link @repo-comments/client
```

---

## Usage

### Basic Integration

```typescript
import RepoComments from '@repo-comments/client';

// Initialize on app load
RepoComments.init({
  apiUrl: 'https://comments.yourcompany.com',
  repo: 'acme-corp/design-system',
  branch: 'feature/new-dashboard',
  commit: process.env.GIT_COMMIT, // optional
  enableUIComments: true,
  enableCodeComments: false, // for code editor integrations
  mode: 'full', // or 'readonly'
  position: 'right', // or 'left'
  theme: 'auto', // or 'light', 'dark'
});

// Handle token from OAuth callback
const params = new URLSearchParams(window.location.search);
const token = params.get('token');
if (token) {
  RepoComments.setToken(token);
}
```

### Programmatic API

```typescript
// Create a comment programmatically
const thread = await RepoComments.createThread({
  type: 'ui',
  selector: '.button.primary-cta',
  coordinates: { x: 450, y: 320 },
  message: 'This button needs better contrast',
  priority: 'high',
  tags: ['accessibility', 'design'],
});

// Listen to events
RepoComments.on('thread:created', (thread) => {
  console.log('New comment:', thread);
});

RepoComments.on('thread:resolved', (thread) => {
  console.log('Thread resolved:', thread);
});

// Get all threads
const threads = await RepoComments.getThreads({
  status: 'open',
  context_type: 'ui',
});

// Add a reply
await RepoComments.addMessage(threadId, 'Fixed in commit abc123');

// Resolve a thread
await RepoComments.resolveThread(threadId);
```

### Authentication

```typescript
// Redirect to GitHub OAuth
window.location.href = 'http://localhost:3000/api/v1/auth/github';

// Or Google OAuth
window.location.href = 'http://localhost:3000/api/v1/auth/google';

// Get current user
const user = await RepoComments.getCurrentUser();
console.log(user.name, user.email);
```

---

## Deployment

### Production Deployment

#### 1. Environment Setup

Create production `.env`:

```env
NODE_ENV=production
DATABASE_URL=postgresql://user:pass@db-host:5432/repo_comments
JWT_SECRET=<generate-with-openssl-rand-base64-32>
GITHUB_CLIENT_ID=<production-oauth-app-id>
GITHUB_CLIENT_SECRET=<production-oauth-app-secret>
GITHUB_CALLBACK_URL=https://comments.yourcompany.com/api/v1/auth/github/callback
CORS_ORIGIN=https://yourapp.com,https://anotherapp.com
```

#### 2. Database Migration

```bash
# Run migrations on production database
psql $DATABASE_URL -f database/schema.sql
```

#### 3. Deploy Backend

**Option A: Docker**

```bash
docker build -t repo-comments-backend ./backend
docker run -d \
  --name repo-comments \
  -p 3000:3000 \
  --env-file .env \
  repo-comments-backend
```

**Option B: Platform (Render, Railway, etc.)**

```yaml
# render.yaml
services:
  - type: web
    name: repo-comments-api
    env: node
    buildCommand: cd backend && npm install && npm run build
    startCommand: cd backend && npm start
    envVars:
      - key: DATABASE_URL
        fromDatabase:
          name: repo-comments-db
          property: connectionString
```

#### 4. CDN Deployment for Client SDK

Build and publish client SDK:

```bash
cd client
npm run build
npm publish --access public
```

Or host on CDN for direct `<script>` tag usage:

```html
<script src="https://cdn.yourcompany.com/repo-comments/v1.0.0/index.umd.js"></script>
<script>
  RepoComments.init({ /* config */ });
</script>
```

---

## API Reference

### Backend REST API

**Base URL**: `https://your-api-url.com/api/v1`

#### Authentication

```
GET  /auth/github              - Initiate GitHub OAuth
GET  /auth/github/callback     - OAuth callback
GET  /auth/google              - Initiate Google OAuth
GET  /auth/google/callback     - OAuth callback
GET  /auth/user                - Get current user
POST /auth/logout              - Logout
```

#### Threads

```
POST   /threads                - Create new thread
GET    /threads                - List threads (query: repo, branch, status, context_type)
GET    /threads/:id            - Get thread with messages
PATCH  /threads/:id            - Update thread (resolve, change priority, tags)
DELETE /threads/:id            - Delete thread
```

#### Messages

```
POST   /threads/:id/messages           - Add message to thread
PATCH  /threads/:id/messages/:msgId    - Edit message
DELETE /threads/:id/messages/:msgId    - Delete message
POST   /threads/:id/messages/:msgId/reactions - Add emoji reaction
DELETE /threads/:id/messages/:msgId/reactions/:emoji - Remove reaction
```

### Client SDK API

See [client/README.md](client/README.md) for full SDK documentation.

---

## Extension Points

### 1. Custom Authentication Providers

Add new OAuth providers in [backend/src/auth/config.ts](backend/src/auth/config.ts:61):

```typescript
import { Strategy as OktaStrategy } from 'passport-okta-oauth20';

passport.use(new OktaStrategy({
  clientID: process.env.OKTA_CLIENT_ID,
  clientSecret: process.env.OKTA_CLIENT_SECRET,
  callbackURL: process.env.OKTA_CALLBACK_URL,
}, async (accessToken, refreshToken, profile, done) => {
  // Handle user creation
}));
```

### 2. Webhooks for Integrations

Send notifications to Slack, Teams, etc:

```typescript
// backend/src/webhooks/slack.ts
export async function notifySlack(thread: Thread) {
  await fetch(webhookUrl, {
    method: 'POST',
    body: JSON.stringify({
      text: `New comment on ${thread.repo}: ${thread.message}`,
    }),
  });
}
```

### 3. Custom Storage for Screenshots

Replace local storage with S3:

```typescript
// backend/src/storage/s3.ts
import { S3Client, PutObjectCommand } from '@aws-sdk/client-s3';

export async function uploadScreenshot(file: Buffer): Promise<string> {
  const s3 = new S3Client({ region: process.env.S3_REGION });
  const key = `screenshots/${Date.now()}.png`;

  await s3.send(new PutObjectCommand({
    Bucket: process.env.S3_BUCKET,
    Key: key,
    Body: file,
  }));

  return `https://${process.env.S3_BUCKET}.s3.amazonaws.com/${key}`;
}
```

### 4. VSCode Extension (Future)

Integrate with code editors for in-IDE comments:

```typescript
// vscode-extension/src/extension.ts
vscode.window.registerTextEditorDecorationType({
  gutterIconPath: './icons/comment-marker.svg',
  overviewRulerColor: '#7B61FF',
});
```

### 5. Analytics & Metrics

Track comment activity:

```typescript
// backend/src/analytics/tracker.ts
export function trackEvent(event: string, data: any) {
  // Send to analytics platform
  amplitude.track(event, data);
}

// Usage
trackEvent('comment.created', {
  repo: thread.repo,
  context_type: thread.context_type,
});
```

---

## Architecture

See [ARCHITECTURE.md](ARCHITECTURE.md) for detailed system design.

**Key Components:**

```
┌─────────────────────────────────────┐
│   Your Application + Client SDK    │
│   (React/Vue/HTML + npm package)    │
└──────────────┬──────────────────────┘
               │ REST + WebSocket
               ▼
┌─────────────────────────────────────┐
│      Backend Service (Node.js)      │
│   Auth • Comments API • Real-time   │
└──────────────┬──────────────────────┘
               │
               ▼
┌─────────────────────────────────────┐
│      PostgreSQL Database            │
│   threads • messages • users        │
└─────────────────────────────────────┘
```

---

## Roadmap

### ✅ Phase 1: MVP (Complete)
- Backend API with auth, CRUD, WebSocket
- Client SDK with Figma-like UI
- Docker deployment
- OAuth (GitHub, Google)

### 🚧 Phase 2: Enhanced UX
- [ ] Rich text editor (markdown, code blocks)
- [ ] @mentions with autocomplete
- [ ] Screenshot annotations (draw, highlight)
- [ ] File attachments
- [ ] Comment search & filtering

### 📅 Phase 3: Integrations
- [ ] Slack notifications
- [ ] GitHub PR integration
- [ ] Linear/Jira sync
- [ ] Email notifications
- [ ] Webhook system

### 📅 Phase 4: Scale & SaaS
- [ ] Multi-tenancy
- [ ] Usage analytics dashboard
- [ ] Team management UI
- [ ] API rate limiting
- [ ] Advanced RBAC

---

## Contributing

Contributions are welcome! Please read [CONTRIBUTING.md](CONTRIBUTING.md) for guidelines.

### Development Setup

```bash
# Backend
cd backend
npm install
npm run dev

# Client
cd client
npm install
npm run dev

# Example app
cd example
npm install
npm run dev
```

### Running Tests

```bash
npm test
```

---

## License

MIT License - see [LICENSE](LICENSE) for details.

---

## Support

- **Issues**: [GitHub Issues](https://github.com/your-org/repo-comments/issues)
- **Discussions**: [GitHub Discussions](https://github.com/your-org/repo-comments/discussions)
- **Email**: support@yourcompany.com

---

**Built with ❤️ for better design-to-engineering collaboration.**

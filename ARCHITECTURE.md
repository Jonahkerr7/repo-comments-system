# Repository-Native Commenting System
## System Architecture

### Executive Summary

A decoupled commenting platform that enables Figma-like collaborative annotations on running applications and code repositories, without requiring design tools or git storage.

---

## 1. High-Level Architecture

```
┌─────────────────────────────────────────────────────────────┐
│                     User's Application                       │
│  ┌───────────────────────────────────────────────────────┐  │
│  │  App Code (React/Vue/HTML/etc)                        │  │
│  │  + @repo-comments/client SDK                          │  │
│  └───────────────────────────────────────────────────────┘  │
│                          │                                   │
│                          │ (loads overlay UI)                │
│                          ▼                                   │
│  ┌───────────────────────────────────────────────────────┐  │
│  │  Comment Overlay (injected UI)                        │  │
│  │  - Floating comment panel                             │  │
│  │  - Contextual anchors/markers                         │  │
│  │  - Auth UI                                            │  │
│  └───────────────────────────────────────────────────────┘  │
└─────────────────────────────────────────────────────────────┘
                          │
                          │ REST API / WebSocket
                          ▼
┌─────────────────────────────────────────────────────────────┐
│                  Comment Service (Backend)                   │
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐      │
│  │ Auth Service │  │ Comment API  │  │  WebSocket   │      │
│  │ (OAuth/SSO)  │  │   (CRUD)     │  │  (real-time) │      │
│  └──────────────┘  └──────────────┘  └──────────────┘      │
│                          │                                   │
│                          ▼                                   │
│  ┌───────────────────────────────────────────────────────┐  │
│  │              PostgreSQL Database                      │  │
│  │  - threads, messages, context, users, permissions     │  │
│  └───────────────────────────────────────────────────────┘  │
└─────────────────────────────────────────────────────────────┘
```

---

## 2. Core Components

### 2.1 Client SDK (@repo-comments/client)

**Purpose**: Lightweight npm package that initializes the comment system in any web application.

**Key Responsibilities**:
- Auto-inject comment UI overlay
- Capture context (repo, branch, commit, file, selector)
- Manage authentication state
- Handle comment CRUD operations
- Real-time updates via WebSocket

**Installation**:
```bash
npm install @repo-comments/client
```

**Integration** (Example):
```javascript
import { RepoComments } from '@repo-comments/client';

RepoComments.init({
  apiUrl: 'https://comments-api.yourcompany.com',
  repo: 'org/repo-name',
  branch: 'main',
  commit: process.env.GIT_COMMIT,
  enableUIComments: true,  // Allow clicking on UI elements
  enableCodeComments: true // Allow file/line comments
});
```

### 2.2 Comment Overlay UI

**Purpose**: Figma-like comment interface injected into the host application.

**Features**:
- **Comment Markers**: Visual pins on UI elements or code sections
- **Comment Panel**: Sidebar/modal with threaded conversations
- **Toolbar**: Add comment, filter (open/resolved), search
- **Modes**:
  - UI Mode: Click anywhere on the app to add a comment
  - Code Mode: Select file/line range from embedded viewer
  - Read-only Mode: View-only for stakeholders

**UX Patterns**:
- Click to add comment (creates anchor)
- Hover marker to preview thread
- Click marker to open thread panel
- @ mentions, markdown support
- Resolve/reopen threads

### 2.3 Backend Service

**Technology Stack**:
- **Runtime**: Node.js (Express.js or Fastify)
- **Database**: PostgreSQL
- **Real-time**: Socket.io or native WebSocket
- **Auth**: Passport.js (OAuth2/SAML)
- **Hosting**: Containerized (Docker) for easy deployment

**Key Endpoints**:
```
POST   /auth/login
GET    /auth/user
POST   /comments/threads
GET    /comments/threads?repo=...&branch=...&status=open
POST   /comments/threads/:id/messages
PATCH  /comments/threads/:id/resolve
DELETE /comments/threads/:id
```

---

## 3. Data Model

### 3.1 Core Entities

#### **threads**
```sql
CREATE TABLE threads (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  repo VARCHAR(255) NOT NULL,         -- org/repo-name
  branch VARCHAR(255) NOT NULL,        -- main, feature/xyz
  commit_hash VARCHAR(40),             -- optional: specific commit

  -- Context: Code or UI
  context_type VARCHAR(20) NOT NULL,   -- 'code' | 'ui'
  file_path TEXT,                      -- for code comments
  line_start INT,                      -- for code comments
  line_end INT,                        -- for code comments
  selector TEXT,                       -- CSS selector for UI comments
  screenshot_url TEXT,                 -- optional: captured screenshot

  -- Metadata
  status VARCHAR(20) DEFAULT 'open',   -- 'open' | 'resolved'
  created_by UUID REFERENCES users(id),
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW(),

  CONSTRAINT valid_context CHECK (
    (context_type = 'code' AND file_path IS NOT NULL) OR
    (context_type = 'ui' AND selector IS NOT NULL)
  )
);

CREATE INDEX idx_threads_repo ON threads(repo, branch, status);
```

#### **messages**
```sql
CREATE TABLE messages (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  thread_id UUID NOT NULL REFERENCES threads(id) ON DELETE CASCADE,
  author_id UUID NOT NULL REFERENCES users(id),
  content TEXT NOT NULL,
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW(),

  CONSTRAINT content_not_empty CHECK (LENGTH(content) > 0)
);

CREATE INDEX idx_messages_thread ON messages(thread_id, created_at);
```

#### **users**
```sql
CREATE TABLE users (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  email VARCHAR(255) UNIQUE NOT NULL,
  name VARCHAR(255) NOT NULL,
  avatar_url TEXT,
  provider VARCHAR(50),                -- 'github' | 'google' | 'okta'
  provider_id VARCHAR(255),
  created_at TIMESTAMP DEFAULT NOW(),
  last_login TIMESTAMP
);
```

#### **permissions**
```sql
CREATE TABLE permissions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  repo VARCHAR(255) NOT NULL,
  user_id UUID REFERENCES users(id),
  team_id UUID REFERENCES teams(id),   -- optional: team-based access
  role VARCHAR(20) NOT NULL,           -- 'admin' | 'write' | 'read'

  CONSTRAINT user_or_team CHECK (
    (user_id IS NOT NULL) OR (team_id IS NOT NULL)
  )
);

CREATE INDEX idx_permissions_repo ON permissions(repo);
```

#### **teams** (optional, for team-based permissions)
```sql
CREATE TABLE teams (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name VARCHAR(255) NOT NULL,
  org VARCHAR(255) NOT NULL,
  created_at TIMESTAMP DEFAULT NOW()
);

CREATE TABLE team_members (
  team_id UUID REFERENCES teams(id) ON DELETE CASCADE,
  user_id UUID REFERENCES users(id) ON DELETE CASCADE,
  PRIMARY KEY (team_id, user_id)
);
```

---

## 4. Client Integration API

### 4.1 Initialization

```typescript
interface RepoCommentsConfig {
  apiUrl: string;                    // Backend service URL
  repo: string;                      // 'org/repo-name'
  branch?: string;                   // default: git branch detection
  commit?: string;                   // default: git commit detection
  enableUIComments?: boolean;        // default: true
  enableCodeComments?: boolean;      // default: false
  mode?: 'full' | 'readonly';        // default: 'full'
  position?: 'right' | 'left';       // panel position
  theme?: 'light' | 'dark' | 'auto'; // UI theme
}

RepoComments.init(config: RepoCommentsConfig): void
```

### 4.2 Programmatic API

```typescript
// Get current context
RepoComments.getContext(): Context

// Create thread programmatically
RepoComments.createThread({
  type: 'ui' | 'code',
  selector?: string,
  filePath?: string,
  lineStart?: number,
  lineEnd?: number,
  message: string
}): Promise<Thread>

// Event listeners
RepoComments.on('thread:created', (thread) => { /* ... */ })
RepoComments.on('thread:resolved', (thread) => { /* ... */ })
RepoComments.on('message:added', (message) => { /* ... */ })

// Destroy (cleanup)
RepoComments.destroy(): void
```

---

## 5. Backend API Design

### 5.1 Authentication Endpoints

```
POST /api/v1/auth/login
  Body: { provider: 'github' | 'google' | 'okta' }
  Returns: { redirectUrl: string }

GET /api/v1/auth/callback?code=...&state=...
  Returns: JWT token in cookie/header

GET /api/v1/auth/user
  Headers: Authorization: Bearer <token>
  Returns: { id, email, name, avatar, permissions[] }

POST /api/v1/auth/logout
  Invalidates session
```

### 5.2 Comment Endpoints

```
POST /api/v1/threads
  Body: {
    repo, branch, commit?,
    contextType: 'code' | 'ui',
    filePath?, lineStart?, lineEnd?,
    selector?, screenshot?,
    message: string
  }
  Returns: Thread object

GET /api/v1/threads
  Query: repo, branch?, status?, contextType?
  Returns: Thread[]

GET /api/v1/threads/:id
  Returns: Thread with messages[]

POST /api/v1/threads/:id/messages
  Body: { content: string }
  Returns: Message object

PATCH /api/v1/threads/:id
  Body: { status: 'open' | 'resolved' }
  Returns: Updated thread

DELETE /api/v1/threads/:id
  Requires: admin or thread creator
  Returns: 204 No Content
```

### 5.3 Real-time (WebSocket)

```
Client -> Server
  { type: 'subscribe', repo, branch }

Server -> Client
  { type: 'thread:created', data: Thread }
  { type: 'thread:updated', data: Thread }
  { type: 'message:added', data: { threadId, message } }
```

---

## 6. Technology Stack

### Frontend (Client SDK)
- **Framework**: TypeScript + React (for UI overlay)
- **Build**: Rollup/Vite for npm package bundling
- **Styling**: CSS-in-JS (emotion) or Tailwind
- **State**: Zustand or Context API
- **HTTP**: Fetch API
- **WebSocket**: Socket.io-client

### Backend
- **Runtime**: Node.js 20+
- **Framework**: Express.js or Fastify
- **Database**: PostgreSQL 15+
- **ORM**: Drizzle or Prisma
- **Auth**: Passport.js
- **Real-time**: Socket.io
- **Validation**: Zod

### DevOps
- **Containerization**: Docker + Docker Compose
- **Hosting**: Vercel/Render (backend), any CDN (client SDK)
- **Database**: Supabase, Railway, or self-hosted Postgres

---

## 7. Security Considerations

1. **Authentication**
   - OAuth2 flows (no password storage)
   - JWT with short expiry + refresh tokens
   - CSRF protection

2. **Authorization**
   - Permission checks on every API call
   - Repo-level access control
   - Role-based permissions (admin, write, read)

3. **Data Isolation**
   - Row-level security in database
   - Comments scoped to repo + branch
   - Users can only access repos they have permissions for

4. **Input Validation**
   - Sanitize HTML/markdown in comments
   - Validate selectors and file paths
   - Rate limiting on API endpoints

---

## 8. Deployment Model

### Option 1: Self-Hosted
- Backend deployed to company infrastructure
- PostgreSQL managed by team
- Full data ownership

### Option 2: SaaS (future)
- Hosted backend service
- Multi-tenancy with org isolation
- Usage-based pricing

### Initial MVP: Self-Hosted
```bash
docker-compose up
# Starts backend + PostgreSQL
# Client SDK points to localhost:3000
```

---

## 9. Extension Points

### 9.1 Integrations
- **Slack notifications** when comments created/resolved
- **GitHub webhook** to sync with PR status
- **Linear/Jira** to create issues from threads
- **Figma API** (future) to import design comments

### 9.2 Plugins
- Custom auth providers
- Custom storage backends (S3 for screenshots)
- Custom notification channels
- Webhook system for external integrations

### 9.3 UI Customization
- Custom themes
- Custom toolbar actions
- Embeddable widgets for dashboards

---

## 10. Success Metrics

### Adoption
- Repos using the system
- Active users per week
- Comments created per project

### Engagement
- Average thread resolution time
- Messages per thread (quality of discussion)
- % of threads resolved vs abandoned

### Quality
- API response time < 200ms (p95)
- WebSocket message latency < 100ms
- Zero security incidents

---

## 11. Roadmap

### Phase 1: MVP (Current)
- ✅ Core architecture design
- ⏳ Backend API implementation
- ⏳ Client SDK + basic UI
- ⏳ OAuth authentication
- ⏳ Docker deployment

### Phase 2: Enhanced UX
- Rich text editor (markdown)
- @mentions with notifications
- Screenshot annotations
- Comment search

### Phase 3: Integrations
- Slack/Teams webhooks
- GitHub PR integration
- Linear/Jira sync
- Email notifications

### Phase 4: Scale
- Multi-tenancy
- Analytics dashboard
- API rate limiting
- Advanced permissions (RBAC)

---

## 12. Open Questions

1. **Screenshot storage**: Local vs S3? Auto-capture on comment creation?
2. **Branch strategy**: Should resolved comments copy forward to new branches?
3. **Code comments**: Integrate with VSCode extension for in-editor comments?
4. **Pricing model** (if SaaS): Per user? Per repo? Flat fee?

---


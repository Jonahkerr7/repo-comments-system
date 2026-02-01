# RepoComments Team Setup Guide

Complete guide for setting up and using RepoComments for team collaboration.

## Overview

RepoComments is a repository-native commenting system that allows teams to collaborate on design-to-engineering handoffs, prototypes, and live applications. Team members can:

- Leave comments on any element of a web page
- @mention teammates to get their attention
- Create threaded discussions
- Mark issues as resolved
- Track all activity across repositories

## System Architecture

```
┌─────────────────────────────────────────────────────────────┐
│                     TEAM MEMBERS                             │
│                                                              │
│  Designers    Engineers    Product Managers    QA           │
│     │              │              │              │           │
│     └──────────────┴──────────────┴──────────────┘          │
│                        │                                     │
│                        ▼                                     │
│              Chrome Extension                                │
│         (Installed on each member's browser)                 │
└─────────────────────────────────────────────────────────────┘
                         │
                         ▼
┌─────────────────────────────────────────────────────────────┐
│                    Backend API                               │
│   - Authentication (GitHub OAuth)                            │
│   - Comments & Threads                                       │
│   - Teams & Permissions                                      │
│   - Notifications & Mentions                                 │
│   - WebSocket (real-time)                                    │
└─────────────────────────────────────────────────────────────┘
                         │
                         ▼
┌─────────────────────────────────────────────────────────────┐
│                  PostgreSQL Database                         │
│   - Users & Teams                                            │
│   - Comments & Messages                                      │
│   - Permissions                                              │
│   - Audit Logs                                               │
└─────────────────────────────────────────────────────────────┘
```

## Quick Start for Teams

### For Admins

#### 1. Set Up the System

```bash
# Clone the repository
git clone https://github.com/your-org/repo-comments-system
cd repo-comments-system

# Start the backend
docker-compose up -d

# Start the admin dashboard
cd admin-dashboard
python3 -m http.server 9000
```

#### 2. Access the Admin Dashboard

Open http://localhost:9000

1. Click "Login with GitHub"
2. Authorize the application
3. You're now in the admin panel

#### 3. Create Your First Team

1. Go to **Teams** page
2. Click **Create Team**
3. Fill in:
   - **Name:** "Engineering Team"
   - **Organization:** "acme-corp"
   - **Description:** "Frontend and backend engineers"
4. Click **Create Team**

#### 4. Configure Repository Access

1. Go to **Repositories** page
2. Click **Add Repository**
3. Enter repository name: "acme-corp/design-system"
4. Click **Manage Permissions**
5. Add team permission:
   - Select "Engineering Team"
   - Role: "Write"
   - Click Add

Now all members of the Engineering Team can comment on `acme-corp/design-system`.

### For Team Members

#### 1. Install the Chrome Extension

1. Open Chrome and go to `chrome://extensions/`
2. Enable "Developer mode"
3. Click "Load unpacked"
4. Select: `/path/to/repo-comments-system/chrome-extension`

#### 2. Login

1. Click the RepoComments extension icon
2. Click "Login with GitHub"
3. Authorize the application
4. You'll be redirected back

#### 3. Enable Comments

1. Navigate to your web application (e.g., `http://localhost:8080`)
2. Click the RepoComments extension icon
3. Click "Enable Comments"
4. Purple comment markers will appear!

#### 4. Start Collaborating

**Add a comment:**
- Hold `Cmd` (Mac) or `Ctrl` (Windows)
- Click on any element
- Type your comment
- Click OK

**View comments:**
- Click any purple marker
- Read the thread
- Add replies

**@Mention teammates:**
```
@alice Can you review the button contrast?
@bob This needs to match the design spec
```

**Resolve issues:**
- Open a thread
- Click "Resolve" when done
- It disappears from the active view

## Team Collaboration Workflow

### Scenario: Design Review

#### Step 1: Designer Creates Comments

Alice (Designer) is reviewing a prototype at `https://staging.acme.com/dashboard`

1. Opens the page with RepoComments enabled
2. Sees a contrast issue on the primary button
3. **Cmd+Clicks** on the button
4. Creates comment:
   ```
   The contrast ratio on this button doesn't meet WCAG AA standards.
   Can we darken the background? @bob
   ```

#### Step 2: Engineer Gets Notified

Bob (Engineer) receives a notification:
- Email: "Alice mentioned you in a comment"
- In-app: Notification badge in extension

Bob:
1. Opens the same page
2. Clicks the comment marker
3. Sees Alice's comment
4. Replies:
   ```
   Good catch! I'll update the color token to use --primary-700.
   That should get us to 4.5:1 contrast.
   ```

#### Step 3: Code Changes

Bob:
1. Makes the code changes
2. Deploys to staging
3. Returns to the comment thread
4. Adds message:
   ```
   Fixed! Please review the updated button.
   ```

#### Step 4: Designer Approves

Alice:
1. Refreshes the staging page
2. Reviews the updated button
3. Clicks the comment marker
4. Clicks "Resolve"
5. The issue is closed

### Scenario: Cross-Functional Collaboration

#### Team Setup

**Design Team:**
- Alice (UI Designer)
- Carol (UX Designer)

**Engineering Team:**
- Bob (Frontend Engineer)
- Dave (Backend Engineer)

**Product Team:**
- Emma (Product Manager)

#### Repository Configuration

Admin sets up:

```
Repository: acme-corp/design-system
- Design Team → Write access
- Engineering Team → Write access
- Product Team → Read access
```

#### Workflow

1. **Product Requirements** (Emma)
   - Navigates to prototype
   - Adds comment on nav header:
     ```
     @alice We need this header to be sticky on mobile.
     Priority: High
     ```

2. **Design Review** (Alice)
   - Reviews Emma's comment
   - Replies:
     ```
     Agreed. I'll add sticky positioning.
     @bob can you implement this?
     ```

3. **Engineering Implementation** (Bob)
   - Sees the @mention
   - Reviews the requirement
   - Implements sticky nav
   - Replies:
     ```
     Done! Added sticky positioning with 56px offset
     for iOS safe area. @carol can you test on mobile?
     ```

4. **UX Testing** (Carol)
   - Tests on various devices
   - Replies:
     ```
     Tested on iPhone and Android. Works great!
     @emma ready for your approval.
     ```

5. **Product Approval** (Emma)
   - Reviews on mobile
   - Clicks "Resolve"
   - Feature complete!

## Advanced Features

### Branch-Based Comments

Comments are tied to specific branches:

```javascript
// Comment on main branch
repo: "acme-corp/app"
branch: "main"

// Comment on feature branch
repo: "acme-corp/app"
branch: "feature/new-dashboard"
```

When you switch branches, only relevant comments appear.

### Priority & Tags

Add metadata to comments:

```javascript
{
  priority: "critical",  // low, normal, high, critical
  tags: ["security", "validation"]
}
```

Filter in the admin dashboard:
- View all "critical" issues
- See all "security" tagged comments

### Code Comments vs UI Comments

**UI Comments** (default):
- Click on any visible element
- Tracked by CSS selector + coordinates
- Persists across tabs and DOM changes

**Code Comments** (future):
- Comment on specific lines of code
- Tracked by file path + line numbers
- Survives code refactoring

### Real-Time Collaboration

WebSocket support (coming soon):
- See when teammates are viewing the same page
- Live updates when someone adds a comment
- Real-time notifications

## Permission Levels

### Team Roles

**Member:**
- View team information
- Participate in discussions
- Create comments on allowed repositories

**Admin:**
- All member permissions
- Add/remove team members
- Manage team settings

### Repository Access

**Read:**
- View all comments
- See comment threads
- Cannot create or edit

**Write:**
- All read permissions
- Create new comments
- Reply to threads
- Edit own messages
- Resolve/reopen threads

**Admin:**
- All write permissions
- Delete any comment
- Manage repository permissions
- View audit logs

## Best Practices

### 1. Organize by Teams

Create teams that match your org structure:
- `design-team`
- `frontend-team`
- `backend-team`
- `qa-team`
- `product-team`

### 2. Use @Mentions Strategically

Only @mention when action is needed:
```
✅ @bob Can you review this API endpoint?
✅ @alice Does this match the design?
❌ @everyone FYI there's a typo here
```

### 3. Resolve When Done

Always mark threads as resolved:
- Keeps the comment list clean
- Signals to team that work is complete
- Can reopen if needed later

### 4. Add Context

Include helpful details:
```
✅ This button should be 44px tall per WCAG guidelines
✅ See design spec: https://figma.com/file/abc123
❌ This is wrong
```

### 5. Use Priority & Tags

Categorize for better filtering:
```javascript
{
  priority: "high",
  tags: ["accessibility", "design-system"]
}
```

## Admin Dashboard Functions

### Dashboard Page
- Total users, teams, comments, repos
- Recent activity feed

### Teams Page
- Create/edit/delete teams
- View team members
- Manage team permissions

### Users Page
- See all registered users
- Assign users to teams
- View user activity

### Repositories Page
- Add new repositories
- Configure team access
- Manage user permissions

### Comments Page
- View all comments across repos
- Filter by repository, status
- Jump to thread details

## Troubleshooting

### Comments Not Appearing

**Check:**
1. Extension is enabled (green badge)
2. Logged in with GitHub
3. Have permission for the repository
4. On the correct branch

### @Mentions Not Working

**Check:**
1. Username matches email or name in database
2. Mentioned user is registered
3. Using correct format: `@username`

### Can't Create Comments

**Check:**
1. Have "write" permission for repository
2. Extension is enabled
3. Token hasn't expired (re-login if needed)

### Team Members Not Seeing Comments

**Check:**
1. Team has permission for the repository
2. Users are members of the team
3. Repository name matches exactly (case-sensitive)

## Migration from Other Tools

### From Figma Comments

1. Export Figma comments (manual process)
2. Create threads in RepoComments
3. @mention original authors
4. Add context from Figma

### From Jira/GitHub Issues

1. Create comment on relevant element
2. Link to original issue:
   ```
   Related to JIRA-123: Fix button alignment
   @bob can you implement?
   ```
3. Resolve comment when issue is closed

### From Slack/Email

Instead of:
```
Slack: "Hey @bob, the login button is broken"
```

Do:
```
1. Navigate to login page
2. Cmd+Click the button
3. Create comment: "@bob this button is broken"
```

Benefits:
- Context is preserved
- Visible to whole team
- Tied to specific element

## Security & Privacy

### Authentication
- GitHub OAuth only (secure, no passwords)
- JWT tokens for API access
- Tokens expire automatically

### Permissions
- Repository-based access control
- Team-based permissions
- User-level overrides available

### Data Storage
- PostgreSQL database (encrypted at rest)
- No sensitive data in comments
- Full audit trail

### Compliance
- GDPR compliant (data export available)
- SOC 2 ready architecture
- Audit logs for all actions

## Support & Resources

### Documentation
- Backend API: `/backend/README.md`
- Chrome Extension: `/chrome-extension/README.md`
- Admin Dashboard: `/admin-dashboard/README.md`

### Getting Help
- GitHub Issues: [repository]/issues
- Team Slack: #repo-comments
- Email: support@your-company.com

### Contributing
See CONTRIBUTING.md for:
- Development setup
- Coding standards
- Pull request process

## Roadmap

### Q1 2026
- ✅ Basic commenting system
- ✅ Chrome extension
- ✅ Admin dashboard
- ✅ Team management
- ✅ @Mentions

### Q2 2026
- [ ] WebSocket real-time updates
- [ ] Mobile app (iOS/Android)
- [ ] Slack/Discord integration
- [ ] Advanced analytics

### Q3 2026
- [ ] Code comments (not just UI)
- [ ] Video annotations
- [ ] AI-powered suggestions
- [ ] Enterprise SSO

### Q4 2026
- [ ] Public API
- [ ] Zapier integration
- [ ] Advanced reporting
- [ ] Custom workflows

## Success Stories

### Acme Corp Design Team

Before RepoComments:
- Feedback scattered across Slack, Email, Figma
- Engineers missing design notes
- Lost context switching between tools

After RepoComments:
- All feedback in one place
- 50% faster design→eng handoff
- Zero context switching

> "RepoComments has transformed our design-to-engineering workflow. We've cut our review cycle time in half!" - Alice, Lead Designer

## Conclusion

RepoComments enables teams to collaborate directly on live applications, eliminating context switching and ensuring feedback is always attached to the relevant UI element.

Get started today:
1. Set up the backend
2. Install the Chrome extension
3. Create your teams
4. Start collaborating!

For questions or support, contact your admin or refer to the documentation.

---

**Happy Collaborating! 🎉**

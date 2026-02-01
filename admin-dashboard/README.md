# RepoComments Admin Dashboard

Web-based admin dashboard for managing teams, users, permissions, and viewing all comments across your organization.

## Features

### 📊 Dashboard Overview
- View statistics (users, teams, comments, repositories)
- Recent activity feed
- Quick insights into system usage

### 👥 Team Management
- Create and manage teams
- Assign users to teams with roles (member/admin)
- View team members and activity

### 👤 User Management
- View all registered users
- See user teams and permissions
- Assign users to teams
- View user join dates and OAuth providers

### 📦 Repository Management
- Configure repository access
- Manage team and user permissions per repository
- Set access levels (read/write/admin)
- View all comments for a specific repository

### 💬 Comments Overview
- View all comments across all repositories
- Filter by repository and status
- See comment details, priority, and tags
- Click to view full thread details

## Getting Started

### 1. Prerequisites

- Backend server running on `http://localhost:3000`
- PostgreSQL database with proper schema
- Chrome extension or web application with OAuth configured

### 2. Start the Admin Dashboard

```bash
cd admin-dashboard
python3 -m http.server 9000
```

Then open: http://localhost:9000

### 3. Login

1. Click "Login with GitHub"
2. Authorize via GitHub OAuth
3. You'll be redirected back to the dashboard with a token

### 4. Navigate the Dashboard

**Dashboard** - Overview and statistics
**Teams** - Create and manage teams
**Users** - View and manage users
**Repositories** - Configure repository permissions
**Comments** - View all comments across repos
**Settings** - Organization settings (coming soon)

## Team Workflow Example

### Setting Up a New Team

1. Go to **Teams** page
2. Click **"Create Team"**
3. Enter:
   - Team Name: "Design Team"
   - Organization: "acme-corp"
   - Description: "UI/UX designers"
4. Click **"Create Team"**

### Adding Users to a Team

1. Go to **Users** page
2. Click **"Manage"** next to a user
3. Select the team to add them to
4. User is now a member of that team

### Configuring Repository Access

1. Go to **Repositories** page
2. Click **"Add Repository"**
3. Enter repository name (e.g., "acme-corp/design-system")
4. Click **"Manage Permissions"** on the repository card
5. Add team permissions:
   - Click **"Add Team"**
   - Select team
   - Choose role (read/write/admin)
6. Add user permissions (optional):
   - Click **"Add User"**
   - Select user
   - Choose role

### @Mentioning Users in Comments

Users can @mention each other in comments:

```
@alice Can you review the button contrast ratio?
```

When a user is mentioned:
1. The backend extracts the @username
2. Looks up the user by name or email
3. Creates a notification
4. User sees notification in their extension

The mentioned user will receive a notification they were mentioned.

## User Roles & Permissions

### Team Roles
- **Member** - Can view and participate in team discussions
- **Admin** - Can manage team members and settings

### Repository Roles
- **Read** - Can view comments
- **Write** - Can create and edit comments
- **Admin** - Full access including deleting comments

## API Endpoints Used

### Teams
- `GET /api/v1/teams` - List all teams
- `POST /api/v1/teams` - Create team
- `PATCH /api/v1/teams/:id` - Update team
- `DELETE /api/v1/teams/:id` - Delete team
- `GET /api/v1/teams/:id/members` - Get team members
- `POST /api/v1/teams/:id/members` - Add team member
- `DELETE /api/v1/teams/:teamId/members/:userId` - Remove member

### Users
- `GET /api/v1/users` - List all users
- `GET /api/v1/users/:id` - Get user details
- `PATCH /api/v1/users/:id` - Update user

### Permissions
- `GET /api/v1/permissions?repo=...` - Get permissions for a repo
- `POST /api/v1/permissions` - Create permission
- `PATCH /api/v1/permissions/:id` - Update permission
- `DELETE /api/v1/permissions/:id` - Delete permission

### Threads
- `GET /api/v1/threads?repo=...` - Get threads for a repo
- `GET /api/v1/threads/:id` - Get thread details

## Screenshots

### Dashboard
![Dashboard Overview showing stats and recent activity]

### Teams
![Teams page with team cards and member counts]

### Users
![Users table showing all registered users]

### Repositories
![Repository configuration with permissions management]

### Comments
![Comments feed with filtering options]

## Development

### File Structure
```
admin-dashboard/
├── index.html          # Main HTML
├── css/
│   └── styles.css      # All styles
├── js/
│   ├── api.js          # API client
│   ├── app.js          # Main app logic
│   ├── teams.js        # Team management
│   ├── users.js        # User management
│   ├── repos.js        # Repository management
│   └── comments.js     # Comments overview
└── README.md           # This file
```

### Making Changes

1. Edit the JavaScript files in `js/`
2. Refresh the page (no build step needed - vanilla JS!)
3. Check browser console for any errors

### Adding New Features

1. Add UI in `index.html`
2. Add styles in `css/styles.css`
3. Add logic in the appropriate `js/*.js` file
4. Add backend API endpoint if needed

## Troubleshooting

**Login not working?**
- Check that backend is running on http://localhost:3000
- Verify OAuth is configured correctly
- Check browser console for errors

**Can't see teams/users?**
- Make sure you've logged in at least once
- Check that database has been seeded
- Verify backend API endpoints are working

**Permissions not saving?**
- Check that the repo name is correct (format: "owner/repo")
- Verify the user/team exists
- Check backend logs for errors

## Next Steps

- [ ] Add WebSocket support for real-time updates
- [ ] Add user invitation system
- [ ] Add advanced filtering and search
- [ ] Add analytics and reporting
- [ ] Add webhook configuration UI
- [ ] Add audit log viewer
- [ ] Add organization settings
- [ ] Add dark mode

## Architecture

The admin dashboard is a single-page application (SPA) built with vanilla JavaScript. It communicates with the backend API via REST endpoints.

**Authentication Flow:**
1. User clicks "Login with GitHub"
2. Redirected to `/api/v1/auth/github`
3. GitHub OAuth flow completes
4. Redirected back with `?token=...`
5. Token stored in localStorage
6. All subsequent API calls include `Authorization: Bearer <token>`

**Data Flow:**
1. User navigates to a page (e.g., Teams)
2. JavaScript loads data via API
3. Renders UI dynamically
4. User makes changes
5. Changes sent to API
6. Success/error notification shown
7. UI refreshed with new data

## Security Notes

- All API endpoints require authentication
- CORS is configured to allow localhost in development
- Tokens are stored in localStorage (secure in production with HTTPS)
- Backend validates all requests
- SQL injection prevented by parameterized queries
- XSS prevented by proper escaping

## Production Deployment

For production deployment:

1. **Build & Minify**
   - Concatenate JS files
   - Minify CSS and JS
   - Add cache busting

2. **Configure Backend**
   - Set `NODE_ENV=production`
   - Configure proper CORS origins
   - Use HTTPS only

3. **Deploy**
   - Host on CDN or static hosting
   - Point to production API URL
   - Enable HTTPS

4. **Security**
   - Add CSP headers
   - Enable HSTS
   - Add rate limiting
   - Configure proper OAuth callback URLs

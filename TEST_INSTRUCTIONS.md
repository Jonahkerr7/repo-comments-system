# Quick Test Instructions

## 🎯 What You'll Test

A Figma-like commenting system where you can:
1. Click anywhere on a webpage to add comments
2. See purple comment markers (like Figma)
3. Have threaded conversations
4. Resolve/reopen threads

---

## ⚡ Quick Test (5 minutes)

### Step 1: Start the Backend

```bash
cd /Users/jonah.kerr/repo-comments-system
docker-compose up
```

**Expected output:**
```
✅ postgres_1  | database system is ready to accept connections
✅ backend_1   | Server running at http://0.0.0.0:3000
```

Leave this terminal running.

---

### Step 2: Setup GitHub OAuth (One-time)

1. **Open browser:** https://github.com/settings/developers

2. **Click "New OAuth App"**

3. **Fill in:**
   - Application name: `RepoComments Test`
   - Homepage URL: `http://localhost:3000`
   - Authorization callback URL: `http://localhost:3000/api/v1/auth/github/callback`

4. **Click "Register application"**

5. **Copy the Client ID and Client Secret**

6. **Create `.env` file:**

```bash
# In a NEW terminal (keep docker-compose running)
cd /Users/jonah.kerr/repo-comments-system/backend
cat > .env << 'EOF'
NODE_ENV=development
PORT=3000
HOST=0.0.0.0
DATABASE_URL=postgresql://postgres:postgres@localhost:5432/repo_comments
JWT_SECRET=test-secret-key-change-in-production
GITHUB_CLIENT_ID=YOUR_CLIENT_ID_HERE
GITHUB_CLIENT_SECRET=YOUR_CLIENT_SECRET_HERE
GITHUB_CALLBACK_URL=http://localhost:3000/api/v1/auth/github/callback
CORS_ORIGIN=http://localhost:5173,http://localhost:3000
LOG_LEVEL=info
EOF
```

7. **Edit the file with your credentials:**

```bash
nano /Users/jonah.kerr/repo-comments-system/backend/.env
# Replace YOUR_CLIENT_ID_HERE and YOUR_CLIENT_SECRET_HERE
# Press Ctrl+X, then Y, then Enter to save
```

8. **Restart the backend:**

```bash
# Go back to the docker-compose terminal and press Ctrl+C
# Then restart:
docker-compose restart backend
```

---

### Step 3: Build and Run Example App

**In a NEW terminal:**

```bash
cd /Users/jonah.kerr/repo-comments-system/example
npm install
npm run dev
```

**Expected output:**
```
  VITE v5.x.x  ready in xxx ms
  ➜  Local:   http://localhost:5173/
```

---

### Step 4: Test the System

1. **Open browser:** http://localhost:5173

2. **You should see:**
   - A demo website with "Design Prototype" header
   - Purple "Login with GitHub" button (top-right)
   - Purple floating comment button (bottom-right)

3. **Click "Login with GitHub"**
   - You'll be redirected to GitHub
   - Click "Authorize"
   - You'll be redirected back

4. **Now click the purple comment button** (bottom-right)
   - A side panel slides in from the right
   - Click "Add comment"

5. **Click anywhere on the page**
   - Your cursor becomes a crosshair
   - Click on any element (e.g., the "Get Started" button)

6. **Type a comment:**
   - "This button needs better contrast"
   - Click "Add comment"

7. **You should see:**
   - A purple marker appears where you clicked
   - The comment shows in the side panel
   - Hover over the marker to see a preview

8. **Test reply:**
   - Click the purple marker
   - Type a reply: "Agreed, I'll fix this"
   - Press Enter or click send

9. **Test resolve:**
   - Click "Resolve" button (top-right in thread view)
   - The marker turns green with a checkmark
   - Thread moves to "Resolved" tab

---

## 🎨 What the UI Should Look Like

### Comment Markers
- **Open comments:** Purple circles with numbers (1, 2, 3...)
- **Resolved comments:** Green circles with checkmark ✓
- **Hover:** Shows comment preview bubble

### Side Panel
- **Position:** Slides in from right side
- **Tabs:** "Open" (with badge showing count) and "Resolved"
- **Thread list:** Shows avatar, author name, timestamp, comment preview
- **Thread detail:** Full conversation with reply input

### Colors (Figma-matching)
- **Primary purple:** #7B61FF
- **Green (resolved):** #00C853
- **Background:** White (#FFFFFF)
- **Text:** Black (#000000) and gray (#6F6F6F)

---

## ✅ Checklist

- [ ] Docker containers started successfully
- [ ] GitHub OAuth app created
- [ ] `.env` file configured with OAuth credentials
- [ ] Backend restarted
- [ ] Example app running on http://localhost:5173
- [ ] Can login with GitHub
- [ ] Can see floating comment button
- [ ] Can add a comment by clicking on the page
- [ ] Purple marker appears
- [ ] Comment shows in side panel
- [ ] Can reply to comment
- [ ] Can resolve/reopen thread
- [ ] Marker changes to green checkmark when resolved

---

## 🐛 Troubleshooting

### Backend won't start
```bash
# Check if PostgreSQL is running
docker ps

# You should see both 'postgres' and 'backend' containers
```

### "Authentication required" error
```bash
# Check backend logs
docker-compose logs backend

# Make sure .env file has correct OAuth credentials
cat /Users/jonah.kerr/repo-comments-system/backend/.env
```

### Example app won't start
```bash
# Install dependencies
cd /Users/jonah.kerr/repo-comments-system/example
rm -rf node_modules package-lock.json
npm install
npm run dev
```

### Comments not appearing
1. Open browser DevTools (F12)
2. Check Console for errors
3. Check Network tab - look for 401 errors (means not logged in)

---

## 📱 Test in Multiple Tabs

**Real-time test:**

1. Open http://localhost:5173 in TWO browser tabs
2. In Tab 1: Add a comment
3. In Tab 2: The comment should appear instantly (via WebSocket)

---

## 🎥 What Success Looks Like

**You've successfully tested the system when:**

1. ✅ You can login with GitHub
2. ✅ Purple comment button appears
3. ✅ Clicking anywhere creates a purple marker
4. ✅ Comments show in the side panel
5. ✅ You can reply to comments
6. ✅ Resolving a thread turns marker green
7. ✅ Real-time updates work across tabs

---

## 🚀 Next Steps

Once testing works:

1. **Integrate into your own app** - See README.md
2. **Deploy to production** - See GETTING_STARTED.md
3. **Customize the UI** - Edit client/src/styles/figma-theme.css
4. **Add webhooks** - Integrate Slack notifications

---

## 📞 Need Help?

If you get stuck:

1. Check the logs: `docker-compose logs -f backend`
2. Check browser console (F12)
3. Read GETTING_STARTED.md for detailed troubleshooting

#!/bin/bash

echo "🔑 GitHub OAuth Setup for RepoComments"
echo "======================================="
echo ""
echo "First, create a GitHub OAuth App:"
echo "1. Go to: https://github.com/settings/developers"
echo "2. Click 'New OAuth App'"
echo "3. Fill in:"
echo "   - Name: RepoComments Test"
echo "   - Homepage URL: http://localhost:3000"
echo "   - Callback URL: http://localhost:3000/api/v1/auth/github/callback"
echo "4. Click 'Register application'"
echo ""
echo "Press Enter when you're ready to input your credentials..."
read -r

echo ""
echo "Enter your GitHub Client ID:"
read -r GITHUB_CLIENT_ID

echo "Enter your GitHub Client Secret:"
read -r GITHUB_CLIENT_SECRET

# Create .env file
cat > /Users/jonah.kerr/repo-comments-system/backend/.env << EOF
NODE_ENV=development
PORT=3000
HOST=0.0.0.0
DATABASE_URL=postgresql://postgres:postgres@localhost:5432/repo_comments
JWT_SECRET=test-secret-change-in-production
GITHUB_CLIENT_ID=$GITHUB_CLIENT_ID
GITHUB_CLIENT_SECRET=$GITHUB_CLIENT_SECRET
GITHUB_CALLBACK_URL=http://localhost:3000/api/v1/auth/github/callback
CORS_ORIGIN=http://localhost:5173,http://localhost:3000
LOG_LEVEL=info
EOF

echo ""
echo "✅ Configuration file created at: backend/.env"
echo ""
echo "You can now start the system with:"
echo "  cd /Users/jonah.kerr/repo-comments-system"
echo "  docker-compose up"
echo ""

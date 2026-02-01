#!/bin/bash

# Quick Start Script for RepoComments Testing
# This automates the setup process

set -e  # Exit on error

echo "🚀 RepoComments Quick Start"
echo "=========================="
echo ""

# Color codes
GREEN='\033[0;32m'
BLUE='\033[0;34m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
NC='\033[0m' # No Color

# Check if Docker is running
if ! docker info > /dev/null 2>&1; then
    echo -e "${RED}❌ Docker is not running. Please start Docker Desktop and try again.${NC}"
    exit 1
fi

echo -e "${GREEN}✅ Docker is running${NC}"

# Navigate to project directory
cd "$(dirname "$0")"
PROJECT_DIR=$(pwd)

echo -e "${BLUE}📂 Project directory: ${PROJECT_DIR}${NC}"
echo ""

# Step 1: Check if .env exists
if [ ! -f "backend/.env" ]; then
    echo -e "${YELLOW}⚠️  No .env file found. Creating from template...${NC}"
    cp backend/.env.example backend/.env
    echo -e "${GREEN}✅ Created backend/.env${NC}"
    echo ""
    echo -e "${YELLOW}🔑 You need to setup GitHub OAuth:${NC}"
    echo "   1. Go to: https://github.com/settings/developers"
    echo "   2. Click 'New OAuth App'"
    echo "   3. Fill in:"
    echo "      - Name: RepoComments Test"
    echo "      - Homepage: http://localhost:3000"
    echo "      - Callback: http://localhost:3000/api/v1/auth/github/callback"
    echo "   4. Copy Client ID and Secret"
    echo ""
    echo -e "${BLUE}Press Enter when you have your GitHub OAuth credentials ready...${NC}"
    read -r

    echo "Enter your GitHub Client ID:"
    read -r GITHUB_CLIENT_ID

    echo "Enter your GitHub Client Secret:"
    read -r GITHUB_CLIENT_SECRET

    # Update .env file
    sed -i.bak "s/GITHUB_CLIENT_ID=.*/GITHUB_CLIENT_ID=$GITHUB_CLIENT_ID/" backend/.env
    sed -i.bak "s/GITHUB_CLIENT_SECRET=.*/GITHUB_CLIENT_SECRET=$GITHUB_CLIENT_SECRET/" backend/.env
    rm backend/.env.bak

    echo -e "${GREEN}✅ Updated backend/.env with OAuth credentials${NC}"
else
    echo -e "${GREEN}✅ backend/.env already exists${NC}"
fi

echo ""

# Step 2: Start Docker containers
echo -e "${BLUE}🐳 Starting Docker containers...${NC}"
docker-compose up -d

echo -e "${GREEN}✅ Docker containers started${NC}"
echo ""

# Wait for services to be ready
echo -e "${BLUE}⏳ Waiting for services to be ready...${NC}"
sleep 5

# Check if backend is responding
MAX_RETRIES=30
RETRY_COUNT=0
until curl -s http://localhost:3000/health > /dev/null 2>&1; do
    RETRY_COUNT=$((RETRY_COUNT+1))
    if [ $RETRY_COUNT -ge $MAX_RETRIES ]; then
        echo -e "${RED}❌ Backend failed to start. Check logs with: docker-compose logs backend${NC}"
        exit 1
    fi
    echo -e "${YELLOW}⏳ Waiting for backend... (attempt $RETRY_COUNT/$MAX_RETRIES)${NC}"
    sleep 2
done

echo -e "${GREEN}✅ Backend is ready${NC}"
echo ""

# Step 3: Setup example app
echo -e "${BLUE}📦 Installing example app dependencies...${NC}"
cd example

if [ ! -d "node_modules" ]; then
    npm install
    echo -e "${GREEN}✅ Dependencies installed${NC}"
else
    echo -e "${GREEN}✅ Dependencies already installed${NC}"
fi

echo ""
echo -e "${GREEN}🎉 Setup Complete!${NC}"
echo ""
echo -e "${BLUE}Next steps:${NC}"
echo ""
echo "1. Start the example app:"
echo -e "   ${YELLOW}cd $PROJECT_DIR/example${NC}"
echo -e "   ${YELLOW}npm run dev${NC}"
echo ""
echo "2. Open browser: ${YELLOW}http://localhost:5173${NC}"
echo ""
echo "3. Click 'Login with GitHub' and test the commenting!"
echo ""
echo -e "${BLUE}To view backend logs:${NC}"
echo -e "   ${YELLOW}docker-compose logs -f backend${NC}"
echo ""
echo -e "${BLUE}To stop services:${NC}"
echo -e "   ${YELLOW}docker-compose down${NC}"
echo ""

#!/bin/bash

# Script to update GitHub repository with current code
# This script will:
# 1. Ask for GitHub repository details
# 2. Set up git credentials
# 3. Clone the repository
# 4. Update with current files
# 5. Commit and push

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[0;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

echo -e "${BLUE}=== URL Redirector GitHub Update Tool ===${NC}"
echo -e "${BLUE}This tool will update your GitHub repository with the latest code from this project.${NC}"
echo ""

# Get GitHub details from the user
read -p "Enter your GitHub repository URL (e.g., https://github.com/username/repo.git): " REPO_URL
read -p "Enter your GitHub username: " GITHUB_USERNAME
read -p "Enter your GitHub email: " GITHUB_EMAIL
read -p "Enter a commit message (optional, press Enter for default): " COMMIT_MESSAGE

# Use default commit message if none provided
if [ -z "$COMMIT_MESSAGE" ]; then
    COMMIT_MESSAGE="Update URL Redirector with latest changes ($(date))"
fi

echo ""
echo -e "${YELLOW}Starting GitHub repository update...${NC}"

# Check if git is installed
if ! command -v git &> /dev/null; then
    echo -e "${YELLOW}Git not found. Installing git...${NC}"
    apt-get update && apt-get install -y git
fi

# Set git credentials
git config --global user.name "$GITHUB_USERNAME"
git config --global user.email "$GITHUB_EMAIL"

# Create a temporary directory for the repo
TEMP_DIR="$(mktemp -d)"
echo -e "${YELLOW}Created temporary directory: $TEMP_DIR${NC}"

# Clone the repository
echo -e "${YELLOW}Cloning repository...${NC}"
git clone "$REPO_URL" "$TEMP_DIR"

if [ $? -ne 0 ]; then
    echo -e "${RED}Failed to clone repository. Please check your repository URL and ensure you have access.${NC}"
    
    # Ask for GitHub personal access token
    echo -e "${YELLOW}You may need to use a personal access token to authenticate.${NC}"
    read -p "Would you like to try with a personal access token? (y/n): " USE_TOKEN
    
    if [[ "$USE_TOKEN" == "y" || "$USE_TOKEN" == "Y" ]]; then
        read -sp "Enter your GitHub personal access token: " GITHUB_TOKEN
        echo ""
        
        # Recreate the URL with token
        REPO_URL_WITH_TOKEN=$(echo "$REPO_URL" | sed -E "s#https://(.*)#https://$GITHUB_USERNAME:$GITHUB_TOKEN@\1#")
        
        echo -e "${YELLOW}Trying again with token authentication...${NC}"
        git clone "$REPO_URL_WITH_TOKEN" "$TEMP_DIR"
        
        if [ $? -ne 0 ]; then
            echo -e "${RED}Failed to clone repository with token. Please check your credentials and repository access.${NC}"
            exit 1
        fi
    else
        exit 1
    fi
fi

# Clear out existing files (except .git directory and specific files you want to keep)
echo -e "${YELLOW}Clearing existing files...${NC}"
find "$TEMP_DIR" -mindepth 1 -maxdepth 1 -not -name ".git" -not -name "README.md" -not -name "LICENSE" -exec rm -rf {} \;

# Copy current project files to the repository directory
echo -e "${YELLOW}Copying current project files...${NC}"

# Exclude node_modules, .git, and any other directories/files you don't want to copy
rsync -av --progress . "$TEMP_DIR" --exclude node_modules --exclude .git --exclude .env --exclude update-github.sh --exclude ".*" --exclude tmp

# Go to the repository directory
cd "$TEMP_DIR"

# Add all files
git add -A

# Check if there are changes to commit
if git diff --staged --quiet; then
    echo -e "${YELLOW}No changes to commit.${NC}"
else
    # Commit changes
    echo -e "${YELLOW}Committing changes...${NC}"
    git commit -m "$COMMIT_MESSAGE"

    # Push changes
    echo -e "${YELLOW}Pushing changes to repository...${NC}"
    
    # Try to push, and if it fails due to auth, try with token
    if ! git push; then
        echo -e "${YELLOW}Push failed. You may need to authenticate.${NC}"
        read -p "Would you like to try with a personal access token? (y/n): " USE_TOKEN
        
        if [[ "$USE_TOKEN" == "y" || "$USE_TOKEN" == "Y" ]]; then
            read -sp "Enter your GitHub personal access token: " GITHUB_TOKEN
            echo ""
            
            # Set remote URL with token
            REPO_URL_WITH_TOKEN=$(echo "$REPO_URL" | sed -E "s#https://(.*)#https://$GITHUB_USERNAME:$GITHUB_TOKEN@\1#")
            git remote set-url origin "$REPO_URL_WITH_TOKEN"
            
            echo -e "${YELLOW}Trying again with token authentication...${NC}"
            if ! git push; then
                echo -e "${RED}Failed to push changes with token. Please check your credentials and repository access.${NC}"
                exit 1
            fi
        else
            echo -e "${RED}Failed to push changes. Please check your credentials and repository access.${NC}"
            exit 1
        fi
    fi
fi

echo -e "${GREEN}Successfully updated GitHub repository!${NC}"

# Clean up
echo -e "${YELLOW}Cleaning up...${NC}"
cd - > /dev/null
rm -rf "$TEMP_DIR"

echo -e "${GREEN}✓ All done! Your GitHub repository has been updated with the latest code.${NC}"
echo -e "${BLUE}Thank you for using URL Redirector GitHub Update Tool!${NC}"
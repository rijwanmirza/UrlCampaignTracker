# GitHub Repository Update Instructions

This document explains how to update your GitHub repository with the latest code from this project.

## Using the Update Script

We've created a convenient script that automates the entire process of updating your GitHub repository. The script will:

1. Clone your repository
2. Clear existing files (preserving important ones like README and LICENSE)
3. Copy all current project files (excluding node_modules and config files)
4. Commit and push the changes to your repository

### Step 1: Run the Script

```bash
./update-github.sh
```

### Step 2: Follow the Prompts

The script will ask you for the following information:

- **GitHub Repository URL**: The full URL of your GitHub repository (e.g., https://github.com/yourusername/your-repo.git)
- **GitHub Username**: Your GitHub username
- **GitHub Email**: The email associated with your GitHub account
- **Commit Message**: A message describing the changes (optional)

### Step 3: Authentication

If the script fails to authenticate, it will offer you the option to use a personal access token:

1. Go to GitHub → Settings → Developer settings → Personal access tokens
2. Generate a new token with the `repo` scope
3. Enter this token when prompted by the script

## Manual Update Process

If you prefer to update your repository manually, follow these steps:

1. Clone your repository:
   ```bash
   git clone https://github.com/yourusername/your-repo.git
   ```

2. Remove existing files (except .git, README.md, LICENSE):
   ```bash
   find your-repo -mindepth 1 -maxdepth 1 -not -name ".git" -not -name "README.md" -not -name "LICENSE" -exec rm -rf {} \;
   ```

3. Copy the current project files:
   ```bash
   rsync -av --progress . your-repo/ --exclude node_modules --exclude .git --exclude .env --exclude ".*"
   ```

4. Commit and push the changes:
   ```bash
   cd your-repo
   git add -A
   git commit -m "Update application with latest changes"
   git push
   ```

## Troubleshooting

### Authentication Issues

If you encounter authentication problems:

1. Make sure you have the correct GitHub username and password
2. Use a personal access token instead of your password
3. Check that you have write access to the repository

### Push Errors

If you see errors when pushing:

1. Make sure your repository exists and the URL is correct
2. Check that you haven't made changes directly on GitHub that would cause conflicts
3. Try using `git push -f` to force push (use with caution)

## Contact

If you continue to experience issues, please contact the developer for assistance.
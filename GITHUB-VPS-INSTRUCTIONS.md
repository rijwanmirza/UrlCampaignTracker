# How to Migrate from Replit to VPS via GitHub

This guide explains how to use the `github-vps-migrate.sh` script to migrate your URL Management System from Replit to your VPS without manually uploading any files.

## Prerequisites

Before starting, you need:

1. A GitHub account
2. A GitHub personal access token (classic) with `repo` scope
3. An empty GitHub repository (or one you can overwrite)
4. A fresh Ubuntu 22.04 VPS with root access

## Step 1: Create GitHub Repository

1. Go to https://github.com/new
2. Enter a repository name (e.g., `url-management-system`)
3. Make it **private** to keep your code secure
4. Click "Create repository" without adding any files

## Step 2: Create GitHub Token

1. Go to https://github.com/settings/tokens/new
2. Give it a name like "URL Management System Migration"
3. Select the `repo` scope (full control of private repositories)
4. Click "Generate token"
5. **Copy the token immediately** - you won't be able to see it again

## Step 3: Run the Migration Script

In your Replit shell, run:

```bash
./github-vps-migrate.sh <GITHUB_USERNAME> <REPO_NAME> <VPS_IP> [SSH_PORT] [SSH_USER]
```

For example:

```bash
./github-vps-migrate.sh johndoe url-management-system 123.45.67.89
```

When prompted, paste your GitHub personal access token.

## What the Script Does

The migration script performs these steps automatically:

1. **On Replit:**
   - Initializes a Git repository
   - Exports your database to an SQL file
   - Commits all your code and configuration
   - Pushes everything to your GitHub repository

2. **On your VPS:**
   - Installs all required software (Node.js, PostgreSQL, Nginx)
   - Clones your repository from GitHub
   - Sets up the database and imports all your data
   - Configures environment variables
   - Builds and starts your application
   - Sets up Nginx as a reverse proxy

## After Migration

Your application will be:
- Running at `http://<YOUR_VPS_IP>`
- Set up as a system service that starts automatically
- Connected to a PostgreSQL database with all your data
- Configured with Nginx for optimal performance

## Troubleshooting

If you encounter any issues:

1. **On your VPS**, check the application logs:
   ```
   journalctl -u url-management
   ```

2. **On your VPS**, check the Nginx logs:
   ```
   cat /var/log/nginx/error.log
   ```

3. **Restart the application:**
   ```
   systemctl restart url-management
   ```
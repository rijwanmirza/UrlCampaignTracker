#!/bin/bash

# Project Cleanup Script
# This script will remove all unnecessary files from the project

echo "Starting cleanup process..."

# Keep only these essential files
KEEP_FILES=(
  # Core configuration files
  "package.json"
  "package-lock.json"
  "tsconfig.json"
  "vite.config.ts"
  "drizzle.config.ts"
  "tailwind.config.ts"
  "postcss.config.js"
  "theme.json"
  ".env"
  
  # Assets and documentation
  "README.md"
  "generated-icon.png"
  
  # Gmail configuration (important for application functionality)
  "gmail_config.json"
  "gmail_credentials.json"
  "gmail_token.json"
)

# Delete all *.sh files except this cleanup script
echo "Removing fix scripts and deployment guides..."
find . -maxdepth 1 -name "*.sh" -type f -not -name "cleanup.sh" -exec rm -f {} \;

# Delete test files
echo "Removing test files..."
find . -maxdepth 1 -name "test-*.js" -type f -exec rm -f {} \;
find . -maxdepth 1 -name "test-*.cjs" -type f -exec rm -f {} \;

# Delete VPS deployment guides
echo "Removing VPS deployment guides..."
rm -f VPS-SETUP-INSTRUCTIONS.md
rm -f GITHUB_UPDATE_INSTRUCTIONS.md
rm -f quick-update-instructions.md

# Delete SQL dumps and backups
echo "Removing SQL dumps and backups (make sure your database is already set up)..."
rm -f data.sql
rm -f dump.sql
rm -f schema.sql
rm -f replit_db_backup.sql
rm -f url-campaign-database.sql

# Delete other utility files that are no longer needed
echo "Removing utility files..."
rm -f apply-click-protection.js
rm -f frontend-update-code.js
rm -f setup-gmail-config.ts
rm -f processed_emails.log

echo "Cleanup complete!"
echo "Your project now only contains essential files for running the application."
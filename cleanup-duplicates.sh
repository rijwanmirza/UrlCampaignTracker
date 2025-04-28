#!/bin/bash

# Script to clean up duplicate files in the codebase
echo "Starting duplicate file cleanup..."

# Backup files before deleting them
BACKUP_DIR="./duplicate-backups"
mkdir -p "$BACKUP_DIR"

# 1. Fix duplicate UI components
echo "Cleaning up duplicate UI components..."

# 1a. Handle navbar duplicates - Keep new-navbar.tsx
if [ -f "client/src/components/layout/navbar.tsx" ] && [ -f "client/src/components/layout/new-navbar.tsx" ]; then
  echo "  ✓ Backing up old navbar.tsx to duplicates folder"
  cp "client/src/components/layout/navbar.tsx" "$BACKUP_DIR/navbar.tsx.bak"
  rm "client/src/components/layout/navbar.tsx"
  
  echo "  ✓ Renaming new-navbar.tsx to navbar.tsx"
  mv "client/src/components/layout/new-navbar.tsx" "client/src/components/layout/navbar.tsx"
fi

# 1b. Handle campaign-details duplicates - Keep campaign-details-new.tsx
if [ -f "client/src/components/campaigns/campaign-details.tsx" ] && [ -f "client/src/components/campaigns/campaign-details-new.tsx" ]; then
  echo "  ✓ Backing up old campaign-details.tsx to duplicates folder"
  cp "client/src/components/campaigns/campaign-details.tsx" "$BACKUP_DIR/campaign-details.tsx.bak"
  rm "client/src/components/campaigns/campaign-details.tsx"
  
  echo "  ✓ Renaming campaign-details-new.tsx to campaign-details.tsx"
  mv "client/src/components/campaigns/campaign-details-new.tsx" "client/src/components/campaigns/campaign-details.tsx"
fi

# 2. Fix duplicate pages
echo "Cleaning up duplicate pages..."

# 2a. Handle login duplicates - Keep login-page.tsx
if [ -f "client/src/pages/login.tsx" ] && [ -f "client/src/pages/login-page.tsx" ]; then
  echo "  ✓ Backing up old login.tsx to duplicates folder"
  cp "client/src/pages/login.tsx" "$BACKUP_DIR/login.tsx.bak"
  rm "client/src/pages/login.tsx"
fi

# 3. Fix duplicate hooks
echo "Cleaning up duplicate hooks..."

# 3a. Handle use-mobile duplicates - Keep use-mobile.ts
if [ -f "client/src/hooks/use-mobile.ts" ] && [ -f "client/src/hooks/use-mobile.tsx" ]; then
  echo "  ✓ Backing up use-mobile.tsx to duplicates folder"
  cp "client/src/hooks/use-mobile.tsx" "$BACKUP_DIR/use-mobile.tsx.bak"
  rm "client/src/hooks/use-mobile.tsx"
fi

# 4. Fix import statements that might be affected by the renames
echo "Updating import statements..."

# Function to update imports in all .ts and .tsx files
function update_imports() {
  local OLD_IMPORT=$1
  local NEW_IMPORT=$2
  
  find ./client/src -type f -name "*.ts" -o -name "*.tsx" | xargs grep -l "$OLD_IMPORT" | xargs -I{} sed -i "s|$OLD_IMPORT|$NEW_IMPORT|g" {}
}

# Update navbar imports
update_imports "@/components/layout/new-navbar" "@/components/layout/navbar"

# Update campaign-details imports
update_imports "@/components/campaigns/campaign-details-new" "@/components/campaigns/campaign-details"

# Update login page imports
update_imports "from \"@/pages/login\"" "from \"@/pages/login-page\""
update_imports "component={Login}" "component={LoginPage}"

echo "Cleanup complete! Duplicates have been backed up to $BACKUP_DIR"
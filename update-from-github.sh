#!/bin/bash

# Update URL Campaign Tracker from GitHub
# This script makes a backup of the existing site and updates it from GitHub

# Text formatting
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Configuration - MODIFY THESE VALUES IF NEEDED
APP_DIR="/var/www/url-campaign"
DB_USER="postgres"
DB_NAME="postgres"
PM2_APP_NAME="url-campaign"
GITHUB_REPO="https://github.com/rijwanmirza/UrlCampaignTracker.git"
BACKUP_DIR="/root/url-campaign-backup-$(date +%Y%m%d%H%M%S)"

echo -e "${BLUE}╔══════════════════════════════════════════════════════════════╗${NC}"
echo -e "${BLUE}║         URL CAMPAIGN TRACKER - GITHUB UPDATE                 ║${NC}"
echo -e "${BLUE}╚══════════════════════════════════════════════════════════════╝${NC}"
echo

# Verify configuration
echo -e "${YELLOW}📋 CURRENT CONFIGURATION:${NC}"
echo -e "🔹 Application directory: ${BLUE}$APP_DIR${NC}"
echo -e "🔹 Database user: ${BLUE}$DB_USER${NC}"
echo -e "🔹 Database name: ${BLUE}$DB_NAME${NC}"
echo -e "🔹 PM2 app name: ${BLUE}$PM2_APP_NAME${NC}"
echo -e "🔹 GitHub repo: ${BLUE}$GITHUB_REPO${NC}"
echo -e "🔹 Backup directory: ${BLUE}$BACKUP_DIR${NC}"
echo

read -p "Is this configuration correct? (y/n): " CONFIRM
if [[ $CONFIRM != "y" && $CONFIRM != "Y" ]]; then
  echo -e "${RED}Configuration not confirmed. Exiting.${NC}"
  exit 1
fi

echo -e "${YELLOW}Starting update process...${NC}"
echo

# Step 1: Create backup of the current application
echo -e "${YELLOW}📦 Creating backup of the current application...${NC}"
mkdir -p $BACKUP_DIR
if [ -d "$APP_DIR" ]; then
  cp -r $APP_DIR/* $BACKUP_DIR/
  echo -e "${GREEN}✓ Application backed up to $BACKUP_DIR${NC}"
else
  echo -e "${RED}⚠️ Application directory not found at $APP_DIR${NC}"
  exit 1
fi

# Step 2: Create a database backup
echo -e "${YELLOW}🗃️ Creating database backup...${NC}"
DB_BACKUP_FILE="$BACKUP_DIR/database-$(date +%Y%m%d%H%M%S).sql"
sudo -u $DB_USER pg_dump $DB_NAME > $DB_BACKUP_FILE
if [ $? -eq 0 ]; then
  echo -e "${GREEN}✓ Database backup created at $DB_BACKUP_FILE${NC}"
else
  echo -e "${RED}⚠️ Failed to create database backup${NC}"
  echo -e "${YELLOW}Continuing with update, but be aware that database restoration might not be possible${NC}"
fi

# Step 3: Stop the application
echo -e "${YELLOW}🛑 Stopping application...${NC}"
pm2 stop $PM2_APP_NAME
if [ $? -eq 0 ]; then
  echo -e "${GREEN}✓ Application stopped${NC}"
else
  echo -e "${RED}⚠️ Failed to stop application. Continuing anyway...${NC}"
fi

# Step 4: Create a temp directory for the new code
echo -e "${YELLOW}📥 Cloning the latest code from GitHub...${NC}"
TEMP_DIR="/tmp/url-campaign-update-$(date +%Y%m%d%H%M%S)"
mkdir -p $TEMP_DIR

git clone $GITHUB_REPO $TEMP_DIR
if [ $? -ne 0 ]; then
  echo -e "${RED}⚠️ Failed to clone repository${NC}"
  echo -e "${YELLOW}Restoring from backup...${NC}"
  pm2 start $PM2_APP_NAME
  exit 1
fi
echo -e "${GREEN}✓ Repository cloned successfully${NC}"

# Step 5: Copy configuration files from existing app to the new code
echo -e "${YELLOW}📋 Preserving configuration files...${NC}"
CONFIG_FILES=(
  ".env"
  "gmail_config.json"
  "gmail_credentials.json"
  "gmail_token.json"
)

for file in "${CONFIG_FILES[@]}"; do
  if [ -f "$APP_DIR/$file" ]; then
    echo -e "Copying $file"
    cp "$APP_DIR/$file" "$TEMP_DIR/$file"
  fi
done
echo -e "${GREEN}✓ Configuration files preserved${NC}"

# Step 6: Install dependencies in the new code
echo -e "${YELLOW}📦 Installing dependencies...${NC}"
cd $TEMP_DIR
npm install
if [ $? -ne 0 ]; then
  echo -e "${RED}⚠️ Failed to install dependencies${NC}"
  echo -e "${YELLOW}Restoring from backup...${NC}"
  pm2 start $PM2_APP_NAME
  exit 1
fi
echo -e "${GREEN}✓ Dependencies installed${NC}"

# Step 7: Build the application
echo -e "${YELLOW}🔨 Building application...${NC}"
npm run build
if [ $? -ne 0 ]; then
  echo -e "${RED}⚠️ Build failed${NC}"
  echo -e "${YELLOW}Restoring from backup...${NC}"
  pm2 start $PM2_APP_NAME
  exit 1
fi
echo -e "${GREEN}✓ Build completed${NC}"

# Step 8: Create any missing database tables if needed
echo -e "${YELLOW}🗃️ Checking for database schema updates...${NC}"

# First check if there are SQL files to run
if [ -f "$TEMP_DIR/schema.sql" ]; then
  echo -e "Found schema.sql, applying changes..."
  sudo -u $DB_USER psql $DB_NAME < "$TEMP_DIR/schema.sql"
fi

if [ -f "$TEMP_DIR/migrations/click_protection.sql" ]; then
  echo -e "Found click_protection.sql, applying changes..."
  sudo -u $DB_USER psql $DB_NAME < "$TEMP_DIR/migrations/click_protection.sql"
fi

# Check for the original_url_records table
echo -e "Ensuring original_url_records table exists..."
ORIGINAL_RECORDS_SQL="$TEMP_DIR/create-original-records.sql"

cat > $ORIGINAL_RECORDS_SQL << 'EOF'
-- Create original_url_records table if it doesn't exist
CREATE TABLE IF NOT EXISTS original_url_records (
  id SERIAL PRIMARY KEY,
  name TEXT NOT NULL,
  target_url TEXT NOT NULL,
  click_limit INTEGER NOT NULL DEFAULT 0,
  clicks INTEGER NOT NULL DEFAULT 0,
  status TEXT NOT NULL DEFAULT 'active',
  notes TEXT,
  created_at TIMESTAMP NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMP NOT NULL DEFAULT NOW()
);

-- Create index on name for faster lookups
CREATE INDEX IF NOT EXISTS original_url_records_name_idx ON original_url_records (name);
EOF

sudo -u $DB_USER psql $DB_NAME < $ORIGINAL_RECORDS_SQL
echo -e "${GREEN}✓ Database schema checks completed${NC}"

# Step 9: Apply click protection triggers
echo -e "${YELLOW}🛡️ Ensuring click protection is active...${NC}"
CLICK_PROTECTION_SQL="$TEMP_DIR/ensure-click-protection.sql"

cat > $CLICK_PROTECTION_SQL << 'EOF'
-- Create system_settings table if it doesn't exist
CREATE TABLE IF NOT EXISTS system_settings (
  key TEXT PRIMARY KEY,
  value TEXT,
  created_at TIMESTAMP NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMP NOT NULL DEFAULT NOW()
);

-- Update click protection status
INSERT INTO system_settings (key, value, created_at, updated_at)
VALUES ('click_protection_trigger', 'Applied on ' || NOW(), NOW(), NOW())
ON CONFLICT (key) DO UPDATE
  SET value = 'Applied on ' || NOW(),
      updated_at = NOW();

-- Create or replace the click protection function
CREATE OR REPLACE FUNCTION protect_url_clicks()
RETURNS TRIGGER AS $$
BEGIN
  -- Only allow the trigger to be bypassed with ALTER TABLE disable trigger statement
  -- This function prevents any SQL UPDATE statement from changing click_limit directly

  -- Log the attempted change
  RAISE NOTICE 'Attempted change to URL clicks blocked: id=%, old_limit=%, new_limit=%', 
                NEW.id, OLD.click_limit, NEW.click_limit;

  -- Keep the original click_limit value
  NEW.click_limit = OLD.click_limit;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Drop and recreate the trigger
DROP TRIGGER IF EXISTS url_clicks_protection_trigger ON urls;
CREATE TRIGGER url_clicks_protection_trigger
BEFORE UPDATE OF click_limit ON urls
FOR EACH ROW
EXECUTE FUNCTION protect_url_clicks();
EOF

sudo -u $DB_USER psql $DB_NAME < $CLICK_PROTECTION_SQL
echo -e "${GREEN}✓ Click protection ensured${NC}"

# Step 10: Replace the old application with the new one
echo -e "${YELLOW}🔄 Replacing old application with new code...${NC}"
# Preserve any uploads directory if it exists
if [ -d "$APP_DIR/uploads" ]; then
  echo -e "Preserving uploads directory..."
  mkdir -p "$TEMP_DIR/uploads"
  cp -r "$APP_DIR/uploads"/* "$TEMP_DIR/uploads/"
fi

# Make sure the application directory exists
mkdir -p $APP_DIR

# Remove old files except for node_modules to save time
find $APP_DIR -type f -not -path "*/node_modules/*" -delete

# Copy new files
cp -r $TEMP_DIR/* $APP_DIR/
echo -e "${GREEN}✓ Application files updated${NC}"

# Step 11: Start the application
echo -e "${YELLOW}🚀 Starting application...${NC}"
cd $APP_DIR
pm2 start $PM2_APP_NAME
if [ $? -ne 0 ]; then
  echo -e "${RED}⚠️ Failed to start application directly, attempting alternative method...${NC}"

  # Try to start it using ecosystem file if it exists
  if [ -f "$APP_DIR/ecosystem.config.js" ]; then
    pm2 start ecosystem.config.js
  elif [ -f "$APP_DIR/ecosystem.config.cjs" ]; then
    pm2 start ecosystem.config.cjs
  else
    # Try to start the main file directly
    pm2 start server/index.js --name $PM2_APP_NAME
  fi

  if [ $? -ne 0 ]; then
    echo -e "${RED}⚠️ All startup methods failed${NC}"
    echo -e "${YELLOW}Restoring from backup...${NC}"

    # Restore from backup
    rm -rf $APP_DIR/*
    cp -r $BACKUP_DIR/* $APP_DIR/
    pm2 start $PM2_APP_NAME

    echo -e "${RED}⚠️ Update failed, application restored from backup${NC}"
    exit 1
  fi
fi

# Save PM2 configuration
pm2 save
echo -e "${GREEN}✓ Application started${NC}"

# Step 12: Clean up
echo -e "${YELLOW}🧹 Cleaning up...${NC}"
rm -rf $TEMP_DIR
echo -e "${GREEN}✓ Temporary files removed${NC}"

# Final message
echo -e "${BLUE}╔══════════════════════════════════════════════════════════════╗${NC}"
echo -e "${BLUE}║              UPDATE COMPLETED SUCCESSFULLY                   ║${NC}"
echo -e "${BLUE}╚══════════════════════════════════════════════════════════════╝${NC}"
echo
echo -e "${GREEN}The URL Campaign Tracker has been updated from GitHub.${NC}"
echo -e "${GREEN}Features included in this update:${NC}"
echo -e "✓ Click protection to prevent automatic click quantity changes"
echo -e "✓ Original URL Records feature for master URL data management"
echo -e "✓ Unlimited click quantity validation (limits removed)"
echo
echo -e "${YELLOW}If you encounter any issues:${NC}"
echo -e "1. Check PM2 logs: ${BLUE}pm2 logs $PM2_APP_NAME${NC}"
echo -e "2. Restore from backup: ${BLUE}cp -r $BACKUP_DIR/* $APP_DIR/${NC}"
echo -e "3. Restore database: ${BLUE}sudo -u $DB_USER psql $DB_NAME < $DB_BACKUP_FILE${NC}"
echo
echo -e "${GREEN}Backup files:${NC}"
echo -e "- Application: ${BLUE}$BACKUP_DIR${NC}"
echo -e "- Database: ${BLUE}$DB_BACKUP_FILE${NC}"
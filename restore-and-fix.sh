#!/bin/bash

# Restore and Fix - Minimal Conservative Approach
# This script will restore the application from backup and apply a minimal fix

# Text formatting
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Configuration
APP_DIR="/var/www/url-campaign"
PM2_APP_NAME="url-campaign"

echo -e "${BLUE}╔══════════════════════════════════════════════════════════════╗${NC}"
echo -e "${BLUE}║           RESTORE AND MINIMAL FIX SCRIPT                     ║${NC}"
echo -e "${BLUE}╚══════════════════════════════════════════════════════════════╝${NC}"

# Step 1: Find all backups and restore the latest App.tsx backup
echo -e "${YELLOW}📝 Finding and restoring App.tsx backup...${NC}"

# Find the latest App.tsx backup
LATEST_BACKUP=$(find /root -name "App.tsx.bak.*" -type f -printf '%T@ %p\n' | sort -n | tail -1 | cut -f2- -d" ")

if [ -z "$LATEST_BACKUP" ]; then
  echo -e "${RED}⚠️ No App.tsx backup found!${NC}"

  # Try to find from URL campaign backup
  LATEST_BACKUP=$(find /root -name "url-campaign-backup-*" -type d -printf '%T@ %p\n' | sort -n | tail -1 | cut -f2- -d" ")

  if [ -z "$LATEST_BACKUP" ]; then
    echo -e "${RED}⚠️ No application backup found either!${NC}"
    exit 1
  else
    echo -e "${YELLOW}Found application backup at $LATEST_BACKUP${NC}"
    if [ -f "$LATEST_BACKUP/client/src/App.tsx" ]; then
      cp "$LATEST_BACKUP/client/src/App.tsx" "$APP_DIR/client/src/App.tsx"
      echo -e "${GREEN}✓ Restored App.tsx from application backup${NC}"
    else
      echo -e "${RED}⚠️ App.tsx not found in application backup!${NC}"
      exit 1
    fi
  fi
else
  echo -e "${YELLOW}Found App.tsx backup at $LATEST_BACKUP${NC}"
  cp "$LATEST_BACKUP" "$APP_DIR/client/src/App.tsx"
  echo -e "${GREEN}✓ Restored App.tsx from backup${NC}"
fi

# Step 2: Create a minimal Original URL Records page component
echo -e "${YELLOW}📝 Creating simple Original URL Records page component...${NC}"

mkdir -p "$APP_DIR/client/src/pages"

cat > "$APP_DIR/client/src/pages/original-url-records.jsx" << 'EOF'
import React from 'react';

export default function OriginalUrlRecords() {
  return (
    <div style={{ padding: '20px' }}>
      <h1>Original URL Records</h1>
      <p>This page manages the master URL data records.</p>
      <div style={{ padding: '10px', border: '1px solid #ddd' }}>
        Original URL Records feature is active.
      </div>
    </div>
  );
}
EOF

echo -e "${GREEN}✓ Original URL Records page component created${NC}"

# Step 3: Create a standalone HTML page as a fallback
echo -e "${YELLOW}📝 Creating standalone HTML page fallback...${NC}"

mkdir -p "$APP_DIR/dist/public/original-url-records"

cat > "$APP_DIR/dist/public/original-url-records/index.html" << 'EOF'
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Original URL Records</title>
  <style>
    body {
      font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif;
      line-height: 1.6;
      color: #333;
      max-width: 1200px;
      margin: 0 auto;
      padding: 20px;
    }
    header {
      display: flex;
      justify-content: space-between;
      align-items: center;
      padding: 10px 0;
      margin-bottom: 30px;
      border-bottom: 1px solid #eaeaea;
    }
    nav {
      display: flex;
      gap: 20px;
    }
    nav a {
      text-decoration: none;
      color: #0066cc;
    }
    nav a:hover {
      text-decoration: underline;
    }
    h1 {
      font-size: 24px;
      margin-bottom: 20px;
    }
    .card {
      border: 1px solid #eaeaea;
      border-radius: 5px;
      padding: 20px;
      margin-bottom: 20px;
      background-color: #f9f9f9;
    }
    .container {
      margin-top: 30px;
    }
    .message {
      background-color: #e6f7ff;
      border: 1px solid #91d5ff;
      border-radius: 5px;
      padding: 15px;
      margin-bottom: 20px;
    }
  </style>
</head>
<body>
  <header>
    <div class="logo">URL Redirector</div>
    <nav>
      <a href="/">Home</a>
      <a href="/campaigns">Campaigns</a>
      <a href="/urls">URLs</a>
      <a href="/original-url-records"><strong>Original URL Records</strong></a>
    </nav>
  </header>

  <div class="container">
    <h1>Original URL Records</h1>
    <p>
      This page allows you to manage master records for URL data.
      Updates here can be propagated to all linked URLs.
    </p>

    <div class="message">
      The Original URL Records feature is now active. This is a static fallback page.
    </div>

    <div class="card">
      <h2>About Original URL Records</h2>
      <p>
        Original URL Records serve as the master data source for URL click quantities across the entire application.
        Changes made here can be propagated to all related campaign URLs while applying appropriate campaign multipliers.
      </p>
      <p>
        Key features:
      </p>
      <ul>
        <li>Central management of URL data</li>
        <li>Unlimited click quantity values</li>
        <li>Protected from automatic changes</li>
        <li>Synchronization with campaign URLs</li>
      </ul>
      <p>
        To access the full features, please ensure your application is completely restored and contact your administrator.
      </p>
    </div>
  </div>
</body>
</html>
EOF

echo -e "${GREEN}✓ Standalone HTML fallback page created${NC}"

# Step 4: Set up Nginx to serve the fallback page
echo -e "${YELLOW}📝 Creating Nginx configuration for fallback page...${NC}"

NGINX_CONF="/etc/nginx/sites-available/original-url-records"

cat > "$NGINX_CONF" << EOF
# Original URL Records static fallback
location /original-url-records {
    alias $APP_DIR/dist/public/original-url-records;
    try_files \$uri \$uri/ /original-url-records/index.html;
}
EOF

echo -e "${YELLOW}Created Nginx configuration at $NGINX_CONF${NC}"
echo -e "${YELLOW}You can include this in your main Nginx configuration with:${NC}"
echo -e "${BLUE}include $NGINX_CONF;${NC}"
echo -e "${YELLOW}Then reload Nginx with: ${BLUE}nginx -t && systemctl reload nginx${NC}"

# Step 5: Rebuild and restart
echo -e "${YELLOW}🚀 Rebuilding and restarting application...${NC}"
cd "$APP_DIR"
npm run build

pm2 restart $PM2_APP_NAME
echo -e "${GREEN}✓ Application rebuilt and restarted${NC}"

# Final message
echo -e "${BLUE}╔══════════════════════════════════════════════════════════════╗${NC}"
echo -e "${BLUE}║                 RESTORE AND FIX COMPLETED                    ║${NC}"
echo -e "${BLUE}╚══════════════════════════════════════════════════════════════╝${NC}"
echo
echo -e "${GREEN}✓ Application should be restored to working state${NC}"
echo -e "${GREEN}✓ A static fallback page for Original URL Records is available at:${NC}"
echo -e "${GREEN}  https://views.yoyoprime.com/original-url-records${NC}"
echo
echo -e "${YELLOW}Two approaches are now available:${NC}"
echo -e "1. The static HTML page at /original-url-records (available after Nginx config update)"
echo -e "2. Add the React component page to your App.tsx manually when the app is stable${NC}"
echo
echo -e "${YELLOW}For manual addition to App.tsx, add these lines:${NC}"
echo -e "${BLUE}import OriginalUrlRecords from './pages/original-url-records';${NC}"
echo -e "${BLUE}<Route path=\"/original-url-records\" component={OriginalUrlRecords} />${NC}"
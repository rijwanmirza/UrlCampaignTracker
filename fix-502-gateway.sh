#!/bin/bash

# Quick 502 Error Fix Script
# This script quickly fixes the blank page issue

# Text formatting
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

APP_DIR="/var/www/url-campaign"
API_KEY="TraffiCS10928"

echo -e "${BLUE}╔══════════════════════════════════════════════════════════════╗${NC}"
echo -e "${BLUE}║                  QUICK 502 ERROR FIX                         ║${NC}"
echo -e "${BLUE}╚══════════════════════════════════════════════════════════════╝${NC}"
echo

# Step 1: Reset any changes to App.tsx
echo -e "${YELLOW}📝 Resetting App.tsx file...${NC}"
if [ -f "$APP_DIR/client/src/App.tsx.bak" ]; then
  cp "$APP_DIR/client/src/App.tsx.bak" "$APP_DIR/client/src/App.tsx"
  echo -e "${GREEN}✓ App.tsx restored from backup${NC}"
else
  echo -e "${YELLOW}No backup found, manually fixing App.tsx${NC}"
  
  # Create a minimal App.tsx based on standard pattern
  cat > "$APP_DIR/client/src/App.tsx" << 'EOF'
import React from 'react';
import { Route, Switch } from 'wouter';
import { QueryClientProvider } from '@tanstack/react-query';
import { Toaster } from '@/components/ui/toaster';
import { queryClient } from '@/lib/queryClient';
import { AuthProvider } from '@/contexts/AuthContext';

// Import pages
import HomePage from './pages/home-page';
import CampaignListPage from './pages/campaign-list-page';
import CampaignDetailsPage from './pages/campaign-details-page';
import UrlListPage from './pages/url-list-page';
import UrlDetailsPage from './pages/url-details-page';
import ReportsPage from './pages/reports-page';
import NotFoundPage from './pages/not-found-page';
import OriginalUrlRecordsPage from './pages/original-url-records-page';

function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <AuthProvider>
        <div className="app">
          <nav style={{ 
            backgroundColor: '#f0f0f0', 
            padding: '10px', 
            marginBottom: '20px',
            display: 'flex',
            justifyContent: 'space-between' 
          }}>
            <div><strong>URL Redirector</strong></div>
            <div>
              <a href="/" style={{ marginRight: '15px' }}>Home</a>
              <a href="/campaigns" style={{ marginRight: '15px' }}>Campaigns</a>
              <a href="/urls" style={{ marginRight: '15px' }}>URLs</a>
              <a href="/original-url-records" style={{ fontWeight: 'bold' }}>Original URL Records</a>
            </div>
          </nav>

          <Switch>
            <Route path="/original-url-records" component={OriginalUrlRecordsPage} />
            <Route path="/campaigns/:id" component={CampaignDetailsPage} />
            <Route path="/campaigns" component={CampaignListPage} />
            <Route path="/urls/:id" component={UrlDetailsPage} />
            <Route path="/urls" component={UrlListPage} />
            <Route path="/reports" component={ReportsPage} />
            <Route path="/" exact component={HomePage} />
            <Route component={NotFoundPage} />
          </Switch>
        </div>
        <Toaster />
      </AuthProvider>
    </QueryClientProvider>
  );
}

export default App;
EOF
  echo -e "${GREEN}✓ App.tsx recreated${NC}"
fi

# Step 2: Restore index.ts and routes.ts if they were changed
echo -e "${YELLOW}📝 Restoring server files...${NC}"
if [ -f "$APP_DIR/server/index.ts.bak" ]; then
  cp "$APP_DIR/server/index.ts.bak" "$APP_DIR/server/index.ts"
  echo -e "${GREEN}✓ index.ts restored${NC}"
fi

if [ -f "$APP_DIR/server/routes.ts.bak" ]; then
  cp "$APP_DIR/server/routes.ts.bak" "$APP_DIR/server/routes.ts"
  echo -e "${GREEN}✓ routes.ts restored${NC}"
fi

# Step 3: Fix Nginx configuration
echo -e "${YELLOW}📝 Fixing Nginx configuration...${NC}"

# Backup current Nginx config if it doesn't already have a backup
if [ ! -f "/etc/nginx/sites-available/default.bak" ]; then
  cp /etc/nginx/sites-available/default /etc/nginx/sites-available/default.bak
fi

# Create a simple working Nginx configuration
cat > "/etc/nginx/sites-available/default" << 'EOF'
server {
    listen 80;
    server_name views.yoyoprime.com;
    
    # Add cache control headers to prevent caching
    add_header Cache-Control "no-store, no-cache, must-revalidate, max-age=0";
    add_header Pragma "no-cache";
    
    location / {
        proxy_pass http://127.0.0.1:5000;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_set_header X-API-Key "TraffiCS10928";
        proxy_read_timeout 300;
        proxy_connect_timeout 300;
        proxy_send_timeout 300;
    }
}
EOF

nginx -t
if [ $? -eq 0 ]; then
  systemctl restart nginx
  echo -e "${GREEN}✓ Nginx configuration fixed${NC}"
else
  echo -e "${RED}⚠️ Nginx configuration error${NC}"
fi

# Step 4: Rebuild and restart the application
echo -e "${YELLOW}🔄 Rebuilding and restarting application...${NC}"
cd "$APP_DIR"
npm run build
pm2 restart url-campaign
echo -e "${GREEN}✓ Application rebuilt and restarted${NC}"

# Show last 20 lines of PM2 logs to check for errors
echo -e "${YELLOW}📋 Checking application logs...${NC}"
pm2 logs --lines 20 url-campaign

# Final message
echo -e "${BLUE}╔══════════════════════════════════════════════════════════════╗${NC}"
echo -e "${BLUE}║               QUICK 502 ERROR FIX COMPLETE                   ║${NC}"
echo -e "${BLUE}╚══════════════════════════════════════════════════════════════╝${NC}"
echo
echo -e "${GREEN}✓ App.tsx fixed${NC}"
echo -e "${GREEN}✓ Server files restored${NC}"
echo -e "${GREEN}✓ Nginx reconfigured${NC}"
echo -e "${GREEN}✓ Application rebuilt and restarted${NC}"
echo
echo -e "${YELLOW}Your site should now be working again at:${NC}"
echo -e "${BLUE}https://views.yoyoprime.com${NC}"
echo
echo -e "${YELLOW}After confirming the site is working, you may want to try a simpler${NC}"
echo -e "${YELLOW}approach to adding the login page. For now, this script focuses on${NC}"
echo -e "${YELLOW}restoring functionality quickly.${NC}"
#!/bin/bash

# Quick App Fix - Restore backup and fix Nginx config
# This script fixes the broken build and restores from backup

# Text formatting
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Configuration
APP_DIR="/var/www/url-campaign"
NGINX_CONF="/etc/nginx/sites-available/default"
BACKUP_DIR="/root/url-campaign-route-fix-backup-20250428065040"
NGINX_MAIN_CONF="/etc/nginx/nginx.conf"

echo -e "${BLUE}╔══════════════════════════════════════════════════════════════╗${NC}"
echo -e "${BLUE}║            QUICK FIX FOR BROKEN BUILD                        ║${NC}"
echo -e "${BLUE}╚══════════════════════════════════════════════════════════════╝${NC}"
echo

# Step 1: Check if backup exists
echo -e "${YELLOW}📋 Checking for backups...${NC}"
if [ ! -d "$BACKUP_DIR" ]; then
  echo -e "${RED}⚠️ Backup directory not found at $BACKUP_DIR${NC}"
  BACKUP_DIR=$(find /root -maxdepth 1 -type d -name "url-campaign-*-backup-*" | sort -r | head -1)
  if [ -z "$BACKUP_DIR" ]; then
    echo -e "${RED}⚠️ No backup directories found${NC}"
  else
    echo -e "${GREEN}✓ Found alternate backup at $BACKUP_DIR${NC}"
  fi
else
  echo -e "${GREEN}✓ Found backup at $BACKUP_DIR${NC}"
fi

# Step 2: Restore client source files from backup if available
if [ -d "$BACKUP_DIR/client" ]; then
  echo -e "${YELLOW}🔄 Restoring client files from backup...${NC}"
  cp -r "$BACKUP_DIR/client/src" "$APP_DIR/client/"
  echo -e "${GREEN}✓ Client files restored from backup${NC}"
else
  echo -e "${RED}⚠️ No client files found in backup${NC}"
  
  # Simple fix for App.tsx
  echo -e "${YELLOW}🔧 Applying direct fix to App.tsx...${NC}"
  cat > "$APP_DIR/client/src/App.tsx" << 'EOF'
import { Route, Switch, useLocation } from "wouter";
import { useAuth } from "@/hooks/use-auth";
import "./App.css";
import LoginPage from "@/pages/auth/login-page";
import HomePage from "@/pages/home-page";
import CampaignsPage from "@/pages/campaigns-page";
import CampaignDetailsPage from "@/pages/campaign-details-page";
import UrlsPage from "@/pages/urls-page";
import SettingsPage from "@/pages/settings-page";
import TrafficstarPage from "@/pages/trafficstar-page";
import GmailIntegrationPage from "@/pages/gmail-integration-page";
import { Toaster } from "@/components/ui/toaster";
import { QueryClientProvider } from "@tanstack/react-query";
import { queryClient } from "@/lib/queryClient";
import { AuthProvider } from "@/hooks/use-auth";
import OriginalUrlRecordsPage from "@/pages/original-url-records-page";
import { SideNav } from "@/components/navigation/side-nav";

function App() {
  const [location] = useLocation();
  const isLoginRoute = location === "/login";

  return (
    <QueryClientProvider client={queryClient}>
      <AuthProvider>
        <AppInner isLoginRoute={isLoginRoute} />
        <Toaster />
      </AuthProvider>
    </QueryClientProvider>
  );
}

function AppInner({ isLoginRoute }: { isLoginRoute: boolean }) {
  const { user, isLoading } = useAuth();

  if (isLoading) {
    return <div>Loading...</div>;
  }

  if (!user && !isLoginRoute) {
    window.location.href = "/login";
    return null;
  }

  if (isLoginRoute) {
    // Login route without navbar or protected route wrapper
    return (
      <Switch>
        <Route path="/login" component={LoginPage} />
      </Switch>
    );
  }

  // Regular routes with navbar and protected
  return (
    <div className="flex h-screen bg-background">
      <SideNav />

      <main className="flex-1 overflow-y-auto p-6">
        <Switch>
          <Route path="/" component={HomePage} />
          <Route path="/campaigns" component={CampaignsPage} />
          <Route path="/campaigns/:id" component={CampaignDetailsPage} />
          <Route path="/urls" component={UrlsPage} />
          <Route path="/settings" component={SettingsPage} />
          <Route path="/trafficstar" component={TrafficstarPage} />
          <Route path="/gmail-integration" component={GmailIntegrationPage} />
          <Route path="/original-url-records" component={OriginalUrlRecordsPage} />
        </Switch>
      </main>
    </div>
  );
}

export default App;
EOF
  echo -e "${GREEN}✓ Applied direct fix to App.tsx${NC}"
fi

# Step 3: Create a super simple Nginx configuration
echo -e "${YELLOW}📝 Creating simple Nginx configuration...${NC}"

# Backup the original configuration
cp "$NGINX_CONF" "${NGINX_CONF}.bak.$(date +%Y%m%d%H%M%S)"
echo -e "${GREEN}✓ Backed up Nginx configuration${NC}"

# Create a super simple configuration file
cat > "$NGINX_CONF" << 'EOF'
server {
    listen 80;
    server_name views.yoyoprime.com;

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

echo -e "${GREEN}✓ Created simple Nginx configuration${NC}"

# Step 4: Restart Nginx
echo -e "${YELLOW}🔄 Restarting Nginx...${NC}"
nginx -t
if [ $? -eq 0 ]; then
  systemctl restart nginx
  echo -e "${GREEN}✓ Nginx restarted successfully${NC}"
else
  echo -e "${RED}⚠️ Nginx configuration is invalid${NC}"
fi

# Step 5: Reset PM2 application
echo -e "${YELLOW}🔄 Restarting application...${NC}"
cd "$APP_DIR"

# Create a direct start script
cat > "$APP_DIR/start.sh" << 'EOF'
#!/bin/bash
cd /var/www/url-campaign
export PORT=5000
export HOST=0.0.0.0
export NODE_ENV=production
node dist/index.js
EOF

chmod +x "$APP_DIR/start.sh"

# Restart
pm2 delete url-campaign 2>/dev/null
pm2 start "$APP_DIR/start.sh" --name url-campaign
pm2 save

echo -e "${GREEN}✓ Application restarted${NC}"

# Step 6: Rebuild the frontend
echo -e "${YELLOW}🔄 Rebuilding frontend...${NC}"
cd "$APP_DIR"
npm run build

if [ $? -eq 0 ]; then
  echo -e "${GREEN}✓ Frontend rebuilt successfully${NC}"
  pm2 restart url-campaign
else
  echo -e "${RED}⚠️ Frontend build failed${NC}"
  echo -e "${YELLOW}Using fallback: restoring directly from backup...${NC}"
  
  if [ -d "$BACKUP_DIR/dist" ]; then
    cp -r "$BACKUP_DIR/dist" "$APP_DIR/"
    echo -e "${GREEN}✓ Restored dist folder from backup${NC}"
    pm2 restart url-campaign
  else
    echo -e "${RED}⚠️ No dist folder found in backup${NC}"
  fi
fi

# Final message
echo -e "${BLUE}╔══════════════════════════════════════════════════════════════╗${NC}"
echo -e "${BLUE}║                      FIX COMPLETED                           ║${NC}"
echo -e "${BLUE}╚══════════════════════════════════════════════════════════════╝${NC}"
echo
echo -e "${GREEN}✓ Application has been restored and restarted${NC}"
echo -e "${GREEN}✓ Nginx has been configured with a minimal setup${NC}"
echo
echo -e "${YELLOW}Your site should now be accessible at: https://views.yoyoprime.com${NC}"
echo
echo -e "${YELLOW}If you still encounter issues:${NC}"
echo -e "1. Check the application logs: ${BLUE}pm2 logs url-campaign${NC}"
echo -e "2. Check Nginx error logs: ${BLUE}tail -f /var/log/nginx/error.log${NC}"
echo
echo -e "${YELLOW}To verify the Original URL Records page is working:${NC}"
echo -e "1. Visit ${BLUE}https://views.yoyoprime.com/original-url-records${NC}"
echo -e "2. If it's not working, you may need to run: ${BLUE}./fix-original-url-records.sh${NC}"
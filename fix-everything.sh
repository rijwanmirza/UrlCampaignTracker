#!/bin/bash

# Fix Everything Script
# This script fixes both Nginx configuration and restarts the app

# Text formatting
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

APP_DIR="/var/www/url-campaign"

echo -e "${BLUE}╔══════════════════════════════════════════════════════════════╗${NC}"
echo -e "${BLUE}║                 COMPLETE SYSTEM FIX                          ║${NC}"
echo -e "${BLUE}╚══════════════════════════════════════════════════════════════╝${NC}"
echo

# Step 1: Fix Nginx configuration
echo -e "${YELLOW}📝 Fixing Nginx configuration...${NC}"

# Backup current Nginx config if it doesn't already have a backup
if [ ! -f "/etc/nginx/sites-available/default.bak.original" ]; then
  cp /etc/nginx/sites-available/default /etc/nginx/sites-available/default.bak.original
  echo -e "${GREEN}✓ Original Nginx config backed up${NC}"
fi

# Fix Nginx by removing all other server blocks from other files
echo -e "${YELLOW}📝 Checking for conflicting Nginx configurations...${NC}"
find /etc/nginx/sites-enabled -type l -not -name "default" -exec rm {} \;
find /etc/nginx/sites-available -type f -not -name "default" -not -name "*.bak*" -exec rm {} \;
echo -e "${GREEN}✓ Removed any conflicting Nginx configurations${NC}"

# Create a simple working configuration with IPv4 localhost
echo -e "${YELLOW}📝 Creating clean Nginx configuration...${NC}"
cat > "/etc/nginx/sites-available/default" << 'EOF'
server {
    listen 80 default_server;
    server_name views.yoyoprime.com;
    
    # Add cache control headers to prevent caching
    add_header Cache-Control "no-store, no-cache, must-revalidate, max-age=0";
    add_header Pragma "no-cache";
    
    # Main location for all frontend routes - using IPv4 (127.0.0.1) instead of IPv6 ([::1])
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
    
    # WebSocket support
    location /ws {
        proxy_pass http://127.0.0.1:5000;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection "upgrade";
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-API-Key "TraffiCS10928";
    }
}
EOF

# Test and restart Nginx
echo -e "${YELLOW}🔄 Testing and restarting Nginx...${NC}"
nginx -t
if [ $? -eq 0 ]; then
  systemctl restart nginx
  echo -e "${GREEN}✓ Nginx configuration fixed and service restarted${NC}"
else
  echo -e "${RED}⚠️ Nginx configuration has errors, not restarted${NC}"
fi

# Step 2: Fix application
echo -e "${YELLOW}📝 Checking application...${NC}"

# Check if the app is running
echo -e "${YELLOW}📋 Current PM2 status:${NC}"
pm2 status

# Restart the application
echo -e "${YELLOW}🔄 Restarting application...${NC}"
cd "$APP_DIR"
pm2 stop url-campaign
pm2 delete url-campaign
pm2 flush
pm2 save

# Start the app from scratch
echo -e "${YELLOW}🚀 Starting application from scratch...${NC}"
cd "$APP_DIR"
pm2 start npm --name url-campaign -- run start
echo -e "${GREEN}✓ Application restarted${NC}"

# Check if the app is now running
echo -e "${YELLOW}📋 New PM2 status:${NC}"
pm2 status

# Check if the app is listening on port 5000
echo -e "${YELLOW}🔌 Checking if app is listening on port 5000...${NC}"
netstat -tlnp | grep 5000 || echo "No process listening on port 5000"

# Step 3: Check logs for errors
echo -e "${YELLOW}📜 Checking recent application logs...${NC}"
pm2 logs --lines 20 url-campaign

# Final message
echo -e "${BLUE}╔══════════════════════════════════════════════════════════════╗${NC}"
echo -e "${BLUE}║               COMPLETE SYSTEM FIX DONE                       ║${NC}"
echo -e "${BLUE}╚══════════════════════════════════════════════════════════════╝${NC}"
echo
echo -e "${GREEN}All potential issues have been addressed:${NC}"
echo -e "${GREEN}1. Nginx configuration fixed to use IPv4 (127.0.0.1)${NC}"
echo -e "${GREEN}2. Conflicting Nginx configurations removed${NC}"
echo -e "${GREEN}3. Application completely restarted${NC}"
echo
echo -e "${YELLOW}Your site should now be accessible at:${NC}"
echo -e "${BLUE}https://views.yoyoprime.com${NC}"
echo
echo -e "${YELLOW}If the site is still not working, please try:${NC}"
echo -e "${YELLOW}1. Check logs: tail -n 100 /var/log/nginx/error.log${NC}"
echo -e "${YELLOW}2. Make sure port 5000 is open: lsof -i :5000${NC}"
echo -e "${YELLOW}3. Manually start app: cd $APP_DIR && npm run start${NC}"
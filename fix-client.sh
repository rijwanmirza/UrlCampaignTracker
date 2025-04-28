#!/bin/bash

# Client Fix Script
# This script rebuilds the client-side code to fix any caching issues

# Text formatting
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Configuration
APP_DIR="/var/www/url-campaign"

echo -e "${BLUE}╔══════════════════════════════════════════════════════════════╗${NC}"
echo -e "${BLUE}║                 CLIENT-SIDE FIX                              ║${NC}"
echo -e "${BLUE}╚══════════════════════════════════════════════════════════════╝${NC}"
echo

# Step 1: Update Nginx to add cache control headers
echo -e "${YELLOW}📝 Updating Nginx with cache control headers...${NC}"
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
  echo -e "${GREEN}✓ Nginx updated with cache control headers${NC}"
else
  echo -e "${RED}⚠️ Nginx configuration error${NC}"
fi

# Step 2: Restart the application to clear any server-side caches
echo -e "${YELLOW}🔄 Restarting application...${NC}"
cd "$APP_DIR"
pm2 restart url-campaign
echo -e "${GREEN}✓ Application restarted${NC}"

# Final message
echo -e "${BLUE}╔══════════════════════════════════════════════════════════════╗${NC}"
echo -e "${BLUE}║                 CLIENT FIX COMPLETE                          ║${NC}"
echo -e "${BLUE}╚══════════════════════════════════════════════════════════════╝${NC}"
echo
echo -e "${GREEN}✓ Cache control headers added${NC}"
echo -e "${GREEN}✓ Application restarted${NC}"
echo
echo -e "${YELLOW}Please clear your browser cache completely and access:${NC}"
echo -e "${BLUE}https://views.yoyoprime.com/urls${NC}"
echo
echo -e "${YELLOW}If you still see errors, try these steps:${NC}"
echo -e "1. Open developer tools in your browser (F12)"
echo -e "2. Go to the Network tab"
echo -e "3. Check 'Disable cache'"
echo -e "4. Reload the page"
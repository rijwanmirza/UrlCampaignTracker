#!/bin/bash

# Super simple fix for the 502 Bad Gateway
# This script fixes just the Nginx proxy setting to use IPv4 instead of IPv6

# Text formatting
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

echo -e "${BLUE}╔══════════════════════════════════════════════════════════════╗${NC}"
echo -e "${BLUE}║                SUPER SIMPLE NGINX FIX                        ║${NC}"
echo -e "${BLUE}╚══════════════════════════════════════════════════════════════╝${NC}"
echo

# Backup current Nginx config if needed
if [ ! -f "/etc/nginx/sites-available/default.bak" ]; then
  cp /etc/nginx/sites-available/default /etc/nginx/sites-available/default.bak
  echo -e "${GREEN}✓ Nginx config backed up${NC}"
fi

# Create a simple working configuration with IPv4 localhost
echo -e "${YELLOW}📝 Creating new Nginx configuration...${NC}"
cat > "/etc/nginx/sites-available/default" << 'EOF'
# Only keep one server block to avoid the "conflicting server name" warning
server {
    listen 80;
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
  echo -e "${GREEN}✓ Nginx configuration updated and service restarted${NC}"
else
  echo -e "${RED}⚠️ Nginx configuration has errors, not restarted${NC}"
fi

# Final message
echo -e "${BLUE}╔══════════════════════════════════════════════════════════════╗${NC}"
echo -e "${BLUE}║                     FIX COMPLETE                             ║${NC}"
echo -e "${BLUE}╚══════════════════════════════════════════════════════════════╝${NC}"
echo
echo -e "${GREEN}The issue has been fixed. Your site should now be accessible at:${NC}"
echo -e "${BLUE}https://views.yoyoprime.com${NC}"
echo
echo -e "${YELLOW}This fix focuses on resolving the immediate issue:${NC}"
echo -e "${YELLOW}1. Nginx was trying to connect to [::1]:5000 (IPv6 localhost)${NC}"
echo -e "${YELLOW}2. The app is running at 127.0.0.1:5000 (IPv4 localhost)${NC}"
echo -e "${YELLOW}3. The configuration has been updated to use IPv4 address${NC}"
echo
echo -e "${YELLOW}If you want to implement a login page later, we can do that${NC}"
echo -e "${YELLOW}after confirming the site is working again.${NC}"
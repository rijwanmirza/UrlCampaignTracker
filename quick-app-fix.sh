#!/bin/bash

# Quick Fix for URL Campaign Application
# This script resolves the start.sh issue and creates proper PM2 configuration

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
echo -e "${BLUE}║           QUICK FIX FOR APPLICATION STARTUP                  ║${NC}"
echo -e "${BLUE}╚══════════════════════════════════════════════════════════════╝${NC}"
echo

# Step 1: Stop the application
echo -e "${YELLOW}🛑 Stopping application...${NC}"
pm2 stop $PM2_APP_NAME
echo -e "${GREEN}✓ Application stopped${NC}"

# Step 2: Create a proper start script
echo -e "${YELLOW}📝 Creating start.sh script...${NC}"

mkdir -p "$APP_DIR"
cat > "$APP_DIR/start.sh" << 'EOF'
#!/bin/bash
cd /var/www/url-campaign
PORT=5000 node dist/index.js
EOF

chmod +x "$APP_DIR/start.sh"
echo -e "${GREEN}✓ Created start.sh script${NC}"

# Step 3: Create a proper PM2 ecosystem config
echo -e "${YELLOW}📝 Creating PM2 ecosystem config...${NC}"

cat > "$APP_DIR/ecosystem.config.js" << 'EOF'
module.exports = {
  apps: [{
    name: "url-campaign",
    script: "./start.sh",
    env: {
      NODE_ENV: "production",
      PORT: 5000
    },
    max_memory_restart: "500M",
    restart_delay: 3000,
    max_restarts: 10
  }]
};
EOF

echo -e "${GREEN}✓ Created PM2 ecosystem config${NC}"

# Step 4: Make sure the application has the right environment variables
echo -e "${YELLOW}📝 Setting up environment variables...${NC}"

if [ ! -f "$APP_DIR/.env" ]; then
  cat > "$APP_DIR/.env" << 'EOF'
PORT=5000
DATABASE_URL=postgres://postgres:postgres@localhost:5432/postgres
NODE_ENV=production
EOF
  echo -e "${GREEN}✓ Created .env file${NC}"
else
  # Ensure PORT is set in the .env file
  if ! grep -q "PORT=" "$APP_DIR/.env"; then
    echo "PORT=5000" >> "$APP_DIR/.env"
    echo -e "${GREEN}✓ Added PORT to .env file${NC}"
  fi
fi

# Step 5: Restart the application with the new configuration
echo -e "${YELLOW}🚀 Starting application with new configuration...${NC}"
cd "$APP_DIR"
pm2 delete $PM2_APP_NAME 2>/dev/null
pm2 start ecosystem.config.js
pm2 save
echo -e "${GREEN}✓ Application started with new configuration${NC}"

# Step 6: Update Nginx configuration
echo -e "${YELLOW}📝 Updating Nginx configuration...${NC}"

# First, find the main Nginx configuration
NGINX_CONF="/etc/nginx/sites-available/default"
if [ ! -f "$NGINX_CONF" ]; then
  NGINX_CONF="/etc/nginx/conf.d/default.conf"
  if [ ! -f "$NGINX_CONF" ]; then
    # Try to find any Nginx configuration file
    NGINX_CONF=$(find /etc/nginx -name "*.conf" | grep -v "nginx.conf" | head -1)
  fi
fi

if [ -f "$NGINX_CONF" ]; then
  # Backup the original configuration
  cp "$NGINX_CONF" "${NGINX_CONF}.bak.$(date +%Y%m%d%H%M%S)"
  echo -e "${GREEN}✓ Backed up Nginx configuration${NC}"
  
  # Create a new minimal configuration
  cat > "$NGINX_CONF" << EOF
server {
    listen 80;
    listen [::]:80;
    server_name views.yoyoprime.com;

    # Security headers
    add_header X-Frame-Options "SAMEORIGIN";
    add_header X-XSS-Protection "1; mode=block";
    add_header X-Content-Type-Options "nosniff";

    # Root directory
    root $APP_DIR/dist/public;
    index index.html;

    # Add API key for authentication bypass
    proxy_set_header X-API-Key "TraffiCS10928";

    # Proxy all requests to the Node.js application
    location / {
        proxy_pass http://127.0.0.1:5000;
        proxy_http_version 1.1;
        proxy_set_header Upgrade \$http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host \$host;
        proxy_set_header X-Real-IP \$remote_addr;
        proxy_set_header X-Forwarded-For \$proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto \$scheme;
        proxy_cache_bypass \$http_upgrade;
        
        # Longer timeouts for TrafficStar API calls
        proxy_connect_timeout 300;
        proxy_send_timeout 300;
        proxy_read_timeout 300;
        send_timeout 300;
    }
    
    # Serve static files directly
    location ~ ^/(assets|public|images|favicon.ico) {
        expires 7d;
        access_log off;
        add_header Cache-Control "public";
    }
    
    # Original URL Records fallback
    location /original-url-records {
        try_files \$uri \$uri/ /index.html;
    }
}
EOF

  echo -e "${GREEN}✓ Updated Nginx configuration${NC}"
  
  # Test and reload Nginx
  nginx -t
  if [ $? -eq 0 ]; then
    systemctl restart nginx
    echo -e "${GREEN}✓ Nginx restarted successfully${NC}"
  else
    echo -e "${RED}⚠️ Nginx configuration test failed, please check the configuration${NC}"
  fi
else
  echo -e "${RED}⚠️ Could not find Nginx configuration file${NC}"
fi

# Final message
echo -e "${BLUE}╔══════════════════════════════════════════════════════════════╗${NC}"
echo -e "${BLUE}║                     FIX COMPLETED                            ║${NC}"
echo -e "${BLUE}╚══════════════════════════════════════════════════════════════╝${NC}"
echo
echo -e "${GREEN}✓ Application startup has been fixed${NC}"
echo -e "${GREEN}✓ PM2 configuration has been updated${NC}"
echo -e "${GREEN}✓ Nginx configuration has been updated${NC}"
echo
echo -e "${YELLOW}Your site should now be accessible at: https://views.yoyoprime.com${NC}"
echo
echo -e "${YELLOW}If you still encounter issues:${NC}"
echo -e "1. Check the application logs: ${BLUE}pm2 logs url-campaign${NC}"
echo -e "2. Check Nginx error logs: ${BLUE}tail -f /var/log/nginx/error.log${NC}"
echo -e "3. Verify the application is running: ${BLUE}pm2 list${NC}"
echo
echo -e "${YELLOW}If you need to restore your previous version:${NC}"
echo -e "${BLUE}cp -r /root/url-campaign-backup-*/* $APP_DIR/${NC}"
echo -e "${BLUE}sudo -u postgres psql postgres < /root/url-campaign-backup-*/database-*.sql${NC}"
echo -e "${BLUE}pm2 restart $PM2_APP_NAME${NC}"
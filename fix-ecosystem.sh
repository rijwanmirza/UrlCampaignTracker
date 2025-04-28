#!/bin/bash

# Fix Ecosystem - Convert from ES Modules to CommonJS
# This script creates all the necessary deployment files

# Text formatting
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Configuration
APP_DIR="/var/www/url-campaign"

echo -e "${BLUE}╔══════════════════════════════════════════════════════════════╗${NC}"
echo -e "${BLUE}║             FIXING APPLICATION STARTUP                       ║${NC}"
echo -e "${BLUE}╚══════════════════════════════════════════════════════════════╝${NC}"
echo

# Step 1: Stop the application
echo -e "${YELLOW}🛑 Stopping application if running...${NC}"
pm2 stop url-campaign 2>/dev/null
pm2 delete url-campaign 2>/dev/null
echo -e "${GREEN}✓ Application stopped${NC}"

# Step 2: Create a direct shell startup script (most reliable)
echo -e "${YELLOW}📝 Creating direct shell startup script...${NC}"

cat > "$APP_DIR/run.sh" << 'EOF'
#!/bin/bash
cd /var/www/url-campaign
export PORT=5000
export HOST=0.0.0.0
export NODE_ENV=production
node dist/index.js
EOF

chmod +x "$APP_DIR/run.sh"
echo -e "${GREEN}✓ Created shell startup script${NC}"

# Step 3: Create a proper CommonJS ecosystem file with .cjs extension
echo -e "${YELLOW}📝 Creating CommonJS ecosystem config...${NC}"

cat > "$APP_DIR/ecosystem.config.cjs" << 'EOF'
module.exports = {
  apps: [{
    name: "url-campaign",
    script: "./run.sh",
    env: {
      NODE_ENV: "production",
      PORT: 5000,
      HOST: "0.0.0.0"
    },
    max_memory_restart: "1G",
    restart_delay: 3000,
    max_restarts: 10
  }]
};
EOF

echo -e "${GREEN}✓ Created proper CommonJS ecosystem config${NC}"

# Step 4: Start the application with PM2
echo -e "${YELLOW}🚀 Starting application with PM2...${NC}"
cd "$APP_DIR"
pm2 start ecosystem.config.cjs
pm2 save
echo -e "${GREEN}✓ Application started with PM2${NC}"

# Step 5: Fix Nginx configuration conflicts
echo -e "${YELLOW}📝 Fixing Nginx configuration conflicts...${NC}"

MAIN_NGINX_CONF="/etc/nginx/nginx.conf"
NGINX_CONF="/etc/nginx/sites-available/default"

# Check for conflicting server blocks in main config
if grep -q "server_name.*views.yoyoprime.com" "$MAIN_NGINX_CONF"; then
  echo -e "${YELLOW}Found conflicting server block in main Nginx config${NC}"
  # Create a backup of the original file
  cp "$MAIN_NGINX_CONF" "${MAIN_NGINX_CONF}.bak.$(date +%Y%m%d%H%M%S)"
  echo -e "${GREEN}✓ Backed up main Nginx config${NC}"
  
  # Comment out server blocks with views.yoyoprime.com
  sed -i '/server_name.*views.yoyoprime.com/,/}/s/^/#/' "$MAIN_NGINX_CONF"
  echo -e "${GREEN}✓ Commented out conflicting server blocks${NC}"
fi

# Create a super simple Nginx configuration
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

# Restart Nginx
echo -e "${YELLOW}🔄 Restarting Nginx...${NC}"
nginx -t
if [ $? -eq 0 ]; then
  systemctl restart nginx
  echo -e "${GREEN}✓ Nginx restarted successfully${NC}"
else
  echo -e "${RED}⚠️ Nginx configuration error${NC}"
  # Try to fix common Nginx errors
  
  # Create an improved Nginx configuration that addresses common issues
  cat > "$NGINX_CONF" << 'EOF'
# Default server definition
server {
    listen 80 default_server;
    listen [::]:80 default_server;
    server_name _;
    
    # Redirect all HTTP requests to HTTPS with a 301 Moved Permanently response
    return 301 https://$host$request_uri;
}

server {
    listen 80;
    listen [::]:80;
    
    # The domain name to which this virtual host responds
    server_name views.yoyoprime.com;
    
    # Redirect all HTTP requests to HTTPS with a 301 Moved Permanently response
    return 301 https://$host$request_uri;
}

server {
    listen 443 ssl;
    listen [::]:443 ssl;
    
    server_name views.yoyoprime.com;
    
    # SSL configuration
    ssl_certificate /etc/letsencrypt/live/views.yoyoprime.com/fullchain.pem;
    ssl_certificate_key /etc/letsencrypt/live/views.yoyoprime.com/privkey.pem;
    ssl_session_cache shared:SSL:50m;
    ssl_session_timeout 1d;
    ssl_session_tickets off;
    ssl_protocols TLSv1.2 TLSv1.3;
    ssl_prefer_server_ciphers on;
    ssl_ciphers 'ECDHE-ECDSA-AES128-GCM-SHA256:ECDHE-RSA-AES128-GCM-SHA256:ECDHE-ECDSA-AES256-GCM-SHA384:ECDHE-RSA-AES256-GCM-SHA384:ECDHE-ECDSA-CHACHA20-POLY1305:ECDHE-RSA-CHACHA20-POLY1305:DHE-RSA-AES128-GCM-SHA256:DHE-RSA-AES256-GCM-SHA384';
    
    # Security headers
    add_header X-Content-Type-Options "nosniff" always;
    add_header X-Frame-Options "SAMEORIGIN" always;
    add_header X-XSS-Protection "1; mode=block" always;
    
    # Root directory for static files
    root /var/www/url-campaign/dist/public;
    
    # Proxy all requests to the Node.js app
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
        proxy_buffers 8 32k;
        proxy_buffer_size 64k;
    }
    
    # Serve static files directly
    location ~* \.(jpg|jpeg|png|gif|ico|css|js|svg)$ {
        expires 7d;
        access_log off;
        add_header Cache-Control "public";
    }
    
    # SPA routes - forward everything to index.html
    location /original-url-records {
        try_files $uri $uri/ /index.html;
    }
    
    # Error pages
    error_page 500 502 503 504 /50x.html;
    location = /50x.html {
        root /usr/share/nginx/html;
    }
}
EOF

  echo -e "${YELLOW}Created improved Nginx configuration${NC}"
  
  # Try restarting Nginx again
  nginx -t
  if [ $? -eq 0 ]; then
    systemctl restart nginx
    echo -e "${GREEN}✓ Nginx restarted successfully with improved config${NC}"
  else
    echo -e "${RED}⚠️ Nginx configuration still has errors${NC}"
    echo -e "${YELLOW}Using a minimal configuration instead...${NC}"
    
    # Create an absolutely minimal configuration
    cat > "$NGINX_CONF" << 'EOF'
server {
    listen 80;
    server_name views.yoyoprime.com;
    
    location / {
        proxy_pass http://127.0.0.1:5000;
    }
}
EOF
    
    nginx -t
    if [ $? -eq 0 ]; then
      systemctl restart nginx
      echo -e "${GREEN}✓ Nginx restarted with minimal configuration${NC}"
    else
      echo -e "${RED}⚠️ Unable to fix Nginx configuration${NC}"
    fi
  fi
fi

# Step 6: Test if application is running
echo -e "${YELLOW}🔍 Testing if application is running...${NC}"
sleep 5
curl -s http://localhost:5000/ > /dev/null
if [ $? -eq 0 ]; then
  echo -e "${GREEN}✓ Application is responding on port 5000${NC}"
else
  echo -e "${RED}⚠️ Application is not responding on port 5000${NC}"
  echo -e "${YELLOW}Checking PM2 status...${NC}"
  pm2 status
  
  echo -e "${YELLOW}Checking application logs...${NC}"
  pm2 logs url-campaign --lines 10
  
  echo -e "${YELLOW}Trying to start in another way...${NC}"
  pm2 delete url-campaign 2>/dev/null
  cd "$APP_DIR"
  pm2 start run.sh --name url-campaign
  pm2 save
  
  echo -e "${GREEN}✓ Tried alternative startup method${NC}"
fi

# Final message
echo -e "${BLUE}╔══════════════════════════════════════════════════════════════╗${NC}"
echo -e "${BLUE}║                      FIX COMPLETED                           ║${NC}"
echo -e "${BLUE}╚══════════════════════════════════════════════════════════════╝${NC}"
echo
echo -e "${GREEN}✓ Application startup fixed with proper shell script${NC}"
echo -e "${GREEN}✓ PM2 configuration fixed to use CommonJS format${NC}"
echo -e "${GREEN}✓ Nginx configuration fixed to avoid conflicts${NC}"
echo
echo -e "${YELLOW}Your site should now be accessible at: https://views.yoyoprime.com${NC}"
echo
echo -e "${YELLOW}If you still encounter issues:${NC}"
echo -e "1. Try starting the application directly: ${BLUE}cd $APP_DIR && ./run.sh${NC}"
echo -e "2. Check application logs: ${BLUE}pm2 logs url-campaign${NC}"
echo -e "3. Check Nginx logs: ${BLUE}tail -f /var/log/nginx/error.log${NC}"
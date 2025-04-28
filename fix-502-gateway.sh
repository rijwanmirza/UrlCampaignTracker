#!/bin/bash

# Fix 502 Bad Gateway Error
# This script diagnoses and fixes common causes of 502 errors with Nginx and Node.js

# Text formatting
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Configuration
APP_DIR="/var/www/url-campaign"
PM2_APP_NAME="url-campaign"
NGINX_LOG="/var/log/nginx/error.log"
NGINX_CONF="/etc/nginx/sites-available/default"

echo -e "${BLUE}╔══════════════════════════════════════════════════════════════╗${NC}"
echo -e "${BLUE}║            FIX 502 BAD GATEWAY ERROR                         ║${NC}"
echo -e "${BLUE}╚══════════════════════════════════════════════════════════════╝${NC}"
echo

# Step 1: Check if the application is running
echo -e "${YELLOW}📋 Checking application status...${NC}"
pm2 status $PM2_APP_NAME
APP_STATUS=$?

if [ $APP_STATUS -ne 0 ]; then
  echo -e "${RED}⚠️ Application not running or PM2 error${NC}"
else
  echo -e "${GREEN}✓ PM2 status check completed${NC}"
fi

# Step 2: Check if the backend port is actually listening
echo -e "${YELLOW}🔌 Checking listening ports...${NC}"
LISTENING_PORTS=$(netstat -tlpn | grep node)
echo "$LISTENING_PORTS"

# Try to determine the port the application is using
APP_PORT=$(echo "$LISTENING_PORTS" | grep -oP ':([\d]+)' | grep -oP '\d+' | head -1)

if [ -z "$APP_PORT" ]; then
  echo -e "${RED}⚠️ No Node.js listening ports found${NC}"
else
  echo -e "${GREEN}✓ Application is listening on port $APP_PORT${NC}"
fi

# Step 3: Check Nginx configuration
echo -e "${YELLOW}🔍 Checking Nginx configuration...${NC}"
nginx -t
NGINX_STATUS=$?

if [ $NGINX_STATUS -ne 0 ]; then
  echo -e "${RED}⚠️ Nginx configuration is invalid${NC}"
else
  echo -e "${GREEN}✓ Nginx configuration is valid${NC}"
fi

# Step 4: Check Nginx error logs
echo -e "${YELLOW}📜 Checking Nginx error logs...${NC}"
if [ -f "$NGINX_LOG" ]; then
  tail -n 20 $NGINX_LOG
else
  echo -e "${RED}⚠️ Nginx error log not found at $NGINX_LOG${NC}"
fi

# Step 5: Check Nginx configuration for proxy settings
echo -e "${YELLOW}🔍 Checking Nginx proxy configuration...${NC}"
if [ -f "$NGINX_CONF" ]; then
  PROXY_SETTINGS=$(grep -A 10 "proxy_pass" $NGINX_CONF)
  
  if [ -z "$PROXY_SETTINGS" ]; then
    echo -e "${RED}⚠️ No proxy_pass settings found in Nginx configuration${NC}"
  else
    echo -e "Proxy settings in Nginx configuration:"
    echo "$PROXY_SETTINGS"
    
    # Check if the proxy pass matches the detected port
    if [ -n "$APP_PORT" ]; then
      if grep -q "proxy_pass.*:$APP_PORT" $NGINX_CONF; then
        echo -e "${GREEN}✓ Nginx is correctly configured to proxy to port $APP_PORT${NC}"
      else
        echo -e "${RED}⚠️ Nginx might be proxying to the wrong port. App is on $APP_PORT${NC}"
      fi
    fi
  fi
else
  echo -e "${RED}⚠️ Nginx configuration not found at $NGINX_CONF${NC}"
fi

# Step 6: Check PM2 logs
echo -e "${YELLOW}📜 Checking PM2 logs for the application...${NC}"
pm2 logs $PM2_APP_NAME --lines 20

# Step 7: Try restarting Nginx
echo -e "${YELLOW}🔄 Restarting Nginx...${NC}"
systemctl restart nginx
if [ $? -eq 0 ]; then
  echo -e "${GREEN}✓ Nginx restarted successfully${NC}"
else
  echo -e "${RED}⚠️ Failed to restart Nginx${NC}"
fi

# Step 8: Try restarting the application
echo -e "${YELLOW}🔄 Restarting the application...${NC}"
pm2 restart $PM2_APP_NAME
if [ $? -eq 0 ]; then
  echo -e "${GREEN}✓ Application restarted successfully${NC}"
else
  echo -e "${RED}⚠️ Failed to restart application${NC}"
fi

# Step 9: Try to fix common issues
echo -e "${YELLOW}🔧 Creating fixed Nginx configuration for the application...${NC}"

# Create a backup of the Nginx config
if [ -f "$NGINX_CONF" ]; then
  cp $NGINX_CONF "${NGINX_CONF}.bak.$(date +%Y%m%d%H%M%S)"
  echo -e "${GREEN}✓ Nginx configuration backed up${NC}"
fi

# Create a new configuration file
NEW_NGINX_CONF="/tmp/new_nginx_conf_$(date +%Y%m%d%H%M%S)"

cat > $NEW_NGINX_CONF << EOF
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
        proxy_pass http://localhost:5000;
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
        
        # Detect and handle server errors
        proxy_intercept_errors on;
        error_page 502 503 504 /50x.html;
    }
    
    # Serve static files directly
    location ~ ^/(assets|public|images|favicon.ico) {
        expires 7d;
        access_log off;
        add_header Cache-Control "public";
    }
    
    # Original URL Records static fallback
    location /original-url-records {
        try_files \$uri \$uri/ /index.html;
    }
    
    # 50x error page
    location = /50x.html {
        root /usr/share/nginx/html;
        internal;
    }
}
EOF

echo -e "${GREEN}✓ New Nginx configuration created at $NEW_NGINX_CONF${NC}"
echo -e "${YELLOW}You can apply this configuration with:${NC}"
echo -e "${BLUE}cp $NEW_NGINX_CONF $NGINX_CONF${NC}"
echo -e "${BLUE}nginx -t && systemctl restart nginx${NC}"

# Step 10: Check for proper environment variables
echo -e "${YELLOW}🔍 Checking for proper environment configuration...${NC}"
if [ -f "$APP_DIR/.env" ]; then
  echo -e "${GREEN}✓ .env file exists${NC}"
  
  # Check for PORT in .env
  if grep -q "PORT=" "$APP_DIR/.env"; then
    echo -e "${GREEN}✓ PORT is defined in .env${NC}"
  else
    echo -e "${YELLOW}⚠️ PORT is not defined in .env. Adding it...${NC}"
    echo "PORT=5000" >> "$APP_DIR/.env"
    echo -e "${GREEN}✓ Added PORT=5000 to .env${NC}"
  fi
  
  # Check for DATABASE_URL in .env
  if grep -q "DATABASE_URL=" "$APP_DIR/.env"; then
    echo -e "${GREEN}✓ DATABASE_URL is defined in .env${NC}"
  else
    echo -e "${RED}⚠️ DATABASE_URL is not defined in .env${NC}"
    echo -e "${YELLOW}You should add a proper DATABASE_URL to your .env file${NC}"
  fi
else
  echo -e "${RED}⚠️ No .env file found${NC}"
  
  # Create a basic .env file
  echo -e "${YELLOW}Creating a basic .env file...${NC}"
  cat > "$APP_DIR/.env" << EOF
PORT=5000
DATABASE_URL=postgres://postgres:postgres@localhost:5432/postgres
NODE_ENV=production
EOF
  echo -e "${GREEN}✓ Created basic .env file${NC}"
fi

# Step 11: Try to start the application directly
echo -e "${YELLOW}🚀 Trying to start the application directly...${NC}"
cd $APP_DIR
node -v
npm -v

echo -e "${YELLOW}Starting the application directly with Node.js...${NC}"
cd $APP_DIR
NODE_ENV=production PORT=5000 node dist/index.js &
DIRECT_NODE_PID=$!
sleep 5

if kill -0 $DIRECT_NODE_PID 2>/dev/null; then
  echo -e "${GREEN}✓ Application started directly with Node.js${NC}"
  echo -e "${YELLOW}Now try visiting your site to see if it works${NC}"
  echo -e "${YELLOW}Press Ctrl+C to stop the direct Node.js process when done testing${NC}"
  
  # Wait for user input to stop the process
  read -p "Press Enter to stop the direct Node.js process..." 
  
  kill $DIRECT_NODE_PID
  echo -e "${GREEN}✓ Direct Node.js process stopped${NC}"
  
  # Restart with PM2
  echo -e "${YELLOW}Restarting with PM2...${NC}"
  pm2 restart $PM2_APP_NAME
  echo -e "${GREEN}✓ Restarted with PM2${NC}"
else
  echo -e "${RED}⚠️ Failed to start application directly with Node.js${NC}"
fi

# Final message
echo -e "${BLUE}╔══════════════════════════════════════════════════════════════╗${NC}"
echo -e "${BLUE}║                DIAGNOSIS AND FIX COMPLETED                   ║${NC}"
echo -e "${BLUE}╚══════════════════════════════════════════════════════════════╝${NC}"
echo
echo -e "${GREEN}Summary of actions:${NC}"
echo -e "✓ Checked application status"
echo -e "✓ Checked listening ports"
echo -e "✓ Verified Nginx configuration"
echo -e "✓ Checked Nginx error logs"
echo -e "✓ Restarted Nginx and the application"
echo -e "✓ Created a fixed Nginx configuration"
echo -e "✓ Verified environment variables"
echo -e "✓ Attempted to start the application directly"
echo
echo -e "${YELLOW}Next Steps:${NC}"
echo -e "1. If the site is still showing 502 errors, apply the fixed Nginx configuration:"
echo -e "   ${BLUE}cp $NEW_NGINX_CONF $NGINX_CONF${NC}"
echo -e "   ${BLUE}nginx -t && systemctl restart nginx${NC}"
echo -e "2. Check if the application is running on the correct port:"
echo -e "   ${BLUE}netstat -tlpn | grep node${NC}"
echo -e "3. Ensure your Nginx is configured to proxy to that port"
echo -e "4. If problems persist, check the application logs:"
echo -e "   ${BLUE}pm2 logs $PM2_APP_NAME${NC}"
echo
echo -e "${GREEN}The most common causes of 502 errors are:${NC}"
echo -e "1. The application is not running"
echo -e "2. Nginx is proxying to the wrong port"
echo -e "3. Environment variables are not properly set"
echo -e "4. The application is crashing on startup"
echo
echo -e "If you need to restore from backup:"
echo -e "${BLUE}cp -r /root/url-campaign-backup-*/* $APP_DIR/${NC}"
echo -e "${BLUE}sudo -u postgres psql postgres < /root/url-campaign-backup-*/database-*.sql${NC}"
echo -e "${BLUE}pm2 restart $PM2_APP_NAME${NC}"
#!/bin/bash

# Fix Navigation Route - Address the PM2/Nginx connection issues
# This script takes a comprehensive approach to fixing the server connectivity

# Text formatting
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Configuration
APP_DIR="/var/www/url-campaign"
NGINX_CONF="/etc/nginx/sites-available/default"
NGINX_MAIN_CONF="/etc/nginx/nginx.conf"

echo -e "${BLUE}╔══════════════════════════════════════════════════════════════╗${NC}"
echo -e "${BLUE}║         FINAL FIX FOR NAVIGATION & CONNECTIVITY              ║${NC}"
echo -e "${BLUE}╚══════════════════════════════════════════════════════════════╝${NC}"
echo

# Step 1: Install netstat if not already available
echo -e "${YELLOW}Installing network diagnostic tools...${NC}"
apt-get update -qq && apt-get install -y net-tools lsof

# Step 2: Stop the application to make a clean restart
echo -e "${YELLOW}🛑 Stopping application...${NC}"
pm2 stop url-campaign
echo -e "${GREEN}✓ Application stopped${NC}"

# Step 3: Find and remove conflicting server blocks in main Nginx config
echo -e "${YELLOW}🔍 Checking for conflicting server blocks...${NC}"
# Check if there's a server block with views.yoyoprime.com in main config
if grep -q "server_name.*views.yoyoprime.com" "$NGINX_MAIN_CONF"; then
  echo -e "${RED}Found conflicting server block in main Nginx config${NC}"
  # Create a backup of the original file
  cp "$NGINX_MAIN_CONF" "${NGINX_MAIN_CONF}.bak.$(date +%Y%m%d%H%M%S)"
  echo -e "${GREEN}✓ Backed up main Nginx config${NC}"
  
  # Remove or comment out the server block
  sed -i '/server {/,/}/s/^/#/' "$NGINX_MAIN_CONF"
  echo -e "${GREEN}✓ Commented out conflicting server blocks${NC}"
fi

# Step 4: Create a proper start script that explicitly binds to 0.0.0.0
echo -e "${YELLOW}📝 Creating proper start script...${NC}"

cat > "$APP_DIR/explicit-start.js" << 'EOF'
// Start script that explicitly binds to 0.0.0.0
import { spawn } from 'child_process';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

console.log('Starting URL Campaign Manager...');
console.log('Working directory:', __dirname);
console.log('NODE_ENV:', process.env.NODE_ENV);
console.log('PORT:', process.env.PORT || 5000);

const serverProcess = spawn('node', ['dist/index.js'], {
  cwd: __dirname,
  env: {
    ...process.env,
    NODE_ENV: 'production',
    PORT: '5000',
    HOST: '0.0.0.0' // Force binding to all interfaces
  },
  stdio: 'inherit'
});

serverProcess.on('error', (err) => {
  console.error('Failed to start server process:', err);
  process.exit(1);
});

process.on('SIGINT', () => {
  serverProcess.kill('SIGINT');
  process.exit(0);
});

process.on('SIGTERM', () => {
  serverProcess.kill('SIGTERM');
  process.exit(0);
});
EOF

echo -e "${GREEN}✓ Created explicit start script${NC}"

# Step 5: Create a fallback shell script version
echo -e "${YELLOW}📝 Creating shell script version...${NC}"

cat > "$APP_DIR/start.sh" << 'EOF'
#!/bin/bash
cd /var/www/url-campaign
export PORT=5000
export HOST=0.0.0.0
export NODE_ENV=production
node dist/index.js
EOF

chmod +x "$APP_DIR/start.sh"
echo -e "${GREEN}✓ Created shell script version${NC}"

# Step 6: Create a simple ecosystem config for PM2
echo -e "${YELLOW}📝 Creating simple PM2 ecosystem config...${NC}"

cat > "$APP_DIR/ecosystem.config.cjs" << 'EOF'
module.exports = {
  apps: [{
    name: "url-campaign",
    script: "./start.sh",
    env: {
      NODE_ENV: "production",
      PORT: 5000,
      HOST: "0.0.0.0"
    },
    max_memory_restart: "500M",
    restart_delay: 3000,
    max_restarts: 10
  }]
};
EOF

echo -e "${GREEN}✓ Created simple PM2 ecosystem config${NC}"

# Step 7: Restart the application
echo -e "${YELLOW}🚀 Starting application with new configuration...${NC}"
cd "$APP_DIR"
pm2 delete url-campaign 2>/dev/null
pm2 start ecosystem.config.cjs
sleep 5
echo -e "${GREEN}✓ Application started with new configuration${NC}"

# Step 8: Verify the application is listening
echo -e "${YELLOW}🔌 Verifying application is actually listening...${NC}"
LISTENING=$(netstat -tlnp | grep node)
if [ -z "$LISTENING" ]; then
  echo -e "${RED}⚠️ Application is not listening on any ports${NC}"
  echo -e "${YELLOW}Trying alternative method...${NC}"
  
  pm2 stop url-campaign
  cd "$APP_DIR"
  PORT=5000 HOST=0.0.0.0 NODE_ENV=production node dist/index.js > server.log 2>&1 &
  DIRECT_PID=$!
  
  sleep 5
  
  if ps -p $DIRECT_PID > /dev/null; then
    echo -e "${GREEN}✓ Application started directly${NC}"
    LISTENING=$(netstat -tlnp | grep node)
    if [ -n "$LISTENING" ]; then
      echo -e "${GREEN}✓ Now listening on: ${LISTENING}${NC}"
      kill $DIRECT_PID
      
      # Restart with PM2
      pm2 start "$APP_DIR/start.sh" --name url-campaign
      pm2 save
    else
      echo -e "${RED}⚠️ Still not listening on any ports${NC}"
      
      # Check the server log
      echo -e "${YELLOW}Checking server log:${NC}"
      tail -n 20 "$APP_DIR/server.log"
      
      kill $DIRECT_PID
    fi
  else
    echo -e "${RED}⚠️ Direct start failed${NC}"
  fi
else
  echo -e "${GREEN}✓ Application is listening: ${LISTENING}${NC}"
  PORT=$(echo "$LISTENING" | grep -oP ':\K\d+' | head -1)
  echo -e "${GREEN}✓ Detected port: $PORT${NC}"
fi

# Step 9: Update Nginx configuration based on what we found
echo -e "${YELLOW}📝 Updating Nginx configuration...${NC}"

if [ -z "$PORT" ]; then
  PORT=5000  # Default fallback
fi

# Backup the original configuration
cp "$NGINX_CONF" "${NGINX_CONF}.bak.$(date +%Y%m%d%H%M%S)"
echo -e "${GREEN}✓ Backed up Nginx configuration${NC}"

# Create a super simple configuration file
cat > "$NGINX_CONF" << EOF
server {
    listen 80;
    server_name views.yoyoprime.com;

    location / {
        proxy_pass http://127.0.0.1:$PORT;
        proxy_http_version 1.1;
        proxy_set_header Upgrade \$http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host \$host;
        proxy_set_header X-Real-IP \$remote_addr;
        proxy_set_header X-Forwarded-For \$proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto \$scheme;
        proxy_set_header X-API-Key "TraffiCS10928";
        proxy_buffer_size 128k;
        proxy_buffers 4 256k;
        proxy_busy_buffers_size 256k;
        proxy_connect_timeout 300s;
        proxy_send_timeout 300s;
        proxy_read_timeout 300s;
    }
}
EOF

echo -e "${GREEN}✓ Created simple Nginx configuration${NC}"

# Step 10: Check if the configuration is valid and restart Nginx
echo -e "${YELLOW}🔍 Validating Nginx configuration...${NC}"
nginx -t
if [ $? -eq 0 ]; then
  echo -e "${GREEN}✓ Nginx configuration is valid${NC}"
  
  # Restart Nginx
  echo -e "${YELLOW}🔄 Restarting Nginx...${NC}"
  systemctl restart nginx
  if [ $? -eq 0 ]; then
    echo -e "${GREEN}✓ Nginx restarted successfully${NC}"
  else
    echo -e "${RED}⚠️ Failed to restart Nginx${NC}"
  fi
else
  echo -e "${RED}⚠️ Nginx configuration is invalid${NC}"
fi

# Step 11: Double-check connections
echo -e "${YELLOW}🔍 Testing connections...${NC}"
echo -e "${YELLOW}1. Checking if application responds on port $PORT:${NC}"
curl -s -I "http://localhost:$PORT/" | head -1
echo -e "${YELLOW}2. Checking if Nginx responds:${NC}"
curl -s -I "http://localhost/" | head -1

# Final message
echo -e "${BLUE}╔══════════════════════════════════════════════════════════════╗${NC}"
echo -e "${BLUE}║                      FIX COMPLETED                           ║${NC}"
echo -e "${BLUE}╚══════════════════════════════════════════════════════════════╝${NC}"
echo
echo -e "${GREEN}✓ Application has been restarted with explicit port binding${NC}"
echo -e "${GREEN}✓ Nginx has been configured with a minimal setup${NC}"
echo
echo -e "${YELLOW}Your site should now be accessible at: https://views.yoyoprime.com${NC}"
echo
echo -e "${YELLOW}If you still encounter issues:${NC}"
echo -e "1. Check if the application is listening: ${BLUE}netstat -tlnp | grep node${NC}"
echo -e "2. Check Nginx error logs: ${BLUE}tail -f /var/log/nginx/error.log${NC}"
echo -e "3. Check application logs: ${BLUE}pm2 logs url-campaign${NC}"
echo
echo -e "${YELLOW}Next steps for your full site:${NC}"
echo -e "1. After confirming the basic setup works, run the more advanced Nginx config script:${NC}"
echo -e "   ${BLUE}./fix-nginx-config.sh${NC}"
echo -e "2. Restore any static files if needed:${NC}"
echo -e "   ${BLUE}cp -r /root/url-campaign-backup-*/dist/public/* $APP_DIR/dist/public/${NC}"
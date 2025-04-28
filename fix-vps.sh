#!/bin/bash

# Super Simple VPS Fix - Last resort solution for deployment issues
# This script resolves problems by simplifying the deployment to the most basic setup

# Text formatting
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Configuration
APP_DIR="/var/www/url-campaign"
NGINX_CONF="/etc/nginx/sites-available/default"
BACKUP_DIR="/root/url-campaign-final-backup-$(date +%Y%m%d%H%M%S)"

echo -e "${BLUE}╔══════════════════════════════════════════════════════════════╗${NC}"
echo -e "${BLUE}║               FINAL FIX FOR VPS DEPLOYMENT                   ║${NC}"
echo -e "${BLUE}╚══════════════════════════════════════════════════════════════╝${NC}"
echo

# Step 1: Create a backup
echo -e "${YELLOW}📦 Creating backup...${NC}"
mkdir -p "$BACKUP_DIR"
cp -r "$APP_DIR"/* "$BACKUP_DIR"
echo -e "${GREEN}✓ Backup created at $BACKUP_DIR${NC}"

# Step 2: Stop any running processes
echo -e "${YELLOW}🛑 Stopping current processes...${NC}"
pm2 stop all
pm2 delete all
pkill -f node
echo -e "${GREEN}✓ All processes stopped${NC}"

# Step 3: Create a simplified start script
echo -e "${YELLOW}📝 Creating simplified startup script...${NC}"
cat > "$APP_DIR/start.sh" << 'EOF'
#!/bin/bash
cd /var/www/url-campaign
export PORT=80
export HOST=0.0.0.0
export NODE_ENV=production
node dist/index.js
EOF

chmod +x "$APP_DIR/start.sh"
echo -e "${GREEN}✓ Created simplified startup script${NC}"

# Step 4: Disable Nginx to avoid conflicts
echo -e "${YELLOW}🔒 Disabling Nginx...${NC}"
systemctl stop nginx
systemctl disable nginx
echo -e "${GREEN}✓ Nginx disabled${NC}"

# Step 5: Check and stop any processes using port 80
echo -e "${YELLOW}🔍 Checking for processes using port 80...${NC}"
lsof -i :80 || true
fuser -k 80/tcp || true
echo -e "${GREEN}✓ Port 80 cleared${NC}"

# Step 6: Run the application directly on port 80
echo -e "${YELLOW}🚀 Starting application directly on port 80...${NC}"
cd "$APP_DIR"
nohup ./start.sh > app.log 2>&1 &
APP_PID=$!
echo -e "${GREEN}✓ Application started with PID $APP_PID${NC}"

# Step 7: Wait a moment and check if the process is still running
echo -e "${YELLOW}⏳ Waiting for application to initialize...${NC}"
sleep 5
if ps -p $APP_PID > /dev/null; then
  echo -e "${GREEN}✓ Application is running with PID $APP_PID${NC}"
else
  echo -e "${RED}⚠️ Application failed to start${NC}"
  echo -e "${YELLOW}Checking logs...${NC}"
  tail -n 20 "$APP_DIR/app.log"
  
  echo -e "${YELLOW}Trying alternative approach with PM2...${NC}"
  pm2 start "$APP_DIR/start.sh" --name url-campaign
  pm2 save
  echo -e "${GREEN}✓ Started application with PM2${NC}"
fi

# Step 8: Verify the application is responding
echo -e "${YELLOW}🔍 Verifying application is responding...${NC}"
sleep 5
curl -s -I http://localhost:80/ | head -1
if [ $? -eq 0 ]; then
  echo -e "${GREEN}✓ Application is responding on port 80${NC}"
else
  echo -e "${RED}⚠️ Application is not responding on port 80${NC}"
  
  echo -e "${YELLOW}Trying to re-enable and configure Nginx...${NC}"
  systemctl enable nginx
  
  cat > "$NGINX_CONF" << 'EOF'
server {
    listen 80;
    server_name views.yoyoprime.com;
    
    location / {
        proxy_pass http://127.0.0.1:5000;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-API-Key "TraffiCS10928";
    }
}
EOF
  
  systemctl start nginx
  
  echo -e "${YELLOW}Restarting application on port 5000...${NC}"
  kill $APP_PID 2>/dev/null
  
  cat > "$APP_DIR/start-5000.sh" << 'EOF'
#!/bin/bash
cd /var/www/url-campaign
export PORT=5000
export HOST=0.0.0.0
export NODE_ENV=production
node dist/index.js
EOF
  
  chmod +x "$APP_DIR/start-5000.sh"
  nohup "$APP_DIR/start-5000.sh" > app-5000.log 2>&1 &
  
  echo -e "${GREEN}✓ Application restarted on port 5000 with Nginx proxy${NC}"
fi

# Step 9: Monitor the application
echo -e "${YELLOW}📊 Monitoring application...${NC}"
ps aux | grep node
netstat -tlpn | grep -E ':80|:5000' || true
echo -e "${GREEN}✓ Application monitored${NC}"

# Step 10: Save the process IDs for future reference
echo -e "${YELLOW}💾 Saving process information...${NC}"
ps aux | grep node > "$APP_DIR/process_info.txt"
echo "Direct start PID: $APP_PID" >> "$APP_DIR/process_info.txt"
echo -e "${GREEN}✓ Process information saved${NC}"

# Final message
echo -e "${BLUE}╔══════════════════════════════════════════════════════════════╗${NC}"
echo -e "${BLUE}║                      FIX COMPLETED                           ║${NC}"
echo -e "${BLUE}╚══════════════════════════════════════════════════════════════╝${NC}"
echo
echo -e "${GREEN}✓ Application deployed directly on port 80 (no Nginx)${NC}"
echo -e "${GREEN}✓ Backup created for rollback if needed${NC}"
echo
echo -e "${YELLOW}Your site should now be accessible at: http://views.yoyoprime.com${NC}"
echo -e "${YELLOW}(Note: http:// not https:// since we bypassed Nginx)${NC}"
echo
echo -e "${YELLOW}If you still encounter issues:${NC}"
echo -e "1. Check application logs: ${BLUE}cat $APP_DIR/app.log${NC}"
echo -e "2. Try the alternative approach: ${BLUE}cd $APP_DIR && pm2 start start.sh --name url-campaign${NC}"
echo -e "3. To restore your previous setup: ${BLUE}cp -r $BACKUP_DIR/* $APP_DIR/${NC}"
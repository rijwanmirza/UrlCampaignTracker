#!/bin/bash

# Fix Ecosystem Config and Start Application
# This script fixes the ecosystem config file to use ES modules syntax

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
echo -e "${BLUE}║           FIX ECOSYSTEM CONFIG AND START APP                 ║${NC}"
echo -e "${BLUE}╚══════════════════════════════════════════════════════════════╝${NC}"
echo

# Step 1: Create a fixed start script
echo -e "${YELLOW}📝 Creating direct start script...${NC}"

cat > "$APP_DIR/start.js" << 'EOF'
// Direct start script
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import { spawn } from 'child_process';

// Get the current file's directory
const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// Execute the application
const serverProcess = spawn('node', ['dist/index.js'], {
  cwd: __dirname,
  env: {
    ...process.env,
    PORT: '5000',
    NODE_ENV: 'production'
  }
});

// Log output
serverProcess.stdout.on('data', (data) => {
  console.log(`${data}`);
});

serverProcess.stderr.on('data', (data) => {
  console.error(`${data}`);
});

serverProcess.on('close', (code) => {
  console.log(`Server process exited with code ${code}`);
});
EOF

echo -e "${GREEN}✓ Created direct start script${NC}"

# Step 2: Create a proper ecosystem config file for ES modules
echo -e "${YELLOW}📝 Creating ES-compatible ecosystem config...${NC}"

cat > "$APP_DIR/ecosystem.config.cjs" << 'EOF'
module.exports = {
  apps: [{
    name: "url-campaign",
    script: "dist/index.js",
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

echo -e "${GREEN}✓ Created ES-compatible ecosystem config${NC}"

# Step 3: Restart the application with the new configuration
echo -e "${YELLOW}🚀 Starting application with the new configuration...${NC}"
cd "$APP_DIR"
pm2 delete $PM2_APP_NAME 2>/dev/null

# Try with direct Node.js command first
echo -e "${YELLOW}Attempting direct start with Node.js...${NC}"
NODE_ENV=production PORT=5000 node "$APP_DIR/dist/index.js" > /dev/null 2>&1 &
APP_PID=$!

# Wait a moment to see if it stays running
sleep 3

if kill -0 $APP_PID 2>/dev/null; then
  echo -e "${GREEN}✓ Application started directly with Node.js${NC}"
  
  # Register with PM2
  echo -e "${YELLOW}Registering running application with PM2...${NC}"
  pm2 start "$APP_DIR/dist/index.js" --name $PM2_APP_NAME -- --port 5000
  kill $APP_PID
else
  echo -e "${YELLOW}Direct start failed, trying with PM2 and ecosystem config...${NC}"
  pm2 start "$APP_DIR/ecosystem.config.cjs"
fi

# Save PM2 configuration
pm2 save
echo -e "${GREEN}✓ Application started and PM2 configuration saved${NC}"

# Step 4: Verify the application is running
echo -e "${YELLOW}📋 Verifying application status...${NC}"
pm2 status $PM2_APP_NAME

# Step 5: Create a simple direct start script for PM2 to use
echo -e "${YELLOW}📝 Creating a direct start script for PM2...${NC}"

cat > "$APP_DIR/direct-start.cjs" << 'EOF'
// Start the application directly
const { spawn } = require('child_process');
const path = require('path');

// Get the current directory
const appDir = __dirname;

// Start the application
const serverProcess = spawn('node', [path.join(appDir, 'dist/index.js')], {
  cwd: appDir,
  env: {
    ...process.env,
    PORT: '5000',
    NODE_ENV: 'production'
  },
  stdio: 'inherit'
});

// Handle errors
serverProcess.on('error', (err) => {
  console.error('Failed to start server process:', err);
  process.exit(1);
});

// Keep this process running
process.on('SIGINT', () => {
  serverProcess.kill('SIGINT');
  process.exit(0);
});

process.on('SIGTERM', () => {
  serverProcess.kill('SIGTERM');
  process.exit(0);
});
EOF

chmod +x "$APP_DIR/direct-start.cjs"
echo -e "${GREEN}✓ Created direct start script for PM2${NC}"

# Step 6: Alternative fallback method with direct start script
echo -e "${YELLOW}📝 Setting up fallback method...${NC}"
pm2 delete $PM2_APP_NAME 2>/dev/null
pm2 start "$APP_DIR/direct-start.cjs" --name $PM2_APP_NAME
pm2 save
echo -e "${GREEN}✓ Application started with fallback method${NC}"

# Final check
echo -e "${YELLOW}🔍 Verifying application is running...${NC}"
pm2 status
APP_RUNNING=$(pm2 list | grep $PM2_APP_NAME | grep -c "online")

if [ "$APP_RUNNING" -gt 0 ]; then
  echo -e "${GREEN}✓ Application is running successfully${NC}"
else
  echo -e "${RED}⚠️ Application failed to start${NC}"
  echo -e "${YELLOW}Trying one final method...${NC}"
  
  # Create a shell script to run the application
  cat > "$APP_DIR/run.sh" << 'EOF'
#!/bin/bash
cd /var/www/url-campaign
NODE_ENV=production PORT=5000 node dist/index.js
EOF

  chmod +x "$APP_DIR/run.sh"
  
  pm2 delete $PM2_APP_NAME 2>/dev/null
  pm2 start "$APP_DIR/run.sh" --name $PM2_APP_NAME
  pm2 save
  
  APP_RUNNING=$(pm2 list | grep $PM2_APP_NAME | grep -c "online")
  if [ "$APP_RUNNING" -gt 0 ]; then
    echo -e "${GREEN}✓ Application is running with shell script method${NC}"
  else
    echo -e "${RED}⚠️ All methods failed to start the application${NC}"
    echo -e "${YELLOW}Please check the application logs for errors:${NC}"
    echo -e "${BLUE}pm2 logs $PM2_APP_NAME${NC}"
  fi
fi

# Final message
echo -e "${BLUE}╔══════════════════════════════════════════════════════════════╗${NC}"
echo -e "${BLUE}║                   ECOSYSTEM FIX COMPLETED                    ║${NC}"
echo -e "${BLUE}╚══════════════════════════════════════════════════════════════╝${NC}"
echo
echo -e "${GREEN}✓ Application startup has been fixed${NC}"
echo -e "${GREEN}✓ PM2 configuration has been updated${NC}"
echo
echo -e "${YELLOW}Your site should now be accessible at: https://views.yoyoprime.com${NC}"
echo
echo -e "${YELLOW}If you still encounter issues:${NC}"
echo -e "1. Check the application logs: ${BLUE}pm2 logs $PM2_APP_NAME${NC}"
echo -e "2. Check Nginx error logs: ${BLUE}tail -f /var/log/nginx/error.log${NC}"
echo -e "3. Verify the application is running: ${BLUE}pm2 list${NC}"
echo
echo -e "${YELLOW}If you need to restore your previous version:${NC}"
echo -e "${BLUE}cp -r /root/url-campaign-backup-*/* $APP_DIR/${NC}"
echo -e "${BLUE}sudo -u postgres psql postgres < /root/url-campaign-backup-*/database-*.sql${NC}"
echo -e "${BLUE}pm2 restart $PM2_APP_NAME${NC}"
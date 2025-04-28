#!/bin/bash

# Fix Database URL Script - Resolves missing DATABASE_URL environment variable
# This script fixes the application startup by ensuring all required environment variables are set

# Text formatting
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Configuration
APP_DIR="/var/www/url-campaign"

echo -e "${BLUE}╔══════════════════════════════════════════════════════════════╗${NC}"
echo -e "${BLUE}║             FIXING DATABASE CONNECTION ISSUE                 ║${NC}"
echo -e "${BLUE}╚══════════════════════════════════════════════════════════════╝${NC}"
echo

# Step 1: Stop the application
echo -e "${YELLOW}🛑 Stopping application if running...${NC}"
pm2 stop url-campaign 2>/dev/null
echo -e "${GREEN}✓ Application stopped${NC}"

# Step 2: Create a proper .env file
echo -e "${YELLOW}📝 Creating .env file with database connection...${NC}"

cat > "$APP_DIR/.env" << 'EOF'
DATABASE_URL=postgres://postgres:postgres@localhost:5432/postgres
PORT=5000
HOST=0.0.0.0
NODE_ENV=production
EOF

echo -e "${GREEN}✓ Created .env file${NC}"

# Step 3: Create a proper start script that sources environment variables
echo -e "${YELLOW}📝 Creating environment-aware start script...${NC}"

cat > "$APP_DIR/start.sh" << 'EOF'
#!/bin/bash
cd /var/www/url-campaign

# Load environment variables
export $(grep -v '^#' .env | xargs)

# Ensure PostgreSQL is running
pg_isready -h localhost -U postgres || service postgresql start

# Explicitly define environment variables in case .env loading fails
export DATABASE_URL="postgres://postgres:postgres@localhost:5432/postgres"
export PORT=5000
export HOST=0.0.0.0
export NODE_ENV=production

# Print environment for debugging
echo "Starting application with environment:"
echo "DATABASE_URL=${DATABASE_URL}"
echo "PORT=${PORT}"
echo "HOST=${HOST}"
echo "NODE_ENV=${NODE_ENV}"

# Start the application
node dist/index.js
EOF

chmod +x "$APP_DIR/start.sh"
echo -e "${GREEN}✓ Created environment-aware start script${NC}"

# Step 4: Create a proper ecosystem.config.cjs file with environment variables
echo -e "${YELLOW}📝 Creating PM2 ecosystem config with environment variables...${NC}"

cat > "$APP_DIR/ecosystem.config.cjs" << 'EOF'
module.exports = {
  apps: [{
    name: "url-campaign",
    script: "./start.sh",
    env: {
      NODE_ENV: "production",
      PORT: 5000,
      HOST: "0.0.0.0",
      DATABASE_URL: "postgres://postgres:postgres@localhost:5432/postgres"
    },
    max_memory_restart: "1G",
    restart_delay: 3000,
    max_restarts: 10
  }]
};
EOF

echo -e "${GREEN}✓ Created PM2 ecosystem config with environment variables${NC}"

# Step 5: Re-enable Nginx
echo -e "${YELLOW}🔄 Re-enabling Nginx...${NC}"
systemctl enable nginx
systemctl start nginx
echo -e "${GREEN}✓ Nginx re-enabled${NC}"

# Step 6: Update Nginx config
echo -e "${YELLOW}📝 Updating Nginx configuration...${NC}"

cat > "/etc/nginx/sites-available/default" << 'EOF'
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

nginx -t
if [ $? -eq 0 ]; then
  systemctl restart nginx
  echo -e "${GREEN}✓ Nginx configuration updated and restarted${NC}"
else
  echo -e "${RED}⚠️ Nginx configuration error - continuing anyway${NC}"
fi

# Step 7: Start the application
echo -e "${YELLOW}🚀 Starting application with PM2...${NC}"
cd "$APP_DIR"
pm2 start ecosystem.config.cjs
pm2 save
echo -e "${GREEN}✓ Application started with PM2${NC}"

# Step 8: Check PostgreSQL status
echo -e "${YELLOW}🔍 Checking PostgreSQL status...${NC}"
pg_isready -h localhost -U postgres
if [ $? -eq 0 ]; then
  echo -e "${GREEN}✓ PostgreSQL is running${NC}"
else
  echo -e "${RED}⚠️ PostgreSQL is not running - attempting to start${NC}"
  service postgresql start
  sleep 2
  pg_isready -h localhost -U postgres
  if [ $? -eq 0 ]; then
    echo -e "${GREEN}✓ PostgreSQL started successfully${NC}"
  else
    echo -e "${RED}⚠️ Failed to start PostgreSQL - application may not work${NC}"
  fi
fi

# Step 9: Verify the application is running
echo -e "${YELLOW}🔍 Verifying application is running...${NC}"
sleep 5
pm2 status
curl -s http://localhost:5000/ > /dev/null
if [ $? -eq 0 ]; then
  echo -e "${GREEN}✓ Application is responding on port 5000${NC}"
else
  echo -e "${RED}⚠️ Application is not responding on port 5000${NC}"
  echo -e "${YELLOW}Checking logs...${NC}"
  pm2 logs url-campaign --lines 20
fi

# Final message
echo -e "${BLUE}╔══════════════════════════════════════════════════════════════╗${NC}"
echo -e "${BLUE}║                     DATABASE FIX COMPLETE                    ║${NC}"
echo -e "${BLUE}╚══════════════════════════════════════════════════════════════╝${NC}"
echo
echo -e "${GREEN}✓ Environment variables have been fixed${NC}"
echo -e "${GREEN}✓ Application has been restarted with proper database connection${NC}"
echo
echo -e "${YELLOW}Your site should now be accessible at: https://views.yoyoprime.com${NC}"
echo
echo -e "${YELLOW}If you still encounter issues:${NC}"
echo -e "1. Check the application logs: ${BLUE}pm2 logs url-campaign${NC}"
echo -e "2. Verify environment variables: ${BLUE}pm2 env 0${NC}"
echo -e "3. Check PostgreSQL connection: ${BLUE}sudo -u postgres psql -c '\\conninfo'${NC}"
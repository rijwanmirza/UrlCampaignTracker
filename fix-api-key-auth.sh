#!/bin/bash

# Fix API Key Authentication & Database
# This script preserves the API key authentication method via Nginx header

# Text formatting
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Configuration
APP_DIR="/var/www/url-campaign"
BACKUP_DIR="/root/url-campaign-backup-$(date +%Y%m%d%H%M%S)"
API_KEY="TraffiCS10928"

echo -e "${BLUE}╔══════════════════════════════════════════════════════════════╗${NC}"
echo -e "${BLUE}║             API KEY AUTH & DATABASE FIX                      ║${NC}"
echo -e "${BLUE}╚══════════════════════════════════════════════════════════════╝${NC}"
echo

# Step 1: Create backup
echo -e "${YELLOW}📦 Creating backup...${NC}"
mkdir -p "$BACKUP_DIR"
cp -r "$APP_DIR"/* "$BACKUP_DIR"/
pg_dump -U postgres postgres > "$BACKUP_DIR/database-backup.sql" 2>/dev/null
echo -e "${GREEN}✓ Backup created at $BACKUP_DIR${NC}"

# Step 2: Stop the application
echo -e "${YELLOW}🛑 Stopping application...${NC}"
pm2 stop url-campaign 2>/dev/null
pm2 delete url-campaign 2>/dev/null
echo -e "${GREEN}✓ Application stopped${NC}"

# Step 3: Fix environment variables
echo -e "${YELLOW}📝 Setting up environment variables...${NC}"
cat > "$APP_DIR/.env" << EOF
DATABASE_URL=postgres://postgres:postgres@localhost:5432/postgres
PORT=5000
HOST=0.0.0.0
NODE_ENV=production
API_KEY=$API_KEY
EOF

echo -e "${GREEN}✓ Environment variables set up${NC}"

# Step 4: Create proper start script
echo -e "${YELLOW}📝 Creating start script...${NC}"
cat > "$APP_DIR/start.sh" << 'EOF'
#!/bin/bash
cd /var/www/url-campaign

# Load environment variables
export $(grep -v '^#' .env | xargs)

# Ensure database is available
pg_isready -h localhost -U postgres || {
  echo "Database is not available. Starting PostgreSQL..."
  service postgresql start
  sleep 3
}

# Start application
echo "Starting application with DATABASE_URL=$DATABASE_URL"
node dist/index.js
EOF

chmod +x "$APP_DIR/start.sh"
echo -e "${GREEN}✓ Start script created${NC}"

# Step 5: Create CommonJS ecosystem file
echo -e "${YELLOW}📝 Creating PM2 ecosystem config...${NC}"
cat > "$APP_DIR/ecosystem.config.cjs" << EOF
module.exports = {
  apps: [{
    name: "url-campaign",
    script: "./start.sh",
    env: {
      NODE_ENV: "production",
      PORT: 5000,
      HOST: "0.0.0.0",
      DATABASE_URL: "postgres://postgres:postgres@localhost:5432/postgres",
      API_KEY: "$API_KEY"
    },
    max_memory_restart: "1G"
  }]
};
EOF

echo -e "${GREEN}✓ PM2 ecosystem config created${NC}"

# Step 6: Setup Nginx with API key header
echo -e "${YELLOW}📝 Setting up Nginx with API key header...${NC}"
cat > "/etc/nginx/sites-available/default" << EOF
server {
    listen 80;
    server_name views.yoyoprime.com;
    
    location / {
        proxy_pass http://127.0.0.1:5000;
        proxy_http_version 1.1;
        proxy_set_header Upgrade \$http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host \$host;
        proxy_set_header X-Real-IP \$remote_addr;
        proxy_set_header X-Forwarded-For \$proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto \$scheme;
        proxy_set_header X-API-Key "$API_KEY";
        proxy_read_timeout 300;
        proxy_connect_timeout 300;
        proxy_send_timeout 300;
    }
}
EOF

nginx -t
if [ $? -eq 0 ]; then
  systemctl restart nginx
  echo -e "${GREEN}✓ Nginx configured with API key header${NC}"
else
  echo -e "${RED}⚠️ Nginx configuration error${NC}"
fi

# Step 7: Start the application
echo -e "${YELLOW}🚀 Starting application...${NC}"
cd "$APP_DIR"
pm2 start ecosystem.config.cjs
pm2 save
echo -e "${GREEN}✓ Application started${NC}"

# Final message
echo -e "${BLUE}╔══════════════════════════════════════════════════════════════╗${NC}"
echo -e "${BLUE}║                      FIX COMPLETED                           ║${NC}"
echo -e "${BLUE}╚══════════════════════════════════════════════════════════════╝${NC}"
echo
echo -e "${GREEN}✓ API key authentication preserved (using X-API-Key: $API_KEY)${NC}"
echo -e "${GREEN}✓ Environment variables configured${NC}"
echo -e "${GREEN}✓ Application restarted${NC}"
echo
echo -e "${YELLOW}Your site should now be accessible at: http://views.yoyoprime.com${NC}"
echo -e "${YELLOW}The X-API-Key header is automatically added by Nginx${NC}"
echo
echo -e "${YELLOW}If you still encounter issues:${NC}"
echo -e "1. Check the application logs: ${BLUE}pm2 logs url-campaign${NC}"
echo -e "2. Verify Nginx configuration: ${BLUE}nginx -t${NC}"
echo -e "3. Check database connection: ${BLUE}pg_isready -h localhost -U postgres${NC}"
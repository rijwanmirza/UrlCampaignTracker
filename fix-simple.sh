#!/bin/bash

# Ultra-Simple Database Fix
# This script focuses on just the core database connection

# Text formatting
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Configuration
APP_DIR="/var/www/url-campaign"

echo -e "${BLUE}╔══════════════════════════════════════════════════════════════╗${NC}"
echo -e "${BLUE}║            ULTRA-SIMPLE DATABASE FIX                         ║${NC}"
echo -e "${BLUE}╚══════════════════════════════════════════════════════════════╝${NC}"
echo

# Step 1: Verify PostgreSQL is running
echo -e "${YELLOW}🔍 Checking PostgreSQL status...${NC}"
if ! pg_isready; then
  echo -e "${RED}⚠️ PostgreSQL is not running${NC}"
  echo -e "${YELLOW}🔄 Starting PostgreSQL...${NC}"
  service postgresql start
  sleep 3
  
  if ! pg_isready; then
    echo -e "${RED}⚠️ PostgreSQL failed to start${NC}"
    exit 1
  fi
else
  echo -e "${GREEN}✓ PostgreSQL is running${NC}"
fi

# Step 2: Create tables directly
echo -e "${YELLOW}🔧 Creating basic tables...${NC}"
sudo -u postgres psql -c "
CREATE TABLE IF NOT EXISTS campaigns (
  id SERIAL PRIMARY KEY,
  name VARCHAR(255) NOT NULL,
  description TEXT,
  trafficstar_id VARCHAR(255),
  auto_management BOOLEAN DEFAULT FALSE,
  multiplier NUMERIC(10,2) DEFAULT 1.0,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS urls (
  id SERIAL PRIMARY KEY,
  name VARCHAR(255) NOT NULL,
  target_url TEXT NOT NULL,
  campaign_id INTEGER,
  clicks INTEGER DEFAULT 0,
  click_limit INTEGER DEFAULT 1000,
  original_click_limit INTEGER,
  status VARCHAR(50) DEFAULT 'active',
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS original_url_records (
  id SERIAL PRIMARY KEY,
  name VARCHAR(255) NOT NULL,
  target_url TEXT NOT NULL,
  campaign_id INTEGER,
  clicks INTEGER DEFAULT 0,
  click_limit INTEGER NOT NULL,
  status VARCHAR(50) DEFAULT 'active',
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);"

echo -e "${GREEN}✓ Basic tables created${NC}"

# Step 3: Add a test campaign if needed
echo -e "${YELLOW}🌱 Checking if we need a test campaign...${NC}"
CAMPAIGN_COUNT=$(sudo -u postgres psql -t -c "SELECT COUNT(*) FROM campaigns;")
if [ -z "$CAMPAIGN_COUNT" ] || [ "$CAMPAIGN_COUNT" -eq "0" ]; then
  echo -e "${YELLOW}Adding a test campaign...${NC}"
  sudo -u postgres psql -c "INSERT INTO campaigns (name, description) VALUES ('Test Campaign', 'This is a test campaign created by fix script');"
  echo -e "${GREEN}✓ Test campaign created${NC}"
else
  echo -e "${GREEN}✓ Campaigns already exist, no need for test data${NC}"
fi

# Step 4: Simplify application environment
echo -e "${YELLOW}📝 Creating simple environment setup...${NC}"

# Create a simplified .env file
cat > "$APP_DIR/.env" << 'EOF'
DATABASE_URL=postgres://postgres:postgres@localhost:5432/postgres
PORT=5000
HOST=0.0.0.0
NODE_ENV=production
EOF

# Create a direct connection script
cat > "$APP_DIR/setup-db.js" << 'EOF'
const { Pool } = require('pg');

// Create a new Pool instance with hardcoded credentials
const pool = new Pool({
  user: 'postgres',
  host: 'localhost',
  database: 'postgres',
  password: 'postgres',
  port: 5432,
});

module.exports = {
  query: (text, params) => pool.query(text, params),
  pool
};
EOF

echo -e "${GREEN}✓ Simple environment setup created${NC}"

# Step 5: Create a direct start script
echo -e "${YELLOW}📝 Creating simple start script...${NC}"
cat > "$APP_DIR/start.sh" << 'EOF'
#!/bin/bash
cd /var/www/url-campaign

# Set environment variables directly
export DATABASE_URL=postgres://postgres:postgres@localhost:5432/postgres
export PORT=5000
export HOST=0.0.0.0
export NODE_ENV=production

# Start the application
node dist/index.js
EOF

chmod +x "$APP_DIR/start.sh"
echo -e "${GREEN}✓ Simple start script created${NC}"

# Step 6: Create a simplified PM2 ecosystem file
echo -e "${YELLOW}📝 Creating simple PM2 config...${NC}"
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
    }
  }]
};
EOF

echo -e "${GREEN}✓ Simple PM2 config created${NC}"

# Step 7: Update Nginx configuration
echo -e "${YELLOW}📝 Creating simplified Nginx config...${NC}"
cat > "/etc/nginx/sites-available/default" << 'EOF'
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

nginx -t
if [ $? -eq 0 ]; then
  systemctl restart nginx
  echo -e "${GREEN}✓ Nginx configuration updated${NC}"
else
  echo -e "${RED}⚠️ Nginx configuration error${NC}"
fi

# Step 8: Restart the application
echo -e "${YELLOW}🔄 Restarting application...${NC}"
cd "$APP_DIR"
pm2 stop url-campaign
pm2 delete url-campaign
pm2 start ecosystem.config.cjs
pm2 save
echo -e "${GREEN}✓ Application restarted${NC}"

# Final message
echo -e "${BLUE}╔══════════════════════════════════════════════════════════════╗${NC}"
echo -e "${BLUE}║                  SIMPLE FIX COMPLETE                         ║${NC}"
echo -e "${BLUE}╚══════════════════════════════════════════════════════════════╝${NC}"
echo
echo -e "${GREEN}✓ Basic database tables created${NC}"
echo -e "${GREEN}✓ Simplified environment setup${NC}"
echo -e "${GREEN}✓ Application restarted${NC}"
echo
echo -e "${YELLOW}Your site should now be accessible at: http://views.yoyoprime.com${NC}"
echo
echo -e "${YELLOW}If you still encounter issues:${NC}"
echo -e "1. Verify database connection: ${BLUE}sudo -u postgres psql -c '\\c postgres' -c '\\dt'${NC}"
echo -e "2. Check app logs: ${BLUE}pm2 logs url-campaign${NC}"
echo -e "3. Restart everything: ${BLUE}service postgresql restart && pm2 restart url-campaign${NC}"
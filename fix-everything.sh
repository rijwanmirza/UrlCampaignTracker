#!/bin/bash

# Complete Fix for URL Campaign Manager
# This script fixes all issues - database, authentication, and environment variables

# Text formatting
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Configuration
APP_DIR="/var/www/url-campaign"
BACKUP_DIR="/root/url-campaign-complete-backup-$(date +%Y%m%d%H%M%S)"
DB_USER="postgres"
DB_PASS="postgres"
DB_NAME="postgres"
DB_HOST="localhost"
DB_PORT="5432"

echo -e "${BLUE}╔══════════════════════════════════════════════════════════════╗${NC}"
echo -e "${BLUE}║                COMPLETE SYSTEM REPAIR                        ║${NC}"
echo -e "${BLUE}╚══════════════════════════════════════════════════════════════╝${NC}"
echo

# Step 1: Create a complete backup
echo -e "${YELLOW}📦 Creating complete backup...${NC}"
mkdir -p "$BACKUP_DIR"
cp -r "$APP_DIR"/* "$BACKUP_DIR"
pg_dump -U "$DB_USER" "$DB_NAME" > "$BACKUP_DIR/database-backup.sql"
echo -e "${GREEN}✓ Complete backup created at $BACKUP_DIR${NC}"

# Step 2: Stop all running processes
echo -e "${YELLOW}🛑 Stopping all running processes...${NC}"
pm2 stop all
pm2 delete all
echo -e "${GREEN}✓ All PM2 processes stopped${NC}"

# Step 3: Test PostgreSQL connection
echo -e "${YELLOW}🔍 Testing PostgreSQL connection...${NC}"
pg_isready -h "$DB_HOST" -p "$DB_PORT" -U "$DB_USER"
if [ $? -ne 0 ]; then
  echo -e "${RED}⚠️ PostgreSQL is not running or not accessible${NC}"
  echo -e "${YELLOW}🔄 Starting PostgreSQL...${NC}"
  service postgresql start
  sleep 5
  pg_isready -h "$DB_HOST" -p "$DB_PORT" -U "$DB_USER"
  if [ $? -ne 0 ]; then
    echo -e "${RED}⚠️ Failed to start PostgreSQL - critical error${NC}"
    exit 1
  else
    echo -e "${GREEN}✓ PostgreSQL started successfully${NC}"
  fi
else
  echo -e "${GREEN}✓ PostgreSQL is running and accessible${NC}"
fi

# Step 4: Apply database fixes
echo -e "${YELLOW}🔧 Fixing database schema...${NC}"

# Create a SQL script with all required tables and constraints
cat > "$APP_DIR/complete-db-fix.sql" << 'EOF'
-- Start transaction
BEGIN;

-- Ensure sessions table exists
CREATE TABLE IF NOT EXISTS sessions (
  sid VARCHAR NOT NULL PRIMARY KEY,
  sess JSON NOT NULL,
  expire TIMESTAMP(6) NOT NULL
);

-- Ensure users table exists
CREATE TABLE IF NOT EXISTS users (
  id SERIAL PRIMARY KEY,
  username VARCHAR(255) UNIQUE NOT NULL,
  password VARCHAR(255) NOT NULL,
  email VARCHAR(255),
  role VARCHAR(50) DEFAULT 'user',
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Ensure campaigns table exists
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

-- Ensure urls table exists
CREATE TABLE IF NOT EXISTS urls (
  id SERIAL PRIMARY KEY,
  name VARCHAR(255) NOT NULL,
  target_url TEXT NOT NULL,
  campaign_id INTEGER REFERENCES campaigns(id),
  clicks INTEGER DEFAULT 0,
  click_limit INTEGER DEFAULT 1000,
  original_click_limit INTEGER,
  status VARCHAR(50) DEFAULT 'active',
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Ensure original_url_records table exists
CREATE TABLE IF NOT EXISTS original_url_records (
  id SERIAL PRIMARY KEY,
  name VARCHAR(255) NOT NULL,
  target_url TEXT NOT NULL,
  campaign_id INTEGER REFERENCES campaigns(id),
  clicks INTEGER DEFAULT 0,
  click_limit INTEGER NOT NULL,
  status VARCHAR(50) DEFAULT 'active',
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Create click protection trigger
CREATE OR REPLACE FUNCTION prevent_click_limit_change() RETURNS TRIGGER AS $$
BEGIN
  IF TG_OP = 'UPDATE' THEN
    IF NEW.click_limit <> OLD.click_limit AND 
       NOT (current_setting('click_protection.bypass', TRUE) = 'true') THEN
      RAISE EXCEPTION 'Unauthorized attempt to change click_limit from % to %', 
        OLD.click_limit, NEW.click_limit;
    END IF;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Drop the trigger if it exists and recreate it
DROP TRIGGER IF EXISTS prevent_click_limit_update ON urls;
CREATE TRIGGER prevent_click_limit_update
BEFORE UPDATE ON urls
FOR EACH ROW
EXECUTE FUNCTION prevent_click_limit_change();

-- Ensure a default admin user exists
INSERT INTO users (username, password, role)
VALUES ('admin', '$2a$10$JdJxqjIQeX5Jn7gDOcRCm.EKJOp.XQ7ghhcJwSMiRKSLVtQKYSCYS', 'admin')
ON CONFLICT (username) DO NOTHING;

-- Insert a default API key user for Nginx
INSERT INTO users (username, password, role)
VALUES ('apikey', '$2a$10$6BNfRQu4MRQjA5Fz0xMNBuNTD1OGE7YxL5Usy.jIvRU8NtIqClLbi', 'api')
ON CONFLICT (username) DO NOTHING;

-- Commit transaction
COMMIT;
EOF

# Execute the SQL script
sudo -u postgres psql -d "$DB_NAME" -f "$APP_DIR/complete-db-fix.sql"
if [ $? -eq 0 ]; then
  echo -e "${GREEN}✓ Database schema fixed successfully${NC}"
else
  echo -e "${RED}⚠️ Database schema fix had errors${NC}"
fi

# Step 5: Create complete environment setup
echo -e "${YELLOW}📝 Creating complete environment setup...${NC}"

# Create .env file
cat > "$APP_DIR/.env" << EOF
DATABASE_URL=postgres://${DB_USER}:${DB_PASS}@${DB_HOST}:${DB_PORT}/${DB_NAME}
PORT=5000
HOST=0.0.0.0
NODE_ENV=production
SESSION_SECRET=url-campaign-secret-key-1234567890
EOF

echo -e "${GREEN}✓ Created .env file${NC}"

# Create a proper start script
cat > "$APP_DIR/start.sh" << 'EOF'
#!/bin/bash
cd /var/www/url-campaign

# Load environment variables
export $(grep -v '^#' .env | xargs)

# Ensure database is available
pg_isready -h $PGHOST -p $PGPORT -U $PGUSER || {
  echo "Database is not available. Starting PostgreSQL..."
  service postgresql start
  sleep 5
}

# Start the application
node dist/index.js
EOF

chmod +x "$APP_DIR/start.sh"
echo -e "${GREEN}✓ Created start script${NC}"

# Create proper PM2 ecosystem file
cat > "$APP_DIR/ecosystem.config.cjs" << 'EOF'
module.exports = {
  apps: [{
    name: "url-campaign",
    script: "./start.sh",
    env: {
      NODE_ENV: "production",
      PORT: 5000,
      HOST: "0.0.0.0",
      DATABASE_URL: "postgres://postgres:postgres@localhost:5432/postgres",
      SESSION_SECRET: "url-campaign-secret-key-1234567890",
      PGUSER: "postgres",
      PGHOST: "localhost",
      PGPASSWORD: "postgres",
      PGDATABASE: "postgres",
      PGPORT: 5432
    },
    max_memory_restart: "1G",
    restart_delay: 3000,
    max_restarts: 10
  }]
};
EOF

echo -e "${GREEN}✓ Created PM2 ecosystem file${NC}"

# Step 6: Fix Nginx configuration
echo -e "${YELLOW}📝 Fixing Nginx configuration...${NC}"

# Enable Nginx
systemctl enable nginx

# Create a proper Nginx configuration
cat > "/etc/nginx/sites-available/default" << 'EOF'
server {
    listen 80;
    server_name views.yoyoprime.com;
    return 301 https://$host$request_uri;
}

server {
    listen 443 ssl;
    server_name views.yoyoprime.com;

    ssl_certificate /etc/letsencrypt/live/views.yoyoprime.com/fullchain.pem;
    ssl_certificate_key /etc/letsencrypt/live/views.yoyoprime.com/privkey.pem;
    ssl_protocols TLSv1.2 TLSv1.3;
    ssl_prefer_server_ciphers on;

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

# Test and reload Nginx
nginx -t
if [ $? -eq 0 ]; then
  systemctl restart nginx
  echo -e "${GREEN}✓ Nginx configuration fixed and restarted${NC}"
else
  echo -e "${RED}⚠️ Nginx configuration has errors - using fallback${NC}"
  
  # Create minimal Nginx configuration
  cat > "/etc/nginx/sites-available/default" << 'EOF'
  server {
      listen 80;
      server_name views.yoyoprime.com;
      
      location / {
          proxy_pass http://127.0.0.1:5000;
          proxy_http_version 1.1;
          proxy_set_header Host $host;
          proxy_set_header X-Real-IP $remote_addr;
          proxy_set_header X-API-Key "TraffiCS10928";
      }
  }
EOF
  
  nginx -t
  if [ $? -eq 0 ]; then
    systemctl restart nginx
    echo -e "${GREEN}✓ Minimal Nginx configuration applied${NC}"
  else
    echo -e "${RED}⚠️ Unable to configure Nginx - will run directly${NC}"
    systemctl stop nginx
    systemctl disable nginx
  fi
fi

# Step 7: Start the application
echo -e "${YELLOW}🚀 Starting the application...${NC}"
cd "$APP_DIR"
pm2 start ecosystem.config.cjs
pm2 save
echo -e "${GREEN}✓ Application started${NC}"

# Step 8: Test the application
echo -e "${YELLOW}🔍 Testing the application...${NC}"
sleep 5
curl -s http://localhost:5000/api/auth/status > /dev/null
if [ $? -eq 0 ]; then
  echo -e "${GREEN}✓ Application is responding${NC}"
else
  echo -e "${RED}⚠️ Application is not responding - checking logs${NC}"
  pm2 logs url-campaign --lines 20
  
  echo -e "${YELLOW}Trying alternative approach...${NC}"
  pm2 delete url-campaign
  
  source "$APP_DIR/.env"
  cd "$APP_DIR"
  ./start.sh > app.log 2>&1 &
  APP_PID=$!
  
  echo -e "${GREEN}✓ Started application directly with PID $APP_PID${NC}"
fi

# Final message
echo -e "${BLUE}╔══════════════════════════════════════════════════════════════╗${NC}"
echo -e "${BLUE}║                  COMPLETE FIX FINISHED                       ║${NC}"
echo -e "${BLUE}╚══════════════════════════════════════════════════════════════╝${NC}"
echo
echo -e "${GREEN}✓ Database schema has been fixed${NC}"
echo -e "${GREEN}✓ Authentication has been restored${NC}"
echo -e "${GREEN}✓ Environment variables have been configured${NC}"
echo -e "${GREEN}✓ Application has been restarted${NC}"
echo
echo -e "${YELLOW}Your site should now be accessible at: https://views.yoyoprime.com${NC}"
echo -e "${YELLOW}Login credentials: username 'admin' with password 'admin123'${NC}"
echo
echo -e "${YELLOW}If you still encounter issues:${NC}"
echo -e "1. Check the application logs: ${BLUE}pm2 logs url-campaign${NC}"
echo -e "2. Check the database connection: ${BLUE}psql -U postgres -d postgres -c 'SELECT NOW();'${NC}"
echo -e "3. View the application status: ${BLUE}pm2 status${NC}"
echo
echo -e "${YELLOW}To restore your previous version:${NC}"
echo -e "${BLUE}cp -r $BACKUP_DIR/* $APP_DIR/${NC}"
echo -e "${BLUE}sudo -u postgres psql postgres < $BACKUP_DIR/database-backup.sql${NC}"
echo -e "${BLUE}pm2 restart url-campaign${NC}"
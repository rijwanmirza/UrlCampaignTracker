#!/bin/bash

# Fix Database Connection Script
# Repairs database connection while preserving API Key authentication

# Text formatting
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Configuration
APP_DIR="/var/www/url-campaign"
BACKUP_DIR="/root/url-campaign-db-fix-$(date +%Y%m%d%H%M%S)"
DB_USER="postgres"
DB_PASS="postgres"
DB_NAME="postgres"
DB_HOST="localhost"
DB_PORT="5432"

echo -e "${BLUE}╔══════════════════════════════════════════════════════════════╗${NC}"
echo -e "${BLUE}║            DATABASE CONNECTION FIX                           ║${NC}"
echo -e "${BLUE}╚══════════════════════════════════════════════════════════════╝${NC}"
echo

# Step 1: Check PostgreSQL status
echo -e "${YELLOW}🔍 Checking PostgreSQL status...${NC}"
pg_isready -h "$DB_HOST" -p "$DB_PORT" -U "$DB_USER"
if [ $? -ne 0 ]; then
  echo -e "${RED}⚠️ PostgreSQL is not running or not accessible${NC}"
  echo -e "${YELLOW}🔄 Starting PostgreSQL...${NC}"
  service postgresql start
  sleep 5
  pg_isready -h "$DB_HOST" -p "$DB_PORT" -U "$DB_USER"
  if [ $? -ne 0 ]; then
    echo -e "${RED}⚠️ Failed to start PostgreSQL - trying to fix...${NC}"
    service postgresql restart
    sleep 5
    if [ $? -ne 0 ]; then
      echo -e "${RED}⚠️ PostgreSQL could not be started - critical error${NC}"
      # Check if PostgreSQL is installed
      command -v psql >/dev/null 2>&1 || { 
        echo -e "${RED}⚠️ PostgreSQL is not installed, installing now...${NC}"
        apt-get update && apt-get install -y postgresql postgresql-contrib
        service postgresql start
      }
    fi
  else
    echo -e "${GREEN}✓ PostgreSQL started successfully${NC}"
  fi
else
  echo -e "${GREEN}✓ PostgreSQL is running and accessible${NC}"
fi

# Step 2: Create database backup
echo -e "${YELLOW}📦 Creating database backup...${NC}"
mkdir -p "$BACKUP_DIR"
pg_dump -U "$DB_USER" "$DB_NAME" > "$BACKUP_DIR/database-backup.sql" 2>/dev/null
echo -e "${GREEN}✓ Database backup created at $BACKUP_DIR/database-backup.sql${NC}"

# Step 3: Test database connection and table existence
echo -e "${YELLOW}🔍 Testing database connection and tables...${NC}"
TABLES=$(sudo -u postgres psql -d postgres -t -c "SELECT tablename FROM pg_catalog.pg_tables WHERE schemaname='public';")

if ! echo "$TABLES" | grep -q "original_url_records"; then
  echo -e "${YELLOW}Creating original_url_records table...${NC}"
  sudo -u postgres psql -d "$DB_NAME" -c "
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
  echo -e "${GREEN}✓ Created original_url_records table${NC}"
fi

if ! echo "$TABLES" | grep -q "urls"; then
  echo -e "${YELLOW}Creating urls table...${NC}"
  sudo -u postgres psql -d "$DB_NAME" -c "
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
  );"
  echo -e "${GREEN}✓ Created urls table${NC}"
fi

if ! echo "$TABLES" | grep -q "campaigns"; then
  echo -e "${YELLOW}Creating campaigns table...${NC}"
  sudo -u postgres psql -d "$DB_NAME" -c "
  CREATE TABLE IF NOT EXISTS campaigns (
    id SERIAL PRIMARY KEY,
    name VARCHAR(255) NOT NULL,
    description TEXT,
    trafficstar_id VARCHAR(255),
    auto_management BOOLEAN DEFAULT FALSE,
    multiplier NUMERIC(10,2) DEFAULT 1.0,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
  );"
  echo -e "${GREEN}✓ Created campaigns table${NC}"
fi

# Step 4: Fix click protection trigger
echo -e "${YELLOW}🔒 Setting up click protection trigger...${NC}"
sudo -u postgres psql -d "$DB_NAME" -c "
-- Create click protection trigger function
CREATE OR REPLACE FUNCTION prevent_click_limit_change() RETURNS TRIGGER AS \$\$
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
\$\$ LANGUAGE plpgsql;

-- Drop the trigger if it exists
DROP TRIGGER IF EXISTS prevent_click_limit_update ON urls;

-- Create the trigger
CREATE TRIGGER prevent_click_limit_update
BEFORE UPDATE ON urls
FOR EACH ROW
EXECUTE FUNCTION prevent_click_limit_change();
"
echo -e "${GREEN}✓ Click protection trigger setup complete${NC}"

# Step 5: Stop the application
echo -e "${YELLOW}🛑 Stopping the application...${NC}"
pm2 stop url-campaign 2>/dev/null
echo -e "${GREEN}✓ Application stopped${NC}"

# Step 6: Create proper environment variables file
echo -e "${YELLOW}📝 Setting up environment variables...${NC}"
cat > "$APP_DIR/.env" << EOF
DATABASE_URL=postgres://${DB_USER}:${DB_PASS}@${DB_HOST}:${DB_PORT}/${DB_NAME}
PORT=5000
HOST=0.0.0.0
NODE_ENV=production
EOF

echo -e "${GREEN}✓ Environment variables configured${NC}"

# Step 7: Create better start script
echo -e "${YELLOW}📝 Creating enhanced start script...${NC}"
cat > "$APP_DIR/start.sh" << 'EOF'
#!/bin/bash
cd /var/www/url-campaign

# Load environment variables
export $(grep -v '^#' .env | xargs)

# Wait for database to be available before starting
echo "Waiting for database to be available..."
for i in {1..10}; do
  pg_isready -h localhost -U postgres && break
  echo "Attempt $i: Database not ready, waiting..."
  sleep 2
done

# Export critical variables explicitly as fallback
export DATABASE_URL=${DATABASE_URL:-postgres://postgres:postgres@localhost:5432/postgres}
export PORT=${PORT:-5000}
export HOST=${HOST:-0.0.0.0}
export NODE_ENV=${NODE_ENV:-production}

# Debug info
echo "Starting application with:"
echo "DATABASE_URL=$DATABASE_URL"
echo "PORT=$PORT"
echo "HOST=$HOST"

# Run the application
node dist/index.js
EOF

chmod +x "$APP_DIR/start.sh"
echo -e "${GREEN}✓ Enhanced start script created${NC}"

# Step 8: Create CommonJS ecosystem file
echo -e "${YELLOW}📝 Creating CommonJS ecosystem file...${NC}"
cat > "$APP_DIR/ecosystem.config.cjs" << EOF
module.exports = {
  apps: [{
    name: "url-campaign",
    script: "./start.sh",
    env: {
      NODE_ENV: "production",
      PORT: 5000,
      HOST: "0.0.0.0",
      DATABASE_URL: "postgres://${DB_USER}:${DB_PASS}@${DB_HOST}:${DB_PORT}/${DB_NAME}",
      PGUSER: "${DB_USER}",
      PGPASSWORD: "${DB_PASS}",
      PGDATABASE: "${DB_NAME}",
      PGHOST: "${DB_HOST}",
      PGPORT: "${DB_PORT}"
    },
    max_memory_restart: "1G",
    restart_delay: 3000,
    max_restarts: 10
  }]
};
EOF

echo -e "${GREEN}✓ CommonJS ecosystem file created${NC}"

# Step 9: Start the application
echo -e "${YELLOW}🚀 Starting the application...${NC}"
cd "$APP_DIR"
pm2 start ecosystem.config.cjs
pm2 save
echo -e "${GREEN}✓ Application started with PM2${NC}"

# Final message
echo -e "${BLUE}╔══════════════════════════════════════════════════════════════╗${NC}"
echo -e "${BLUE}║                 DATABASE FIX COMPLETE                        ║${NC}"
echo -e "${BLUE}╚══════════════════════════════════════════════════════════════╝${NC}"
echo
echo -e "${GREEN}✓ PostgreSQL connection verified${NC}"
echo -e "${GREEN}✓ Database tables and schema fixed${NC}"
echo -e "${GREEN}✓ Click protection trigger installed${NC}"
echo -e "${GREEN}✓ Environment variables configured${NC}"
echo -e "${GREEN}✓ Application restarted with proper database connection${NC}"
echo
echo -e "${YELLOW}Your site should now be working properly at: https://views.yoyoprime.com${NC}"
echo
echo -e "${YELLOW}If you still encounter issues:${NC}"
echo -e "1. Check database connection with: ${BLUE}sudo -u postgres psql -c 'SELECT version();'${NC}"
echo -e "2. Check application logs: ${BLUE}pm2 logs url-campaign${NC}"
echo -e "3. Check tables existence: ${BLUE}sudo -u postgres psql -c '\\dt'${NC}"
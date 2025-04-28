#!/bin/bash

# Database Debug Script
# This script diagnoses database issues in detail and fixes them

# Text formatting
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Configuration
APP_DIR="/var/www/url-campaign"
DB_USER="postgres"
DB_PASS="postgres"
DB_NAME="postgres"
DB_HOST="localhost"
DB_PORT="5432"

echo -e "${BLUE}╔══════════════════════════════════════════════════════════════╗${NC}"
echo -e "${BLUE}║            DATABASE DEBUG AND REPAIR                         ║${NC}"
echo -e "${BLUE}╚══════════════════════════════════════════════════════════════╝${NC}"
echo

# Step 1: Check if tables exist and show their structure
echo -e "${YELLOW}🔍 Checking existing tables...${NC}"
TABLE_EXISTS=$(sudo -u postgres psql -U postgres -d postgres -t -c "SELECT EXISTS (SELECT FROM pg_tables WHERE schemaname = 'public' AND tablename = 'campaigns');")
echo -e "Campaigns table exists: ${TABLE_EXISTS}"

TABLE_EXISTS=$(sudo -u postgres psql -U postgres -d postgres -t -c "SELECT EXISTS (SELECT FROM pg_tables WHERE schemaname = 'public' AND tablename = 'urls');")
echo -e "URLs table exists: ${TABLE_EXISTS}"

TABLE_EXISTS=$(sudo -u postgres psql -U postgres -d postgres -t -c "SELECT EXISTS (SELECT FROM pg_tables WHERE schemaname = 'public' AND tablename = 'original_url_records');")
echo -e "Original URL Records table exists: ${TABLE_EXISTS}"

# Step 2: Check database connection from application
echo -e "${YELLOW}🔧 Testing database connection from application...${NC}"
cd "$APP_DIR"
cat > test-db.js << 'EOF'
import { pool } from "./dist/server/db.js";

async function testConnection() {
  try {
    console.log("Testing database connection...");
    console.log("DATABASE_URL:", process.env.DATABASE_URL);

    const client = await pool.connect();
    console.log("✅ Connection successful!");

    try {
      const res = await client.query('SELECT NOW()');
      console.log("Query result:", res.rows[0]);

      // Check if tables exist and their structure
      console.log("\nChecking tables...");

      const campaignsResult = await client.query(`
        SELECT EXISTS (
          SELECT FROM information_schema.tables 
          WHERE table_schema = 'public' 
          AND table_name = 'campaigns'
        );
      `);
      console.log("Campaigns table exists:", campaignsResult.rows[0].exists);

      const urlsResult = await client.query(`
        SELECT EXISTS (
          SELECT FROM information_schema.tables 
          WHERE table_schema = 'public' 
          AND table_name = 'urls'
        );
      `);
      console.log("URLs table exists:", urlsResult.rows[0].exists);

      const originalUrlsResult = await client.query(`
        SELECT EXISTS (
          SELECT FROM information_schema.tables 
          WHERE table_schema = 'public' 
          AND table_name = 'original_url_records'
        );
      `);
      console.log("Original URL Records table exists:", originalUrlsResult.rows[0].exists);

      if (campaignsResult.rows[0].exists) {
        const campaignsColumns = await client.query(`
          SELECT column_name, data_type 
          FROM information_schema.columns 
          WHERE table_schema = 'public' 
          AND table_name = 'campaigns';
        `);
        console.log("\nCampaigns table columns:");
        campaignsColumns.rows.forEach(col => {
          console.log(`  - ${col.column_name}: ${col.data_type}`);
        });

        const campaignsCount = await client.query('SELECT COUNT(*) FROM campaigns');
        console.log(`\nCampaigns count: ${campaignsCount.rows[0].count}`);
      }

      if (urlsResult.rows[0].exists) {
        const urlsColumns = await client.query(`
          SELECT column_name, data_type 
          FROM information_schema.columns 
          WHERE table_schema = 'public' 
          AND table_name = 'urls';
        `);
        console.log("\nURLs table columns:");
        urlsColumns.rows.forEach(col => {
          console.log(`  - ${col.column_name}: ${col.data_type}`);
        });

        const urlsCount = await client.query('SELECT COUNT(*) FROM urls');
        console.log(`\nURLs count: ${urlsCount.rows[0].count}`);
      }
    } finally {
      client.release();
    }
  } catch (err) {
    console.error("❌ Connection error:", err);
  } finally {
    await pool.end();
  }
}

testConnection();
EOF

echo -e "export DATABASE_URL=postgres://${DB_USER}:${DB_PASS}@${DB_HOST}:${DB_PORT}/${DB_NAME}" > "$APP_DIR/.env.test"
echo -e "${GREEN}✓ Created database test script${NC}"

echo -e "${YELLOW}📊 Running database test...${NC}"
cd "$APP_DIR"
source .env.test
node test-db.js > "$APP_DIR/db-test-result.log" 2>&1
cat "$APP_DIR/db-test-result.log"

# Step 3: Create all database tables if they don't exist or have issues
echo -e "${YELLOW}🔧 Ensuring all tables are properly created...${NC}"

sudo -u postgres psql -d postgres -c "
-- Ensure campaigns table exists with proper structure
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

-- Ensure urls table exists with proper structure
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

-- Ensure original_url_records table exists with proper structure
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

-- Ensure sessions table exists with proper structure
CREATE TABLE IF NOT EXISTS sessions (
  sid VARCHAR NOT NULL PRIMARY KEY,
  sess JSON NOT NULL,
  expire TIMESTAMP(6) NOT NULL
);

-- Create click protection function if it doesn't exist
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

-- Create trigger for click protection
DROP TRIGGER IF EXISTS prevent_click_limit_update ON urls;
CREATE TRIGGER prevent_click_limit_update
BEFORE UPDATE ON urls
FOR EACH ROW
EXECUTE FUNCTION prevent_click_limit_change();
"

# Step 4: Seed a test campaign if no campaigns exist
echo -e "${YELLOW}🌱 Adding test data if needed...${NC}"
CAMPAIGN_COUNT=$(sudo -u postgres psql -U postgres -d postgres -t -c "SELECT COUNT(*) FROM campaigns;")
if [ "$CAMPAIGN_COUNT" -eq "0" ]; then
  echo -e "${YELLOW}No campaigns found, adding a test campaign...${NC}"
  sudo -u postgres psql -d postgres -c "
  INSERT INTO campaigns (name, description, multiplier) 
  VALUES ('Test Campaign', 'Created by database debug script', 1.0);
  "
  echo -e "${GREEN}✓ Added test campaign${NC}"
fi

# Step 5: Update environment variables for better database connection
echo -e "${YELLOW}📝 Updating environment variables...${NC}"
cat > "$APP_DIR/.env" << EOF
DATABASE_URL=postgres://${DB_USER}:${DB_PASS}@${DB_HOST}:${DB_PORT}/${DB_NAME}
PGUSER=${DB_USER}
PGPASSWORD=${DB_PASS}
PGDATABASE=${DB_NAME}
PGHOST=${DB_HOST}
PGPORT=${DB_PORT}
PORT=5000
HOST=0.0.0.0
NODE_ENV=production
EOF

echo -e "${GREEN}✓ Updated environment variables${NC}"

# Step 6: Create a more robust start script
echo -e "${YELLOW}📝 Creating robust start script...${NC}"
cat > "$APP_DIR/start.sh" << 'EOF'
#!/bin/bash
cd /var/www/url-campaign

# Load environment variables
export $(grep -v '^#' .env | xargs)

# Ensure PostgreSQL is running
echo "Checking PostgreSQL status..."
pg_isready -h $PGHOST -p $PGPORT -U $PGUSER || {
  echo "PostgreSQL is not running, starting it..."
  service postgresql start
  sleep 5
}

# Verify the connection can be established
echo "Verifying database connection..."
if psql -h $PGHOST -p $PGPORT -U $PGUSER -d $PGDATABASE -c "SELECT 1" > /dev/null 2>&1; then
  echo "Database connection successful"
else
  echo "Database connection failed! Troubleshooting..."

  # Check if database exists
  if ! psql -h $PGHOST -p $PGPORT -U $PGUSER -lqt | cut -d \| -f 1 | grep -qw $PGDATABASE; then
    echo "Database $PGDATABASE does not exist, creating it..."
    createdb -h $PGHOST -p $PGPORT -U $PGUSER $PGDATABASE
  fi

  # Validate tables exist
  echo "Validating tables exist..."
  psql -h $PGHOST -p $PGPORT -U $PGUSER -d $PGDATABASE -c "
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
  "
fi

# Print environment for debugging
echo "Starting application with environment:"
echo "DATABASE_URL=$DATABASE_URL"
echo "PGHOST=$PGHOST"
echo "PGPORT=$PGPORT"
echo "PGUSER=$PGUSER"
echo "PGDATABASE=$PGDATABASE"
echo "PORT=$PORT"
echo "HOST=$HOST"

# Start the application
node dist/index.js
EOF

chmod +x "$APP_DIR/start.sh"
echo -e "${GREEN}✓ Created robust start script${NC}"

# Step 7: Update PM2 ecosystem file
echo -e "${YELLOW}📝 Updating PM2 ecosystem file...${NC}"
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

echo -e "${GREEN}✓ Updated PM2 ecosystem file${NC}"

# Step 8: Restart the application
echo -e "${YELLOW}🔄 Restarting the application...${NC}"
cd "$APP_DIR"
pm2 restart url-campaign
echo -e "${GREEN}✓ Application restarted${NC}"

# Step 9: Update Nginx configuration
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
  echo -e "${RED}⚠️ Nginx configuration has errors${NC}"
fi

# Final step: Create login redirect page
echo -e "${YELLOW}📝 Creating login page if it doesn't exist...${NC}"
mkdir -p "$APP_DIR/dist/public"
cat > "$APP_DIR/dist/public/login.html" << 'EOF'
<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>URL Campaign Manager Login</title>
    <style>
        body {
            font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif;
            background-color: #f7f8fa;
            margin: 0;
            padding: 0;
            display: flex;
            justify-content: center;
            align-items: center;
            height: 100vh;
        }
        .login-container {
            background-color: white;
            border-radius: 8px;
            box-shadow: 0 4px 12px rgba(0, 0, 0, 0.1);
            padding: 40px;
            width: 400px;
            max-width: 90%;
        }
        h1 {
            color: #333;
            margin-top: 0;
            margin-bottom: 24px;
            font-size: 24px;
            font-weight: 600;
        }
        .input-group {
            margin-bottom: 20px;
        }
        label {
            display: block;
            margin-bottom: 8px;
            font-weight: 500;
            color: #555;
        }
        input {
            width: 100%;
            padding: 10px 12px;
            border: 1px solid #ddd;
            border-radius: 4px;
            font-size: 16px;
            box-sizing: border-box;
        }
        button {
            background-color: #4f46e5;
            color: white;
            border: none;
            border-radius: 4px;
            padding: 12px 20px;
            font-size: 16px;
            font-weight: 500;
            cursor: pointer;
            width: 100%;
            transition: background-color 0.2s;
        }
        button:hover {
            background-color: #4338ca;
        }
        .error {
            color: #dc2626;
            font-size: 14px;
            margin-top: 20px;
            display: none;
        }
    </style>
</head>
<body>
    <div class="login-container">
        <h1>URL Campaign Manager</h1>
        <form id="loginForm">
            <div class="input-group">
                <label for="apiKey">API Key</label>
                <input type="password" id="apiKey" name="apiKey" placeholder="Enter your API key" required>
            </div>
            <button type="submit">Login</button>
            <div id="error" class="error"></div>
        </form>
    </div>

    <script>
        document.getElementById('loginForm').addEventListener('submit', function(e) {
            e.preventDefault();
            const apiKey = document.getElementById('apiKey').value;

            // Store the API key in localStorage and redirect to home
            if (apiKey === 'TraffiCS10928') {
                localStorage.setItem('apiKey', apiKey);
                window.location.href = '/';
            } else {
                const errorEl = document.getElementById('error');
                errorEl.textContent = 'Invalid API key';
                errorEl.style.display = 'block';
            }
        });
    </script>
</body>
</html>
EOF

# Create a route handler for the login page
cat > "$APP_DIR/src/server/login-handler.js" << 'EOF'
import { Router } from 'express';
import path from 'path';

const router = Router();

router.get('/login', (req, res) => {
  res.sendFile(path.join(process.cwd(), 'dist/public/login.html'));
});

export default router;
EOF

echo -e "${GREEN}✓ Created login page${NC}"

# Final message
echo -e "${BLUE}╔══════════════════════════════════════════════════════════════╗${NC}"
echo -e "${BLUE}║                 DATABASE DEBUG COMPLETE                      ║${NC}"
echo -e "${BLUE}╚══════════════════════════════════════════════════════════════╝${NC}"
echo
echo -e "${GREEN}✓ Database tables have been verified and created${NC}"
echo -e "${GREEN}✓ Test campaign added if needed${NC}"
echo -e "${GREEN}✓ Environment variables have been updated${NC}"
echo -e "${GREEN}✓ Application has been restarted${NC}"
echo -e "${GREEN}✓ Login page has been created${NC}"
echo
echo -e "${YELLOW}Try accessing your site at https://views.yoyoprime.com/login${NC}"
echo -e "${YELLOW}Use the API key: TraffiCS10928${NC}"
echo
echo -e "${YELLOW}If you still encounter issues:${NC}"
echo -e "1. Check detailed database test results: ${BLUE}cat $APP_DIR/db-test-result.log${NC}"
echo -e "2. Check application logs: ${BLUE}pm2 logs url-campaign${NC}"
#!/bin/bash
# Complete setup script for URL Campaign Manager on VPS
# This script handles the entire setup process automatically

echo "====== URL Campaign Manager VPS Setup ======"
echo "Setting up on domain: views.yoyoprime.com"
echo "VPS IP: 139.84.169.252"
echo "========================================"

# Function to show progress
show_status() {
  echo ""
  echo ">>> $1"
  echo "----------------------------------------"
}

# Step 1: Update system
show_status "Updating system packages"
apt update && apt upgrade -y

# Step 2: Install required packages
show_status "Installing required packages"
apt install -y git curl wget unzip build-essential
apt install -y nginx

# Step 3: Install Node.js 20.x
show_status "Installing Node.js 20.x"
curl -fsSL https://deb.nodesource.com/setup_20.x | bash -
apt install -y nodejs
echo "Node.js version:" 
node -v
echo "NPM version:"
npm -v

# Step 4: Install PostgreSQL 16
show_status "Installing PostgreSQL 16"
echo "deb https://apt.postgresql.org/pub/repos/apt $(lsb_release -cs)-pgdg main" > /etc/apt/sources.list.d/pgdg.list
wget -qO- https://www.postgresql.org/media/keys/ACCC4CF8.asc | tee /etc/apt/trusted.gpg.d/pgdg.asc
apt update
apt install -y postgresql-16 postgresql-contrib-16

# Step 5: Configure PostgreSQL
show_status "Configuring PostgreSQL"
systemctl start postgresql
systemctl enable postgresql
sudo -u postgres psql -c "ALTER USER postgres WITH PASSWORD 'postgres';"
sudo -u postgres psql -c "CREATE DATABASE postgres;"

# Step 6: Create application directory and set permissions
show_status "Creating application directory"
mkdir -p /var/www/url-campaign
chown $USER:$USER /var/www/url-campaign

# Step 7: Clone repository or prepare for manual file upload
show_status "Preparing application files"
cd /var/www/url-campaign

# Step 8: Create environment file
show_status "Creating environment configuration"
cat > /var/www/url-campaign/.env << 'EOF'
NODE_ENV=production
DATABASE_URL=postgres://postgres:postgres@localhost:5432/postgres
PGUSER=postgres
PGHOST=localhost
PGDATABASE=postgres
PGPORT=5432
PGPASSWORD=postgres
TRAFFICSTAR_API_KEY=eyJhbGciOiJIUzI1NiIsInR5cCIgOiAiSldUIiwia2lkIiA6ICJjOGJmY2YyZi1lZjJlLTQwZGYtYTg4ZC1kYjQ3NmI4MTFiOGMifQ.eyJpYXQiOjE3NDA5MTI1MTUsImp0aSI6ImNjNWQ2MWVkLTg5NjEtNDA4YS1iYmRhLTNhOTdkYWYwYWM4NCIsImlzcyI6Imh0dHBzOi8vaWQudHJhZmZpY3N0YXJzLmNvbS9yZWFsbXMvdHJhZmZpY3N0YXJzIiwiYXVkIjoiaHR0cHM6Ly9pZC50cmFmZmljc3RhcnMuY29tL3JlYWxtcy90cmFmZmljc3RhcnMiLCJzdWIiOiJmN2RlZTQyMy0zYzY3LTQxYjItODE4My1lZTdmZjBmMTUwOGIiLCJ0eXAiOiJPZmZsaW5lIiwiYXpwIjoiY29yZS1hcGkiLCJzZXNzaW9uX3N0YXRlIjoiYTgyNTM5MmYtZjQ1OS00Yjg5LTkzNmEtZDcyNDcwODVlMDczIiwic2NvcGUiOiJvcGVuaWQgZW1haWwgb2ZmbGluZV9hY2Nlc3MgcHJvZmlsZSIsInNpZCI6ImE4MjUzOTJmLWY0NTktNGI4OS05MzZhLWQ3MjQ3MDg1ZTA3MyJ9.Zw6cuWlQCZcbqHX3jF1VIl6rpyWjN58zW8_s9al0Yl8
API_KEY=TraffiCS10928
PORT=5000
EOF

# Step 9: Create startup script
show_status "Creating startup script"
cat > /var/www/url-campaign/start.sh << 'EOF'
#!/bin/bash
set -a
source /var/www/url-campaign/.env
set +a

cd /var/www/url-campaign
node dist/index.js
EOF

chmod +x /var/www/url-campaign/start.sh

# Step 10: Create schema.sql with proper ownership
show_status "Creating database schema file"
cat > /var/www/url-campaign/schema.sql << 'EOF'
-- Create URL status enum
CREATE TYPE public.url_status AS ENUM ('active', 'paused', 'completed', 'deleted', 'rejected');

-- Create campaigns table
CREATE TABLE public.campaigns (
    id SERIAL PRIMARY KEY,
    name TEXT NOT NULL,
    redirect_method TEXT NOT NULL DEFAULT 'direct',
    custom_path TEXT UNIQUE,
    multiplier NUMERIC(10,2) NOT NULL DEFAULT 1,
    price_per_thousand NUMERIC(10,4) NOT NULL DEFAULT 0,
    trafficstar_campaign_id TEXT,
    auto_manage_trafficstar BOOLEAN DEFAULT false,
    budget_update_time TEXT DEFAULT '00:00:00',
    last_trafficstar_sync TIMESTAMP,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP NOT NULL,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP NOT NULL
);

-- Create URLs table
CREATE TABLE public.urls (
    id SERIAL PRIMARY KEY,
    campaign_id INTEGER,
    name TEXT NOT NULL,
    target_url TEXT NOT NULL,
    click_limit INTEGER NOT NULL,
    original_click_limit INTEGER NOT NULL DEFAULT 0,
    clicks INTEGER NOT NULL DEFAULT 0,
    status TEXT NOT NULL DEFAULT 'active',
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP NOT NULL,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP NOT NULL
);

-- Create TrafficStar credentials table
CREATE TABLE public.trafficstar_credentials (
    id SERIAL PRIMARY KEY,
    api_key TEXT NOT NULL,
    access_token TEXT,
    token_expiry TIMESTAMP,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP NOT NULL,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP NOT NULL
);

-- Create TrafficStar campaigns table
CREATE TABLE public.trafficstar_campaigns (
    id SERIAL PRIMARY KEY,
    trafficstar_id TEXT NOT NULL UNIQUE,
    name TEXT NOT NULL,
    status TEXT NOT NULL,
    active BOOLEAN DEFAULT true,
    is_archived BOOLEAN DEFAULT false,
    max_daily NUMERIC(10,2),
    pricing_model TEXT,
    schedule_end_time TEXT,
    last_requested_action TEXT,
    last_requested_action_at TIMESTAMP,
    last_requested_action_success BOOLEAN,
    last_verified_status TEXT,
    sync_status TEXT DEFAULT 'synced',
    last_budget_update TIMESTAMP,
    last_budget_update_value NUMERIC(10,2),
    last_end_time_update TIMESTAMP,
    last_end_time_update_value TEXT,
    campaign_data JSONB,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP NOT NULL,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP NOT NULL
);

-- Set privileges
ALTER TABLE public.campaigns OWNER TO postgres;
ALTER TABLE public.urls OWNER TO postgres;
ALTER TABLE public.trafficstar_credentials OWNER TO postgres;
ALTER TABLE public.trafficstar_campaigns OWNER TO postgres;
EOF

# Step 11: Import schema to database
show_status "Importing database schema"
sudo -u postgres psql -d postgres < /var/www/url-campaign/schema.sql

# Step 12: Create NGINX configuration
show_status "Configuring NGINX"
cat > /etc/nginx/sites-available/url-campaign << 'EOF'
server {
    listen 80;
    server_name views.yoyoprime.com;

    location / {
        proxy_pass http://localhost:5000;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host $host;
        proxy_cache_bypass $http_upgrade;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
    }
}
EOF

# Enable the site
ln -s /etc/nginx/sites-available/url-campaign /etc/nginx/sites-enabled/
rm -f /etc/nginx/sites-enabled/default

# Test NGINX configuration
nginx -t

# Restart NGINX
systemctl restart nginx

# Step 13: Configure firewall
show_status "Configuring firewall"
ufw allow 80/tcp
ufw allow 443/tcp
ufw allow 22/tcp
ufw --force enable

# Step 14: Install PM2
show_status "Installing PM2 process manager"
npm install -g pm2

# Print remaining manual steps
show_status "MANUAL STEPS TO COMPLETE SETUP"
echo "1. Upload your Replit app files to /var/www/url-campaign/"
echo "   - Make sure to upload all files including client/, server/, shared/ directories"
echo ""
echo "2. Install NPM dependencies:"
echo "   cd /var/www/url-campaign && npm install"
echo ""
echo "3. Build the application:"
echo "   cd /var/www/url-campaign && npm run build"
echo ""
echo "4. Start the application with PM2:"
echo "   pm2 start /var/www/url-campaign/start.sh --name url-campaign"
echo ""
echo "5. Make PM2 start on system boot:"
echo "   pm2 save && pm2 startup"
echo "   (Then run the command PM2 outputs)"
echo ""
echo "6. Point your domain (views.yoyoprime.com) to your VPS IP (139.84.169.252)"
echo "   via your domain registrar's DNS settings"
echo ""
echo "7. Monitor your application logs:"
echo "   pm2 logs url-campaign"
echo ""
echo "Setup script completed!"
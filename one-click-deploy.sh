#!/bin/bash
# ONE-CLICK DEPLOYMENT - EXACT COPY - NO CHANGES

echo "==== CREATING EXACT COPY OF REPLIT ENVIRONMENT ===="

# Step 1: Update system only
apt-get update
apt-get upgrade -y

# Step 2: Install exact same packages
apt-get install -y curl git nodejs npm postgresql postgresql-contrib nginx build-essential unzip

# Step 3: Install Node.js 20.x (same as Replit)
curl -fsSL https://deb.nodesource.com/setup_20.x | bash -
apt-get install -y nodejs

# Step 4: Set up PostgreSQL exactly the same
sudo -u postgres psql -c "CREATE USER urlapp WITH PASSWORD 'urlapp_password';"
sudo -u postgres psql -c "CREATE DATABASE urlapp OWNER urlapp;"
sudo -u postgres psql -c "GRANT ALL PRIVILEGES ON DATABASE urlapp TO urlapp;"

# Step 5: Set up application directory - EXACTLY THE SAME
mkdir -p /opt/url-system

# Step 6: Configure environment variables - EXACTLY THE SAME
cat > /etc/environment << 'EOL'
PATH="/usr/local/sbin:/usr/local/bin:/usr/sbin:/usr/bin:/sbin:/bin:/usr/games:/usr/local/games:/snap/bin"
DATABASE_URL="postgres://urlapp:urlapp_password@localhost:5432/urlapp"
PGUSER="urlapp"
PGPASSWORD="urlapp_password"
PGDATABASE="urlapp"
PGHOST="localhost"
PGPORT="5432"
EOL

# Apply environment variables
source /etc/environment

# Step 7: Configure service - EXACTLY THE SAME
cat > /etc/systemd/system/url-system.service << 'EOL'
[Unit]
Description=URL Management System
After=network.target postgresql.service

[Service]
Environment=NODE_ENV=production
Environment=DATABASE_URL=postgres://urlapp:urlapp_password@localhost:5432/urlapp
Environment=PGUSER=urlapp
Environment=PGPASSWORD=urlapp_password
Environment=PGDATABASE=urlapp
Environment=PGHOST=localhost
Environment=PGPORT=5432
Type=simple
User=root
WorkingDirectory=/opt/url-system
ExecStart=/usr/bin/node dist/server/index.js
Restart=on-failure

[Install]
WantedBy=multi-user.target
EOL

# Step 8: Configure Nginx - EXACTLY THE SAME
cat > /etc/nginx/sites-available/url-system << 'EOL'
server {
    listen 80;
    server_name _;

    location / {
        proxy_pass http://localhost:5000;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host $host;
        proxy_cache_bypass $http_upgrade;
    }
}
EOL

# Enable Nginx site
ln -s /etc/nginx/sites-available/url-system /etc/nginx/sites-enabled/
rm -f /etc/nginx/sites-enabled/default
nginx -t
systemctl reload nginx

echo "==== STEP 9: MOVING FILES TO CORRECT LOCATIONS ===="
# This assumes you've uploaded the ZIP file to /root/project.zip
# and the database.sql file to /root/database.sql

# Setup URLs directory
cd /opt

# Extract your project.zip to /opt/url-system
# Fixing the nested directory problem automatically
unzip -o /root/project.zip -d /tmp/extract
if [ -d "/tmp/extract/UrlCampaignTracker" ]; then
  echo "Moving files from nested 'UrlCampaignTracker' folder to correct location..."
  cp -rf /tmp/extract/UrlCampaignTracker/* /opt/url-system/
  cp -rf /tmp/extract/UrlCampaignTracker/.* /opt/url-system/ 2>/dev/null || true
else
  echo "Moving files from ZIP root to correct location..."
  cp -rf /tmp/extract/* /opt/url-system/
  cp -rf /tmp/extract/.* /opt/url-system/ 2>/dev/null || true
fi

rm -rf /tmp/extract

echo "==== STEP 10: IMPORTING DATABASE ===="
# Create a modified version of the database file - fixing Neon DB specific parts
cat /root/database.sql | grep -v "neondb_owner" | grep -v "neon_superuser" > /root/fixed_database.sql

# Import database
cat /root/fixed_database.sql | sudo -u postgres psql urlapp

echo "==== STEP 11: BUILDING THE APPLICATION ===="
cd /opt/url-system
npm install
npm run build

echo "==== STEP 12: STARTING THE SERVICE ===="
systemctl enable url-system
systemctl start url-system

echo "==== DEPLOYMENT COMPLETE ===="
echo ""
echo "Your application should now be running at: http://YOUR_SERVER_IP"
echo ""
echo "If there are any issues, check the logs with:"
echo "journalctl -u url-system -n 100"
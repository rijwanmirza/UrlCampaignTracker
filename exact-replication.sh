#!/bin/bash
# EXACT replication of Replit environment - no changes whatsoever

# Step 1: Update system only
apt-get update
apt-get upgrade -y

# Step 2: Install exact same packages
apt-get install -y curl git nodejs npm postgresql postgresql-contrib nginx build-essential

# Step 3: Install Node.js 20.x (same as Replit)
curl -fsSL https://deb.nodesource.com/setup_20.x | bash -
apt-get install -y nodejs

# Step 4: Set up PostgreSQL exactly the same
sudo -u postgres psql -c "CREATE USER urlapp WITH PASSWORD 'urlapp_password';"
sudo -u postgres psql -c "CREATE DATABASE urlapp OWNER urlapp;"
sudo -u postgres psql -c "GRANT ALL PRIVILEGES ON DATABASE urlapp TO urlapp;"

# Step 5: Create application directory with exact same path
mkdir -p /opt/url-system

# Step 6: Copy exactly the same environment variables
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

# Step 7: Configure service with exact same settings
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

# Step 8: Configure Nginx exactly the same
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

# Final instructions message
echo "======================= READ THESE INSTRUCTIONS ========================="
echo "Now you need to:"
echo ""
echo "1. Copy ALL project files from Replit to /opt/url-system/"
echo "   - Download as ZIP from Replit and extract, or"
echo "   - Use SFTP/SCP to transfer all files"
echo ""
echo "2. Import your database exactly as it is:"
echo "   - On Replit run: pg_dump \$DATABASE_URL > database.sql"
echo "   - Transfer database.sql to this server"
echo "   - Run: cat /path/to/database.sql | sudo -u postgres psql urlapp"
echo ""
echo "3. Navigate to the application directory and install dependencies:"
echo "   cd /opt/url-system"
echo "   npm install"
echo "   npm run build"
echo ""
echo "4. Start the service:"
echo "   systemctl enable url-system"
echo "   systemctl start url-system"
echo ""
echo "5. Check service status:"
echo "   systemctl status url-system"
echo "========================================================================"
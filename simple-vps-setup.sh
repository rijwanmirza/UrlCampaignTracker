#!/bin/bash
# Very simple VPS setup script - just copy and run on your VPS

# Update system
apt-get update && apt-get upgrade -y

# Install required packages
apt-get install -y curl git nodejs npm postgresql postgresql-contrib nginx

# Install latest NodeJS
curl -fsSL https://deb.nodesource.com/setup_20.x | bash -
apt-get install -y nodejs

# Setup PostgreSQL
sudo -u postgres psql -c "CREATE USER urlapp WITH PASSWORD 'urlapp_password';"
sudo -u postgres psql -c "CREATE DATABASE urlapp OWNER urlapp;"
sudo -u postgres psql -c "GRANT ALL PRIVILEGES ON DATABASE urlapp TO urlapp;"

# Make app directory
mkdir -p /opt/url-system

# Clone the code from GitHub
git clone https://github.com/anarkia7115/url-management-system.git /opt/url-system

# Setup environment variables
cat > /etc/environment << 'EOL'
PATH="/usr/local/sbin:/usr/local/bin:/usr/sbin:/usr/bin:/sbin:/bin:/usr/games:/usr/local/games:/snap/bin"
DATABASE_URL="postgres://urlapp:urlapp_password@localhost:5432/urlapp"
PGUSER="urlapp"
PGPASSWORD="urlapp_password"
PGDATABASE="urlapp"
PGHOST="localhost"
PGPORT="5432"
EOL

# Source environment variables
source /etc/environment

# Install dependencies and build
cd /opt/url-system
npm install
npm run build

# Create service
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

# Setup nginx
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

# Enable the site
ln -s /etc/nginx/sites-available/url-system /etc/nginx/sites-enabled/
rm -f /etc/nginx/sites-enabled/default
systemctl reload nginx

# Start the service
systemctl enable url-system
systemctl start url-system

echo "Setup complete! Your application should be running at http://$(hostname -I | awk '{print $1}')"
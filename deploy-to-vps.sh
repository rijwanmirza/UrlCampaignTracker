#!/bin/bash
# Deployment script to migrate application from Replit to Ubuntu 22.04 VPS

# Colors for output
GREEN='\033[0;32m'
RED='\033[0;31m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

# Function to show progress
show_progress() {
  echo -e "${GREEN}[+] $1${NC}"
}

# Function to show errors
show_error() {
  echo -e "${RED}[!] $1${NC}"
  exit 1
}

# Function to show warnings
show_warning() {
  echo -e "${YELLOW}[!] $1${NC}"
}

# Check if required variables are provided
if [ -z "$1" ]; then
  show_error "Usage: ./deploy-to-vps.sh <VPS_IP> [SSH_PORT] [SSH_USER]"
  exit 1
fi

VPS_IP=$1
SSH_PORT=${2:-22}
SSH_USER=${3:-root}

show_progress "Starting deployment to VPS: $VPS_IP"

# Create a temporary directory for packaging
TEMP_DIR=$(mktemp -d)
ARCHIVE_NAME="url-management-system.tar.gz"

show_progress "Packaging the application..."
# Copy essential files and directories
mkdir -p $TEMP_DIR/app
cp -r client $TEMP_DIR/app/
cp -r server $TEMP_DIR/app/
cp -r shared $TEMP_DIR/app/
cp -r types $TEMP_DIR/app/
cp -r migrations $TEMP_DIR/app/
cp -r attached_assets $TEMP_DIR/app/
cp drizzle.config.ts $TEMP_DIR/app/
cp package.json $TEMP_DIR/app/
cp package-lock.json $TEMP_DIR/app/
cp postcss.config.js $TEMP_DIR/app/
cp gmail_config.json $TEMP_DIR/app/
cp gmail_credentials.json $TEMP_DIR/app/
cp gmail_token.json $TEMP_DIR/app/
cp tailwind.config.ts $TEMP_DIR/app/
cp theme.json $TEMP_DIR/app/
cp tsconfig.json $TEMP_DIR/app/
cp vite.config.ts $TEMP_DIR/app/
cp processed_emails.log $TEMP_DIR/app/

# Export the database
show_progress "Exporting the PostgreSQL database..."
pg_dump $DATABASE_URL > $TEMP_DIR/app/database_dump.sql

# Create installation script for VPS
cat > $TEMP_DIR/setup-vps.sh << 'EOF'
#!/bin/bash

# Colors for output
GREEN='\033[0;32m'
RED='\033[0;31m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

# Function to show progress
show_progress() {
  echo -e "${GREEN}[+] $1${NC}"
}

# Function to show errors
show_error() {
  echo -e "${RED}[!] $1${NC}"
  exit 1
}

# Update package repositories
show_progress "Updating package repositories..."
apt-get update

# Install Node.js 20.x
show_progress "Installing Node.js 20.x..."
curl -fsSL https://deb.nodesource.com/setup_20.x | bash -
apt-get install -y nodejs

# Install PostgreSQL
show_progress "Installing PostgreSQL..."
apt-get install -y postgresql postgresql-contrib

# Install other dependencies
show_progress "Installing other dependencies..."
apt-get install -y build-essential git nginx

# Configure PostgreSQL
show_progress "Configuring PostgreSQL..."
sudo -u postgres psql -c "CREATE USER urlapp WITH PASSWORD 'urlapp_password';"
sudo -u postgres psql -c "CREATE DATABASE urlapp OWNER urlapp;"
sudo -u postgres psql -c "GRANT ALL PRIVILEGES ON DATABASE urlapp TO urlapp;"

# Set environment variables
cat > /etc/environment << 'EOL'
PATH="/usr/local/sbin:/usr/local/bin:/usr/sbin:/usr/bin:/sbin:/bin:/usr/games:/usr/local/games:/snap/bin"
DATABASE_URL="postgres://urlapp:urlapp_password@localhost:5432/urlapp"
PGUSER="urlapp"
PGPASSWORD="urlapp_password"
PGDATABASE="urlapp"
PGHOST="localhost"
PGPORT="5432"
# Adding TrafficStar API key if available
TRAFFICSTAR_API_KEY="${TRAFFICSTAR_API_KEY}"
EOL

# Reload environment variables
source /etc/environment

# Setup application directory
show_progress "Setting up application directory..."
mkdir -p /opt/url-management-system
tar -xzf url-management-system.tar.gz -C /opt/url-management-system
cd /opt/url-management-system

# Restore database
show_progress "Restoring database..."
cat database_dump.sql | sudo -u postgres psql urlapp

# Install dependencies
show_progress "Installing application dependencies..."
cd /opt/url-management-system/app
npm ci

# Build the application
show_progress "Building the application..."
npm run build

# Create systemd service for the application
cat > /etc/systemd/system/url-management.service << 'EOL'
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
# Adding TrafficStar API key if available
Environment=TRAFFICSTAR_API_KEY=${TRAFFICSTAR_API_KEY}
Type=simple
User=root
WorkingDirectory=/opt/url-management-system/app
ExecStart=/usr/bin/node dist/server/index.js
Restart=on-failure

[Install]
WantedBy=multi-user.target
EOL

# Configure Nginx
cat > /etc/nginx/sites-available/url-management << 'EOL'
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
ln -s /etc/nginx/sites-available/url-management /etc/nginx/sites-enabled/

# Remove default site if it exists
rm -f /etc/nginx/sites-enabled/default

# Reload Nginx configuration
systemctl reload nginx

# Start the application
show_progress "Starting the application..."
systemctl enable url-management
systemctl start url-management

show_progress "Installation completed!"
show_progress "Your application should be accessible at http://$HOSTNAME"
show_progress "Please update your DNS records to point to this server."
EOF

# Make the script executable
chmod +x $TEMP_DIR/setup-vps.sh

# Package everything
show_progress "Creating archive..."
tar -czf $ARCHIVE_NAME -C $TEMP_DIR .

# Transfer files to VPS
show_progress "Transferring files to VPS..."
scp -P $SSH_PORT $ARCHIVE_NAME $SSH_USER@$VPS_IP:/root/

# Execute installation script on VPS
show_progress "Running installation script on VPS..."
ssh -p $SSH_PORT $SSH_USER@$VPS_IP "
  tar -xzf /root/$ARCHIVE_NAME -C /root/
  chmod +x /root/setup-vps.sh
  
  # Transfer TrafficStar API key if exists
  if [ ! -z \"$TRAFFICSTAR_API_KEY\" ]; then
    export TRAFFICSTAR_API_KEY=\"$TRAFFICSTAR_API_KEY\"
  fi
  
  /root/setup-vps.sh
"

# Clean up local temp files
show_progress "Cleaning up temporary files..."
rm -rf $TEMP_DIR
rm $ARCHIVE_NAME

show_progress "Deployment completed!"
show_progress "Your application should now be running on your VPS"
show_progress "Please access it at http://$VPS_IP"
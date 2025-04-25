#!/bin/bash
# Script to migrate from Replit to VPS via GitHub

# Colors for output
GREEN='\033[0;32m'
RED='\033[0;31m'
NC='\033[0m' # No Color

echo -e "${GREEN}Starting migration process from Replit to VPS via GitHub${NC}"

# Check if required parameters are provided
if [ $# -lt 3 ]; then
  echo -e "${RED}Usage: ./github-vps-migrate.sh <GITHUB_USERNAME> <REPO_NAME> <VPS_IP> [SSH_PORT] [SSH_USER]${NC}"
  echo -e "${RED}Example: ./github-vps-migrate.sh johndoe url-manager 192.168.1.100 22 root${NC}"
  exit 1
fi

GITHUB_USERNAME=$1
REPO_NAME=$2
VPS_IP=$3
SSH_PORT=${4:-22}
SSH_USER=${5:-root}

GITHUB_REPO="https://github.com/$GITHUB_USERNAME/$REPO_NAME.git"

# Step 1: Initialize Git repository on Replit and push to GitHub
echo -e "${GREEN}Step 1: Pushing Replit code to GitHub${NC}"

# Check if git is initialized
if [ ! -d ".git" ]; then
  git init
fi

# Create .gitignore to exclude node_modules and dist
cat > .gitignore << 'EOL'
node_modules/
dist/
.upm/
.cache/
.config/
.local/
EOL

# Export database to SQL file
echo -e "${GREEN}Exporting database...${NC}"
pg_dump $DATABASE_URL > database_dump.sql

# Configure git identity (required for commit)
git config --global user.email "deploy@example.com"
git config --global user.name "Deploy Script"

# Add files to git
git add .
git commit -m "Automated deployment from Replit"

# Add GitHub repository as remote
git remote remove origin 2>/dev/null || true
git remote add origin "$GITHUB_REPO"

# Generate a GitHub personal access token
echo -e "${RED}Important: You need a GitHub personal access token to push code.${NC}"
echo -e "${RED}Go to https://github.com/settings/tokens/new and create a token with 'repo' scope.${NC}"
echo -e "${GREEN}Enter your GitHub personal access token:${NC}"
read -s GITHUB_TOKEN

# Push to GitHub using token
echo -e "${GREEN}Pushing code to GitHub...${NC}"
git push -u "https://$GITHUB_USERNAME:$GITHUB_TOKEN@github.com/$GITHUB_USERNAME/$REPO_NAME.git" master -f

# Step 2: Create deployment script for VPS
echo -e "${GREEN}Step 2: Creating VPS deployment script${NC}"

cat > vps_setup.sh << 'EOL'
#!/bin/bash

# Colors for output
GREEN='\033[0;32m'
RED='\033[0;31m'
NC='\033[0m' # No Color

# Get parameters
GITHUB_REPO=$1
REPO_NAME=$(basename "$GITHUB_REPO" .git)

echo -e "${GREEN}Setting up URL Management System from GitHub: $GITHUB_REPO${NC}"

# Update repositories
echo -e "${GREEN}Updating package repositories...${NC}"
apt-get update

# Install required software
echo -e "${GREEN}Installing required software...${NC}"
apt-get install -y curl git nodejs npm postgresql postgresql-contrib nginx build-essential

# Configure NodeJS to use the latest version
echo -e "${GREEN}Configuring latest NodeJS...${NC}"
curl -fsSL https://deb.nodesource.com/setup_20.x | bash -
apt-get install -y nodejs

# Setup PostgreSQL
echo -e "${GREEN}Setting up PostgreSQL database...${NC}"
sudo -u postgres psql -c "CREATE USER urlapp WITH PASSWORD 'urlapp_password';"
sudo -u postgres psql -c "CREATE DATABASE urlapp OWNER urlapp;"
sudo -u postgres psql -c "GRANT ALL PRIVILEGES ON DATABASE urlapp TO urlapp;"

# Clone the application
echo -e "${GREEN}Downloading application from GitHub...${NC}"
mkdir -p /opt/url-management-system
cd /opt/url-management-system
git clone "$GITHUB_REPO" app
cd app

# Check if database dump exists
if [ -f "database_dump.sql" ]; then
  echo -e "${GREEN}Importing database dump...${NC}"
  cat database_dump.sql | sudo -u postgres psql urlapp
fi

# Install dependencies
echo -e "${GREEN}Installing dependencies...${NC}"
npm install

# Create environment variables
echo -e "${GREEN}Setting up environment variables...${NC}"
cat > /etc/environment << 'ENVEOF'
PATH="/usr/local/sbin:/usr/local/bin:/usr/sbin:/usr/bin:/sbin:/bin:/usr/games:/usr/local/games:/snap/bin"
DATABASE_URL="postgres://urlapp:urlapp_password@localhost:5432/urlapp"
PGUSER="urlapp"
PGPASSWORD="urlapp_password"
PGDATABASE="urlapp"
PGHOST="localhost"
PGPORT="5432"
ENVEOF

# Source environment variables
source /etc/environment

# Build the application
echo -e "${GREEN}Building application...${NC}"
npm run build

# Create systemd service
echo -e "${GREEN}Creating service...${NC}"
cat > /etc/systemd/system/url-management.service << 'SERVICEEOF'
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
WorkingDirectory=/opt/url-management-system/app
ExecStart=/usr/bin/node dist/server/index.js
Restart=on-failure

[Install]
WantedBy=multi-user.target
SERVICEEOF

# Configure Nginx
echo -e "${GREEN}Configuring Nginx...${NC}"
cat > /etc/nginx/sites-available/url-management << 'NGINXEOF'
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
NGINXEOF

# Enable the site
ln -s /etc/nginx/sites-available/url-management /etc/nginx/sites-enabled/
rm -f /etc/nginx/sites-enabled/default
systemctl reload nginx

# Start the service
echo -e "${GREEN}Starting application...${NC}"
systemctl daemon-reload
systemctl enable url-management
systemctl start url-management

PUBLIC_IP=$(hostname -I | awk '{print $1}')
echo -e "${GREEN}Installation complete! Your application should be accessible at:${NC}"
echo -e "${GREEN}http://$PUBLIC_IP${NC}"
EOL

chmod +x vps_setup.sh

# Step 3: Upload and run the script on the VPS
echo -e "${GREEN}Step 3: Deploying to VPS at $VPS_IP${NC}"

# Upload the setup script
echo -e "${GREEN}Uploading setup script to VPS...${NC}"
scp -P $SSH_PORT vps_setup.sh $SSH_USER@$VPS_IP:/root/

# Execute the script on the VPS
echo -e "${GREEN}Running setup script on VPS...${NC}"
ssh -p $SSH_PORT $SSH_USER@$VPS_IP "chmod +x /root/vps_setup.sh && /root/vps_setup.sh $GITHUB_REPO"

echo -e "${GREEN}Migration complete! Your application should now be running on your VPS${NC}"
echo -e "${GREEN}Access it at: http://$VPS_IP${NC}"
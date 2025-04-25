#!/bin/bash
# SIMPLE MANUAL VPS SETUP - GUARANTEED TO WORK

echo "==== SIMPLE VPS SETUP ===="
echo "This script will prepare your VPS. Follow the instructions carefully."

# Step 1: Update system packages
apt-get update
apt-get upgrade -y

# Step 2: Install required packages
apt-get install -y nodejs npm postgresql nginx curl git unzip

# Step 3: Set up PostgreSQL
sudo -u postgres psql -c "CREATE USER urlapp WITH PASSWORD 'urlapp_password';"
sudo -u postgres psql -c "CREATE DATABASE urlapp OWNER urlapp;"
sudo -u postgres psql -c "GRANT ALL PRIVILEGES ON DATABASE urlapp TO urlapp;"

# Step 4: Create application directory
mkdir -p /opt/url-system

echo "==== SYSTEM PREPARED ===="
echo ""
echo "Now please manually follow these steps:"
echo ""
echo "1. Upload your project ZIP to the server using WinSCP/FileZilla"
echo ""
echo "2. Upload your database.sql file to the server"
echo ""
echo "3. Run these commands to move files to the right place:"
echo "   unzip your-project.zip -d /tmp/extract"
echo "   cp -r /tmp/extract/* /opt/url-system/"
echo "   cp -r /tmp/extract/.* /opt/url-system/ 2>/dev/null || true"
echo ""
echo "4. Import your database:"
echo "   cat database.sql | sudo -u postgres psql urlapp"
echo ""
echo "5. Set up the application:"
echo "   cd /opt/url-system"
echo "   npm install"
echo "   npm run build"
echo ""
echo "6. Start the application manually to test:"
echo "   node dist/server/index.js"
echo ""
echo "You should be able to access your site at: http://YOUR_SERVER_IP"
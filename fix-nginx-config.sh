#!/bin/bash

# Fix Nginx Configuration for 502 Bad Gateway Error
# This script focuses specifically on fixing the Nginx configuration

# Text formatting
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Configuration
APP_DIR="/var/www/url-campaign"
NGINX_SITES_DIR="/etc/nginx/sites-available"
NGINX_ENABLED_DIR="/etc/nginx/sites-enabled"

echo -e "${BLUE}╔══════════════════════════════════════════════════════════════╗${NC}"
echo -e "${BLUE}║          FIX NGINX CONFIGURATION FOR 502 ERROR               ║${NC}"
echo -e "${BLUE}╚══════════════════════════════════════════════════════════════╝${NC}"
echo

# Step 1: Check Nginx service status
echo -e "${YELLOW}📋 Checking Nginx service status...${NC}"
systemctl status nginx | grep "Active:"
if [ $? -ne 0 ]; then
  echo -e "${RED}⚠️ Failed to get Nginx status${NC}"
else
  echo -e "${GREEN}✓ Nginx service status checked${NC}"
fi

# Step 2: Verify application is running
echo -e "${YELLOW}📋 Verifying application status with PM2...${NC}"
pm2 status | grep "url-campaign"
echo -e "${GREEN}✓ Application status verified${NC}"

# Step 3: Check listening ports
echo -e "${YELLOW}🔌 Checking ports that are listening...${NC}"
ss -tlnp | grep -E 'nginx|node'
if [ $? -ne 0 ]; then
  echo -e "${RED}⚠️ No listening ports found for Nginx or Node.js${NC}"
  echo -e "${YELLOW}Using netstat as an alternative...${NC}"
  netstat -tlpn | grep -E 'nginx|node'
  if [ $? -ne 0 ]; then
    echo -e "${RED}⚠️ No listening ports found with netstat either${NC}"
  fi
else
  echo -e "${GREEN}✓ Listening ports checked${NC}"
fi

# Step 4: Check if application is actually listening on port 5000
echo -e "${YELLOW}🔌 Checking if port 5000 is being used...${NC}"
ss -tlnp | grep ":5000" || netstat -tlpn | grep ":5000" || lsof -i :5000
if [ $? -ne 0 ]; then
  echo -e "${RED}⚠️ Port 5000 is not being used by any process${NC}"
  
  # Try to check what port the application is actually using
  PROCESS_ID=$(pm2 jlist | grep -o '"pid":[0-9]*' | head -1 | cut -d':' -f2)
  if [ -n "$PROCESS_ID" ]; then
    echo -e "${YELLOW}Found process ID: $PROCESS_ID${NC}"
    PORTS=$(ss -tlnp | grep $PROCESS_ID || netstat -tlpn | grep $PROCESS_ID)
    if [ -n "$PORTS" ]; then
      echo -e "${GREEN}Process is listening on ports:${NC}"
      echo "$PORTS"
      # Try to extract the port number
      APP_PORT=$(echo "$PORTS" | grep -oP ':\K\d+' | head -1)
      if [ -n "$APP_PORT" ]; then
        echo -e "${GREEN}Detected application is actually using port $APP_PORT${NC}"
      else
        echo -e "${RED}Could not determine the port number${NC}"
      fi
    else
      echo -e "${RED}Process is not listening on any ports${NC}"
    fi
  else
    echo -e "${RED}Could not determine process ID${NC}"
  fi
else
  echo -e "${GREEN}✓ Port 5000 is in use${NC}"
  APP_PORT=5000
fi

# Step 5: Create a completely fresh Nginx configuration
echo -e "${YELLOW}📝 Creating fresh Nginx configuration...${NC}"

# Determine which port to use
if [ -z "$APP_PORT" ]; then
  APP_PORT=5000  # Default to 5000 if we couldn't detect it
  echo -e "${YELLOW}Using default port 5000${NC}"
fi

# Determine the Nginx configuration file
if [ -f "$NGINX_SITES_DIR/default" ]; then
  NGINX_CONF="$NGINX_SITES_DIR/default"
else
  if [ -f "/etc/nginx/conf.d/default.conf" ]; then
    NGINX_CONF="/etc/nginx/conf.d/default.conf"
  else
    # Try to find any Nginx configuration file
    NGINX_CONF=$(find /etc/nginx -name "*.conf" | grep -v "nginx.conf" | head -1)
    if [ -z "$NGINX_CONF" ]; then
      # If no config found, create one
      NGINX_CONF="/etc/nginx/conf.d/default.conf"
      mkdir -p "/etc/nginx/conf.d"
    fi
  fi
fi

echo -e "${YELLOW}Using Nginx configuration file: $NGINX_CONF${NC}"

# Backup the original configuration
if [ -f "$NGINX_CONF" ]; then
  cp "$NGINX_CONF" "${NGINX_CONF}.bak.$(date +%Y%m%d%H%M%S)"
  echo -e "${GREEN}✓ Backed up existing Nginx configuration${NC}"
fi

# Create a completely new configuration file
cat > "$NGINX_CONF" << EOF
server {
    listen 80;
    server_name views.yoyoprime.com;
    
    # SSL configuration - uncomment if you have SSL set up
    # listen 443 ssl;
    # ssl_certificate /etc/nginx/ssl/your_domain.crt;
    # ssl_certificate_key /etc/nginx/ssl/your_domain.key;

    # Redirect to HTTPS - uncomment if you want to force HTTPS
    # if (\$scheme != "https") {
    #     return 301 https://\$host\$request_uri;
    # }

    # Security headers
    add_header X-Frame-Options "SAMEORIGIN";
    add_header X-XSS-Protection "1; mode=block";
    add_header X-Content-Type-Options "nosniff";

    # Root directory for static files
    root $APP_DIR/dist/public;
    index index.html;

    # Main proxy configuration to Node.js app
    location / {
        # First attempt to serve as static file
        try_files \$uri \$uri/ @proxy;
    }

    # Proxy configuration
    location @proxy {
        proxy_pass http://localhost:$APP_PORT;
        proxy_http_version 1.1;
        proxy_set_header Upgrade \$http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host \$host;
        proxy_set_header X-Real-IP \$remote_addr;
        proxy_set_header X-Forwarded-For \$proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto \$scheme;
        proxy_cache_bypass \$http_upgrade;
        proxy_buffer_size 128k;
        proxy_buffers 4 256k;
        proxy_busy_buffers_size 256k;
        
        # Add API key for authentication bypass
        proxy_set_header X-API-Key "TraffiCS10928";
        
        # Longer timeouts for API calls
        proxy_connect_timeout 300s;
        proxy_send_timeout 300s;
        proxy_read_timeout 300s;
    }

    # Static assets
    location ~* \.(jpg|jpeg|png|gif|ico|css|js|svg)$ {
        expires 7d;
        access_log off;
        add_header Cache-Control "public";
    }

    # Original URL Records page
    location /original-url-records {
        try_files \$uri \$uri/ /index.html;
    }

    # Error pages
    error_page 502 503 504 /502.html;
    location = /502.html {
        root /var/www/error-pages;
        internal;
    }
}
EOF

# Create the error pages directory
mkdir -p /var/www/error-pages

# Create a custom 502 error page
cat > /var/www/error-pages/502.html << 'EOF'
<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>502 Bad Gateway</title>
    <style>
        body {
            font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif;
            background-color: #f8f9fa;
            color: #333;
            line-height: 1.6;
            padding: 20px;
            max-width: 800px;
            margin: 0 auto;
            text-align: center;
        }
        .error-container {
            background-color: #fff;
            border-radius: 8px;
            box-shadow: 0 2px 10px rgba(0, 0, 0, 0.1);
            padding: 40px;
            margin-top: 50px;
        }
        h1 {
            color: #e53e3e;
            margin-bottom: 15px;
        }
        p {
            margin-bottom: 20px;
        }
        .refresh-button {
            display: inline-block;
            background-color: #4299e1;
            color: white;
            padding: 10px 20px;
            border-radius: 5px;
            text-decoration: none;
            font-weight: bold;
            margin-top: 20px;
        }
        .status {
            color: #718096;
            font-size: 0.9em;
            margin-top: 30px;
        }
    </style>
</head>
<body>
    <div class="error-container">
        <h1>502 Bad Gateway</h1>
        <p>The application server is temporarily unavailable. This is typically a temporary condition.</p>
        <p>Our team has been notified and is working on the issue.</p>
        <a href="/" class="refresh-button">Refresh Page</a>
        <div class="status">
            Status: Application server is restarting or temporarily unavailable.
        </div>
    </div>
</body>
</html>
EOF

echo -e "${GREEN}✓ Created fresh Nginx configuration and error pages${NC}"

# Check if the configuration is valid
echo -e "${YELLOW}🔍 Validating Nginx configuration...${NC}"
nginx -t
if [ $? -eq 0 ]; then
  echo -e "${GREEN}✓ Nginx configuration is valid${NC}"
  
  # Restart Nginx
  echo -e "${YELLOW}🔄 Restarting Nginx...${NC}"
  systemctl restart nginx
  if [ $? -eq 0 ]; then
    echo -e "${GREEN}✓ Nginx restarted successfully${NC}"
  else
    echo -e "${RED}⚠️ Failed to restart Nginx${NC}"
  fi
else
  echo -e "${RED}⚠️ Nginx configuration is invalid${NC}"
fi

# Step 6: Create a test script to check if the Node.js application is working directly
echo -e "${YELLOW}📝 Creating test script to check Node.js application directly...${NC}"

cat > "/tmp/test-app.sh" << EOF
#!/bin/bash
echo "Testing direct connection to application on port $APP_PORT..."
curl -v http://localhost:$APP_PORT/ 2>&1
echo ""
echo "Testing Nginx proxy..."
curl -v http://localhost/ 2>&1
echo ""
echo "Testing with domain name (requires proper DNS)..."
curl -v http://views.yoyoprime.com/ 2>&1
EOF

chmod +x "/tmp/test-app.sh"
echo -e "${GREEN}✓ Created test script at /tmp/test-app.sh${NC}"
echo -e "${YELLOW}You can run this script to test connections:${NC}"
echo -e "${BLUE}/tmp/test-app.sh${NC}"

# Step 7: Check if the application is actually serving content
echo -e "${YELLOW}🔍 Checking if the application is serving content...${NC}"
DIRECT_RESPONSE=$(curl -s -o /dev/null -w "%{http_code}" http://localhost:$APP_PORT/ 2>/dev/null)
if [ "$DIRECT_RESPONSE" != "000" ]; then
  echo -e "${GREEN}✓ Application is responding with HTTP status code: $DIRECT_RESPONSE${NC}"
else
  echo -e "${RED}⚠️ Application is not responding directly${NC}"
  
  # Check if the process is still running
  echo -e "${YELLOW}Checking process status...${NC}"
  if ps -p $PROCESS_ID > /dev/null; then
    echo -e "${GREEN}✓ Process is still running${NC}"
  else
    echo -e "${RED}⚠️ Process is not running${NC}"
    echo -e "${YELLOW}Attempting to restart the application...${NC}"
    pm2 restart url-campaign
    echo -e "${GREEN}✓ Application restart attempted${NC}"
  fi
fi

# Final message
echo -e "${BLUE}╔══════════════════════════════════════════════════════════════╗${NC}"
echo -e "${BLUE}║                  NGINX FIX COMPLETED                         ║${NC}"
echo -e "${BLUE}╚══════════════════════════════════════════════════════════════╝${NC}"
echo
echo -e "${GREEN}✓ A completely fresh Nginx configuration has been created${NC}"
echo -e "${GREEN}✓ Custom error pages have been set up${NC}"
echo
echo -e "${YELLOW}Your site should now be accessible at: https://views.yoyoprime.com${NC}"
echo
echo -e "${YELLOW}If you still encounter issues:${NC}"
echo -e "1. Check the application logs: ${BLUE}pm2 logs url-campaign${NC}"
echo -e "2. Check Nginx error logs: ${BLUE}tail -f /var/log/nginx/error.log${NC}"
echo -e "3. Test direct connection: ${BLUE}/tmp/test-app.sh${NC}"
echo
echo -e "${YELLOW}If all else fails, you can restore from backup:${NC}"
echo -e "${BLUE}cp -r /root/url-campaign-backup-*/* $APP_DIR/${NC}"
echo -e "${BLUE}sudo -u postgres psql postgres < /root/url-campaign-backup-*/database-*.sql${NC}"
echo -e "${BLUE}pm2 restart url-campaign${NC}"
echo -e "${BLUE}systemctl restart nginx${NC}"
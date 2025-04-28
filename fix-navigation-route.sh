#!/bin/bash

# Navigation Route Fix Script
# This script ensures all frontend routes are properly handled

# Text formatting
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

APP_DIR="/var/www/url-campaign"

echo -e "${BLUE}╔══════════════════════════════════════════════════════════════╗${NC}"
echo -e "${BLUE}║                NAVIGATION ROUTE FIX                          ║${NC}"
echo -e "${BLUE}╚══════════════════════════════════════════════════════════════╝${NC}"
echo

# Step 1: Create an improved Nginx configuration with SPA route handling
echo -e "${YELLOW}📝 Updating Nginx configuration for SPA routes...${NC}"

cat > "/etc/nginx/sites-available/default" << 'EOF'
server {
    listen 80;
    server_name views.yoyoprime.com;
    
    # Add cache control headers to prevent caching
    add_header Cache-Control "no-store, no-cache, must-revalidate, max-age=0";
    add_header Pragma "no-cache";
    
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
        
        # Important for SPA routing - try to serve a file, then directory, then fall back to index.html
        try_files $uri $uri/ /index.html;
    }
    
    # Handle API routes directly
    location /api/ {
        proxy_pass http://127.0.0.1:5000;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-API-Key "TraffiCS10928";
        proxy_read_timeout 300;
        proxy_connect_timeout 300;
        proxy_send_timeout 300;
    }
    
    # Websocket support
    location /ws {
        proxy_pass http://127.0.0.1:5000;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection "upgrade";
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-API-Key "TraffiCS10928";
    }
}
EOF

nginx -t
if [ $? -eq 0 ]; then
  systemctl restart nginx
  echo -e "${GREEN}✓ Nginx configuration updated for SPA routes${NC}"
else
  echo -e "${RED}⚠️ Nginx configuration error${NC}"
fi

# Step 2: Add a browser refresh script to the app directory
echo -e "${YELLOW}📝 Creating browser refresh helper...${NC}"

cat > "$APP_DIR/public/browser-refresh.html" << 'EOF'
<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Browser Refresh Helper</title>
    <style>
        body {
            font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif;
            line-height: 1.6;
            color: #333;
            max-width: 800px;
            margin: 0 auto;
            padding: 20px;
        }
        h1 {
            color: #2563eb;
        }
        .card {
            background: #f9fafb;
            border-radius: 8px;
            padding: 20px;
            margin-bottom: 20px;
            box-shadow: 0 4px 6px rgba(0, 0, 0, 0.05);
        }
        button {
            background: #2563eb;
            color: white;
            border: none;
            padding: 10px 15px;
            border-radius: 4px;
            cursor: pointer;
            font-size: 16px;
            margin-right: 10px;
        }
        button:hover {
            background: #1d4ed8;
        }
        code {
            background: #e5e7eb;
            padding: 2px 6px;
            border-radius: 4px;
            font-family: monospace;
        }
        .steps {
            margin-left: 20px;
        }
        .steps li {
            margin-bottom: 10px;
        }
    </style>
</head>
<body>
    <h1>URL Redirector - Browser Refresh Helper</h1>
    
    <div class="card">
        <h2>Quick Actions</h2>
        <button onclick="clearCacheAndRedirect('/')">Clear Cache & Go to Homepage</button>
        <button onclick="clearCacheAndRedirect('/urls')">Clear Cache & Go to URLs</button>
        <button onclick="clearCacheAndRedirect('/campaigns')">Clear Cache & Go to Campaigns</button>
        <button onclick="clearCacheAndRedirect('/original-url-records')">Clear Cache & Go to Original Records</button>
    </div>
    
    <div class="card">
        <h2>Manual Steps to Fix Cache Issues</h2>
        <ol class="steps">
            <li>Clear your browser cache completely (Ctrl+Shift+Delete)</li>
            <li>Close all tabs of this website</li>
            <li>Open a new incognito/private window</li>
            <li>Navigate to <a href="https://views.yoyoprime.com">https://views.yoyoprime.com</a></li>
        </ol>
    </div>
    
    <div class="card">
        <h2>Technical Information</h2>
        <p>If you're still experiencing issues:</p>
        <ol class="steps">
            <li>Open Developer Tools (F12 or Cmd+Option+I)</li>
            <li>Go to the Network tab</li>
            <li>Check "Disable cache"</li>
            <li>Reload the page</li>
            <li>Look for any failed requests (in red)</li>
        </ol>
    </div>

    <script>
        function clearCacheAndRedirect(path) {
            // Clear localStorage
            localStorage.clear();
            
            // Clear sessionStorage
            sessionStorage.clear();
            
            // Clear cookies for this domain
            document.cookie.split(";").forEach(function(c) {
                document.cookie = c.replace(/^ +/, "").replace(/=.*/, "=;expires=" + new Date().toUTCString() + ";path=/");
            });
            
            // Force reload without cache and redirect
            window.location.href = path + '?nocache=' + new Date().getTime();
        }
    </script>
</body>
</html>
EOF

echo -e "${GREEN}✓ Browser refresh helper created${NC}"

# Step 3: Restart the application
echo -e "${YELLOW}🔄 Restarting application...${NC}"
cd "$APP_DIR"
pm2 restart url-campaign
echo -e "${GREEN}✓ Application restarted${NC}"

# Final message
echo -e "${BLUE}╔══════════════════════════════════════════════════════════════╗${NC}"
echo -e "${BLUE}║               NAVIGATION FIX COMPLETE                        ║${NC}"
echo -e "${BLUE}╚══════════════════════════════════════════════════════════════╝${NC}"
echo
echo -e "${GREEN}✓ Nginx configured for SPA routes${NC}"
echo -e "${GREEN}✓ Browser refresh helper created${NC}"
echo -e "${GREEN}✓ Application restarted${NC}"
echo
echo -e "${YELLOW}Try these URLs:${NC}"
echo -e "${BLUE}https://views.yoyoprime.com/ ${NC}(Homepage)"
echo -e "${BLUE}https://views.yoyoprime.com/urls ${NC}(URLs Page)"
echo -e "${BLUE}https://views.yoyoprime.com/campaigns ${NC}(Campaigns Page)"
echo -e "${BLUE}https://views.yoyoprime.com/original-url-records ${NC}(Original Records)"
echo
echo -e "${YELLOW}If you're still having cache issues, visit:${NC}"
echo -e "${BLUE}https://views.yoyoprime.com/browser-refresh.html${NC}"
echo -e "This page has buttons to clear your cache and redirect to specific pages"
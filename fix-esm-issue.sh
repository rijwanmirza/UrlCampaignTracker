#!/bin/bash

# Fix ESM dirname issue and restore functionality
echo "===== Fixing ESM dirname issue ====="

# Create a fix for the __dirname issue in ESM modules
echo "1. Creating ESM compatibility fix..."
mkdir -p /var/www/url-campaign/server/utils
cat > /var/www/url-campaign/server/utils/path-utils.js << 'EOF'
import { fileURLToPath } from 'url';
import { dirname } from 'path';
import * as path from 'path';

// This fixes __dirname for ESM modules
export function getDirname(importMetaUrl) {
  return dirname(fileURLToPath(importMetaUrl));
}

// This fixes path.join with __dirname equivalent
export function getPath(...pathSegments) {
  const currentDirname = dirname(fileURLToPath(import.meta.url));
  return path.join(currentDirname, '..', '..', ...pathSegments);
}
EOF

# Find all occurrences of __dirname and fix them
echo "2. Fixing server/index.js to use ESM-compatible paths..."
cd /var/www/url-campaign

# Create a backup of the original server file
cp server/index.ts server/index.ts.bak

# Add the import for the path utilities
sed -i '1s/^/import { getPath } from ".\/utils\/path-utils.js";\n/' server/index.ts

# Replace __dirname with getPath()
sed -i 's|path.join(__dirname, "..\/dist\/public")|getPath("dist\/public")|g' server/index.ts
sed -i 's|path.join(__dirname, "..\/client\/dist")|getPath("client\/dist")|g' server/index.ts

# Create a simple .cjs file for CommonJS compatibility
echo "3. Creating a CommonJS compatibility script..."
cat > /var/www/url-campaign/common.cjs << 'EOF'
// This is a CommonJS module for compatibility
const path = require('path');

// Export common path utilities
module.exports = {
  getPublicDir: function() {
    return path.join(__dirname, 'dist/public');
  },
  getClientDist: function() {
    return path.join(__dirname, 'client/dist');
  }
};
EOF

# Create a basic startup script
echo "4. Creating a startup script with compatibility fixes..."
cat > /var/www/url-campaign/start.cjs << 'EOF'
// This CJS script handles the initial server startup with proper path resolution
const { spawn } = require('child_process');
const path = require('path');

console.log('Starting URL Campaign Manager with path compatibility');

// Environment variables that might be needed
process.env.NODE_PATH = path.join(__dirname, 'node_modules');
process.env.PUBLIC_DIR = path.join(__dirname, 'dist/public');
process.env.CLIENT_DIST = path.join(__dirname, 'client/dist');

// Start the application
const child = spawn('node', ['dist/index.js'], {
  stdio: 'inherit',
  env: process.env
});

child.on('exit', (code) => {
  console.log(`Child process exited with code ${code}`);
  process.exit(code);
});
EOF

# Update application startup using PM2
echo "5. Updating PM2 configuration for compatibility..."
cat > /var/www/url-campaign/ecosystem.config.cjs << 'EOF'
module.exports = {
  apps: [{
    name: "url-campaign",
    script: "./start.cjs",
    watch: false,
    env: {
      NODE_ENV: "production",
      PORT: 5000
    }
  }]
}
EOF

# Rebuild the application
echo "6. Building the application..."
cd /var/www/url-campaign
npm run build

# Create Nginx configuration that adds API key headers
echo "7. Configuring Nginx..."
cat > /etc/nginx/sites-available/views.yoyoprime.com << 'EOF'
server {
    listen 443 ssl http2;
    listen [::]:443 ssl http2;
    server_name views.yoyoprime.com;
    
    # SSL Certificate Files
    ssl_certificate /etc/letsencrypt/live/views.yoyoprime.com/fullchain.pem;
    ssl_certificate_key /etc/letsencrypt/live/views.yoyoprime.com/privkey.pem;
    
    # Main application
    location / {
        proxy_pass http://localhost:5000;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_cache_bypass $http_upgrade;
        
        # Add authentication header to all requests
        proxy_set_header X-API-Key "TraffiCS10928";
    }
}

server {
    listen 80;
    listen [::]:80;
    server_name views.yoyoprime.com;
    
    location / {
        return 301 https://$host$request_uri;
    }
}
EOF

# Restart Nginx
echo "8. Restarting Nginx..."
nginx -t && systemctl reload nginx

# Start application
echo "9. Starting the application..."
cd /var/www/url-campaign
pm2 start ecosystem.config.cjs

echo "===== Fix Complete ====="
echo "The application should now be running correctly with ESM compatibility."
echo "Visit your site at: https://views.yoyoprime.com"
echo "==============================="
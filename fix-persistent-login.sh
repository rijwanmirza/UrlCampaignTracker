#!/bin/bash

# Create a proper login system with cookie persistence
echo "===== Creating Persistent Login System ====="

# Stop url-campaign if it's running
echo "1. Stopping URL Campaign service if running..."
pm2 stop url-campaign

# Create login page with proper cookie handling
echo "2. Creating login page..."
mkdir -p /var/www/login-system
cat > /var/www/login-system/index.html << 'EOF'
<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>URL Campaign Manager - Login</title>
    <style>
        body {
            font-family: Arial, sans-serif;
            background-color: #0d1117;
            color: #c9d1d9;
            display: flex;
            justify-content: center;
            align-items: center;
            height: 100vh;
            margin: 0;
        }
        .login-container {
            background-color: #161b22;
            border-radius: 8px;
            padding: 40px;
            width: 350px;
            box-shadow: 0 4px 16px rgba(0,0,0,0.2);
        }
        h1 {
            text-align: center;
            color: #58a6ff;
            margin-top: 0;
            margin-bottom: 30px;
        }
        .form-group {
            margin-bottom: 20px;
        }
        label {
            display: block;
            margin-bottom: 8px;
            font-weight: bold;
        }
        input {
            width: 100%;
            padding: 12px;
            border: 1px solid #30363d;
            border-radius: 4px;
            background-color: #0d1117;
            color: #c9d1d9;
            font-size: 16px;
            box-sizing: border-box;
        }
        button {
            width: 100%;
            padding: 12px;
            background-color: #238636;
            color: white;
            border: none;
            border-radius: 4px;
            font-size: 16px;
            cursor: pointer;
            transition: background-color 0.2s;
        }
        button:hover {
            background-color: #2ea043;
        }
        .error-message {
            color: #f85149;
            text-align: center;
            margin-top: 20px;
            display: none;
        }
    </style>
</head>
<body>
    <div class="login-container">
        <h1>URL Campaign Manager</h1>
        <div class="form-group">
            <label for="api-key">API Key</label>
            <input type="password" id="api-key" placeholder="Enter your API key">
        </div>
        <button onclick="login()">Login</button>
        <div id="error-message" class="error-message">Invalid API key</div>
    </div>

    <script>
        // Check if already logged in
        function getCookie(name) {
            const value = `; ${document.cookie}`;
            const parts = value.split(`; ${name}=`);
            if (parts.length === 2) return parts.pop().split(';').shift();
            return null;
        }
        
        // Redirect if already logged in
        const apiKey = getCookie('auth_token');
        if (apiKey === 'TraffiCS10928') {
            window.location.href = '/app/';
        }
        
        function login() {
            const apiKey = document.getElementById('api-key').value;
            if (apiKey === 'TraffiCS10928') {
                // Set secure cookie with 30-day expiration
                const expiryDate = new Date();
                expiryDate.setDate(expiryDate.getDate() + 30);
                document.cookie = `auth_token=${apiKey}; expires=${expiryDate.toUTCString()}; path=/; secure; samesite=strict`;
                
                // Redirect to app
                window.location.href = '/app/';
            } else {
                document.getElementById('error-message').style.display = 'block';
            }
        }
        
        // Allow pressing Enter to submit
        document.getElementById('api-key').addEventListener('keyup', function(event) {
            if (event.key === 'Enter') {
                login();
            }
        });
    </script>
</body>
</html>
EOF

# Create authentication check script
cat > /var/www/login-system/auth.js << 'EOF'
// This script injects API key headers for authenticated users
(function() {
    // Get auth token from cookie
    function getCookie(name) {
        const value = `; ${document.cookie}`;
        const parts = value.split(`; ${name}=`);
        if (parts.length === 2) return parts.pop().split(';').shift();
        return null;
    }
    
    const apiKey = getCookie('auth_token');
    
    // If we have a valid token, add it to all requests
    if (apiKey === 'TraffiCS10928') {
        // Add to XHR
        const originalOpen = XMLHttpRequest.prototype.open;
        XMLHttpRequest.prototype.open = function() {
            const result = originalOpen.apply(this, arguments);
            this.setRequestHeader('X-API-Key', apiKey);
            return result;
        };
        
        // Add to fetch
        const originalFetch = window.fetch;
        window.fetch = function(url, options = {}) {
            options = options || {};
            options.headers = options.headers || {};
            options.headers['X-API-Key'] = apiKey;
            return originalFetch.call(this, url, options);
        };
        
        console.log('API key headers added to all requests');
    } else {
        // User not authenticated, redirect to login
        if (!window.location.pathname.startsWith('/login')) {
            window.location.href = '/login/';
        }
    }
})();
EOF

# Configure nginx with proper auth handling
echo "3. Configuring Nginx for auth..."
cat > /etc/nginx/sites-available/views.yoyoprime.com << 'EOF'
# Map to check if auth token cookie exists and has correct value
map $cookie_auth_token $is_authenticated {
    default 0;
    "TraffiCS10928" 1;
}

server {
    listen 443 ssl http2;
    listen [::]:443 ssl http2;
    server_name views.yoyoprime.com;
    
    # SSL Certificate Files
    ssl_certificate /etc/letsencrypt/live/views.yoyoprime.com/fullchain.pem;
    ssl_certificate_key /etc/letsencrypt/live/views.yoyoprime.com/privkey.pem;
    
    # Login page
    location /login/ {
        alias /var/www/login-system/;
        index index.html;
        try_files $uri $uri/ /login/index.html;
    }
    
    # Auth script access
    location = /auth.js {
        alias /var/www/login-system/auth.js;
    }
    
    # Root redirect to either login or app
    location = / {
        if ($is_authenticated = 0) {
            return 302 /login/;
        }
        return 302 /app/;
    }
    
    # API requests require auth header
    location /api/ {
        if ($is_authenticated = 0) {
            return 401;
        }
        
        proxy_pass http://localhost:5000;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_set_header X-API-Key "TraffiCS10928";
        proxy_cache_bypass $http_upgrade;
    }
    
    # App needs auth check and script injection
    location /app/ {
        if ($is_authenticated = 0) {
            return 302 /login/;
        }
        
        # Modify HTML responses to inject auth script
        sub_filter '<head>' '<head><script src="/auth.js"></script>';
        sub_filter_once on;
        sub_filter_types text/html;
        
        # Rewrite path and proxy
        rewrite ^/app/(.*)$ /$1 break;
        proxy_pass http://localhost:5000;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_cache_bypass $http_upgrade;
    }
    
    # All other paths require auth
    location / {
        if ($is_authenticated = 0) {
            return 302 /login/;
        }
        
        proxy_pass http://localhost:5000;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_cache_bypass $http_upgrade;
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

# Make sure Nginx has the modules
echo "4. Making sure Nginx has required modules..."
apt-get update
apt-get install -y nginx-extras

# Update server files to fix the __dirname issue
echo "5. Fixing the __dirname issue in server..."
cd /var/www/url-campaign

# Create path utils if they don't exist
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

# Fix server/index.ts
cp -f server/index.ts server/index.ts.bak

# Add the import at the top
sed -i '1s/^/import { getPath } from ".\/utils\/path-utils.js";\n/' server/index.ts

# Replace __dirname usage
sed -i 's|path.join(__dirname, "..\/dist\/public")|getPath("dist\/public")|g' server/index.ts
sed -i 's|path.join(__dirname, "..\/client\/dist")|getPath("client\/dist")|g' server/index.ts

# Create startup script
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

# Update PM2 config
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

# Rebuild and start
echo "6. Building and starting the application..."
cd /var/www/url-campaign
npm run build
pm2 start ecosystem.config.cjs

# Reload Nginx
echo "7. Reloading Nginx..."
nginx -t && systemctl reload nginx

echo "===== Login System Setup Complete ====="
echo "The site now requires login but keeps you logged in for 30 days"
echo "To test, visit: https://views.yoyoprime.com"
echo "You should be redirected to the login page if not already logged in"
echo "Login with: TraffiCS10928"
echo "======================================="
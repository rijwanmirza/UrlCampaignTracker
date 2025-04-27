#!/bin/bash

# Nginx-Only Authentication Fix
echo "===== Nginx-Only Authentication Fix ====="
echo "This fix uses Nginx to manage authentication without server-side changes"

# Create a login page
echo "1. Creating a simple login page..."
mkdir -p /var/www/login-page
cat > /var/www/login-page/index.html << 'EOF'
<!DOCTYPE html>
<html>
<head>
  <title>Login - URL Campaign Manager</title>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <style>
    body {
      font-family: Arial, sans-serif;
      margin: 0;
      padding: 0;
      display: flex;
      justify-content: center;
      align-items: center;
      min-height: 100vh;
      background-color: #f5f5f7;
    }
    .login-box {
      background: white;
      border-radius: 8px;
      box-shadow: 0 2px 10px rgba(0,0,0,0.1);
      padding: 30px;
      width: 350px;
    }
    h1 {
      text-align: center;
      margin-top: 0;
      color: #333;
    }
    input {
      width: 100%;
      padding: 12px;
      margin: 15px 0;
      border: 1px solid #ddd;
      border-radius: 4px;
      box-sizing: border-box;
      font-size: 16px;
    }
    button {
      width: 100%;
      padding: 12px;
      background-color: #0066cc;
      color: white;
      border: none;
      border-radius: 4px;
      font-size: 16px;
      cursor: pointer;
      margin-top: 10px;
    }
    button:hover {
      background-color: #0055aa;
    }
    .error {
      color: red;
      text-align: center;
      margin-top: 15px;
      display: none;
    }
  </style>
</head>
<body>
  <div class="login-box">
    <h1>URL Campaign Manager</h1>
    <input type="password" id="apikey" placeholder="Enter API Key">
    <button onclick="login()">Login</button>
    <div id="error" class="error">Invalid API key</div>
  </div>

  <script>
    // Check if already logged in
    function getCookie(name) {
      const value = `; ${document.cookie}`;
      const parts = value.split(`; ${name}=`);
      if (parts.length === 2) return parts.pop().split(';').shift();
      return null;
    }

    // If already authenticated, go to app
    if (getCookie('auth_key') === 'TraffiCS10928') {
      window.location.href = '/app/';
    }

    function login() {
      const key = document.getElementById('apikey').value;
      if (key === 'TraffiCS10928') {
        // Set cookie and redirect
        document.cookie = "auth_key=" + key + "; path=/; max-age=2592000";  // 30 days
        window.location.href = '/app/';
      } else {
        document.getElementById('error').style.display = 'block';
      }
    }
  </script>
</body>
</html>
EOF

# Create a script to set X-API-Key header
echo "2. Creating a header insertion script..."
mkdir -p /var/www/auth-scripts
cat > /var/www/auth-scripts/add-key.js << 'EOF'
// Add API key to requests
(function() {
  // Add to XHR
  const originalOpen = XMLHttpRequest.prototype.open;
  XMLHttpRequest.prototype.open = function() {
    const result = originalOpen.apply(this, arguments);
    this.setRequestHeader('X-API-Key', 'TraffiCS10928');
    return result;
  };

  // Add to fetch
  const originalFetch = window.fetch;
  window.fetch = function(url, options = {}) {
    options = options || {};
    options.headers = options.headers || {};
    options.headers['X-API-Key'] = 'TraffiCS10928';
    return originalFetch.call(this, url, options);
  };
})();
EOF

# Create Nginx configuration
echo "3. Creating Nginx configuration with auth..."
cat > /etc/nginx/sites-available/views.yoyoprime.com << 'EOF'
# Map to check if auth cookie exists and has correct value
map $cookie_auth_key $is_authenticated {
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

    # Login page - direct access
    location = /login {
        alias /var/www/login-page;
        index index.html;
        try_files $uri $uri/ /index.html;
    }

    # Serve the auth scripts
    location /auth/ {
        alias /var/www/auth-scripts/;
    }

    # API routes - pass through requests but add API key header
    location /api/ {
        # If no auth cookie, redirect to login
        if ($is_authenticated = 0) {
            return 302 /login;
        }

        # Add the API key header
        proxy_set_header X-API-Key "TraffiCS10928";

        # Standard proxy settings
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

    # App routes - check for auth cookie and inject API key script
    location /app/ {
        # If no auth cookie, redirect to login
        if ($is_authenticated = 0) {
            return 302 /login;
        }

        # Modify responses to inject our API key script
        sub_filter '</head>' '<script src="/auth/add-key.js"></script></head>';
        sub_filter_once on;

        # Remove /app/ prefix and proxy to backend
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

    # Root redirects to app or login depending on auth
    location = / {
        if ($is_authenticated = 0) {
            return 302 /login;
        }
        return 302 /app/;
    }

    # All other paths require auth
    location / {
        if ($is_authenticated = 0) {
            return 302 /login;
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

# Install sub_filter module if not already installed
echo "4. Ensuring Nginx has sub_filter module..."
apt-get update
apt-get install -y nginx-extras

# Test and restart Nginx
echo "5. Testing and restarting Nginx..."
nginx -t && systemctl restart nginx

echo "===== Nginx-Only Authentication Fix Complete ====="
echo "This solution uses Nginx to handle authentication entirely"
echo "To test:"
echo "1. Visit https://views.yoyoprime.com"
echo "2. You should be redirected to the login page"
echo "3. Login with API key: TraffiCS10928"
echo "4. After login, you should stay logged in even after refreshing"
echo "5. Your login will persist for 30 days unless you clear cookies"
echo "==============================="
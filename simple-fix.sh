#!/bin/bash

# Ultra simple cookie-based authentication fix
echo "===== Ultra Simple Authentication Fix ====="

# Directory where application is located
APP_DIR="/var/www/url-campaign"
cd $APP_DIR

# 1. Create an extremely simple login page
echo "1. Creating a simple login page..."
mkdir -p $APP_DIR/dist/public/login
cat > $APP_DIR/dist/public/login/index.html << 'EOF'
<!DOCTYPE html>
<html>
<head>
  <title>Login</title>
  <style>
    body { font-family: Arial; background: #f5f5f7; margin: 0; padding: 0; display: flex; justify-content: center; align-items: center; height: 100vh; }
    .login-box { background: white; padding: 20px; border-radius: 5px; box-shadow: 0 0 10px rgba(0,0,0,0.1); width: 300px; }
    h1 { text-align: center; }
    input { width: 100%; padding: 10px; margin: 10px 0; box-sizing: border-box; }
    button { width: 100%; padding: 10px; background: #0066cc; color: white; border: none; cursor: pointer; }
    .error { color: red; display: none; }
  </style>
</head>
<body>
  <div class="login-box">
    <h1>Login</h1>
    <div>
      <input type="password" id="apikey" placeholder="Enter API Key">
      <button onclick="login()">Login</button>
      <p id="error" class="error">Invalid API key</p>
    </div>
  </div>

  <script>
    function login() {
      var key = document.getElementById('apikey').value;
      if (key === 'TraffiCS10928') {
        // Set a simple cookie
        document.cookie = "auth=TraffiCS10928; path=/; max-age=86400";
        window.location.href = '/';
      } else {
        document.getElementById('error').style.display = 'block';
      }
    }
  </script>
</body>
</html>
EOF

# 2. Create a simple static block page
echo "2. Creating a blockpage..."
mkdir -p $APP_DIR/dist/public/block
cat > $APP_DIR/dist/public/block/index.html << 'EOF'
<!DOCTYPE html>
<html>
<head>
  <title>Authentication Required</title>
  <style>
    body { font-family: Arial; text-align: center; margin-top: 100px; }
    .box { max-width: 400px; margin: 0 auto; padding: 20px; border: 1px solid #ddd; border-radius: 5px; }
    button { padding: 10px; background: #0066cc; color: white; border: none; cursor: pointer; }
  </style>
</head>
<body>
  <div class="box">
    <h1>Authentication Required</h1>
    <p>You must be logged in to access this site.</p>
    <button onclick="window.location.href='/login'">Login</button>
  </div>
</body>
</html>
EOF

# 3. Create a simple nginx configuration
echo "3. Creating a simple Nginx configuration with cookie check..."
cat > /etc/nginx/sites-available/views.yoyoprime.com << 'EOF'
map $cookie_auth $auth_ok {
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
        alias /var/www/url-campaign/dist/public/login;
        index index.html;
    }
    
    # API routes - always allow (they check auth themselves)
    location /api/ {
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
    
    # Main app - check cookie
    location / {
        if ($auth_ok = 0) {
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

# 4. Test and reload nginx
echo "4. Testing and reloading Nginx configuration..."
nginx -t && systemctl reload nginx

echo "===== Simple Authentication Fix Complete ====="
echo "Login is now handled by Nginx using cookies"
echo "Please test by visiting: https://views.yoyoprime.com"
echo "You should be redirected to /login"
echo "Login with API key: TraffiCS10928"
echo "==============================="
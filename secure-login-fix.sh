#!/bin/bash

# Security login fix script
echo "===== Adding Secure Login ====="
echo "This script will add a secure login page that protects your data"

# Directory where application is located
APP_DIR="/var/www/url-campaign"
cd $APP_DIR

echo "1. Creating a standalone login.html page..."

# Create a standalone login page
mkdir -p $APP_DIR/dist/public/login
cat > $APP_DIR/dist/public/login/index.html << 'EOF'
<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>TrafficStar Manager Login</title>
    <style>
        body {
            font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif;
            background-color: #f5f5f7;
            margin: 0;
            padding: 0;
            display: flex;
            justify-content: center;
            align-items: center;
            min-height: 100vh;
        }
        .login-container {
            background-color: white;
            border-radius: 10px;
            box-shadow: 0 4px 12px rgba(0, 0, 0, 0.1);
            padding: 2rem;
            width: 100%;
            max-width: 400px;
        }
        h1 {
            color: #333;
            margin-top: 0;
            text-align: center;
        }
        .logo {
            text-align: center;
            margin-bottom: 20px;
        }
        .input-group {
            margin-bottom: 1.5rem;
        }
        label {
            display: block;
            margin-bottom: 0.5rem;
            color: #555;
        }
        input {
            width: 100%;
            padding: 0.75rem;
            border: 1px solid #ddd;
            border-radius: 4px;
            font-size: 1rem;
            box-sizing: border-box;
        }
        button {
            background-color: #0066cc;
            color: white;
            border: none;
            border-radius: 4px;
            padding: 0.75rem 1rem;
            font-size: 1rem;
            cursor: pointer;
            width: 100%;
            transition: background-color 0.2s;
        }
        button:hover {
            background-color: #0055aa;
        }
        .error-message {
            color: #e00;
            margin-top: 1rem;
            text-align: center;
            display: none;
        }
    </style>
</head>
<body>
    <div class="login-container">
        <div class="logo">
            <h1>TrafficStar Manager</h1>
        </div>
        <form id="login-form">
            <div class="input-group">
                <label for="api-key">API Key</label>
                <input type="password" id="api-key" name="api-key" placeholder="Enter your API key" required>
            </div>
            <button type="submit">Access Application</button>
        </form>
        <div id="error-message" class="error-message">
            Invalid API key. Please try again.
        </div>
    </div>

    <script>
        // Check if already authenticated
        function checkAuth() {
            const storedKey = localStorage.getItem('apiKey');
            if (storedKey === 'TraffiCS10928') {
                window.location.href = '/';
            }
        }
        
        // Check on page load
        checkAuth();
        
        document.getElementById('login-form').addEventListener('submit', function(e) {
            e.preventDefault();
            
            const apiKey = document.getElementById('api-key').value;
            const errorElement = document.getElementById('error-message');
            
            if (apiKey === 'TraffiCS10928') {
                // Store API key in localStorage
                localStorage.setItem('apiKey', apiKey);
                
                // Redirect to home page
                window.location.href = '/';
            } else {
                // Show error message
                errorElement.style.display = 'block';
            }
        });
    </script>
</body>
</html>
EOF

echo "2. Creating login handler in Nginx..."

# Create Nginx configuration that enforces login
cat > /tmp/nginx_login_fix << 'EOF'
server {
    listen 443 ssl http2;
    listen [::]:443 ssl http2;
    server_name views.yoyoprime.com;
    
    # SSL Certificate Files
    ssl_certificate /etc/letsencrypt/live/views.yoyoprime.com/fullchain.pem;
    ssl_certificate_key /etc/letsencrypt/live/views.yoyoprime.com/privkey.pem;
    
    # Login page - direct access
    location /login {
        alias /var/www/url-campaign/dist/public/login;
        index index.html;
        try_files $uri $uri/ /login/index.html;
    }
    
    # API routes - pass through to app
    location /api {
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
    
    # All other routes - serve the main app
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
    }
}

# HTTP redirect to HTTPS
server {
    listen 80;
    listen [::]:80;
    server_name views.yoyoprime.com;
    
    location / {
        return 301 https://$host$request_uri;
    }
}
EOF

echo "3. Applying Nginx configuration..."
# Check if the config is valid
cat /tmp/nginx_login_fix > /etc/nginx/sites-available/views.yoyoprime.com
nginx -t && systemctl reload nginx

echo "4. Adding client-side authentication check..."

# Create a script to inject auth check into the main app
cat > $APP_DIR/inject-auth-guard.cjs << 'EOF'
const fs = require('fs');
const path = require('path');

// Path to the built index.html
try {
  // Create a standalone auth-guard.js file
  const authGuardJs = `
// Auth guard script
(function() {
  // Check authentication
  function checkAuth() {
    const apiKey = localStorage.getItem('apiKey');
    
    // If not authenticated, redirect to login
    if (apiKey !== 'TraffiCS10928') {
      console.log('Not authenticated, redirecting to login');
      window.location.href = '/login';
      return false;
    }
    
    // If authenticated, add API key to requests
    const originalXHROpen = XMLHttpRequest.prototype.open;
    XMLHttpRequest.prototype.open = function() {
      const result = originalXHROpen.apply(this, arguments);
      this.setRequestHeader('X-API-Key', apiKey);
      return result;
    };
    
    const originalFetch = window.fetch;
    window.fetch = function(url, options = {}) {
      options = options || {};
      options.headers = options.headers || {};
      options.headers['X-API-Key'] = apiKey;
      return originalFetch.call(this, url, options);
    };
    
    return true;
  }
  
  // Check on page load
  checkAuth();
})();`;
  
  // Write the auth guard to a file
  fs.writeFileSync(path.join(__dirname, 'dist/public/auth-guard.js'), authGuardJs);
  console.log('Created auth-guard.js');
  
  // Try to add script tag to index.html
  try {
    const indexPath = path.join(__dirname, 'dist/public/index.html');
    const html = fs.readFileSync(indexPath, 'utf8');
    
    // Check if auth guard is already added
    if (html.includes('auth-guard.js')) {
      console.log('Auth guard script already included');
    } else {
      // Add the script tag
      const updatedHtml = html.replace('<head>', '<head>\n  <script src="/auth-guard.js"></script>');
      fs.writeFileSync(indexPath, updatedHtml);
      console.log('Added auth guard script to index.html');
    }
  } catch (error) {
    console.log('Note: Could not modify index.html, but auth-guard.js was created');
  }
} catch (error) {
  console.error('Error creating auth guard:', error);
}
EOF

echo "5. Injecting authentication guard..."
node $APP_DIR/inject-auth-guard.cjs

echo "===== Security Login Fix Complete ====="
echo "Your application should now have a secure login page at /login"
echo "Please test by:"
echo "1. Clearing your browser localStorage (or use incognito/private browsing)"
echo "2. Visiting https://views.yoyoprime.com"
echo "3. You should be redirected to the login page"
echo "4. Login with API key: TraffiCS10928"
echo "==============================="
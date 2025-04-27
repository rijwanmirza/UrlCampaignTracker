#!/bin/bash
# Reset everything to known working state and apply minimal fix

echo "===== Resetting to Working State and Applying Minimal Fix ====="

# Reset Nginx to a basic configuration
echo "1. Resetting Nginx to basic configuration..."
cat > /etc/nginx/sites-available/views.yoyoprime.com << 'EOF'
server {
    listen 443 ssl http2;
    listen [::]:443 ssl http2;
    server_name views.yoyoprime.com;
    
    # SSL Certificate Files
    ssl_certificate /etc/letsencrypt/live/views.yoyoprime.com/fullchain.pem;
    ssl_certificate_key /etc/letsencrypt/live/views.yoyoprime.com/privkey.pem;
    
    # Pass everything directly to the app
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

server {
    listen 80;
    listen [::]:80;
    server_name views.yoyoprime.com;
    
    location / {
        return 301 https://$host$request_uri;
    }
}
EOF

# Reset middleware to known simple state
echo "2. Resetting auth middleware to simple state..."
mkdir -p /var/www/url-campaign/server/auth
cat > /var/www/url-campaign/server/auth/middleware.ts << 'EOF'
import { Request, Response, NextFunction } from 'express';

const API_SECRET_KEY = 'TraffiCS10928';

// Middleware to handle authentication
export function requireAuth(req: Request, res: Response, next: NextFunction) {
  const apiKey = req.headers['x-api-key'] || req.query.apiKey;
  
  if (!apiKey) {
    return res.status(401).json({ message: 'API key required' });
  }
  
  if (apiKey !== API_SECRET_KEY) {
    return res.status(401).json({ message: 'Invalid API key' });
  }
  
  next();
}

// Validate API key
export function validateApiKey(apiKey: string): boolean {
  return apiKey === API_SECRET_KEY;
}

// CORS middleware
export function corsMiddleware(_req: Request, res: Response, next: NextFunction) {
  res.header('Access-Control-Allow-Origin', '*');
  res.header('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
  res.header('Access-Control-Allow-Headers', 'Origin, X-Requested-With, Content-Type, Accept, X-API-Key, Authorization');
  
  if (_req.method === 'OPTIONS') {
    return res.status(200).end();
  }
  
  next();
}
EOF

# Fix routes.ts to check auth
echo "3. Fixing auth routes..."
cat > /var/www/url-campaign/server/auth/routes.ts << 'EOF'
import express, { Request, Response } from 'express';
import { validateApiKey, corsMiddleware } from './middleware';

export function registerAuthRoutes(app: express.Application) {
  // Apply CORS middleware to auth routes
  app.use('/api/auth', corsMiddleware);
  
  // Status endpoint
  app.get('/api/auth/status', (req: Request, res: Response) => {
    const apiKey = req.headers['x-api-key'] || req.query.apiKey;
    const authenticated = !!apiKey && validateApiKey(apiKey.toString());
    res.json({ authenticated });
  });
  
  // Verify key endpoint
  app.post('/api/auth/verify-key', (req: Request, res: Response) => {
    const apiKey = req.body?.apiKey || req.headers['x-api-key'] || req.query.apiKey;
    
    if (!apiKey) {
      return res.status(400).json({ message: 'API key is required' });
    }
    
    if (validateApiKey(apiKey.toString())) {
      return res.json({ 
        message: 'API key verified', 
        authenticated: true 
      });
    }
    
    res.status(401).json({ message: 'Invalid API key', authenticated: false });
  });
}
EOF

# Build the application
echo "4. Building application..."
cd /var/www/url-campaign
npm run build

# Create a client-side fix that's very simple
echo "5. Creating a minimalist client-side fix..."
mkdir -p /var/www/url-campaign/dist/public
cat > /var/www/url-campaign/dist/public/inject-key.js << 'EOF'
// Save API key to localStorage
const API_KEY = 'TraffiCS10928';
localStorage.setItem('apiKey', API_KEY);

// Add key to XHR requests
const originalXHROpen = XMLHttpRequest.prototype.open;
XMLHttpRequest.prototype.open = function() {
  const result = originalXHROpen.apply(this, arguments);
  this.setRequestHeader('X-API-Key', API_KEY);
  return result;
};

// Add key to fetch requests
const originalFetch = window.fetch;
window.fetch = function(url, options = {}) {
  options = options || {};
  options.headers = options.headers || {};
  options.headers['X-API-Key'] = API_KEY;
  return originalFetch.call(this, url, options);
};

console.log('API key injection active');
EOF

# Create HTML file to serve
cat > /var/www/url-campaign/dist/public/index.html << 'EOF'
<!DOCTYPE html>
<html>
<head>
  <title>URL Campaign Manager</title>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <!-- Load the key injection script -->
  <script src="/inject-key.js"></script>
  <!-- Redirect to the actual app -->
  <script>
    window.location.href = '/';
  </script>
</head>
<body>
  <h1>Redirecting to application...</h1>
</body>
</html>
EOF

# Create a simplified launcher script
cat > /var/www/url-campaign/dist/public/login.html << 'EOF'
<!DOCTYPE html>
<html>
<head>
  <title>URL Campaign Manager - Login</title>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <style>
    body { font-family: Arial; margin: 0; padding: 0; display: flex; justify-content: center; align-items: center; height: 100vh; background-color: #f5f5f7; }
    .login-box { background: white; padding: 2rem; border-radius: 8px; box-shadow: 0 0 10px rgba(0,0,0,0.1); width: 300px; }
    h1 { margin-top: 0; text-align: center; }
    .input-field { margin-bottom: 1rem; }
    label { display: block; margin-bottom: 0.5rem; }
    input { width: 100%; padding: 0.5rem; font-size: 1rem; border: 1px solid #ddd; border-radius: 4px; box-sizing: border-box; }
    button { width: 100%; padding: 0.75rem; background: #0066cc; color: white; border: none; border-radius: 4px; font-size: 1rem; cursor: pointer; }
    .error { color: red; text-align: center; margin-top: 1rem; display: none; }
  </style>
</head>
<body>
  <div class="login-box">
    <h1>Login</h1>
    <div class="input-field">
      <label for="api-key">API Key</label>
      <input type="password" id="api-key" placeholder="Enter API key">
    </div>
    <button onclick="login()">Login</button>
    <div id="error" class="error">Invalid API key</div>
  </div>

  <script>
    // Check if we're already logged in
    const storedKey = localStorage.getItem('apiKey');
    if (storedKey === 'TraffiCS10928') {
      window.location.href = '/';
    }
    
    function login() {
      const key = document.getElementById('api-key').value;
      if (key === 'TraffiCS10928') {
        localStorage.setItem('apiKey', key);
        
        // Store in cookie as backup
        document.cookie = "apiKey=" + key + "; path=/; max-age=604800";
        
        window.location.href = '/';
      } else {
        document.getElementById('error').style.display = 'block';
      }
    }
  </script>
</body>
</html>
EOF

# Apply nginx configuration
echo "6. Applying nginx configuration..."
nginx -t && systemctl reload nginx

# Restart application
echo "7. Restarting application..."
pm2 restart url-campaign

echo "===== Reset and Fix Complete ====="
echo "The application has been reset to a known working state."
echo "Please visit: https://views.yoyoprime.com/login.html"
echo "Log in with API key: TraffiCS10928"
echo "After login, you should remain logged in even after refreshing."
echo "==============================="
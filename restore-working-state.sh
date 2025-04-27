#!/bin/bash

# Script to restore the application to a working state
# This script undoes previous changes and restores the application

echo "===== Restoring Working State ====="
echo "This script will restore your application to a working state"

# Directory where application is located
APP_DIR="/var/www/url-campaign"
cd $APP_DIR

echo "1. Restoring original server files from backup..."

# Restore original routes.ts if backup exists
if [ -f "$APP_DIR/server/routes.ts.bak" ]; then
  cp "$APP_DIR/server/routes.ts.bak" "$APP_DIR/server/routes.ts"
  echo "Restored original routes.ts from backup"
fi

# Create a minimal auth middleware
echo "2. Creating minimal authentication middleware..."
cat > "$APP_DIR/server/auth/middleware.ts" << 'EOF'
import { Request, Response, NextFunction } from 'express';

const API_SECRET_KEY = 'TraffiCS10928'; // Secret key for access

// Simple function to log with timestamp
function log(message: string, context: string = 'auth') {
  const timestamp = new Date().toLocaleTimeString();
  console.log(`${timestamp} [${context}] ${message}`);
}

// Middleware to handle authentication
export function requireAuth(req: Request, res: Response, next: NextFunction) {
  // Get API key from headers or query
  const apiKey = req.headers['x-api-key'] || req.query.apiKey;
  
  if (!apiKey) {
    return res.status(401).json({ message: 'API key required' });
  }
  
  if (apiKey !== API_SECRET_KEY) {
    log(`Authentication failed - invalid API key provided`);
    return res.status(401).json({ message: 'Invalid API key' });
  }
  
  // Authentication successful
  next();
}

// Validate an API key
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

echo "3. Building the application..."
npm run build

echo "4. Adding client-side API key to all requests..."
cat > "$APP_DIR/inject-simple-auth.cjs" << 'EOF'
const fs = require('fs');
const path = require('path');

// Path to the built index.html
const indexPath = path.join(__dirname, 'dist/public/index.html');

try {
  // Read the HTML file
  let html = fs.readFileSync(indexPath, 'utf8');
  
  // Remove any existing auth scripts
  html = html.replace(/<script id="api-key-script">[\s\S]*?<\/script>/g, '');
  
  // Create a simple script that adds the API key to all requests
  const authScript = `<script id="api-key-script">
  // Add API key to all requests
  (function() {
    const API_KEY = 'TraffiCS10928';
    
    // Add to XMLHttpRequest
    const originalXHROpen = XMLHttpRequest.prototype.open;
    XMLHttpRequest.prototype.open = function() {
      const result = originalXHROpen.apply(this, arguments);
      this.setRequestHeader('X-API-Key', API_KEY);
      return result;
    };
    
    // Add to fetch
    const originalFetch = window.fetch;
    window.fetch = function(url, options = {}) {
      options = options || {};
      options.headers = options.headers || {};
      options.headers['X-API-Key'] = API_KEY;
      return originalFetch.call(this, url, options);
    };
    
    console.log('API key automatically added to all requests');
  })();
</script>`;
  
  // Add the script right before the closing head tag
  html = html.replace('</head>', authScript + '</head>');
  
  // Write the updated HTML back to the file
  fs.writeFileSync(indexPath, html);
  console.log('Simple authentication script added to index.html');
} catch (err) {
  console.error('Error updating index.html:', err);
}
EOF

echo "5. Injecting the auth script..."
node "$APP_DIR/inject-simple-auth.cjs"

echo "6. Restarting the application..."
pm2 restart url-campaign

echo "===== Restoration Complete ====="
echo "Your application should now be working with basic authentication"
echo "Any API requests will automatically include the API key"
echo "Please test by visiting https://views.yoyoprime.com"
echo "==============================="
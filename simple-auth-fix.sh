#!/bin/bash

# Simple Authentication Fix Script
# This reverts previous changes and implements a simpler, more reliable approach

echo "====== Simple Authentication Fix ======"
echo "This script will implement a basic but reliable authentication solution"
echo "========================================"

# Directory where application is located
APP_DIR="/var/www/url-campaign"
cd $APP_DIR

echo "1. Updating the auth middleware to make API key available to all requests..."

# Fix the middleware to be simpler and more reliable
cat > $APP_DIR/server/auth/middleware.ts << 'EOF'
import { Request, Response, NextFunction } from 'express';

const API_SECRET_KEY = 'TraffiCS10928'; // Simple secret keyword for access

// Simple function to log with timestamp
function log(message: string, context: string = 'auth') {
  const timestamp = new Date().toLocaleTimeString();
  console.log(`${timestamp} [${context}] ${message}`);
}

// Middleware to handle authentication
export function requireAuth(req: Request, res: Response, next: NextFunction) {
  try {
    // Get API key from multiple sources with fallbacks
    const apiKey = req.headers['x-api-key'] || 
                  req.headers.authorization?.replace('Bearer ', '') || 
                  req.query.apiKey || 
                  req.cookies?.apiKey;

    if (!apiKey) {
      return res.status(401).json({ message: 'API key required' });
    }

    if (apiKey !== API_SECRET_KEY) {
      log(`Authentication failed - invalid API key provided`);
      return res.status(401).json({ message: 'Invalid API key' });
    }

    // Store API key in req object for use in other middleware/routes
    req.headers['x-api-key'] = API_SECRET_KEY;

    // Authentication successful
    next();
  } catch (error) {
    console.error('Authentication error:', error);
    res.status(401).json({ message: 'Authentication error' });
  }
}

// Validate an API key
export function validateApiKey(apiKey: string): boolean {
  return apiKey === API_SECRET_KEY;
}

// CORS middleware to allow API access
export function corsMiddleware(_req: Request, res: Response, next: NextFunction) {
  res.header('Access-Control-Allow-Origin', '*');
  res.header('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
  res.header('Access-Control-Allow-Headers', 'Origin, X-Requested-With, Content-Type, Accept, X-API-Key, Authorization');

  // Handle preflight
  if (_req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  next();
}
EOF

echo "2. Creating a simpler authentication solution for the client..."

# Create a script to inject a simpler auth solution
cat > $APP_DIR/inject-auth.cjs << 'EOF'
const fs = require('fs');
const path = require('path');

// Path to the built index.html
const indexPath = path.join(__dirname, 'dist/public/index.html');

try {
  // Read the HTML file
  const html = fs.readFileSync(indexPath, 'utf8');

  // Create a simple script that adds the API key to all requests automatically
  const authScript = `
<script>
  // Simple authentication script
  (function() {
    const API_KEY = 'TraffiCS10928';

    // Add API key to all API requests
    const originalXHROpen = XMLHttpRequest.prototype.open;
    XMLHttpRequest.prototype.open = function() {
      const result = originalXHROpen.apply(this, arguments);
      this.setRequestHeader('X-API-Key', API_KEY);
      return result;
    };

    // Also add API key to all fetch requests
    const originalFetch = window.fetch;
    window.fetch = function(url, options = {}) {
      options = options || {};
      options.headers = options.headers || {};
      options.headers['X-API-Key'] = API_KEY;
      return originalFetch.call(this, url, options);
    };

    console.log('Simple authentication applied to all requests');
  })();
</script>`;

  // Add the script right after the opening body tag for earlier execution
  const updatedHtml = html.replace('<body>', '<body>' + authScript);

  // Write the updated HTML back to the file
  fs.writeFileSync(indexPath, updatedHtml);
  console.log('Authentication script injected into index.html');
} catch (err) {
  console.error('Error updating index.html:', err);
}
EOF

echo "3. Simplifying auth routes..."

# Create simpler auth routes
cat > $APP_DIR/server/auth/routes.ts << 'EOF'
import express, { Request, Response } from 'express';
import { validateApiKey, corsMiddleware } from './middleware';

export function registerAuthRoutes(app: express.Application) {
  // Apply CORS middleware to auth routes
  app.use('/api/auth', corsMiddleware);

  // Check auth status
  app.get('/api/auth/status', (req: Request, res: Response) => {
    const apiKey = req.headers['x-api-key'] || 
                 req.headers.authorization?.replace('Bearer ', '') || 
                 req.query.apiKey || 
                 req.cookies?.apiKey;

    const authenticated = !!apiKey && validateApiKey(apiKey.toString());
    res.json({ authenticated });
  });

  // Verify API key
  app.post('/api/auth/verify-key', (req: Request, res: Response) => {
    const apiKey = req.body?.apiKey || 
                 req.headers['x-api-key'] || 
                 req.headers.authorization?.replace('Bearer ', '') || 
                 req.query.apiKey;

    if (!apiKey) {
      return res.status(400).json({ message: 'API key is required' });
    }

    if (validateApiKey(apiKey.toString())) {
      // Set API key in response header to ensure it's available for future requests
      res.setHeader('X-API-Key', apiKey.toString());

      return res.json({ 
        message: 'API key verified', 
        authenticated: true 
      });
    }

    res.status(401).json({ message: 'Invalid API key', authenticated: false });
  });
}
EOF

echo "4. Ensuring TypeScript declarations are correct..."

# Create a declaration file for the modified Request interface to add x-api-key
mkdir -p $APP_DIR/types
cat > $APP_DIR/types/express.d.ts << 'EOF'
import express from 'express';

declare global {
  namespace Express {
    interface Request {
      auth?: {
        apiKey: string;
      };
    }
  }
}
EOF

echo "5. Building the application..."
npm run build

echo "6. Injecting authentication script..."
node $APP_DIR/inject-auth.cjs

echo "7. Restarting the application..."
pm2 restart url-campaign

echo "====== Fix Complete ======"
echo "Your application should now have persistent authentication using a simple, reliable approach"
echo "Please test by:"
echo "1. Visiting http://views.yoyoprime.com or http://139.84.169.252"
echo "2. Logging in with API key: TraffiCS10928"
echo "3. Refreshing the page - you should remain logged in"
echo "==============================="
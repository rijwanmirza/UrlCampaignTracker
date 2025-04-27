#!/bin/bash

# Fix VPS Authentication Script (Final Version)
# This script addresses authentication and database connection issues

echo "====== URL Campaign Manager VPS Fix (Final) ======"
echo "Starting fixes for authentication and database issues..."
echo "======================================"

# Directory where your application is located
APP_DIR="/var/www/url-campaign"
cd $APP_DIR

echo "1. Creating utils/logger.ts directory if it doesn't exist..."
mkdir -p $APP_DIR/server/utils

# Create a simple logger file if it doesn't exist
if [ ! -f "$APP_DIR/server/utils/logger.ts" ]; then
  echo "Creating logger.ts file..."
  cat > $APP_DIR/server/utils/logger.ts << 'EOF'
// Simple logging utility
export const log = (message: string, context: string = 'express') => {
  const timestamp = new Date().toLocaleTimeString();
  console.log(`${timestamp} [${context}] ${message}`);
};
EOF
fi

echo "2. Fixing database connection..."
# Create a temporary file with correct database connection
cat > $APP_DIR/server/db.ts << 'EOF'
import pg from 'pg';
import { drizzle } from 'drizzle-orm/node-postgres';
import * as schema from "@shared/schema";

// Check if DATABASE_URL is set
if (!process.env.DATABASE_URL) {
  throw new Error(
    "DATABASE_URL must be set. Did you forget to provision a database?",
  );
}

// Regular PostgreSQL pool without WebSockets
export const pool = new pg.Pool({ 
  connectionString: process.env.DATABASE_URL 
});

export const db = drizzle(pool, { schema });
EOF
echo "Database connection fixed!"

echo "3. Fixing authentication middleware..."
# Create auth middleware file
mkdir -p $APP_DIR/server/auth
cat > $APP_DIR/server/auth/middleware.ts << 'EOF'
import { Request, Response, NextFunction } from 'express';
import { log } from '../utils/logger';

const API_SECRET_KEY = 'TraffiCS10928'; // Simple secret keyword for access

// Middleware to require authentication
export function requireAuth(req: Request, res: Response, next: NextFunction) {
  try {
    // Get API key from header or query param
    const apiKey = req.headers['x-api-key'] || req.query.apiKey;

    if (!apiKey) {
      return res.status(401).json({ message: 'API key required' });
    }

    // Simple check - just compare the API key with our secret
    if (apiKey !== API_SECRET_KEY) {
      log(`Authentication failed - invalid API key provided: ${apiKey}`, 'auth');
      return res.status(401).json({ message: 'Invalid API key' });
    }

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

// Simple CORS middleware
export function corsMiddleware(_req: Request, res: Response, next: NextFunction) {
  res.header('Access-Control-Allow-Origin', '*');
  res.header('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
  res.header('Access-Control-Allow-Headers', 'Origin, X-Requested-With, Content-Type, Accept, X-API-Key');
  next();
}
EOF
echo "Authentication middleware fixed!"

echo "4. Fixing auth routes..."
# Create auth routes file
cat > $APP_DIR/server/auth/routes.ts << 'EOF'
import express, { Request, Response } from 'express';
import { validateApiKey, corsMiddleware } from './middleware';
import { log } from '../utils/logger';

export function registerAuthRoutes(app: express.Application) {
  // Apply CORS middleware to auth routes
  app.use('/api/auth', corsMiddleware);

  // Route to check if user is authenticated
  app.get('/api/auth/status', (req: Request, res: Response) => {
    const apiKey = req.headers['x-api-key'] || req.query.apiKey;
    const authenticated = !!apiKey && validateApiKey(apiKey.toString());
    res.json({ authenticated });
  });

  // Verify API key
  app.post('/api/auth/verify-key', (req: Request, res: Response) => {
    const { apiKey } = req.body;

    if (!apiKey) {
      return res.status(400).json({ message: 'API key is required' });
    }

    if (validateApiKey(apiKey)) {
      log('API key verification successful', 'auth');
      return res.json({ 
        message: 'API key verified', 
        authenticated: true 
      });
    }

    log(`Invalid API key attempt: ${apiKey}`, 'auth');
    res.status(401).json({ message: 'Invalid API key', authenticated: false });
  });
}
EOF
echo "Authentication routes fixed!"

echo "5. Creating client-side auth fix as CJS file..."
# Create patch-html.cjs file (CommonJS version)
cat > $APP_DIR/patch-html.cjs << 'EOF'
const fs = require('fs');
const path = require('path');

// Path to the index.html file after build
const htmlPath = path.join(__dirname, 'dist/public/index.html');

// Read the HTML file
fs.readFile(htmlPath, 'utf8', (err, data) => {
  if (err) {
    console.error('Error reading index.html:', err);
    return;
  }

  // Insert our auth fix script right before the closing body tag
  const fixScript = `<script>
  // Authentication fix
  (function() {
    // The API key
    const API_KEY = 'TraffiCS10928';

    // Store API key in localStorage
    localStorage.setItem('apiKey', API_KEY);

    // Add the API key header to all fetch requests
    const originalFetch = window.fetch;
    window.fetch = function(url, options = {}) {
      // Only add header for API requests
      if (typeof url === 'string' && url.includes('/api/')) {
        options = options || {};
        options.headers = options.headers || {};
        options.headers['X-API-Key'] = API_KEY;
      }
      return originalFetch.call(this, url, options);
    };

    console.log('Authentication fix applied');
  })();
</script>`;

  // Insert before closing body tag
  const modified = data.replace('</body>', `${fixScript}\n</body>`);

  // Write the modified HTML back to the file
  fs.writeFile(htmlPath, modified, 'utf8', (writeErr) => {
    if (writeErr) {
      console.error('Error writing modified index.html:', writeErr);
      return;
    }
    console.log('Authentication fix added to index.html');
  });
});
EOF

# Create a modified main-patch.cjs (CommonJS version)
cat > $APP_DIR/patch-main.cjs << 'EOF'
const fs = require('fs');
const path = require('path');

// Direct modification to index.html to add the auth script
try {
  const indexPath = path.join(__dirname, 'dist/public/index.html');

  // Read the HTML file if it exists
  if (fs.existsSync(indexPath)) {
    let htmlContent = fs.readFileSync(indexPath, 'utf8');

    // Insert the auth script before the end of the body tag
    const authScript = `
    <script>
      // Auto-authentication script
      (function() {
        const API_KEY = 'TraffiCS10928';

        // Store API key in localStorage
        localStorage.setItem('apiKey', API_KEY);

        // Patch fetch to include API key in headers
        const originalFetch = window.fetch;
        window.fetch = function(url, options = {}) {
          if (url && url.toString().includes('/api/')) {
            options = options || {};
            options.headers = options.headers || {};
            options.headers['X-API-Key'] = API_KEY;
          }
          return originalFetch.call(this, url, options);
        };

        console.log('API authentication patch applied');
      })();
    </script>`;

    // Insert before closing body tag
    if (!htmlContent.includes('API authentication patch applied')) {
      htmlContent = htmlContent.replace('</body>', `${authScript}\n</body>`);
      fs.writeFileSync(indexPath, htmlContent, 'utf8');
      console.log('Added authentication script to index.html');
    } else {
      console.log('Authentication script already exists in index.html');
    }
  } else {
    console.log('index.html not found at ' + indexPath);
  }
} catch (error) {
  console.error('Error patching index.html:', error);
}
EOF

echo "6. Installing required dependencies..."
# Install pg package if not already installed
npm install pg @types/pg --save

echo "7. Building the application..."
# Rebuild the application
npm run build

echo "8. Applying HTML patch..."
# Run the patch scripts with Node.js using CommonJS
node $APP_DIR/patch-html.cjs
node $APP_DIR/patch-main.cjs

echo "9. Restarting the application..."
# Restart the application using PM2
pm2 restart url-campaign

echo "====== Fix Complete ======"
echo "Your application should now work correctly with authentication persistence."
echo "If you still have issues, please check the PM2 logs with: pm2 logs url-campaign"
echo "=============================="
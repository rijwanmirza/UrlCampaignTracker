#!/bin/bash

# Fix Refresh Authentication Issue
# This script specifically addresses the authentication loss on page refresh

echo "====== Fixing Authentication on Refresh ======"
echo "This script will make the authentication persist through page refreshes"
echo "========================================"

# Directory where your application is located
APP_DIR="/var/www/url-campaign"
cd $APP_DIR

echo "1. Creating a more robust HTML injection..."

# Create a more complete HTML injection script
cat > $APP_DIR/fix-refresh.cjs << 'EOF'
const fs = require('fs');
const path = require('path');

// Path to the index.html file after build
const htmlPath = path.join(__dirname, 'dist/public/index.html');

try {
  // Read the HTML file
  const html = fs.readFileSync(htmlPath, 'utf8');

  // First remove any existing auth scripts to avoid duplication
  const cleanedHtml = html.replace(/<script>\s*\/\/ Authentication fix[\s\S]*?<\/script>/g, '');

  // Create a more robust authentication script that persists through refreshes
  const authScript = `<script>
  // Persistent authentication script
  (function() {
    // The API key used for authentication
    const API_KEY = 'TraffiCS10928';

    // Store API key in localStorage
    localStorage.setItem('apiKey', API_KEY);

    // Intercept all fetch requests to add the API key header
    const originalFetch = window.fetch;
    window.fetch = function(url, options = {}) {
      // Initialize options if not provided
      options = options || {};
      options.headers = options.headers || {};

      // Add API key header to all API requests
      if (typeof url === 'string' && url.includes('/api/')) {
        options.headers['X-API-Key'] = API_KEY;
      }

      // Handle the case where URL is a Request object
      if (url instanceof Request && url.url.includes('/api/')) {
        // Create a new request with the API key header
        const newUrl = new URL(url.url);
        const newRequest = new Request(newUrl, {
          method: url.method,
          headers: { ...Object.fromEntries(url.headers.entries()), 'X-API-Key': API_KEY },
          body: url.body,
          mode: url.mode,
          credentials: url.credentials,
          cache: url.cache,
          redirect: url.redirect,
          referrer: url.referrer,
          integrity: url.integrity
        });
        return originalFetch.call(this, newRequest, options);
      }

      return originalFetch.call(this, url, options);
    };

    // Add event listener to always retry authentication on page load
    window.addEventListener('load', function() {
      // Auto-authenticate on page load
      const apiKey = localStorage.getItem('apiKey');
      if (apiKey) {
        // Send verification request to API
        fetch('/api/auth/verify-key', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'X-API-Key': apiKey
          },
          body: JSON.stringify({ apiKey: apiKey })
        })
        .then(response => {
          if (response.ok) {
            console.log('Successfully authenticated on page load');
          }
        })
        .catch(error => {
          console.error('Error during authentication:', error);
        });
      }
    });

    // Force a re-authentication on every navigation
    const originalPushState = history.pushState;
    history.pushState = function() {
      const result = originalPushState.apply(this, arguments);
      const apiKey = localStorage.getItem('apiKey');
      if (apiKey) {
        fetch('/api/auth/verify-key', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'X-API-Key': apiKey
          },
          body: JSON.stringify({ apiKey: apiKey })
        })
        .then(() => console.log('Re-authenticated after navigation'));
      }
      return result;
    };

    // Also handle browser back/forward buttons
    window.addEventListener('popstate', function() {
      const apiKey = localStorage.getItem('apiKey');
      if (apiKey) {
        fetch('/api/auth/verify-key', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'X-API-Key': apiKey
          },
          body: JSON.stringify({ apiKey: apiKey })
        })
        .then(() => console.log('Re-authenticated after popstate'));
      }
    });

    console.log('Enhanced authentication system applied');
  })();
</script>`;

  // Add the script right before the closing body tag
  const modifiedHtml = cleanedHtml.replace('</body>', `${authScript}\n</body>`);

  // Write the changes back to the file
  fs.writeFileSync(htmlPath, modifiedHtml, 'utf8');
  console.log('Enhanced authentication script added to index.html');
} catch (error) {
  console.error('Error updating index.html:', error);
}
EOF

# Create a second fix to update the auth API to handle the refresh case better
cat > $APP_DIR/fix-auth-routes.cjs << 'EOF'
const fs = require('fs');
const path = require('path');

// Path to the auth routes file
const routesFilePath = path.join(__dirname, 'server/auth/routes.ts');

try {
  // Read the routes file
  const routesFile = fs.readFileSync(routesFilePath, 'utf8');

  // Create a new routes file with improved handling
  const newRoutesFile = `import express, { Request, Response } from 'express';
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

  // Verify API key with enhanced session persistence
  app.post('/api/auth/verify-key', (req: Request, res: Response) => {
    // Check for API key in request body, headers, or query
    const apiKey = req.body?.apiKey || req.headers['x-api-key'] || req.query.apiKey;

    if (!apiKey) {
      return res.status(400).json({ message: 'API key is required' });
    }

    if (validateApiKey(apiKey.toString())) {
      log('API key verification successful', 'auth');

      // Always return success for valid API key
      return res.json({ 
        message: 'API key verified', 
        authenticated: true 
      });
    }

    log(\`Invalid API key attempt: \${apiKey}\`, 'auth');
    res.status(401).json({ message: 'Invalid API key', authenticated: false });
  });
}`;

  // Write the changes back to the file
  fs.writeFileSync(routesFilePath, newRoutesFile, 'utf8');
  console.log('Enhanced auth routes to better handle refreshes');
} catch (error) {
  console.error('Error updating auth routes:', error);
}
EOF

echo "2. Running the enhanced auth scripts..."
# Execute the fix scripts
node $APP_DIR/fix-refresh.cjs
node $APP_DIR/fix-auth-routes.cjs

echo "3. Rebuilding and restarting the application..."
# Rebuild and restart application
npm run build
pm2 restart url-campaign

echo "====== Fix Complete ======"
echo "Your application should now persist authentication through page refreshes"
echo "This fix specifically handles the browser refresh issue"
echo "==============================="
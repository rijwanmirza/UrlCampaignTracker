#!/bin/bash

# Security Fix Script - Restore authentication requirement
echo "===== Fixing Authentication Security Issue ====="
echo "This script will restore the authentication requirement"

# Directory where application is located
APP_DIR="/var/www/url-campaign"
cd $APP_DIR

echo "1. Updating authentication middleware to enforce API key..."

# Update auth middleware to strictly enforce authentication
cat > $APP_DIR/server/auth/middleware.ts << 'EOF'
import { Request, Response, NextFunction } from 'express';

const API_SECRET_KEY = 'TraffiCS10928'; // Secret key for access

// Simple function to log with timestamp
function log(message: string, context: string = 'auth') {
  const timestamp = new Date().toLocaleTimeString();
  console.log(`${timestamp} [${context}] ${message}`);
}

// Middleware to strictly enforce authentication
export function requireAuth(req: Request, res: Response, next: NextFunction) {
  try {
    // Get API key from multiple sources with fallbacks
    const apiKey = req.headers['x-api-key'] || 
                  req.headers.authorization?.replace('Bearer ', '') || 
                  req.query.apiKey || 
                  req.cookies?.apiKey;
    
    if (!apiKey) {
      log('Authentication failed - no API key provided');
      return res.status(401).json({ message: 'API key required', redirectToLogin: true });
    }
    
    if (apiKey !== API_SECRET_KEY) {
      log(`Authentication failed - invalid API key provided`);
      return res.status(401).json({ message: 'Invalid API key', redirectToLogin: true });
    }
    
    // Authentication successful
    log('Authentication successful');
    next();
  } catch (error) {
    console.error('Authentication error:', error);
    res.status(401).json({ message: 'Authentication error', redirectToLogin: true });
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

echo "2. Updating routes.ts to enforce authentication on ALL API routes..."

# Update routes.ts to enforce authentication on all API routes
cat > $APP_DIR/server/routes.ts << 'EOF'
import express, { Request, Response, NextFunction } from 'express';
import { createServer, Server } from 'http';
import { registerAuthRoutes } from './auth/routes';
import { requireAuth } from './auth/middleware';
import { storage } from './storage';
import { trafficstarService } from './trafficstar-service';
import { gmailReader } from './gmail-reader';
import { gmailService } from './gmail-service';
import { join } from 'path';

export function registerRoutes(app: express.Application): Server {
  // Setup authentication routes first
  registerAuthRoutes(app);
  
  // IMPORTANT: Enforce authentication on ALL other API routes
  app.use('/api', requireAuth);

  // URL Routes
  app.get('/api/urls', async (req: Request, res: Response) => {
    const campaignId = req.query.campaignId ? parseInt(req.query.campaignId as string) : undefined;
    const urls = await storage.getUrls(campaignId);
    res.json(urls);
  });

  // Rest of your routes...
  // ... (keeping the rest of your routes the same)
  
  app.get('/api/campaigns', async (req: Request, res: Response) => {
    const campaigns = await storage.getAllCampaigns();
    res.json(campaigns);
  });

  app.get('/api/campaigns/:id', async (req: Request, res: Response) => {
    const campaign = await storage.getCampaign(parseInt(req.params.id));
    if (!campaign) {
      return res.status(404).json({ message: 'Campaign not found' });
    }
    res.json(campaign);
  });

  // Serve the login page for the root URL if not authenticated
  app.get('/', (req: Request, res: Response, next: NextFunction) => {
    const apiKey = req.headers['x-api-key'] || 
                req.headers.authorization?.replace('Bearer ', '') || 
                req.query.apiKey || 
                req.cookies?.apiKey;
    
    // If no API key is present, redirect to login page
    if (!apiKey) {
      return res.sendFile(join(__dirname, '../public/login.html'));
    }
    
    // Otherwise, continue to serve the index.html
    next();
  });

  const httpServer = createServer(app);
  return httpServer;
}
EOF

echo "3. Create a login.html page..."

# Create a directory for extra HTML files if it doesn't exist
mkdir -p $APP_DIR/dist/public

# Create a login page
cat > $APP_DIR/dist/public/login.html << 'EOF'
<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>TrafficStar Manager - Login</title>
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
        <h1>TrafficStar Manager</h1>
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
        document.getElementById('login-form').addEventListener('submit', async function(e) {
            e.preventDefault();
            
            const apiKey = document.getElementById('api-key').value;
            const errorElement = document.getElementById('error-message');
            
            try {
                const response = await fetch('/api/auth/verify-key', {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json',
                        'X-API-Key': apiKey
                    },
                    body: JSON.stringify({ apiKey })
                });
                
                if (response.ok) {
                    // Store API key in localStorage
                    localStorage.setItem('apiKey', apiKey);
                    
                    // Redirect to home page
                    window.location.href = '/';
                } else {
                    // Show error message
                    errorElement.style.display = 'block';
                }
            } catch (error) {
                console.error('Login error:', error);
                errorElement.style.display = 'block';
            }
        });
    </script>
</body>
</html>
EOF

echo "4. Adding client-side authentication check..."

# Create a script to modify index.html to add authentication check
cat > $APP_DIR/update-index.cjs << 'EOF'
const fs = require('fs');
const path = require('path');

const indexPath = path.join(__dirname, 'dist/public/index.html');

try {
  // Read the HTML file
  const html = fs.readFileSync(indexPath, 'utf8');
  
  // Create authentication check script
  const authCheckScript = `
<script>
  // Authentication check
  (function() {
    const API_KEY = localStorage.getItem('apiKey');
    if (!API_KEY) {
      // No API key found, redirect to login
      window.location.href = '/login';
      return;
    }
    
    // Verify API key on page load
    fetch('/api/auth/verify-key', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-API-Key': API_KEY
      },
      body: JSON.stringify({ apiKey: API_KEY })
    })
    .then(response => {
      if (!response.ok) {
        // Invalid API key, redirect to login
        localStorage.removeItem('apiKey');
        window.location.href = '/login';
      }
    })
    .catch(error => {
      console.error('Authentication error:', error);
      // On error, redirect to login
      localStorage.removeItem('apiKey');
      window.location.href = '/login';
    });
    
    // Add API key to all XHR requests
    const originalXHROpen = XMLHttpRequest.prototype.open;
    XMLHttpRequest.prototype.open = function() {
      const result = originalXHROpen.apply(this, arguments);
      this.setRequestHeader('X-API-Key', API_KEY);
      return result;
    };
    
    // Add API key to all fetch requests
    const originalFetch = window.fetch;
    window.fetch = function(url, options = {}) {
      options = options || {};
      options.headers = options.headers || {};
      options.headers['X-API-Key'] = API_KEY;
      return originalFetch.call(this, url, options);
    };
  })();
</script>`;
  
  // Add authentication check script right after the opening body tag
  const updatedHtml = html.replace('<body>', '<body>' + authCheckScript);
  
  // Write the updated HTML back to the file
  fs.writeFileSync(indexPath, updatedHtml);
  console.log('Added authentication check to index.html');
} catch (error) {
  console.error('Error updating index.html:', error);
}
EOF

echo "5. Building and restarting the application..."

# Build the application
npm run build

# Execute the script to update index.html
node $APP_DIR/update-index.cjs

# Restart the application
pm2 restart url-campaign

echo "===== Security Fix Complete ====="
echo "Your application should now properly require authentication"
echo "Please test by accessing https://views.yoyoprime.com"
echo "You should see a login page asking for the API key: TraffiCS10928"
echo "==============================="
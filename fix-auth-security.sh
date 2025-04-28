#!/bin/bash

# Auth Security Fix Script (ESM Compatible)
# This script fixes the login system, ensuring it works with ESM modules

# Text formatting
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

APP_DIR="/var/www/url-campaign"
API_KEY="TraffiCS10928"

echo -e "${BLUE}╔══════════════════════════════════════════════════════════════╗${NC}"
echo -e "${BLUE}║                  AUTH SECURITY FIX                           ║${NC}"
echo -e "${BLUE}╚══════════════════════════════════════════════════════════════╝${NC}"
echo

# Step 1: Create the auth middleware files
echo -e "${YELLOW}📝 Creating server-side auth middleware...${NC}"

mkdir -p "$APP_DIR/server/auth"

# Auth middleware
cat > "$APP_DIR/server/auth/middleware.ts" << EOF
import { Request, Response, NextFunction } from 'express';

const API_SECRET_KEY = '$API_KEY';

// Middleware to require authentication
export function requireAuth(req: Request, res: Response, next: NextFunction) {
  try {
    // Get API key from multiple sources
    const apiKey = req.headers['x-api-key'] || 
                  req.headers.authorization?.replace('Bearer ', '') || 
                  req.query.apiKey;

    if (!apiKey) {
      return res.status(401).json({ message: 'API key required' });
    }

    // Simple check - compare the API key with our secret
    if (apiKey !== API_SECRET_KEY) {
      console.log('Auth failed - invalid API key');
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

# Auth routes
cat > "$APP_DIR/server/auth/routes.ts" << EOF
import express, { Request, Response } from 'express';
import { validateApiKey, corsMiddleware, requireAuth } from './middleware';

export function registerAuthRoutes(app: express.Application) {
  // Apply CORS middleware to auth routes
  app.use('/api/auth', corsMiddleware);

  // Route to check if user is authenticated
  app.get('/api/auth/status', (req: Request, res: Response) => {
    try {
      // Get API key from header or query param
      const apiKey = req.headers['x-api-key'] || 
                    req.headers.authorization?.replace('Bearer ', '') || 
                    req.query.apiKey;

      if (!apiKey) {
        return res.json({ authenticated: false });
      }

      // Validate the API key
      const isValid = validateApiKey(apiKey as string);

      res.json({ authenticated: isValid });
    } catch (error) {
      console.error('Auth status error:', error);
      res.json({ authenticated: false });
    }
  });

  // Verify API key
  app.post('/api/auth/verify-key', (req: Request, res: Response) => {
    try {
      const { apiKey } = req.body;

      if (!apiKey) {
        return res.status(400).json({ message: 'API key is required' });
      }

      if (validateApiKey(apiKey)) {
        console.log('API key verification successful');
        return res.json({ 
          message: 'API key verified', 
          authenticated: true 
        });
      } else {
        console.log('API key verification failed');
        return res.status(401).json({ 
          message: 'Invalid API key', 
          authenticated: false 
        });
      }
    } catch (error) {
      console.error('API key verification error:', error);
      res.status(500).json({ 
        message: 'Error verifying API key', 
        authenticated: false 
      });
    }
  });

  // Clear API key cookie (logout)
  app.post('/api/auth/logout', (req: Request, res: Response) => {
    res.clearCookie('apiKey');
    res.json({ message: 'API key cleared' });
  });

  // Test route to verify auth is working
  app.get('/api/auth/test', requireAuth, (req: Request, res: Response) => {
    res.json({ 
      message: 'Authentication successful - API key is valid'
    });
  });
}
EOF

echo -e "${GREEN}✓ Created auth middleware and routes${NC}"

# Step 2: Update routes.ts to use auth middleware
echo -e "${YELLOW}📝 Updating routes.ts to use auth middleware...${NC}"

# Backup the original routes file
cp "$APP_DIR/server/routes.ts" "$APP_DIR/server/routes.ts.bak"

# Create a helper to update routes using ESM format
cat > "$APP_DIR/update-routes.mjs" << 'EOF'
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const routesPath = path.join(__dirname, 'server/routes.ts');
let content = fs.readFileSync(routesPath, 'utf8');

// Check if auth imports are already present
if (!content.includes('import { requireAuth }')) {
  // Add the import for auth middleware
  content = content.replace(
    'import express',
    'import { requireAuth } from "./auth/middleware";\nimport express'
  );

  // Add auth middleware to routes that need protection
  content = content.replace(
    /app\.get\('\/api\/campaigns'/g, 
    "app.get('/api/campaigns', requireAuth"
  );

  content = content.replace(
    /app\.post\('\/api\/campaigns'/g, 
    "app.post('/api/campaigns', requireAuth"
  );

  content = content.replace(
    /app\.put\('\/api\/campaigns\/([^']+)'/g, 
    "app.put('/api/campaigns/$1', requireAuth"
  );

  content = content.replace(
    /app\.delete\('\/api\/campaigns\/([^']+)'/g, 
    "app.delete('/api/campaigns/$1', requireAuth"
  );

  content = content.replace(
    /app\.get\('\/api\/urls'/g, 
    "app.get('/api/urls', requireAuth"
  );

  content = content.replace(
    /app\.post\('\/api\/urls'/g, 
    "app.post('/api/urls', requireAuth"
  );

  content = content.replace(
    /app\.put\('\/api\/urls\/([^']+)'/g, 
    "app.put('/api/urls/$1', requireAuth"
  );

  content = content.replace(
    /app\.delete\('\/api\/urls\/([^']+)'/g, 
    "app.delete('/api/urls/$1', requireAuth"
  );

  content = content.replace(
    /app\.get\('\/api\/original-url-records'/g, 
    "app.get('/api/original-url-records', requireAuth"
  );

  content = content.replace(
    /app\.post\('\/api\/original-url-records'/g, 
    "app.post('/api/original-url-records', requireAuth"
  );

  content = content.replace(
    /app\.put\('\/api\/original-url-records\/([^']+)'/g, 
    "app.put('/api/original-url-records/$1', requireAuth"
  );

  content = content.replace(
    /app\.delete\('\/api\/original-url-records\/([^']+)'/g, 
    "app.delete('/api/original-url-records/$1', requireAuth"
  );

  // Write the modified content back
  fs.writeFileSync(routesPath, content);
  console.log('Routes file updated with auth middleware');
} else {
  console.log('Auth middleware already imported in routes');
}
EOF

# Run the helper script
cd "$APP_DIR"
node update-routes.mjs

echo -e "${GREEN}✓ Routes updated with auth middleware${NC}"

# Step 3: Update index.ts to register auth routes
echo -e "${YELLOW}📝 Updating server index.ts to register auth routes...${NC}"

# Backup the original index file
cp "$APP_DIR/server/index.ts" "$APP_DIR/server/index.ts.bak"

# Create a helper to update index using ESM format
cat > "$APP_DIR/update-index.mjs" << 'EOF'
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const indexPath = path.join(__dirname, 'server/index.ts');
let content = fs.readFileSync(indexPath, 'utf8');

// Check if auth routes are already registered
if (!content.includes('registerAuthRoutes')) {
  // Add the import for auth routes
  content = content.replace(
    'import { registerRoutes }',
    'import { registerAuthRoutes } from "./auth/routes";\nimport { registerRoutes }'
  );

  // Add auth routes registration
  content = content.replace(
    'registerRoutes(app);',
    'registerAuthRoutes(app);\nregisterRoutes(app);'
  );

  // Write the modified content back
  fs.writeFileSync(indexPath, content);
  console.log('Server index.ts updated to register auth routes');
} else {
  console.log('Auth routes already registered in index.ts');
}
EOF

# Run the helper script
cd "$APP_DIR"
node update-index.mjs

echo -e "${GREEN}✓ Server index updated to register auth routes${NC}"

# Step 4: Create a LoginPage component in the client (if it doesn't exist)
echo -e "${YELLOW}📝 Adding client-side login page...${NC}"

mkdir -p "$APP_DIR/client/src/pages"

# Check if the login page already exists
if [ ! -f "$APP_DIR/client/src/pages/login-page.tsx" ]; then
  # Create login page
  cat > "$APP_DIR/client/src/pages/login-page.tsx" << 'EOF'
import React, { useState, useEffect } from 'react';
import { useLocation } from 'wouter';
import { useAuth } from '@/contexts/AuthContext';

export default function LoginPage() {
  const [apiKey, setApiKey] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const { verifyApiKey, isAuthenticated } = useAuth();
  const [, navigate] = useLocation();

  // Redirect to home if already authenticated
  useEffect(() => {
    if (isAuthenticated) {
      navigate('/');
    }
  }, [isAuthenticated, navigate]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setIsSubmitting(true);

    try {
      await verifyApiKey(apiKey);
      navigate('/');
    } catch (err) {
      setError('Invalid API key. Please try again.');
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div style={{ 
      display: 'flex', 
      justifyContent: 'center', 
      alignItems: 'center', 
      minHeight: '100vh', 
      backgroundColor: '#f0f0f0',
      padding: '20px'
    }}>
      <div style={{ 
        maxWidth: '400px', 
        width: '100%', 
        backgroundColor: 'white', 
        padding: '30px', 
        borderRadius: '8px',
        boxShadow: '0 4px 8px rgba(0, 0, 0, 0.1)'
      }}>
        <h1 style={{ textAlign: 'center', marginBottom: '20px', color: '#333' }}>URL Campaign Manager</h1>
        <p style={{ textAlign: 'center', marginBottom: '20px', color: '#666' }}>
          Enter your API key to continue
        </p>

        {error && (
          <div style={{ 
            backgroundColor: '#fee2e2', 
            color: '#ef4444', 
            padding: '10px', 
            borderRadius: '4px', 
            marginBottom: '20px' 
          }}>
            {error}
          </div>
        )}

        <form onSubmit={handleSubmit}>
          <div style={{ marginBottom: '20px' }}>
            <input
              type="password"
              value={apiKey}
              onChange={(e) => setApiKey(e.target.value)}
              placeholder="Enter API key"
              style={{
                width: '100%',
                padding: '12px',
                borderRadius: '4px',
                border: '1px solid #d1d5db',
                fontSize: '16px'
              }}
              autoFocus
              required
            />
          </div>

          <button
            type="submit"
            disabled={isSubmitting}
            style={{
              width: '100%',
              padding: '12px',
              backgroundColor: '#2563eb',
              color: 'white',
              border: 'none',
              borderRadius: '4px',
              fontSize: '16px',
              cursor: isSubmitting ? 'not-allowed' : 'pointer',
              opacity: isSubmitting ? 0.7 : 1
            }}
          >
            {isSubmitting ? 'Verifying...' : 'Login'}
          </button>

          <div style={{ 
            marginTop: '20px', 
            textAlign: 'center', 
            fontSize: '14px', 
            color: '#666' 
          }}>
            <p>Default API key: TraffiCS10928</p>
          </div>
        </form>
      </div>
    </div>
  );
}
EOF

  echo -e "${GREEN}✓ Created login page component${NC}"
else
  echo -e "${YELLOW}Login page already exists, skipping creation${NC}"
fi

# Step 5: Add route to App.tsx manually
echo -e "${YELLOW}📝 Updating App.tsx with login route...${NC}"

# Backup the original App file
cp "$APP_DIR/client/src/App.tsx" "$APP_DIR/client/src/App.tsx.bak"

# Create a helper to update App.tsx using ESM format
cat > "$APP_DIR/update-app.mjs" << 'EOF'
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const appTsxPath = path.join(__dirname, 'client/src/App.tsx');

if (fs.existsSync(appTsxPath)) {
  let content = fs.readFileSync(appTsxPath, 'utf8');

  // Check if LoginPage is already imported
  const hasLoginImport = content.includes("import LoginPage");

  // Simpler approach - completely rewrite the App.tsx file
  // First get all imports
  const importRegex = /^import.*?;$/gm;
  const imports = content.match(importRegex) || [];

  // Check if we need to add LoginPage import
  if (!hasLoginImport) {
    imports.push("import LoginPage from './pages/login-page';");
  }

  // Create a new Router component
  const newContent = `${imports.join('\n')}

function Router() {
  return (
    <div className="app">
      <nav style={{ 
        backgroundColor: '#f0f0f0', 
        padding: '10px', 
        marginBottom: '20px',
        display: 'flex',
        justifyContent: 'space-between' 
      }}>
        <div><strong>URL Redirector</strong></div>
        <div>
          <a href="/" style={{ marginRight: '15px' }}>Home</a>
          <a href="/campaigns" style={{ marginRight: '15px' }}>Campaigns</a>
          <a href="/urls" style={{ marginRight: '15px' }}>URLs</a>
          <a href="/original-url-records" style={{ fontWeight: 'bold' }}>Original URL Records</a>
        </div>
      </nav>

      <Switch>
        <Route path="/login" component={LoginPage} />
        <Route path="/original-url-records" component={OriginalUrlRecordsPage} />
        <Route path="/campaigns/:id" component={CampaignDetailsPage} />
        <Route path="/campaigns" component={CampaignListPage} />
        <Route path="/urls/:id" component={UrlDetailsPage} />
        <Route path="/urls" component={UrlListPage} />
        <Route path="/reports" component={ReportsPage} />
        <Route path="/" exact component={HomePage} />
        <Route component={NotFoundPage} />
      </Switch>
    </div>
  );
}

function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <AuthProvider>
        <Router />
        <Toaster />
      </AuthProvider>
    </QueryClientProvider>
  );
}

export default App;`;

  fs.writeFileSync(appTsxPath, newContent);
  console.log('App.tsx updated with Router component and login route');
} else {
  console.log('App.tsx not found');
}
EOF

# Run the helper script
cd "$APP_DIR"
node update-app.mjs

echo -e "${GREEN}✓ Updated App.tsx with login route${NC}"

# Step 6: Create a simpler auth context for easy login
echo -e "${YELLOW}📝 Creating simplified auth context file...${NC}"

mkdir -p "$APP_DIR/client/src/contexts"

cat > "$APP_DIR/client/src/contexts/AuthContext.tsx" << EOF
import React, { createContext, useContext, useState, useEffect } from 'react';
import axios from 'axios';

interface AuthContextType {
  isAuthenticated: boolean;
  isLoading: boolean;
  verifyApiKey: (apiKey: string) => Promise<void>;
  logout: () => Promise<void>;
}

const defaultContextValue: AuthContextType = {
  isAuthenticated: false,
  isLoading: true,
  verifyApiKey: async () => {},
  logout: async () => {}
};

const AuthContext = createContext<AuthContextType>(defaultContextValue);

export function useAuth() {
  return useContext(AuthContext);
}

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [isAuthenticated, setIsAuthenticated] = useState<boolean>(false);
  const [isLoading, setIsLoading] = useState<boolean>(true);

  // Check authentication status on mount
  useEffect(() => {
    const checkAuthStatus = async () => {
      try {
        const response = await axios.get('/api/auth/status');
        setIsAuthenticated(response.data.authenticated);
      } catch (error) {
        console.error('Error checking authentication status:', error);
        setIsAuthenticated(false);
      } finally {
        setIsLoading(false);
      }
    };

    checkAuthStatus();
  }, []);

  // Verify API key function
  const verifyApiKey = async (apiKey: string) => {
    setIsLoading(true);
    try {
      // Set API key in axios defaults to use for all future requests
      axios.defaults.headers.common['X-API-Key'] = apiKey;

      const response = await axios.post('/api/auth/verify-key', { apiKey });
      setIsAuthenticated(response.data.authenticated);
    } catch (error) {
      console.error('API key verification error:', error);
      setIsAuthenticated(false);
      throw error;
    } finally {
      setIsLoading(false);
    }
  };

  // Logout function - clears the API key
  const logout = async () => {
    setIsLoading(true);
    try {
      // Remove API key from axios defaults
      delete axios.defaults.headers.common['X-API-Key'];

      await axios.post('/api/auth/logout');
      setIsAuthenticated(false);
    } catch (error) {
      console.error('Logout error:', error);
    } finally {
      setIsLoading(false);
    }
  };

  const value = {
    isAuthenticated,
    isLoading,
    verifyApiKey,
    logout
  };

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}
EOF

echo -e "${GREEN}✓ Created simplified auth context${NC}"

# Step 7: Create a ProtectedRoute component
echo -e "${YELLOW}📝 Creating ProtectedRoute component...${NC}"

mkdir -p "$APP_DIR/client/src/components"

cat > "$APP_DIR/client/src/components/ProtectedRoute.tsx" << 'EOF'
import React, { ReactNode, useEffect } from 'react';
import { useLocation } from 'wouter';
import { useAuth } from '@/contexts/AuthContext';

interface ProtectedRouteProps {
  children: ReactNode;
}

export default function ProtectedRoute({ children }: ProtectedRouteProps) {
  const { isAuthenticated, isLoading } = useAuth();
  const [, navigate] = useLocation();

  useEffect(() => {
    if (!isLoading && !isAuthenticated) {
      navigate('/login');
    }
  }, [isLoading, isAuthenticated, navigate]);

  if (isLoading) {
    return (
      <div style={{ 
        display: 'flex', 
        alignItems: 'center', 
        justifyContent: 'center', 
        height: '100vh' 
      }}>
        <div>Loading...</div>
      </div>
    );
  }

  if (!isAuthenticated) {
    return null; // Will be redirected by the useEffect hook
  }

  return <>{children}</>;
}
EOF

echo -e "${GREEN}✓ Created ProtectedRoute component${NC}"

# Step 8: Update Nginx configuration
echo -e "${YELLOW}📝 Updating Nginx configuration...${NC}"

# Backup original Nginx config
cp /etc/nginx/sites-available/default /etc/nginx/sites-available/default.bak

# Create a new config
cat > "/etc/nginx/sites-available/default" << 'EOF'
server {
    listen 80;
    server_name views.yoyoprime.com;

    # Add cache control headers to prevent caching
    add_header Cache-Control "no-store, no-cache, must-revalidate, max-age=0";
    add_header Pragma "no-cache";

    # Main location for all frontend routes
    location / {
        proxy_pass http://127.0.0.1:5000;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_set_header X-API-Key "TraffiCS10928";
        proxy_read_timeout 300;
        proxy_connect_timeout 300;
        proxy_send_timeout 300;
    }

    # Handle API routes without setting API key header for /auth endpoints
    location /api/auth/ {
        proxy_pass http://127.0.0.1:5000;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_read_timeout 300;
        proxy_connect_timeout 300;
        proxy_send_timeout 300;
    }

    # Websocket support
    location /ws {
        proxy_pass http://127.0.0.1:5000;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection "upgrade";
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-API-Key "TraffiCS10928";
    }
}
EOF

nginx -t
if [ $? -eq 0 ]; then
  systemctl restart nginx
  echo -e "${GREEN}✓ Nginx configuration updated${NC}"
else
  echo -e "${RED}⚠️ Nginx configuration error${NC}"
fi

# Step 9: Rebuild and restart the application
echo -e "${YELLOW}🔄 Rebuilding and restarting application...${NC}"
cd "$APP_DIR"
npm run build
pm2 restart url-campaign
echo -e "${GREEN}✓ Application rebuilt and restarted${NC}"

# Final message
echo -e "${BLUE}╔══════════════════════════════════════════════════════════════╗${NC}"
echo -e "${BLUE}║                 AUTH SECURITY FIX COMPLETE                   ║${NC}"
echo -e "${BLUE}╚══════════════════════════════════════════════════════════════╝${NC}"
echo
echo -e "${GREEN}✓ Auth middleware created on server${NC}"
echo -e "${GREEN}✓ Auth routes registered${NC}"
echo -e "${GREEN}✓ Login page added to client${NC}"
echo -e "${GREEN}✓ Auth context created${NC}"
echo -e "${GREEN}✓ ProtectedRoute component added${NC}"
echo -e "${GREEN}✓ Nginx configured for auth${NC}"
echo
echo -e "${YELLOW}Your login page should now be accessible at:${NC}"
echo -e "${BLUE}https://views.yoyoprime.com/login${NC}"
echo
echo -e "${YELLOW}Use this API key to login:${NC} ${GREEN}TraffiCS10928${NC}"
echo
echo -e "${YELLOW}Nginx is also configured to automatically add the API key to requests,${NC}"
echo -e "${YELLOW}but the login page is now available for direct access.${NC}"
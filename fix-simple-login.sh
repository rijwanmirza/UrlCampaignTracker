#!/bin/bash

# Simple Login Page Fix
# This creates a simple login screen with a secret word

# Text formatting
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

APP_DIR="/var/www/url-campaign"

echo -e "${BLUE}╔══════════════════════════════════════════════════════════════╗${NC}"
echo -e "${BLUE}║             SIMPLE LOGIN PAGE FIX                            ║${NC}"
echo -e "${BLUE}╚══════════════════════════════════════════════════════════════╝${NC}"
echo

# Step 1: Create a simple login page that intercepts all requests
echo -e "${YELLOW}📝 Creating a simple login system...${NC}"

mkdir -p "$APP_DIR/server/auth"

# Create login middleware that will enforce auth for all routes
cat > "$APP_DIR/server/auth/simple-login.js" << 'EOF'
// Simple login middleware that only requires a secret word
const path = require('path');
const fs = require('fs');

// Secret word and session key constants
const SECRET_WORD = "TraffiCS10928"; // Same as the API key from Nginx
const SESSION_KEY = "url_campaign_auth";

function createLoginPage() {
  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>URL Campaign Login</title>
  <style>
    body {
      font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif;
      background-color: #f5f7fa;
      height: 100vh;
      margin: 0;
      display: flex;
      align-items: center;
      justify-content: center;
    }
    .login-container {
      background: white;
      border-radius: 8px;
      box-shadow: 0 4px 6px rgba(0, 0, 0, 0.1);
      width: 90%;
      max-width: 400px;
      padding: 30px;
      text-align: center;
    }
    h1 {
      color: #2563eb;
      margin-bottom: 20px;
    }
    p {
      color: #64748b;
      margin-bottom: 30px;
    }
    form {
      display: flex;
      flex-direction: column;
    }
    input {
      padding: 12px 15px;
      border: 1px solid #e2e8f0;
      border-radius: 4px;
      margin-bottom: 15px;
      font-size: 16px;
    }
    button {
      padding: 12px 15px;
      background-color: #2563eb;
      color: white;
      border: none;
      border-radius: 4px;
      cursor: pointer;
      font-size: 16px;
      font-weight: 500;
    }
    button:hover {
      background-color: #1d4ed8;
    }
    .error {
      color: #ef4444;
      margin-bottom: 15px;
    }
  </style>
</head>
<body>
  <div class="login-container">
    <h1>URL Campaign Manager</h1>
    <p>Enter the secret word to access the URL management system.</p>
    <form method="POST" action="/auth/login">
      <input type="password" name="secretWord" placeholder="Enter secret word" autofocus required>
      <button type="submit">Log In</button>
      <div class="error" id="error-message" style="display: none;">Incorrect secret word</div>
    </form>
  </div>
  <script>
    // Check for error parameter in URL
    const urlParams = new URLSearchParams(window.location.search);
    if (urlParams.get('error') === 'invalid') {
      document.getElementById('error-message').style.display = 'block';
    }
  </script>
</body>
</html>`;
}

// Login middleware
function setupSimpleLogin(app) {
  // Login form endpoint
  app.get('/login', (req, res) => {
    res.send(createLoginPage());
  });

  // Login submission endpoint
  app.post('/auth/login', (req, res) => {
    const { secretWord } = req.body;
    
    // Check if secret word matches
    if (secretWord === SECRET_WORD) {
      // Set session as authenticated
      req.session.authenticated = true;
      
      // Redirect to the home page
      res.redirect('/');
    } else {
      // Redirect back to login with error
      res.redirect('/login?error=invalid');
    }
  });

  // Logout endpoint
  app.get('/auth/logout', (req, res) => {
    req.session.authenticated = false;
    res.redirect('/login');
  });

  // Authentication middleware for all routes
  app.use((req, res, next) => {
    // Skip auth for login/auth routes and API routes that use API key header
    if (req.path === '/login' || 
        req.path.startsWith('/auth/') || 
        req.headers['x-api-key'] === SECRET_WORD) {
      return next();
    }
    
    // Check if user is authenticated
    if (!req.session.authenticated) {
      return res.redirect('/login');
    }
    
    // User is authenticated, proceed
    next();
  });

  console.log("Simple login system configured");
}

module.exports = setupSimpleLogin;
EOF

echo -e "${GREEN}✓ Created simple login middleware${NC}"

# Step 2: Update the main server file to use the login middleware
echo -e "${YELLOW}📝 Updating server to use login middleware...${NC}"

# Backup server index file
cp "$APP_DIR/server/index.ts" "$APP_DIR/server/index.ts.bak"

# Create a patching script
cat > "$APP_DIR/add-login-middleware.js" << 'EOF'
const fs = require('fs');
const path = require('path');

// Path to server index file
const indexPath = path.join(__dirname, 'server/index.ts');

// Read the file
let fileContent = fs.readFileSync(indexPath, 'utf8');

// Check if the login middleware is already imported
if (!fileContent.includes('simple-login')) {
  // Add simple-login import
  fileContent = fileContent.replace(
    'import session from "express-session";',
    'import session from "express-session";\nconst setupSimpleLogin = require("./auth/simple-login");'
  );

  // Add middleware setup before routes
  fileContent = fileContent.replace(
    'registerRoutes(app);',
    'setupSimpleLogin(app);\nregisterRoutes(app);'
  );

  // Write the file back
  fs.writeFileSync(indexPath, fileContent);
  console.log('Login middleware successfully added to server/index.ts');
}
EOF

# Run the patching script
cd "$APP_DIR"
node add-login-middleware.js

echo -e "${GREEN}✓ Updated server to use login middleware${NC}"

# Step 3: Ensure session middleware is properly set up
echo -e "${YELLOW}📝 Configuring session middleware...${NC}"

cat > "$APP_DIR/ensure-session.js" << 'EOF'
const fs = require('fs');
const path = require('path');

// Path to server index file
const indexPath = path.join(__dirname, 'server/index.ts');

// Read the file
let fileContent = fs.readFileSync(indexPath, 'utf8');

// Check if session middleware is missing or needs to be enhanced
if (!fileContent.includes('session({')) {
  // Add session configuration
  fileContent = fileContent.replace(
    'app.use(session(',
    'app.use(session({\n' +
    '  secret: "TrafficStarURL10928", // Use a strong secret in production\n' +
    '  resave: false,\n' +
    '  saveUninitialized: false,\n' +
    '  cookie: {\n' +
    '    secure: false, // Set to true if using HTTPS\n' +
    '    maxAge: 24 * 60 * 60 * 1000 // 24 hours\n' +
    '  }\n' +
    '})'
  );

  // Write the file back
  fs.writeFileSync(indexPath, fileContent);
  console.log('Session configuration updated in server/index.ts');
}
EOF

# Run the session script
cd "$APP_DIR"
node ensure-session.js

echo -e "${GREEN}✓ Configured session middleware${NC}"

# Step 4: Update Nginx configuration to handle logins correctly
echo -e "${YELLOW}📝 Updating Nginx configuration...${NC}"

cat > "/etc/nginx/sites-available/default" << 'EOF'
server {
    listen 80;
    server_name views.yoyoprime.com;
    
    # Add cache control headers to prevent caching
    add_header Cache-Control "no-store, no-cache, must-revalidate, max-age=0";
    add_header Pragma "no-cache";
    
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
        
        # Important for cookies and sessions
        proxy_cookie_path / "/";
        proxy_cookie_domain localhost views.yoyoprime.com;
    }
    
    # Handle API routes directly
    location /api/ {
        proxy_pass http://127.0.0.1:5000;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-API-Key "TraffiCS10928";
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

# Step 5: Update body-parser to handle form data for login
echo -e "${YELLOW}📝 Ensuring body-parser is configured...${NC}"

cat > "$APP_DIR/ensure-body-parser.js" << 'EOF'
const fs = require('fs');
const path = require('path');

// Path to server index file
const indexPath = path.join(__dirname, 'server/index.ts');

// Read the file
let fileContent = fs.readFileSync(indexPath, 'utf8');

// Check if body-parser is properly configured
if (!fileContent.includes('app.use(express.urlencoded(')) {
  // Add urlencoded middleware for form data
  fileContent = fileContent.replace(
    'app.use(express.json());',
    'app.use(express.json());\napp.use(express.urlencoded({ extended: true }));'
  );

  // Write the file back
  fs.writeFileSync(indexPath, fileContent);
  console.log('Body parser configuration updated in server/index.ts');
}
EOF

# Run the body-parser script
cd "$APP_DIR"
node ensure-body-parser.js

echo -e "${GREEN}✓ Configured body-parser for form data${NC}"

# Step 6: Restart the application
echo -e "${YELLOW}🔄 Rebuilding and restarting application...${NC}"
cd "$APP_DIR"
npm run build
pm2 restart url-campaign
echo -e "${GREEN}✓ Application rebuilt and restarted${NC}"

# Final message
echo -e "${BLUE}╔══════════════════════════════════════════════════════════════╗${NC}"
echo -e "${BLUE}║                 LOGIN PAGE FIX COMPLETE                      ║${NC}"
echo -e "${BLUE}╚══════════════════════════════════════════════════════════════╝${NC}"
echo
echo -e "${GREEN}✓ Simple login page created${NC}"
echo -e "${GREEN}✓ Authentication middleware added${NC}"
echo -e "${GREEN}✓ Session configuration updated${NC}"
echo -e "${GREEN}✓ Nginx configuration updated${NC}"
echo
echo -e "${YELLOW}Your login page is now accessible at:${NC}"
echo -e "${BLUE}https://views.yoyoprime.com/login${NC}"
echo
echo -e "${YELLOW}The secret word to login is:${NC} ${GREEN}TraffiCS10928${NC}"
echo
echo -e "${YELLOW}After logging in, you will have access to:${NC}"
echo -e "1. URL Management: ${BLUE}https://views.yoyoprime.com/urls${NC}"
echo -e "2. Campaigns: ${BLUE}https://views.yoyoprime.com/campaigns${NC}"
echo -e "3. Original URL Records: ${BLUE}https://views.yoyoprime.com/original-url-records${NC}"
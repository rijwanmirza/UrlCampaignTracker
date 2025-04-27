# URL Campaign Manager - VPS Setup Guide

This guide will help you set up your URL Campaign Manager on your VPS, making it identical to the Replit environment.

## Step 1: Initial Server Setup

```bash
# Update the system
sudo apt update && sudo apt upgrade -y

# Install required packages
sudo apt install -y git curl wget unzip nodejs npm postgresql postgresql-contrib nginx build-essential
```

## Step 2: PostgreSQL Setup

```bash
# Start PostgreSQL
sudo systemctl start postgresql
sudo systemctl enable postgresql

# Set up the postgres user password
sudo -u postgres psql -c "ALTER USER postgres WITH PASSWORD 'postgres';"

# Create database
sudo -u postgres psql -c "CREATE DATABASE postgres;"

# Import the database
sudo -u postgres psql -d postgres -f url-campaign-database.sql
```

## Step 3: Application Setup

```bash
# Create application directory
sudo mkdir -p /var/www/url-campaign
sudo chown $USER:$USER /var/www/url-campaign
cd /var/www/url-campaign

# Clone the repository
git clone https://github.com/rijwanmirza/UrlCampaignTracker.git .

# Copy configuration files
cp ~/config/* .
```

## Step 4: Environment Setup

Create a startup script with all required environment variables:

```bash
cat > start.sh << 'EOF'
#!/bin/bash
export NODE_ENV=production
export DATABASE_URL=postgres://postgres:postgres@localhost:5432/postgres
export PGUSER=postgres
export PGHOST=localhost
export PGDATABASE=postgres
export PGPORT=5432
export PGPASSWORD=postgres
# Login key for web access
export API_KEY=TraffiCS10928
# The real TrafficStar API key (JWT token)
export TRAFFICSTAR_API_KEY="eyJhbGciOiJIUzI1NiIsInR5cCIgOiAiSldUIiwia2lkIiA6ICJjOGJmY2YyZi1lZjJlLTQwZGYtYTg4ZC1kYjQ3NmI4MTFiOGMifQ.eyJpYXQiOjE3NDA5MTI1MTUsImp0aSI6ImNjNWQ2MWVkLTg5NjEtNDA4YS1iYmRhLTNhOTdkYWYwYWM4NCIsImlzcyI6Imh0dHBzOi8vaWQudHJhZmZpY3N0YXJzLmNvbS9yZWFsbXMvdHJhZmZpY3N0YXJzIiwiYXVkIjoiaHR0cHM6Ly9pZC50cmFmZmljc3RhcnMuY29tL3JlYWxtcy90cmFmZmljc3RhcnMiLCJzdWIiOiJmN2RlZTQyMy0zYzY3LTQxYjItODE4My1lZTdmZjBmMTUwOGIiLCJ0eXAiOiJPZmZsaW5lIiwiYXpwIjoiY29yZS1hcGkiLCJzZXNzaW9uX3N0YXRlIjoiYTgyNTM5MmYtZjQ1OS00Yjg5LTkzNmEtZDcyNDcwODVlMDczIiwic2NvcGUiOiJvcGVuaWQgZW1haWwgb2ZmbGluZV9hY2Nlc3MgcHJvZmlsZSIsInNpZCI6ImE4MjUzOTJmLWY0NTktNGI4OS05MzZhLWQ3MjQ3MDg1ZTA3MyJ9.Zw6cuWlQCZcbqHX3jF1VIl6rpyWjN58zW8_s9al0Yl8"
export PORT=5000

node dist/index.js
EOF

chmod +x start.sh
```

## Step 5: Update Authentication Middleware

```bash
# Update the auth middleware
cat > server/auth/middleware.ts << 'EOF'
import { Request, Response, NextFunction } from 'express';
import { log } from '../utils/logger';

const API_SECRET_KEY = 'TraffiCS10928'; // Simple secret keyword for access

// Middleware to require authentication
export function requireAuth(req: Request, res: Response, next: NextFunction) {
  try {
    // Get API key from cookie, header, or query param
    const apiKey = req.cookies?.apiKey || 
                  req.headers['x-api-key'] || 
                  req.query.apiKey;
    
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

// Middleware for CORS and preflight requests
export function corsMiddleware(_req: Request, res: Response, next: NextFunction) {
  res.header('Access-Control-Allow-Origin', '*');
  res.header('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
  res.header('Access-Control-Allow-Headers', 'Origin, X-Requested-With, Content-Type, Accept, X-API-Key');
  next();
}
EOF
```

## Step 6: Build and Run Application

```bash
# Install dependencies
npm install

# Build the application
npm run build

# Install PM2 globally
npm install -g pm2

# Start the application
pm2 start start.sh --name url-campaign

# Configure PM2 to start on boot
pm2 save
pm2 startup
# Run the command PM2 outputs
```

## Step 7: Configure NGINX

```bash
# Create NGINX configuration
sudo tee /etc/nginx/sites-available/url-campaign << 'EOF'
server {
    listen 80;
    server_name views.yoyoprime.com;

    location / {
        proxy_pass http://127.0.0.1:5000;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection "upgrade";
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
    }
}
EOF

# Enable the site
sudo ln -s /etc/nginx/sites-available/url-campaign /etc/nginx/sites-enabled/
sudo rm -f /etc/nginx/sites-enabled/default

# Test NGINX configuration
sudo nginx -t

# Restart NGINX
sudo systemctl restart nginx
```

## Important Notes

1. **Login Credentials**: 
   - Website login: Use API key 'TraffiCS10928'
   - TrafficStar API: The JWT token is automatically set in the environment variables

2. **Gmail Integration**:
   - The system is configured to automatically process emails with subject "New Order Received"
   - Only accepts emails from "help@donot-reply.in"
   - Automatically deletes processed emails after 2 minutes
   - Default campaign ID for processing emails is 26

3. **Application URLs**:
   - Main URL: http://views.yoyoprime.com or http://[YOUR-SERVER-IP]
   - Login URL: http://views.yoyoprime.com/login or http://[YOUR-SERVER-IP]/login
   - Redirect format: http://views.yoyoprime.com/r/{campaignId}/{urlId}
   - Custom path: http://views.yoyoprime.com/views/{customPath}

4. **Troubleshooting**:
   - View logs: `pm2 logs url-campaign`
   - Restart app: `pm2 restart url-campaign`
   - Check status: `pm2 status`
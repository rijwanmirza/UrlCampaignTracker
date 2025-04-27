#!/bin/bash

# Quick restore script to fix redirect loop
echo "===== Quick Restore ====="

# Restore Nginx to the most basic configuration possible
echo "1. Restoring Nginx to basic configuration..."
cat > /etc/nginx/sites-available/views.yoyoprime.com << 'EOF'
server {
    listen 443 ssl http2;
    listen [::]:443 ssl http2;
    server_name views.yoyoprime.com;

    # SSL Certificate Files
    ssl_certificate /etc/letsencrypt/live/views.yoyoprime.com/fullchain.pem;
    ssl_certificate_key /etc/letsencrypt/live/views.yoyoprime.com/privkey.pem;

    # Simple pass-through to application
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

        # Always add API key to all requests
        proxy_set_header X-API-Key "TraffiCS10928";
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

# Apply the configuration
echo "2. Applying configuration..."
nginx -t && systemctl reload nginx

echo "===== Quick Restore Complete ====="
echo "Your site should now be accessible at: https://views.yoyoprime.com"
echo "The API key is automatically added by Nginx to all requests"
echo "No login is required - the site will work automatically"
echo "==============================="
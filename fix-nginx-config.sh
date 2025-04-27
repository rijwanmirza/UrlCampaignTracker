#!/bin/bash

# Fix Nginx configuration for SSL/HTTP2 by creating a totally clean config
DOMAIN="views.yoyoprime.com"
APP_PORT=5000

echo "===== Fixing Nginx Configuration for $DOMAIN ====="

# First, disable and remove existing configuration
echo "Removing existing configuration..."
rm -f /etc/nginx/sites-enabled/$DOMAIN
systemctl reload nginx

# Create a simple configuration file
echo "Creating clean Nginx configuration..."
cat > /etc/nginx/sites-available/$DOMAIN << EOF
# HTTPS Server with HTTP/2
server {
    listen 443 ssl http2;
    listen [::]:443 ssl http2;
    server_name $DOMAIN;
    
    # SSL Certificate Files
    ssl_certificate /etc/letsencrypt/live/$DOMAIN/fullchain.pem;
    ssl_certificate_key /etc/letsencrypt/live/$DOMAIN/privkey.pem;
    
    # Application proxy settings
    location / {
        proxy_pass http://localhost:$APP_PORT;
        proxy_http_version 1.1;
        proxy_set_header Upgrade \$http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host \$host;
        proxy_set_header X-Real-IP \$remote_addr;
        proxy_set_header X-Forwarded-For \$proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto \$scheme;
        proxy_cache_bypass \$http_upgrade;
    }
}

# HTTP redirect to HTTPS
server {
    listen 80;
    listen [::]:80;
    server_name $DOMAIN;
    
    location / {
        return 301 https://\$host\$request_uri;
    }
}
EOF

# Enable the site
echo "Enabling configuration..."
ln -sf /etc/nginx/sites-available/$DOMAIN /etc/nginx/sites-enabled/

# Test and reload
echo "Testing configuration..."
nginx -t && systemctl reload nginx

# Create simple renewal hook
echo "Creating renewal hook..."
mkdir -p /etc/letsencrypt/renewal-hooks/deploy
cat > /etc/letsencrypt/renewal-hooks/deploy/nginx-reload.sh << EOF
#!/bin/bash
nginx -t && systemctl reload nginx
EOF
chmod +x /etc/letsencrypt/renewal-hooks/deploy/nginx-reload.sh

# Test HTTP/2
echo "Testing HTTP/2 connection..."
curl -I --http2 -k https://$DOMAIN

echo "===== Nginx Configuration Fixed ====="
echo "Your site should now be properly configured with HTTPS and HTTP/2"
echo "Verify by visiting: https://$DOMAIN"
echo "To test HTTP/2: curl -I --http2 https://$DOMAIN"
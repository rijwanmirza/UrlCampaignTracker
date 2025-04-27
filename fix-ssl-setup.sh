#!/bin/bash

# Fixed SSL and HTTP/2 setup script for views.yoyoprime.com
DOMAIN="views.yoyoprime.com"
APP_PORT=5000

echo "===== Setting up SSL with HTTP/2 for $DOMAIN ====="

# Install required packages if not already installed
echo "Installing required packages..."
apt update
apt install -y certbot python3-certbot-nginx

# First, check if there's an existing config and remove it
echo "Cleaning up any existing configurations..."
rm -f /etc/nginx/sites-available/$DOMAIN
rm -f /etc/nginx/sites-enabled/$DOMAIN

# Create initial Nginx config
echo "Creating initial Nginx configuration..."
cat > /etc/nginx/sites-available/$DOMAIN << EOF
server {
    listen 80;
    server_name $DOMAIN;
    
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
EOF

# Enable site
echo "Enabling site..."
ln -sf /etc/nginx/sites-available/$DOMAIN /etc/nginx/sites-enabled/
nginx -t && systemctl reload nginx

# Get SSL certificate
echo "Obtaining SSL certificate with Certbot..."
certbot --nginx -d $DOMAIN --non-interactive --agree-tos --email admin@yoyoprime.com --redirect

# Certbot will modify the config. Let's back it up first
cp /etc/nginx/sites-available/$DOMAIN /etc/nginx/sites-available/${DOMAIN}.certbot.bak

# Now create our custom HTTP/2 config (completely replacing the Certbot one)
echo "Creating HTTP/2 configuration..."
cat > /etc/nginx/sites-available/$DOMAIN << EOF
server {
    listen 443 ssl http2;
    listen [::]:443 ssl http2;
    server_name $DOMAIN;
    
    # SSL certificate settings - these were added by Certbot
    ssl_certificate /etc/letsencrypt/live/$DOMAIN/fullchain.pem;
    ssl_certificate_key /etc/letsencrypt/live/$DOMAIN/privkey.pem;
    
    # Include Certbot's SSL params
    include /etc/letsencrypt/options-ssl-nginx.conf;
    ssl_dhparam /etc/letsencrypt/ssl-dhparams.pem;
    
    # Modern TLS configuration
    ssl_protocols TLSv1.2 TLSv1.3;
    ssl_prefer_server_ciphers off;
    
    # HSTS
    add_header Strict-Transport-Security "max-age=63072000" always;
    
    # OCSP stapling
    ssl_stapling on;
    ssl_stapling_verify on;
    
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

# Redirect HTTP to HTTPS
server {
    listen 80;
    listen [::]:80;
    server_name $DOMAIN;
    return 301 https://\$host\$request_uri;
}
EOF

# Test and reload Nginx
echo "Testing and reloading Nginx configuration..."
nginx -t && systemctl reload nginx

# Setup auto-renewal hook
echo "Setting up automatic renewal hook..."
mkdir -p /etc/letsencrypt/renewal-hooks/post
cat > /etc/letsencrypt/renewal-hooks/post/nginx-reload.sh << EOF
#!/bin/bash
systemctl reload nginx
EOF
chmod +x /etc/letsencrypt/renewal-hooks/post/nginx-reload.sh

# Enable renewal timer
systemctl enable certbot.timer
systemctl status certbot.timer

# Test renewal (without actually renewing)
echo "Testing certificate renewal process..."
certbot renew --dry-run

# Test HTTP/2
echo "Testing HTTP/2 support..."
apt install -y curl
sleep 3  # Give Nginx a moment to fully start
curl -I --http2 https://$DOMAIN

echo "===== SSL with HTTP/2 setup complete ====="
echo "Your site is now available at: https://$DOMAIN"
echo "Certificates will automatically renew when needed"
echo "You can verify HTTP/2 is working by checking the 'HTTP/2' text in the curl output above"
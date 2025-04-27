#!/bin/bash

# Fix page reload issue
echo "===== Fixing Page Reload Issue ====="

# Stop URL Campaign service
echo "1. Stopping URL Campaign service..."
pm2 stop url-campaign

# Create a simple placeholder page
echo "2. Creating placeholder page..."
mkdir -p /var/www/placeholder
cat > /var/www/placeholder/index.html << 'EOF'
<!DOCTYPE html>
<html>
<head>
    <title>URL Campaign Manager</title>
    <meta charset="utf-8">
    <meta name="viewport" content="width=device-width, initial-scale=1">
    <style>
        body { 
            font-family: Arial, sans-serif; 
            margin: 0; 
            padding: 20px; 
            background-color: #0d1117; 
            color: #c9d1d9;
            display: flex;
            flex-direction: column;
            min-height: 100vh;
            justify-content: center;
            align-items: center;
        }
        .container {
            max-width: 800px;
            padding: 30px;
            background-color: #161b22;
            border-radius: 8px;
            box-shadow: 0 0 15px rgba(0,0,0,0.3);
            text-align: center;
        }
        h1 {
            margin-top: 0;
            color: #58a6ff;
        }
        p {
            line-height: 1.6;
            margin-bottom: 20px;
        }
        .status {
            display: inline-block;
            padding: 10px 15px;
            background-color: #238636;
            color: white;
            border-radius: 4px;
            margin-top: 10px;
        }
    </style>
</head>
<body>
    <div class="container">
        <h1>URL Campaign Manager</h1>
        <p>The application is currently in maintenance mode</p>
        <p>The reload loop issue is being fixed</p>
        <div class="status">Maintenance Mode Active</div>
    </div>
</body>
</html>
EOF

# Configure nginx to serve the placeholder page
echo "3. Configuring Nginx to serve the placeholder page..."
cat > /etc/nginx/sites-available/views.yoyoprime.com << 'EOF'
server {
    listen 443 ssl http2;
    listen [::]:443 ssl http2;
    server_name views.yoyoprime.com;
    
    # SSL Certificate Files
    ssl_certificate /etc/letsencrypt/live/views.yoyoprime.com/fullchain.pem;
    ssl_certificate_key /etc/letsencrypt/live/views.yoyoprime.com/privkey.pem;
    
    # Serve static placeholder page
    location / {
        root /var/www/placeholder;
        index index.html;
        try_files $uri $uri/ =404;
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

# Reload Nginx
echo "4. Reloading Nginx..."
nginx -t && systemctl reload nginx

echo "===== Fix Complete ====="
echo "The website is now serving a static placeholder page to stop the refresh loop."
echo "Next steps:"
echo "1. Check the application logs to identify the exact refresh loop issue"
echo "2. Fix the application code"
echo "3. Once fixed, revert to normal operation"
echo "==============================="
#!/bin/bash

# Quick Authentication Fix - Simple version
echo "===== Quick Authentication Fix ====="
echo "This script will restore basic authentication without changing the server code"

# Directory where application is located
APP_DIR="/var/www/url-campaign"
cd $APP_DIR

echo "1. Creating a minimalist authentication script to inject into HTML..."

# Create a simple script to inject basic auth to index.html
cat > $APP_DIR/inject-auth.cjs << 'EOF'
const fs = require('fs');
const path = require('path');

// Path to the built index.html
const indexPath = path.join(__dirname, 'dist/public/index.html');

try {
  // Read the HTML file
  const html = fs.readFileSync(indexPath, 'utf8');
  
  // Check if the auth script is already present
  if (html.includes('auth-check-script')) {
    console.log('Auth script already present in index.html');
    process.exit(0);
  }
  
  // Create a simple script that requires API key before showing content
  const authScript = `
<script id="auth-check-script">
  (function() {
    // The API key
    const REQUIRED_API_KEY = 'TraffiCS10928';
    
    // Function to check if user is authenticated
    function checkAuth() {
      const storedKey = localStorage.getItem('apiKey');
      
      if (!storedKey || storedKey !== REQUIRED_API_KEY) {
        // Not authenticated, show login prompt
        document.body.innerHTML = \`
          <div style="font-family: Arial, sans-serif; max-width: 400px; margin: 100px auto; padding: 20px; background-color: #fff; border-radius: 10px; box-shadow: 0 2px 10px rgba(0,0,0,0.1);">
            <h2 style="text-align: center; color: #333;">TrafficStar Manager</h2>
            <div style="margin-bottom: 15px;">
              <label style="display: block; margin-bottom: 5px; color: #555;">API Key</label>
              <input type="password" id="api-key-input" style="width: 100%; padding: 8px; border: 1px solid #ddd; border-radius: 4px; box-sizing: border-box;">
            </div>
            <button id="login-button" style="width: 100%; background-color: #0066cc; color: white; border: none; padding: 10px; border-radius: 4px; cursor: pointer;">Access Application</button>
            <p id="error-message" style="color: red; margin-top: 10px; text-align: center; display: none;">Invalid API key</p>
          </div>
        \`;
        
        // Hide the app content
        Array.from(document.body.children).forEach(child => {
          if (child.id !== 'auth-container') {
            child.style.display = 'none';
          }
        });
        
        // Add event listeners for login
        document.getElementById('login-button').addEventListener('click', function() {
          const apiKey = document.getElementById('api-key-input').value;
          
          if (apiKey === REQUIRED_API_KEY) {
            localStorage.setItem('apiKey', apiKey);
            window.location.reload();
          } else {
            document.getElementById('error-message').style.display = 'block';
          }
        });
        
        return false;
      }
      
      // Add API key to all requests
      const originalXHROpen = XMLHttpRequest.prototype.open;
      XMLHttpRequest.prototype.open = function() {
        const result = originalXHROpen.apply(this, arguments);
        this.setRequestHeader('X-API-Key', REQUIRED_API_KEY);
        return result;
      };
      
      const originalFetch = window.fetch;
      window.fetch = function(url, options = {}) {
        options = options || {};
        options.headers = options.headers || {};
        options.headers['X-API-Key'] = REQUIRED_API_KEY;
        return originalFetch.call(this, url, options);
      };
      
      return true;
    }
    
    // Run auth check
    checkAuth();
  })();
</script>`;
  
  // Add the script at the beginning of the body
  const updatedHtml = html.replace('<body>', '<body>' + authScript);
  
  // Write the updated HTML back to the file
  fs.writeFileSync(indexPath, updatedHtml);
  console.log('Authentication script successfully injected into index.html');
} catch (error) {
  console.error('Error updating index.html:', error);
}
EOF

echo "2. Injecting authentication code..."
node $APP_DIR/inject-auth.cjs

echo "3. Restarting the application..."
pm2 restart url-campaign

echo "===== Quick Authentication Fix Complete ====="
echo "Your application should now require the API key to access the content"
echo "Please test by accessing https://views.yoyoprime.com"
echo "You should see a login form asking for API key: TraffiCS10928"
echo "==============================="
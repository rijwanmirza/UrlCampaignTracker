#!/bin/bash

# Fix for persistent login across page refreshes
echo "===== Fixing Login Persistence ====="
echo "This script will fix the issue with login prompt appearing on refresh"

# Directory where application is located
APP_DIR="/var/www/url-campaign"
cd $APP_DIR

echo "1. Creating an improved auth-guard.js file..."

# Create an improved version of auth-guard.js
cat > $APP_DIR/dist/public/auth-guard.js << 'EOF'
// Improved Auth Guard - runs immediately
(function() {
  console.log("Auth guard running");
  
  // Check if user is authenticated
  function isAuthenticated() {
    try {
      const apiKey = localStorage.getItem('apiKey');
      return apiKey === 'TraffiCS10928';
    } catch (e) {
      console.error("Error checking authentication:", e);
      return false;
    }
  }
  
  // Redirect to login if not authenticated
  if (!isAuthenticated()) {
    console.log("Not authenticated, redirecting to login");
    window.location.replace('/login');
  } else {
    console.log("User is authenticated");
    
    // Set up request interceptors to add API key
    const apiKey = 'TraffiCS10928';
    
    // Intercept XMLHttpRequest
    const originalXHROpen = XMLHttpRequest.prototype.open;
    XMLHttpRequest.prototype.open = function() {
      const result = originalXHROpen.apply(this, arguments);
      this.setRequestHeader('X-API-Key', apiKey);
      return result;
    };
    
    // Intercept fetch
    const originalFetch = window.fetch;
    window.fetch = function(url, options = {}) {
      options = options || {};
      options.headers = options.headers || {};
      options.headers['X-API-Key'] = apiKey;
      return originalFetch.call(this, url, options);
    };
  }
})();
EOF

echo "2. Improving the login page to ensure persistent login..."

# Update the login page with better localStorage handling
cat > $APP_DIR/dist/public/login/index.html << 'EOF'
<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>TrafficStar Manager Login</title>
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
        .logo {
            text-align: center;
            margin-bottom: 20px;
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
    <script>
        // Check if user is already authenticated (run immediately)
        (function checkAuth() {
            try {
                const storedKey = localStorage.getItem('apiKey');
                if (storedKey === 'TraffiCS10928') {
                    console.log("Already authenticated, redirecting to app");
                    window.location.replace('/');
                }
            } catch (e) {
                console.error("Error checking localStorage:", e);
            }
        })();
    </script>
</head>
<body>
    <div class="login-container">
        <div class="logo">
            <h1>TrafficStar Manager</h1>
        </div>
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
        document.getElementById('login-form').addEventListener('submit', function(e) {
            e.preventDefault();
            
            const apiKey = document.getElementById('api-key').value;
            const errorElement = document.getElementById('error-message');
            
            if (apiKey === 'TraffiCS10928') {
                try {
                    // Store API key in localStorage
                    localStorage.setItem('apiKey', apiKey);
                    console.log("API key stored successfully");
                    
                    // Set a cookie as backup
                    document.cookie = "apiKey=" + apiKey + "; path=/; max-age=31536000";
                    
                    // Redirect to home page
                    window.location.replace('/');
                } catch (e) {
                    console.error("Error saving to localStorage:", e);
                    errorElement.innerText = "Error saving login. Please enable cookies.";
                    errorElement.style.display = 'block';
                }
            } else {
                // Show error message
                errorElement.style.display = 'block';
            }
        });
    </script>
</body>
</html>
EOF

echo "3. Updating main application to ensure it doesn't lose authentication..."

# Create a script to inject the auth check into the main index.html
cat > $APP_DIR/fix-main-app.cjs << 'EOF'
const fs = require('fs');
const path = require('path');

try {
  const indexPath = path.join(__dirname, 'dist/public/index.html');
  if (fs.existsSync(indexPath)) {
    let html = fs.readFileSync(indexPath, 'utf8');
    
    // Remove any existing script tags for auth-guard to avoid duplicates
    html = html.replace(/<script src="\/auth-guard.js"><\/script>/g, '');
    
    // Add auth-guard script at the top of head for early execution
    html = html.replace('<head>', '<head>\n<script src="/auth-guard.js"></script>');
    
    fs.writeFileSync(indexPath, html);
    console.log('Updated index.html to include auth-guard at the top');
  } else {
    console.log('index.html not found at expected path');
  }
} catch (error) {
  console.error('Error updating index.html:', error);
}
EOF

echo "4. Applying the fixes..."
node $APP_DIR/fix-main-app.cjs

echo "5. Testing local storage access..."
# Create a simple script to test localStorage functionality
cat > $APP_DIR/dist/public/test-storage.html << 'EOF'
<!DOCTYPE html>
<html>
<head>
  <title>LocalStorage Test</title>
</head>
<body>
  <h1>LocalStorage Test</h1>
  <div id="result"></div>
  
  <script>
    try {
      // Test writing to localStorage
      localStorage.setItem('test', 'working');
      
      // Read it back
      const value = localStorage.getItem('test');
      
      document.getElementById('result').innerHTML = 
        `<p>LocalStorage Test: ${value === 'working' ? 'PASSED' : 'FAILED'}</p>
         <p>Value read: ${value}</p>
         <p>API Key value: ${localStorage.getItem('apiKey') || 'not set'}</p>`;
    } catch (e) {
      document.getElementById('result').innerHTML = 
        `<p>LocalStorage Error: ${e.message}</p>`;
    }
  </script>
</body>
</html>
EOF

echo "===== Login Persistence Fix Complete ====="
echo "Your application should now maintain login state across page refreshes."
echo "To test:"
echo "1. Visit https://views.yoyoprime.com"
echo "2. Log in with API key: TraffiCS10928"
echo "3. Refresh the page - you should stay logged in"
echo ""
echo "If you still have issues, you can test localStorage functionality at:"
echo "https://views.yoyoprime.com/test-storage.html"
echo "==============================="
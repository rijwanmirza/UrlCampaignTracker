import { Request, Response, NextFunction } from 'express';
import { log } from './vite';
import { validateApiKey } from './auth/middleware';

// Export helper functions for use in other modules
export { isSessionValid, isValidTemporaryLoginPath };

// Store sessions for access tokens
const activeSessions = new Map<string, { timestamp: number, apiKey?: string }>();
const SESSION_EXPIRY = 24 * 60 * 60 * 1000; // 24 hours in milliseconds

// Store temporary login paths
const temporaryLoginPaths = new Map<string, { timestamp: number, sessionId: string }>();
const TEMP_LOGIN_EXPIRY = 5 * 60 * 1000; // 5 minutes in milliseconds
const TEMP_LOGIN_PREFIX = 'login_'; // Prefix for temporary login paths

// Access configuration
let SECRET_ACCESS_CODE = 'ABCD123'; // Default code, will be overridden by system settings if available
// Set to true to log more detailed debugging information
const DEBUG_MODE = true;

// Function to update the access code from system settings
export function updateAccessCode(newCode: string): void {
  if (newCode && newCode.trim() !== '') {
    SECRET_ACCESS_CODE = newCode.trim();
    log(`Access code updated to: ${SECRET_ACCESS_CODE}`, 'access');
  }
}

// Function to get the current access code
export function getAccessCode(): string {
  return SECRET_ACCESS_CODE;
}

/**
 * Check if a session is valid and not expired
 */
function isSessionValid(sessionId: string): boolean {
  const session = activeSessions.get(sessionId);
  if (!session) return false;
  
  const now = Date.now();
  if (now - session.timestamp > SESSION_EXPIRY) {
    // Session expired, clean up
    activeSessions.delete(sessionId);
    return false;
  }
  
  return true;
}

/**
 * Generate a temporary login path
 */
function generateTemporaryLoginPath(sessionId: string): string {
  // Clean up expired temporary login paths first
  cleanupExpiredTemporaryPaths();
  
  // Generate a random temporary login path
  const tempPath = `${TEMP_LOGIN_PREFIX}${Math.random().toString(36).substring(2, 15)}`;
  
  // Store this path with the associated session ID
  temporaryLoginPaths.set(tempPath, {
    timestamp: Date.now(),
    sessionId
  });
  
  log(`Generated temporary login path: /${tempPath} for session: ${sessionId}`, 'access');
  
  return tempPath;
}

/**
 * Clean up expired temporary login paths
 */
function cleanupExpiredTemporaryPaths(): void {
  const now = Date.now();
  let expiredCount = 0;
  
  // Remove expired temporary login paths using Array.from to avoid iterator issues
  Array.from(temporaryLoginPaths.keys()).forEach(path => {
    const data = temporaryLoginPaths.get(path);
    if (data && now - data.timestamp > TEMP_LOGIN_EXPIRY) {
      temporaryLoginPaths.delete(path);
      expiredCount++;
    }
  });
  
  if (expiredCount > 0 && DEBUG_MODE) {
    log(`Cleaned up ${expiredCount} expired temporary login paths`, 'access');
  }
}

// Set up a timer to periodically clean up expired temporary login paths
// This ensures we don't accumulate too many unused paths
function setupCleanupTimer(): void {
  // Clean up every minute
  setInterval(() => {
    cleanupExpiredTemporaryPaths();
  }, 60000); // 60 seconds
}

// Start the cleanup timer immediately
setupCleanupTimer();

/**
 * Check if a path is a valid temporary login path
 */
function isValidTemporaryLoginPath(path: string): boolean {
  // Remove leading slash if present
  const cleanPath = path.startsWith('/') ? path.substring(1) : path;
  
  // Check if path matches the login pattern, regardless of the random string
  if (cleanPath.startsWith(TEMP_LOGIN_PREFIX)) {
    // For extra security, also check if this exact path exists in our temporary login paths
    if (temporaryLoginPaths.has(cleanPath)) {
      return true;
    }
    
    // For debugging in case the exact match failed
    if (DEBUG_MODE) {
      log(`Path ${cleanPath} matches prefix but not found in temporary paths map. Keys: ${Array.from(temporaryLoginPaths.keys()).join(', ')}`, 'access');
    }
  }
  
  return false;
}

/**
 * Get session ID for a temporary login path
 */
function getSessionIdForTemporaryLoginPath(path: string): string | null {
  // Remove leading slash if present
  const cleanPath = path.startsWith('/') ? path.substring(1) : path;
  
  // Get the data for this temporary login path
  const data = temporaryLoginPaths.get(cleanPath);
  if (!data) return null;
  
  return data.sessionId;
}

/**
 * Middleware to handle special access routes
 */
export function handleAccessRoutes(req: Request, res: Response, next: NextFunction) {
  // Log the request path for debugging
  log(`Access check for path: ${req.path}`, 'access');
  
  const path = req.path;
  
  // Always allow API routes for proper functioning
  if (path.startsWith('/api/')) {
    return next();
  }
  
  // Always allow asset files and static resources
  if (path.startsWith('/assets/') || 
      path.includes('.js') || 
      path.includes('.css') || 
      path.includes('.ico') || 
      path.includes('.png') || 
      path.includes('.jpg') || 
      path.includes('.svg') ||
      path === '/favicon.ico' ||
      path.startsWith('/@') || // All Vite and React dev resources
      path.startsWith('/node_modules/') ||
      path.startsWith('/@fs/')) {
    return next();
  }
  
  // Always allow redirect URLs for the application's core function
  if (path.startsWith('/c/') || path.startsWith('/r/') || path.startsWith('/views/')) {
    return next();
  }
  
  // Handle the special access URL with the keyword
  if (path.startsWith('/access/')) {
    const parts = path.split('/access/');
    if (parts.length < 2) {
      return res.status(404).send('Page not found');
    }
    
    const code = parts[1];
    
    // Special access code match
    if (code === SECRET_ACCESS_CODE) {
      // Create a session and redirect to a temporary login path
      const sessionId = Math.random().toString(36).substring(2, 15);
      activeSessions.set(sessionId, { timestamp: Date.now() });
      
      // Generate a temporary login path for this session
      const tempLoginPath = generateTemporaryLoginPath(sessionId);
      
      // Set session cookie
      res.cookie('session_id', sessionId, {
        httpOnly: true,
        secure: process.env.NODE_ENV === 'production',
        maxAge: SESSION_EXPIRY,
        sameSite: 'lax'
      });
      
      log(`Access granted with secret code, redirecting to temporary login path: ${tempLoginPath} with session: ${sessionId}`, 'access');
      
      // Instead of redirecting to /login, redirect to the temporary login path
      return res.send(`
        <!DOCTYPE html>
        <html>
        <head>
          <title>Redirecting...</title>
          <meta http-equiv="refresh" content="0;url=/${tempLoginPath}">
          <script>
            // Extra safety - redirect after a brief pause
            setTimeout(function() {
              window.location.href = '/${tempLoginPath}';
            }, 100);
          </script>
          <style>
            body {
              font-family: system-ui, -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif;
              background-color: #f1f5f9;
              margin: 0;
              padding: 0;
              display: flex;
              align-items: center;
              justify-content: center;
              min-height: 100vh;
              text-align: center;
            }
            .redirect-container {
              background: white;
              border-radius: 8px;
              box-shadow: 0 4px 6px rgba(0, 0, 0, 0.1);
              padding: 2rem;
              max-width: 400px;
            }
            .spinner {
              border: 4px solid rgba(0, 0, 0, 0.1);
              border-radius: 50%;
              border-top: 4px solid #2563eb;
              width: 24px;
              height: 24px;
              margin: 10px auto;
              animation: spin 1s linear infinite;
            }
            @keyframes spin {
              0% { transform: rotate(0deg); }
              100% { transform: rotate(360deg); }
            }
          </style>
        </head>
        <body>
          <div class="redirect-container">
            <h2>Access Confirmed</h2>
            <p>Redirecting to secure login page...</p>
            <div class="spinner"></div>
          </div>
        </body>
        </html>
      `);
    }
    
    // Any other access URL that doesn't match the secret code
    log(`Invalid access code provided: ${code}`, 'access');
    return res.status(404).send('Page not found');
  }
  
  // Handle temporary login paths
  if (isValidTemporaryLoginPath(path)) {
    log(`Temporary login path accessed: ${path}`, 'access');
    
    // Get the session ID for this temporary login path
    const sessionId = getSessionIdForTemporaryLoginPath(path);
    if (!sessionId) {
      log(`No session ID found for temporary login path: ${path}`, 'access');
      return res.status(404).send('Page not found');
    }
    
    // Make sure the session exists and is valid
    if (!isSessionValid(sessionId)) {
      log(`Invalid session for temporary login path: ${path}`, 'access');
      return res.status(404).send('Page not found');
    }
    
    // Set or refresh the session cookie to ensure login works
    res.cookie('session_id', sessionId, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      maxAge: SESSION_EXPIRY,
      sameSite: 'lax'
    });
    
    // Serve the login form directly for this temporary path
    log(`Serving login form for temporary path: ${path} with session: ${sessionId}`, 'access');
    
    // Return an HTML page with the login form directly
    // This avoids client-side routing issues
    return res.send(`
      <!DOCTYPE html>
      <html lang="en">
      <head>
        <meta charset="UTF-8">
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
        <title>URL Campaign Manager - Login</title>
        <style>
          body {
            font-family: system-ui, -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif;
            background-color: #f1f5f9;
            margin: 0;
            padding: 0;
            display: flex;
            align-items: center;
            justify-content: center;
            min-height: 100vh;
            background-image: linear-gradient(135deg, #e0f2fe 0%, #f1f5f9 100%);
          }
          .card {
            background: white;
            border-radius: 8px;
            box-shadow: 0 10px 25px rgba(0, 0, 0, 0.1);
            width: 100%;
            max-width: 400px;
            padding: 2rem;
            border: 1px solid rgba(0, 0, 0, 0.05);
          }
          .header {
            text-align: center;
            margin-bottom: 1.5rem;
          }
          .title {
            font-size: 1.5rem;
            font-weight: 700;
            color: #111827;
            margin-bottom: 0.5rem;
          }
          .subtitle {
            color: #6b7280;
            font-size: 0.875rem;
          }
          .form-group {
            margin-bottom: 1rem;
          }
          .input {
            width: 100%;
            padding: 0.75rem 1rem;
            border: 1px solid #d1d5db;
            border-radius: 0.375rem;
            font-size: 1rem;
            margin-top: 0.5rem;
            box-sizing: border-box;
            transition: border-color 0.15s, box-shadow 0.15s;
          }
          .input:focus {
            outline: none;
            border-color: #2563eb;
            box-shadow: 0 0 0 3px rgba(37, 99, 235, 0.1);
          }
          .button {
            background-color: #2563eb;
            color: white;
            font-weight: 500;
            padding: 0.5rem 1rem;
            border-radius: 0.375rem;
            border: none;
            width: 100%;
            font-size: 1rem;
            cursor: pointer;
            transition: background-color 0.15s;
          }
          .button:hover {
            background-color: #1d4ed8;
          }
          .button:disabled {
            opacity: 0.7;
            cursor: not-allowed;
          }
          .error {
            background-color: #fee2e2;
            border-left: 4px solid #ef4444;
            color: #b91c1c;
            padding: 0.75rem;
            border-radius: 0.375rem;
            margin-bottom: 1rem;
            display: none;
          }
        </style>
      </head>
      <body>
        <div class="card">
          <div class="header">
            <h1 class="title">URL Campaign Manager</h1>
            <p class="subtitle">Enter your secret API key to continue</p>
          </div>
          
          <div id="error-message" class="error"></div>
          
          <form id="login-form">
            <div class="form-group">
              <input 
                type="password" 
                id="apiKey" 
                class="input" 
                placeholder="Enter API key" 
                required 
                autocomplete="off"
              >
            </div>
            
            <button 
              type="submit" 
              id="submit-button" 
              class="button"
            >
              Login
            </button>
          </form>
        </div>
        
        <script>
          // Simple login script
          document.getElementById('login-form').addEventListener('submit', async function(e) {
            e.preventDefault();
            const errorEl = document.getElementById('error-message');
            const buttonEl = document.getElementById('submit-button');
            const apiKey = document.getElementById('apiKey').value;
            
            errorEl.style.display = 'none';
            buttonEl.disabled = true;
            buttonEl.textContent = 'Verifying...';
            
            try {
              const response = await fetch('/api/auth/verify-key', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ apiKey }),
              });
              
              const data = await response.json();
              
              if (data.authenticated) {
                window.location.href = '/campaigns';
              } else {
                errorEl.textContent = 'Invalid API key. Please try again.';
                errorEl.style.display = 'block';
                buttonEl.disabled = false;
                buttonEl.textContent = 'Login';
              }
            } catch (error) {
              errorEl.textContent = 'An error occurred. Please try again.';
              errorEl.style.display = 'block';
              buttonEl.disabled = false;
              buttonEl.textContent = 'Login';
            }
          });
        </script>
      </body>
      </html>
    `);
  }
  
  // Special case for login page with direct access
  if (path === '/login') {
    // If we're already on the login page, check if we were redirected there by the access URL
    const sessionId = req.cookies.session_id;
    
    if (sessionId) {
      log(`Login page accessed with session ID: ${sessionId}`, 'access');
      
      // Add this session ID to our valid sessions if it doesn't exist yet
      if (!activeSessions.has(sessionId)) {
        log(`Creating new session for ID: ${sessionId}`, 'access');
        activeSessions.set(sessionId, { timestamp: Date.now() });
      }
      
      return next();
    }
    
    // Check referrer for redirects from the access URL
    const referer = req.headers.referer || '';
    if (referer.includes('/access/')) {
      log(`Login request coming from access page via referrer, allowing`, 'access');
      
      // Create a new session for this request
      const newSessionId = Math.random().toString(36).substring(2, 15);
      activeSessions.set(newSessionId, { timestamp: Date.now() });
      
      // Set session cookie
      res.cookie('session_id', newSessionId, {
        httpOnly: true,
        secure: process.env.NODE_ENV === 'production',
        maxAge: SESSION_EXPIRY,
        sameSite: 'lax'
      });
      
      return next();
    }
    
    // No valid session, return not found
    log(`No valid session for login page`, 'access');
    return res.status(404).send('Page not found');
  }
  
  // For all other routes, check if they're authenticated with API key
  const sessionId = req.cookies.session_id;
  const apiKey = req.cookies.apiKey;
  
  // Verify both session and api key
  if (sessionId && apiKey && isSessionValid(sessionId)) {
    // Check if API key is valid
    validateApiKey(apiKey).then(isValid => {
      if (isValid) {
        log(`Access granted for path: ${path} with valid API key`, 'access');
        return next();
      } else {
        // If API key is not valid, return blank page with 404
        log(`Invalid API key for path: ${path}`, 'access');
        return res.status(404).send('Page not found');
      }
    }).catch(() => {
      // On error, return blank page with 404
      log(`API key validation error for path: ${path}`, 'access');
      return res.status(404).send('Page not found');
    });
    return;
  }
  
  // Otherwise, display blank page with 404
  log(`Access denied for path: ${path} - no valid session or API key`, 'access');
  return res.status(404).send('Page not found');
}

/**
 * Store API key in session after successful authentication
 */
export function storeApiKeyInSession(sessionId: string, apiKey: string): void {
  if (DEBUG_MODE) {
    log(`Attempting to store API key for session ID: ${sessionId}`, 'access');
  }
  
  // Create the session if it doesn't exist
  if (!activeSessions.has(sessionId)) {
    if (DEBUG_MODE) {
      log(`Creating new session for ID: ${sessionId}`, 'access');
    }
    activeSessions.set(sessionId, { timestamp: Date.now() });
  }
  
  // Update the session with the API key
  const session = activeSessions.get(sessionId);
  if (session) {
    session.apiKey = apiKey;
    activeSessions.set(sessionId, session);
    log(`API key successfully stored in session: ${sessionId}`, 'access');
  } else {
    log(`Failed to store API key in session: ${sessionId}`, 'access');
  }
}
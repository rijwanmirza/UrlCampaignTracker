import { Request, Response, NextFunction } from 'express';
import { log } from './vite';
import { validateApiKey } from './auth/middleware';

// Store sessions for access tokens
const activeSessions = new Map<string, { timestamp: number, apiKey?: string }>();
const SESSION_EXPIRY = 24 * 60 * 60 * 1000; // 24 hours in milliseconds

// Store temporary login paths
const temporaryLoginPaths = new Map<string, { timestamp: number, sessionId: string }>();
const TEMP_LOGIN_EXPIRY = 2 * 60 * 1000; // 2 minutes in milliseconds

// Access configuration
const SECRET_ACCESS_CODE = 'ABCD123'; // You can change this to your preferred access code
// Set to true to log more detailed debugging information
const DEBUG_MODE = true;

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
  const tempPath = `login_${Math.random().toString(36).substring(2, 15)}`;
  
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
  
  // Check if this path exists in our temporary login paths
  return temporaryLoginPaths.has(cleanPath);
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
        </head>
        <body>
          <p>Redirecting to secure login page...</p>
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
    
    // Serve the login page for this temporary path
    // In reality, this is the same content as our /login page
    log(`Serving login page for temporary path: ${path} with session: ${sessionId}`, 'access');
    
    // Forward this request to the normal login page processing
    req.url = '/login';
    return next();
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
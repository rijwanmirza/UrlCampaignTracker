import { Request, Response, NextFunction } from 'express';
import crypto from 'crypto';

// Admin credentials - will be stored securely
const ADMIN_USERNAME = 'admin';
const ADMIN_PASSWORD_HASH = crypto.createHash('sha256').update('TrafficStarAdmin123!').digest('hex');

// Active auth tokens
const API_TOKENS: Map<string, { username: string, expires: Date }> = new Map();

// Token expiration in hours
const TOKEN_EXPIRATION_HOURS = 24;

/**
 * Generate a new API token for a user
 */
export function generateApiToken(username: string): string {
  // Create a random token
  const token = crypto.randomBytes(32).toString('hex');
  
  // Set expiration date
  const expires = new Date();
  expires.setHours(expires.getHours() + TOKEN_EXPIRATION_HOURS);
  
  // Store token with expiration
  API_TOKENS.set(token, { username, expires });
  
  return token;
}

/**
 * Verify user credentials
 */
export function verifyCredentials(username: string, password: string): boolean {
  if (username !== ADMIN_USERNAME) {
    return false;
  }
  
  const passwordHash = crypto.createHash('sha256').update(password).digest('hex');
  return passwordHash === ADMIN_PASSWORD_HASH;
}

/**
 * Middleware to protect API routes
 */
export function requireAuth(req: Request, res: Response, next: NextFunction) {
  // Skip auth for login route and static assets
  if (req.path === '/api/auth/login' || 
      req.path === '/api/auth/verify' || 
      req.path === '/api/auth/status') {
    return next();
  }
  
  // Skip auth for public redirect routes
  if (req.path.startsWith('/r/') || 
      req.path.startsWith('/c/') || 
      req.path.startsWith('/views/')) {
    return next();
  }
  
  // Check for token in cookie
  const token = req.cookies?.auth_token;
  
  if (!token) {
    // For API routes, return 401
    if (req.path.startsWith('/api/')) {
      return res.status(401).json({ message: 'Authentication required', loginRequired: true });
    }
    
    // For other routes, redirect to login page
    return res.redirect('/login');
  }
  
  // Verify token
  const tokenData = API_TOKENS.get(token);
  if (!tokenData) {
    // Clear invalid cookie
    res.clearCookie('auth_token');
    
    // For API routes, return 401
    if (req.path.startsWith('/api/')) {
      return res.status(401).json({ message: 'Invalid token', loginRequired: true });
    }
    
    // For other routes, redirect to login page
    return res.redirect('/login');
  }
  
  // Check if token is expired
  if (new Date() > tokenData.expires) {
    // Clear expired cookie
    res.clearCookie('auth_token');
    API_TOKENS.delete(token);
    
    // For API routes, return 401
    if (req.path.startsWith('/api/')) {
      return res.status(401).json({ message: 'Token expired', loginRequired: true });
    }
    
    // For other routes, redirect to login page
    return res.redirect('/login');
  }
  
  // Token is valid - set user data on request and continue
  (req as any).user = { username: tokenData.username };
  next();
}

/**
 * Logout function - invalidate a token
 */
export function logout(token: string): boolean {
  if (API_TOKENS.has(token)) {
    API_TOKENS.delete(token);
    return true;
  }
  return false;
}
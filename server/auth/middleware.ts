import { Request, Response, NextFunction } from 'express';
import { log } from '../vite';

// Simple API key authentication
// In production, store this in an environment variable
// We use a function to get the current key value to make sure we always have the latest value
const getApiSecretKey = () => process.env.API_SECRET_KEY || 'TraffiCS10928';

// Check if we're in development mode
const isDevMode = process.env.NODE_ENV === 'development';

// Middleware to require authentication
export function requireAuth(req: Request, res: Response, next: NextFunction) {
  try {
    // Do not bypass authentication in any mode now
    // if (isDevMode) {
    //   console.log('🔓 DEVELOPMENT MODE: Authentication bypassed');
    //   return next();
    // }
    
    // Get API key from cookie, header, or query param
    const apiKey = req.cookies?.apiKey || 
                  req.headers['x-api-key'] || 
                  req.query.apiKey;
    
    if (!apiKey) {
      return res.status(401).json({ message: 'API key required' });
    }
    
    // Simple check - just compare the API key with our secret
    if (apiKey !== getApiSecretKey()) {
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
  // Always validate against the real API key
  return apiKey === getApiSecretKey();
}

// Middleware for CORS and preflight requests
export function corsMiddleware(_req: Request, res: Response, next: NextFunction) {
  res.header('Access-Control-Allow-Origin', '*');
  res.header('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
  res.header('Access-Control-Allow-Headers', 'Origin, X-Requested-With, Content-Type, Accept, X-API-Key');
  next();
}
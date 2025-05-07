import { Request, Response, NextFunction } from 'express';
import { log } from '../vite';
import { getApiSecretKey } from './key-manager';

// Check if we're in development mode
const isDevMode = process.env.NODE_ENV === 'development';

// Cache the API key to avoid frequent database lookups
let cachedApiKey: string | null = null;
let lastCacheTime = 0;
const CACHE_TTL = 300000; // 5 minutes

// Helper function to get the current API key with caching
async function getCurrentApiKey(): Promise<string> {
  const now = Date.now();
  
  // Refresh cache if needed
  if (!cachedApiKey || (now - lastCacheTime) > CACHE_TTL) {
    cachedApiKey = await getApiSecretKey();
    lastCacheTime = now;
  }
  
  return cachedApiKey;
}

// Middleware to require authentication
export async function requireAuth(req: Request, res: Response, next: NextFunction) {
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
    
    // Get the current API key from database or environment
    const currentKey = await getCurrentApiKey();
    
    // Simple check - just compare the API key with our secret
    if (apiKey !== currentKey) {
      log(`Authentication failed - invalid API key provided`, 'auth');
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
export async function validateApiKey(apiKey: string): Promise<boolean> {
  try {
    // Get the current API key from database or environment
    const currentKey = await getCurrentApiKey();
    
    // Always validate against the real API key
    return apiKey === currentKey;
  } catch (error) {
    console.error('Error validating API key:', error);
    // Fallback to environment variable or default
    return apiKey === (process.env.API_SECRET_KEY || 'TraffiCS10928');
  }
}

// Middleware for CORS and preflight requests
export function corsMiddleware(_req: Request, res: Response, next: NextFunction) {
  res.header('Access-Control-Allow-Origin', '*');
  res.header('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
  res.header('Access-Control-Allow-Headers', 'Origin, X-Requested-With, Content-Type, Accept, X-API-Key');
  next();
}
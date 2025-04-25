import { Request, Response, NextFunction } from 'express';

declare module 'express-session' {
  interface SessionData {
    user: {
      id: number;
      username: string;
      role: string;
    };
  }
}

/**
 * API-key based authentication check middleware
 * Verifies the user either has:
 * 1. A valid session (set by the main security middleware)
 * 2. A valid API key in the request
 */
export const isAuthenticated = (req: Request, res: Response, next: NextFunction) => {
  // First check if we already have a valid user session
  if (req.session.user) {
    return next();
  }
  
  // Then check if they have a valid API key
  const apiKey = req.headers['x-api-key'] || req.query.apiKey || req.cookies?.apiKey;
  const validApiKey = 'rijwa487mirza';
  
  if (apiKey === validApiKey) {
    // Set session user for future checks in this request
    req.session.user = {
      id: 2,
      username: 'rijwamirza',
      role: 'admin'
    };
    return next();
  }
  
  // If they reach here, they need to authenticate
  return res.status(401).json({ message: "Unauthorized - authentication required" });
};

/**
 * API-key based admin check middleware
 * Same as isAuthenticated but also verifies the user has admin role 
 */
export const isAdmin = (req: Request, res: Response, next: NextFunction) => {
  // First check if we already have a valid admin user session
  if (req.session.user && req.session.user.role === 'admin') {
    return next();
  }
  
  // Then check if they have a valid API key (our single API key is always admin)
  const apiKey = req.headers['x-api-key'] || req.query.apiKey || req.cookies?.apiKey;
  const validApiKey = 'rijwa487mirza';
  
  if (apiKey === validApiKey) {
    // Set session user for future checks in this request
    req.session.user = {
      id: 2,
      username: 'rijwamirza',
      role: 'admin'
    };
    return next();
  }
  
  // If they reach here, they need admin privileges
  return res.status(403).json({ message: "Forbidden - admin access required" });
};
import { Request, Response, NextFunction } from 'express';
import jwt from 'jsonwebtoken';

const JWT_SECRET = process.env.JWT_SECRET || 'trafficstar-api-secret-key'; // Default for development

// Define the structure of our JWT payload
interface AuthTokenPayload {
  username: string;
  exp: number;
  iat: number;
}

// Middleware to require authentication
export function requireAuth(req: Request, res: Response, next: NextFunction) {
  try {
    // Get token from cookie or Authorization header
    const token = req.cookies?.authToken || 
                 (req.headers.authorization?.startsWith('Bearer ') ? 
                  req.headers.authorization.substring(7) : null);
    
    if (!token) {
      return res.status(401).json({ message: 'Authentication required' });
    }
    
    // Verify token
    const decoded = jwt.verify(token, JWT_SECRET) as AuthTokenPayload;
    
    // Add user info to request object for use in route handlers
    (req as any).user = {
      username: decoded.username
    };
    
    next();
  } catch (error) {
    console.error('Authentication error:', error);
    res.status(401).json({ message: 'Invalid or expired authentication token' });
  }
}

// Generate a JWT token for a user
export function generateToken(username: string): string {
  return jwt.sign(
    { username },
    JWT_SECRET,
    { expiresIn: '24h' } // Token expires in 24 hours
  );
}

// Middleware for CORS and preflight requests
export function corsMiddleware(_req: Request, res: Response, next: NextFunction) {
  res.header('Access-Control-Allow-Origin', '*');
  res.header('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
  res.header('Access-Control-Allow-Headers', 'Origin, X-Requested-With, Content-Type, Accept, Authorization');
  next();
}
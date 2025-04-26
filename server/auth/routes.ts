import { Express, Request, Response } from 'express';
import { generateToken, requireAuth } from './middleware';
import bcrypt from 'bcryptjs';
import { log } from '../vite';

// Hard-coded admin credentials for demo purposes
// In a production app, these would be stored in a database with hashed passwords
const ADMIN_USERNAME = 'admin';
const ADMIN_PASSWORD_HASH = '$2a$10$nOwsYRKuAjLNcXpDzX3SyuX8P/aKn0bhkL.r1PQUwh5k7aZ0fk9im'; // Hash for 'TrafficStarAdmin123!'

// Register authentication routes
export function registerAuthRoutes(app: Express) {
  // Login route - generates JWT token
  app.post('/api/auth/login', async (req: Request, res: Response) => {
    const { username, password } = req.body;
    
    try {
      // Simple validation
      if (!username || !password) {
        return res.status(400).json({ message: 'Username and password are required' });
      }
      
      // Check username
      if (username !== ADMIN_USERNAME) {
        return res.status(401).json({ message: 'Invalid credentials' });
      }
      
      // Check password using bcrypt
      const passwordMatch = await bcrypt.compare(password, ADMIN_PASSWORD_HASH);
      if (!passwordMatch) {
        log(`Login attempt failed for user ${username} - password mismatch`, 'auth');
        return res.status(401).json({ message: 'Invalid credentials' });
      }
      
      // Generate JWT token
      const token = generateToken(username);
      
      // Set token in HttpOnly cookie
      res.cookie('authToken', token, {
        httpOnly: true,
        secure: process.env.NODE_ENV === 'production',
        maxAge: 24 * 60 * 60 * 1000, // 24 hours
        sameSite: 'strict'
      });
      
      log(`User ${username} authenticated successfully`, 'auth');
      
      // Send response without exposing token in body
      res.json({ 
        message: 'Authentication successful',
        user: { username }
      });
    } catch (error) {
      console.error('Login error:', error);
      res.status(500).json({ message: 'An error occurred during login' });
    }
  });
  
  // Verify authentication status
  app.get('/api/auth/status', (req: Request, res: Response) => {
    try {
      // Get token from cookie or authorization header
      const token = req.cookies?.authToken || 
                   (req.headers.authorization?.startsWith('Bearer ') ? 
                    req.headers.authorization.substring(7) : null);
      
      if (!token) {
        return res.json({ authenticated: false });
      }
      
      // Don't verify token here - just check if it exists
      // This is a lightweight check for the front-end
      // The requireAuth middleware will do the full verification for protected routes
      res.json({ authenticated: true });
    } catch (error) {
      console.error('Auth status error:', error);
      res.json({ authenticated: false });
    }
  });
  
  // Logout route - clears the auth cookie
  app.post('/api/auth/logout', (req: Request, res: Response) => {
    res.clearCookie('authToken');
    res.json({ message: 'Logout successful' });
  });
  
  // Protected route example to verify auth is working
  app.get('/api/auth/verify', requireAuth, (req: Request, res: Response) => {
    res.json({ 
      message: 'Authentication verified',
      user: (req as any).user
    });
  });
}
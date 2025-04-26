import { Express, Request, Response } from 'express';
import { verifyCredentials, generateApiToken, logout } from './middleware';

export function registerAuthRoutes(app: Express) {
  // Login endpoint
  app.post('/api/auth/login', (req: Request, res: Response) => {
    const { username, password } = req.body;
    
    if (!username || !password) {
      return res.status(400).json({ message: 'Username and password are required' });
    }
    
    // Verify credentials
    if (!verifyCredentials(username, password)) {
      return res.status(401).json({ message: 'Invalid credentials' });
    }
    
    // Generate token
    const token = generateApiToken(username);
    
    // Set token in a secure HTTP-only cookie
    res.cookie('auth_token', token, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'strict',
      maxAge: 24 * 60 * 60 * 1000 // 24 hours
    });
    
    return res.json({
      message: 'Authentication successful',
      user: { username }
    });
  });
  
  // Logout endpoint
  app.post('/api/auth/logout', (req: Request, res: Response) => {
    const token = req.cookies?.auth_token;
    
    if (token) {
      logout(token);
      res.clearCookie('auth_token');
    }
    
    return res.json({ message: 'Logged out successfully' });
  });
  
  // Auth status endpoint
  app.get('/api/auth/status', (req: Request, res: Response) => {
    const token = req.cookies?.auth_token;
    
    if (!token) {
      return res.json({ authenticated: false });
    }
    
    // User info is attached by auth middleware if token is valid
    const user = (req as any).user;
    
    return res.json({
      authenticated: !!user,
      user: user ? { username: user.username } : null
    });
  });
}
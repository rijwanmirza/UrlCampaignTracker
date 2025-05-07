import { Express, Request, Response } from 'express';
import { validateApiKey, requireAuth } from './middleware';
import { log } from '../vite';

// Register authentication routes
export function registerAuthRoutes(app: Express) {
  // API key verification route
  app.post('/api/auth/verify-key', (req: Request, res: Response) => {
    const { apiKey } = req.body;
    
    try {
      // Simple validation
      if (!apiKey) {
        return res.status(400).json({ message: 'API key is required' });
      }
      
      // Validate the API key
      const isValid = validateApiKey(apiKey);
      
      if (!isValid) {
        log(`API key verification failed - invalid key provided`, 'auth');
        return res.status(401).json({ 
          message: 'Invalid API key', 
          authenticated: false 
        });
      }
      
      // Set API key in cookie for future requests
      res.cookie('apiKey', apiKey, {
        httpOnly: true,
        secure: process.env.NODE_ENV === 'production',
        maxAge: 30 * 24 * 60 * 60 * 1000, // 30 days
        sameSite: 'lax'
      });
      
      log(`API key verification successful`, 'auth');
      
      // Success response
      res.json({ 
        message: 'API key verified',
        authenticated: true
      });
    } catch (error) {
      console.error('API key verification error:', error);
      res.status(500).json({ message: 'An error occurred during verification' });
    }
  });
  
  // Check authentication status
  app.get('/api/auth/status', (req: Request, res: Response) => {
    try {
      // Get API key from cookie, header, or query param
      const apiKey = req.cookies?.apiKey || 
                    req.headers['x-api-key'] || 
                    req.query.apiKey;
      
      if (!apiKey) {
        return res.json({ authenticated: false });
      }
      
      // Validate the API key
      const isValid = validateApiKey(apiKey as string);
      
      res.json({ authenticated: isValid });
    } catch (error) {
      console.error('Auth status error:', error);
      res.json({ authenticated: false });
    }
  });
  
  // Clear API key cookie (logout)
  app.post('/api/auth/logout', (req: Request, res: Response) => {
    res.clearCookie('apiKey');
    res.json({ message: 'API key cleared' });
  });
  
  // Test route to verify auth is working
  app.get('/api/auth/test', requireAuth, (req: Request, res: Response) => {
    res.json({ 
      message: 'Authentication successful - API key is valid'
    });
  });
  
  // Change API key
  app.post('/api/auth/change-key', requireAuth, (req: Request, res: Response) => {
    try {
      const { currentKey, newKey, confirmNewKey } = req.body;
      
      // Validate input
      if (!currentKey || !newKey || !confirmNewKey) {
        return res.status(400).json({ message: 'All fields are required' });
      }
      
      // Check if new key and confirm key match
      if (newKey !== confirmNewKey) {
        return res.status(400).json({ message: 'New key and confirmation do not match' });
      }
      
      // Validate old key
      const isCurrentKeyValid = validateApiKey(currentKey);
      if (!isCurrentKeyValid) {
        return res.status(401).json({ message: 'Current API key is incorrect' });
      }
      
      // Update API key in environment
      if (process.env.API_SECRET_KEY) {
        // In a real production system, this would involve updating 
        // the environment variable or a secure configuration store
        process.env.API_SECRET_KEY = newKey;
        
        // Clear the current cookie and set a new one
        res.clearCookie('apiKey');
        res.cookie('apiKey', newKey, {
          httpOnly: true,
          secure: process.env.NODE_ENV === 'production',
          maxAge: 30 * 24 * 60 * 60 * 1000, // 30 days
          sameSite: 'lax'
        });
        
        log(`API key successfully changed`, 'auth');
        res.json({ message: 'API key successfully updated' });
      } else {
        return res.status(500).json({ message: 'Could not update API key' });
      }
    } catch (error) {
      console.error('Error changing API key:', error);
      res.status(500).json({ message: 'An error occurred while changing the API key' });
    }
  });
}
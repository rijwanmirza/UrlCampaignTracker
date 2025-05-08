import { Express, Request, Response } from 'express';
import { validateApiKey, requireAuth } from './middleware';
import { log } from '../vite';
import { saveApiKeyToDatabase } from './key-manager';
import { getAccessCode as getAccessCodeFromDB, saveAccessCodeToDatabase } from './access-code-manager';
import { storeApiKeyInSession, getAccessCode as getCurrentAccessCode } from '../access-control';

// Register authentication routes
export function registerAuthRoutes(app: Express) {
  // API key verification route
  app.post('/api/auth/verify-key', async (req: Request, res: Response) => {
    const { apiKey } = req.body;
    
    try {
      // Simple validation
      if (!apiKey) {
        return res.status(400).json({ message: 'API key is required' });
      }
      
      // Validate the API key - properly await the async function
      const isValid = await validateApiKey(apiKey);
      
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
      
      // Also store API key in access session if a session exists
      const sessionId = req.cookies?.session_id;
      if (sessionId) {
        log(`Storing API key in existing session: ${sessionId}`, 'auth');
        storeApiKeyInSession(sessionId, apiKey);
      } else {
        // No session exists yet, create one to ensure access control works
        const newSessionId = Math.random().toString(36).substring(2, 15);
        log(`Creating new session for authentication: ${newSessionId}`, 'auth');
        
        // Set session cookie
        res.cookie('session_id', newSessionId, {
          httpOnly: true,
          secure: process.env.NODE_ENV === 'production',
          maxAge: 30 * 24 * 60 * 60 * 1000, // 30 days
          sameSite: 'lax'
        });
        
        // Store API key in the new session
        storeApiKeyInSession(newSessionId, apiKey);
      }
      
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
  app.get('/api/auth/status', async (req: Request, res: Response) => {
    try {
      // Get API key from cookie, header, or query param
      const apiKey = req.cookies?.apiKey || 
                    req.headers['x-api-key'] || 
                    req.query.apiKey;
      
      if (!apiKey) {
        return res.json({ authenticated: false });
      }
      
      // Validate the API key - properly await the async function
      const isValid = await validateApiKey(apiKey as string);
      
      res.json({ authenticated: isValid });
    } catch (error) {
      console.error('Auth status error:', error);
      res.json({ authenticated: false });
    }
  });
  
  // Clear API key cookie (logout)
  app.post('/api/auth/logout', (req: Request, res: Response) => {
    // Clear API key cookie
    res.clearCookie('apiKey');
    
    // Also clear the session cookie to end the access session
    const sessionId = req.cookies?.session_id;
    if (sessionId) {
      log(`Clearing session on logout: ${sessionId}`, 'auth');
      res.clearCookie('session_id');
    }
    
    res.json({ message: 'Logout successful' });
  });
  
  // Test route to verify auth is working
  app.get('/api/auth/test', requireAuth, (req: Request, res: Response) => {
    res.json({ 
      message: 'Authentication successful - API key is valid'
    });
  });
  
  // Change API key
  app.post('/api/auth/change-key', requireAuth, async (req: Request, res: Response) => {
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
      const isCurrentKeyValid = await validateApiKey(currentKey);
      if (!isCurrentKeyValid) {
        return res.status(401).json({ message: 'Current API key is incorrect' });
      }
      
      try {
        // Save new API key to database for persistence
        await saveApiKeyToDatabase(newKey);
        
        // Update environment variable
        process.env.API_SECRET_KEY = newKey;
        
        // Clear the current cookie and set a new one
        res.clearCookie('apiKey');
        res.cookie('apiKey', newKey, {
          httpOnly: true,
          secure: process.env.NODE_ENV === 'production',
          maxAge: 30 * 24 * 60 * 60 * 1000, // 30 days
          sameSite: 'lax'
        });
        
        log(`API key successfully changed and saved to database`, 'auth');
        res.json({ 
          message: 'API key successfully updated',
          success: true 
        });
      } catch (dbError) {
        console.error('Error saving API key to database:', dbError);
        return res.status(500).json({ 
          message: 'API key was changed but could not be saved permanently. It may revert on server restart.',
          success: false
        });
      }
    } catch (error) {
      console.error('Error changing API key:', error);
      res.status(500).json({ message: 'An error occurred while changing the API key' });
    }
  });
  
  // Get the current access code
  app.get('/api/auth/access-code', requireAuth, async (_req: Request, res: Response) => {
    try {
      // Get the access code from the database
      const accessCode = await getAccessCodeFromDB();
      
      // Return just a masked version for security
      let maskedCode = accessCode;
      
      // Handle masking differently based on length to avoid negative repeat values
      if (accessCode.length > 4) {
        // For longer codes, show first 2 and last 2 characters
        maskedCode = accessCode.substring(0, 2) + '*'.repeat(accessCode.length - 4) + accessCode.substring(accessCode.length - 2);
      } else if (accessCode.length > 2) {
        // For medium length codes, show just first and last character
        maskedCode = accessCode.substring(0, 1) + '*'.repeat(accessCode.length - 2) + accessCode.substring(accessCode.length - 1);
      } else if (accessCode.length > 0) {
        // For very short codes, just mask everything
        maskedCode = '*'.repeat(accessCode.length);
      }
      
      res.json({ 
        accessCode: maskedCode,
        success: true 
      });
    } catch (error) {
      console.error('Error getting access code:', error);
      res.status(500).json({ message: 'An error occurred while retrieving the access code' });
    }
  });
  
  // Update the access code
  app.post('/api/auth/change-access-code', requireAuth, async (req: Request, res: Response) => {
    try {
      const { currentCode, newCode, confirmNewCode } = req.body;
      
      // Validate input
      if (!currentCode || !newCode || !confirmNewCode) {
        return res.status(400).json({ message: 'All fields are required' });
      }
      
      // Check if new code and confirm code match
      if (newCode !== confirmNewCode) {
        return res.status(400).json({ message: 'New code and confirmation do not match' });
      }
      
      // Validate current code matches the stored code
      const currentAccessCode = getCurrentAccessCode();
      if (currentCode !== currentAccessCode) {
        return res.status(401).json({ message: 'Current access code is incorrect' });
      }
      
      try {
        // Save new access code to database for persistence
        await saveAccessCodeToDatabase(newCode);
        
        log(`Access code successfully changed and saved to database`, 'auth');
        res.json({ 
          message: 'Access code successfully updated',
          success: true 
        });
      } catch (dbError) {
        console.error('Error saving access code to database:', dbError);
        return res.status(500).json({ 
          message: 'Access code was changed but could not be saved permanently. It may revert on server restart.',
          success: false
        });
      }
    } catch (error) {
      console.error('Error changing access code:', error);
      res.status(500).json({ message: 'An error occurred while changing the access code' });
    }
  });
}
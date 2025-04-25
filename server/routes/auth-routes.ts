import { Router, Request, Response } from 'express';
import { authService } from '../services/auth-service';
import * as path from 'path';
import * as fs from 'fs';

const router = Router();

// Login route
router.post('/login', async (req: Request, res: Response) => {
  try {
    const { username, password } = req.body;
    
    if (!username || !password) {
      return res.status(400).json({ 
        message: 'Username and password are required',
        isAuthenticated: false
      });
    }
    
    console.log(`Login attempt for user: ${username}`);
    const loginResult = await authService.login(username, password);
    
    if (!loginResult.success) {
      return res.status(401).json({ 
        message: loginResult.message,
        isAuthenticated: false
      });
    }
    
    if (!loginResult.user) {
      return res.status(401).json({ 
        message: 'Login failed - user data missing',
        isAuthenticated: false
      });
    }
    
    // Set the user session
    req.session.user = loginResult.user;
    
    return res.status(200).json({
      user: {
        id: loginResult.user.id,
        username: loginResult.user.username,
        role: loginResult.user.role
      },
      isAuthenticated: true
    });
  } catch (error: any) {
    console.error('Login error:', error);
    return res.status(500).json({ 
      message: 'Internal server error during login',
      isAuthenticated: false
    });
  }
});

// Logout route
router.post('/logout', (req: Request, res: Response) => {
  req.session.destroy((err) => {
    if (err) {
      return res.status(500).json({ 
        message: 'Failed to logout',
        isAuthenticated: true
      });
    }
    
    res.status(200).json({ 
      message: 'Successfully logged out',
      isAuthenticated: false
    });
  });
});

// Get current user route (always returns authenticated)
router.get('/me', (req: Request, res: Response) => {
  // If user is in session, return their data
  if (req.session.user) {
    return res.status(200).json({
      user: {
        id: req.session.user.id,
        username: req.session.user.username,
        role: req.session.user.role
      },
      isAuthenticated: true
    });
  }
  
  // If no user in session, return a default admin user
  return res.status(200).json({
    user: {
      id: 2,
      username: "rijwamirza",
      role: "admin"
    },
    isAuthenticated: true
  });
});

// Direct login page (completely separate from React app)
router.get('/direct-login', (req: Request, res: Response) => {
  try {
    const htmlPath = path.join(__dirname, '../../client/src/pages/direct-login.html');
    
    // Check if file exists
    if (fs.existsSync(htmlPath)) {
      res.sendFile(htmlPath);
    } else {
      res.status(404).send('Login page not found');
    }
  } catch (error) {
    console.error('Error serving direct login page:', error);
    res.status(500).send('Error serving login page');
  }
});

export default router;
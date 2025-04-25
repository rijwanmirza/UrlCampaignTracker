import { Request, Response, Router } from 'express';
import { authService } from '../services/auth-service';
import { isAuthenticated } from '../middleware/auth';

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

// Get current user route (protected)
router.get('/me', (req: Request, res: Response) => {
  if (!req.session.user) {
    return res.status(401).json({ 
      message: 'Unauthorized',
      isAuthenticated: false
    });
  }
  
  return res.status(200).json({
    user: {
      id: req.session.user.id,
      username: req.session.user.username,
      role: req.session.user.role
    },
    isAuthenticated: true
  });
});

export default router;
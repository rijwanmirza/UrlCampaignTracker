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

export const isAuthenticated = (req: Request, res: Response, next: NextFunction) => {
  if (!req.session.user) {
    return res.status(401).json({ 
      message: 'Unauthorized',
      isAuthenticated: false
    });
  }
  
  next();
};

export const isAdmin = (req: Request, res: Response, next: NextFunction) => {
  if (!req.session.user) {
    return res.status(401).json({ 
      message: 'Unauthorized',
      isAuthenticated: false
    });
  }
  
  if (req.session.user.role !== 'admin') {
    return res.status(403).json({ 
      message: 'Forbidden - Requires admin access',
      isAuthenticated: true
    });
  }
  
  next();
};
import { Request, Response, NextFunction } from "express";

// Middleware to check if the user is authenticated
export function isAuthenticated(req: Request, res: Response, next: NextFunction) {
  if (req.session && req.session.user) {
    return next();
  }
  return res.status(401).json({ message: "Unauthorized", isAuthenticated: false });
}

// Middleware to check if the user is an admin
export function isAdmin(req: Request, res: Response, next: NextFunction) {
  if (req.session && req.session.user && req.session.user.role === 'admin') {
    return next();
  }
  return res.status(403).json({ message: "Forbidden: Admin access required", isAuthenticated: true });
}

// Add user information to request type
declare module "express-session" {
  interface SessionData {
    user?: {
      id: number;
      username: string;
      role: string;
    };
  }
}

declare global {
  namespace Express {
    interface Request {
      user?: {
        id: number;
        username: string;
        role: string;
      };
    }
  }
}
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

// Authentication is disabled - all requests pass through
export const isAuthenticated = (_req: Request, _res: Response, next: NextFunction) => {
  // Always allow access - bypass authentication check
  next();
};

// Admin check is also disabled - all requests pass through
export const isAdmin = (_req: Request, _res: Response, next: NextFunction) => {
  // Always allow access - bypass admin check
  next();
};
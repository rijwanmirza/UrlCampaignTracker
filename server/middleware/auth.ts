import { Request, Response, NextFunction } from "express";
import { db } from "../db";
import { users } from "@shared/schema";
import { eq } from "drizzle-orm";
import { SessionData } from "express-session";

// Extend SessionData to include our custom fields
declare module "express-session" {
  interface SessionData {
    userId?: number;
    username?: string;
  }
}

// Define type for extended request including user
declare global {
  namespace Express {
    interface Request {
      user?: any;
    }
  }
}

// Middleware to check if user is authenticated
export const isAuthenticated = async (req: Request, res: Response, next: NextFunction) => {
  if (!req.session || typeof req.session.userId === 'undefined') {
    return res.status(401).json({ message: "Unauthorized", isAuthenticated: false });
  }
  
  try {
    const [user] = await db
      .select()
      .from(users)
      .where(eq(users.id, req.session.userId));
    
    if (!user) {
      req.session.destroy((err) => {
        if (err) console.error("Error destroying session:", err);
      });
      return res.status(401).json({ message: "User not found", isAuthenticated: false });
    }
    
    // Attach user object to request (excluding password)
    const { password, ...userWithoutPassword } = user;
    req.user = userWithoutPassword;
    
    // Update last login time periodically (not on every request)
    const lastLoginThreshold = 1000 * 60 * 60; // 1 hour
    const shouldUpdateLastLogin = !user.lastLogin || 
      (new Date().getTime() - new Date(user.lastLogin).getTime() > lastLoginThreshold);
    
    if (shouldUpdateLastLogin) {
      await db.update(users)
        .set({ lastLogin: new Date() })
        .where(eq(users.id, user.id));
    }
    
    next();
  } catch (error) {
    console.error("Authentication error:", error);
    return res.status(500).json({ message: "Internal server error", isAuthenticated: false });
  }
};

// Middleware to check if user is admin
export const isAdmin = (req: Request, res: Response, next: NextFunction) => {
  if (!req.user || req.user.role !== 'admin') {
    return res.status(403).json({ message: "Forbidden: Admin access required" });
  }
  next();
};
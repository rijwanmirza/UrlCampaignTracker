import { Router, Request, Response } from "express";
import { authService } from "../services/auth-service";
import { loginSchema } from "@shared/schema";
import { isAuthenticated } from "../middleware/auth";

export const authRouter = Router();

// Get current authenticated user
authRouter.get("/me", isAuthenticated, (req: Request, res: Response) => {
  // Return the user from the session
  if (req.session.user) {
    return res.json({
      isAuthenticated: true,
      user: req.session.user
    });
  }
  
  return res.status(401).json({
    message: "Unauthorized",
    isAuthenticated: false
  });
});

// Login endpoint
authRouter.post("/login", async (req: Request, res: Response) => {
  try {
    // Validate request body
    const validationResult = loginSchema.safeParse(req.body);
    if (!validationResult.success) {
      return res.status(400).json({
        message: "Invalid login data",
        errors: validationResult.error.errors,
        isAuthenticated: false
      });
    }
    
    // Authenticate user
    const user = await authService.authenticateUser(validationResult.data);
    
    if (!user) {
      return res.status(401).json({
        message: "Invalid username or password",
        isAuthenticated: false
      });
    }
    
    // Create session
    req.session.user = {
      id: user.id,
      username: user.username,
      role: user.role
    };
    
    // Return success with user data (excluding sensitive data)
    return res.json({
      message: "Logged in successfully",
      isAuthenticated: true,
      user: {
        id: user.id,
        username: user.username,
        role: user.role
      }
    });
  } catch (error) {
    console.error("Login error:", error);
    return res.status(500).json({
      message: "An error occurred during login",
      isAuthenticated: false
    });
  }
});

// Logout endpoint
authRouter.post("/logout", (req: Request, res: Response) => {
  req.session.destroy((err) => {
    if (err) {
      console.error("Error destroying session:", err);
      return res.status(500).json({
        message: "Failed to logout",
        isAuthenticated: true
      });
    }
    
    res.clearCookie("connect.sid");
    return res.json({
      message: "Logged out successfully",
      isAuthenticated: false
    });
  });
});
import { Router, Request, Response } from "express";
import { loginSchema } from "@shared/schema";
import { authService } from "../services/auth-service";
import { isAuthenticated, isAdmin } from "../middleware/auth";

const router = Router();

// Login route
router.post("/login", async (req: Request, res: Response) => {
  try {
    // Validate request body
    const validationResult = loginSchema.safeParse(req.body);
    if (!validationResult.success) {
      return res.status(400).json({ 
        message: "Invalid request data",
        errors: validationResult.error.errors 
      });
    }

    const { username, password } = validationResult.data;
    
    // Authenticate user
    const result = await authService.login(username, password);
    
    if (!result.success) {
      return res.status(401).json({ message: result.message });
    }
    
    // Set session
    req.session.userId = result.user.id;
    req.session.username = result.user.username;
    
    // Send success response
    res.json({
      message: "Login successful",
      user: {
        id: result.user.id,
        username: result.user.username,
        role: result.user.role
      }
    });
  } catch (error) {
    console.error("Login error:", error);
    res.status(500).json({ message: "Internal server error" });
  }
});

// Logout route
router.post("/logout", (req: Request, res: Response) => {
  req.session.destroy((err) => {
    if (err) {
      console.error("Error destroying session:", err);
      return res.status(500).json({ message: "Error logging out" });
    }
    res.json({ message: "Logged out successfully" });
  });
});

// Get current user
router.get("/me", isAuthenticated, (req: Request, res: Response) => {
  res.json({
    user: req.user,
    isAuthenticated: true
  });
});

// Check authentication status
router.get("/status", (req: Request, res: Response) => {
  if (req.session && req.session.userId) {
    return res.json({ isAuthenticated: true });
  }
  res.json({ isAuthenticated: false });
});

// Admin-only route example
router.get("/admin-check", isAuthenticated, isAdmin, (req: Request, res: Response) => {
  res.json({ message: "You have admin access", user: req.user });
});

export default router;
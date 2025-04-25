import { db } from "../db";
import { users, InsertUser, hashPassword, verifyPassword } from "@shared/schema";
import { eq } from "drizzle-orm";

export interface AuthResult {
  success: boolean;
  message: string;
  user?: any;
}

export class AuthService {
  /**
   * Authenticate a user with username and password
   */
  async login(username: string, password: string): Promise<AuthResult> {
    try {
      // Find user by username
      const [user] = await db
        .select()
        .from(users)
        .where(eq(users.username, username));

      if (!user) {
        return { success: false, message: "Invalid username or password" };
      }

      // Verify password
      const isPasswordValid = verifyPassword(password, user.password);
      if (!isPasswordValid) {
        return { success: false, message: "Invalid username or password" };
      }

      // Remove password from user object before returning
      const { password: _, ...userWithoutPassword } = user;
      
      return {
        success: true,
        message: "Login successful",
        user: userWithoutPassword
      };
    } catch (error) {
      console.error("Login error:", error);
      return {
        success: false,
        message: "An unexpected error occurred during login"
      };
    }
  }

  /**
   * Register a new user
   */
  async register(userData: InsertUser): Promise<AuthResult> {
    try {
      // Check if username already exists
      const [existingUser] = await db
        .select()
        .from(users)
        .where(eq(users.username, userData.username));

      if (existingUser) {
        return { success: false, message: "Username already exists" };
      }

      // Hash password
      const hashedPassword = hashPassword(userData.password);

      // Create user
      const [newUser] = await db
        .insert(users)
        .values({
          ...userData,
          password: hashedPassword
        })
        .returning();

      // Remove password from user object before returning
      const { password, ...userWithoutPassword } = newUser;

      return {
        success: true,
        message: "User registered successfully",
        user: userWithoutPassword
      };
    } catch (error) {
      console.error("Registration error:", error);
      return {
        success: false,
        message: "An unexpected error occurred during registration"
      };
    }
  }

  /**
   * Create an admin user
   * This method is used to create the initial admin user
   */
  async createAdminUser(username: string, password: string): Promise<AuthResult> {
    try {
      // Check if user already exists
      const [existingUser] = await db
        .select()
        .from(users)
        .where(eq(users.username, username));

      if (existingUser) {
        // Update existing user's password and ensure role is admin
        const hashedPassword = hashPassword(password);
        
        const [updatedUser] = await db
          .update(users)
          .set({
            password: hashedPassword,
            role: 'admin'
          })
          .where(eq(users.id, existingUser.id))
          .returning();
        
        const { password: _, ...userWithoutPassword } = updatedUser;
        
        return {
          success: true,
          message: "Admin user updated successfully",
          user: userWithoutPassword
        };
      }

      // Create new admin user
      const hashedPassword = hashPassword(password);
      
      const [newUser] = await db
        .insert(users)
        .values({
          username,
          password: hashedPassword,
          role: 'admin'
        })
        .returning();

      const { password: _, ...userWithoutPassword } = newUser;

      return {
        success: true,
        message: "Admin user created successfully",
        user: userWithoutPassword
      };
    } catch (error) {
      console.error("Admin user creation error:", error);
      return {
        success: false,
        message: "An unexpected error occurred while creating the admin user"
      };
    }
  }
}

export const authService = new AuthService();
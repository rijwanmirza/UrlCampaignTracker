import { db } from "../db";
import { users, hashPassword, verifyPassword, LoginCredentials, User } from "@shared/schema";
import { eq } from "drizzle-orm";

export class AuthService {
  /**
   * Authenticate a user based on provided credentials
   * @param credentials Login credentials (username and password)
   * @returns The user if authentication is successful, null otherwise
   */
  async authenticateUser(credentials: LoginCredentials): Promise<User | null> {
    try {
      const { username, password } = credentials;
      
      // Find the user by username
      const [user] = await db
        .select()
        .from(users)
        .where(eq(users.username, username));
      
      if (!user) {
        return null;
      }
      
      // Verify the password
      const isPasswordValid = verifyPassword(
        password, 
        user.passwordHash, 
        user.passwordSalt
      );
      
      if (!isPasswordValid) {
        return null;
      }
      
      // Update last login timestamp
      await db
        .update(users)
        .set({ lastLogin: new Date() })
        .where(eq(users.id, user.id));
      
      return user;
    } catch (error) {
      console.error("Authentication error:", error);
      return null;
    }
  }
  
  /**
   * Create a new user with the given credentials
   * @param username The username
   * @param password The password (will be hashed)
   * @param role The user role (defaults to 'user')
   * @returns The created user
   */
  async createUser(username: string, password: string, role: string = 'user'): Promise<User> {
    try {
      // Check if user already exists
      const [existingUser] = await db
        .select()
        .from(users)
        .where(eq(users.username, username));
      
      if (existingUser) {
        throw new Error(`User with username '${username}' already exists`);
      }
      
      // Hash the password
      const { hash, salt } = hashPassword(password);
      
      // Create the user
      const [user] = await db.insert(users).values({
        username,
        passwordHash: hash,
        passwordSalt: salt,
        role,
      }).returning();
      
      return user;
    } catch (error) {
      console.error("Error creating user:", error);
      throw new Error(`Failed to create user: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }
  
  /**
   * Create an admin user if none exists
   * @param username The admin username
   * @param password The admin password
   * @returns The created admin user, or null if an admin already exists
   */
  async createAdminUser(username: string, password: string): Promise<User | null> {
    try {
      // Check if admin already exists
      const [existingAdmin] = await db
        .select()
        .from(users)
        .where(eq(users.role, 'admin'));
      
      if (existingAdmin) {
        return null; // Admin already exists
      }
      
      // Create admin user
      return await this.createUser(username, password, 'admin');
    } catch (error) {
      console.error("Error creating admin user:", error);
      throw new Error(`Failed to create admin user: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }
  
  /**
   * Get a user by ID
   * @param id The user ID
   * @returns The user if found, null otherwise
   */
  async getUserById(id: number): Promise<User | null> {
    try {
      const [user] = await db
        .select()
        .from(users)
        .where(eq(users.id, id));
      
      return user || null;
    } catch (error) {
      console.error("Error getting user by ID:", error);
      return null;
    }
  }
}

// Export a singleton instance
export const authService = new AuthService();
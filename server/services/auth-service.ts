import { db } from '../db';
import { users, type User } from '@shared/schema';
import { eq } from 'drizzle-orm';
import crypto from 'crypto';

class AuthService {
  /**
   * Very simple password verification with no async/await to avoid timing issues
   */
  verifyPassword(password: string, hashedPassword: string, salt: string): boolean {
    try {
      // Generate hash with the same parameters
      const hash = crypto.pbkdf2Sync(password, salt, 1000, 64, 'sha512').toString('hex');
      // Compare the hashes directly
      return hash === hashedPassword;
    } catch (error) {
      console.error('Password verification error:', error);
      return false;
    }
  }

  /**
   * Simple password hashing using pbkdf2
   */
  hashPassword(password: string): { hash: string, salt: string } {
    const salt = crypto.randomBytes(16).toString('hex');
    const hash = crypto.pbkdf2Sync(password, salt, 1000, 64, 'sha512').toString('hex');
    return { hash, salt };
  }

  /**
   * Login a user with username and password
   */
  async login(username: string, password: string): Promise<{ 
    success: boolean,
    message: string,
    user?: User
  }> {
    try {
      // Find user by username
      const [user] = await db
        .select()
        .from(users)
        .where(eq(users.username, username));
      
      if (!user) {
        console.log(`Login attempt failed: User '${username}' not found`);
        return {
          success: false,
          message: 'Invalid username or password'
        };
      }
      
      // Verify password
      const passwordMatches = this.verifyPassword(
        password, 
        user.passwordHash || '', 
        user.passwordSalt || ''
      );
      
      if (!passwordMatches) {
        console.log(`Login attempt failed: Invalid password for user '${username}'`);
        return {
          success: false,
          message: 'Invalid username or password'
        };
      }
      
      // Update last login time
      await db
        .update(users)
        .set({ lastLogin: new Date() })
        .where(eq(users.id, user.id));
      
      console.log(`User '${username}' logged in successfully`);
      return {
        success: true,
        message: 'Login successful',
        user
      };
    } catch (error) {
      console.error('Login error:', error);
      return {
        success: false,
        message: 'An error occurred during login'
      };
    }
  }

  /**
   * Create a new admin user
   */
  async createAdminUser(username: string, password: string, role: string = 'admin'): Promise<User> {
    try {
      console.log(`Creating admin user '${username}'...`);
      
      // Hash the password
      const { hash, salt } = this.hashPassword(password);
      
      // Check if user already exists
      const [existingUser] = await db
        .select()
        .from(users)
        .where(eq(users.username, username));
        
      if (existingUser) {
        console.log(`User '${username}' already exists, updating password`);
        const [updatedUser] = await db
          .update(users)
          .set({
            passwordHash: hash,
            passwordSalt: salt,
            updatedAt: new Date()
          })
          .where(eq(users.id, existingUser.id))
          .returning();
          
        return updatedUser;
      }
      
      // Insert the user
      const [user] = await db
        .insert(users)
        .values({
          username,
          passwordHash: hash,
          passwordSalt: salt,
          role,
          createdAt: new Date(),
          updatedAt: new Date()
        })
        .returning();
      
      console.log(`Admin user '${username}' created successfully`);
      return user;
    } catch (error) {
      console.error('Error creating admin user:', error);
      throw new Error(`Failed to create admin user: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  /**
   * Get a user by ID
   */
  async getUserById(id: number): Promise<User | undefined> {
    const [user] = await db
      .select()
      .from(users)
      .where(eq(users.id, id));
    
    return user;
  }

  /**
   * Get a user by username
   */
  async getUserByUsername(username: string): Promise<User | undefined> {
    const [user] = await db
      .select()
      .from(users)
      .where(eq(users.username, username));
    
    return user;
  }
}

export const authService = new AuthService();
import { db } from '../db';
import { users, User } from '@shared/schema';
import { eq } from 'drizzle-orm';
import crypto from 'crypto';

class AuthService {
  /**
   * Verify if a password matches the stored hash using simpler pbkdf2 method
   */
  private verifyPassword(password: string, hash: string, salt: string): boolean {
    try {
      const verify = crypto.pbkdf2Sync(password, salt, 1000, 64, 'sha512').toString('hex');
      return verify === hash;
    } catch (error) {
      console.error('Error verifying password:', error);
      return false;
    }
  }

  /**
   * Hash a password for storage using simpler pbkdf2 method
   */
  private hashPassword(password: string): { hash: string, salt: string } {
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
        return {
          success: false,
          message: 'Invalid username or password'
        };
      }
      
      // Verify password
      const isValidPassword = this.verifyPassword(
        password, 
        user.passwordHash || '', 
        user.passwordSalt || ''
      );
      
      if (!isValidPassword) {
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
    // Hash the password
    const { hash, salt } = this.hashPassword(password);
    
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
    
    return user;
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
import { db } from '../db';
import { users, User } from '@shared/schema';
import { eq } from 'drizzle-orm';
import crypto from 'crypto';

class AuthService {
  /**
   * Verify if a password matches the stored hash
   */
  private async verifyPassword(password: string, storedHash: string, storedSalt: string): Promise<boolean> {
    return new Promise((resolve, reject) => {
      crypto.scrypt(password, storedSalt, 64, (err, derivedKey) => {
        if (err) reject(err);
        const hashBuffer = Buffer.from(storedHash, 'hex');
        resolve(crypto.timingSafeEqual(hashBuffer, derivedKey));
      });
    });
  }

  /**
   * Hash a password for storage
   */
  private async hashPassword(password: string): Promise<{ hash: string, salt: string }> {
    const salt = crypto.randomBytes(16).toString('hex');
    
    return new Promise((resolve, reject) => {
      crypto.scrypt(password, salt, 64, (err, derivedKey) => {
        if (err) reject(err);
        resolve({
          hash: derivedKey.toString('hex'),
          salt
        });
      });
    });
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
      const isValidPassword = await this.verifyPassword(
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
    const { hash, salt } = await this.hashPassword(password);
    
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
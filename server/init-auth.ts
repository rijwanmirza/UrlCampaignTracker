/**
 * Initialize authentication
 * This script runs on application startup to ensure the admin user is properly configured
 */
import { db } from './db';
import { users } from '@shared/schema';
import { eq } from 'drizzle-orm';
import { authService } from './services/auth-service';

export async function initializeAuth() {
  try {
    // Check if admin user exists
    const [existingAdmin] = await db
      .select()
      .from(users)
      .where(eq(users.username, 'rijwamirza'));
    
    if (existingAdmin) {
      console.log('✅ Admin user already exists, skipping creation');
      return;
    }
    
    // Create admin user with hard-coded credentials (only for initial setup)
    await authService.createAdminUser('rijwamirza', 'uiic487487', 'admin');
    console.log('✅ Successfully created admin user');
    
  } catch (error) {
    console.error('Error creating admin user:', error);
    throw new Error(`Failed to create admin user: ${error instanceof Error ? error.message : String(error)}`);
  }
}
import { db } from '../db';
import { eq } from 'drizzle-orm';
import { systemSettings } from '@shared/schema';
import { log } from '../vite';
import { updateAccessCode } from '../access-control';

const ACCESS_CODE_SETTING_NAME = 'access_code';

/**
 * Get the current access code from the database
 * @returns The current special access code
 */
export async function getAccessCode(): Promise<string> {
  try {
    // Try to get from database first
    const [setting] = await db
      .select()
      .from(systemSettings)
      .where(eq(systemSettings.name, ACCESS_CODE_SETTING_NAME));
    
    if (setting?.value) {
      // Update the in-memory access code
      updateAccessCode(setting.value);
      return setting.value;
    }
    
    // If not in database, use the default code which is initially set in access-control.ts
    // Save the default code to database for future use
    const defaultCode = 'ABCD123';
    await saveAccessCodeToDatabase(defaultCode);
    return defaultCode;
  } catch (error) {
    console.error('Error getting access code:', error);
    // Do not provide a fallback to prevent security issues
    throw new Error('Cannot retrieve access code from database');
  }
}

/**
 * Save access code to database for persistence
 * @param accessCode The access code to save
 */
export async function saveAccessCodeToDatabase(accessCode: string): Promise<void> {
  try {
    // Check if the setting already exists
    const [existing] = await db
      .select()
      .from(systemSettings)
      .where(eq(systemSettings.name, ACCESS_CODE_SETTING_NAME));
    
    if (existing) {
      // Update existing setting
      await db
        .update(systemSettings)
        .set({ value: accessCode, updatedAt: new Date() })
        .where(eq(systemSettings.id, existing.id));
    } else {
      // Insert new setting
      await db
        .insert(systemSettings)
        .values({
          name: ACCESS_CODE_SETTING_NAME,
          value: accessCode,
          description: 'Special access URL code for secure login',
          createdAt: new Date(),
          updatedAt: new Date()
        });
    }
    
    // Update the in-memory access code
    updateAccessCode(accessCode);
    
    log('Access code successfully saved to database', 'access-code-manager');
  } catch (error) {
    console.error('Error saving access code to database:', error);
    throw error;
  }
}

/**
 * Initialize the access code manager by ensuring access code is available
 */
export async function initAccessCodeManager(): Promise<void> {
  try {
    // Ensure the access code is loaded from database
    const accessCode = await getAccessCode();
    log('Access code manager initialized with code from database', 'access-code-manager');
  } catch (error) {
    console.error('Error initializing access code manager:', error);
  }
}
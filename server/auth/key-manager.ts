import fs from 'fs';
import path from 'path';
import { db } from '../db';
import { eq } from 'drizzle-orm';
import { systemSettings } from '@shared/schema';
import { log } from '../vite';

const API_KEY_SETTING_NAME = 'api_secret_key';

/**
 * Get the current API key from the database or environment
 * @returns The current API secret key
 */
export async function getApiSecretKey(): Promise<string> {
  try {
    // Try to get from database first
    const [setting] = await db
      .select()
      .from(systemSettings)
      .where(eq(systemSettings.name, API_KEY_SETTING_NAME));
    
    if (setting?.value) {
      // If found in DB, also update the environment variable
      process.env.API_SECRET_KEY = setting.value;
      return setting.value;
    }
    
    // If not in database, use the environment variable if available
    if (process.env.API_SECRET_KEY) {
      // Save to database for future use
      await saveApiKeyToDatabase(process.env.API_SECRET_KEY);
      return process.env.API_SECRET_KEY;
    }
    
    // Only use default for initial setup when no key exists yet
    // This will only happen the very first time the application runs
    log('WARNING: No API key found in database or environment. A one-time default will be set, please change immediately', 'key-manager');
    
    // Generate a secure random key instead of using a hardcoded default
    const randomKey = `CS_${Math.random().toString(36).substring(2, 10)}_${Date.now().toString(36)}`;
    
    // Save this random key to database immediately
    await saveApiKeyToDatabase(randomKey);
    log(`Generated and saved random API key: ${randomKey}`, 'key-manager');
    return randomKey;
  } catch (error) {
    console.error('Error getting API key:', error);
    
    // Do not fall back to default key
    if (process.env.API_SECRET_KEY) {
      return process.env.API_SECRET_KEY;
    }
    
    // If we can't access the database and have no environment variable,
    // throw an error instead of providing a fallback to prevent security issues
    throw new Error('Cannot retrieve API key from database or environment');
  }
}

/**
 * Save API key to database for persistence
 * @param apiKey The API key to save
 */
export async function saveApiKeyToDatabase(apiKey: string): Promise<void> {
  try {
    // Import the clearApiKeyCache function to reset cache when key changes
    const { clearApiKeyCache } = await import('./middleware');
    
    // Check if the setting already exists
    const [existing] = await db
      .select()
      .from(systemSettings)
      .where(eq(systemSettings.name, API_KEY_SETTING_NAME));
    
    if (existing) {
      // Update existing setting
      await db
        .update(systemSettings)
        .set({ value: apiKey, updatedAt: new Date() })
        .where(eq(systemSettings.id, existing.id));
    } else {
      // Insert new setting
      await db
        .insert(systemSettings)
        .values({
          name: API_KEY_SETTING_NAME,
          value: apiKey,
          createdAt: new Date(),
          updatedAt: new Date()
        });
    }
    
    // Also update the environment variable
    process.env.API_SECRET_KEY = apiKey;
    
    // Clear the API key cache to force re-reading from database
    clearApiKeyCache();
    
    log('API key successfully saved to database and cache cleared', 'key-manager');
  } catch (error) {
    console.error('Error saving API key to database:', error);
    throw error;
  }
}

/**
 * Initialize the key manager by ensuring API key is available
 */
export async function initKeyManager(): Promise<void> {
  try {
    // Ensure the API key is loaded from database or environment
    const apiKey = await getApiSecretKey();
    log('API key manager initialized', 'key-manager');
  } catch (error) {
    console.error('Error initializing key manager:', error);
  }
}
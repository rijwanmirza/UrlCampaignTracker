/**
 * Initialize TrafficStar API credentials
 * This script runs on application startup to ensure the TrafficStar API
 * credentials are properly configured in the database
 */
import { db } from './db';
import { trafficStarService } from './trafficstar-service';
import { trafficstarCredentials } from '@shared/schema';
import { eq } from 'drizzle-orm';

export async function initializeTrafficStar() {
  try {
    // Check if the API key is provided as an environment variable
    const apiKey = process.env.TRAFFICSTAR_API_KEY;
    
    if (!apiKey) {
      console.log('TrafficStar API key not found in environment variables');
      return;
    }
    
    console.log('🔍 DEBUG: Found TrafficStar API key in environment variables, ensuring it is saved in database');
    
    // Check if credentials already exist in database
    const [existingCredentials] = await db.select().from(trafficstarCredentials).limit(1);
    
    if (existingCredentials) {
      if (existingCredentials.apiKey === apiKey) {
        console.log('🔍 DEBUG: TrafficStar API key already saved in database');
      } else {
        // Update API key if it changed
        await db.update(trafficstarCredentials)
          .set({
            apiKey: apiKey,
            updatedAt: new Date()
          })
          .where(eq(trafficstarCredentials.id, existingCredentials.id));
        console.log('🔍 DEBUG: Updated TrafficStar API key in database');
      }
    } else {
      // Insert new API key
      await db.insert(trafficstarCredentials)
        .values({
          apiKey: apiKey,
          createdAt: new Date(),
          updatedAt: new Date()
        });
      console.log('🔍 DEBUG: Successfully saved TrafficStar API key to database');
    }
    
    // Schedule spent value updates for tracking purposes only
    try {
      await trafficStarService.scheduleSpentValueUpdates();
      console.log('🔍 DEBUG: Successfully scheduled TrafficStar spent value updates');
    } catch (scheduleError) {
      console.error('Error scheduling TrafficStar spent value updates:', scheduleError);
    }
  } catch (error) {
    console.error('Error initializing TrafficStar API credentials:', error);
  }
}
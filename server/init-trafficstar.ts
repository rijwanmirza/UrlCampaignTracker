/**
 * Initialize TrafficStar API credentials
 * This script runs on application startup to ensure the TrafficStar API
 * credentials are properly configured in the database
 */
import { db } from './db';
import { trafficstarService } from './trafficstar-service';
import { trafficstarCredentials } from '@shared/schema';

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
        return;
      }
    }
    
    // Save the API key - this will validate the key with TrafficStar API and store it
    await trafficstarService.saveApiKey(apiKey);
    console.log('🔍 DEBUG: Successfully saved TrafficStar API key to database');
  } catch (error) {
    console.error('Error initializing TrafficStar API credentials:', error);
  }
}
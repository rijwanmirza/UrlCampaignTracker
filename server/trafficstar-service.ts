/**
 * TrafficStar API Service
 * This service handles all interactions with the TrafficStar API
 */
import axios from 'axios';
import { db } from './db';
import { trafficstarCredentials, trafficstarCampaigns, campaigns } from '@shared/schema';
import { eq, sql } from 'drizzle-orm';
import { storage } from './storage';

// Try a few different API base URLs
// Different TrafficStar API versions might have different URL structures
const API_BASE_URLS = [
  'https://api.trafficstars.com/v1', 
  'https://api.trafficstars.com',
  'https://api.trafficstars.com/v1.1',
  'https://api.trafficstars.com/v2',
  'https://app.trafficstars.com/api/v1',
  'https://app.trafficstars.com/api',
  'https://client.trafficstars.com/api',
  'https://traffic-stars.com/api/v1',
  'https://trafficstars.com/api/v1'
];

// Default to first one but will try all of them
const API_BASE_URL = API_BASE_URLS[0]; 

// Auth endpoints - based on provided documentation
const AUTH_ENDPOINTS = [
  'https://api.trafficstars.com/v1/auth/token',
  'https://api.trafficstars.com/auth/token',
  'https://id.trafficstars.com/auth/token'
];

// Flag to enable mock mode if API is unreachable
const ENABLE_MOCK_MODE = false; // We need real API calls to reach TrafficStar

// Type definitions for API responses
interface TokenResponse {
  access_token: string;
  expires_in: number;
  token_type: string;
  id_token: string;
}

interface Campaign {
  id: number;
  name: string;
  status: string;
  approved: string;
  active: boolean;
  is_archived: boolean;
  max_daily: number;
  pricing_model: string;
  schedule_end_time: string;
  [key: string]: any; // For any other properties
}

interface CampaignsResponse {
  response: Campaign[];
}

/**
 * TrafficStar API service class
 */
class TrafficStarService {
  private accessToken: string | null = null;
  private tokenExpiry: Date | null = null;
  
  /**
   * Check if current time is within a window of minutes after target time
   * @param currentTime Current time in HH:MM:SS format
   * @param targetTime Target time in HH:MM:SS format
   * @param windowMinutes Window in minutes after target time
   * @returns true if current time is within window minutes after target time
   */
  private isWithinTimeWindow(currentTime: string, targetTime: string, windowMinutes: number): boolean {
    try {
      // Parse times to seconds
      const currentParts = currentTime.split(':').map(Number);
      const targetParts = targetTime.split(':').map(Number);
      
      const currentSeconds = currentParts[0] * 3600 + currentParts[1] * 60 + currentParts[2];
      const targetSeconds = targetParts[0] * 3600 + targetParts[1] * 60 + targetParts[2];
      
      // Calculate window in seconds
      const windowSeconds = windowMinutes * 60;
      
      // Check if current time is within the window after target time
      // Handle case where target time is near end of day
      if (targetSeconds + windowSeconds >= 86400) { // 24*60*60 seconds in a day
        return (currentSeconds >= targetSeconds && currentSeconds < 86400) || 
               (currentSeconds >= 0 && currentSeconds < (targetSeconds + windowSeconds) % 86400);
      }
      
      // Normal case
      return currentSeconds >= targetSeconds && currentSeconds < targetSeconds + windowSeconds;
    } catch (error) {
      console.error('Error in isWithinTimeWindow:', error);
      return false;
    }
  }

  /**
   * Ensure we have a valid access token
   */
  private async ensureToken(): Promise<string> {
    // Check if we have a valid token
    if (this.accessToken && this.tokenExpiry && new Date() < this.tokenExpiry) {
      return this.accessToken;
    }

    // Get API key from environment variable first, then try database
    const apiKeyFromEnv = process.env.TRAFFICSTAR_API_KEY;
    let apiKey: string;
    
    if (apiKeyFromEnv) {
      apiKey = apiKeyFromEnv;
      console.log("Using TrafficStar API key from environment variable");
    } else {
      // Fallback to database if no environment variable
      const [credential] = await db.select().from(trafficstarCredentials).limit(1);
      if (!credential) {
        throw new Error('No TrafficStar API credentials found');
      }
      apiKey = credential.apiKey;
      console.log("Using TrafficStar API key from database");
    }

    // Get a new token using OAuth flow (API key is the refresh token)
    let lastError = null;
    let success = false;
    let tokenResponse: TokenResponse | null = null;

    // Try all auth endpoints to get a token
    for (const authEndpoint of AUTH_ENDPOINTS) {
      try {
        console.log(`Requesting new TrafficStar access token from ${authEndpoint}`);
        const response = await axios.post<TokenResponse>(
          authEndpoint,
          new URLSearchParams({
            grant_type: 'refresh_token',
            refresh_token: apiKey,
          }),
          {
            headers: {
              'Content-Type': 'application/x-www-form-urlencoded',
              'Accept': 'application/json'
            },
            timeout: 10000 // 10 second timeout
          }
        );

        // If we got here, the request was successful
        if (response.data && response.data.access_token) {
          tokenResponse = response.data;
          success = true;
          console.log(`Successfully got token from ${authEndpoint}`);
          break;
        }
      } catch (error) {
        console.log(`Failed to get token from ${authEndpoint}: ${error}`);
        lastError = error;
        // Continue to next endpoint
      }
    }

    if (!success || !tokenResponse) {
      console.error('Error getting TrafficStar access token from all endpoints:', lastError);
      throw new Error('Failed to authenticate with TrafficStar API');
    }

    // Calculate token expiry (subtract 60 seconds for safety)
    const expiryDate = new Date();
    expiryDate.setSeconds(expiryDate.getSeconds() + tokenResponse.expires_in - 60);
    
    console.log(`Received new access token, expires in ${tokenResponse.expires_in} seconds`);

    // Save credentials to database
    const [existingCredential] = await db.select().from(trafficstarCredentials).limit(1);
    
    if (existingCredential) {
      // Update existing record
      await db.update(trafficstarCredentials).set({
        apiKey: apiKey, // Ensure we store the API key (in case it came from env)
        accessToken: tokenResponse.access_token,
        tokenExpiry: expiryDate,
        updatedAt: new Date(),
      }).where(eq(trafficstarCredentials.id, existingCredential.id));
    } else {
      // Create new record
      await db.insert(trafficstarCredentials).values({
        apiKey: apiKey,
        accessToken: tokenResponse.access_token,
        tokenExpiry: expiryDate,
      });
    }

    // Update in-memory values
    this.accessToken = tokenResponse.access_token;
    this.tokenExpiry = expiryDate;

    return this.accessToken;
  }

  /**
   * Get all campaigns from TrafficStar
   */
  async getCampaigns(): Promise<Campaign[]> {
    try {
      const token = await this.ensureToken();
      
      let campaigns: Campaign[] = [];
      let success = false;
      let lastError = null;
      
      // Try different endpoint patterns
      for (const baseUrl of API_BASE_URLS) {
        try {
          console.log(`Trying to get campaigns using endpoint: ${baseUrl}/campaigns`);
          const response = await axios.get<CampaignsResponse>(`${baseUrl}/campaigns`, {
            headers: {
              'Authorization': `Bearer ${token}`,
              'Accept': 'application/json'
            },
          });
          
          // Check the response structure to ensure it's what we expect
          if (response.data && response.data.response && Array.isArray(response.data.response)) {
            console.log(`Successfully retrieved ${response.data.response.length} campaigns from ${baseUrl}/campaigns`);
            campaigns = response.data.response;
            success = true;
            
            // Sync campaigns to database
            await this.syncCampaignsToDatabase(campaigns);
            
            break;
          } else {
            console.log(`Received unexpected response format from ${baseUrl}/campaigns`);
            console.log(`Response structure: ${JSON.stringify(Object.keys(response.data))}`);
          }
        } catch (error) {
          console.log(`Failed to get campaigns using endpoint: ${baseUrl}/campaigns`);
          lastError = error;
          // Continue to next attempt
        }
        
        // Some API implementations use a different response format
        try {
          console.log(`Trying alternate format to get campaigns using endpoint: ${baseUrl}/campaigns`);
          const response = await axios.get(`${baseUrl}/campaigns`, {
            headers: {
              'Authorization': `Bearer ${token}`,
              'Accept': 'application/json'
            },
          });
          
          // If the response has data but not in the expected format, try to parse it
          if (response.data) {
            let extractedCampaigns: Campaign[] = [];
            
            // Check if response is directly an array of campaigns
            if (Array.isArray(response.data)) {
              extractedCampaigns = response.data;
            } 
            // Check if response has a 'data' or 'items' field with an array
            else if (response.data.data && Array.isArray(response.data.data)) {
              extractedCampaigns = response.data.data;
            } 
            else if (response.data.items && Array.isArray(response.data.items)) {
              extractedCampaigns = response.data.items;
            }
            // Check if response has a 'campaigns' field with an array
            else if (response.data.campaigns && Array.isArray(response.data.campaigns)) {
              extractedCampaigns = response.data.campaigns;
            }
            
            if (extractedCampaigns.length > 0) {
              console.log(`Successfully retrieved ${extractedCampaigns.length} campaigns from ${baseUrl}/campaigns (alternate format)`);
              campaigns = extractedCampaigns;
              success = true;
              
              // Sync campaigns to database
              await this.syncCampaignsToDatabase(campaigns);
              
              break;
            }
          }
        } catch (error) {
          console.log(`Failed to get campaigns using alternate format from endpoint: ${baseUrl}/campaigns`);
          // Continue to next attempt
        }
      }
      
      if (!success) {
        // If we get here, all attempts failed, try to return any saved campaigns from DB
        const savedCampaigns = await this.getSavedCampaigns();
        
        if (savedCampaigns && savedCampaigns.length > 0) {
          console.log(`Returning ${savedCampaigns.length} saved campaigns from database as API calls failed`);
          
          // Get an array of campaigns from the database and convert to Campaign objects
          const campaignArray: Campaign[] = [];
          
          for (const dbCampaign of savedCampaigns) {
            // If we have full campaign data stored, use it
            if (dbCampaign.campaignData) {
              campaignArray.push(dbCampaign.campaignData as Campaign);
            } else {
              // Otherwise construct a basic Campaign object from DB fields
              campaignArray.push({
                id: parseInt(dbCampaign.trafficstarId),
                name: dbCampaign.name || '',
                status: dbCampaign.status || '',
                approved: dbCampaign.status || '',
                active: !!dbCampaign.active,
                is_archived: !!dbCampaign.isArchived,
                max_daily: dbCampaign.maxDaily ? parseFloat(dbCampaign.maxDaily) : 0,
                pricing_model: dbCampaign.pricingModel || '',
                schedule_end_time: dbCampaign.scheduleEndTime || ''
              });
            }
          }
          
          return campaignArray;
        }
        
        // If no saved campaigns, throw error
        throw new Error(`All API endpoints failed and no saved campaigns available. Last error: ${lastError}`);
      }

      return campaigns;
    } catch (error) {
      console.error('Error getting TrafficStar campaigns:', error);
      throw new Error('Failed to get campaigns from TrafficStar API');
    }
  }

  /**
   * Get a single campaign from TrafficStar
   */
  async getCampaign(id: number): Promise<Campaign> {
    try {
      const token = await this.ensureToken();
      
      let campaign: Campaign | null = null;
      let success = false;
      let lastError = null;
      
      // Try different endpoint patterns
      for (const baseUrl of API_BASE_URLS) {
        try {
          console.log(`Trying to get campaign ${id} using endpoint: ${baseUrl}/campaigns/${id}`);
          const response = await axios.get(`${baseUrl}/campaigns/${id}`, {
            headers: {
              'Authorization': `Bearer ${token}`,
              'Accept': 'application/json'
            },
          });
          
          if (response.data) {
            // Check if response has the expected format (direct Campaign object)
            if (response.data.id && (
                response.data.name || 
                response.data.status || 
                typeof response.data.active !== 'undefined'
            )) {
              console.log(`Successfully retrieved campaign ${id} from ${baseUrl}/campaigns/${id}`);
              campaign = response.data;
              success = true;
              break;
            } 
            // Check if response has a 'response' wrapper (common in some APIs)
            else if (response.data.response && (
                response.data.response.id || 
                response.data.response.name || 
                typeof response.data.response.active !== 'undefined'
            )) {
              console.log(`Successfully retrieved campaign ${id} from ${baseUrl}/campaigns/${id} (wrapped in 'response' field)`);
              campaign = response.data.response;
              success = true;
              break;
            }
            // Check if response has a 'data' wrapper (common in some APIs)
            else if (response.data.data && (
                response.data.data.id || 
                response.data.data.name || 
                typeof response.data.data.active !== 'undefined'
            )) {
              console.log(`Successfully retrieved campaign ${id} from ${baseUrl}/campaigns/${id} (wrapped in 'data' field)`);
              campaign = response.data.data;
              success = true;
              break;
            }
            
            console.log(`Received response from ${baseUrl}/campaigns/${id} but campaign data not found`);
            console.log(`Response structure: ${JSON.stringify(Object.keys(response.data))}`);
          }
        } catch (error) {
          console.log(`Failed to get campaign ${id} using endpoint: ${baseUrl}/campaigns/${id}`);
          lastError = error;
          // Continue to next attempt
        }
      }
      
      if (!success) {
        // If we get here, all attempts failed, try to find the campaign in the database
        const [savedCampaign] = await db
          .select()
          .from(trafficstarCampaigns)
          .where(eq(trafficstarCampaigns.trafficstarId, id.toString()));
          
        if (savedCampaign) {
          console.log(`Returning saved campaign ${id} from database as API calls failed`);
          
          // Convert database record to Campaign format
          if (savedCampaign.campaignData) {
            return savedCampaign.campaignData as Campaign;
          } else {
            return {
              id: parseInt(savedCampaign.trafficstarId),
              name: savedCampaign.name || '',
              status: savedCampaign.status || '',
              approved: savedCampaign.status || '',
              active: !!savedCampaign.active,
              is_archived: !!savedCampaign.isArchived,
              max_daily: savedCampaign.maxDaily ? parseFloat(savedCampaign.maxDaily) : 0,
              pricing_model: savedCampaign.pricingModel || '',
              schedule_end_time: savedCampaign.scheduleEndTime || ''
            } as Campaign;
          }
        }
        
        // If no saved campaign found, throw error
        throw new Error(`All API endpoints failed and campaign ${id} not found in database. Last error: ${lastError}`);
      }

      return campaign as Campaign;
    } catch (error) {
      console.error(`Error getting TrafficStar campaign ${id}:`, error);
      throw new Error(`Failed to get campaign ${id} from TrafficStar API`);
    }
  }

  /**
   * Pause a campaign - SIMPLIFIED IMPLEMENTATION
   */
  async pauseCampaign(id: number): Promise<void> {
    try {
      console.log(`USING V2 API: Pausing campaign ${id}...`);
      
      // Update our local record FIRST for instant UI feedback
      await db.update(trafficstarCampaigns)
        .set({ 
          active: false, 
          status: 'paused',
          updatedAt: new Date(),
          lastRequestedAction: 'pause',
          lastRequestedActionAt: new Date() 
        })
        .where(eq(trafficstarCampaigns.trafficstarId, id.toString()));
      
      // Make a direct API call using the CORRECT v2 endpoint from documentation
      try {
        // Get token
        const token = await this.ensureToken();
        console.log(`Making V2 API call to pause campaign ${id}`);
        
        // Using the documented V2 endpoint for pausing multiple campaigns
        const response = await axios.put(
          `https://api.trafficstars.com/v2/campaigns/pause`, 
          { 
            campaign_ids: [id]
          },
          {
            headers: {
              'Authorization': `Bearer ${token}`,
              'Content-Type': 'application/json'
            },
            timeout: 10000
          }
        );
        
        console.log(`✅ V2 Campaign pause API call made. Response:`, response.data);
          
        // Check if pause was successful
        if (response.data && response.data.success && response.data.success.includes(id)) {
          console.log(`Campaign ${id} paused successfully via V2 API`);
          
          // Update database with success status
          await db.update(trafficstarCampaigns)
            .set({ 
              lastRequestedActionSuccess: true,
              updatedAt: new Date() 
            })
            .where(eq(trafficstarCampaigns.trafficstarId, id.toString()));
        } else {
          // Campaign pause failed according to API response
          console.error(`⚠️ Campaign ${id} pause failed according to API response`);
          
          // Record error in database
          await db.update(trafficstarCampaigns)
            .set({ 
              lastRequestedActionSuccess: false,
              lastVerifiedStatus: 'error',
              updatedAt: new Date() 
            })
            .where(eq(trafficstarCampaigns.trafficstarId, id.toString()));
        }
      } catch (error) {
        console.error(`⚠️ Error pausing campaign ${id}:`, error);
        
        // Record error in database
        await db.update(trafficstarCampaigns)
          .set({ 
            lastRequestedActionSuccess: false,
            lastRequestedActionError: error.message || 'Unknown error',
            updatedAt: new Date() 
          })
          .where(eq(trafficstarCampaigns.trafficstarId, id.toString()));
      }
      
      // Verify status - simple check only, without affecting user experience
      try {
        // Wait 2 seconds for API to process
        await new Promise(resolve => setTimeout(resolve, 2000));
        
        // Check if it worked
        const updatedCampaign = await this.getCampaign(id);
        
        console.log(`Campaign ${id} status after pause attempt: ${JSON.stringify({
          name: updatedCampaign.name,
          active: updatedCampaign.active,
          status: updatedCampaign.status
        })}`);
      } catch (verifyError) {
        console.log(`Unable to verify pause status: ${verifyError}`);
      }
      
    } catch (error) {
      console.error(`Error pausing TrafficStar campaign ${id}:`, error);
      throw new Error(`Failed to pause campaign ${id}`);
    }
  }

  /**
   * Activate a campaign - SIMPLIFIED IMPLEMENTATION
   */
  async activateCampaign(id: number): Promise<void> {
    try {
      console.log(`USING V2 API: Activating campaign ${id}...`);
      
      // Set end date to current UTC date at 23:59:00 (with seconds for API)
      const now = new Date();
      const currentDate = now.toISOString().split('T')[0]; // YYYY-MM-DD
      const endTimeFormatted = `${currentDate} 23:59:00`; // YYYY-MM-DD 23:59:00 with seconds
      
      console.log(`Setting campaign ${id} end time to end of current UTC day: ${endTimeFormatted}`);
      
      // Update our local record FIRST for instant UI feedback
      await db.update(trafficstarCampaigns)
        .set({ 
          active: true, 
          status: 'enabled',
          scheduleEndTime: endTimeFormatted,
          updatedAt: new Date(),
          lastRequestedAction: 'activate',
          lastRequestedActionAt: new Date() 
        })
        .where(eq(trafficstarCampaigns.trafficstarId, id.toString()));
      
      // Make a direct API call using the CORRECT v2 endpoint from documentation
      try {
        // Get token
        const token = await this.ensureToken();
        console.log(`Making V2 API call to activate campaign ${id}`);
        
        // Using the documented V2 endpoint for activating multiple campaigns
        const response = await axios.put(
          `https://api.trafficstars.com/v2/campaigns/run`, 
          { 
            campaign_ids: [id]
          },
          {
            headers: {
              'Authorization': `Bearer ${token}`,
              'Content-Type': 'application/json'
            },
            timeout: 10000
          }
        );
        
        console.log(`✅ V2 Campaign activation API call made. Response:`, response.data);
          
        // Check if activation was successful
        if (response.data && response.data.success && response.data.success.includes(id)) {
          console.log(`Campaign ${id} activated successfully via V2 API`);
          
          // Now set the end time
          try {
            // Set end time to end of current day in TrafficStar
            await this.updateCampaignEndTime(id, endTimeFormatted);
            console.log(`✅ Set end time to ${endTimeFormatted} for activated campaign ${id}`);
            
            // Update database with success status
            await db.update(trafficstarCampaigns)
              .set({ 
                scheduleEndTime: endTimeFormatted,
                lastRequestedActionSuccess: true,
                updatedAt: new Date() 
              })
              .where(eq(trafficstarCampaigns.trafficstarId, id.toString()));
          } catch (endTimeError) {
            console.error(`⚠️ Error setting end time for campaign ${id}:`, endTimeError);
          }
        } else {
          // Campaign activation failed according to API response
          console.error(`⚠️ Campaign ${id} activation failed according to API response`);
          
          // Record error in database
          await db.update(trafficstarCampaigns)
            .set({ 
              lastRequestedActionSuccess: false,
              lastVerifiedStatus: 'error',
              updatedAt: new Date() 
            })
            .where(eq(trafficstarCampaigns.trafficstarId, id.toString()));
        }
      } catch (error) {
        console.error(`⚠️ Error activating campaign ${id}:`, error);
        
        // Record error in database
        await db.update(trafficstarCampaigns)
          .set({ 
            lastRequestedActionSuccess: false,
            lastRequestedActionError: error.message || 'Unknown error',
            updatedAt: new Date() 
          })
          .where(eq(trafficstarCampaigns.trafficstarId, id.toString()));
      }
      
      // Verify status - simple check only, without affecting user experience
      try {
        // Wait 2 seconds for API to process
        await new Promise(resolve => setTimeout(resolve, 2000));
        
        // Check if it worked
        const updatedCampaign = await this.getCampaign(id);
        
        console.log(`Campaign ${id} status after activation attempt: ${JSON.stringify({
          name: updatedCampaign.name,
          active: updatedCampaign.active,
          status: updatedCampaign.status,
          schedule_end_time: updatedCampaign.schedule_end_time
        })}`);
      } catch (verifyError) {
        console.log(`Unable to verify activation status: ${verifyError}`);
      }
      
    } catch (error) {
      console.error(`Error activating TrafficStar campaign ${id}:`, error);
      throw new Error(`Failed to activate campaign ${id}`);
    }
  }

  /**
   * Update a campaign's daily budget
   */
  async updateCampaignDailyBudget(id: number, maxDaily: number): Promise<void> {
    try {
      // If mock mode is enabled, try all endpoints but fall back to local update
      if (ENABLE_MOCK_MODE) {
        try {
          const token = await this.ensureToken();
          let success = false;
          let lastError = null;
          
          // Use the v1.1 API endpoint directly for budget updates
          // We know this endpoint works based on previous testing
          try {
            console.log(`Updating budget for campaign ${id} using direct v1.1 API endpoint`);
            await axios.patch(`https://api.trafficstars.com/v1.1/campaigns/${id}`, {
              max_daily: maxDaily
            }, {
              headers: {
                'Authorization': `Bearer ${token}`,
                'Content-Type': 'application/json'
              },
              timeout: 10000 // 10 second timeout
            });
            console.log(`Successfully updated budget for campaign ${id} to $${maxDaily} using v1.1 PATCH endpoint`);
            success = true;
          } catch (error) {
            console.log(`Failed to update budget for campaign ${id} using v1.1 endpoint: ${error.message}`);
            lastError = error;
            
            // If the direct approach fails, try a few other formats just in case
            for (const baseUrl of ['https://api.trafficstars.com/v1.1', 'https://api.trafficstars.com/v1']) {
              try {
                console.log(`Trying alternate endpoint: ${baseUrl}/campaigns/${id}`);
                await axios.patch(`${baseUrl}/campaigns/${id}`, {
                  max_daily: maxDaily
                }, {
                  headers: {
                    'Authorization': `Bearer ${token}`,
                    'Content-Type': 'application/json'
                  },
                  timeout: 5000 // 5 second timeout
                });
                console.log(`Successfully updated budget for campaign ${id} to $${maxDaily} using ${baseUrl}`);
                success = true;
                break;
              } catch (altError) {
                console.log(`Failed with alternate endpoint ${baseUrl}: ${altError.message}`);
                // Continue to next attempt
              }
            }
          }
          
          if (!success) {
            // If API calls failed but mock mode is enabled, continue with local update
            console.log(`API calls failed but mock mode is enabled. Proceeding with local update only.`);
            
            // In mock mode, just update the local database
            const [campaign] = await db
              .select()
              .from(trafficstarCampaigns)
              .where(eq(trafficstarCampaigns.trafficstarId, id.toString()));
            
            if (!campaign) {
              // Create a new campaign record if it doesn't exist
              await db.insert(trafficstarCampaigns).values({
                trafficstarId: id.toString(),
                name: `Campaign ${id}`,
                maxDaily: maxDaily.toString(),
                createdAt: new Date(),
                updatedAt: new Date()
              });
              console.log(`Created new campaign record for ID ${id} with budget ${maxDaily} in mock mode`);
              return;
            } else {
              // Update existing campaign record
              await db.update(trafficstarCampaigns)
                .set({ 
                  maxDaily: maxDaily.toString(),
                  updatedAt: new Date() 
                })
                .where(eq(trafficstarCampaigns.trafficstarId, id.toString()));
              console.log(`Updated campaign ${id} budget to ${maxDaily} in mock mode`);
              return;
            }
          }
        } catch (error) {
          // If any error occurs during API call attempt and mock mode is enabled,
          // proceed with local update only
          console.log(`Error during API calls but mock mode is enabled. Proceeding with local update only.`);
          
          // Update local record in database
          const [campaign] = await db
            .select()
            .from(trafficstarCampaigns)
            .where(eq(trafficstarCampaigns.trafficstarId, id.toString()));
          
          if (!campaign) {
            // Create a new campaign record if it doesn't exist
            await db.insert(trafficstarCampaigns).values({
              trafficstarId: id.toString(),
              name: `Campaign ${id}`,
              maxDaily: maxDaily.toString(),
              createdAt: new Date(),
              updatedAt: new Date()
            });
            console.log(`Created new campaign record for ID ${id} with budget ${maxDaily} in mock mode`);
            return;
          } else {
            // Update existing campaign record
            await db.update(trafficstarCampaigns)
              .set({ 
                maxDaily: maxDaily.toString(),
                updatedAt: new Date() 
              })
              .where(eq(trafficstarCampaigns.trafficstarId, id.toString()));
            console.log(`Updated campaign ${id} budget to ${maxDaily} in mock mode`);
            return;
          }
        }
      } else {
        // If mock mode is disabled, use the v1.1 API directly
        const token = await this.ensureToken();
        
        try {
          console.log(`Updating campaign ${id} budget to $${maxDaily} using v1.1 API (real mode)`);
          await axios.patch(`https://api.trafficstars.com/v1.1/campaigns/${id}`, {
            max_daily: maxDaily
          }, {
            headers: {
              'Authorization': `Bearer ${token}`,
              'Content-Type': 'application/json'
            },
            timeout: 30000 // 30 second timeout
          });
          console.log(`Successfully updated campaign ${id} budget to $${maxDaily} using v1.1 API (real mode)`);
        } catch (error) {
          console.error(`Failed to update campaign ${id} budget: ${error.message}`);
          throw error;
        }
      }

      // Update local record if we got here (real API was successful)
      await db.update(trafficstarCampaigns)
        .set({ 
          maxDaily: maxDaily.toString(),
          updatedAt: new Date() 
        })
        .where(eq(trafficstarCampaigns.trafficstarId, id.toString()));
    } catch (error) {
      console.error(`Error updating TrafficStar campaign ${id} budget:`, error);
      throw new Error(`Failed to update campaign ${id} budget`);
    }
  }

  /**
   * Activate multiple campaigns at once
   * @param campaignIds Array of TrafficStar campaign IDs to activate
   * @returns Object with success and failed campaign IDs
   */
  async activateMultipleCampaigns(campaignIds: number[]): Promise<{ success: number[], failed: number[] }> {
    try {
      console.log(`USING V2 API: Activating multiple campaigns: ${campaignIds.join(', ')}...`);
      
      // Set end date to current UTC date at 23:59:00 (with seconds for API)
      const now = new Date();
      const currentDate = now.toISOString().split('T')[0]; // YYYY-MM-DD
      const endTimeFormatted = `${currentDate} 23:59:00`; // YYYY-MM-DD 23:59:00 with seconds
      
      console.log(`Setting campaigns end time to end of current UTC day: ${endTimeFormatted}`);
      
      // Update local records FIRST for instant UI feedback
      for (const id of campaignIds) {
        await db.update(trafficstarCampaigns)
          .set({ 
            active: true, 
            status: 'active',
            scheduleEndTime: endTimeFormatted,
            updatedAt: new Date(),
            lastRequestedAction: 'activate',
            lastRequestedActionAt: new Date() 
          })
          .where(eq(trafficstarCampaigns.trafficstarId, id.toString()));
      }
      
      // Make the batch API call
      const token = await this.ensureToken();
      const response = await axios.put(
        `https://api.trafficstars.com/v2/campaigns/run`, 
        { 
          campaign_ids: campaignIds
        },
        {
          headers: {
            'Authorization': `Bearer ${token}`,
            'Content-Type': 'application/json'
          },
          timeout: 10000
        }
      );
      
      console.log(`✅ V2 Multiple campaign activation API call made. Response:`, response.data);
      
      // Track successful and failed activations
      const successful: number[] = [];
      const failed: number[] = [];
      
      // Check if activation was successful
      if (response.data && response.data.success) {
        successful.push(...response.data.success);
        
        // Set end time for all successfully activated campaigns
        for (const id of response.data.success) {
          try {
            // Set end time to end of current day in TrafficStar
            await this.updateCampaignEndTime(id, endTimeFormatted);
            console.log(`✅ Set end time to ${endTimeFormatted} for activated campaign ${id}`);
            
            // Update database with success status
            await db.update(trafficstarCampaigns)
              .set({ 
                scheduleEndTime: endTimeFormatted,
                lastRequestedActionSuccess: true,
                updatedAt: new Date() 
              })
              .where(eq(trafficstarCampaigns.trafficstarId, id.toString()));
          } catch (endTimeError) {
            console.error(`Error setting end time for campaign ${id}:`, endTimeError);
          }
        }
      }
      
      // Process any failures
      if (response.data && response.data.fail) {
        failed.push(...response.data.fail);
        
        // Update database for failed activation attempts
        for (const id of response.data.fail) {
          await db.update(trafficstarCampaigns)
            .set({ 
              active: false, // Reset to inactive since it failed
              lastRequestedActionSuccess: false,
              updatedAt: new Date() 
            })
            .where(eq(trafficstarCampaigns.trafficstarId, id.toString()));
        }
      }
      
      return {
        success: successful,
        failed: failed
      };
    } catch (error) {
      console.error(`Error activating multiple TrafficStar campaigns:`, error);
      throw new Error('Failed to activate multiple campaigns');
    }
  }

  /**
   * Update a campaign's end time
   */
  async updateCampaignEndTime(id: number, scheduleEndTime: string): Promise<void> {
    try {
      const token = await this.ensureToken();
      
      // If we're getting a date string in DD/MM/YYYY format from our code,
      // we need to convert it to YYYY-MM-DD format for the API
      let formattedEndTime = scheduleEndTime;
      
      if (scheduleEndTime.includes('/')) {
        // Input format: DD/MM/YYYY HH:MM:SS
        const parts = scheduleEndTime.split(' ');
        if (parts.length === 2) {
          const dateParts = parts[0].split('/');
          if (dateParts.length === 3) {
            // Convert DD/MM/YYYY to YYYY-MM-DD
            formattedEndTime = `${dateParts[2]}-${dateParts[1]}-${dateParts[0]} ${parts[1]}`;
          }
        }
      } else if (scheduleEndTime.includes('T')) {
        // Handle ISO format if present
        formattedEndTime = scheduleEndTime.replace('T', ' ').replace(/\.\d+Z$/, '');
      }
      
      // Make sure we have the correct time format with seconds (HH:MM:SS)
      // TrafficStar API requires YYYY-MM-DD HH:MM:SS format
      if (formattedEndTime.includes(' ')) {
        const parts = formattedEndTime.split(' ');
        if (parts.length === 2) {
          const timePart = parts[1];
          // Count the number of colons to determine if we need to add seconds
          const colonCount = (timePart.match(/:/g) || []).length;
          
          if (colonCount === 1) {
            // Time is in HH:MM format, add :00 for seconds
            formattedEndTime = `${parts[0]} ${timePart}:00`;
          }
        }
      }
      
      console.log(`Setting campaign ${id} end time to: ${formattedEndTime} (original input: ${scheduleEndTime})`);
      
      try {
        // Use the v1.1 API endpoint directly
        const response = await axios.patch(`https://api.trafficstars.com/v1.1/campaigns/${id}`, {
          schedule_end_time: formattedEndTime
        }, {
          headers: {
            'Authorization': `Bearer ${token}`,
            'Content-Type': 'application/json'
          },
          timeout: 30000 // 30 second timeout
        });
        
        console.log(`Successfully updated campaign ${id} end time to ${formattedEndTime}`);
        console.log(`API Response:`, response.data);

        // Update local record
        await db.update(trafficstarCampaigns)
          .set({ scheduleEndTime, updatedAt: new Date() })
          .where(eq(trafficstarCampaigns.trafficstarId, id.toString()));
          
        return;
      } catch (error: any) {
        console.error(`Error from TrafficStar API when updating end time:`, error.response?.data);
        
        // If the error is related to date format, try another format
        if (error.response?.data?.msg?.includes('parsing time')) {
          try {
            // Try with full HH:MM:SS format if not already using it
            if (!formattedEndTime.match(/\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}/)) {
              const datePart = formattedEndTime.split(' ')[0];
              let timePart = formattedEndTime.split(' ')[1] || '00:00';
              
              // Ensure time has seconds
              if ((timePart.match(/:/g) || []).length === 1) {
                timePart = `${timePart}:00`;
              }
              
              const fullFormat = `${datePart} ${timePart}`;
              console.log(`Retrying with full time format: ${fullFormat}`);
              
              await axios.patch(`https://api.trafficstars.com/v1.1/campaigns/${id}`, {
                schedule_end_time: fullFormat
              }, {
                headers: {
                  'Authorization': `Bearer ${token}`,
                  'Content-Type': 'application/json'
                },
                timeout: 30000
              });
              
              console.log(`Successfully updated campaign ${id} end time to ${fullFormat}`);
              
              // Update local record
              await db.update(trafficstarCampaigns)
                .set({ scheduleEndTime: fullFormat, updatedAt: new Date() })
                .where(eq(trafficstarCampaigns.trafficstarId, id.toString()));
                
              return;
            }
          } catch (retryError: any) {
            console.error(`Retry with full format failed:`, retryError.response?.data || retryError.message);
          }
          
          // As a last resort, try date-only format
          const dateOnly = formattedEndTime.split(' ')[0];
          console.log(`Retrying with date-only format: ${dateOnly}`);
          
          try {
            await axios.patch(`https://api.trafficstars.com/v1.1/campaigns/${id}`, {
              schedule_end_time: dateOnly
            }, {
              headers: {
                'Authorization': `Bearer ${token}`,
                'Content-Type': 'application/json'
              },
              timeout: 30000
            });
            
            console.log(`Successfully updated campaign ${id} end time to ${dateOnly} (date-only format)`);
            
            // Update local record
            await db.update(trafficstarCampaigns)
              .set({ scheduleEndTime: dateOnly, updatedAt: new Date() })
              .where(eq(trafficstarCampaigns.trafficstarId, id.toString()));
              
            return;
          } catch (dateOnlyError: any) {
            console.error(`All format attempts failed:`, dateOnlyError.response?.data || dateOnlyError.message);
          }
        }
        
        throw error;
      }
    } catch (error: any) {
      console.error(`Error updating TrafficStar campaign ${id} end time:`, error.message);
      throw new Error(`Failed to update campaign ${id} end time`);
    }
  }

  /**
   * Save API key
   */
  async saveApiKey(apiKey: string): Promise<boolean> {
    try {
      // Try to get a token with this key to validate it
      const response = await axios.post<TokenResponse>(
        `${API_BASE_URL}/auth/token`,
        new URLSearchParams({
          grant_type: 'refresh_token',
          refresh_token: apiKey,
        }),
        {
          headers: {
            'Content-Type': 'application/x-www-form-urlencoded',
          },
        }
      );

      // Calculate token expiry (subtract 60 seconds for safety)
      const expiryDate = new Date();
      expiryDate.setSeconds(expiryDate.getSeconds() + response.data.expires_in - 60);

      // Check if we already have credentials
      const [existingCredential] = await db.select().from(trafficstarCredentials).limit(1);

      if (existingCredential) {
        // Update existing record
        await db.update(trafficstarCredentials)
          .set({
            apiKey,
            accessToken: response.data.access_token,
            tokenExpiry: expiryDate,
            updatedAt: new Date(),
          })
          .where(eq(trafficstarCredentials.id, existingCredential.id));
      } else {
        // Create new record
        await db.insert(trafficstarCredentials)
          .values({
            apiKey,
            accessToken: response.data.access_token,
            tokenExpiry: expiryDate,
          });
      }

      // Update in-memory token
      this.accessToken = response.data.access_token;
      this.tokenExpiry = expiryDate;

      return true;
    } catch (error) {
      console.error('Error saving TrafficStar API key:', error);
      throw new Error('Invalid TrafficStar API key');
    }
  }

  /**
   * Sync campaigns from API to database
   */
  private async syncCampaignsToDatabase(campaigns: Campaign[]): Promise<void> {
    try {
      // For each campaign from the API
      for (const campaign of campaigns) {
        // Check if it exists in our database
        const [existingCampaign] = await db
          .select()
          .from(trafficstarCampaigns)
          .where(eq(trafficstarCampaigns.trafficstarId, campaign.id.toString()));

        if (existingCampaign) {
          // Update existing campaign
          await db.update(trafficstarCampaigns)
            .set({
              name: campaign.name,
              status: campaign.status,
              active: campaign.active,
              isArchived: campaign.is_archived,
              maxDaily: campaign.max_daily ? campaign.max_daily.toString() : null,
              pricingModel: campaign.pricing_model,
              scheduleEndTime: campaign.schedule_end_time,
              campaignData: campaign,
              updatedAt: new Date(),
            })
            .where(eq(trafficstarCampaigns.id, existingCampaign.id));
        } else {
          // Insert new campaign
          await db.insert(trafficstarCampaigns)
            .values({
              trafficstarId: campaign.id.toString(),
              name: campaign.name,
              status: campaign.status,
              active: campaign.active,
              isArchived: campaign.is_archived,
              maxDaily: campaign.max_daily ? campaign.max_daily.toString() : null,
              pricingModel: campaign.pricing_model,
              scheduleEndTime: campaign.schedule_end_time,
              campaignData: campaign,
            });
        }
      }
    } catch (error) {
      console.error('Error syncing campaigns to database:', error);
      // Continue operation rather than failing completely
    }
  }

  /**
   * Auto-manage TrafficStar campaigns based on application parameters
   * Implementation of the requirement to automatically manage linked TrafficStar campaigns
   */
  async autoManageCampaigns(): Promise<void> {
    try {
      // Find all campaigns with auto-management enabled
      const campaignsToManage = await db
        .select()
        .from(campaigns)
        .where(
          sql`${campaigns.autoManageTrafficstar} = true AND ${campaigns.trafficstarCampaignId} IS NOT NULL`
        );
      
      if (campaignsToManage.length === 0) {
        console.log('No campaigns with auto-management enabled found');
        return; // No campaigns to auto-manage
      }
      
      console.log(`Found ${campaignsToManage.length} campaigns with auto-management enabled`);
      
      for (const campaign of campaignsToManage) {
        try {
          await this.autoManageCampaign(campaign);
        } catch (error) {
          console.error(`Error auto-managing campaign ${campaign.id}:`, error);
        }
      }
    } catch (error) {
      console.error('Error in autoManageCampaigns:', error);
    }
  }
  
  /**
   * Auto-manage a single campaign based on its settings
   */
  private async autoManageCampaign(campaign: any): Promise<void> {
    try {
      // Skip if no TrafficStar campaign ID
      if (!campaign.trafficstarCampaignId) {
        console.log(`Campaign ${campaign.id} has no TrafficStar campaign ID, skipping auto-management`);
        return;
      }
      
      // Get the campaign's URLs to calculate remaining clicks
      const urlsResult = await storage.getUrls(campaign.id);
      const urls = urlsResult.filter(url => url.isActive);
      
      // Get current date in UTC to check if it's a new day
      const currentUtcDate = new Date().toISOString().split('T')[0];
      const lastSyncDate = campaign.lastTrafficstarSync ? 
        new Date(campaign.lastTrafficstarSync).toISOString().split('T')[0] : null;
      
      // Get current time in UTC to check if it's time for budget update
      const now = new Date();
      const currentUtcTime = now.getUTCHours().toString().padStart(2, '0') + ':' + 
                           now.getUTCMinutes().toString().padStart(2, '0') + ':' + 
                           now.getUTCSeconds().toString().padStart(2, '0');
      
      // Format current date for end time (YYYY-MM-DD format that TrafficStar requires)
      // TrafficStar API requires YYYY-MM-DD HH:MM:SS format with seconds
      const formattedCurrentDateTime = `${currentUtcDate} ${currentUtcTime}`;
      
      // Get the campaign's budget update time setting (default to midnight if not set)
      const budgetUpdateTime = campaign.budgetUpdateTime || '00:00:00';
      
      // Get the last update time
      const lastUpdateTime = campaign.lastTrafficstarSync ? 
        new Date(campaign.lastTrafficstarSync).getUTCHours().toString().padStart(2, '0') + ':' + 
        new Date(campaign.lastTrafficstarSync).getUTCMinutes().toString().padStart(2, '0') + ':' + 
        new Date(campaign.lastTrafficstarSync).getUTCSeconds().toString().padStart(2, '0') : null;
      
      // Check if we have no active URLs - NEW FEATURE
      if (urls.length === 0) {
        console.log(`⚠️ Campaign ${campaign.id} has NO active URLs - pausing TrafficStar campaign and setting end date to current time (${formattedCurrentDateTime})`);
        
        try {
          // Get TrafficStar campaign ID
          const trafficstarId = isNaN(Number(campaign.trafficstarCampaignId)) ? 
            parseInt(campaign.trafficstarCampaignId.replace(/\D/g, '')) : 
            Number(campaign.trafficstarCampaignId);
            
          // Pause the campaign
          await this.pauseCampaign(trafficstarId);
          
          // Set end time to current UTC time
          await this.updateCampaignEndTime(trafficstarId, formattedCurrentDateTime);
          
          // Update campaign's last sync timestamp
          await db.update(campaigns)
            .set({
              lastTrafficstarSync: new Date(),
              updatedAt: new Date()
            })
            .where(eq(campaigns.id, campaign.id));
            
          console.log(`✅ TrafficStar campaign ${trafficstarId} paused and end date set to ${formattedCurrentDateTime}`);
          return; // No need to continue with regular auto-management if campaign paused
        } catch (error) {
          console.error(`Error pausing campaign with no active URLs:`, error);
        }
      }
      
      // Calculate remaining clicks across all active URLs
      const totalRemainingClicks = urls.reduce((total, url) => {
        const remainingClicks = url.clickLimit - url.clicks;
        return total + (remainingClicks > 0 ? remainingClicks : 0);
      }, 0);
      
      console.log(`Campaign ${campaign.id} has ${totalRemainingClicks} total remaining clicks`);
      console.log(`Campaign ${campaign.id} - Current UTC time: ${currentUtcTime}, Budget update time: ${budgetUpdateTime}, Last sync time: ${lastUpdateTime || 'never'}`);
      
      // Get the previously used budget update time from database
      const [campaignSettings] = await db
        .select({ lastBudgetUpdateTime: campaigns.budgetUpdateTime })
        .from(campaigns)
        .where(eq(campaigns.id, campaign.id));
      
      // Check if budget update time has been changed since last sync
      const budgetUpdateTimeChanged = campaign.lastTrafficstarSync && 
        campaignSettings?.lastBudgetUpdateTime !== budgetUpdateTime;
      
      if (budgetUpdateTimeChanged) {
        console.log(`Budget update time changed from ${campaignSettings?.lastBudgetUpdateTime} to ${budgetUpdateTime} - triggering immediate update`);
      }
      
      // Determine if budget update should happen:
      // 1. If this is first time (no lastSyncDate) OR
      // 2. If date has changed since last update OR
      // 3. If we're within 5 minutes after the configured budget update time and haven't updated today OR
      // 4. If the budgetUpdateTime setting has changed (immediate effect)
      const isTimeForBudgetUpdate = !lastSyncDate || 
        currentUtcDate !== lastSyncDate || 
        budgetUpdateTimeChanged ||
        (this.isWithinTimeWindow(currentUtcTime, budgetUpdateTime, 5) && 
         (!lastUpdateTime || !this.isWithinTimeWindow(lastUpdateTime, budgetUpdateTime, 5)));
      
      if (isTimeForBudgetUpdate) {
        console.log(`Setting daily budget for campaign ${campaign.id} to $10.15 (UTC time: ${currentUtcTime}, configured time: ${budgetUpdateTime})`);
        
        // Set daily budget to $10.15 as per requirements
        try {
          await this.updateCampaignDailyBudget(
            isNaN(Number(campaign.trafficstarCampaignId)) ? 
              parseInt(campaign.trafficstarCampaignId.replace(/\D/g, '')) : 
              Number(campaign.trafficstarCampaignId), 
            10.15
          );
          
          // Update last sync time in the database
          await db.update(campaigns)
            .set({
              lastTrafficstarSync: new Date(),
              updatedAt: new Date()
            })
            .where(eq(campaigns.id, campaign.id));
          
          console.log(`Successfully updated daily budget for campaign ${campaign.id}`);
        } catch (error) {
          console.error(`Error updating daily budget for campaign ${campaign.id}:`, error);
        }
      }
      
      // Check if we need to activate the campaign (remaining clicks > 15,000)
      if (totalRemainingClicks > 15000) {
        console.log(`Activating TrafficStar campaign for campaign ${campaign.id} (${totalRemainingClicks} remaining clicks > 15,000)`);
        
        try {
          // Activate the campaign
          await this.activateCampaign(
            isNaN(Number(campaign.trafficstarCampaignId)) ? 
              parseInt(campaign.trafficstarCampaignId.replace(/\D/g, '')) : 
              Number(campaign.trafficstarCampaignId)
          );
          console.log(`Successfully activated TrafficStar campaign for campaign ${campaign.id}`);
        } catch (error) {
          console.error(`Error activating TrafficStar campaign for campaign ${campaign.id}:`, error);
        }
      } else {
        console.log(`Campaign ${campaign.id} has only ${totalRemainingClicks} remaining clicks, which is less than 15,000 threshold`);
      }
    } catch (error) {
      console.error(`Error auto-managing campaign ${campaign.id}:`, error);
    }
  }
  
  /**
   * Scheduled function to run daily budget updates and start campaigns as needed
   * This should be called on application startup and at appropriate intervals
   */
  async scheduleAutoManagement(): Promise<void> {
    try {
      // Run initial auto-management
      await this.autoManageCampaigns();
      
      // Schedule to run every minute for immediate effect
      setInterval(async () => {
        try {
          console.log('Running scheduled auto-management for TrafficStar campaigns');
          await this.autoManageCampaigns();
        } catch (error) {
          console.error('Error in scheduled auto-management:', error);
        }
      }, 60 * 1000); // Every minute
      
      console.log('TrafficStar auto-management scheduler initialized');
    } catch (error) {
      console.error('Error scheduling auto-management:', error);
    }
  }

  /**
   * Get saved campaigns from database
   */
  async getSavedCampaigns() {
    return db.select().from(trafficstarCampaigns).orderBy(trafficstarCampaigns.name);
  }
  
  /**
   * Check if API key is set (either in environment variables or database)
   */
  async isConfigured(): Promise<boolean> {
    // Check environment variable first
    if (process.env.TRAFFICSTAR_API_KEY) {
      return true;
    }
    
    // Fallback to database check
    const [credential] = await db.select().from(trafficstarCredentials).limit(1);
    return !!credential;
  }
  
  /**
   * Get campaign daily spending from TrafficStar API for the current UTC date
   * @param id The TrafficStar campaign ID
   * @returns An object with the campaign spending data { id: number, daily: number, date: string }
   */
  async getCampaignSpending(id: number): Promise<{ id: number, daily: number, date: string, maxDaily: number }> {
    try {
      const token = await this.ensureToken();
      
      // Get current date in YYYY-MM-DD format for UTC
      const now = new Date();
      const todayUtc = now.toISOString().split('T')[0];
      
      // First try the finance/stats endpoint which includes daily spending by campaign
      try {
        console.log(`Trying to get campaign ${id} daily spending using finance/stats endpoint`);
        
        const financeStatsResponse = await axios.get(`https://api.trafficstars.com/v1.1/advertiser/finance/stats`, {
          headers: {
            'Authorization': `Bearer ${token}`,
            'Content-Type': 'application/json'
          },
          params: {
            campaign_id: id,
            date_from: todayUtc,
            date_to: todayUtc,
            group_by: 'day'
          },
          timeout: 20000 // 20 second timeout for potentially slow API
        });
        
        console.log(`Finance stats response for campaign ${id}:`, JSON.stringify(financeStatsResponse.data).substring(0, 300));
        
        // Process finance stats data which should include spending
        if (financeStatsResponse.data && (Array.isArray(financeStatsResponse.data) || financeStatsResponse.data.data)) {
          const statsData = Array.isArray(financeStatsResponse.data) 
            ? financeStatsResponse.data 
            : financeStatsResponse.data.data;
          
          let daily = 0;
          
          if (Array.isArray(statsData) && statsData.length > 0) {
            // Find today's data or use the first entry
            const todayData = statsData.find((item: any) => 
              item.day === todayUtc || item.date === todayUtc
            ) || statsData[0];
            
            daily = parseFloat(
              todayData.amount || 
              todayData.spent || 
              todayData.cost || 
              todayData.total || 
              '0'
            );
          }
          
          // Get max_daily budget from campaign details for complete data
          let maxDaily = 0;
          try {
            const campaignResponse = await axios.get(`https://api.trafficstars.com/v1.1/campaigns/${id}`, {
              headers: {
                'Authorization': `Bearer ${token}`,
                'Content-Type': 'application/json'
              },
              timeout: 10000
            });
            
            if (campaignResponse.data && campaignResponse.data.max_daily) {
              maxDaily = parseFloat(campaignResponse.data.max_daily.toString());
            }
          } catch (campaignError) {
            console.error(`Failed to get max daily budget for campaign ${id}:`, campaignError);
          }
          
          return {
            id,
            daily,
            date: todayUtc,
            maxDaily
          };
        }
      } catch (financeError) {
        console.error(`Finance stats endpoint failed for campaign ${id}:`, financeError);
      }
      
      // Second, try the advertiser/statistics endpoint
      try {
        console.log(`Trying to get campaign ${id} daily spending using statistics endpoint`);
        
        // Format for this API is slightly different
        const statsResponse = await axios.get(`https://api.trafficstars.com/v1.1/advertiser/statistics`, {
          headers: {
            'Authorization': `Bearer ${token}`,
            'Content-Type': 'application/json'
          },
          params: {
            campaign_id: id,
            date_from: todayUtc,
            date_to: todayUtc,
            group_by: 'day'
          },
          timeout: 20000 // 20 second timeout for potentially slow API
        });
        
        console.log(`Statistics response for campaign ${id}:`, JSON.stringify(statsResponse.data).substring(0, 300));
        
        // Check if we have any data in the response
        if (statsResponse.data && (Array.isArray(statsResponse.data) || statsResponse.data.data)) {
          // Extract today's spending data
          const spendingData = Array.isArray(statsResponse.data) 
            ? statsResponse.data 
            : statsResponse.data.data;
            
          console.log(`Successfully fetched statistics for campaign ${id}:`, spendingData);
          
          // Process spending data
          let daily = 0;
          if (Array.isArray(spendingData) && spendingData.length > 0) {
            const todayData = spendingData.find((item: any) => 
              item.day === todayUtc || item.date === todayUtc
            ) || spendingData[0];
            
            daily = parseFloat(
              todayData.amount || 
              todayData.spent || 
              todayData.cost || 
              todayData.total || 
              '0'
            );
          } else if (typeof spendingData === 'object') {
            // Sometimes API returns object with date keys
            daily = parseFloat(
              spendingData[todayUtc]?.amount || 
              spendingData[todayUtc]?.spent || 
              spendingData[todayUtc]?.cost || 
              '0'
            );
          }
          
          // Get max_daily budget from campaign details separately
          let maxDaily = 0;
          try {
            const campaignResponse = await axios.get(`https://api.trafficstars.com/v1.1/campaigns/${id}`, {
              headers: {
                'Authorization': `Bearer ${token}`,
                'Content-Type': 'application/json'
              },
              timeout: 10000
            });
            
            if (campaignResponse.data && campaignResponse.data.max_daily) {
              maxDaily = parseFloat(campaignResponse.data.max_daily.toString());
            }
          } catch (campaignError) {
            console.error(`Failed to get max daily budget for campaign ${id}:`, campaignError);
          }
          
          return {
            id,
            daily,
            date: todayUtc,
            maxDaily
          };
        }
      } catch (statsError) {
        console.error(`Statistics endpoint failed for campaign ${id}:`, statsError);
      }
      
      // If custom report fails, try the V2 stats API endpoint
      try {
        console.log(`Trying to get campaign ${id} daily spending using V2 API endpoint`);
        
        const response = await axios.get(`https://api.trafficstars.com/v2/campaigns/${id}/stats`, {
          headers: {
            'Authorization': `Bearer ${token}`,
            'Content-Type': 'application/json'
          },
          params: {
            date_from: todayUtc,
            date_to: todayUtc,
            group_by: 'day',
            timezone: 0 // Ensure UTC timezone
          },
          timeout: 20000 // 20 second timeout for potentially slow API
        });
        
        // Check if we have any spending data
        if (response.data && response.data.stats && response.data.stats.length > 0) {
          const dailyStats = response.data.stats[0];
          console.log(`Successfully fetched V2 daily spending for campaign ${id}: `, dailyStats);
          
          return {
            id,
            daily: parseFloat(dailyStats.spent || '0'),
            date: todayUtc,
            maxDaily: parseFloat(dailyStats.max_daily || '0')
          };
        }
      } catch (v2ApiError) {
        console.error(`V2 API stats endpoint failed for campaign ${id}:`, v2ApiError);
      }
      
      // If V2 API fails, try to get the campaign details directly which includes the max daily budget
      // Even if we can't get actual spending, this will at least give us the budget information
      try {
        console.log(`Trying to get campaign ${id} details to extract budget information`);
        
        const campaignResponse = await axios.get(`https://api.trafficstars.com/v1.1/campaigns/${id}`, {
          headers: {
            'Authorization': `Bearer ${token}`,
            'Content-Type': 'application/json'
          },
          timeout: 10000
        });
        
        if (campaignResponse.data) {
          // Get the campaign max daily budget from the campaign details
          const maxDaily = campaignResponse.data.max_daily || 0;
          
          // Try to get actual spending with another method if available
          let daily = 0;
          
          try {
            // Try the financial API endpoint
            const financeResponse = await axios.get(`https://api.trafficstars.com/v1.1/account/financial/stats`, {
              headers: {
                'Authorization': `Bearer ${token}`,
                'Content-Type': 'application/json'
              },
              params: {
                date_from: todayUtc,
                date_to: todayUtc,
                group_by: 'campaign',
                timezone: 0 
              },
              timeout: 10000
            });
            
            // Check if we have campaign specific spending data
            if (financeResponse.data && 
                financeResponse.data.campaigns && 
                financeResponse.data.campaigns[id.toString()]) {
              daily = parseFloat(financeResponse.data.campaigns[id.toString()].spent || '0');
            }
          } catch (financeError) {
            console.error(`Failed to get financial stats for campaign ${id}:`, financeError);
          }
          
          // Return the best data we have
          return {
            id,
            daily,
            date: todayUtc,
            maxDaily: parseFloat(maxDaily.toString())
          };
        }
      } catch (campaignError) {
        console.error(`Failed to get campaign details for ${id}:`, campaignError);
      }
      
      // If all other methods fail, check the database for the stored max daily value
      // This won't have actual spending but at least will provide the budget
      try {
        console.log(`Falling back to database for campaign ${id} budget information`);
        
        const [savedCampaign] = await db
          .select()
          .from(trafficstarCampaigns)
          .where(eq(trafficstarCampaigns.trafficstarId, id.toString()));
          
        if (savedCampaign && savedCampaign.maxDaily) {
          return {
            id,
            daily: 0, // We don't have actual spending, but at least have budget
            date: todayUtc,
            maxDaily: parseFloat(savedCampaign.maxDaily)
          };
        }
      } catch (dbError) {
        console.error(`Database fallback failed for campaign ${id}:`, dbError);
      }
      
      // If all methods fail, return default values
      return {
        id,
        daily: 0,
        date: todayUtc,
        maxDaily: 0
      };
    } catch (error) {
      console.error(`Error getting campaign ${id} daily spending:`, error);
      throw new Error(`Failed to fetch daily spending for campaign ${id}: ${error instanceof Error ? error.message : String(error)}`);
    }
  }
}

// Export a singleton instance
export const trafficStarService = new TrafficStarService();
/**
 * TrafficStar API Service
 * This service handles all interactions with the TrafficStar API
 */
import axios from 'axios';
import { db } from './db';
import { trafficstarCredentials, trafficstarCampaigns, campaigns, urls } from '@shared/schema';
import { eq, sql, and, isNotNull } from 'drizzle-orm';
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
  
  // Map to track campaign IDs that have had budget adjustments
  // This prevents multiple adjustments on the same UTC date
  private budgetAdjustedCampaigns: Map<number, string> = new Map();
  
  // Map to track campaigns paused due to high spent value
  // Records when it was paused and when recheck is due (10 min later)
  private spentValuePausedCampaigns: Map<number, {
    pausedAt: Date;
    recheckAt: Date; 
    disabledThresholdForDate: string;
  }> = new Map();
  
  // Map to track pending URL budget updates by campaign ID
  // Records URL IDs, click values, and when they were received
  private pendingUrlBudgets: Map<number, Array<{
    urlId: number;
    campaignId: number;
    receivedAt: Date;
    updateAt: Date; // 10 minutes after receivedAt
    clickValue: number;
    processed: boolean;
  }>> = new Map();
  
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
   * Normalize end time format for comparison
   * This transforms different time formats into a standard form for comparison
   */
  private normalizeEndTimeFormat(timeString: string): string {
    let normalized = timeString;
    
    // Handle ISO format with T
    if (normalized.includes('T')) {
      normalized = normalized.replace('T', ' ').replace(/\.\d+Z$/, '');
    }
    
    // Handle DD/MM/YYYY format
    if (normalized.includes('/')) {
      const parts = normalized.split(' ');
      if (parts.length === 2) {
        const dateParts = parts[0].split('/');
        if (dateParts.length === 3) {
          // Convert DD/MM/YYYY to YYYY-MM-DD
          normalized = `${dateParts[2]}-${dateParts[1]}-${dateParts[0]} ${parts[1]}`;
        }
      }
    }
    
    // Ensure HH:MM:SS format (not just HH:MM)
    if (normalized.includes(' ')) {
      const parts = normalized.split(' ');
      if (parts.length === 2) {
        const timePart = parts[1];
        const colonCount = (timePart.match(/:/g) || []).length;
        
        if (colonCount === 1) {
          // Time is in HH:MM format, add :00 for seconds
          normalized = `${parts[0]} ${timePart}:00`;
        }
      }
    }
    
    return normalized;
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
      console.log(`USING V2 API: Checking campaign ${id} status before pausing...`);
      
      // Always check current status from API first
      let currentStatus = {
        active: true,
        status: 'unknown'
      };
      
      // Flag to track if API call for status check was successful
      let needsExplicitPauseCall = true;
      
      try {
        // ALWAYS make API call to get current status
        const apiCampaign = await this.getCampaign(id);
        currentStatus.active = apiCampaign.active;
        currentStatus.status = apiCampaign.status;
        
        console.log(`API status check completed - Current campaign ${id} status: active=${currentStatus.active}, status=${currentStatus.status}`);
        
        // If already paused, skip the API call since it's not needed
        if (apiCampaign.active === false || apiCampaign.status === 'paused') {
          console.log(`Note: Campaign ${id} is already paused according to TrafficStar API - skipping redundant API call`);
          needsExplicitPauseCall = false;
          
          // Save this status to database for future reference
          await db.update(trafficstarCampaigns)
            .set({ 
              active: false, 
              status: 'paused',
              lastVerifiedStatus: 'paused',
              updatedAt: new Date()
            })
            .where(eq(trafficstarCampaigns.trafficstarId, id.toString()));
        }
      } catch (statusCheckError) {
        console.log(`Error checking campaign ${id} status from API:`, statusCheckError);
      }
      
      // ALWAYS update our local record for instant UI feedback
      await db.update(trafficstarCampaigns)
        .set({ 
          active: false, 
          status: 'paused',
          updatedAt: new Date(),
          lastRequestedAction: 'pause',
          lastRequestedActionAt: new Date() 
        })
        .where(eq(trafficstarCampaigns.trafficstarId, id.toString()));
      
      // Only make API call if the campaign needs to be paused
      if (needsExplicitPauseCall) {
        try {
          // Get token
          const token = await this.ensureToken();
          
          console.log(`Making V2 API call to pause campaign ${id} (requires explicit pause)`);
          
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
                lastVerifiedStatus: 'paused',
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
        } catch (error: any) {
          console.error(`⚠️ Error pausing campaign ${id}:`, error);
          
          // Record error in database
          await db.update(trafficstarCampaigns)
            .set({ 
              lastRequestedActionSuccess: false,
              updatedAt: new Date() 
            })
            .where(eq(trafficstarCampaigns.trafficstarId, id.toString()));
        }
      } else {
        console.log(`Skipping API call - campaign ${id} is already paused`);
        
        // Update database to show success since it's already in the desired state
        await db.update(trafficstarCampaigns)
          .set({
            lastRequestedActionSuccess: true,
            lastVerifiedStatus: 'paused',
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
      console.log(`USING V2 API: Checking campaign ${id} status before activating...`);
      
      let currentStatus = {
        active: false,
        status: 'unknown'
      };
      
      // Flag to track if API call for status check was successful
      let needsExplicitActivationCall = true;
      
      try {
        // ALWAYS make API call to get current status
        const apiCampaign = await this.getCampaign(id);
        currentStatus.active = apiCampaign.active;
        currentStatus.status = apiCampaign.status;
        
        console.log(`API status check completed - Current campaign ${id} status: active=${currentStatus.active}, status=${currentStatus.status}`);
        
        // If already active, skip the API call since it's not needed
        if (apiCampaign.active === true || apiCampaign.status === 'enabled') {
          console.log(`Note: Campaign ${id} is already active according to TrafficStar API - skipping redundant API call`);
          needsExplicitActivationCall = false;
          
          // Save this status to database for future reference
          await db.update(trafficstarCampaigns)
            .set({ 
              active: true, 
              status: 'enabled',
              lastVerifiedStatus: 'enabled',
              updatedAt: new Date()
            })
            .where(eq(trafficstarCampaigns.trafficstarId, id.toString()));
        }
      } catch (statusCheckError) {
        console.log(`Error checking campaign ${id} status from API:`, statusCheckError);
      }
      
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
      
      // Only make API call if the campaign needs to be activated
      if (needsExplicitActivationCall) {
        try {
          // Get token
          const token = await this.ensureToken();
          
          console.log(`Making V2 API call to activate campaign ${id} (requires explicit activation)`);
          
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
                  lastVerifiedStatus: 'enabled',
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
        } catch (error: any) {
          console.error(`⚠️ Error activating campaign ${id}:`, error);
          
          // Record error in database
          await db.update(trafficstarCampaigns)
            .set({ 
              lastRequestedActionSuccess: false,
              updatedAt: new Date() 
            })
            .where(eq(trafficstarCampaigns.trafficstarId, id.toString()));
        }
      } else {
        console.log(`Skipping API call - campaign ${id} is already active`);
        
        // Set end time if campaign is already active
        try {
          // Always try to update the end time to ensure it's set properly
          await this.updateCampaignEndTime(id, endTimeFormatted);
          console.log(`✅ Set end time to ${endTimeFormatted} for already active campaign ${id}`);
          
          // Update database to show success since it's already in the desired state
          await db.update(trafficstarCampaigns)
            .set({
              scheduleEndTime: endTimeFormatted,
              lastRequestedActionSuccess: true,
              lastVerifiedStatus: 'enabled',
              updatedAt: new Date()
            })
            .where(eq(trafficstarCampaigns.trafficstarId, id.toString()));
        } catch (endTimeError) {
          console.error(`⚠️ Error setting end time for already active campaign ${id}:`, endTimeError);
        }
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
      // First, check if the current budget matches desired value
      let currentMaxDaily: number | null = null;
      let needsUpdate = true;
      
      // Always check with the API first
      try {
        const apiCampaign = await this.getCampaign(id);
        currentMaxDaily = typeof apiCampaign.max_daily === 'number' 
          ? apiCampaign.max_daily
          : parseFloat(String(apiCampaign.max_daily) || '0');
        
        if (currentMaxDaily === maxDaily) {
          console.log(`Campaign ${id} already has budget of $${maxDaily} according to TrafficStar API - no update needed`);
          needsUpdate = false;
          
          // Update our database to match API
          await db.update(trafficstarCampaigns)
            .set({ 
              maxDaily: maxDaily.toString(),
              updatedAt: new Date()
            })
            .where(eq(trafficstarCampaigns.trafficstarId, id.toString()));
        } else {
          console.log(`Campaign ${id} has budget of $${currentMaxDaily}, needs update to $${maxDaily}`);
        }
      } catch (apiError) {
        console.log(`Error checking campaign ${id} budget from API, will proceed with update:`, apiError);
      }
      
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
          } catch (error: any) {
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
   * Update a campaign's end time
   */
  async updateCampaignEndTime(id: number, scheduleEndTime: string): Promise<void> {
    try {
      // First, check if the current end time matches desired value
      let currentEndTime: string | null = null;
      let needsUpdate = true;
      
      // Always check with the API first
      try {
        const apiCampaign = await this.getCampaign(id);
        currentEndTime = apiCampaign.schedule_end_time;
        
        // If we have a current end time, normalize it for comparison
        if (currentEndTime) {
          // Normalize both times to compare them accurately
          const normalizedCurrent = this.normalizeEndTimeFormat(currentEndTime);
          const normalizedTarget = this.normalizeEndTimeFormat(scheduleEndTime);
          
          if (normalizedCurrent === normalizedTarget) {
            console.log(`Campaign ${id} already has end time of ${currentEndTime} according to TrafficStar API - no update needed`);
            needsUpdate = false;
            
            // Update our database to match API
            await db.update(trafficstarCampaigns)
              .set({ 
                scheduleEndTime: currentEndTime,
                updatedAt: new Date()
              })
              .where(eq(trafficstarCampaigns.trafficstarId, id.toString()));
              
            return;
          } else {
            console.log(`Campaign ${id} has end time of ${currentEndTime}, needs update to ${scheduleEndTime}`);
          }
        }
      } catch (apiError) {
        console.log(`Error checking campaign ${id} end time from API, will proceed with update:`, apiError);
      }
      
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
   * ALWAYS makes API calls regardless of current status
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
      
      // Handle each campaign
      for (const campaign of campaignsToManage) {
        try {
          // Convert trafficstarCampaignId to a number or use it as a string for API calls
          let tsId: number;
          
          if (campaign.trafficstarCampaignId) {
            // Try to parse as a number first
            tsId = parseInt(campaign.trafficstarCampaignId, 10);
            if (isNaN(tsId)) {
              console.error(`Invalid TrafficStar campaign ID for campaign ${campaign.id}: ${campaign.trafficstarCampaignId}`);
              continue; // Skip this campaign
            }
            
            console.log(`Processing auto-managed campaign ${campaign.id} with TrafficStar ID ${tsId}`);
            await this.autoManageCampaign(campaign);
          }
        } catch (error) {
          console.error(`Error auto-managing campaign ${campaign.id}:`, error);
          // Continue to next campaign instead of failing completely
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
      
      // Get TrafficStar campaign ID converted to number
      const trafficstarId = isNaN(Number(campaign.trafficstarCampaignId)) ? 
        parseInt(campaign.trafficstarCampaignId.replace(/\D/g, '')) : 
        Number(campaign.trafficstarCampaignId);
      
      // Get current date in UTC
      const currentUtcDate = new Date().toISOString().split('T')[0];
      
      // Check if this campaign is paused due to spent value
      // If it is, skip the click threshold management for today
      if (this.shouldRemainPausedDueToSpentValue(trafficstarId, currentUtcDate)) {
        console.log(`Campaign ${campaign.id} is paused due to high spent value - skipping click threshold management`);
        return;
      }
      
      // Get current TrafficStar campaign status
      let currentTrafficstarStatus;
      try {
        // Get the current TrafficStar campaign status from database first (faster)
        const [dbCampaign] = await db
          .select()
          .from(trafficstarCampaigns)
          .where(eq(trafficstarCampaigns.trafficstarId, trafficstarId.toString()));
        
        if (dbCampaign) {
          currentTrafficstarStatus = {
            active: dbCampaign.active,
            status: dbCampaign.status,
            lastRequestedAction: dbCampaign.lastRequestedAction,
            lastRequestedActionAt: dbCampaign.lastRequestedActionAt,
            lastRequestedActionSuccess: dbCampaign.lastRequestedActionSuccess
          };
          
          console.log(`Using cached status for campaign ${trafficstarId}: ${JSON.stringify(currentTrafficstarStatus)}`);
        } else {
          // If not in database, try API call
          console.log(`No cached status for campaign ${trafficstarId}, fetching from API`);
          const apiCampaign = await this.getCampaign(trafficstarId);
          currentTrafficstarStatus = {
            active: apiCampaign.active,
            status: apiCampaign.status,
            lastRequestedAction: null,
            lastRequestedActionAt: null,
            lastRequestedActionSuccess: null
          };
        }
      } catch (error) {
        console.log(`Error getting current status for campaign ${trafficstarId}, proceeding without status check:`, error);
        currentTrafficstarStatus = null;
      }
      
      // Get the campaign's URLs to calculate remaining clicks
      const urlsResult = await storage.getUrls(campaign.id);
      const urls = urlsResult.filter(url => url.isActive);
      
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
      
      // Check if we have no active URLs - this always takes precedence
      if (urls.length === 0) {
        console.log(`⚠️ Campaign ${campaign.id} has NO active URLs - checking if TrafficStar campaign needs to be paused`);
        
        // Check status first and only pause if not already paused
        console.log(`Campaign ${trafficstarId} has no active URLs - checking current status and pausing if needed`);
        
        try {
          // Check if we already know the campaign status
          if (currentTrafficstarStatus && 
             (currentTrafficstarStatus.active === false || currentTrafficstarStatus.status === 'paused')) {
            console.log(`Campaign ${trafficstarId} is already paused - skipping pauseCampaign API call`);
            
            // Still update database to record this check
            await db.update(trafficstarCampaigns)
              .set({
                active: false,
                status: 'paused',
                lastVerifiedStatus: 'paused',
                lastRequestedActionSuccess: true,
                updatedAt: new Date()
              })
              .where(eq(trafficstarCampaigns.trafficstarId, trafficstarId.toString()));
          } else {
            // Only pause if not known to be paused already
            await this.pauseCampaign(trafficstarId);
          }
          
          // Always check current end time before updating
          const apiCampaign = await this.getCampaign(trafficstarId);
          if (apiCampaign.schedule_end_time === formattedCurrentDateTime) {
            console.log(`Campaign ${trafficstarId} already has end time ${formattedCurrentDateTime} - skipping update`);
          } else {
            await this.updateCampaignEndTime(trafficstarId, formattedCurrentDateTime);
          }
          
          // Update campaign's last sync timestamp
          await db.update(campaigns)
            .set({
              lastTrafficstarSync: new Date(),
              updatedAt: new Date()
            })
            .where(eq(campaigns.id, campaign.id));
            
          console.log(`✅ TrafficStar campaign ${trafficstarId} API calls complete for pause and end time setting`);
        } catch (error) {
          console.error(`Error in API calls for campaign with no active URLs:`, error);
        }
        
        return; // No need to continue with regular auto-management when there are no active URLs
      }
      
      // Calculate remaining clicks across all active URLs
      let totalRemainingClicks = 0;
      try {
        totalRemainingClicks = urls.reduce((total, url) => {
          const remainingClicks = url.clickLimit - url.clicks;
          return total + (remainingClicks > 0 ? remainingClicks : 0);
        }, 0);
      } catch (error) {
        console.error('Error calculating remaining clicks:', error);
        totalRemainingClicks = 0;
      }
      
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
      
      // NEW BEHAVIOR: If UTC date has changed, first pause the campaign, then check remaining clicks
      if (isTimeForBudgetUpdate) {
        console.log(`Setting daily budget for campaign ${campaign.id} to $10.15 (UTC time: ${currentUtcTime}, configured time: ${budgetUpdateTime})`);
        
        // Set daily budget to $10.15 as per requirements
        try {
          await this.updateCampaignDailyBudget(trafficstarId, 10.15);
          
          // First pause the campaign when UTC date changes
          if (currentUtcDate !== lastSyncDate && 
              (!currentTrafficstarStatus || 
               currentTrafficstarStatus.active === true || 
               currentTrafficstarStatus.status === 'enabled')) {
            
            console.log(`New UTC date detected - first pausing TrafficStar campaign ${trafficstarId}`);
            await this.pauseCampaign(trafficstarId);
            console.log(`✅ TrafficStar campaign ${trafficstarId} paused due to new UTC date`);
            
            // Update current status after pause
            currentTrafficstarStatus = {
              active: false,
              status: 'paused',
              lastRequestedAction: 'pause',
              lastRequestedActionAt: new Date(),
              lastRequestedActionSuccess: true
            };
          }
          
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
      
      // Check if campaign is registered as paused due to spent value
      const pauseInfo = this.spentValuePausedCampaigns.get(trafficstarId);
      
      // If campaign is registered as paused by spent value for today, skip the threshold logic
      if (pauseInfo && pauseInfo.disabledThresholdForDate === currentUtcDate) {
        console.log(`Campaign ${campaign.id} clicks threshold management is disabled for today (${currentUtcDate}) due to high spent value`);
        return;
      }
      
      // NOW IMPLEMENT NEW CLICK THRESHOLD LOGIC
      
      // If total remaining clicks > 15000, activate the campaign
      if (totalRemainingClicks > 15000) {
        console.log(`TrafficStar campaign ${trafficstarId} has ${totalRemainingClicks} remaining clicks > 15,000 - checking status`);
        
        try {
          // First check if campaign is already active in API (this is the most accurate source)
          let isAlreadyActive = false;
          try {
            const apiCampaign = await this.getCampaign(trafficstarId);
            if (apiCampaign.active === true || apiCampaign.status === 'enabled') {
              isAlreadyActive = true;
              console.log(`API confirms campaign ${trafficstarId} is already active - no API call needed`);
            }
          } catch (apiCheckError) {
            console.log(`Could not check status via API, falling back to local status: ${apiCheckError.message}`);
          }
          
          // If API check confirmed it's active OR we have local data showing it's active
          if (isAlreadyActive || (currentTrafficstarStatus && 
             (currentTrafficstarStatus.active === true || currentTrafficstarStatus.status === 'enabled'))) {
            console.log(`Campaign ${trafficstarId} is already active with high clicks - skipping activateCampaign API call`);
            
            // Still update database to record this check
            await db.update(trafficstarCampaigns)
              .set({
                active: true,
                status: 'enabled',
                lastVerifiedStatus: 'enabled',
                lastRequestedActionSuccess: true,
                updatedAt: new Date()
              })
              .where(eq(trafficstarCampaigns.trafficstarId, trafficstarId.toString()));
          } else {
            // Only activate if not known to be active already (by API or local cache)
            await this.activateCampaign(trafficstarId);
          }
          console.log(`✅ API calls completed for TrafficStar campaign ${trafficstarId}`);
        } catch (error) {
          console.error(`Error in API calls for TrafficStar campaign ${trafficstarId}:`, error);
        }
      } 
      // Only pause if remaining clicks <= 5000 (lower threshold)
      else if (totalRemainingClicks <= 5000) {
        console.log(`TrafficStar campaign ${trafficstarId} has low remaining clicks (${totalRemainingClicks} <= 5,000) - checking status`);
        
        try {
          // First check if campaign is already paused in API (this is the most accurate source)
          let isAlreadyPaused = false;
          try {
            const apiCampaign = await this.getCampaign(trafficstarId);
            if (apiCampaign.active === false || apiCampaign.status === 'paused') {
              isAlreadyPaused = true;
              console.log(`API confirms campaign ${trafficstarId} is already paused - no API call needed`);
            }
          } catch (apiCheckError) {
            console.log(`Could not check status via API, falling back to local status: ${apiCheckError.message}`);
          }
          
          // If API check confirmed it's paused OR we have local data showing it's paused
          if (isAlreadyPaused || (currentTrafficstarStatus && 
             (currentTrafficstarStatus.active === false || currentTrafficstarStatus.status === 'paused'))) {
            console.log(`Campaign ${trafficstarId} is already paused with low clicks - skipping pauseCampaign API call`);
            
            // Still update database to record this check
            await db.update(trafficstarCampaigns)
              .set({
                active: false,
                status: 'paused',
                lastVerifiedStatus: 'paused',
                lastRequestedActionSuccess: true,
                updatedAt: new Date()
              })
              .where(eq(trafficstarCampaigns.trafficstarId, trafficstarId.toString()));
          } else {
            // Only pause if not known to be paused already (by API or local cache)
            await this.pauseCampaign(trafficstarId);
          }
          
          // Always check current end time before updating
          const apiCampaign = await this.getCampaign(trafficstarId);
          if (apiCampaign.schedule_end_time === formattedCurrentDateTime) {
            console.log(`Campaign ${trafficstarId} already has end time ${formattedCurrentDateTime} - skipping update`);
          } else {
            await this.updateCampaignEndTime(trafficstarId, formattedCurrentDateTime);
          }
          
          console.log(`✅ API calls completed for TrafficStar campaign ${trafficstarId} due to low remaining clicks`);
        } catch (error) {
          console.error(`Error making API calls for TrafficStar campaign ${trafficstarId}:`, error);
        }
      } 
      // For clicks between 5000 and 15000, maintain current status (hysteresis) but still check API
      else {
        console.log(`Campaign ${campaign.id} has ${totalRemainingClicks} remaining clicks (between 5,000 and 15,000) - checking current status`);
        
        try {
          // Always check current status with API call
          const apiCampaign = await this.getCampaign(trafficstarId);
          console.log(`✅ Status check for campaign ${trafficstarId} in mid-range clicks: active=${apiCampaign.active}, status=${apiCampaign.status}`);
          
          // Update our database to match API's current state
          await db.update(trafficstarCampaigns)
            .set({ 
              active: apiCampaign.active, 
              status: apiCampaign.status,
              lastVerifiedStatus: apiCampaign.status,
              updatedAt: new Date()
            })
            .where(eq(trafficstarCampaigns.trafficstarId, trafficstarId.toString()));
            
          // If campaign should be paused but isn't, make API call to pause it
          if (apiCampaign.active && totalRemainingClicks <= 7500) {
            console.log(`Mid-range clicks but trending lower (${totalRemainingClicks} <= 7,500) - making pause API call`);
            await this.pauseCampaign(trafficstarId);
          }
          
          // If campaign should be active but isn't, make API call to activate it
          if (!apiCampaign.active && totalRemainingClicks >= 12500) {
            console.log(`Mid-range clicks but trending higher (${totalRemainingClicks} >= 12,500) - making activate API call`);
            await this.activateCampaign(trafficstarId);
          }
          
        } catch (statusCheckError) {
          console.log(`Error checking campaign ${trafficstarId} status in mid-range:`, statusCheckError);
        }
      }
      
    } catch (error) {
      console.error(`Error auto-managing campaign ${campaign.id}:`, error);
    }
  }
  
  /**
   * Track when campaigns were paused due to spent value exceeding the threshold
   * Maps campaign ID to the time when it was paused due to spent value (and time to recheck)
   */
  private spentValuePausedCampaigns: Map<number, { pausedAt: Date, recheckAt: Date, disabledThresholdForDate: string }> = new Map();
  
  /**
   * Track campaigns that have already had budget adjustment performed
   * Maps campaign ID to the UTC date when budget adjustment was performed
   * Prevents multiple budget adjustments for the same campaign on the same day
   */
  private budgetAdjustedCampaigns: Map<number, string> = new Map();
  
  /**
   * Check if a campaign was paused due to high spent value and should still be paused
   * @param campaignId The campaign ID to check
   * @param currentUtcDate The current UTC date in YYYY-MM-DD format
   * @returns true if the campaign should remain paused due to spent value
   */
  private shouldRemainPausedDueToSpentValue(campaignId: number, currentUtcDate: string): boolean {
    // First check if the campaign already had a budget adjustment today
    // If so, we don't need to do another one
    if (this.budgetAdjustedCampaigns.has(campaignId)) {
      const adjustedDate = this.budgetAdjustedCampaigns.get(campaignId);
      if (adjustedDate === currentUtcDate) {
        console.log(`Campaign ${campaignId} already had budget adjustment on ${currentUtcDate} - skipping further checks`);
        return false;
      } else {
        // Clear the adjustment status for a new day
        this.budgetAdjustedCampaigns.delete(campaignId);
      }
    }
    
    // Handle test mode specifically for budget adjustment testing
    if (process.env.TEST_MODE_SPENT_VALUE_PAUSE === 'true' &&
        process.env.TEST_CAMPAIGN_ID === campaignId.toString()) {
      
      console.log(`🧪 TEST MODE: Checking spent value pause for test campaign ${campaignId}`);
      
      // If we're in test mode with specific campaign ID, simulate a pause that
      // just reached the recheck time
      const pauseTime = process.env.TEST_PAUSE_TIME ? new Date(process.env.TEST_PAUSE_TIME) : new Date(Date.now() - 15 * 60 * 1000);
      const recheckTime = process.env.TEST_RECHECK_TIME ? new Date(process.env.TEST_RECHECK_TIME) : new Date(Date.now() - 5 * 60 * 1000);
      const testDate = process.env.TEST_UTC_DATE || currentUtcDate;
      
      console.log(`🧪 TEST MODE: Campaign ${campaignId} has a simulated pause at ${pauseTime.toISOString()}`);
      console.log(`🧪 TEST MODE: Recheck time is ${recheckTime.toISOString()} (${new Date() >= recheckTime ? 'ELAPSED' : 'not elapsed'})`);
      
      // Check if recheck time has passed
      if (new Date() >= recheckTime) {
        console.log(`🧪 TEST MODE: Campaign ${campaignId} 10-minute pause has elapsed, time to recheck`);
        
        // Run the recheck process to adjust budget and reactivate
        this.handlePauseRecheckAndBudgetAdjustment(campaignId, testDate)
          .catch(err => console.error(`Error running pause recheck for campaign ${campaignId}:`, err));
          
        // Clean up test environment variables
        process.env.TEST_MODE_SPENT_VALUE_PAUSE = 'false';
        delete process.env.TEST_CAMPAIGN_ID;
        delete process.env.TEST_PAUSE_TIME;
        delete process.env.TEST_RECHECK_TIME;
        delete process.env.TEST_UTC_DATE;
        
        return false;
      }
      
      // Still within the pause period
      const remainingMinutes = Math.ceil((recheckTime.getTime() - new Date().getTime()) / (60 * 1000));
      console.log(`🧪 TEST MODE: Campaign ${campaignId} is paused due to high spent value - ${remainingMinutes} minutes remaining until recheck`);
      return true;
    }
    
    // Normal (non-test) mode
    const pauseInfo = this.spentValuePausedCampaigns.get(campaignId);
    
    if (!pauseInfo) {
      return false;
    }
    
    // If this is for a different date, we can clear the pause status
    if (pauseInfo.disabledThresholdForDate !== currentUtcDate) {
      console.log(`Campaign ${campaignId} was paused due to spent value on ${pauseInfo.disabledThresholdForDate}, but current date is ${currentUtcDate} - clearing pause status`);
      this.spentValuePausedCampaigns.delete(campaignId);
      return false;
    }
    
    // Check if we've reached the recheck time
    if (new Date() >= pauseInfo.recheckAt) {
      console.log(`Campaign ${campaignId} has reached recheck time after being paused due to spent value - starting budget adjustment process`);
      // Trigger the budget adjustment and reactivation process
      this.handlePauseRecheckAndBudgetAdjustment(campaignId, currentUtcDate);
      return false;
    }
    
    // Still within the pause period
    const minutesRemaining = Math.ceil((pauseInfo.recheckAt.getTime() - Date.now()) / (60 * 1000));
    console.log(`Campaign ${campaignId} remains paused due to spent value - ${minutesRemaining} minutes until recheck`);
    return true;
  }

  /**
   * Handle the 10-minute recheck for a campaign paused due to spent value
   * This will check current spent value, add pending click pricing, 
   * and set as new daily budget before reactivating
   * @param campaignId The TrafficStar campaign ID
   * @param currentUtcDate The current UTC date
   */
  private async handlePauseRecheckAndBudgetAdjustment(campaignId: number, currentUtcDate: string): Promise<void> {
    try {
      // First check if the campaign already had a budget adjustment today
      // If so, we don't need to do another one
      if (this.budgetAdjustedCampaigns.has(campaignId)) {
        const adjustedDate = this.budgetAdjustedCampaigns.get(campaignId);
        if (adjustedDate === currentUtcDate) {
          console.log(`Campaign ${campaignId} already had budget adjustment on ${currentUtcDate} - skipping duplicate adjustment`);
          return;
        }
      }
      
      console.log(`⏱️ 10-minute pause period completed for campaign ${campaignId} - handling budget adjustment...`);
      
      // Remove from paused campaigns map if it exists
      this.spentValuePausedCampaigns.delete(campaignId);
      
      // 1. Get current spent value for today
      console.log(`Checking current spent value for campaign ${campaignId} on ${currentUtcDate}`);
      const spentValue = await this.getCampaignSpentValue(campaignId, currentUtcDate, currentUtcDate);
      const currentSpentValue = spentValue?.totalSpent || 0;
      console.log(`Current spent value for campaign ${campaignId}: $${currentSpentValue.toFixed(4)}`);
      
      // 2. Calculate pending click pricing for the campaign
      // First, find our campaign that is linked to this TrafficStar ID
      const [campaign] = await db
        .select()
        .from(campaigns)
        .where(eq(campaigns.trafficstarCampaignId, campaignId.toString()));
        
      if (!campaign) {
        console.log(`⚠️ Cannot find local campaign for TrafficStar campaign ${campaignId} - skipping budget adjustment`);
        return;
      }
      
      // Get all URLs for the campaign to calculate pending click pricing
      const urlsData = await db
        .select()
        .from(urls)
        .where(
          and(
            eq(urls.campaignId, campaign.id),
            eq(urls.status, 'active')
          )
        );
        
      // Calculate the pending click pricing
      let pendingClickPricing = 0;
      for (const url of urlsData) {
        const remainingClicks = url.clickLimit - url.clicks;
        if (remainingClicks > 0) {
          // Calculate the value of remaining clicks using the price per click
          // We need to convert from price per 1000 clicks to price per click
          const pricePerClick = parseFloat(campaign.pricePerThousand?.toString() || '1000') / 1000;
          pendingClickPricing += remainingClicks * pricePerClick;
        }
      }
      
      console.log(`Pending click pricing for campaign ${campaignId}: $${pendingClickPricing.toFixed(4)}`);
      
      // 3. Calculate new daily budget (current spent + pending clicks)
      const newDailyBudget = currentSpentValue + pendingClickPricing;
      console.log(`New daily budget for campaign ${campaignId}: $${newDailyBudget.toFixed(4)}`);
      
      // 4. Update the campaign's daily budget
      await this.updateCampaignDailyBudget(campaignId, newDailyBudget);
      
      // 5. Reactivate the campaign with end date set to current UTC date 23:59
      const endDateStr = `${currentUtcDate} 23:59:00`;
      console.log(`Reactivating campaign ${campaignId} with end date ${endDateStr}`);
      
      // Set end date first
      await this.updateCampaignEndTime(campaignId, endDateStr);
      
      // Then activate the campaign
      await this.activateCampaign(campaignId);
      
      // Mark this campaign as having had its budget adjusted for today
      // This prevents multiple budget adjustments for the same campaign on the same day
      this.budgetAdjustedCampaigns.set(campaignId, currentUtcDate);
      
      console.log(`✅ Campaign ${campaignId} reactivated with new daily budget $${newDailyBudget.toFixed(4)} and end date ${endDateStr}`);
      console.log(`✅ Campaign ${campaignId} marked as having budget adjusted for ${currentUtcDate} - will not repeat today`);
    } catch (error) {
      console.error(`Error handling pause recheck and budget adjustment for campaign ${campaignId}:`, error);
    }
  }
  
  /**
   * Get pause info for a campaign paused due to high spent value
   * @param campaignId The campaign ID to check
   * @param currentUtcDate The current UTC date in YYYY-MM-DD format
   * @returns The pause info or null if not paused due to spent value
   */
  public getSpentValuePauseInfo(campaignId: number, currentUtcDate: string): { 
    pausedAt: Date; 
    recheckAt: Date; 
    disabledThresholdForDate: string;
  } | null {
    // First check if the campaign already had a budget adjustment today
    // If so, return null to indicate no pause info (budget was already adjusted)
    if (this.budgetAdjustedCampaigns.has(campaignId)) {
      const adjustedDate = this.budgetAdjustedCampaigns.get(campaignId);
      if (adjustedDate === currentUtcDate) {
        console.log(`Campaign ${campaignId} already had budget adjustment on ${currentUtcDate} - budget adjustment completed`);
        return null;
      }
    }
    
    // Handle test mode
    if (process.env.TEST_MODE_SPENT_VALUE_PAUSE === 'true' && 
        process.env.TEST_CAMPAIGN_ID === campaignId.toString()) {
      
      // If in test mode with specific campaign ID, return simulated pause info
      const pauseTime = process.env.TEST_PAUSE_TIME ? new Date(process.env.TEST_PAUSE_TIME) : new Date(Date.now() - 15 * 60 * 1000);
      const recheckTime = process.env.TEST_RECHECK_TIME ? new Date(process.env.TEST_RECHECK_TIME) : new Date(Date.now() - 5 * 60 * 1000);
      const testDate = process.env.TEST_UTC_DATE || currentUtcDate;
      
      // If recheck time has elapsed, don't return pause info
      if (new Date() >= recheckTime) {
        return null;
      }
      
      // Still within simulated pause period
      console.log(`🧪 TEST MODE: Returning simulated pause info for campaign ${campaignId}`);
      return {
        pausedAt: pauseTime,
        recheckAt: recheckTime,
        disabledThresholdForDate: testDate
      };
    }
    
    // Normal mode
    const pauseInfo = this.spentValuePausedCampaigns.get(campaignId);
    
    if (!pauseInfo) {
      return null;
    }
    
    // If this is for a different date, we shouldn't return pause info
    if (pauseInfo.disabledThresholdForDate !== currentUtcDate) {
      return null;
    }
    
    // Check if we've reached the recheck time
    if (new Date() >= pauseInfo.recheckAt) {
      return null;
    }
    
    // Still within the pause period - return pause info
    return pauseInfo;
  }
  
  /**
   * Clear the spent value pause state for a campaign (for testing purposes)
   * @param campaignId The campaign ID to clear
   */
  public clearSpentValuePause(campaignId: number): void {
    if (this.spentValuePausedCampaigns.has(campaignId)) {
      console.log(`Clearing spent value pause state for campaign ${campaignId}`);
      this.spentValuePausedCampaigns.delete(campaignId);
    }
    
    // Also clear budget adjustment tracking
    if (this.budgetAdjustedCampaigns.has(campaignId)) {
      console.log(`Clearing budget adjustment tracking for campaign ${campaignId}`);
      this.budgetAdjustedCampaigns.delete(campaignId);
    }
  }
  
  /**
   * Get the cached campaign status from database
   * @param campaignId The campaign ID to get status for
   * @returns The current campaign status or null if not found
   */
  public async getCachedCampaignStatus(campaignId: number): Promise<{
    active: boolean;
    status: string;
    lastRequestedAction?: string;
    lastRequestedActionAt?: Date;
    lastRequestedActionSuccess?: boolean;
  } | null> {
    try {
      const [dbCampaign] = await db
        .select()
        .from(trafficstarCampaigns)
        .where(eq(trafficstarCampaigns.trafficstarId, campaignId.toString()));
      
      if (dbCampaign) {
        return {
          active: dbCampaign.active,
          status: dbCampaign.status,
          lastRequestedAction: dbCampaign.lastRequestedAction,
          lastRequestedActionAt: dbCampaign.lastRequestedActionAt,
          lastRequestedActionSuccess: dbCampaign.lastRequestedActionSuccess
        };
      }
      
      return null;
    } catch (error) {
      console.error(`Error getting cached status for campaign ${campaignId}:`, error);
      return null;
    }
  }
  
  /**
   * Scheduled function to run daily budget updates and start campaigns as needed
   * This should be called on application startup and at appropriate intervals
   */
  /**
   * Track a newly received URL for budget updates
   * This records the URL's click value for updating the campaign's 
   * daily budget after 10 minutes
   * 
   * @param urlId The ID of the URL
   * @param campaignId The campaign ID that the URL belongs to
   * @param tsTrafficstarId The TrafficStar campaign ID
   * @param clickLimit The click limit for the URL
   * @param pricePerThousand The price per thousand clicks
   */
  public async trackNewUrlForBudgetUpdate(
    urlId: number, 
    campaignId: number, 
    tsTrafficstarId: string, 
    clickLimit: number, 
    pricePerThousand: number
  ): Promise<void> {
    try {
      // Convert TrafficStar ID to number
      const tsId = parseInt(tsTrafficstarId);
      if (isNaN(tsId)) {
        console.log(`Invalid TrafficStar campaign ID: ${tsTrafficstarId}`);
        return;
      }
      
      // Calculate the click value using price per thousand
      const pricePerClick = parseFloat(pricePerThousand?.toString() || '1000') / 1000;
      const clickValue = clickLimit * pricePerClick;
      
      console.log(`Tracking new URL ${urlId} for budget update in campaign ${campaignId} (TrafficStar ID: ${tsId})`);
      console.log(`  - Click limit: ${clickLimit}`);
      console.log(`  - Price per thousand: $${pricePerThousand}`);
      console.log(`  - Click value: $${clickValue.toFixed(4)}`);
      
      // Create received time and update time (10 minutes later)
      const receivedAt = new Date();
      const updateAt = new Date(receivedAt.getTime() + 10 * 60 * 1000);
      
      console.log(`  - Received at: ${receivedAt.toISOString()}`);
      console.log(`  - Will update budget at: ${updateAt.toISOString()}`);
      
      // Get or create the array for this campaign
      if (!this.pendingUrlBudgets.has(tsId)) {
        this.pendingUrlBudgets.set(tsId, []);
      }
      
      // Add this URL to the pending updates
      const pendingUrls = this.pendingUrlBudgets.get(tsId)!;
      pendingUrls.push({
        urlId,
        campaignId,
        receivedAt,
        updateAt,
        clickValue,
        processed: false
      });
      
      console.log(`Added URL ${urlId} to pending budget updates for campaign ${tsId}`);
      console.log(`Total pending URLs for campaign ${tsId}: ${pendingUrls.length}`);
    } catch (error) {
      console.error(`Error tracking URL ${urlId} for budget update:`, error);
    }
  }
  
  /**
   * Process pending URL budget updates
   * This checks for URLs that have passed their 10-minute wait period
   * and updates the campaign's daily budget accordingly
   * Made public for testing purposes
   */
  public async processPendingUrlBudgets(): Promise<void> {
    try {
      console.log('Processing pending URL budget updates');
      
      // Get current time for comparison
      const now = new Date();
      
      // Get current UTC date for tracking updates
      const currentUtcDate = new Date().toISOString().split('T')[0];
      
      // Track campaigns that need updates
      const campaignsToUpdate = new Set<number>();
      
      // Check each campaign for pending updates
      for (const [tsId, pendingUrls] of this.pendingUrlBudgets.entries()) {
        // Filter URLs that need updating (past their update time and not processed)
        const urlsToUpdate = pendingUrls.filter(url => 
          !url.processed && now >= url.updateAt
        );
        
        if (urlsToUpdate.length > 0) {
          console.log(`Found ${urlsToUpdate.length} URLs ready for budget update in campaign ${tsId}`);
          campaignsToUpdate.add(tsId);
          
          // Mark these URLs as being processed
          urlsToUpdate.forEach(url => {
            console.log(`  - URL ${url.urlId} ready for budget update (received ${url.receivedAt.toISOString()})`);
            url.processed = true;
          });
        }
      }
      
      // Process each campaign that needs updates
      for (const tsId of campaignsToUpdate) {
        try {
          console.log(`Processing budget update for campaign ${tsId}`);
          
          // Get all pending URLs for this campaign
          const pendingUrls = this.pendingUrlBudgets.get(tsId) || [];
          const processedUrls = pendingUrls.filter(url => url.processed);
          
          // Skip if no URLs to process
          if (processedUrls.length === 0) {
            console.log(`No processed URLs found for campaign ${tsId}`);
            continue;
          }
          
          // Calculate total click value for processed URLs
          let totalClickValue = 0;
          processedUrls.forEach(url => {
            totalClickValue += url.clickValue;
          });
          
          console.log(`Total click value for ${processedUrls.length} URLs: $${totalClickValue.toFixed(4)}`);
          
          // Get current spent value for today
          const spentValue = await this.getCampaignSpentValue(tsId, currentUtcDate, currentUtcDate);
          const currentSpentValue = spentValue?.totalSpent || 0;
          console.log(`Current spent value for campaign ${tsId}: $${currentSpentValue.toFixed(4)}`);
          
          // Get current daily budget
          const campaign = await this.getCampaign(tsId);
          const currentBudget = campaign?.max_daily || 0;
          console.log(`Current daily budget for campaign ${tsId}: $${currentBudget.toFixed(4)}`);
          
          // Calculate new daily budget (current budget + total click value)
          const newDailyBudget = currentBudget + totalClickValue;
          console.log(`New daily budget for campaign ${tsId}: $${newDailyBudget.toFixed(4)}`);
          
          // Update the campaign's daily budget
          await this.updateCampaignDailyBudget(tsId, newDailyBudget);
          console.log(`Updated daily budget for campaign ${tsId} to $${newDailyBudget.toFixed(4)}`);
          
          // Remove processed URLs from pending updates
          this.pendingUrlBudgets.set(
            tsId, 
            pendingUrls.filter(url => !url.processed)
          );
          
          console.log(`Removed ${processedUrls.length} processed URLs from pending updates for campaign ${tsId}`);
        } catch (error) {
          console.error(`Error processing budget update for campaign ${tsId}:`, error);
        }
      }
    } catch (error) {
      console.error('Error processing pending URL budget updates:', error);
    }
  }
  
  /**
   * Clear pending URL budget updates for a campaign
   * This can be used for testing or debugging
   * @param tsId The TrafficStar campaign ID
   */
  public clearPendingUrlBudgets(tsId: number): void {
    if (this.pendingUrlBudgets.has(tsId)) {
      console.log(`Clearing pending URL budget updates for campaign ${tsId}`);
      this.pendingUrlBudgets.delete(tsId);
    }
  }
  
  async scheduleAutoManagement(): Promise<void> {
    try {
      // Run initial auto-management and spent value updates
      await this.autoManageCampaigns();
      await this.updateAllCampaignsSpentValues(); // Initial update for all campaigns
      
      // Schedule spent value update for ALL campaigns to run every 2 minutes
      // This ensures all campaign data is up-to-date with current UTC date spent values
      setInterval(async () => {
        try {
          console.log('Running scheduled spent value update for ALL TrafficStar campaigns');
          await this.updateAllCampaignsSpentValues();
        } catch (error) {
          console.error('Error in scheduled spent value update:', error);
        }
      }, 2 * 60 * 1000); // Every 2 minutes
      
      // Schedule spent value check for auto-managed campaigns (for pause if over threshold)
      setInterval(async () => {
        try {
          console.log('Running scheduled spent value check for TrafficStar campaigns');
          await this.checkCampaignsSpentValue();
        } catch (error) {
          console.error('Error in scheduled spent value check:', error);
        }
      }, 3 * 60 * 1000); // Every 3 minutes (staggered to avoid overlap)
      
      // Schedule to run regular auto-management every minute for immediate effect
      setInterval(async () => {
        try {
          console.log('Running scheduled auto-management for TrafficStar campaigns');
          await this.autoManageCampaigns();
        } catch (error) {
          console.error('Error in scheduled auto-management:', error);
        }
      }, 60 * 1000); // Every minute
      
      // Schedule processing of pending URL budget updates every minute
      setInterval(async () => {
        try {
          console.log('Running scheduled processing of pending URL budget updates');
          await this.processPendingUrlBudgets();
        } catch (error) {
          console.error('Error in scheduled processing of pending URL budget updates:', error);
        }
      }, 60 * 1000); // Every minute
      
      console.log('TrafficStar auto-management scheduler initialized');
    } catch (error) {
      console.error('Error scheduling auto-management:', error);
    }
  }
  
  /**
   * Update all TrafficStar campaigns with their latest spent values
   * This function fetches and updates all campaigns with trafficstarCampaignId,
   * not just those with auto-management enabled
   */
  public async updateAllCampaignsSpentValues(): Promise<void> {
    try {
      // Get all campaigns with trafficstarCampaignId
      const allCampaigns = await db
        .select()
        .from(campaigns)
        .where(isNotNull(campaigns.trafficstarCampaignId));
      
      // Get current date in UTC
      const currentUtcDate = new Date().toISOString().split('T')[0];
      
      console.log(`Updating spent values for all ${allCampaigns.length} campaigns with TrafficStar IDs for ${currentUtcDate}`);
      
      // Process each campaign
      for (const campaign of allCampaigns) {
        if (!campaign.trafficstarCampaignId) continue;
        
        // Get TrafficStar campaign ID
        const trafficstarId = isNaN(Number(campaign.trafficstarCampaignId)) ? 
          parseInt(campaign.trafficstarCampaignId.replace(/\D/g, '')) : 
          Number(campaign.trafficstarCampaignId);
        
        // Get current spent value for today only
        console.log(`Fetching spent value for campaign ${trafficstarId} on ${currentUtcDate}`);
        try {
          const spentValue = await this.getCampaignSpentValue(trafficstarId, currentUtcDate, currentUtcDate);
          
          // Update the campaign with the latest spent value
          const spentAmount = spentValue ? spentValue.totalSpent : 0;
          const formattedSpentAmount = spentAmount.toFixed(4);
          
          // Create an actual Date object for dailySpentDate
          const dailySpentDateObj = new Date(`${currentUtcDate}T00:00:00Z`);

          await db.update(campaigns)
            .set({ 
              dailySpent: formattedSpentAmount,
              dailySpentDate: dailySpentDateObj, // Use the properly formatted Date object
              lastSpentCheck: new Date(),
              updatedAt: new Date()
            })
            .where(eq(campaigns.id, campaign.id));
          
          console.log(`Updated campaign ${campaign.id} with latest spent value: $${formattedSpentAmount} for date ${currentUtcDate}`);
        } catch (error) {
          console.error(`Error updating spent value for campaign ${trafficstarId}:`, error);
        }
      }
    } catch (error) {
      console.error('Error updating all campaigns spent values:', error);
    }
  }
  
  /**
   * Check all campaigns for their spent value and pause if over threshold
   * Also updates the campaign with the spent value for display in the UI
   */
  public async checkCampaignsSpentValue(): Promise<void> {
    try {
      // Get all campaigns with auto-management enabled
      const campaignsToCheck = await db
        .select()
        .from(campaigns)
        .where(
          and(
            eq(campaigns.autoManageTrafficstar, true),
            isNotNull(campaigns.trafficstarCampaignId)
          )
        );
      
      console.log(`Found ${campaignsToCheck.length} campaigns with auto-management enabled for spent value check`);
      
      // Get current date in UTC
      const currentUtcDate = new Date().toISOString().split('T')[0];
      
      // Check each campaign
      for (const campaign of campaignsToCheck) {
        if (!campaign.trafficstarCampaignId) continue;
        
        // Get TrafficStar campaign ID
        const trafficstarId = isNaN(Number(campaign.trafficstarCampaignId)) ? 
          parseInt(campaign.trafficstarCampaignId.replace(/\D/g, '')) : 
          Number(campaign.trafficstarCampaignId);
          
        // Skip if campaign should remain paused due to spent value
        if (this.shouldRemainPausedDueToSpentValue(trafficstarId, currentUtcDate)) {
          continue;
        }
        
        // Get current campaign status
        let currentTrafficstarStatus;
        try {
          const [dbCampaign] = await db
            .select()
            .from(trafficstarCampaigns)
            .where(eq(trafficstarCampaigns.trafficstarId, trafficstarId.toString()));
          
          if (dbCampaign) {
            currentTrafficstarStatus = {
              active: dbCampaign.active,
              status: dbCampaign.status,
              lastRequestedAction: dbCampaign.lastRequestedAction,
              lastRequestedActionAt: dbCampaign.lastRequestedActionAt,
              lastRequestedActionSuccess: dbCampaign.lastRequestedActionSuccess
            };
          }
        } catch (error) {
          console.error(`Error getting status for campaign ${trafficstarId}:`, error);
        }
        
        // Skip if campaign is already paused
        if (currentTrafficstarStatus && 
            (currentTrafficstarStatus.active === false || 
             currentTrafficstarStatus.status === 'paused')) {
          console.log(`Campaign ${trafficstarId} is already paused - skipping spent value check`);
          continue;
        }
        
        // Get current spent value for today only - filter for the current UTC date
        console.log(`Checking spent value for campaign ${trafficstarId} on ${currentUtcDate}`);
        try {
          const spentValue = await this.getCampaignSpentValue(trafficstarId, currentUtcDate, currentUtcDate);
          
          // ALWAYS UPDATE THE CAMPAIGN RECORD WITH THE LATEST SPENT VALUE
          // This ensures the UI always shows the most up-to-date information
          try {
            const spentAmount = spentValue ? spentValue.totalSpent : 0;
            const formattedSpentAmount = spentAmount.toFixed(4);
            
            // Create an actual Date object for dailySpentDate
            const dailySpentDateObj = new Date(`${currentUtcDate}T00:00:00Z`);

            await db.update(campaigns)
              .set({ 
                dailySpent: formattedSpentAmount,
                dailySpentDate: dailySpentDateObj, // Use the properly formatted Date object
                lastSpentCheck: new Date(),
                updatedAt: new Date()
              })
              .where(eq(campaigns.id, campaign.id));
            
            console.log(`Updated campaign ${campaign.id} with latest spent value: $${formattedSpentAmount} for date ${currentUtcDate}`);
          } catch (updateError) {
            console.error(`Error updating spent values for campaign ${campaign.id}:`, updateError);
          }
          
          // Check if spent value exceeds $10
          if (spentValue && spentValue.totalSpent > 10) {
            console.log(`⚠️ Campaign ${trafficstarId} has spent $${spentValue.totalSpent.toFixed(2)}, which exceeds $10 threshold`);
            
            // Pause the campaign
            console.log(`Pausing campaign ${trafficstarId} due to high spent value ($${spentValue.totalSpent.toFixed(2)} > $10)`);
            
            // Format current date and time
            const now = new Date();
            const currentUtcTime = now.getUTCHours().toString().padStart(2, '0') + ':' + 
                                  now.getUTCMinutes().toString().padStart(2, '0') + ':' + 
                                  now.getUTCSeconds().toString().padStart(2, '0');
            const formattedCurrentDateTime = `${currentUtcDate} ${currentUtcTime}`;
            
            // Pause the campaign and set end time
            try {
              await this.pauseCampaign(trafficstarId);
              await this.updateCampaignEndTime(trafficstarId, formattedCurrentDateTime);
              
              // Mark this campaign as paused due to spent value
              // Schedule recheck after 10 minutes
              const pausedAt = new Date();
              const recheckAt = new Date(pausedAt.getTime() + 10 * 60 * 1000); // 10 minutes later
              this.spentValuePausedCampaigns.set(trafficstarId, {
                pausedAt,
                recheckAt,
                disabledThresholdForDate: currentUtcDate
              });
              
              console.log(`✅ Campaign ${trafficstarId} paused due to high spent value. Will recheck at ${recheckAt.toISOString()}`);
              
              // Disable click threshold checks for this campaign until next UTC date
              console.log(`Click threshold checks for campaign ${trafficstarId} disabled until next UTC date change`);
            } catch (error) {
              console.error(`Error pausing campaign ${trafficstarId} due to high spent value:`, error);
            }
          } else {
            const spentAmount = spentValue ? spentValue.totalSpent.toFixed(2) : '0.00';
            console.log(`Campaign ${trafficstarId} spent value: $${spentAmount} (below $10 threshold)`);
          }
        } catch (error) {
          console.error(`Error checking spent value for campaign ${trafficstarId}:`, error);
        }
      }
    } catch (error) {
      console.error('Error checking campaigns spent value:', error);
    }
  }

  /**
   * Get saved campaigns from database
   */
  async getSavedCampaigns() {
    return db.select().from(trafficstarCampaigns).orderBy(trafficstarCampaigns.name);
  }
  
  /**
   * Get campaign spent value by date range
   * @param id Campaign ID
   * @param dateFrom Optional start date in YYYY-MM-DD format (defaults to 7 days ago)
   * @param dateUntil Optional end date in YYYY-MM-DD format (defaults to today)
   * @returns Campaign stats including daily costs
   */
  async getCampaignSpentValue(id: number, dateFrom?: string, dateUntil?: string): Promise<any> {
    // In test mode, return consistent test data so we can verify the logic
    if (process.env.TEST_MODE === 'true') {
      console.log(`🧪 TEST MODE: Returning mock spent value data for campaign ${id}`);
      
      // Set default date range if not provided (last 7 days)
      const today = new Date();
      const sevenDaysAgo = new Date();
      sevenDaysAgo.setDate(today.getDate() - 7);
      
      const fromDate = dateFrom || sevenDaysAgo.toISOString().split('T')[0];
      const untilDate = dateUntil || today.toISOString().split('T')[0];
      
      // Use a fixed test value of $10.30 for today (above threshold)
      const testTotalSpent = 10.30;
      
      // Create daily costs with $10.30 for today, different values for other days
      const dailyCosts: {date: string, cost: number}[] = [];
      
      // Add current date with test cost
      dailyCosts.push({
        date: untilDate,
        cost: testTotalSpent
      });
      
      return {
        campaignId: id,
        totalSpent: testTotalSpent,
        dailyCosts,
        dateFrom: fromDate,
        dateUntil: untilDate,
        testMode: true
      };
    }
    
    // Normal operation (non-test mode)
    try {
      const token = await this.ensureToken();
      
      // Set default date range if not provided (last 7 days)
      const today = new Date();
      const sevenDaysAgo = new Date();
      sevenDaysAgo.setDate(today.getDate() - 7);
      
      const fromDate = dateFrom || sevenDaysAgo.toISOString().split('T')[0];
      const untilDate = dateUntil || today.toISOString().split('T')[0];
      
      // Add one day to untilDate as the API excludes the end date from the range
      const untilPlusOneDay = new Date(untilDate);
      untilPlusOneDay.setDate(untilPlusOneDay.getDate() + 1);
      const untilPlusOneDayFormatted = untilPlusOneDay.toISOString().split('T')[0];
      
      console.log(`Fetching spent value for campaign ${id} from ${fromDate} to ${untilDate}`);
      
      // We already handled TEST_MODE at the beginning of the method,
      // so we just proceed with normal API call here
      
      // Use the stats API to get campaign costs by day
      const response = await axios.get(
        `${API_BASE_URL}/stats/advertiser/day`,
        {
          headers: {
            'Authorization': `Bearer ${token}`,
            'Content-Type': 'application/json'
          },
          params: {
            campaign_id: id,
            date_from: fromDate,
            date_until: untilPlusOneDayFormatted,
            total: true
          },
          timeout: 30000 // 30 second timeout
        }
      );
      
      console.log(`Successfully retrieved spent value for campaign ${id}`);
      
      // Process the response to calculate totals and return detailed stats
      let totalSpent = 0;
      let totalImpressions = 0;
      let totalClicks = 0;
      let totalLeads = 0;
      
      if (response.data && response.data.response) {
        response.data.response.forEach((day: any) => {
          totalSpent += parseFloat(day.price || 0);
          totalImpressions += parseInt(day.impressions || 0, 10);
          totalClicks += parseInt(day.clicks || 0, 10);
          totalLeads += parseInt(day.leads || 0, 10);
        });
      }
      
      return {
        campaignId: id,
        dateRange: {
          from: fromDate,
          to: untilDate
        },
        dailyStats: response.data.response || [],
        totalSpent: parseFloat(totalSpent.toFixed(4)), // Add this field for direct access
        totals: {
          spent: parseFloat(totalSpent.toFixed(4)),
          impressions: totalImpressions,
          clicks: totalClicks,
          leads: totalLeads,
          ecpm: totalImpressions > 0 ? parseFloat((totalSpent * 1000 / totalImpressions).toFixed(4)) : 0,
          ecpc: totalClicks > 0 ? parseFloat((totalSpent / totalClicks).toFixed(4)) : 0,
          ecpa: totalLeads > 0 ? parseFloat((totalSpent / totalLeads).toFixed(4)) : 0,
          ctr: totalImpressions > 0 ? parseFloat((totalClicks * 100 / totalImpressions).toFixed(2)) : 0
        }
      };
    } catch (error: any) {
      console.error(`Error getting spent value for campaign ${id}:`, error.response?.data || error.message);
      throw new Error(`Failed to get spent value for campaign ${id}: ${error.response?.data?.msg || error.message}`);
    }
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
}

// Export a singleton instance
export const trafficStarService = new TrafficStarService();
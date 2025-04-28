/**
 * TrafficStar API Service
 * This service handles all interactions with the TrafficStar API
 */
import axios from 'axios';
import { db } from './db';
import { campaigns, urls } from '@shared/schema';
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
   * Ensure we have a valid access token
   */
  private async ensureToken(): Promise<string> {
    // Check if we have a valid token
    if (this.accessToken && this.tokenExpiry && new Date() < this.tokenExpiry) {
      return this.accessToken;
    }

    // Get API key from environment variable
    const apiKeyFromEnv = process.env.TRAFFICSTAR_API_KEY;
    let apiKey: string;
    
    if (apiKeyFromEnv) {
      apiKey = apiKeyFromEnv;
      console.log("Using TrafficStar API key from environment variable");
    } else {
      // Use default API key if no environment variable
      apiKey = "TraffiCS10928"; // Default API key from project requirements
      console.log("Using default TrafficStar API key");
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
          console.log(`Failed to get campaigns from API, returning ${savedCampaigns.length} saved campaigns from database`);
          return savedCampaigns;
        } else {
          console.log('No saved campaigns found in database, returning empty array');
          return [];
        }
      }
      
      return campaigns;
    } catch (error) {
      // If there's a general error, try to return any saved campaigns as a fallback
      console.error('Error getting campaigns from TrafficStar API:', error);
      
      try {
        const savedCampaigns = await this.getSavedCampaigns();
        if (savedCampaigns && savedCampaigns.length > 0) {
          console.log(`Error calling TrafficStar API, returning ${savedCampaigns.length} saved campaigns from database`);
          return savedCampaigns;
        }
      } catch (dbError) {
        console.error('Error getting saved campaigns from database:', dbError);
      }
      
      return [];
    }
  }
  
  /**
   * Get saved campaigns from the database
   */
  private async getSavedCampaigns(): Promise<Campaign[]> {
    // Fetch saved campaigns from database
    const dbCampaigns = await db.select().from(campaigns);
    
    // Convert to TrafficStar API format
    return dbCampaigns.map(dbCampaign => {
      return {
        id: dbCampaign.id,
        name: dbCampaign.name,
        status: dbCampaign.status || '',
        approved: dbCampaign.status || '',
        active: !!dbCampaign.active,
        is_archived: !!dbCampaign.isArchived,
        max_daily: dbCampaign.maxDaily || 0,
        pricing_model: 'cpv', // Default pricing model
        schedule_end_time: dbCampaign.endTime || ''
      };
    });
  }

  /**
   * Sync campaigns from TrafficStar to local database
   * @param apiCampaigns List of campaigns from TrafficStar API
   */
  private async syncCampaignsToDatabase(apiCampaigns: Campaign[]): Promise<void> {
    // Map to store campaigns by ID for efficient lookup
    const campaignMap = new Map<number, Campaign>();
    apiCampaigns.forEach(campaign => {
      campaignMap.set(campaign.id, campaign);
    });
    
    // For each campaign in API, update or create in database
    for (const apiCampaign of apiCampaigns) {
      try {
        // Check if campaign already exists
        const campaignId = Number(apiCampaign.id);
        const [existingCampaign] = await db
          .select()
          .from(campaigns)
          .where(eq(campaigns.trafficstarCampaignId, String(campaignId)));
        
        if (existingCampaign) {
          // Update existing campaign
          await db
            .update(campaigns)
            .set({
              name: apiCampaign.name,
              status: apiCampaign.status,
              active: apiCampaign.active,
              isArchived: apiCampaign.is_archived,
              maxDaily: apiCampaign.max_daily,
              pricingModel: apiCampaign.pricing_model,
              endTime: apiCampaign.schedule_end_time,
              updatedAt: new Date()
            })
            .where(eq(campaigns.trafficstarCampaignId, String(campaignId)));
          
          console.log(`Updated campaign ${apiCampaign.id} (${apiCampaign.name}) in database`);
        } else {
          // Create new campaign
          await db
            .insert(campaigns)
            .values({
              name: apiCampaign.name,
              trafficstarCampaignId: String(campaignId),
              status: apiCampaign.status,
              active: apiCampaign.active,
              isArchived: apiCampaign.is_archived,
              maxDaily: apiCampaign.max_daily,
              pricingModel: apiCampaign.pricing_model,
              endTime: apiCampaign.schedule_end_time,
              redirectMethod: 'weighted', // Default redirect method
              autoManagement: true // Auto-management is usually enabled
            });
          
          console.log(`Created new campaign ${apiCampaign.id} (${apiCampaign.name}) in database`);
        }
      } catch (error) {
        console.error(`Error syncing campaign ${apiCampaign.id} to database:`, error);
      }
    }
  }

  // Rest of the service implementation...
}

// Export singleton instance
export const trafficstarService = new TrafficStarService();
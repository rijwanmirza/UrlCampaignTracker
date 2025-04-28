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

  /**
   * Get a single campaign by ID
   */
  async getCampaign(id: number): Promise<Campaign | null> {
    try {
      const token = await this.ensureToken();
      
      // Try all base URLs to find the campaign
      for (const baseUrl of API_BASE_URLS) {
        try {
          const response = await axios.get(`${baseUrl}/campaigns/${id}`, {
            headers: {
              'Authorization': `Bearer ${token}`,
              'Accept': 'application/json'
            }
          });
          
          if (response.data && response.data.response) {
            return response.data.response;
          } else if (response.data && (response.data.id || response.data.campaign_id)) {
            // Direct campaign data
            return response.data;
          }
        } catch (error) {
          console.log(`Failed to get campaign ${id} from ${baseUrl}/campaigns/${id}:`, error);
          // Continue to next attempt
        }
      }
      
      // Fall back to database
      const [savedCampaign] = await db
        .select()
        .from(campaigns)
        .where(eq(campaigns.trafficstarCampaignId, String(id)));
      
      if (savedCampaign) {
        return {
          id: Number(savedCampaign.trafficstarCampaignId),
          name: savedCampaign.name,
          status: savedCampaign.status || '',
          approved: savedCampaign.status || '',
          active: !!savedCampaign.active,
          is_archived: !!savedCampaign.isArchived,
          max_daily: savedCampaign.maxDaily || 0,
          pricing_model: savedCampaign.pricingModel || 'cpv',
          schedule_end_time: savedCampaign.endTime || ''
        };
      }
      
      return null;
    } catch (error) {
      console.error(`Error getting campaign ${id} from TrafficStar:`, error);
      return null;
    }
  }
  
  /**
   * Get campaign spent value for a given date range
   */
  async getCampaignSpentValue(id: number, dateFrom?: string, dateUntil?: string): Promise<any> {
    try {
      // If in test mode, return mock data
      if (process.env.TEST_MODE === 'true') {
        console.log(`TEST MODE: Returning mock spent value data for campaign ${id}`);
        return {
          id: id,
          spent: 15.75, // Mock value over $10 to trigger protection
          impressions: 7825,
          clicks: 325,
          cpm: 2.01,
          ctr: 4.15,
          date_from: dateFrom || new Date().toISOString().split('T')[0],
          date_until: dateUntil || new Date().toISOString().split('T')[0]
        };
      }
      
      const token = await this.ensureToken();
      
      // Try all base URLs
      for (const baseUrl of API_BASE_URLS) {
        try {
          // Build URL with query parameters
          let url = `${baseUrl}/campaigns/${id}/statistics`;
          const params = new URLSearchParams();
          
          if (dateFrom) params.append('date_from', dateFrom);
          if (dateUntil) params.append('date_until', dateUntil);
          
          if (params.toString()) {
            url += `?${params.toString()}`;
          }
          
          const response = await axios.get(url, {
            headers: {
              'Authorization': `Bearer ${token}`,
              'Accept': 'application/json'
            }
          });
          
          if (response.data) {
            // Try to extract the statistics from various response formats
            if (response.data.response) {
              return response.data.response;
            } else if (response.data.statistics) {
              return response.data.statistics;
            } else if (response.data.data) {
              return response.data.data;
            } else {
              return response.data;
            }
          }
        } catch (error) {
          console.log(`Failed to get campaign ${id} statistics from ${baseUrl}:`, error);
          // Continue to next attempt
        }
      }
      
      // No data found
      return {
        id: id,
        spent: 0,
        impressions: 0,
        clicks: 0,
        cpm: 0,
        ctr: 0,
        date_from: dateFrom || new Date().toISOString().split('T')[0],
        date_until: dateUntil || new Date().toISOString().split('T')[0]
      };
    } catch (error) {
      console.error(`Error getting spent value for campaign ${id}:`, error);
      return {
        id: id,
        spent: 0,
        impressions: 0,
        clicks: 0,
        cpm: 0,
        ctr: 0,
        error: String(error)
      };
    }
  }
  
  /**
   * Save API key to environment and memory
   */
  async saveApiKey(apiKey: string): Promise<void> {
    // Store in environment variable
    process.env.TRAFFICSTAR_API_KEY = apiKey;
    
    // Clear token to force re-authentication
    this.accessToken = null;
    this.tokenExpiry = null;
    
    // Test the API key by attempting to get a token
    try {
      await this.ensureToken();
      console.log('Successfully authenticated with TrafficStar using new API key');
    } catch (error) {
      console.error('Error testing new TrafficStar API key:', error);
      throw new Error('Failed to authenticate with provided API key');
    }
  }
  
  /**
   * Activate a campaign in TrafficStar
   */
  async activateCampaign(id: number): Promise<boolean> {
    try {
      // In test mode, just return success
      if (process.env.TEST_MODE === 'true') {
        console.log(`TEST MODE: Pretending to activate campaign ${id}`);
        return true;
      }
      
      const token = await this.ensureToken();
      
      // Try all base URLs
      for (const baseUrl of API_BASE_URLS) {
        try {
          const response = await axios.patch(
            `${baseUrl}/campaigns/${id}`,
            { status: 'active' },
            {
              headers: {
                'Authorization': `Bearer ${token}`,
                'Content-Type': 'application/json',
                'Accept': 'application/json'
              }
            }
          );
          
          if (response.status >= 200 && response.status < 300) {
            console.log(`Successfully activated campaign ${id}`);
            return true;
          }
        } catch (error) {
          console.log(`Failed to activate campaign ${id} using ${baseUrl}:`, error);
          // Continue to next attempt
        }
      }
      
      // All attempts failed
      return false;
    } catch (error) {
      console.error(`Error activating campaign ${id}:`, error);
      return false;
    }
  }
  
  /**
   * Pause a campaign in TrafficStar
   */
  async pauseCampaign(id: number): Promise<boolean> {
    try {
      // In test mode, just return success
      if (process.env.TEST_MODE === 'true') {
        console.log(`TEST MODE: Pretending to pause campaign ${id}`);
        return true;
      }
      
      const token = await this.ensureToken();
      
      // Try all base URLs
      for (const baseUrl of API_BASE_URLS) {
        try {
          const response = await axios.patch(
            `${baseUrl}/campaigns/${id}`,
            { status: 'paused' },
            {
              headers: {
                'Authorization': `Bearer ${token}`,
                'Content-Type': 'application/json',
                'Accept': 'application/json'
              }
            }
          );
          
          if (response.status >= 200 && response.status < 300) {
            console.log(`Successfully paused campaign ${id}`);
            return true;
          }
        } catch (error) {
          console.log(`Failed to pause campaign ${id} using ${baseUrl}:`, error);
          // Continue to next attempt
        }
      }
      
      // All attempts failed
      return false;
    } catch (error) {
      console.error(`Error pausing campaign ${id}:`, error);
      return false;
    }
  }
  
  /**
   * Update campaign budget in TrafficStar
   */
  async updateCampaignBudget(id: number, budget: number): Promise<boolean> {
    try {
      // In test mode, just return success
      if (process.env.TEST_MODE === 'true') {
        console.log(`TEST MODE: Pretending to update budget for campaign ${id} to ${budget}`);
        return true;
      }
      
      const token = await this.ensureToken();
      
      // Try all base URLs
      for (const baseUrl of API_BASE_URLS) {
        try {
          const response = await axios.patch(
            `${baseUrl}/campaigns/${id}`,
            { max_daily: budget },
            {
              headers: {
                'Authorization': `Bearer ${token}`,
                'Content-Type': 'application/json',
                'Accept': 'application/json'
              }
            }
          );
          
          if (response.status >= 200 && response.status < 300) {
            console.log(`Successfully updated budget for campaign ${id} to ${budget}`);
            return true;
          }
        } catch (error) {
          console.log(`Failed to update budget for campaign ${id} using ${baseUrl}:`, error);
          // Continue to next attempt
        }
      }
      
      // All attempts failed
      return false;
    } catch (error) {
      console.error(`Error updating budget for campaign ${id}:`, error);
      return false;
    }
  }
  
  /**
   * Get cached campaign status from database
   */
  async getCachedCampaignStatus(id: number): Promise<any> {
    try {
      const [campaign] = await db
        .select()
        .from(campaigns)
        .where(eq(campaigns.trafficstarCampaignId, String(id)));
      
      if (campaign) {
        return {
          id: Number(campaign.trafficstarCampaignId),
          status: campaign.status,
          active: campaign.active
        };
      }
      
      return null;
    } catch (error) {
      console.error(`Error getting cached status for campaign ${id}:`, error);
      return null;
    }
  }
  
  /**
   * Check if campaign is paused due to spent value and get recheck info
   */
  getSpentValuePauseInfo(id: number, currentDate: Date): { pausedAt: Date, recheckAt: Date, disabledThresholdForDate: string } | null {
    // Check if campaign is in the paused map
    const pauseInfo = this.spentValuePausedCampaigns.get(id);
    
    if (pauseInfo) {
      // If this pause is for today's date, return the info
      if (pauseInfo.disabledThresholdForDate === currentDate.toISOString().split('T')[0]) {
        return pauseInfo;
      }
    }
    
    return null;
  }
  
  /**
   * Auto-manage campaigns based on click thresholds
   */
  async autoManageCampaigns(): Promise<void> {
    try {
      // Get campaigns with TrafficStar IDs
      const campaignsWithTrafficStar = await db
        .select()
        .from(campaigns)
        .where(and(
          isNotNull(campaigns.trafficstarCampaignId),
          eq(campaigns.autoManagement, true)
        ));
      
      console.log(`Found ${campaignsWithTrafficStar.length} campaigns with TrafficStar integration`);
      
      // Process each campaign
      for (const campaign of campaignsWithTrafficStar) {
        try {
          // Skip campaigns that are not active
          if (campaign.status !== 'active' && !campaign.active) {
            console.log(`Skipping inactive campaign ${campaign.id} (${campaign.name})`);
            continue;
          }
          
          // Get all URLs for this campaign
          const campaignUrls = await storage.getUrls(campaign.id);
          const activeUrls = campaignUrls.filter(url => url.status === 'active');
          
          console.log(`Campaign ${campaign.id} (${campaign.name}) has ${activeUrls.length} active URLs`);
          
          // Calculate total clicks for active URLs
          let totalClicks = 0;
          for (const url of activeUrls) {
            totalClicks += url.clicks || 0;
          }
          
          console.log(`Campaign ${campaign.id} has ${totalClicks} total clicks across all URLs`);
          
          // Check if total clicks exceeds threshold
          const clickThreshold = campaign.clickThreshold || 15000; // Default to 15000
          
          if (totalClicks >= clickThreshold) {
            console.log(`Campaign ${campaign.id} has exceeded click threshold (${totalClicks}/${clickThreshold})`);
            
            // Check if campaign is already paused due to spent value
            const currentDate = new Date();
            const currentDateString = currentDate.toISOString().split('T')[0];
            const pauseInfo = this.getSpentValuePauseInfo(Number(campaign.trafficstarCampaignId), currentDate);
            
            if (pauseInfo) {
              console.log(`Campaign ${campaign.id} is already paused due to spent value - won't pause again due to clicks`);
              continue;
            }
            
            // Pause the campaign in TrafficStar
            const trafficstarId = Number(campaign.trafficstarCampaignId);
            const success = await this.pauseCampaign(trafficstarId);
            
            if (success) {
              console.log(`Successfully paused campaign ${campaign.id} due to click threshold`);
              
              // Update local database status
              await db
                .update(campaigns)
                .set({
                  status: 'paused',
                  active: false,
                  updatedAt: new Date()
                })
                .where(eq(campaigns.id, campaign.id));
            } else {
              console.log(`Failed to pause campaign ${campaign.id} in TrafficStar`);
            }
          } else {
            // Check if campaign is paused but clicks are now below threshold
            if (campaign.status === 'paused' || !campaign.active) {
              console.log(`Campaign ${campaign.id} is paused but clicks are below threshold (${totalClicks}/${clickThreshold})`);
              
              // Check if campaign is paused due to spent value
              const currentDate = new Date();
              const pauseInfo = this.getSpentValuePauseInfo(Number(campaign.trafficstarCampaignId), currentDate);
              
              if (pauseInfo) {
                console.log(`Campaign ${campaign.id} is paused due to spent value - can't reactivate yet`);
                console.log(`Recheck scheduled for ${pauseInfo.recheckAt.toISOString()}`);
                continue;
              }
              
              // Activate the campaign in TrafficStar
              const trafficstarId = Number(campaign.trafficstarCampaignId);
              const success = await this.activateCampaign(trafficstarId);
              
              if (success) {
                console.log(`Successfully reactivated campaign ${campaign.id} as clicks are now below threshold`);
                
                // Update local database status
                await db
                  .update(campaigns)
                  .set({
                    status: 'active',
                    active: true,
                    updatedAt: new Date()
                  })
                  .where(eq(campaigns.id, campaign.id));
              } else {
                console.log(`Failed to reactivate campaign ${campaign.id} in TrafficStar`);
              }
            }
          }
        } catch (error) {
          console.error(`Error processing campaign ${campaign.id}:`, error);
        }
      }
    } catch (error) {
      console.error('Error auto-managing campaigns:', error);
    }
  }
  
  /**
   * Check all campaigns' spent values
   */
  async checkCampaignsSpentValue(): Promise<void> {
    try {
      // Get campaigns with TrafficStar IDs
      const campaignsWithTrafficStar = await db
        .select()
        .from(campaigns)
        .where(and(
          isNotNull(campaigns.trafficstarCampaignId),
          eq(campaigns.autoManagement, true)
        ));
      
      console.log(`Checking spent values for ${campaignsWithTrafficStar.length} campaigns with TrafficStar integration`);
      
      // Get current date in YYYY-MM-DD format
      const currentDate = new Date();
      const dateString = currentDate.toISOString().split('T')[0];
      
      // Process each campaign
      for (const campaign of campaignsWithTrafficStar) {
        try {
          const trafficstarId = Number(campaign.trafficstarCampaignId);
          
          // If in mock/test mode, get mock data
          let spentData;
          if (process.env.TEST_MODE === 'true') {
            spentData = {
              spent: 12.50, // Mock value over $10 to trigger protection
              impressions: 6250,
              clicks: 250
            };
          } else {
            // Get spent value for today only
            spentData = await this.getCampaignSpentValue(trafficstarId, dateString, dateString);
          }
          
          console.log(`Campaign ${campaign.id} (${campaign.name}): spent $${spentData.spent} today`);
          
          // Check if spent is over $10
          if (spentData.spent > 10) {
            console.log(`Campaign ${campaign.id} has exceeded $10 daily spend: $${spentData.spent}`);
            
            // Pause the campaign in TrafficStar
            const success = await this.pauseCampaign(trafficstarId);
            
            if (success) {
              console.log(`Successfully paused campaign ${campaign.id} due to high spent value`);
              
              // Update local database status
              await db
                .update(campaigns)
                .set({
                  status: 'paused',
                  active: false,
                  updatedAt: new Date()
                })
                .where(eq(campaigns.id, campaign.id));
              
              // Record this campaign as paused due to spent value
              // Set recheck time to 10 minutes from now
              const pausedAt = new Date();
              const recheckAt = new Date(pausedAt.getTime() + 10 * 60 * 1000);
              
              this.spentValuePausedCampaigns.set(trafficstarId, {
                pausedAt,
                recheckAt,
                disabledThresholdForDate: dateString
              });
              
              console.log(`Scheduled recheck for campaign ${campaign.id} at ${recheckAt.toISOString()}`);
            } else {
              console.log(`Failed to pause campaign ${campaign.id} in TrafficStar due to high spent value`);
            }
          } else {
            // Check if campaign is paused due to spent value and recheck time has passed
            const pauseInfo = this.spentValuePausedCampaigns.get(trafficstarId);
            
            if (pauseInfo && pauseInfo.disabledThresholdForDate === dateString) {
              // Check if recheck time has passed
              if (new Date() >= pauseInfo.recheckAt) {
                console.log(`Recheck time has passed for campaign ${campaign.id} paused due to spent value`);
                console.log(`Current spent value is $${spentData.spent}, below $10 threshold`);
                
                // Activate the campaign in TrafficStar
                const success = await this.activateCampaign(trafficstarId);
                
                if (success) {
                  console.log(`Successfully reactivated campaign ${campaign.id} after spent value recheck`);
                  
                  // Update local database status
                  await db
                    .update(campaigns)
                    .set({
                      status: 'active',
                      active: true,
                      updatedAt: new Date()
                    })
                    .where(eq(campaigns.id, campaign.id));
                  
                  // Remove from paused campaigns map
                  this.spentValuePausedCampaigns.delete(trafficstarId);
                } else {
                  console.log(`Failed to reactivate campaign ${campaign.id} in TrafficStar after spent value recheck`);
                }
              } else {
                console.log(`Campaign ${campaign.id} is paused due to spent value, recheck scheduled for ${pauseInfo.recheckAt.toISOString()}`);
                console.log(`Minutes until recheck: ${Math.ceil((pauseInfo.recheckAt.getTime() - Date.now()) / (60 * 1000))}`);
              }
            }
          }
        } catch (error) {
          console.error(`Error checking spent value for campaign ${campaign.id}:`, error);
        }
      }
    } catch (error) {
      console.error('Error checking campaigns spent values:', error);
    }
  }
  
  /**
   * Track a URL for budget update after a delay
   */
  async trackNewUrlForBudgetUpdate(urlId: number, campaignId: number, clickValue: number): Promise<void> {
    try {
      // Calculate update time (10 minutes from now)
      const receivedAt = new Date();
      const updateAt = new Date(receivedAt.getTime() + 10 * 60 * 1000);
      
      console.log(`Tracking URL ${urlId} in campaign ${campaignId} for budget update at ${updateAt.toISOString()}`);
      console.log(`URL click value: ${clickValue}`);
      
      // Add to pending URL budgets map
      if (!this.pendingUrlBudgets.has(campaignId)) {
        this.pendingUrlBudgets.set(campaignId, []);
      }
      
      const pendingList = this.pendingUrlBudgets.get(campaignId)!;
      pendingList.push({
        urlId,
        campaignId,
        receivedAt,
        updateAt,
        clickValue,
        processed: false
      });
      
      // Store the pending update in database
      const [existingCampaign] = await db
        .select()
        .from(campaigns)
        .where(eq(campaigns.id, campaignId));
      
      if (existingCampaign && existingCampaign.trafficstarCampaignId) {
        try {
          // Execute a raw SQL query to insert into table (in case it doesn't exist yet)
          await db.execute(sql`
            CREATE TABLE IF NOT EXISTS "pending_url_budget_updates" (
              "id" SERIAL PRIMARY KEY,
              "urlId" INTEGER NOT NULL REFERENCES "urls"("id") ON DELETE CASCADE,
              "campaignId" INTEGER NOT NULL REFERENCES "campaigns"("id") ON DELETE CASCADE,
              "receivedAt" TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
              "updateAt" TIMESTAMP NOT NULL,
              "clickValue" INTEGER NOT NULL,
              "processed" BOOLEAN NOT NULL DEFAULT FALSE
            )
          `);
          
          // Insert the pending update
          await db.execute(sql`
            INSERT INTO "pending_url_budget_updates" 
            ("urlId", "campaignId", "receivedAt", "updateAt", "clickValue", "processed") 
            VALUES (${urlId}, ${campaignId}, ${receivedAt.toISOString()}, ${updateAt.toISOString()}, ${clickValue}, FALSE)
          `);
          
          console.log(`Stored pending URL budget update in database for URL ${urlId}`);
        } catch (error) {
          console.error(`Error storing pending URL budget update in database:`, error);
        }
      } else {
        console.log(`Campaign ${campaignId} not found or has no TrafficStar ID, not storing pending URL budget update`);
      }
    } catch (error) {
      console.error(`Error tracking URL ${urlId} for budget update:`, error);
    }
  }
  
  /**
   * Process pending URL budget updates
   */
  async processPendingUrlBudgetUpdates(): Promise<void> {
    try {
      console.log('Processing pending URL budget updates...');
      
      // Get current time
      const now = new Date();
      
      // Loop through all campaign IDs with pending updates
      for (const [campaignId, pendingUpdates] of this.pendingUrlBudgets.entries()) {
        try {
          // Filter updates that are ready to process and not processed yet
          const readyUpdates = pendingUpdates.filter(update => 
            !update.processed && now >= update.updateAt
          );
          
          if (readyUpdates.length > 0) {
            console.log(`Found ${readyUpdates.length} pending URL budget updates ready for campaign ${campaignId}`);
            
            // Get campaign from database
            const [campaign] = await db
              .select()
              .from(campaigns)
              .where(eq(campaigns.id, campaignId));
            
            if (campaign && campaign.trafficstarCampaignId) {
              // Calculate total click value
              let totalClickValue = 0;
              for (const update of readyUpdates) {
                totalClickValue += update.clickValue;
              }
              
              console.log(`Total click value to add to budget: ${totalClickValue}`);
              
              // Get current campaign max daily budget
              const trafficstarId = Number(campaign.trafficstarCampaignId);
              const currentCampaign = await this.getCampaign(trafficstarId);
              
              if (currentCampaign) {
                const currentBudget = currentCampaign.max_daily || 0;
                const newBudget = currentBudget + totalClickValue;
                
                console.log(`Current budget: ${currentBudget}, New budget: ${newBudget}`);
                
                // Update budget in TrafficStar
                const success = await this.updateCampaignBudget(trafficstarId, newBudget);
                
                if (success) {
                  console.log(`Successfully updated budget for campaign ${campaignId} to ${newBudget}`);
                  
                  // Mark updates as processed
                  for (const update of readyUpdates) {
                    update.processed = true;
                  }
                  
                  // Update in database
                  try {
                    await db.execute(sql`
                      UPDATE "pending_url_budget_updates"
                      SET "processed" = TRUE
                      WHERE "campaignId" = ${campaignId} AND "processed" = FALSE
                    `);
                  } catch (error) {
                    console.error(`Error updating pending URL budget updates in database:`, error);
                  }
                } else {
                  console.log(`Failed to update budget for campaign ${campaignId} in TrafficStar`);
                }
              } else {
                console.log(`Failed to get current campaign data for ${campaignId} from TrafficStar`);
              }
            } else {
              console.log(`Campaign ${campaignId} not found or has no TrafficStar ID, skipping budget update`);
            }
          }
        } catch (error) {
          console.error(`Error processing pending URL budget updates for campaign ${campaignId}:`, error);
        }
      }
      
      // Clean up processed updates
      for (const [campaignId, pendingUpdates] of this.pendingUrlBudgets.entries()) {
        const remainingUpdates = pendingUpdates.filter(update => !update.processed);
        if (remainingUpdates.length === 0) {
          // If all updates processed, remove campaign from map
          this.pendingUrlBudgets.delete(campaignId);
        } else {
          // Otherwise, update the list with only unprocessed updates
          this.pendingUrlBudgets.set(campaignId, remainingUpdates);
        }
      }
    } catch (error) {
      console.error('Error processing pending URL budget updates:', error);
    }
  }
  
  /**
   * Get all saved campaigns from database
   */
  async getSavedCampaigns(): Promise<any[]> {
    try {
      const dbCampaigns = await db.select().from(campaigns);
      return dbCampaigns.filter(c => c.trafficstarCampaignId).map(c => ({
        id: Number(c.trafficstarCampaignId),
        name: c.name,
        status: c.status,
        active: c.active,
        max_daily: c.maxDaily
      }));
    } catch (error) {
      console.error('Error getting saved campaigns:', error);
      return [];
    }
  }
  
  /**
   * Schedule automatic management of TrafficStar campaigns
   * Sets up periodic checks for campaign monitoring
   */
  async scheduleAutoManagement(): Promise<void> {
    console.log('Setting up TrafficStar campaign auto-management scheduler');
    
    // Initial checks
    try {
      await this.autoManageCampaigns();
      console.log('Initial campaign auto-management completed successfully');
    } catch (error) {
      console.error('Error during initial campaign auto-management:', error);
    }
    
    try {
      await this.checkCampaignsSpentValue();
      console.log('Initial spent value check completed successfully');
    } catch (error) {
      console.error('Error during initial spent value check:', error);
    }
    
    try {
      await this.processPendingUrlBudgetUpdates();
      console.log('Initial URL budget updates processed successfully');
    } catch (error) {
      console.error('Error during initial URL budget updates processing:', error);
    }
    
    // Schedule periodic checks
    setInterval(async () => {
      try {
        await this.autoManageCampaigns();
        console.log('Periodic campaign auto-management completed');
      } catch (error) {
        console.error('Error during periodic campaign auto-management:', error);
      }
    }, 5 * 60 * 1000); // Every 5 minutes
    
    setInterval(async () => {
      try {
        await this.checkCampaignsSpentValue();
        console.log('Periodic spent value check completed');
      } catch (error) {
        console.error('Error during periodic spent value check:', error);
      }
    }, 10 * 60 * 1000); // Every 10 minutes
    
    setInterval(async () => {
      try {
        await this.processPendingUrlBudgetUpdates();
        console.log('Periodic URL budget updates processed');
      } catch (error) {
        console.error('Error during periodic URL budget updates processing:', error);
      }
    }, 3 * 60 * 1000); // Every 3 minutes
    
    console.log('TrafficStar campaign auto-management scheduler configured successfully');
  }
}

// Export singleton instance
export const trafficStarService = new TrafficStarService();
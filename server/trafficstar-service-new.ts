/**
 * TrafficStar API Service
 * This service handles all interactions with the TrafficStar API for spent value tracking and budget updates
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
      
      // First try to get the campaign from our database cache
      const [savedCampaign] = await db
        .select()
        .from(trafficstarCampaigns)
        .where(eq(trafficstarCampaigns.trafficstarId, id.toString()));
      
      if (savedCampaign && savedCampaign.campaignData) {
        // Return the cached campaign data if available
        return savedCampaign.campaignData as Campaign;
      }
      
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
              console.log(`Successfully retrieved campaign ${id} from ${baseUrl}/campaigns/${id} with response wrapper`);
              campaign = response.data.response;
              success = true;
              break;
            }
          }
        } catch (error) {
          console.log(`Failed to get campaign ${id} using endpoint: ${baseUrl}/campaigns/${id}`);
          lastError = error;
          // Continue to next attempt
        }
      }
      
      if (!success) {
        if (savedCampaign) {
          // If we have a saved campaign but no campaignData, construct a basic Campaign object
          campaign = {
            id: parseInt(savedCampaign.trafficstarId),
            name: savedCampaign.name || '',
            status: savedCampaign.status || '',
            approved: savedCampaign.status || '',
            active: !!savedCampaign.active,
            is_archived: !!savedCampaign.isArchived,
            max_daily: savedCampaign.maxDaily ? parseFloat(savedCampaign.maxDaily) : 0,
            pricing_model: savedCampaign.pricingModel || '',
            schedule_end_time: savedCampaign.scheduleEndTime || ''
          };
          return campaign;
        }
        
        throw new Error(`Failed to get campaign ${id} from TrafficStar API after trying all endpoints. Last error: ${lastError}`);
      }
      
      // Save the campaign data to our database
      if (campaign) {
        // Check if we already have this campaign in our database
        if (savedCampaign) {
          // Update the existing record
          await db.update(trafficstarCampaigns)
            .set({
              name: campaign.name,
              status: campaign.status,
              active: campaign.active,
              isArchived: campaign.is_archived,
              maxDaily: campaign.max_daily ? campaign.max_daily.toString() : '0',
              pricingModel: campaign.pricing_model || '',
              scheduleEndTime: campaign.schedule_end_time || '',
              campaignData: campaign,
              updatedAt: new Date()
            })
            .where(eq(trafficstarCampaigns.id, savedCampaign.id));
        } else {
          // Insert a new record
          await db.insert(trafficstarCampaigns)
            .values({
              trafficstarId: id.toString(),
              name: campaign.name,
              status: campaign.status,
              active: campaign.active,
              isArchived: campaign.is_archived,
              maxDaily: campaign.max_daily ? campaign.max_daily.toString() : '0',
              pricingModel: campaign.pricing_model || '',
              scheduleEndTime: campaign.schedule_end_time || '',
              campaignData: campaign
            });
        }
      }
      
      return campaign;
    } catch (error) {
      console.error(`Error getting TrafficStar campaign ${id}:`, error);
      throw new Error(`Failed to get campaign ${id} from TrafficStar API`);
    }
  }

  /**
   * Get all saved TrafficStar campaigns from our database
   */
  async getSavedCampaigns() {
    return await db.select().from(trafficstarCampaigns);
  }

  /**
   * Sync received campaigns to our database for caching
   */
  private async syncCampaignsToDatabase(campaigns: Campaign[]) {
    try {
      for (const campaign of campaigns) {
        if (!campaign.id) continue;
        
        // Check if we already have this campaign in our database
        const [existingCampaign] = await db
          .select()
          .from(trafficstarCampaigns)
          .where(eq(trafficstarCampaigns.trafficstarId, campaign.id.toString()));
        
        // Format the end time consistently for database storage
        let endTimeFormatted = campaign.schedule_end_time || '';
        if (endTimeFormatted) {
          endTimeFormatted = this.normalizeEndTimeFormat(endTimeFormatted);
        }
        
        if (existingCampaign) {
          // Update the existing record
          await db.update(trafficstarCampaigns)
            .set({
              name: campaign.name,
              status: campaign.status,
              active: campaign.active,
              isArchived: campaign.is_archived,
              maxDaily: campaign.max_daily ? campaign.max_daily.toString() : '0',
              pricingModel: campaign.pricing_model || '',
              scheduleEndTime: endTimeFormatted,
              campaignData: campaign,
              updatedAt: new Date()
            })
            .where(eq(trafficstarCampaigns.id, existingCampaign.id));
        } else {
          // Insert a new record
          await db.insert(trafficstarCampaigns)
            .values({
              trafficstarId: campaign.id.toString(),
              name: campaign.name,
              status: campaign.status,
              active: campaign.active,
              isArchived: campaign.is_archived,
              maxDaily: campaign.max_daily ? campaign.max_daily.toString() : '0',
              pricingModel: campaign.pricing_model || '',
              scheduleEndTime: endTimeFormatted,
              campaignData: campaign
            });
        }
      }
      
      console.log(`Synced ${campaigns.length} campaigns to database`);
    } catch (error) {
      console.error('Error syncing campaigns to database:', error);
    }
  }

  /**
   * Get campaign status from API
   */
  async getCampaignStatus(id: number): Promise<{ active: boolean, status: string }> {
    try {
      const campaign = await this.getCampaign(id);
      return {
        active: campaign.active,
        status: campaign.status
      };
    } catch (error) {
      console.error(`Error getting campaign ${id} status:`, error);
      throw new Error(`Failed to get campaign ${id} status from TrafficStar API`);
    }
  }

  /**
   * Get cached campaign status from database
   */
  async getCachedCampaignStatus(id: number): Promise<{ active: boolean, status: string } | null> {
    try {
      const [savedCampaign] = await db
        .select()
        .from(trafficstarCampaigns)
        .where(eq(trafficstarCampaigns.trafficstarId, id.toString()));
      
      if (savedCampaign) {
        return {
          active: !!savedCampaign.active,
          status: savedCampaign.status || ''
        };
      }
      
      return null;
    } catch (error) {
      console.error(`Error getting cached campaign ${id} status:`, error);
      return null;
    }
  }
  
  /**
   * Activate a campaign
   */
  async activateCampaign(id: number): Promise<void> {
    try {
      const token = await this.ensureToken();
      
      let success = false;
      let lastError = null;
      
      // Try different endpoint patterns
      for (const baseUrl of API_BASE_URLS) {
        try {
          console.log(`Trying to activate campaign ${id} using endpoint: ${baseUrl}/campaigns/${id}/activate`);
          const response = await axios.post(`${baseUrl}/campaigns/${id}/activate`, {}, {
            headers: {
              'Authorization': `Bearer ${token}`,
              'Accept': 'application/json'
            },
          });
          
          if (response.status === 200 || response.status === 201 || response.status === 204) {
            console.log(`Successfully activated campaign ${id}`);
            success = true;
            
            // Update our database record
            await db.update(trafficstarCampaigns)
              .set({
                active: true,
                status: 'active',
                updatedAt: new Date()
              })
              .where(eq(trafficstarCampaigns.trafficstarId, id.toString()));
            
            break;
          }
        } catch (error) {
          console.log(`Failed to activate campaign ${id} using endpoint: ${baseUrl}/campaigns/${id}/activate`);
          lastError = error;
          // Continue to next attempt
        }
        
        // Try alternate endpoint pattern
        try {
          console.log(`Trying alternate endpoint to activate campaign ${id}: ${baseUrl}/campaigns/${id}`);
          const response = await axios.put(`${baseUrl}/campaigns/${id}`, {
            active: true
          }, {
            headers: {
              'Authorization': `Bearer ${token}`,
              'Accept': 'application/json',
              'Content-Type': 'application/json'
            },
          });
          
          if (response.status === 200 || response.status === 201 || response.status === 204) {
            console.log(`Successfully activated campaign ${id} using alternate endpoint`);
            success = true;
            
            // Update our database record
            await db.update(trafficstarCampaigns)
              .set({
                active: true,
                status: 'active',
                updatedAt: new Date()
              })
              .where(eq(trafficstarCampaigns.trafficstarId, id.toString()));
            
            break;
          }
        } catch (error) {
          console.log(`Failed to activate campaign ${id} using alternate endpoint: ${baseUrl}/campaigns/${id}`);
          // Continue to next attempt
        }
      }
      
      if (!success) {
        throw new Error(`Failed to activate campaign ${id} after trying all endpoints. Last error: ${lastError}`);
      }
    } catch (error) {
      console.error(`Error activating campaign ${id}:`, error);
      throw new Error(`Failed to activate campaign ${id}`);
    }
  }
  
  /**
   * Pause a campaign
   */
  async pauseCampaign(id: number): Promise<void> {
    try {
      const token = await this.ensureToken();
      
      let success = false;
      let lastError = null;
      
      // Try different endpoint patterns
      for (const baseUrl of API_BASE_URLS) {
        try {
          console.log(`Trying to pause campaign ${id} using endpoint: ${baseUrl}/campaigns/${id}/pause`);
          const response = await axios.post(`${baseUrl}/campaigns/${id}/pause`, {}, {
            headers: {
              'Authorization': `Bearer ${token}`,
              'Accept': 'application/json'
            },
          });
          
          if (response.status === 200 || response.status === 201 || response.status === 204) {
            console.log(`Successfully paused campaign ${id}`);
            success = true;
            
            // Update our database record
            await db.update(trafficstarCampaigns)
              .set({
                active: false,
                status: 'paused',
                updatedAt: new Date()
              })
              .where(eq(trafficstarCampaigns.trafficstarId, id.toString()));
            
            break;
          }
        } catch (error) {
          console.log(`Failed to pause campaign ${id} using endpoint: ${baseUrl}/campaigns/${id}/pause`);
          lastError = error;
          // Continue to next attempt
        }
        
        // Try alternate endpoint pattern
        try {
          console.log(`Trying alternate endpoint to pause campaign ${id}: ${baseUrl}/campaigns/${id}`);
          const response = await axios.put(`${baseUrl}/campaigns/${id}`, {
            active: false
          }, {
            headers: {
              'Authorization': `Bearer ${token}`,
              'Accept': 'application/json',
              'Content-Type': 'application/json'
            },
          });
          
          if (response.status === 200 || response.status === 201 || response.status === 204) {
            console.log(`Successfully paused campaign ${id} using alternate endpoint`);
            success = true;
            
            // Update our database record
            await db.update(trafficstarCampaigns)
              .set({
                active: false,
                status: 'paused',
                updatedAt: new Date()
              })
              .where(eq(trafficstarCampaigns.trafficstarId, id.toString()));
            
            break;
          }
        } catch (error) {
          console.log(`Failed to pause campaign ${id} using alternate endpoint: ${baseUrl}/campaigns/${id}`);
          // Continue to next attempt
        }
      }
      
      if (!success) {
        throw new Error(`Failed to pause campaign ${id} after trying all endpoints. Last error: ${lastError}`);
      }
    } catch (error) {
      console.error(`Error pausing campaign ${id}:`, error);
      throw new Error(`Failed to pause campaign ${id}`);
    }
  }

  /**
   * Update the campaign's daily budget
   */
  async updateCampaignBudget(id: number, maxDaily: number): Promise<void> {
    try {
      const token = await this.ensureToken();
      
      // First get the current campaign to see if budget needs update
      const campaign = await this.getCampaign(id);
      const currentBudget = campaign.max_daily;
      
      if (currentBudget === maxDaily) {
        console.log(`Campaign ${id} already has max_daily of ${maxDaily} - no update needed`);
        return;
      }
      
      console.log(`Updating campaign ${id} budget from ${currentBudget} to ${maxDaily}`);
      
      let success = false;
      let lastError = null;
      
      // Try different endpoint patterns
      for (const baseUrl of API_BASE_URLS) {
        try {
          console.log(`Trying to update campaign ${id} budget using endpoint: ${baseUrl}/campaigns/${id}`);
          const response = await axios.put(`${baseUrl}/campaigns/${id}`, {
            max_daily: maxDaily
          }, {
            headers: {
              'Authorization': `Bearer ${token}`,
              'Accept': 'application/json',
              'Content-Type': 'application/json'
            },
          });
          
          if (response.status === 200 || response.status === 201 || response.status === 204) {
            console.log(`Successfully updated budget for campaign ${id} to ${maxDaily}`);
            success = true;
            
            // Update our database record
            await db.update(trafficstarCampaigns)
              .set({
                maxDaily: maxDaily.toString(),
                updatedAt: new Date()
              })
              .where(eq(trafficstarCampaigns.trafficstarId, id.toString()));
            
            break;
          }
        } catch (error) {
          console.log(`Failed to update budget for campaign ${id} using endpoint: ${baseUrl}/campaigns/${id}`);
          lastError = error;
          // Continue to next attempt
        }
      }
      
      if (!success) {
        throw new Error(`Failed to update budget for campaign ${id} after trying all endpoints. Last error: ${lastError}`);
      }
    } catch (error) {
      console.error(`Error updating budget for campaign ${id}:`, error);
      throw new Error(`Failed to update budget for campaign ${id}`);
    }
  }

  /**
   * Update the campaign's end time
   */
  async updateCampaignEndTime(id: number, scheduleEndTime: string): Promise<void> {
    try {
      const token = await this.ensureToken();
      
      // First get the current campaign to see if end time needs update
      const apiCampaign = await this.getCampaign(id);
      let currentEndTime = '';
      
      if (apiCampaign && apiCampaign.schedule_end_time) {
        currentEndTime = apiCampaign.schedule_end_time;
        
        // Normalize both for comparison
        const normalizedCurrent = this.normalizeEndTimeFormat(currentEndTime);
        const normalizedTarget = this.normalizeEndTimeFormat(scheduleEndTime);
        
        if (normalizedCurrent === normalizedTarget) {
          console.log(`Campaign ${id} already has end time of ${scheduleEndTime} - no update needed`);
          
          // Still update our local record to ensure format consistency
          await db.update(trafficstarCampaigns)
            .set({
              scheduleEndTime: currentEndTime,
              updatedAt: new Date()
            })
            .where(eq(trafficstarCampaigns.trafficstarId, id.toString()));
            
          return;
        }
        
        console.log(`Campaign ${id} has end time of ${currentEndTime}, needs update to ${scheduleEndTime}`);
      } else {
        console.log(`Campaign ${id} has no end time set, setting to ${scheduleEndTime}`);
      }
      
      // Format the end time consistently for API calls
      // The API may expect a specific format
      let formattedEndTime = scheduleEndTime;
      
      if (scheduleEndTime.includes('/')) {
        // Convert DD/MM/YYYY to YYYY-MM-DD
        const parts = scheduleEndTime.split(' ');
        if (parts.length === 2) {
          const dateParts = parts[0].split('/');
          if (dateParts.length === 3) {
            formattedEndTime = `${dateParts[2]}-${dateParts[1]}-${dateParts[0]} ${parts[1]}`;
          }
        }
      } else if (scheduleEndTime.includes('T')) {
        // Convert ISO format to YYYY-MM-DD HH:MM:SS
        formattedEndTime = scheduleEndTime.replace('T', ' ').replace(/\.\d+Z$/, '');
      }
      
      let success = false;
      let lastError = null;
      
      // Try different endpoint patterns
      for (const baseUrl of API_BASE_URLS) {
        try {
          console.log(`Setting campaign ${id} end time to: ${formattedEndTime} (original input: ${scheduleEndTime})`);
          console.log(`Trying to update campaign ${id} end time using endpoint: ${baseUrl}/campaigns/${id}`);
          
          const response = await axios.put(`${baseUrl}/campaigns/${id}`, {
            schedule_end_time: formattedEndTime
          }, {
            headers: {
              'Authorization': `Bearer ${token}`,
              'Accept': 'application/json',
              'Content-Type': 'application/json'
            },
          });
          
          if (response.status === 200 || response.status === 201 || response.status === 204) {
            console.log(`Successfully updated end time for campaign ${id} to ${formattedEndTime}`);
            success = true;
            
            // Update our database record
            await db.update(trafficstarCampaigns)
              .set({ scheduleEndTime, updatedAt: new Date() })
              .where(eq(trafficstarCampaigns.trafficstarId, id.toString()));
            
            break;
          }
        } catch (error) {
          console.log(`Failed to update end time for campaign ${id} using endpoint: ${baseUrl}/campaigns/${id}`);
          lastError = error;
          
          // Try some alternative formats if the first attempt failed
          
          // Try with date only (some APIs ignore time)
          try {
            const dateOnly = formattedEndTime.split(' ')[0] + ' 23:59:59';
            console.log(`Trying date-only format for campaign ${id}: ${dateOnly}`);
            
            const response = await axios.put(`${baseUrl}/campaigns/${id}`, {
              schedule_end_time: dateOnly
            }, {
              headers: {
                'Authorization': `Bearer ${token}`,
                'Accept': 'application/json',
                'Content-Type': 'application/json'
              },
            });
            
            if (response.status === 200 || response.status === 201 || response.status === 204) {
              console.log(`Successfully updated end time for campaign ${id} to ${dateOnly} (date only format)`);
              success = true;
              
              // Update our database record
              await db.update(trafficstarCampaigns)
                .set({ scheduleEndTime: dateOnly, updatedAt: new Date() })
                .where(eq(trafficstarCampaigns.trafficstarId, id.toString()));
              
              break;
            }
          } catch (innerError) {
            console.log(`Failed to update end time for campaign ${id} using date-only format`);
            // Continue to next attempt
          }
        }
      }
      
      if (!success) {
        throw new Error(`Failed to update end time for campaign ${id} after trying all endpoints. Last error: ${lastError}`);
      }
    } catch (error) {
      console.error(`Error updating end time for campaign ${id}:`, error);
      throw new Error(`Failed to update end time for campaign ${id}`);
    }
  }

  /**
   * Schedule TrafficStar spent value updates
   */
  async scheduleSpentValueUpdates(): Promise<void> {
    try {
      // Initial update for all campaigns
      await this.updateAllCampaignsSpentValues();
      
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
      
      // Schedule budget updates based on specified times
      setInterval(async () => {
        try {
          console.log('Running scheduled daily budget updates check');
          await this.checkDailyBudgetUpdates();
        } catch (error) {
          console.error('Error in scheduled daily budget updates check:', error);
        }
      }, 60 * 1000); // Every minute
      
      console.log('TrafficStar spent value scheduler initialized');
    } catch (error) {
      console.error('Error scheduling spent value updates:', error);
    }
  }
  
  /**
   * Update all TrafficStar campaigns with their latest spent values
   * This function fetches and updates all campaigns with trafficstarCampaignId
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
          
          if (spentValue) {
            // Update campaign with spent value data
            await db.update(campaigns)
              .set({
                dailySpent: spentValue.totalSpent.toString(),
                dailySpentDate: currentUtcDate,
                lastSpentCheck: new Date(),
                updatedAt: new Date()
              })
              .where(eq(campaigns.id, campaign.id));
            
            console.log(`Updated campaign ${campaign.id} with latest spent value: $${spentValue.totalSpent.toFixed(4)} for date ${currentUtcDate}`);
          } else {
            // No spent value data returned, just update last check time
            await db.update(campaigns)
              .set({
                lastSpentCheck: new Date(),
                updatedAt: new Date()
              })
              .where(eq(campaigns.id, campaign.id));
              
            console.log(`No spent data returned for campaign ${campaign.id}, updated last check time only`);
          }
        } catch (error) {
          console.error(`Error updating spent value for campaign ${campaign.id}:`, error);
          
          // Still update the last check time even if there was an error
          await db.update(campaigns)
            .set({
              lastSpentCheck: new Date(),
              updatedAt: new Date()
            })
            .where(eq(campaigns.id, campaign.id));
        }
      }
    } catch (error) {
      console.error('Error updating all campaign spent values:', error);
    }
  }

  /**
   * Check all campaigns for daily budget update time
   * This method handles setting the daily budget at the specified time
   */
  private async checkDailyBudgetUpdates(): Promise<void> {
    try {
      // Get all campaigns with trafficstarCampaignId that have budgetUpdateTime set
      const campaignsToUpdate = await db
        .select()
        .from(campaigns)
        .where(
          and(
            isNotNull(campaigns.trafficstarCampaignId),
            isNotNull(campaigns.budgetUpdateTime)
          )
        );
      
      if (campaignsToUpdate.length === 0) {
        return;
      }
      
      // Get current time in HH:MM:SS format (UTC)
      const now = new Date();
      const currentTimeUTC = now.toISOString().substring(11, 19);
      const currentUtcDate = now.toISOString().split('T')[0];
      
      console.log(`Checking ${campaignsToUpdate.length} campaigns for budget updates at ${currentTimeUTC} UTC`);
      
      // Process each campaign
      for (const campaign of campaignsToUpdate) {
        if (!campaign.trafficstarCampaignId || !campaign.budgetUpdateTime) continue;
        
        // Check if campaign should have budget updated now
        if (this.isWithinTimeWindow(currentTimeUTC, campaign.budgetUpdateTime, 1)) {
          // Get TrafficStar campaign ID
          const trafficstarId = isNaN(Number(campaign.trafficstarCampaignId)) ? 
            parseInt(campaign.trafficstarCampaignId.replace(/\D/g, '')) : 
            Number(campaign.trafficstarCampaignId);
          
          // Check if we already updated this campaign's budget today
          if (this.budgetAdjustedCampaigns.has(trafficstarId)) {
            const lastUpdatedDate = this.budgetAdjustedCampaigns.get(trafficstarId);
            if (lastUpdatedDate === currentUtcDate) {
              console.log(`Campaign ${trafficstarId} already had budget updated today (${currentUtcDate}) - skipping`);
              continue;
            }
          }
          
          console.log(`Campaign ${trafficstarId} budget update time ${campaign.budgetUpdateTime} matches current time ${currentTimeUTC} - updating budget to $10.15`);
          
          try {
            // Set budget to $10.15 (fixed value)
            await this.updateCampaignBudget(trafficstarId, 10.15);
            console.log(`Successfully updated campaign ${trafficstarId} daily budget to $10.15`);
            
            // Record that we updated the budget today
            this.budgetAdjustedCampaigns.set(trafficstarId, currentUtcDate);
          } catch (error) {
            console.error(`Error updating budget for campaign ${trafficstarId}:`, error);
          }
        }
      }
    } catch (error) {
      console.error('Error checking daily budget updates:', error);
    }
  }

  /**
   * Force an immediate budget update for a campaign
   * This is used for testing or manual operations
   */
  public async forceBudgetUpdate(campaignId: number): Promise<void> {
    try {
      // Get the campaign
      const [campaign] = await db
        .select()
        .from(campaigns)
        .where(eq(campaigns.id, campaignId));
      
      if (!campaign || !campaign.trafficstarCampaignId) {
        throw new Error(`Campaign ${campaignId} not found or has no TrafficStar integration`);
      }
      
      // Get TrafficStar campaign ID
      const trafficstarId = isNaN(Number(campaign.trafficstarCampaignId)) ? 
        parseInt(campaign.trafficstarCampaignId.replace(/\D/g, '')) : 
        Number(campaign.trafficstarCampaignId);
      
      console.log(`Forcing budget update for campaign ${trafficstarId} to $10.15`);
      
      // Set budget to $10.15 (fixed value)
      await this.updateCampaignBudget(trafficstarId, 10.15);
      
      // Get current UTC date
      const currentUtcDate = new Date().toISOString().split('T')[0];
      
      // Record that we updated the budget today
      this.budgetAdjustedCampaigns.set(trafficstarId, currentUtcDate);
      
      console.log(`Successfully forced budget update for campaign ${trafficstarId} to $10.15`);
    } catch (error) {
      console.error(`Error forcing budget update for campaign ${campaignId}:`, error);
      throw new Error(`Failed to force budget update for campaign ${campaignId}`);
    }
  }

  /**
   * Get campaign spent value for specified date range
   */
  async getCampaignSpentValue(id: number, dateFrom?: string, dateUntil?: string): Promise<any> {
    try {
      // In test mode, return a fixed value
      if (process.env.TEST_MODE === 'true') {
        console.log(`🧪 TEST MODE: Returning simulated spent value for campaign ${id}`);
        
        // Use a fixed test value of $0.25 for today
        return {
          totalSpent: 0.25,
          startDate: dateFrom || new Date().toISOString().split('T')[0],
          endDate: dateUntil || new Date().toISOString().split('T')[0],
          days: 1
        };
      }
      
      const token = await this.ensureToken();
      
      // Set default date range if not provided
      if (!dateFrom) {
        dateFrom = new Date().toISOString().split('T')[0];
      }
      
      if (!dateUntil) {
        dateUntil = new Date().toISOString().split('T')[0];
      }
      
      console.log(`Fetching spent value for campaign ${id} from ${dateFrom} to ${dateUntil}`);
      
      let success = false;
      let result: any = null;
      let lastError = null;
      
      // Try different endpoint patterns
      for (const baseUrl of API_BASE_URLS) {
        try {
          console.log(`Trying to get spent value using endpoint: ${baseUrl}/campaigns/${id}/spent`);
          const response = await axios.get(`${baseUrl}/campaigns/${id}/spent`, {
            headers: {
              'Authorization': `Bearer ${token}`,
              'Accept': 'application/json'
            },
            params: {
              date_from: dateFrom,
              date_until: dateUntil
            }
          });
          
          if (response.data && (
              response.data.spent || 
              response.data.total || 
              response.data.amount || 
              response.data.totalSpent ||
              (response.data.response && (
                response.data.response.spent || 
                response.data.response.total || 
                response.data.response.amount
              ))
          )) {
            console.log(`Successfully retrieved spent value for campaign ${id}`);
            
            // Parse the response into a standardized format
            const rawData = response.data.response || response.data;
            const totalSpent = rawData.spent || rawData.total || rawData.amount || rawData.totalSpent || 0;
            
            result = {
              totalSpent: typeof totalSpent === 'string' ? parseFloat(totalSpent) : totalSpent,
              startDate: dateFrom,
              endDate: dateUntil,
              days: this.calculateDaysBetween(dateFrom, dateUntil),
              rawResponse: rawData
            };
            
            success = true;
            break;
          } else {
            console.log(`Received unexpected response format from ${baseUrl}/campaigns/${id}/spent`);
            console.log(`Response structure: ${JSON.stringify(Object.keys(response.data))}`);
          }
        } catch (error) {
          console.log(`Failed to get spent value using endpoint: ${baseUrl}/campaigns/${id}/spent`);
          lastError = error;
          // Continue to next attempt
        }
        
        // Try alternate endpoint format
        try {
          console.log(`Trying alternate format for spent value: ${baseUrl}/stats/campaigns/${id}`);
          
          const response = await axios.get(`${baseUrl}/stats/campaigns/${id}`, {
            headers: {
              'Authorization': `Bearer ${token}`,
              'Accept': 'application/json'
            },
            params: {
              date_from: dateFrom,
              date_until: dateUntil
            }
          });
          
          if (response.data) {
            console.log(`Successfully retrieved stats for campaign ${id} using alternate endpoint`);
            
            // Parse the response into a standardized format
            const rawData = response.data.response || response.data;
            const totalSpent = rawData.spent || rawData.total || rawData.amount || rawData.cost || 0;
            
            result = {
              totalSpent: typeof totalSpent === 'string' ? parseFloat(totalSpent) : totalSpent,
              startDate: dateFrom,
              endDate: dateUntil,
              days: this.calculateDaysBetween(dateFrom, dateUntil),
              rawResponse: rawData
            };
            
            success = true;
            break;
          }
        } catch (error) {
          console.log(`Failed to get spent value using alternate endpoint: ${baseUrl}/stats/campaigns/${id}`);
          // Continue to next attempt
        }
      }
      
      if (!success) {
        console.error(`Failed to get spent value for campaign ${id} after trying all endpoints. Last error:`, lastError);
        return null;
      }
      
      return result;
    } catch (error) {
      console.error(`Error getting spent value for campaign ${id}:`, error);
      return null;
    }
  }
  
  /**
   * Calculate the number of days between two dates (inclusive)
   */
  private calculateDaysBetween(startDate: string, endDate: string): number {
    const start = new Date(startDate);
    const end = new Date(endDate);
    
    // Set to midnight to avoid time issues
    start.setHours(0, 0, 0, 0);
    end.setHours(0, 0, 0, 0);
    
    // Add 1 because we want the inclusive count (including both start and end days)
    return Math.floor((end.getTime() - start.getTime()) / (1000 * 60 * 60 * 24)) + 1;
  }
}

export const trafficStarService = new TrafficStarService();
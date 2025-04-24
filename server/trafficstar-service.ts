/**
 * TrafficStar API Service
 * This service handles all interactions with the TrafficStar API
 */
import axios from 'axios';
import { db } from './db';
import { trafficstarCredentials, trafficstarCampaigns } from '@shared/schema';
import { eq } from 'drizzle-orm';

// Try a few different API base URLs
// Different TrafficStar API versions might have different URL structures
const API_BASE_URLS = [
  'https://api.trafficstars.com/v1', 
  'https://api.trafficstars.com',
  'https://app.trafficstars.com/api/v1',
  'https://app.trafficstars.com/api'
];

const API_BASE_URL = API_BASE_URLS[0]; // Default to first one

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
    try {
      console.log("Requesting new TrafficStar access token");
      const response = await axios.post<TokenResponse>(
        `${API_BASE_URL}/auth/token`,
        new URLSearchParams({
          grant_type: 'refresh_token',
          refresh_token: apiKey,
        }),
        {
          headers: {
            'Content-Type': 'application/x-www-form-urlencoded',
            'Accept': 'application/json'
          },
        }
      );

      // Calculate token expiry (subtract 60 seconds for safety)
      const expiryDate = new Date();
      expiryDate.setSeconds(expiryDate.getSeconds() + response.data.expires_in - 60);
      
      console.log(`Received new access token, expires in ${response.data.expires_in} seconds`);

      // Save credentials to database
      const [existingCredential] = await db.select().from(trafficstarCredentials).limit(1);
      
      if (existingCredential) {
        // Update existing record
        await db.update(trafficstarCredentials).set({
          apiKey: apiKey, // Ensure we store the API key (in case it came from env)
          accessToken: response.data.access_token,
          tokenExpiry: expiryDate,
          updatedAt: new Date(),
        }).where(eq(trafficstarCredentials.id, existingCredential.id));
      } else {
        // Create new record
        await db.insert(trafficstarCredentials).values({
          apiKey: apiKey,
          accessToken: response.data.access_token,
          tokenExpiry: expiryDate,
        });
      }

      // Update in-memory values
      this.accessToken = response.data.access_token;
      this.tokenExpiry = expiryDate;

      return this.accessToken;
    } catch (error) {
      console.error('Error getting TrafficStar access token:', error);
      throw new Error('Failed to authenticate with TrafficStar API');
    }
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
          return savedCampaign.campaignData || {
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
   * Pause a campaign
   */
  async pauseCampaign(id: number): Promise<void> {
    try {
      const token = await this.ensureToken();
      
      // Try all possible API endpoint formats until one works
      let success = false;
      let lastError = null;
      
      // Get detailed information about this campaign first to understand its current state
      try {
        console.log(`Getting campaign details for ID ${id} before attempting to pause`);
        const campaign = await this.getCampaign(id);
        console.log(`Campaign ${id} current status: ${JSON.stringify({
          name: campaign.name,
          active: campaign.active,
          status: campaign.status
        })}`);
      } catch (infoError) {
        console.log(`Could not get campaign ${id} details: ${infoError}`);
      }
      
      // Try different endpoint patterns
      for (const baseUrl of API_BASE_URLS) {
        // Format 1: POST /campaigns/{id}/pause
        try {
          console.log(`Trying to pause campaign ${id} using endpoint: ${baseUrl}/campaigns/${id}/pause`);
          await axios.post(`${baseUrl}/campaigns/${id}/pause`, {}, {
            headers: {
              'Authorization': `Bearer ${token}`,
              'Content-Type': 'application/json'
            },
          });
          console.log(`Successfully paused campaign ${id} using endpoint: ${baseUrl}/campaigns/${id}/pause`);
          success = true;
          break;
        } catch (error) {
          console.log(`Failed to pause campaign ${id} using endpoint: ${baseUrl}/campaigns/${id}/pause`);
          lastError = error;
          // Continue to next attempt
        }
        
        // Format 2: PUT /campaigns/{id} with active=false
        try {
          console.log(`Trying to pause campaign ${id} using endpoint: ${baseUrl}/campaigns/${id} with active=false`);
          await axios.put(`${baseUrl}/campaigns/${id}`, {
            active: false
          }, {
            headers: {
              'Authorization': `Bearer ${token}`,
              'Content-Type': 'application/json'
            },
          });
          console.log(`Successfully paused campaign ${id} using endpoint: ${baseUrl}/campaigns/${id} with active=false`);
          success = true;
          break;
        } catch (error) {
          console.log(`Failed to pause campaign ${id} using endpoint: ${baseUrl}/campaigns/${id} with active=false`);
          lastError = error;
          // Continue to next attempt
        }
        
        // Format 3: POST /campaigns/{id}/status with status=paused
        try {
          console.log(`Trying to pause campaign ${id} using endpoint: ${baseUrl}/campaigns/${id}/status`);
          await axios.post(`${baseUrl}/campaigns/${id}/status`, {
            status: 'paused'
          }, {
            headers: {
              'Authorization': `Bearer ${token}`,
              'Content-Type': 'application/json'
            },
          });
          console.log(`Successfully paused campaign ${id} using endpoint: ${baseUrl}/campaigns/${id}/status`);
          success = true;
          break;
        } catch (error) {
          console.log(`Failed to pause campaign ${id} using endpoint: ${baseUrl}/campaigns/${id}/status`);
          lastError = error;
          // Continue to next attempt
        }
      }
      
      if (!success) {
        // If we're here, all attempts failed
        console.error(`All attempts to pause campaign ${id} failed. Last error:`, lastError);
        throw new Error(`Could not pause campaign. All API endpoints failed.`);
      }

      // Update local record
      await db.update(trafficstarCampaigns)
        .set({ active: false, updatedAt: new Date() })
        .where(eq(trafficstarCampaigns.trafficstarId, id.toString()));
        
      // Verify the campaign was actually paused
      try {
        console.log(`Verifying campaign ${id} was successfully paused`);
        const campaign = await this.getCampaign(id);
        console.log(`Campaign ${id} updated status: ${JSON.stringify({
          name: campaign.name,
          active: campaign.active,
          status: campaign.status
        })}`);
      } catch (verifyError) {
        console.log(`Could not verify pause status for campaign ${id}: ${verifyError}`);
      }
      
    } catch (error) {
      console.error(`Error pausing TrafficStar campaign ${id}:`, error);
      throw new Error(`Failed to pause campaign ${id}`);
    }
  }

  /**
   * Activate a campaign
   */
  async activateCampaign(id: number): Promise<void> {
    try {
      const token = await this.ensureToken();
      
      // Try all possible API endpoint formats until one works
      let success = false;
      let lastError = null;
      
      // Get detailed information about this campaign first to understand its current state
      try {
        console.log(`Getting campaign details for ID ${id} before attempting to activate`);
        const campaign = await this.getCampaign(id);
        console.log(`Campaign ${id} current status: ${JSON.stringify({
          name: campaign.name,
          active: campaign.active,
          status: campaign.status
        })}`);
      } catch (infoError) {
        console.log(`Could not get campaign ${id} details: ${infoError}`);
      }
      
      // Try different endpoint patterns
      for (const baseUrl of API_BASE_URLS) {
        // Format 1: POST /campaigns/{id}/enable
        try {
          console.log(`Trying to activate campaign ${id} using endpoint: ${baseUrl}/campaigns/${id}/enable`);
          await axios.post(`${baseUrl}/campaigns/${id}/enable`, {}, {
            headers: {
              'Authorization': `Bearer ${token}`,
              'Content-Type': 'application/json'
            },
          });
          console.log(`Successfully activated campaign ${id} using endpoint: ${baseUrl}/campaigns/${id}/enable`);
          success = true;
          break;
        } catch (error) {
          console.log(`Failed to activate campaign ${id} using endpoint: ${baseUrl}/campaigns/${id}/enable`);
          lastError = error;
          // Continue to next attempt
        }
        
        // Format 2: PUT /campaigns/{id} with active=true
        try {
          console.log(`Trying to activate campaign ${id} using endpoint: ${baseUrl}/campaigns/${id} with active=true`);
          await axios.put(`${baseUrl}/campaigns/${id}`, {
            active: true
          }, {
            headers: {
              'Authorization': `Bearer ${token}`,
              'Content-Type': 'application/json'
            },
          });
          console.log(`Successfully activated campaign ${id} using endpoint: ${baseUrl}/campaigns/${id} with active=true`);
          success = true;
          break;
        } catch (error) {
          console.log(`Failed to activate campaign ${id} using endpoint: ${baseUrl}/campaigns/${id} with active=true`);
          lastError = error;
          // Continue to next attempt
        }
        
        // Format 3: POST /campaigns/{id}/status with status=active
        try {
          console.log(`Trying to activate campaign ${id} using endpoint: ${baseUrl}/campaigns/${id}/status`);
          await axios.post(`${baseUrl}/campaigns/${id}/status`, {
            status: 'active'
          }, {
            headers: {
              'Authorization': `Bearer ${token}`,
              'Content-Type': 'application/json'
            },
          });
          console.log(`Successfully activated campaign ${id} using endpoint: ${baseUrl}/campaigns/${id}/status`);
          success = true;
          break;
        } catch (error) {
          console.log(`Failed to activate campaign ${id} using endpoint: ${baseUrl}/campaigns/${id}/status`);
          lastError = error;
          // Continue to next attempt
        }
      }
      
      if (!success) {
        // If we're here, all attempts failed
        console.error(`All attempts to activate campaign ${id} failed. Last error:`, lastError);
        throw new Error(`Could not activate campaign. All API endpoints failed.`);
      }

      // Update local record
      await db.update(trafficstarCampaigns)
        .set({ active: true, updatedAt: new Date() })
        .where(eq(trafficstarCampaigns.trafficstarId, id.toString()));
        
      // Verify the campaign was actually activated
      try {
        console.log(`Verifying campaign ${id} was successfully activated`);
        const campaign = await this.getCampaign(id);
        console.log(`Campaign ${id} updated status: ${JSON.stringify({
          name: campaign.name,
          active: campaign.active,
          status: campaign.status
        })}`);
      } catch (verifyError) {
        console.log(`Could not verify activate status for campaign ${id}: ${verifyError}`);
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
      const token = await this.ensureToken();
      await axios.put(`${API_BASE_URL}/campaigns/${id}`, {
        max_daily: maxDaily
      }, {
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json'
        },
      });

      // Update local record
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
      const token = await this.ensureToken();
      await axios.put(`${API_BASE_URL}/campaigns/${id}`, {
        schedule_end_time: scheduleEndTime
      }, {
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json'
        },
      });

      // Update local record
      await db.update(trafficstarCampaigns)
        .set({ scheduleEndTime, updatedAt: new Date() })
        .where(eq(trafficstarCampaigns.trafficstarId, id.toString()));
    } catch (error) {
      console.error(`Error updating TrafficStar campaign ${id} end time:`, error);
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
}

// Export a singleton instance
export const trafficStarService = new TrafficStarService();
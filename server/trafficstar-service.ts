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
      const response = await axios.get<CampaignsResponse>(`${API_BASE_URL}/campaigns`, {
        headers: {
          'Authorization': `Bearer ${token}`,
        },
      });

      // Sync campaigns to database
      await this.syncCampaignsToDatabase(response.data.response);

      return response.data.response;
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
      const response = await axios.get<Campaign>(`${API_BASE_URL}/campaigns/${id}`, {
        headers: {
          'Authorization': `Bearer ${token}`,
        },
      });

      return response.data;
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
      
      // Try updated API format - API v2 style
      try {
        await axios.post(`${API_BASE_URL}/campaigns/${id}/pause`, {}, {
          headers: {
            'Authorization': `Bearer ${token}`,
            'Content-Type': 'application/json'
          },
        });
      } catch (apiV1Error) {
        console.log(`API v1 endpoint failed, trying alternate format for campaign ${id}`);
        
        // Try alternate API format if the first one fails
        await axios.put(`${API_BASE_URL}/campaigns/${id}`, {
          active: false
        }, {
          headers: {
            'Authorization': `Bearer ${token}`,
            'Content-Type': 'application/json'
          },
        });
      }

      // Update local record
      await db.update(trafficstarCampaigns)
        .set({ active: false, updatedAt: new Date() })
        .where(eq(trafficstarCampaigns.trafficstarId, id.toString()));
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
      
      // Try updated API format - API v2 style
      try {
        await axios.post(`${API_BASE_URL}/campaigns/${id}/enable`, {}, {
          headers: {
            'Authorization': `Bearer ${token}`,
            'Content-Type': 'application/json'
          },
        });
      } catch (apiV1Error) {
        console.log(`API v1 endpoint failed, trying alternate format for campaign ${id}`);
        
        // Try alternate API format if the first one fails
        await axios.put(`${API_BASE_URL}/campaigns/${id}`, {
          active: true
        }, {
          headers: {
            'Authorization': `Bearer ${token}`,
            'Content-Type': 'application/json'
          },
        });
      }

      // Update local record
      await db.update(trafficstarCampaigns)
        .set({ active: true, updatedAt: new Date() })
        .where(eq(trafficstarCampaigns.trafficstarId, id.toString()));
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
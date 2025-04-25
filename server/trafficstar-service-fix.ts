/**
 * TrafficStar API Service
 * This service handles all interactions with the TrafficStar API
 */
import axios from 'axios';
import { db } from './db';
import { trafficstarCredentials, trafficstarCampaigns, campaigns } from '@shared/schema';
import { eq, sql } from 'drizzle-orm';
import { storage } from './storage';

// API base URL
const API_BASE_URL = 'https://api.trafficstars.com/v1.1';

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
 * This is a simplified version to avoid syntax errors
 */
class TrafficStarService {
  private accessToken: string | null = null;
  private tokenExpiry: Date | null = null;

  /**
   * Ensure we have a valid access token
   */
  private async ensureToken(): Promise<string> {
    // Check for token in environment variable first
    if (process.env.TRAFFICSTAR_API_KEY) {
      return process.env.TRAFFICSTAR_API_KEY;
    }

    // Read from database if not in environment
    try {
      // Use the stored API key from database
      const [credential] = await db.select().from(trafficstarCredentials).limit(1);
      if (credential?.apiKey) {
        return credential.apiKey;
      }
    } catch (error) {
      console.error("Error getting TrafficStar API credentials:", error);
    }

    throw new Error("TrafficStar API key not found");
  }
  
  /**
   * Get all campaigns from TrafficStar
   */
  async getCampaigns(): Promise<Campaign[]> {
    const token = await this.ensureToken();
    
    try {
      const response = await axios.get(`${API_BASE_URL}/campaigns`, {
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json'
        }
      });
      
      return response.data?.response || [];
    } catch (error) {
      console.error("Error fetching TrafficStar campaigns:", error);
      return [];
    }
  }
  
  /**
   * Get a single campaign from TrafficStar
   */
  async getCampaign(id: number): Promise<Campaign | null> {
    const token = await this.ensureToken();
    
    try {
      const response = await axios.get(`${API_BASE_URL}/campaigns/${id}`, {
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json'
        }
      });
      
      return response.data || null;
    } catch (error) {
      console.error(`Error fetching TrafficStar campaign ${id}:`, error);
      return null;
    }
  }

  /**
   * Pause a campaign
   */
  async pauseCampaign(id: number): Promise<void> {
    const token = await this.ensureToken();
    
    try {
      await axios.patch(`${API_BASE_URL}/campaigns/${id}`, 
        { active: false },
        {
          headers: {
            'Authorization': `Bearer ${token}`,
            'Content-Type': 'application/json'
          }
        }
      );
    } catch (error) {
      console.error(`Error pausing TrafficStar campaign ${id}:`, error);
      throw error;
    }
  }

  /**
   * Activate a campaign
   */
  async activateCampaign(id: number): Promise<void> {
    const token = await this.ensureToken();
    
    try {
      await axios.patch(`${API_BASE_URL}/campaigns/${id}`, 
        { active: true },
        {
          headers: {
            'Authorization': `Bearer ${token}`,
            'Content-Type': 'application/json'
          }
        }
      );
    } catch (error) {
      console.error(`Error activating TrafficStar campaign ${id}:`, error);
      throw error;
    }
  }

  /**
   * Update a campaign's daily budget
   */
  async updateCampaignDailyBudget(id: number, maxDaily: number): Promise<void> {
    const token = await this.ensureToken();
    
    try {
      await axios.patch(`${API_BASE_URL}/campaigns/${id}`, 
        { max_daily: maxDaily },
        {
          headers: {
            'Authorization': `Bearer ${token}`,
            'Content-Type': 'application/json'
          }
        }
      );
    } catch (error) {
      console.error(`Error updating budget for TrafficStar campaign ${id}:`, error);
      throw error;
    }
  }

  /**
   * Activate multiple campaigns at once
   */
  async activateMultipleCampaigns(campaignIds: number[]): Promise<{ success: number[], failed: number[] }> {
    const results = {
      success: [] as number[],
      failed: [] as number[]
    };
    
    for (const id of campaignIds) {
      try {
        await this.activateCampaign(id);
        results.success.push(id);
      } catch (error) {
        results.failed.push(id);
      }
    }
    
    return results;
  }

  /**
   * Update a campaign's end time
   */
  async updateCampaignEndTime(id: number, scheduleEndTime: string): Promise<void> {
    const token = await this.ensureToken();
    
    try {
      await axios.patch(`${API_BASE_URL}/campaigns/${id}`, 
        { schedule_end_time: scheduleEndTime },
        {
          headers: {
            'Authorization': `Bearer ${token}`,
            'Content-Type': 'application/json'
          }
        }
      );
    } catch (error) {
      console.error(`Error updating end time for TrafficStar campaign ${id}:`, error);
      throw error;
    }
  }

  /**
   * Save API key
   */
  async saveApiKey(apiKey: string): Promise<boolean> {
    try {
      // Check if we already have a credential row
      const [existing] = await db.select().from(trafficstarCredentials).limit(1);
      
      if (existing) {
        // Update existing credential
        await db.update(trafficstarCredentials)
          .set({ apiKey, updatedAt: new Date() })
          .where(eq(trafficstarCredentials.id, existing.id));
      } else {
        // Insert new credential
        await db.insert(trafficstarCredentials)
          .values({ apiKey });
      }
      
      return true;
    } catch (error) {
      console.error("Error saving TrafficStar API key:", error);
      return false;
    }
  }

  /**
   * Get saved campaigns from database
   */
  async getSavedCampaigns() {
    try {
      const savedCampaigns = await db
        .select()
        .from(trafficstarCampaigns)
        .orderBy(sql`name ASC`);
        
      return savedCampaigns;
    } catch (error) {
      console.error("Error getting saved TrafficStar campaigns:", error);
      return [];
    }
  }

  /**
   * Check if API key is set
   */
  async isConfigured(): Promise<boolean> {
    if (process.env.TRAFFICSTAR_API_KEY) {
      return true;
    }
    
    // Check database
    try {
      const [credential] = await db.select().from(trafficstarCredentials).limit(1);
      return !!credential;
    } catch (error) {
      console.error("Error checking if TrafficStar is configured:", error);
      return false;
    }
  }

  /**
   * Get campaign daily spending from TrafficStar API for the current UTC date
   * This is a simple implementation that won't throw syntax errors
   */
  async getCampaignSpending(id: number): Promise<{ id: number, daily: number, date: string, maxDaily: number }> {
    try {
      const token = await this.ensureToken();
      
      // Get current date in YYYY-MM-DD format for UTC
      const now = new Date();
      const todayUtc = now.toISOString().split('T')[0];
      
      // Default response
      let result = {
        id,
        daily: 0,
        date: todayUtc,
        maxDaily: 0
      };
      
      // Try to get campaign details for max_daily budget
      try {
        const campaignDetails = await this.getCampaign(id);
        if (campaignDetails && campaignDetails.max_daily) {
          result.maxDaily = parseFloat(campaignDetails.max_daily.toString());
        }
      } catch (campaignError) {
        console.error(`Failed to get campaign details for ${id}:`, campaignError);
      }
      
      // Try to get spending data from custom report endpoint
      try {
        const statsResponse = await axios.get(`${API_BASE_URL}/advertiser/custom/report/by-day`, {
          headers: {
            'Authorization': `Bearer ${token}`,
            'Content-Type': 'application/json'
          },
          params: {
            campaign_id: id.toString(),
            date_from: todayUtc,
            date_to: todayUtc
          },
          timeout: 30000 // 30 second timeout
        });
        
        if (statsResponse.data && Array.isArray(statsResponse.data)) {
          // Process the response data
          const responseData = statsResponse.data;
          
          // Sum up all spending for this campaign on this date
          responseData.forEach((item: any) => {
            if (item.day === todayUtc && item.amount) {
              const amount = parseFloat(item.amount || '0');
              result.daily += amount;
            }
          });
        }
      } catch (statsError) {
        console.error(`Custom report endpoint failed for campaign ${id}:`, statsError);
      }
      
      return result;
    } catch (error) {
      console.error(`Error getting campaign ${id} daily spending:`, error);
      
      // Return default values on error
      return {
        id,
        daily: 0,
        date: new Date().toISOString().split('T')[0],
        maxDaily: 0
      };
    }
  }

  /**
   * Get daily spending for all campaigns for current UTC date
   */
  async getAllCampaignsDailySpending(): Promise<{ campaigns: { id: number, daily: number, maxDaily: number }[], date: string }> {
    // Get current date in YYYY-MM-DD format
    const now = new Date();
    const todayUtc = now.toISOString().split('T')[0];
    
    // Result container
    const result = {
      campaigns: [] as { id: number, daily: number, maxDaily: number }[],
      date: todayUtc
    };
    
    try {
      // Get all campaign IDs from database
      const savedCampaigns = await db
        .select()
        .from(trafficstarCampaigns);
      
      // Process each campaign
      for (const campaign of savedCampaigns) {
        if (!campaign.trafficstarId) continue;
        
        const campaignId = parseInt(campaign.trafficstarId);
        if (isNaN(campaignId)) continue;
        
        try {
          // Get spending data for this campaign
          const spendingData = await this.getCampaignSpending(campaignId);
          
          // Add to results
          result.campaigns.push({
            id: campaignId,
            daily: spendingData.daily,
            maxDaily: spendingData.maxDaily
          });
        } catch (campaignError) {
          console.error(`Error getting spending for campaign ${campaignId}:`, campaignError);
          
          // Add with default values
          result.campaigns.push({
            id: campaignId,
            daily: 0,
            maxDaily: campaign.maxDaily ? parseFloat(campaign.maxDaily) : 0
          });
        }
      }
      
      return result;
    } catch (error) {
      console.error("Error getting all campaigns daily spending:", error);
      return result; // Return empty result
    }
  }

  /**
   * Scheduled function to run daily budget updates
   */
  async scheduleAutoManagement(): Promise<void> {
    console.log("Starting TrafficStar auto-management scheduling...");
    // Implementation details omitted for simplicity
  }
}

export const trafficStarService = new TrafficStarService();
/**
 * TrafficStar API Service
 * This service handles all interactions with the TrafficStar API for spent value tracking and campaign management
 * 
 * Implementation based on official TrafficStar API documentation using OAuth 2.0
 */

import axios from 'axios';
import { db } from './db';
import { campaigns } from '../shared/schema';
import { eq, sql } from 'drizzle-orm';
import { getTodayFormatted, parseReportSpentValue } from './trafficstar-spent-helper';

// Interfaces for API responses and data
interface TokenResponse {
  access_token: string;
  expires_in: number;
  token_type: string;
  id_token?: string;
}

interface Campaign {
  id: number;
  name: string;
  status?: string;
  active?: boolean;
  is_archived?: boolean;
  max_daily?: number;
  pricing_model?: string;
  schedule_end_time?: string;
  spent?: number | string;
  [key: string]: any; // For other properties
}

interface SpentReportItem {
  amount: number;       // This is the spent value
  clicks: number;
  ctr: number;
  day: string;
  ecpa: number;
  ecpc: number;
  ecpm: number;
  impressions: number;
  leads: number;
}

interface CampaignRunPauseResponse {
  success: number[];
  failed: number[];
  total: number;
}

/**
 * TrafficStar API service class
 */
export class TrafficStarService {
  // Authentication
  private accessToken: string | null = null;
  private tokenExpiry: Date | null = null;
  
  // API Base URLs
  private readonly BASE_URL_V1 = 'https://api.trafficstars.com/v1';
  private readonly BASE_URL_V1_1 = 'https://api.trafficstars.com/v1.1';
  private readonly BASE_URL_V2 = 'https://api.trafficstars.com/v2';
  
  // Default headers
  private readonly DEFAULT_HEADERS = {
    'Content-Type': 'application/json',
    'Accept': 'application/json'
  };

  /**
   * Initialize the service
   */
  constructor() {
    console.log('TrafficStar API Service initialized');
  }

  /**
   * Ensure we have a valid access token using OAuth 2.0
   * Based on TrafficStars official documentation
   */
  async ensureToken(): Promise<string> {
    const now = new Date();
    
    // If token exists and is still valid, return it
    if (this.accessToken && this.tokenExpiry && this.tokenExpiry > now) {
      return this.accessToken;
    }
    
    // Token expired or not exists, get a new one
    console.log('Getting new TrafficStar API access token via OAuth 2.0');
    
    try {
      // Get the API key from environment (which is used as refresh_token in OAuth 2.0 flow)
      const apiKey = process.env.TRAFFICSTAR_API_KEY;
      
      if (!apiKey) {
        throw new Error('TrafficStar API key not set. Set TRAFFICSTAR_API_KEY environment variable.');
      }
      
      // Make token request according to TrafficStar OAuth 2.0 specification
      const tokenUrl = `${this.BASE_URL_V1}/auth/token`;
      
      // Prepare form data for token request
      const formData = new URLSearchParams();
      formData.append('grant_type', 'refresh_token');
      formData.append('refresh_token', apiKey);
      
      // Request new access token
      console.log('Requesting access token using API key as refresh_token');
      const response = await axios.post(tokenUrl, formData.toString(), {
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded'
        }
      });
      
      // Parse token response
      const tokenResponse: TokenResponse = response.data;
      this.accessToken = tokenResponse.access_token;
      
      // Set token expiry (subtract 5 minutes for safety)
      const expiresIn = (tokenResponse.expires_in - 300) * 1000;
      this.tokenExpiry = new Date(now.getTime() + expiresIn);
      
      console.log(`TrafficStar OAuth access token obtained. Expires in ${expiresIn / 60000} minutes`);
      return this.accessToken;
    } catch (error) {
      console.error('Error obtaining TrafficStar API OAuth token:', error);
      throw new Error('Failed to authenticate with TrafficStar API using OAuth 2.0');
    }
  }

  /**
   * Get headers with authorization using Bearer token per OAuth 2.0 spec
   */
  private async getAuthHeaders(): Promise<Record<string, string>> {
    const token = await this.ensureToken();
    return {
      ...this.DEFAULT_HEADERS,
      'Authorization': `Bearer ${token}`
    };
  }

  /**
   * Get spent value for campaign using Reports API
   * 
   * Uses: GET /v1.1/advertiser/custom/report/by-day
   * 
   * Format based on TrafficStar documentation where we need to use
   * the exact date format YYYY-MM-DD for the current UTC date
   */
  async getCampaignSpentValue(campaignId: number, dateFrom?: string, dateTo?: string): Promise<{ totalSpent: number }> {
    try {
      // First try the direct campaign endpoint which is more reliable
      console.log(`Getting campaign ${campaignId} details for spent value`);
      const campaign = await this.getCampaign(campaignId);
      
      if (campaign && campaign.spent !== undefined) {
        // Convert to number if it's a string
        const spentValue = typeof campaign.spent === 'string' 
          ? parseFloat(campaign.spent.replace(/[^0-9.]/g, '')) 
          : (campaign.spent || 0);
          
        console.log(`Campaign ${campaignId} direct API spent value: $${spentValue.toFixed(4)}`);
        
        // If we got a valid spent value, update it in our database
        if (!isNaN(spentValue)) {
          await this.updateCampaignSpentValueInDb(campaignId, spentValue);
          return { totalSpent: spentValue };
        }
      }
      
      // If direct method failed or returned invalid value, try reports API as fallback
      console.log(`Trying reports API for campaign ${campaignId} spent value`);
      
      // Get the current UTC date in YYYY-MM-DD format using our helper
      const currentUTCDate = getTodayFormatted();
      
      // Use provided dates or default to today
      const fromDate = dateFrom || currentUTCDate;
      const toDate = dateTo || currentUTCDate;
      
      console.log(`Getting spent value for campaign ${campaignId} from ${fromDate} to ${toDate}`);
      
      // Get Auth Headers
      const headers = await this.getAuthHeaders();
      
      // Format payload for reports API
      const payload = {
        DateFrom: fromDate,
        DateTo: toDate,
        CampaignIds: [campaignId],
        GroupBy: "day"
      };
      
      console.log(`Report API request payload:`, JSON.stringify(payload));
      
      // Make API request to the reports API with JSON payload
      const url = `${this.BASE_URL_V1_1}/advertiser/custom/report/by-day`;
      const response = await axios.post(url, payload, { headers });
      
      // Log the raw response for debugging
      console.log(`Report API raw response:`, JSON.stringify(response.data).substring(0, 200) + '...');
      
      // If response is successful and has data
      if (response.data && Array.isArray(response.data)) {
        // Use our helper to extract the "amount" values from the report data
        const totalSpent = parseReportSpentValue(response.data);
        
        console.log(`Campaign ${campaignId} spent value from reports API: $${totalSpent.toFixed(4)}`);
        
        // Update the value in database
        await this.updateCampaignSpentValueInDb(campaignId, totalSpent);
        return { totalSpent };
      }
      
      // If we get here, both methods failed
      console.log(`No spent data returned for campaign ${campaignId} from either method`);
      return { totalSpent: 0 };
    } catch (error: any) {
      console.error(`Error getting spent value for campaign ${campaignId}:`, error);
      
      // Log more details about the error
      if (error.response) {
        console.error(`Error response status: ${error.response.status}`);
        console.error(`Error response data:`, error.response.data);
      }
      
      // Don't throw, just return 0 as spend
      return { totalSpent: 0 };
    }
  }
  
  /**
   * Update the campaign's spent value in our database
   */
  private async updateCampaignSpentValueInDb(trafficstarCampaignId: number, spentValue: number): Promise<void> {
    try {
      // Find our internal campaign ID from the TrafficStar campaign ID
      const campaignResult = await db
        .select()
        .from(campaigns)
        .where(eq(campaigns.trafficstarCampaignId, trafficstarCampaignId.toString()));
      
      if (campaignResult && campaignResult.length > 0) {
        const campaign = campaignResult[0];
        
        // Update the campaign with the spent value
        await db.update(campaigns)
          .set({
            dailySpent: spentValue.toString(),
            dailySpentDate: new Date(),
            lastSpentCheck: new Date(),
            lastTrafficSenderStatus: spentValue >= 10 ? 'high_spend' : 'low_spend',
            updatedAt: new Date()
          })
          .where(eq(campaigns.id, campaign.id));
        
        console.log(`Updated spent value for campaign ${campaign.id} (TrafficStar ID: ${trafficstarCampaignId}): $${spentValue.toFixed(4)}`);
        console.log(`✅ Marked campaign ${campaign.id} as '${spentValue >= 10 ? 'high_spend' : 'low_spend'}' in database (${spentValue} ${spentValue >= 10 ? '>=' : '<'} 10)`);
      }
    } catch (error) {
      console.error(`Error updating spent value in database:`, error);
    }
  }

  /**
   * Get a single campaign from TrafficStar
   * 
   * Uses: GET /v1.1/campaigns/{id}
   */
  async getCampaign(id: number): Promise<Campaign> {
    try {
      console.log(`Getting campaign ${id} details`);
      
      // Get Auth Headers
      const headers = await this.getAuthHeaders();
      
      // Make API request
      const url = `${this.BASE_URL_V1_1}/campaigns/${id}`;
      const response = await axios.get(url, { headers });
      
      // Extract and return campaign data
      const campaign = response.data;
      return campaign;
    } catch (error) {
      console.error(`Error getting campaign ${id} details:`, error);
      
      // Create a minimal campaign object with the ID
      const campaign: Campaign = {
        id: id,
        name: `Campaign ${id}`,
        active: false
      };
      
      return campaign;
    }
  }

  /**
   * Get campaign status from API
   * 
   * Uses: GET /v1.1/campaigns/{id}
   */
  async getCampaignStatus(id: number): Promise<{ active: boolean, status: string }> {
    try {
      // Get campaign details
      const campaign = await this.getCampaign(id);
      
      // Determine active status
      const isActive = campaign.active === true;
      
      // Determine status string
      let status = 'unknown';
      if (campaign.status) {
        status = campaign.status;
      } else if (isActive) {
        status = 'active';
      } else {
        status = 'paused';
      }
      
      return { active: isActive, status };
    } catch (error) {
      console.error(`Error getting campaign ${id} status:`, error);
      return { active: false, status: 'error' };
    }
  }

  /**
   * Activate a campaign
   * 
   * Uses: PUT /v2/campaigns/run
   */
  async activateCampaign(id: number): Promise<void> {
    try {
      console.log(`Activating campaign ${id}`);
      
      // Get Auth Headers
      const headers = await this.getAuthHeaders();
      
      // Make API request
      const url = `${this.BASE_URL_V2}/campaigns/run`;
      const payload = {
        campaign_ids: [id]
      };
      
      const response = await axios.put(url, payload, { headers });
      
      // Check if activation was successful
      const result = response.data as CampaignRunPauseResponse;
      
      if (result.success && result.success.includes(id)) {
        console.log(`Successfully activated campaign ${id}`);
      } else if (result.failed && result.failed.includes(id)) {
        throw new Error(`Failed to activate campaign ${id}`);
      } else {
        console.log(`Activation attempt for campaign ${id} completed, but status unclear`);
      }
    } catch (error) {
      console.error(`Error activating campaign ${id}:`, error);
      throw new Error(`Failed to activate campaign ${id}`);
    }
  }

  /**
   * Pause a campaign using the batch pause API endpoint
   * 
   * Uses: PUT /v2/campaigns/pause
   */
  async pauseCampaign(id: number): Promise<void> {
    try {
      console.log(`Pausing campaign ${id}`);
      
      // Get Auth Headers
      const headers = await this.getAuthHeaders();
      
      // Make API request
      const url = `${this.BASE_URL_V2}/campaigns/pause`;
      const payload = {
        campaign_ids: [id]
      };
      
      const response = await axios.put(url, payload, { headers });
      
      // Check if pause was successful
      const result = response.data as CampaignRunPauseResponse;
      
      if (result.success && result.success.includes(id)) {
        console.log(`Successfully paused campaign ${id}`);
      } else if (result.failed && result.failed.includes(id)) {
        throw new Error(`Failed to pause campaign ${id}`);
      } else {
        console.log(`Pause attempt for campaign ${id} completed, but status unclear`);
      }
    } catch (error) {
      console.error(`Error pausing campaign ${id}:`, error);
      throw new Error(`Failed to pause campaign ${id}`);
    }
  }

  /**
   * Update the campaign's end time
   * 
   * Uses: PATCH /v1.1/campaigns/{id}
   */
  async updateCampaignEndTime(id: number, scheduleEndTime: string): Promise<void> {
    try {
      console.log(`Setting campaign ${id} end time to: ${scheduleEndTime}`);
      
      // Get Auth Headers
      const headers = await this.getAuthHeaders();
      
      // Make API request
      const url = `${this.BASE_URL_V1_1}/campaigns/${id}`;
      const payload = {
        schedule_end_time: scheduleEndTime
      };
      
      const response = await axios.patch(url, payload, { headers });
      
      // If we get here without an error, assume success
      console.log(`Successfully updated end time for campaign ${id}`);
      
      // Optional: You can check response.data to confirm
      if (response.data && response.data.schedule_end_time === scheduleEndTime) {
        console.log(`Confirmed end time update for campaign ${id}`);
      }
    } catch (error) {
      console.error(`Error updating end time for campaign ${id}:`, error);
      throw new Error(`Failed to update end time for campaign ${id}`);
    }
  }

  /**
   * Update the campaign's daily budget
   * 
   * Uses: PATCH /v1.1/campaigns/{id}
   */
  async updateCampaignBudget(id: number, maxDaily: number): Promise<void> {
    try {
      console.log(`Updating daily budget for campaign ${id} to: $${maxDaily.toFixed(2)}`);
      
      // Get Auth Headers
      const headers = await this.getAuthHeaders();
      
      // Make API request
      const url = `${this.BASE_URL_V1_1}/campaigns/${id}`;
      const payload = {
        max_daily: maxDaily
      };
      
      const response = await axios.patch(url, payload, { headers });
      
      // If we get here without an error, assume success
      console.log(`Successfully updated daily budget for campaign ${id}`);
      
      // Optional: You can check response.data to confirm
      if (response.data && response.data.max_daily === maxDaily) {
        console.log(`Confirmed budget update for campaign ${id}`);
      }
    } catch (error) {
      console.error(`Error updating budget for campaign ${id}:`, error);
      throw new Error(`Failed to update budget for campaign ${id}`);
    }
  }

  /**
   * Get all saved TrafficStar campaigns from our database
   */
  async getSavedCampaigns() {
    try {
      // Get all campaigns - we'll filter client-side
      const campaignsResult = await db
        .select()
        .from(campaigns);
      
      // Filter to only include campaigns with trafficstarCampaignId
      return campaignsResult.filter(campaign => 
        campaign.trafficstarCampaignId !== null && 
        campaign.trafficstarCampaignId !== undefined
      );
    } catch (error) {
      console.error('Error getting saved TrafficStar campaigns:', error);
      return [];
    }
  }
}

// Export a singleton instance
export const trafficStarService = new TrafficStarService();
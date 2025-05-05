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
import { getTodayFormatted, getYesterdayFormatted, parseReportSpentValue } from './trafficstar-spent-helper';

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
  active?: boolean;
  status?: string;
  spent?: number | string;
  spent_today?: number | string;
  [key: string]: any;
}

interface CampaignRunPauseResponse {
  success?: number[];
  failed?: number[];
}

/**
 * TrafficStar API Service
 * 
 * Provides methods to interact with the TrafficStar API
 */
class TrafficStarService {
  private BASE_URL = 'https://api.trafficstars.com';
  private BASE_URL_V1_1 = 'https://api.trafficstars.com/v1.1';  
  private BASE_URL_V2 = 'https://api.trafficstars.com/v2';
  
  private accessToken: string | null = null;
  private tokenExpiry: number = 0;
  
  constructor() {
    console.log('TrafficStar API Service initialized');
  }
  
  /**
   * Get base URL for API endpoints
   */
  public getBaseUrl(): string {
    return this.BASE_URL_V1_1;
  }

  /**
   * Get access token for API requests
   * Handles refreshing if token is expired
   */
  public async getAccessToken(): Promise<string> {
    const now = Math.floor(Date.now() / 1000);
    
    // If token is still valid, return it
    if (this.accessToken && this.tokenExpiry > now) {
      return this.accessToken;
    }
    
    // Otherwise, get a new token
    return this.refreshToken();
  }
  
  /**
   * Refresh the access token using OAUTH 2.0 with refresh_token grant type
   */
  public async refreshToken(): Promise<string> {
    try {
      // Get API key from environment
      const apiKey = process.env.TRAFFICSTAR_API_KEY;
      
      if (!apiKey) {
        throw new Error('TrafficStar API key not set in environment variables');
      }
      
      // Use OAuth 2.0 with refresh_token grant type
      const tokenUrl = `${this.BASE_URL}/v1/auth/token`;
      
      const params = new URLSearchParams();
      params.append('grant_type', 'refresh_token');
      params.append('refresh_token', apiKey);
      
      const response = await axios.post(tokenUrl, params.toString(), {
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded'
        }
      });
      
      const tokenResponse: TokenResponse = response.data;
      
      if (!tokenResponse.access_token) {
        throw new Error('No access token in response');
      }
      
      // Store the token and calculate expiry time
      this.accessToken = tokenResponse.access_token;
      this.tokenExpiry = Math.floor(Date.now() / 1000) + tokenResponse.expires_in - 60; // Expire 60 seconds early to be safe
      
      return this.accessToken;
    } catch (error) {
      console.error('Error refreshing token:', error);
      throw new Error('Failed to refresh token');
    }
  }
  
  /**
   * Get authentication headers for API requests
   */
  public async getAuthHeaders(): Promise<{ Authorization: string }> {
    const token = await this.getAccessToken();
    
    return {
      'Authorization': `Bearer ${token}`
    };
  }

  /**
   * Get spent value for campaign using Reports API
   * 
   * Uses: GET /v1.1/advertiser/campaign/report/by-day
   * 
   * Format based on TrafficStar documentation where we need to use
   * the exact date format YYYY-MM-DD for the current UTC date
   * Both date_from and date_to should be the same date
   */
  async getCampaignSpentValue(campaignId: number): Promise<{ totalSpent: number }> {
    try {
      // Get the current UTC date in YYYY-MM-DD format using our helper
      const currentUTCDate = getTodayFormatted();
      
      console.log(`Getting spent value for campaign ${campaignId} for date ${currentUTCDate}`);
      
      // Get Auth Headers
      const headers = await this.getAuthHeaders();
      
      // Per the TrafficStar API docs, we need the correct parameters
      // We use same date for both from and to as required, using current UTC date
      const params = new URLSearchParams();
      params.append('campaign_id', campaignId.toString());
      params.append('date_from', currentUTCDate);
      params.append('date_to', currentUTCDate);
      params.append('group_by', 'day'); // Group by day
      params.append('columns', 'amount'); // We need amount column
      
      console.log(`Report API request parameters: ${params.toString()}`);
      
      // Make API request to the campaign reports API with properly formatted URL
      const baseUrl = `${this.BASE_URL_V1_1}/advertiser/campaign/report/by-day`;
      const url = `${baseUrl}?${params.toString()}`;
      
      console.log(`Making direct request to: ${url}`);
      
      const response = await axios.get(url, { headers });
      
      // Log the raw response for debugging
      console.log(`Report API raw response type:`, typeof response.data);
      
      // If response is successful and has data
      if (response.data) {
        // Use our helper to extract the amount values from the report data
        const totalSpent = parseReportSpentValue(response.data);
        
        console.log(`Campaign ${campaignId} spent value from reports API: $${totalSpent.toFixed(4)}`);
        return { totalSpent };
      }
      
      // If response is empty or not as expected, try direct campaign endpoint
      console.log(`Falling back to campaign endpoint for spent value`);
      const campaign = await this.getCampaign(campaignId);
      
      if (campaign && (campaign.spent !== undefined || campaign.spent_today !== undefined)) {
        // Parse spent value using our helper
        const spentValue = parseReportSpentValue(campaign);
        console.log(`Campaign ${campaignId} direct API spent value: $${spentValue.toFixed(4)}`);
        return { totalSpent: spentValue };
      }
      
      // No spent data found
      console.log(`No spent data found for campaign ${campaignId}`);
      return { totalSpent: 0 };
    } catch (error: any) {
      console.error(`Error getting spent value for campaign ${campaignId}:`, error);
      
      // Log more details about the error
      if (error.response) {
        console.error(`Error response status: ${error.response.status}`);
        console.error(`Error response data:`, error.response.data);
      }
      
      // Try direct method with campaign endpoint as fallback
      try {
        console.log(`Falling back to campaign endpoint for spent value`);
        const campaign = await this.getCampaign(campaignId);
        
        if (campaign && (campaign.spent !== undefined || campaign.spent_today !== undefined)) {
          // Parse spent value using our helper
          const spentValue = parseReportSpentValue(campaign);
          console.log(`Campaign ${campaignId} direct API spent value: $${spentValue.toFixed(4)}`);
          return { totalSpent: spentValue };
        }
      } catch (fallbackError) {
        console.error(`Fallback method also failed:`, fallbackError);
      }
      
      // Don't throw, just return 0 as spend
      return { totalSpent: 0 };
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
        console.log(`Confirmed daily budget update for campaign ${id}`);
      }
    } catch (error) {
      console.error(`Error updating daily budget for campaign ${id}:`, error);
      throw new Error(`Failed to update daily budget for campaign ${id}`);
    }
  }
}

export const trafficStarService = new TrafficStarService();
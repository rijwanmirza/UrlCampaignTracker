/**
 * TrafficStar API Service
 * This service handles all interactions with the TrafficStar API
 */
import axios from 'axios';
import { db } from './db';
import { trafficstarCredentials, trafficstarCampaigns, campaigns, apiErrorLogs } from '@shared/schema';
import { eq, sql, desc } from 'drizzle-orm';
import { storage } from './storage';
import { makeApiRequestWithRetry, retryOperation } from './api-utils';

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
    const [currentHour, currentMin, currentSec] = currentTime.split(':').map(Number);
    const [targetHour, targetMin, targetSec] = targetTime.split(':').map(Number);
    
    // Convert both times to total minutes
    const currentTotalMinutes = currentHour * 60 + currentMin + (currentSec / 60);
    const targetTotalMinutes = targetHour * 60 + targetMin + (targetSec / 60);
    
    // Handle day rollover (when target time is earlier in the day than current time)
    let diff = currentTotalMinutes - targetTotalMinutes;
    if (diff < 0) {
      diff += 24 * 60; // Add a full day in minutes
    }
    
    return diff >= 0 && diff <= windowMinutes;
  }

  /**
   * Ensure we have a valid access token
   */
  private async ensureToken(): Promise<string> {
    // Check if token exists and is not expired
    if (this.accessToken && this.tokenExpiry && new Date() < this.tokenExpiry) {
      return this.accessToken;
    }
    
    let apiKey = '';
    
    // Try to get API key from environment variables first
    if (process.env.TRAFFICSTAR_API_KEY) {
      apiKey = process.env.TRAFFICSTAR_API_KEY;
      console.log('Using TrafficStar API key from environment variables');
    } else {
      // If not in environment variables, try to get from database
      try {
        const [credentials] = await db
          .select()
          .from(trafficstarCredentials)
          .orderBy(desc(trafficstarCredentials.updatedAt))
          .limit(1);
        
        if (credentials && credentials.apiKey) {
          apiKey = credentials.apiKey;
          console.log('Using TrafficStar API key from database');
        }
      } catch (error) {
        console.error('Error getting TrafficStar API key from database:', error);
      }
    }
    
    if (!apiKey) {
      throw new Error('TrafficStar API key not found. Please set it up in the settings.');
    }
    
    // Try to get token using the API key
    try {
      // Try each auth endpoint until one works
      let tokenResponse: TokenResponse | null = null;
      let lastError: Error | null = null;
      
      for (const authEndpoint of AUTH_ENDPOINTS) {
        try {
          console.log(`Trying to get token from ${authEndpoint}`);
          const response = await axios.post(authEndpoint, {
            api_key: apiKey
          }, {
            headers: {
              'Content-Type': 'application/json'
            },
            timeout: 5000 // 5 second timeout
          });
          
          if (response.data && response.data.access_token) {
            tokenResponse = response.data;
            console.log(`Successfully obtained token from ${authEndpoint}`);
            break;
          }
        } catch (error) {
          console.log(`Failed to get token from ${authEndpoint}:`, error);
          lastError = error as Error;
        }
      }
      
      if (!tokenResponse) {
        throw lastError || new Error('Failed to obtain token from any auth endpoint');
      }
      
      // Calculate token expiry time
      const expiresIn = tokenResponse.expires_in || 3600; // Default to 1 hour if not provided
      const expiryDate = new Date();
      expiryDate.setSeconds(expiryDate.getSeconds() + expiresIn - 300); // Expire 5 minutes before actual expiry
      
      // Set token and expiry time
      this.accessToken = tokenResponse.access_token;
      this.tokenExpiry = expiryDate;
      
      return this.accessToken;
    } catch (error) {
      console.error('Error obtaining TrafficStar API token:', error);
      throw new Error('Failed to obtain TrafficStar API token');
    }
  }

  /**
   * Get all campaigns from TrafficStar
   */
  async getCampaigns(): Promise<Campaign[]> {
    return retryOperation(async () => {
      const token = await this.ensureToken();
      
      // Try each API endpoint until one works
      let lastError: Error | null = null;
      let campaignsResponse: Campaign[] | null = null;
      
      for (const baseUrl of API_BASE_URLS) {
        try {
          console.log(`Trying to get campaigns from ${baseUrl}/campaigns`);
          const response = await axios.get(`${baseUrl}/campaigns`, {
            headers: {
              'Authorization': `Bearer ${token}`,
              'Content-Type': 'application/json'
            },
            timeout: 30000 // 30 second timeout
          });
          
          if (response.data && response.data.response) {
            campaignsResponse = response.data.response;
            console.log(`Successfully retrieved ${campaignsResponse.length} campaigns from ${baseUrl}/campaigns`);
            
            break;
          }
        } catch (error) {
          console.log(`Failed to get campaigns from ${baseUrl}/campaigns:`, error);
          lastError = error as Error;
        }
      }
      
      if (!campaignsResponse) {
        throw lastError || new Error('Failed to retrieve campaigns from any API endpoint');
      }
      
      // Store campaigns in local database for reference
      await this.syncCampaignsToDatabase(campaignsResponse);
      
      return campaignsResponse;
    }, {
      actionType: 'get_campaigns',
      maxAttempts: 3,
      delayMs: 2000
    });
  }

  /**
   * Get a single campaign from TrafficStar
   */
  async getCampaign(id: number): Promise<Campaign> {
    return retryOperation(async () => {
      const token = await this.ensureToken();
      
      // Try each API endpoint until one works
      let lastError: Error | null = null;
      let campaignResponse: Campaign | null = null;
      
      for (const baseUrl of API_BASE_URLS) {
        try {
          console.log(`Trying to get campaign ${id} using endpoint: ${baseUrl}/campaigns/${id}`);
          const response = await axios.get(`${baseUrl}/campaigns/${id}`, {
            headers: {
              'Authorization': `Bearer ${token}`,
              'Content-Type': 'application/json'
            },
            timeout: 10000 // 10 second timeout
          });
          
          if (response.data && response.data.response) {
            campaignResponse = response.data.response;
            console.log(`Successfully retrieved campaign ${id} from ${baseUrl}/campaigns/${id}`);
            break;
          }
        } catch (error) {
          console.log(`Failed to get campaign ${id} using endpoint: ${baseUrl}/campaigns/${id}`);
          lastError = error as Error;
        }
      }
      
      if (!campaignResponse) {
        throw lastError || new Error(`Failed to retrieve campaign ${id} from any API endpoint`);
      }
      
      return campaignResponse;
    }, {
      actionType: 'get_campaign',
      campaignId: id,
      maxAttempts: 3,
      delayMs: 2000
    });
  }

  /**
   * Pause a campaign
   */
  async pauseCampaign(id: number): Promise<void> {
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
    
    // Use retry mechanism to ensure the operation completes successfully
    try {
      await retryOperation(
        async () => {
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
            
            // Update our record with success status
            await db.update(trafficstarCampaigns)
              .set({ 
                lastRequestedActionSuccess: true,
                updatedAt: new Date()
              })
              .where(eq(trafficstarCampaigns.trafficstarId, id.toString()));
            
            return;
          }
          
          // If we get here, the API call was made but not successful for this specific campaign
          throw new Error(`API call succeeded but campaign ${id} was not paused successfully`);
        },
        {
          actionType: 'pause_campaign',
          campaignId: id, 
          endpoint: 'https://api.trafficstars.com/v2/campaigns/pause',
          method: 'PUT',
          requestBody: { campaign_ids: [id] }
        }
      );
    } catch (error: any) {
      console.error(`All retry attempts to pause campaign ${id} failed:`, error);
      
      // Update our record with the final error status
      await db.update(trafficstarCampaigns)
        .set({ 
          lastRequestedActionSuccess: false,
          updatedAt: new Date()
        })
        .where(eq(trafficstarCampaigns.trafficstarId, id.toString()));
      
      // Rethrow the error so the caller knows this operation failed
      throw error;
    }
  }

  /**
   * Activate a campaign
   */
  async activateCampaign(id: number): Promise<void> {
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
    
    // Use the retry mechanism for activation
    try {
      await retryOperation(
        async () => {
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
            
            // Update our record with success status
            await db.update(trafficstarCampaigns)
              .set({ 
                lastRequestedActionSuccess: true,
                updatedAt: new Date()
              })
              .where(eq(trafficstarCampaigns.trafficstarId, id.toString()));
            
            // Now set the end time using its own retry mechanism
            try {
              // Set end time to end of current day in TrafficStar
              await this.updateCampaignEndTime(id, endTimeFormatted);
              console.log(`✅ Set end time to ${endTimeFormatted} for activated campaign ${id}`);
            } catch (endTimeError) {
              console.error(`Error setting end time after activation:`, endTimeError);
              // Continue with success even if end time setting fails
              // The activate operation itself succeeded
            }
            
            // Verify campaign is actually active by getting its current status
            try {
              const campaign = await this.getCampaign(id);
              console.log(`Campaign ${id} status after activation attempt:`, JSON.stringify({
                name: campaign.name,
                active: campaign.active,
                status: campaign.status,
                schedule_end_time: campaign.schedule_end_time
              }));
            } catch (statusError) {
              console.error(`Error verifying campaign status after activation:`, statusError);
            }
            
            return;
          }
          
          // If we get here, the API call was made but not successful for this specific campaign
          throw new Error(`API call succeeded but campaign ${id} was not activated successfully`);
        },
        {
          actionType: 'activate_campaign',
          campaignId: id,
          endpoint: 'https://api.trafficstars.com/v2/campaigns/run',
          method: 'PUT',
          requestBody: { campaign_ids: [id] }
        }
      );
    } catch (error: any) {
      console.error(`All retry attempts to activate campaign ${id} failed:`, error);
      
      // Update our record with the final error status
      await db.update(trafficstarCampaigns)
        .set({ 
          lastRequestedActionSuccess: false,
          updatedAt: new Date()
        })
        .where(eq(trafficstarCampaigns.trafficstarId, id.toString()));
      
      // Rethrow the error so the caller knows this operation failed
      throw error;
    }
  }

  /**
   * Update a campaign's daily budget
   */
  async updateCampaignDailyBudget(id: number, maxDaily: number): Promise<void> {
    console.log(`Updating budget for campaign ${id} to $${maxDaily}...`);
    
    // Update local database FIRST for instant UI feedback
    await db.update(trafficstarCampaigns)
      .set({
        maxDaily: maxDaily.toString(),
        updatedAt: new Date(),
        lastRequestedAction: 'update_budget',
        lastRequestedActionAt: new Date()
      })
      .where(eq(trafficstarCampaigns.trafficstarId, id.toString()));
    
    // Use retry mechanism to update the budget
    try {
      await retryOperation(
        async () => {
          const token = await this.ensureToken();
          
          // Try the v1.1 API endpoint which is known to work
          const response = await axios.patch(
            `https://api.trafficstars.com/v1.1/campaigns/${id}`,
            {
              max_daily: maxDaily
            },
            {
              headers: {
                'Authorization': `Bearer ${token}`,
                'Content-Type': 'application/json'
              },
              timeout: 10000
            }
          );
          
          console.log(`Successfully updated campaign ${id} budget to $${maxDaily}`);
          
          // Update local database with success
          await db.update(trafficstarCampaigns)
            .set({
              lastRequestedActionSuccess: true,
              updatedAt: new Date()
            })
            .where(eq(trafficstarCampaigns.trafficstarId, id.toString()));
          
          return response.data;
        },
        {
          actionType: 'update_budget',
          campaignId: id,
          endpoint: `https://api.trafficstars.com/v1.1/campaigns/${id}`,
          method: 'PATCH',
          requestBody: { max_daily: maxDaily }
        }
      );
    } catch (error: any) {
      console.error(`All retry attempts to update budget for campaign ${id} failed:`, error);
      
      // Update local database with failure
      await db.update(trafficstarCampaigns)
        .set({
          lastRequestedActionSuccess: false,
          updatedAt: new Date()
        })
        .where(eq(trafficstarCampaigns.trafficstarId, id.toString()));
      
      throw error;
    }
  }

  /**
   * Update a campaign's end time
   */
  async updateCampaignEndTime(id: number, scheduleEndTime: string): Promise<void> {
    console.log(`Setting campaign ${id} end time to: ${scheduleEndTime} (original input: ${scheduleEndTime})`);
    
    // Update local database FIRST for instant UI feedback
    await db.update(trafficstarCampaigns)
      .set({
        scheduleEndTime: scheduleEndTime,
        updatedAt: new Date(),
        lastRequestedAction: 'update_end_time',
        lastRequestedActionAt: new Date()
      })
      .where(eq(trafficstarCampaigns.trafficstarId, id.toString()));
    
    // Use retry mechanism to update the end time
    try {
      await retryOperation(
        async () => {
          const token = await this.ensureToken();
          
          // Try the v1.1 API endpoint which is known to work
          const response = await axios.patch(
            `https://api.trafficstars.com/v1.1/campaigns/${id}`,
            {
              schedule_end_time: scheduleEndTime
            },
            {
              headers: {
                'Authorization': `Bearer ${token}`,
                'Content-Type': 'application/json'
              },
              timeout: 10000
            }
          );
          
          console.log(`Successfully updated campaign ${id} end time to ${scheduleEndTime}`);
          
          // Update local database with success
          await db.update(trafficstarCampaigns)
            .set({
              lastRequestedActionSuccess: true,
              updatedAt: new Date()
            })
            .where(eq(trafficstarCampaigns.trafficstarId, id.toString()));
          
          return response.data;
        },
        {
          actionType: 'update_end_time',
          campaignId: id,
          endpoint: `https://api.trafficstars.com/v1.1/campaigns/${id}`,
          method: 'PATCH',
          requestBody: { schedule_end_time: scheduleEndTime }
        }
      );
    } catch (error: any) {
      console.error(`All retry attempts to update end time for campaign ${id} failed:`, error);
      
      // Update local database with failure
      await db.update(trafficstarCampaigns)
        .set({
          lastRequestedActionSuccess: false,
          updatedAt: new Date()
        })
        .where(eq(trafficstarCampaigns.trafficstarId, id.toString()));
      
      throw error;
    }
  }

  /**
   * Sync campaigns from API to database
   */
  private async syncCampaignsToDatabase(campaigns: Campaign[]): Promise<void> {
    // Process 5 campaigns at a time to avoid overloading the database
    const chunkSize = 5;
    for (let i = 0; i < campaigns.length; i += chunkSize) {
      const chunk = campaigns.slice(i, i + chunkSize);
      
      await Promise.all(chunk.map(async (campaign) => {
        try {
          // Check if campaign exists in database
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
                maxDaily: campaign.max_daily ? campaign.max_daily.toString() : '0',
                scheduleEndTime: campaign.schedule_end_time || null,
                campaignData: campaign,
                updatedAt: new Date()
              })
              .where(eq(trafficstarCampaigns.trafficstarId, campaign.id.toString()));
          } else {
            // Insert new campaign
            await db.insert(trafficstarCampaigns)
              .values({
                trafficstarId: campaign.id.toString(),
                name: campaign.name,
                status: campaign.status,
                active: campaign.active,
                maxDaily: campaign.max_daily ? campaign.max_daily.toString() : '0',
                scheduleEndTime: campaign.schedule_end_time || null,
                campaignData: campaign,
                lastVerifiedAt: new Date(),
                createdAt: new Date(),
                updatedAt: new Date()
              });
          }
        } catch (error) {
          console.error(`Error syncing campaign ${campaign.id} to database:`, error);
        }
      }));
    }
  }

  /**
   * Auto-manage TrafficStar campaigns based on application parameters
   * Implementation of the requirement to automatically manage linked TrafficStar campaigns
   */
  async autoManageCampaigns(): Promise<void> {
    try {
      console.log('Running scheduled auto-management for TrafficStar campaigns');
      
      // Get all campaigns with auto-management enabled
      const campaignsWithAutoManagement = await db
        .select({
          id: campaigns.id,
          name: campaigns.name,
          trafficstarCampaignId: campaigns.trafficstarCampaignId,
          budgetUpdateTime: campaigns.budgetUpdateTime,
          lastTrafficstarSync: campaigns.lastTrafficstarSync
        })
        .from(campaigns)
        .where(eq(campaigns.autoManageTrafficstar, true));
      
      console.log(`Found ${campaignsWithAutoManagement.length} campaigns with auto-management enabled`);
      
      // Process each campaign
      for (const campaign of campaignsWithAutoManagement) {
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
    if (!campaign.trafficstarCampaignId) {
      console.log(`Campaign ${campaign.id} does not have a TrafficStar campaign ID, skipping auto-management`);
      return;
    }
    
    const trafficstarId = parseInt(campaign.trafficstarCampaignId);
    if (isNaN(trafficstarId)) {
      console.log(`Campaign ${campaign.id} has invalid TrafficStar campaign ID: ${campaign.trafficstarCampaignId}`);
      return;
    }
    
    console.log(`Auto-managing TrafficStar campaign ${trafficstarId} for campaign ${campaign.id}`);
    
    // Get all URLS for the campaign
    const urls = await storage.getUrls(campaign.id);
    
    // Find active URLs only
    const activeUrls = urls.filter(url => url.status === 'active');
    
    // Current UTC time in HH:MM:SS format for checking budget update time window
    const now = new Date();
    const currentUtcTime = [
      now.getUTCHours().toString().padStart(2, '0'),
      now.getUTCMinutes().toString().padStart(2, '0'),
      now.getUTCSeconds().toString().padStart(2, '0')
    ].join(':');
    
    // Budget update time from campaign settings (database)
    // Default to midnight UTC
    const budgetUpdateTime = campaign.budgetUpdateTime || '00:00:00';
    
    // Time the budget was last updated (if any)
    const lastUpdateTime = campaign.lastTrafficstarSync
      ? new Date(campaign.lastTrafficstarSync).toISOString()
      : null;
    
    // If no active URLs, pause the campaign immediately
    if (activeUrls.length === 0) {
      console.log(`⚠️ Campaign ${campaign.id} has NO active URLs - pausing TrafficStar campaign and setting end date to current time (${now.toISOString().slice(0, 10)} ${now.getUTCHours().toString().padStart(2, '0')}:${now.getUTCMinutes().toString().padStart(2, '0')}:${now.getUTCSeconds().toString().padStart(2, '0')})`);
      
      // Format the current UTC time for the TrafficStar API
      // Use the YYYY-MM-DD HH:MM format without seconds
      const formattedCurrentDateTime = `${now.toISOString().slice(0, 10)} ${now.getUTCHours().toString().padStart(2, '0')}:${now.getUTCMinutes().toString().padStart(2, '0')}:${now.getUTCSeconds().toString().padStart(2, '0')}`;
      
      try {
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
    
    // Check if it's time to update the budget
    // Either it's within the window after budget update time, 
    // or the budget update time was changed, 
    // or it's the first time syncing this campaign
    if (this.isWithinTimeWindow(currentUtcTime, budgetUpdateTime, 5) || 
        budgetUpdateTimeChanged || 
        !lastUpdateTime) {
        
      console.log(`It's time to update budget for campaign ${campaign.id}`);
      
      try {
        // Update the TrafficStar campaign with the fixed daily budget of $10.15
        await this.updateCampaignDailyBudget(trafficstarId, 10.15);
        
        // If we have remaining clicks, activate the campaign
        if (totalRemainingClicks > 15000) {
          console.log(`Activating TrafficStar campaign for campaign ${campaign.id} (${totalRemainingClicks} remaining clicks > 15,000)`);
          await this.activateCampaign(trafficstarId);
          console.log(`Successfully activated TrafficStar campaign for campaign ${campaign.id}`);
        } else {
          console.log(`Not activating TrafficStar campaign for campaign ${campaign.id} (${totalRemainingClicks} remaining clicks <= 15,000)`);
        }
        
        // Update campaign's last sync timestamp
        await db.update(campaigns)
          .set({
            lastTrafficstarSync: new Date(),
            updatedAt: new Date()
          })
          .where(eq(campaigns.id, campaign.id));
        
        console.log(`Successfully auto-managed TrafficStar campaign ${trafficstarId} for campaign ${campaign.id}`);
      } catch (error) {
        console.error(`Error auto-managing TrafficStar campaign ${trafficstarId} for campaign ${campaign.id}:`, error);
      }
    } else {
      console.log(`Not time to update budget for campaign ${campaign.id} - current time: ${currentUtcTime}, update time: ${budgetUpdateTime}`);
    }
  }

  /**
   * Scheduled function to run daily budget updates and start campaigns as needed
   * This should be called on application startup and at appropriate intervals
   */
  async scheduleAutoManagement(): Promise<void> {
    try {
      // Run immediately on startup
      await this.autoManageCampaigns();
      
      // Then set up interval to run every minute
      setInterval(async () => {
        try {
          await this.autoManageCampaigns();
        } catch (error) {
          console.error('Error in scheduled autoManageCampaigns:', error);
        }
      }, 60000); // 1 minute interval
      
      console.log('TrafficStar auto-management scheduler initialized');
    } catch (error) {
      console.error('Error initializing TrafficStar auto-management scheduler:', error);
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
        .orderBy(desc(trafficstarCampaigns.updatedAt));
      
      return savedCampaigns;
    } catch (error) {
      console.error('Error getting saved campaigns:', error);
      throw error;
    }
  }

  /**
   * Get campaign spent value by date range
   * @param id Campaign ID
   * @param dateFrom Optional start date in YYYY-MM-DD format (defaults to 7 days ago)
   * @param dateUntil Optional end date in YYYY-MM-DD format (defaults to today)
   * @returns Campaign stats including daily costs
   */
  async getCampaignSpentValue(id: number, dateFrom?: string, dateUntil?: string): Promise<any> {
    return retryOperation(async () => {
      const token = await this.ensureToken();
      
      // Set default dates if not provided
      const today = new Date();
      const fromDate = dateFrom || new Date(today.getTime() - 7 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);
      const untilDate = dateUntil || today.toISOString().slice(0, 10);
      
      // Add one day to until date (API is exclusive on the end date)
      const untilPlusOneDay = new Date(untilDate);
      untilPlusOneDay.setDate(untilPlusOneDay.getDate() + 1);
      const untilPlusOneDayFormatted = untilPlusOneDay.toISOString().slice(0, 10);
      
      console.log(`Fetching spent value for campaign ${id} from ${fromDate} to ${untilDate}`);
      
      try {
        // Use the /stats endpoint with the date range
        const response = await axios.get(
          `https://api.trafficstars.com/v1.1/campaigns/${id}/stats?date_from=${fromDate}&date_until=${untilPlusOneDayFormatted}`,
          {
            headers: {
              'Authorization': `Bearer ${token}`,
              'Content-Type': 'application/json'
            },
            timeout: 30000 // 30 second timeout
          }
        );
        
        let totalSpent = 0;
        let totalImpressions = 0;
        let totalClicks = 0;
        let totalLeads = 0;
        
        if (response && response.data && response.data.response) {
          const responseData = response.data.response;
          
          // Sum up the totals
          if (Array.isArray(responseData)) {
            responseData.forEach((day: any) => {
              totalSpent += parseFloat(day.cost || 0);
              totalImpressions += parseInt(day.impressions || 0, 10);
              totalClicks += parseInt(day.clicks || 0, 10);
              totalLeads += parseInt(day.leads || 0, 10);
            });
          }
        }
        
        console.log(`Successfully retrieved spent value for campaign ${id}`);
        
        // Return the summary data
        return {
          campaignId: id,
          dateFrom: fromDate,
          dateUntil: untilDate,
          totalSpent: totalSpent.toFixed(2),
          totalImpressions,
          totalClicks,
          totalLeads,
          costPerClick: totalClicks > 0 ? (totalSpent / totalClicks).toFixed(4) : '0.0000',
          dailyData: response?.data?.response || []
        };
      } catch (error) {
        console.error(`Error getting spent value for campaign ${id}:`, error);
        throw error;
      }
    }, {
      actionType: 'get_spent_value',
      campaignId: id,
      endpoint: `https://api.trafficstars.com/v1.1/campaigns/${id}/stats`,
      method: 'GET'
    });
  }

  /**
   * Save API key
   */
  async saveApiKey(apiKey: string): Promise<boolean> {
    try {
      // First, test if the API key is valid by trying to get a token
      await axios.post(AUTH_ENDPOINTS[0], {
        api_key: apiKey
      }, {
        headers: {
          'Content-Type': 'application/json'
        },
        timeout: 5000 // 5 second timeout
      });
      
      // If we get here, the API key is valid, save it
      await db.insert(trafficstarCredentials)
        .values({
          apiKey,
          createdAt: new Date(),
          updatedAt: new Date()
        });
      
      // Reset token so it will be fetched again with the new API key
      this.accessToken = null;
      this.tokenExpiry = null;
      
      return true;
    } catch (error) {
      console.error('Error saving API key:', error);
      return false;
    }
  }

  /**
   * Check if API key is set (either in environment variables or database)
   */
  async isConfigured(): Promise<boolean> {
    // If API key is in environment variables, return true
    if (process.env.TRAFFICSTAR_API_KEY) {
      return true;
    }
    
    // Otherwise, check if API key is in database
    try {
      const [credentials] = await db
        .select()
        .from(trafficstarCredentials)
        .orderBy(desc(trafficstarCredentials.updatedAt))
        .limit(1);
      
      return !!credentials?.apiKey;
    } catch (error) {
      console.error('Error checking if TrafficStar API is configured:', error);
      return false;
    }
  }
}

export const trafficStarService = new TrafficStarService();
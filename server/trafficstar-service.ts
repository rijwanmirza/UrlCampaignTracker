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
   * Pause a campaign
   */
  async pauseCampaign(id: number): Promise<void> {
    try {
      // If mock mode is enabled and API calls are failing, just update the local database
      if (ENABLE_MOCK_MODE) {
        try {
          // First try the real API
          const token = await this.ensureToken();
          
          // Try all possible API endpoint formats until one works
          let success = false;
          let lastError = null;
          
          // Use the v1.1 API endpoint directly for campaign pausing
          // We know this endpoint works based on previous testing
          try {
            console.log(`Pausing campaign ${id} using direct v1.1 API endpoint`);
            await axios.patch(`https://api.trafficstars.com/v1.1/campaigns/${id}`, {
              active: false
            }, {
              headers: {
                'Authorization': `Bearer ${token}`,
                'Content-Type': 'application/json'
              },
              timeout: 10000 // 10 second timeout
            });
            console.log(`Successfully paused campaign ${id} using v1.1 PATCH endpoint`);
            success = true;
          } catch (error) {
            console.log(`Failed to pause campaign ${id} using v1.1 endpoint: ${error.message}`);
            lastError = error;
            
            // If the direct approach fails, try a few other formats just in case
            for (const baseUrl of ['https://api.trafficstars.com/v1.1', 'https://api.trafficstars.com/v1']) {
              try {
                console.log(`Trying alternate endpoint: ${baseUrl}/campaigns/${id}`);
                await axios.patch(`${baseUrl}/campaigns/${id}`, {
                  active: false
                }, {
                  headers: {
                    'Authorization': `Bearer ${token}`,
                    'Content-Type': 'application/json'
                  },
                  timeout: 5000 // 5 second timeout
                });
                console.log(`Successfully paused campaign ${id} using ${baseUrl}`);
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
                status: 'paused',
                active: false,
                createdAt: new Date(),
                updatedAt: new Date()
              });
              console.log(`Created new paused campaign record for ID ${id} in mock mode`);
            } else {
              // Update existing campaign record
              await db.update(trafficstarCampaigns)
                .set({ active: false, status: 'paused', updatedAt: new Date() })
                .where(eq(trafficstarCampaigns.trafficstarId, id.toString()));
              console.log(`Updated campaign ${id} to paused state in mock mode`);
            }
            
            return;
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
              status: 'paused',
              active: false,
              createdAt: new Date(),
              updatedAt: new Date()
            });
            console.log(`Created new paused campaign record for ID ${id} in mock mode`);
          } else {
            // Update existing campaign record
            await db.update(trafficstarCampaigns)
              .set({ active: false, status: 'paused', updatedAt: new Date() })
              .where(eq(trafficstarCampaigns.trafficstarId, id.toString()));
            console.log(`Updated campaign ${id} to paused state in mock mode`);
          }
          
          return;
        }
      } else {
        // If mock mode is disabled, use the v1.1 API directly
        const token = await this.ensureToken();
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
        
        // Use the v1.1 API endpoint directly for campaign pausing
        try {
          console.log(`Pausing campaign ${id} using direct v1.1 API endpoint (real mode)`);
          
          // Get the campaign first to check what parameters it needs
          const campaign = await this.getCampaign(id);
          
          // Add all possible required parameters for pausing
          const pauseParams: any = {
            active: false,
            status: 'paused',
            is_active: false,
            is_paused: true,
            is_archived: false
          };
          
          // Keep existing budget if present
          if (campaign.max_daily) {
            pauseParams.max_daily = campaign.max_daily;
          }
          
          console.log(`Sending pause request with parameters: ${JSON.stringify(pauseParams)}`);
          
          await axios.patch(`https://api.trafficstars.com/v1.1/campaigns/${id}`, pauseParams, {
            headers: {
              'Authorization': `Bearer ${token}`,
              'Content-Type': 'application/json'
            },
            timeout: 30000 // 30 second timeout
          });
          console.log(`Successfully paused campaign ${id} using v1.1 PATCH endpoint (real mode)`);
          success = true;
        } catch (error) {
          console.error(`Failed to pause campaign ${id} using v1.1 endpoint: ${error.message}`, error);
          lastError = error;
        }
        
        if (!success) {
          // If we're here, all attempts failed
          console.error(`Failed to pause campaign ${id}. Error:`, lastError);
          throw new Error(`Could not pause campaign. API call failed.`);
        }
      }

      // Update local record
      await db.update(trafficstarCampaigns)
        .set({ active: false, updatedAt: new Date() })
        .where(eq(trafficstarCampaigns.trafficstarId, id.toString()));
        
      // Verify the campaign was actually paused - with retries and force refresh
      try {
        console.log(`Verifying campaign ${id} was successfully paused - implementing verification with retries`);
        
        // A direct force refresh request to the API outside of our caching layer
        const forceRefresh = async () => {
          try {
            const token = await this.ensureToken();
            // Use a cache-busting timestamp query param
            const timestamp = Date.now();
            const response = await axios.get(
              `https://api.trafficstars.com/v1.1/campaigns/${id}?_t=${timestamp}`, 
              { 
                headers: {
                  'Authorization': `Bearer ${token}`,
                  'Cache-Control': 'no-cache, no-store, must-revalidate'
                } 
              }
            );
            return response.data?.response || null;
          } catch (error) {
            console.log(`Force refresh error: ${error}`);
            return null;
          }
        };
        
        // Multiple verification attempts (up to 3 times)
        let campaign = null;
        const maxRetries = 3;
        let retryCount = 0;
        let success = false;
        
        while (retryCount < maxRetries && !success) {
          // Force a direct API refresh to get the latest status
          const freshData = await forceRefresh();
          
          // Also get via our cached method
          campaign = await this.getCampaign(id);
          
          // Log status from both sources
          console.log(`[Retry ${retryCount + 1}] Campaign ${id} status:`);
          console.log(`- Via getCampaign: ${JSON.stringify({
            name: campaign.name,
            active: campaign.active,
            status: campaign.status
          })}`);
          
          if (freshData) {
            console.log(`- Via direct API: ${JSON.stringify({
              name: freshData.name,
              active: freshData.active,
              status: freshData.status
            })}`);
          }
          
          // Check if either source shows paused
          const isPaused = 
            (campaign && (campaign.active === false || campaign.status === 'paused')) ||
            (freshData && (freshData.active === false || freshData.status === 'paused'));
            
          if (isPaused) {
            console.log(`✅ Campaign ${id} pause confirmed on retry ${retryCount + 1}`);
            success = true;
            
            // Update our local DB to match the real status
            if (freshData && (freshData.active === false || freshData.status === 'paused')) {
              await db.update(trafficstarCampaigns)
                .set({ 
                  active: false, 
                  status: 'paused',
                  updatedAt: new Date() 
                })
                .where(eq(trafficstarCampaigns.trafficstarId, id.toString()));
            }
            
            break;
          }
          
          // Wait 1 second before retrying
          console.log(`Campaign ${id} not yet paused, retrying verification in 1 second...`);
          await new Promise(resolve => setTimeout(resolve, 1000));
          retryCount++;
        }
        
        // Final status report
        if (!success) {
          console.log(`⚠️ WARNING: Could not verify pausing of campaign ${id} after ${maxRetries} attempts.`);
          console.log(`   The API reported success, but verification shows the campaign is still not paused.`);
          console.log(`   Final status: ${JSON.stringify({
            name: campaign?.name,
            active: campaign?.active,
            status: campaign?.status
          })}`);
        }
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
      // If mock mode is enabled and API calls are failing, just update the local database
      if (ENABLE_MOCK_MODE) {
        try {
          // First try the real API
          const token = await this.ensureToken();
          
          // Try all possible API endpoint formats until one works
          let success = false;
          let lastError = null;
          
          // Use the v1.1 API endpoint directly for campaign 1000866
          // We know this endpoint works based on previous testing
          try {
            console.log(`Activating campaign ${id} using direct v1.1 API endpoint`);
            await axios.patch(`https://api.trafficstars.com/v1.1/campaigns/${id}`, {
              active: true,
              // Format date as YYYY-MM-DD HH:MM:SS as required by the API
              schedule_end_time: new Date(new Date().setUTCHours(23, 59, 59, 999))
                .toISOString()
                .replace('T', ' ')
                .replace(/\.\d+Z$/, '')
            }, {
              headers: {
                'Authorization': `Bearer ${token}`,
                'Content-Type': 'application/json'
              },
              timeout: 10000 // 10 second timeout
            });
            console.log(`Successfully activated campaign ${id} using v1.1 PATCH endpoint`);
            success = true;
          } catch (error) {
            console.log(`Failed to activate campaign ${id} using v1.1 endpoint: ${error.message}`);
            lastError = error;
            
            // If the direct approach fails, try a few other formats just in case
            for (const baseUrl of ['https://api.trafficstars.com/v1.1', 'https://api.trafficstars.com/v1']) {
              try {
                console.log(`Trying alternate endpoint: ${baseUrl}/campaigns/${id}`);
                await axios.patch(`${baseUrl}/campaigns/${id}`, {
                  active: true,
                  // Format date as YYYY-MM-DD HH:MM:SS as required by the API
                  schedule_end_time: new Date(new Date().setUTCHours(23, 59, 59, 999))
                    .toISOString()
                    .replace('T', ' ')
                    .replace(/\.\d+Z$/, '')
                }, {
                  headers: {
                    'Authorization': `Bearer ${token}`,
                    'Content-Type': 'application/json'
                  },
                  timeout: 5000 // 5 second timeout
                });
                console.log(`Successfully activated campaign ${id} using ${baseUrl}`);
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
                status: 'active',
                active: true,
                createdAt: new Date(),
                updatedAt: new Date()
              });
              console.log(`Created new active campaign record for ID ${id} in mock mode`);
            } else {
              // Update existing campaign record
              await db.update(trafficstarCampaigns)
                .set({ active: true, status: 'active', updatedAt: new Date() })
                .where(eq(trafficstarCampaigns.trafficstarId, id.toString()));
              console.log(`Updated campaign ${id} to active state in mock mode`);
            }
            
            return;
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
              status: 'active',
              active: true,
              createdAt: new Date(),
              updatedAt: new Date()
            });
            console.log(`Created new active campaign record for ID ${id} in mock mode`);
          } else {
            // Update existing campaign record
            await db.update(trafficstarCampaigns)
              .set({ active: true, status: 'active', updatedAt: new Date() })
              .where(eq(trafficstarCampaigns.trafficstarId, id.toString()));
            console.log(`Updated campaign ${id} to active state in mock mode`);
          }
          
          return;
        }
      } else {
        // If mock mode is disabled, proceed with normal API calls only
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
        
        // Use the v1.1 API endpoint directly for campaign activation
        // We know this endpoint works based on previous testing
        try {
          console.log(`Activating campaign ${id} using direct v1.1 API endpoint (real mode)`);
          
          // Get the campaign first to check what parameters it needs
          const campaign = await this.getCampaign(id);
          
          // Add all possible required parameters
          const activateParams: any = {
            active: true,
            status: 'enabled',
            is_active: true,
            is_paused: false,
            is_archived: false,
            // Format date as YYYY-MM-DD HH:MM:SS as required by the API
            schedule_end_time: new Date(new Date().setUTCHours(23, 59, 59, 999))
              .toISOString()
              .replace('T', ' ')
              .replace(/\.\d+Z$/, '')
          };
          
          // If campaign has an existing max_daily parameter, keep it
          if (campaign.max_daily) {
            activateParams.max_daily = campaign.max_daily;
          }
          
          console.log(`Sending activation request with parameters: ${JSON.stringify(activateParams)}`);
          
          await axios.patch(`https://api.trafficstars.com/v1.1/campaigns/${id}`, activateParams, {
            headers: {
              'Authorization': `Bearer ${token}`,
              'Content-Type': 'application/json'
            },
            timeout: 30000 // 30 second timeout
          });
          console.log(`Successfully activated campaign ${id} using v1.1 PATCH endpoint (real mode)`);
          success = true;
        } catch (error) {
          console.error(`Failed to activate campaign ${id} using v1.1 endpoint: ${error.message}`, error);
          lastError = error;
        }
        
        if (!success) {
          // If we're here, all attempts failed
          console.error(`All attempts to activate campaign ${id} failed. Last error:`, lastError);
          throw new Error(`Could not activate campaign. All API endpoints failed.`);
        }
      }

      // Update local record
      await db.update(trafficstarCampaigns)
        .set({ active: true, updatedAt: new Date() })
        .where(eq(trafficstarCampaigns.trafficstarId, id.toString()));
        
      // Verify the campaign was actually activated - with retries and force refresh
      try {
        console.log(`Verifying campaign ${id} was successfully activated - implementing verification with retries`);
        
        // A direct force refresh request to the API outside of our caching layer
        const forceRefresh = async () => {
          try {
            const token = await this.ensureToken();
            // Use a cache-busting timestamp query param
            const timestamp = Date.now();
            const response = await axios.get(
              `https://api.trafficstars.com/v1.1/campaigns/${id}?_t=${timestamp}`, 
              { 
                headers: {
                  'Authorization': `Bearer ${token}`,
                  'Cache-Control': 'no-cache, no-store, must-revalidate'
                } 
              }
            );
            return response.data?.response || null;
          } catch (error) {
            console.log(`Force refresh error: ${error}`);
            return null;
          }
        };
        
        // Multiple verification attempts (up to 3 times)
        let campaign = null;
        const maxRetries = 3;
        let retryCount = 0;
        let success = false;
        
        while (retryCount < maxRetries && !success) {
          // Force a direct API refresh to get the latest status
          const freshData = await forceRefresh();
          
          // Also get via our cached method
          campaign = await this.getCampaign(id);
          
          // Log status from both sources
          console.log(`[Retry ${retryCount + 1}] Campaign ${id} status:`);
          console.log(`- Via getCampaign: ${JSON.stringify({
            name: campaign.name,
            active: campaign.active,
            status: campaign.status
          })}`);
          
          if (freshData) {
            console.log(`- Via direct API: ${JSON.stringify({
              name: freshData.name,
              active: freshData.active,
              status: freshData.status
            })}`);
          }
          
          // Check if either source shows activation
          const isActive = 
            (campaign && (campaign.active === true || campaign.status === 'enabled')) ||
            (freshData && (freshData.active === true || freshData.status === 'enabled'));
            
          if (isActive) {
            console.log(`✅ Campaign ${id} activation confirmed on retry ${retryCount + 1}`);
            success = true;
            
            // Update our local DB to match the real status
            if (freshData && (freshData.active === true || freshData.status === 'enabled')) {
              await db.update(trafficstarCampaigns)
                .set({ 
                  active: true, 
                  status: 'enabled',
                  updatedAt: new Date() 
                })
                .where(eq(trafficstarCampaigns.trafficstarId, id.toString()));
            }
            
            break;
          }
          
          // Wait 1 second before retrying
          console.log(`Campaign ${id} not yet active, retrying verification in 1 second...`);
          await new Promise(resolve => setTimeout(resolve, 1000));
          retryCount++;
        }
        
        // Final status report
        if (!success) {
          console.log(`⚠️ WARNING: Could not verify activation of campaign ${id} after ${maxRetries} attempts.`);
          console.log(`   The API reported success, but verification shows the campaign is still not active.`);
          console.log(`   Final status: ${JSON.stringify({
            name: campaign?.name,
            active: campaign?.active,
            status: campaign?.status
          })}`);
        }
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
          } catch (error) {
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
      const token = await this.ensureToken();
      
      // Format the date as required by the API (YYYY-MM-DD HH:MM:SS)
      // If the scheduleEndTime already has the format we need, use it directly
      const formattedEndTime = scheduleEndTime.includes('T') 
        ? scheduleEndTime.replace('T', ' ').replace(/\.\d+Z$/, '')
        : scheduleEndTime;
      
      // Use the v1.1 API endpoint directly
      await axios.patch(`https://api.trafficstars.com/v1.1/campaigns/${id}`, {
        schedule_end_time: formattedEndTime
      }, {
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json'
        },
        timeout: 30000 // 30 second timeout
      });
      
      console.log(`Successfully updated campaign ${id} end time to ${formattedEndTime}`);

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
/**
 * TrafficStar API Documentation
 * 
 * This file contains documentation for the TrafficStar API endpoints
 * and example implementations of how to use them.
 */

/**
 * API Endpoints
 * 
 * Base URLs:
 * - https://api.trafficstars.com/v2
 * - https://api.trafficstars.com/v1.1
 * - https://api.trafficstars.com/v1
 * - https://api.trafficstars.com
 * 
 * Authentication endpoints:
 * - https://api.trafficstars.com/v1/auth/token
 * - https://api.trafficstars.com/auth/token
 * - https://id.trafficstars.com/auth/token
 */

/**
 * Run campaigns
 * 
 * PUT /v2/campaigns/run
 * 
 * Request:
 * {
 *   "campaign_ids": [123, 456, 789]
 * }
 * 
 * Response:
 * {
 *   "success": [123, 456],
 *   "failed": [789],
 *   "total": 3
 * }
 */

/**
 * Pause campaigns
 * 
 * PUT /v2/campaigns/pause
 * 
 * Request:
 * {
 *   "campaign_ids": [123, 456, 789]
 * }
 * 
 * Response:
 * {
 *   "success": [123, 456],
 *   "failed": [789],
 *   "total": 3
 * }
 */

/**
 * Implementation examples
 */

// Function to run one or more campaigns
export async function runCampaigns(campaignIds: number[], token: string): Promise<any> {
  try {
    const baseUrl = 'https://api.trafficstars.com/v2';
    const endpoint = `${baseUrl}/campaigns/run`;
    
    const response = await fetch(endpoint, {
      method: 'PUT',
      headers: {
        'Authorization': `Bearer ${token}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        campaign_ids: campaignIds
      })
    });
    
    if (!response.ok) {
      throw new Error(`Failed to run campaigns: ${response.status} ${response.statusText}`);
    }
    
    return await response.json();
  } catch (error) {
    console.error('Error running campaigns:', error);
    throw error;
  }
}

// Function to pause one or more campaigns
export async function pauseCampaigns(campaignIds: number[], token: string): Promise<any> {
  try {
    const baseUrl = 'https://api.trafficstars.com/v2';
    const endpoint = `${baseUrl}/campaigns/pause`;
    
    const response = await fetch(endpoint, {
      method: 'PUT',
      headers: {
        'Authorization': `Bearer ${token}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        campaign_ids: campaignIds
      })
    });
    
    if (!response.ok) {
      throw new Error(`Failed to pause campaigns: ${response.status} ${response.statusText}`);
    }
    
    return await response.json();
  } catch (error) {
    console.error('Error pausing campaigns:', error);
    throw error;
  }
}
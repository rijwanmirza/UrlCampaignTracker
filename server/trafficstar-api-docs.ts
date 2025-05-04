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
 * 
 * Campaign endpoints:
 * - GET /v1.1/campaigns - Get all campaigns
 * - GET /v1.1/campaigns/{id} - Get a specific campaign
 * - PUT /v1.1/campaigns/{id} - Update a campaign (set active: true/false)
 * - PATCH /v1.1/campaigns/{id} - Partially update a campaign
 * 
 * Campaign stats/spent endpoints:
 * - GET /v1.1/campaigns/{id}/stats - Get campaign stats
 * - GET /v1.1/campaigns/{id}/spent - Get campaign spent value
 * - GET /v1.1/reports/statistics - Get reporting data
 * 
 * NOTE: According to logs, the correct spent value endpoint may have these variants:
 * - The campaign object itself may contain a 'spent' property when fetched
 * - GET /v1.1/campaigns/{id} - This seems to be the most reliable method to fetch actual campaign data including spend
 * 
 * Statistics parameters:
 * - date_from: YYYY-MM-DD
 * - date_to: YYYY-MM-DD (or date_until)
 * - Filter by campaign_id: [123]
 * - group_by: ["date", "campaign"]
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
 * Edit a campaign
 * 
 * PATCH /v1.1/campaigns/{id}
 * 
 * This endpoint allows editing campaign properties including setting the end time.
 * 
 * Request example (setting price):
 * {
 *   "price": 0.2
 * }
 * 
 * Request example (setting end time):
 * {
 *   "schedule_end_time": "2025-05-02 06:30:00"
 * }
 * 
 * Response: Full campaign object
 * {
 *    "id": 1,
 *    "name": "My campaign",
 *    "price": 0.2,
 *    "schedule_end_time": "2025-05-02 06:30:00",
 *    "active": true,
 *    ...
 * }
 * 
 * Notes:
 * - Time format must be "YYYY-MM-DD HH:MM:SS" in 24-hour format
 * - End time should be in UTC timezone unless schedule_timezone is specified
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

// Function to update campaign end time
export async function updateCampaignEndTime(campaignId: number, token: string, endTime?: Date): Promise<any> {
  try {
    // If no end time is provided, use current UTC time
    const now = endTime || new Date();
    
    // Format the date as YYYY-MM-DD HH:MM:SS in 24-hour format (UTC)
    const formattedEndTime = now.toISOString()
      .replace('T', ' ')      // Replace 'T' with space
      .replace(/\.\d+Z$/, ''); // Remove milliseconds and Z
    
    console.log(`Setting campaign ${campaignId} end time to: ${formattedEndTime} (UTC)`);
    
    const baseUrl = 'https://api.trafficstars.com/v1.1';
    const endpoint = `${baseUrl}/campaigns/${campaignId}`;
    
    const response = await fetch(endpoint, {
      method: 'PATCH',
      headers: {
        'Authorization': `Bearer ${token}`,
        'Content-Type': 'application/json',
        'Accept': 'application/json'
      },
      body: JSON.stringify({
        schedule_end_time: formattedEndTime
      })
    });
    
    if (!response.ok) {
      throw new Error(`Failed to update campaign end time: ${response.status} ${response.statusText}`);
    }
    
    return await response.json();
  } catch (error) {
    console.error(`Error updating campaign ${campaignId} end time:`, error);
    throw error;
  }
}

// Function to pause a campaign AND set its end time to current UTC time
export async function pauseCampaignWithEndTime(campaignId: number, token: string): Promise<any> {
  try {
    // First pause the campaign
    const pauseResult = await pauseCampaigns([campaignId], token);
    
    // Then set the end time to current UTC time
    const updateResult = await updateCampaignEndTime(campaignId, token);
    
    return {
      pauseResult,
      updateResult
    };
  } catch (error) {
    console.error(`Error pausing campaign ${campaignId} with end time:`, error);
    throw error;
  }
}
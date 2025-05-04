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
 * 
 * Authentication endpoints:
 * - https://id.trafficstars.com/auth/token
 * 
 * Campaign endpoints:
 * - GET /v1.1/campaigns/{id} - Get a specific campaign
 * - PATCH /v1.1/campaigns/{id} - Partially update a campaign
 * 
 * Campaign spent report endpoint:
 * - GET /v1.1/advertiser/custom/report/by-day - Get spent report
 * 
 * Campaign run/pause endpoints:
 * - PUT /v2/campaigns/run - Activate campaigns
 * - PUT /v2/campaigns/pause - Pause campaigns
 */

/**
 * Get spent value report
 * 
 * GET /v1.1/advertiser/custom/report/by-day
 * 
 * Request:
 * Parameters:
 * - campaign_id: Campaign ID
 * - date_from: YYYY-MM-DD
 * - date_to: YYYY-MM-DD
 * 
 * Response:
 * [
 *   {
 *     "amount": 0.33135,    // This is the spent value
 *     "clicks": 54,
 *     "ctr": 0.814,
 *     "day": "2015-01-01",
 *     "ecpa": 0.11,
 *     "ecpc": 0.006,
 *     "ecpm": 0.049,
 *     "impressions": 6627,
 *     "leads": 3
 *   }
 * ]
 */

/**
 * Get campaign details
 * 
 * GET /v1.1/campaigns/{id}
 * 
 * Response: Campaign object with detailed information including:
 * - id: Campaign ID
 * - active: Whether campaign is active
 * - max_daily: Daily budget
 * - schedule_end_time: End time for the campaign
 * - ...many other fields
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
 * This endpoint allows editing campaign properties including budget and end time.
 * 
 * Example payload to update budget:
 * {
 *   "max_daily": 100.0
 * }
 * 
 * Example payload to update end time:
 * {
 *   "schedule_end_time": "2025-05-02 06:30:00"
 * }
 * 
 * Notes:
 * - Time format must be "YYYY-MM-DD HH:MM:SS" in 24-hour format
 * - End time should be in UTC timezone
 */

/**
 * Example implementation for getting spent value
 */
export async function getSpentValue(campaignId: number, dateFrom: string, dateTo: string, token: string): Promise<number> {
  try {
    const baseUrl = 'https://api.trafficstars.com/v1.1';
    const endpoint = `${baseUrl}/advertiser/custom/report/by-day`;
    
    const params = new URLSearchParams();
    params.append('campaign_id', campaignId.toString());
    params.append('date_from', dateFrom);
    params.append('date_to', dateTo);
    
    const response = await fetch(`${endpoint}?${params.toString()}`, {
      method: 'GET',
      headers: {
        'Authorization': `Bearer ${token}`,
        'Accept': 'application/json'
      }
    });
    
    if (!response.ok) {
      throw new Error(`Failed to get spent value: ${response.status} ${response.statusText}`);
    }
    
    const data = await response.json();
    
    if (!Array.isArray(data)) {
      return 0;
    }
    
    // Calculate total spent across all days
    const totalSpent = data.reduce((sum, day) => {
      return sum + (day.amount || 0);
    }, 0);
    
    return totalSpent;
  } catch (error) {
    console.error('Error getting spent value:', error);
    return 0;
  }
}

/**
 * Example implementation for activating a campaign
 */
export async function activateCampaign(campaignId: number, token: string): Promise<boolean> {
  try {
    const baseUrl = 'https://api.trafficstars.com/v2';
    const endpoint = `${baseUrl}/campaigns/run`;
    
    const response = await fetch(endpoint, {
      method: 'PUT',
      headers: {
        'Authorization': `Bearer ${token}`,
        'Content-Type': 'application/json',
        'Accept': 'application/json'
      },
      body: JSON.stringify({
        campaign_ids: [campaignId]
      })
    });
    
    if (!response.ok) {
      throw new Error(`Failed to activate campaign: ${response.status} ${response.statusText}`);
    }
    
    const result = await response.json();
    
    if (result.success && result.success.includes(campaignId)) {
      return true;
    }
    
    return false;
  } catch (error) {
    console.error('Error activating campaign:', error);
    return false;
  }
}

/**
 * Example implementation for pausing a campaign
 */
export async function pauseCampaign(campaignId: number, token: string): Promise<boolean> {
  try {
    const baseUrl = 'https://api.trafficstars.com/v2';
    const endpoint = `${baseUrl}/campaigns/pause`;
    
    const response = await fetch(endpoint, {
      method: 'PUT',
      headers: {
        'Authorization': `Bearer ${token}`,
        'Content-Type': 'application/json',
        'Accept': 'application/json'
      },
      body: JSON.stringify({
        campaign_ids: [campaignId]
      })
    });
    
    if (!response.ok) {
      throw new Error(`Failed to pause campaign: ${response.status} ${response.statusText}`);
    }
    
    const result = await response.json();
    
    if (result.success && result.success.includes(campaignId)) {
      return true;
    }
    
    return false;
  } catch (error) {
    console.error('Error pausing campaign:', error);
    return false;
  }
}

/**
 * Example implementation for updating campaign end time
 */
export async function updateCampaignEndTime(campaignId: number, endTime: string, token: string): Promise<boolean> {
  try {
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
        schedule_end_time: endTime
      })
    });
    
    if (!response.ok) {
      throw new Error(`Failed to update campaign end time: ${response.status} ${response.statusText}`);
    }
    
    return true;
  } catch (error) {
    console.error('Error updating campaign end time:', error);
    return false;
  }
}
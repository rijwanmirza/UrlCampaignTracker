/**
 * Debug endpoints for TrafficStar service
 * These endpoints are used to test TrafficStar API integration
 */
import axios from 'axios';
import type { Request, Response } from 'express';
import { trafficstarCredentials, trafficstarCampaigns } from '@shared/schema';
import { db } from './db';
import { eq } from 'drizzle-orm';

/**
 * Get the TrafficStar API token
 * @returns Promise with the API token
 */
async function getToken(): Promise<string> {
  // Check environment variable first
  if (process.env.TRAFFICSTAR_API_KEY) {
    return process.env.TRAFFICSTAR_API_KEY;
  }

  // Get from database if not in environment
  const [credential] = await db.select().from(trafficstarCredentials).limit(1);
  if (credential?.apiKey) {
    return credential.apiKey;
  }

  throw new Error('TrafficStar API key not found');
}

/**
 * Get daily spending data for all campaigns
 * This is a replacement for the trafficStarService.getAllCampaignsDailySpending method
 */
export async function getAllCampaignsDailySpending(): Promise<{ campaigns: { id: number, daily: number, maxDaily: number }[], date: string }> {
  try {
    // Get the token
    const token = await getToken();
    
    // Get current date in YYYY-MM-DD format for UTC
    const now = new Date();
    const todayUtc = now.toISOString().split('T')[0];
    
    // First get all TrafficStar campaigns from the database
    const savedCampaigns = await db
      .select()
      .from(trafficstarCampaigns);
    
    // Result container
    const result = {
      campaigns: [] as { id: number, daily: number, maxDaily: number }[],
      date: todayUtc
    };
    
    // Process each campaign to get its spending
    for (const campaign of savedCampaigns) {
      try {
        if (!campaign.trafficstarId) continue;
        
        const campaignId = parseInt(campaign.trafficstarId);
        if (isNaN(campaignId)) continue;
        
        // Get spending data using custom report endpoint
        try {
          const statsResponse = await axios.get(`https://api.trafficstars.com/v1.1/advertiser/custom/report/by-day`, {
            headers: {
              'Authorization': `Bearer ${token}`,
              'Content-Type': 'application/json'
            },
            params: {
              campaign_id: campaignId.toString(),
              date_from: todayUtc,
              date_to: todayUtc
            },
            timeout: 30000 // 30 second timeout
          });
          
          // Calculate spending from response
          let daily = 0;
          
          // Process the array response format
          if (statsResponse.data && Array.isArray(statsResponse.data)) {
            const responseData = statsResponse.data;
            
            // Sum up all spending for this campaign on this date
            responseData.forEach((item: any) => {
              if (item.day === todayUtc && item.amount) {
                const amount = parseFloat(item.amount || '0');
                daily += amount;
              }
            });
          }
          
          // Get the max daily budget (either from API or database)
          const maxDaily = campaign.maxDaily ? parseFloat(campaign.maxDaily) : 0;
          
          // Add to results
          result.campaigns.push({
            id: campaignId,
            daily,
            maxDaily
          });
          
        } catch (error) {
          console.error(`Failed to get spending data for campaign ${campaignId}:`, error);
          
          // Still add the campaign to results but with 0 spending
          result.campaigns.push({
            id: campaignId,
            daily: 0,
            maxDaily: campaign.maxDaily ? parseFloat(campaign.maxDaily) : 0
          });
        }
      } catch (campaignError) {
        console.error('Error processing campaign:', campaignError);
        // Continue with next campaign
      }
    }
    
    return result;
  } catch (error) {
    console.error('Error getting all campaigns daily spending:', error);
    // Return empty result on error
    return {
      campaigns: [],
      date: new Date().toISOString().split('T')[0]
    };
  }
}

/**
 * Test the custom report endpoint for a specific campaign
 * @param req Express request object
 * @param res Express response object
 */
export async function testCustomReport(req: Request, res: Response) {
  try {
    const campaignId = req.params.id;
    if (!campaignId) {
      return res.status(400).json({ error: 'Campaign ID is required' });
    }

    // Get the API token
    let token;
    try {
      token = await getToken();
    } catch (tokenError) {
      console.error("Failed to get API token:", tokenError);
      // Return a meaningful response with fallback data
      return res.json({
        id: parseInt(campaignId),
        daily: 0,
        date: new Date().toISOString().split('T')[0],
        maxDaily: 0,
        message: "Using fallback data due to auth error",
        authenticated: false
      });
    }
    
    // Get current date in YYYY-MM-DD format for UTC
    const now = new Date();
    const todayUtc = now.toISOString().split('T')[0];
    
    try {
      // Request data from the custom report endpoint
      const statsResponse = await axios.get(`https://api.trafficstars.com/v1.1/advertiser/custom/report/by-day`, {
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json'
        },
        params: {
          campaign_id: campaignId,
          date_from: todayUtc,
          date_to: todayUtc
        },
        timeout: 30000 // 30 second timeout
      });
      
      // Log the response
      console.log(`Custom report response:`, JSON.stringify(statsResponse.data || {}).substring(0, 500));
      
      // Process the response data
      let daily = 0;
      if (statsResponse.data && Array.isArray(statsResponse.data)) {
        statsResponse.data.forEach((item: any) => {
          if (item.day === todayUtc && item.amount) {
            daily += parseFloat(item.amount || '0');
          }
        });
      }
      
      // Also get max daily budget
      let maxDaily = 0;
      try {
        const campaignResponse = await axios.get(`https://api.trafficstars.com/v1.1/campaigns/${campaignId}`, {
          headers: {
            'Authorization': `Bearer ${token}`,
            'Content-Type': 'application/json'
          },
          timeout: 10000
        });
        
        if (campaignResponse.data && campaignResponse.data.max_daily) {
          maxDaily = parseFloat(campaignResponse.data.max_daily.toString());
        }
      } catch (error) {
        console.error(`Failed to get campaign details:`, error);
      }
      
      // Return the processed data
      const spendingData = {
        id: parseInt(campaignId),
        daily,
        date: todayUtc,
        maxDaily,
        message: "Used TrafficStar service to get spending data",
        authenticated: true
      };
      
      console.log(`DEBUG: Got spending data from service:`, {
        id: parseInt(campaignId),
        daily,
        date: todayUtc,
        maxDaily
      });
      
      return res.json(spendingData);
    } catch (apiError) {
      console.error('Error in TrafficStar API call:', apiError);
      
      // Check if it's an authentication error
      const isAuthError = apiError.response && (apiError.response.status === 401 || apiError.response.status === 403);
      
      if (isAuthError) {
        // Return a response with fallback data for auth errors
        return res.json({
          id: parseInt(campaignId),
          daily: 0,
          date: todayUtc,
          maxDaily: 0,
          message: "Using fallback data due to auth error",
          authenticated: false
        });
      }
      
      // For other errors, return an error response
      return res.status(500).json({ 
        error: 'Failed to get campaign spending data',
        message: apiError instanceof Error ? apiError.message : String(apiError)
      });
    }
  } catch (error) {
    console.error('Error in testCustomReport:', error);
    return res.status(500).json({ 
      error: 'Failed to get campaign spending data',
      message: error instanceof Error ? error.message : String(error)
    });
  }
}
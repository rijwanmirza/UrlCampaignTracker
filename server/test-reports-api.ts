/**
 * TrafficStar Reports API Tester
 * 
 * This script tests the TrafficStar Reports API for spent value extraction
 * based on the official documentation screenshots and examples.
 */

import express, { Request, Response } from 'express';
import axios from 'axios';
import { getTodayFormatted, getYesterdayFormatted, parseReportSpentValue } from './trafficstar-spent-helper';
import { trafficStarService } from './trafficstar-service-new';

// Define error detail interface
interface ErrorDetails {
  message: string;
  status?: number;
  data?: any;
}

/**
 * Register TrafficStar Reports API Test Routes
 */
export function registerReportsAPITestRoutes(app: express.Application) {
  // Test spent value report direct call
  app.post('/api/test-reports-api', async (req: Request, res: Response) => {
    try {
      const { campaignId } = req.body;
      
      if (!campaignId) {
        return res.status(400).json({ error: 'Campaign ID is required' });
      }
      
      try {
        // Get the current date in YYYY-MM-DD format
        const today = getTodayFormatted();
        const yesterday = getYesterdayFormatted();
        
        // Generate a fresh token for this test
        console.log('Generating a fresh token for reports API test');
        const token = await trafficStarService.refreshToken();
        
        // Reports API URL
        const reportUrl = `${trafficStarService.BASE_URL_V1_1}/advertiser/custom/report/by-day`;
        
        console.log(`Sending report request to: ${reportUrl}`);
        console.log(`Using date_from=${yesterday}, date_to=${today}, campaign_id=${campaignId}`);
        
        console.log(`Using authorization token: ${token.substring(0, 15)}...`);
        
        // Try a wider date range - from yesterday to today
        const params = new URLSearchParams();
        params.append('campaign_id', campaignId.toString());
        params.append('date_from', yesterday);
        params.append('date_to', today);
        
        console.log(`Request parameters: ${params.toString()}`);
        
        // Make the API call with proper URL encoding for params
        const reportResponse = await axios.get(`${reportUrl}?${params.toString()}`, {
          headers: {
            'Authorization': `Bearer ${token}`,
            'Accept': 'application/json'
          }
        });
        
        // Trim the response for logging
        const responseDataString = JSON.stringify(reportResponse.data);
        console.log('Report API raw response:', responseDataString.length > 500 
          ? responseDataString.substring(0, 500) + '...' 
          : responseDataString);
        
        // Log the raw data structure for debugging
        console.log('Response data type:', typeof reportResponse.data);
        if (Array.isArray(reportResponse.data)) {
          console.log('Response is an array with length:', reportResponse.data.length);
          
          // Log the first item's structure if available
          if (reportResponse.data.length > 0) {
            console.log('First item keys:', Object.keys(reportResponse.data[0]));
            console.log('First item sample:', JSON.stringify(reportResponse.data[0]).substring(0, 100));
          }
        } else {
          console.log('Response is not an array, structure:', Object.keys(reportResponse.data || {}));
        }
        
        // Use our helper to extract amount values
        const totalSpent = parseReportSpentValue(reportResponse.data);
        
        // Also try a direct campaign lookup
        console.log('Trying to get campaign details for comparison');
        const campaign = await trafficStarService.getCampaign(campaignId);
        console.log('Campaign direct lookup result:', JSON.stringify(campaign).substring(0, 500));
        
        let campaignSpentValue = 0;
        if (campaign && campaign.spent !== undefined) {
          if (typeof campaign.spent === 'string') {
            campaignSpentValue = parseFloat(campaign.spent);
          } else if (typeof campaign.spent === 'number') {
            campaignSpentValue = campaign.spent;
          }
        }
        
        return res.status(200).json({
          success: true,
          date: today,
          dateRange: { from: yesterday, to: today },
          rawResponse: reportResponse.data,
          extractedSpent: totalSpent,
          campaignDirectSpent: campaignSpentValue,
          campaignData: campaign
        });
      } catch (error: any) {
        console.error('Error testing reports API:', error);
        
        // Include detailed error info
        let errorDetails: ErrorDetails = { message: 'Unknown error' };
        
        if (error.response) {
          errorDetails = {
            message: 'API Error Response',
            status: error.response.status,
            data: error.response.data
          };
          
          console.error('Error response status:', error.response.status);
          console.error('Error response data:', error.response.data);
        } else if (error.message) {
          errorDetails = { message: error.message };
        }
        
        // Try a fallback to regular campaign endpoint
        try {
          console.log('Trying fallback to direct campaign lookup');
          const campaign = await trafficStarService.getCampaign(campaignId);
          
          return res.status(500).json({ 
            error: 'Failed to test reports API - but got campaign data',
            details: errorDetails,
            fallbackCampaign: campaign
          });
        } catch (fallbackError) {
          console.error('Even fallback lookup failed:', fallbackError);
        }
        
        return res.status(500).json({ 
          error: 'Failed to test reports API',
          details: errorDetails
        });
      }
    } catch (error) {
      console.error('Error in test reports API route:', error);
      return res.status(500).json({ error: 'Internal server error' });
    }
  });
  
  console.log('TrafficStar Reports API test routes registered');
}
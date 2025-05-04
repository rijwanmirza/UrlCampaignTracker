/**
 * TrafficStar Reports API Tester
 * 
 * This script tests the TrafficStar Reports API for spent value extraction
 * based on the official documentation screenshots and examples.
 */

import express, { Request, Response } from 'express';
import axios from 'axios';
import { getTodayFormatted, parseReportSpentValue } from './trafficstar-spent-helper';

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
      
      // Get the API key from environment
      const apiKey = process.env.TRAFFICSTAR_API_KEY;
      
      if (!apiKey) {
        return res.status(500).json({ error: 'TrafficStar API key not set in environment variables' });
      }
      
      // Get today's date in YYYY-MM-DD format using our helper
      const today = getTodayFormatted();
      
      console.log(`Testing reports API for campaign ${campaignId} with date ${today}`);
      
      try {
        // First, get access token using the refresh_token grant (API key)
        const tokenResponse = await axios.post(
          'https://api.trafficstars.com/v1/auth/token',
          new URLSearchParams({
            'grant_type': 'refresh_token',
            'refresh_token': apiKey
          }).toString(),
          {
            headers: {
              'Content-Type': 'application/x-www-form-urlencoded'
            }
          }
        );
        
        if (!tokenResponse.data.access_token) {
          return res.status(500).json({ error: 'Failed to get access token' });
        }
        
        const token = tokenResponse.data.access_token;
        
        // Now, call the reports API with the current date
        // Using advertiser/custom/report/by-day endpoint as shown in the documentation
        const reportUrl = `https://api.trafficstars.com/v1.1/advertiser/custom/report/by-day`;
        
        console.log(`Sending report request to: ${reportUrl}`);
        console.log(`Using date_from=${today}, date_to=${today}, campaign_id=${campaignId}`);
        
        const reportResponse = await axios.get(reportUrl, {
          headers: {
            'Authorization': `Bearer ${token}`,
            'Accept': 'application/json'
          },
          params: {
            'campaign_id': campaignId,
            'date_from': today,
            'date_to': today
          }
        });
        
        console.log('Report API raw response:', JSON.stringify(reportResponse.data));
        
        // Use our helper to extract amount values
        const totalSpent = parseReportSpentValue(reportResponse.data);
        
        return res.status(200).json({
          success: true,
          date: today,
          rawResponse: reportResponse.data,
          extractedSpent: totalSpent
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
        } else if (error.message) {
          errorDetails = { message: error.message };
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
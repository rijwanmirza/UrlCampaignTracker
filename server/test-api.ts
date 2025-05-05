/**
 * Test script for TrafficStar API
 * 
 * This script tests the direct API calls to TrafficStar
 * to debug spent value extraction issues.
 */

import axios from 'axios';
import { format } from 'date-fns';

// Define endpoints
const BASE_URL = 'https://api.trafficstars.com';
const AUTH_URL = `${BASE_URL}/v1/auth/token`;
const REPORT_URL = `${BASE_URL}/v1.1/advertiser/campaign/report/by-day`;
const CAMPAIGN_URL = `${BASE_URL}/v1.1/campaigns`;

// Get today's date formatted as YYYY-MM-DD
const getTodayFormatted = (): string => {
  return format(new Date(), 'yyyy-MM-dd');
};

// Main test function
async function testTrafficStarAPI() {
  try {
    // Get API key from environment
    const apiKey = process.env.TRAFFICSTAR_API_KEY;
    
    if (!apiKey) {
      console.error('TrafficStar API key not set in environment variables');
      return;
    }
    
    console.log('Getting access token...');
    
    // Get access token
    const tokenResponse = await axios.post(
      AUTH_URL,
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
      console.error('No access token in response:', tokenResponse.data);
      return;
    }
    
    const token = tokenResponse.data.access_token;
    console.log('Got access token:', token.substring(0, 15) + '...');
    
    // Campaign ID to test
    const campaignId = 995224;
    
    // Get current date
    const today = getTodayFormatted();
    console.log('Current UTC date:', today);
    
    // Test 1: Try getting direct campaign data
    console.log(`\n--- TEST 1: Get campaign data directly ---`);
    try {
      const campaignResponse = await axios.get(`${CAMPAIGN_URL}/${campaignId}`, {
        headers: {
          'Authorization': `Bearer ${token}`,
          'Accept': 'application/json'
        }
      });
      
      console.log('Campaign response:', JSON.stringify(campaignResponse.data, null, 2));
      
      // Extract spent value
      const spent = campaignResponse.data.spent;
      const spentToday = campaignResponse.data.spent_today;
      
      console.log('Spent value from campaign data:', spent);
      console.log('Spent today value from campaign data:', spentToday);
    } catch (error: any) {
      console.error('Error getting campaign data:', error.message);
      if (error.response) {
        console.error('Error response status:', error.response.status);
        console.error('Error response data:', error.response.data);
      }
    }
    
    // Test 2: Try getting report data with today's date
    console.log(`\n--- TEST 2: Get report data with today's date ---`);
    try {
      // Set up params with today for both from and to
      const params = new URLSearchParams();
      params.append('campaign_id', campaignId.toString());
      params.append('date_from', today);
      params.append('date_to', today);
      params.append('group_by', 'day');
      params.append('columns', 'amount');
      
      console.log('Report params:', params.toString());
      
      const reportUrl = `${REPORT_URL}?${params.toString()}`;
      console.log('Report URL:', reportUrl);
      
      const reportResponse = await axios.get(reportUrl, {
        headers: {
          'Authorization': `Bearer ${token}`,
          'Accept': 'application/json'
        }
      });
      
      console.log('Report response type:', typeof reportResponse.data);
      console.log('Report response keys:', Object.keys(reportResponse.data));
      console.log('Report response data:', JSON.stringify(reportResponse.data, null, 2));
      
      // Try to extract data structure
      if (reportResponse.data.data && reportResponse.data.data.rows) {
        console.log('Found rows array with length:', reportResponse.data.data.rows.length);
        
        if (reportResponse.data.data.columns) {
          console.log('Columns:', reportResponse.data.data.columns);
        }
        
        if (reportResponse.data.data.rows.length > 0) {
          console.log('First row:', reportResponse.data.data.rows[0]);
        }
      }
    } catch (error: any) {
      console.error('Error getting report data:', error.message);
      if (error.response) {
        console.error('Error response status:', error.response.status);
        console.error('Error response data:', error.response.data);
      }
    }
    
    // Test 3: Try getting report data with custom endpoint
    console.log(`\n--- TEST 3: Try alternative report endpoint ---`);
    try {
      // Try different endpoint
      const altReportUrl = `${BASE_URL}/v1.1/advertiser/custom/report/by-day`;
      
      // Set up params with today for both from and to
      const params = new URLSearchParams();
      params.append('campaign_id', campaignId.toString());
      params.append('date_from', today);
      params.append('date_to', today);
      
      console.log('Alternative report params:', params.toString());
      console.log('Alternative report URL:', `${altReportUrl}?${params.toString()}`);
      
      const reportResponse = await axios.get(`${altReportUrl}?${params.toString()}`, {
        headers: {
          'Authorization': `Bearer ${token}`,
          'Accept': 'application/json'
        }
      });
      
      console.log('Alternative report response type:', typeof reportResponse.data);
      console.log('Alternative report response data:', JSON.stringify(reportResponse.data, null, 2));
    } catch (error: any) {
      console.error('Error getting alternative report data:', error.message);
      if (error.response) {
        console.error('Error response status:', error.response.status);
        console.error('Error response data:', error.response.data);
      }
    }
    
  } catch (error: any) {
    console.error('Overall test error:', error.message);
  }
}

// Run the test
console.log('Starting TrafficStar API test...');
testTrafficStarAPI()
  .then(() => console.log('Test completed'))
  .catch(err => console.error('Test failed:', err));
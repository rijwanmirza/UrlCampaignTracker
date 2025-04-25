const axios = require('axios');

async function testSpendingEndpoints() {
  try {
    console.log('Testing campaign spending endpoints...');
    
    // Test getting all spending with debug endpoint
    try {
      console.log('\nTesting debug all campaign spending endpoint:');
      const allSpendingResponse = await axios.get('http://localhost:5000/api/debug/trafficstar/all-spending');
      console.log('Response:', JSON.stringify(allSpendingResponse.data, null, 2));
    } catch (error) {
      console.error('Error testing all spending debug endpoint:', error.message);
      if (error.response) {
        console.error('Response data:', error.response.data);
      }
    }
    
    // Test getting all spending with regular endpoint
    try {
      console.log('\nTesting regular all campaign spending endpoint:');
      const allSpendingResponse = await axios.get('http://localhost:5000/api/trafficstar/daily-spending');
      console.log('Response:', JSON.stringify(allSpendingResponse.data, null, 2));
    } catch (error) {
      console.error('Error testing all spending regular endpoint:', error.message);
      if (error.response) {
        console.error('Response data:', error.response.data);
      }
    }
    
    // Test getting spending for a specific campaign ID - replace with an actual campaign ID from your database
    const campaignId = 1; // Replace with an actual campaign ID
    
    try {
      console.log(`\nTesting debug spending endpoint for campaign ${campaignId}:`);
      const singleSpendingResponse = await axios.get(`http://localhost:5000/api/debug/trafficstar/spending/${campaignId}`);
      console.log('Response:', JSON.stringify(singleSpendingResponse.data, null, 2));
    } catch (error) {
      console.error(`Error testing spending for campaign ${campaignId}:`, error.message);
      if (error.response) {
        console.error('Response data:', error.response.data);
      }
    }
    
    // Test the custom report endpoint
    try {
      console.log(`\nTesting custom report endpoint for campaign ${campaignId}:`);
      const customReportResponse = await axios.get(`http://localhost:5000/api/debug/trafficstar/custom-report/${campaignId}`);
      console.log('Response:', JSON.stringify(customReportResponse.data, null, 2));
    } catch (error) {
      console.error(`Error testing custom report for campaign ${campaignId}:`, error.message);
      if (error.response) {
        console.error('Response data:', error.response.data);
      }
    }
    
  } catch (error) {
    console.error('Testing failed:', error.message);
  }
}

testSpendingEndpoints();
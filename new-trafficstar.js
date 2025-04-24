/**
 * New TrafficStar API integration 
 * Following the exact documentation format
 */

// Import required packages
import axios from 'axios';
import https from 'https';

// Campaign to test - use the same one we've been working with
const CAMPAIGN_ID = '995224';

// Main function
async function main() {
  try {
    // Step 1: Get token 
    console.log(`Getting token...`);
    const token = await getToken();
    console.log(`✅ Got token`);
    
    // Step 2: Get campaign current status
    console.log(`Getting campaign ${CAMPAIGN_ID} status...`);
    const campaign = await getCampaign(token, CAMPAIGN_ID);
    console.log(`✅ Current status: ${campaign.status}, active: ${campaign.active}`);
    
    // Step 3: Update campaign status based on current state
    if (campaign.active) {
      console.log(`Campaign is active, pausing...`);
      await pauseCampaign(token, CAMPAIGN_ID);
    } else {
      console.log(`Campaign is paused, activating...`);
      await activateCampaign(token, CAMPAIGN_ID);
    }
    
    // Step 4: Verify the change
    console.log(`Verifying change after 3 seconds...`);
    await new Promise(resolve => setTimeout(resolve, 3000));
    const updatedCampaign = await getCampaign(token, CAMPAIGN_ID);
    console.log(`✅ Updated status: ${updatedCampaign.status}, active: ${updatedCampaign.active}`);
    console.log(`Status change successful: ${campaign.active !== updatedCampaign.active}`);
    
  } catch (error) {
    console.error(`❌ Error: ${error.message}`);
    if (error.response) {
      console.error(`Response data:`, error.response.data);
      console.error(`Response status:`, error.response.status);
    }
  }
}

// Function to get token
async function getToken() {
  const apiKey = process.env.TRAFFICSTAR_API_KEY;
  
  // Create axios instance with proper timeout and TLS settings
  const api = axios.create({
    timeout: 10000,
    httpsAgent: new https.Agent({
      rejectUnauthorized: true
    })
  });
  
  const response = await api.post(
    'https://api.trafficstars.com/v1/auth/token',
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
  
  return response.data.access_token;
}

// Function to get campaign status
async function getCampaign(token, id) {
  const api = axios.create({
    timeout: 10000,
    httpsAgent: new https.Agent({
      rejectUnauthorized: true
    })
  });
  
  const response = await api.get(
    `https://api.trafficstars.com/v1.1/campaigns/${id}`,
    {
      headers: {
        'Authorization': `Bearer ${token}`,
        'Content-Type': 'application/json'
      }
    }
  );
  
  console.log(`Campaign response:`, JSON.stringify(response.data));
  
  // The response seems to be directly in the data object
  if (response.data) {
    // Just use the direct data - the campaign data is at the top level
    return response.data;
  } else {
    console.error("Empty response data");
    throw new Error("Empty API response");
  }
}

// Function to pause campaign
async function pauseCampaign(token, id) {
  const api = axios.create({
    timeout: 10000,
    httpsAgent: new https.Agent({
      rejectUnauthorized: true
    })
  });
  
  // We need to set BOTH status and active fields
  const payload = {
    status: "paused",
    active: false
  };
  
  console.log(`Sending pause payload:`, payload);
  
  const response = await api.patch(
    `https://api.trafficstars.com/v1.1/campaigns/${id}`,
    payload,
    {
      headers: {
        'Authorization': `Bearer ${token}`,
        'Content-Type': 'application/json'
      }
    }
  );
  
  console.log(`Pause response:`, response.data);
  return response.data;
}

// Function to activate campaign
async function activateCampaign(token, id) {
  const api = axios.create({
    timeout: 10000,
    httpsAgent: new https.Agent({
      rejectUnauthorized: true
    })
  });
  
  // We need to set BOTH status and active fields
  const payload = {
    status: "enabled",
    active: true
  };
  
  console.log(`Sending activate payload:`, payload);
  
  const response = await api.patch(
    `https://api.trafficstars.com/v1.1/campaigns/${id}`,
    payload,
    {
      headers: {
        'Authorization': `Bearer ${token}`,
        'Content-Type': 'application/json'
      }
    }
  );
  
  console.log(`Activate response:`, response.data);
  return response.data;
}

// Run the main function
main();
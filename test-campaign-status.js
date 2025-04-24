/**
 * Direct test script to find the correct parameters for campaign activation/pause
 * Run with: node test-campaign-status.js
 */
import axios from 'axios';

const apiKey = process.env.TRAFFICSTAR_API_KEY;
const campaignId = 995224; // Test with this ID

async function getToken() {
  console.log('Getting token...');
  try {
    const response = await axios.post(
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
    
    console.log('Got token!');
    return response.data.access_token;
  } catch (error) {
    console.error('Error getting token:', error.message);
    throw error;
  }
}

async function getCampaignStatus(token, id) {
  console.log(`Getting status for campaign ${id}...`);
  try {
    const response = await axios.get(
      `https://api.trafficstars.com/v1.1/campaigns/${id}`,
      {
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json'
        }
      }
    );
    
    const campaign = response.data.response;
    console.log(`Campaign status:`, {
      id: campaign.id,
      name: campaign.name,
      active: campaign.active,
      status: campaign.status,
      paused: campaign.paused,
      is_active: campaign.is_active
    });
    return campaign;
  } catch (error) {
    console.error(`Error getting campaign ${id}:`, error.message);
    throw error;
  }
}

async function activateCampaign(token, id) {
  console.log(`Activating campaign ${id}...`);
  try {
    // Test different parameter combinations
    const params = {
      // Try different parameter combinations
      active: true,
      paused: false,
    };
    
    console.log('Using parameters:', params);
    
    const response = await axios.patch(
      `https://api.trafficstars.com/v1.1/campaigns/${id}`,
      params,
      {
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json'
        }
      }
    );
    
    console.log('Activation response:', response.data);
    return response.data;
  } catch (error) {
    console.error(`Error activating campaign ${id}:`, error.message);
    console.error('Full error:', error.response?.data || error);
    throw error;
  }
}

async function pauseCampaign(token, id) {
  console.log(`Pausing campaign ${id}...`);
  try {
    // Test different parameter combinations
    const params = {
      // Try different parameter combinations
      active: false,
      paused: true
    };
    
    console.log('Using parameters:', params);
    
    const response = await axios.patch(
      `https://api.trafficstars.com/v1.1/campaigns/${id}`,
      params,
      {
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json'
        }
      }
    );
    
    console.log('Pause response:', response.data);
    return response.data;
  } catch (error) {
    console.error(`Error pausing campaign ${id}:`, error.message);
    console.error('Full error:', error.response?.data || error);
    throw error;
  }
}

async function main() {
  try {
    const token = await getToken();
    
    // Get current status
    const campaign = await getCampaignStatus(token, campaignId);
    
    // Toggle the status
    if (campaign.active) {
      console.log('Campaign is active, attempting to pause...');
      await pauseCampaign(token, campaignId);
    } else {
      console.log('Campaign is paused, attempting to activate...');
      await activateCampaign(token, campaignId);
    }
    
    // Check status after change
    console.log('Waiting 2 seconds before checking status again...');
    await new Promise(resolve => setTimeout(resolve, 2000));
    
    const updatedCampaign = await getCampaignStatus(token, campaignId);
    console.log('Status changed:', campaign.active !== updatedCampaign.active);
  } catch (error) {
    console.error('Error in main function:', error.message);
  }
}

main();
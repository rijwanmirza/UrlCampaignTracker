/**
 * URL Budget Handling Test Script
 * 
 * This script tests the 10-minute delay mechanism for URL budget handling
 * by simulating adding new URLs and watching how their budgets are combined
 * before being applied to the TrafficStar campaign.
 */
import axios from 'axios';

// Configuration
const API_BASE = 'http://localhost:3000';
const CAMPAIGN_ID = 27; // Replace with your campaign ID

// Authentication - required for API access
const AUTH_HEADER = {
  Authorization: 'Bearer TraffiCS10928' // Default API key for the system
};

/**
 * Create a URL in the specified campaign with the given click limit
 */
async function createUrl(campaignId, name, targetUrl, clickLimit) {
  try {
    console.log(`Creating URL "${name}" with ${clickLimit} clicks in campaign ${campaignId}...`);
    
    const response = await axios.post(
      `${API_BASE}/api/campaigns/${campaignId}/urls`,
      {
        name,
        targetUrl,
        clickLimit: clickLimit.toString(),
        status: 'active'
      },
      { headers: AUTH_HEADER }
    );
    
    console.log(`✅ URL created successfully: ID ${response.data.id}`);
    return response.data;
  } catch (error) {
    console.error('❌ Error creating URL:', error.response?.data || error.message);
    return null;
  }
}

/**
 * Test URL budget handling with immediate processing (for testing)
 */
async function testUrlBudget(campaignId, urlId, clickValue, immediate = true) {
  try {
    console.log(`Testing URL budget handling for URL ${urlId} in campaign ${campaignId}...`);
    
    const response = await axios.post(
      `${API_BASE}/api/system/test-url-budget-update`,
      {
        campaignId,
        urlId,
        clickValue,
        immediate
      },
      { headers: AUTH_HEADER }
    );
    
    console.log('✅ Test completed successfully:');
    console.log(JSON.stringify(response.data, null, 2));
    return response.data;
  } catch (error) {
    console.error('❌ Error testing URL budget:', error.response?.data || error.message);
    return null;
  }
}

/**
 * Get the TrafficStar campaign information
 */
async function getTrafficStarCampaign(trafficstarId) {
  try {
    console.log(`Getting TrafficStar campaign ${trafficstarId} info...`);
    
    const response = await axios.get(
      `${API_BASE}/api/trafficstar/campaigns/${trafficstarId}`,
      { headers: AUTH_HEADER }
    );
    
    console.log('Campaign information:');
    console.log(`- Name: ${response.data.name}`);
    console.log(`- Daily Budget: $${response.data.max_daily}`);
    console.log(`- Status: ${response.data.status} (Active: ${response.data.active})`);
    
    return response.data;
  } catch (error) {
    console.error('❌ Error getting TrafficStar campaign:', error.response?.data || error.message);
    return null;
  }
}

/**
 * Get the campaign details to find its TrafficStar ID
 */
async function getCampaign(campaignId) {
  try {
    console.log(`Getting campaign ${campaignId} details...`);
    
    const response = await axios.get(
      `${API_BASE}/api/campaigns/${campaignId}`,
      { headers: AUTH_HEADER }
    );
    
    console.log('Campaign details:');
    console.log(`- Name: ${response.data.name}`);
    console.log(`- TrafficStar ID: ${response.data.trafficstarCampaignId}`);
    console.log(`- Price Per Thousand: $${response.data.pricePerThousand}`);
    
    return response.data;
  } catch (error) {
    console.error('❌ Error getting campaign details:', error.response?.data || error.message);
    return null;
  }
}

/**
 * Main test function
 */
async function runTests() {
  try {
    // 1. Get campaign details
    const campaign = await getCampaign(CAMPAIGN_ID);
    if (!campaign) return;
    
    // 2. Get current TrafficStar campaign status before changes
    const beforeTrafficStarInfo = await getTrafficStarCampaign(campaign.trafficstarCampaignId);
    console.log('\nStep 1: Current TrafficStar daily budget before any changes:', 
      beforeTrafficStarInfo ? `$${beforeTrafficStarInfo.max_daily}` : 'Unknown');
    
    // 3. Create a URL with 10,000 clicks
    console.log('\nStep 2: Creating first URL with 10,000 clicks...');
    const url1 = await createUrl(
      CAMPAIGN_ID,
      `Test URL 1 (${Date.now()})`,
      'https://example.com/test1',
      10000
    );
    if (!url1) return;
    
    // 4. Immediately test the URL budget handling (skip 10-minute wait for testing)
    console.log('\nStep 3: Testing URL budget handling with immediate processing...');
    await testUrlBudget(CAMPAIGN_ID, url1.id, undefined, true);
    
    // 5. Check updated TrafficStar campaign status
    const afterFirstUrlInfo = await getTrafficStarCampaign(campaign.trafficstarCampaignId);
    console.log('\nStep 4: TrafficStar daily budget after first URL:', 
      afterFirstUrlInfo ? `$${afterFirstUrlInfo.max_daily}` : 'Unknown');
    
    // 6. Create multiple additional URLs in quick succession
    console.log('\nStep 5: Creating multiple additional URLs...');
    const url2 = await createUrl(
      CAMPAIGN_ID,
      `Test URL 2 (${Date.now()})`,
      'https://example.com/test2',
      5000
    );
    
    const url3 = await createUrl(
      CAMPAIGN_ID,
      `Test URL 3 (${Date.now()})`,
      'https://example.com/test3',
      7500
    );
    
    // 7. Test the combined budget updates
    console.log('\nStep 6: Testing combined URL budget handling...');
    if (url2) await testUrlBudget(CAMPAIGN_ID, url2.id, undefined, true);
    if (url3) await testUrlBudget(CAMPAIGN_ID, url3.id, undefined, true);
    
    // 8. Check final TrafficStar campaign status
    const finalTrafficStarInfo = await getTrafficStarCampaign(campaign.trafficstarCampaignId);
    console.log('\nStep 7: Final TrafficStar daily budget after all URLs:', 
      finalTrafficStarInfo ? `$${finalTrafficStarInfo.max_daily}` : 'Unknown');
    
    console.log('\n✅ All tests completed!');
    
  } catch (error) {
    console.error('❌ Error running tests:', error.message);
  }
}

// Run the tests
runTests();
import { default as axios } from 'axios';

/**
 * URL Budget Test with Axios
 * Tests the URL budget handling functionality by simulating adding a URL with 10,000 clicks,
 * processing it immediately, then adding more URLs to see combined budget updates.
 */

// Configuration 
const BASE_URL = 'https://5516e8ff-5794-42c1-bc55-c3a9d471270d-00-2k9lu6wq190d.kirk.replit.dev'; // Replit domain
const API_KEY = 'TraffiCS10928';
const CAMPAIGN_ID = 27;

// Function to create a new URL with specified click limit
async function createUrl(name, clickLimit) {
  try {
    console.log(`Creating URL "${name}" with ${clickLimit} clicks...`);
    
    const response = await axios.post(
      `${BASE_URL}/api/campaigns/${CAMPAIGN_ID}/urls`,
      {
        name,
        targetUrl: `https://example.com/${Date.now()}`,
        clickLimit: clickLimit.toString(),
        status: 'active'
      },
      {
        headers: {
          'Content-Type': 'application/json',
          'x-api-key': API_KEY
        }
      }
    );
    
    console.log(`✅ URL created successfully: ID ${response.data.id}`);
    return response.data;
  } catch (error) {
    console.error('❌ Error creating URL:', error.response?.data?.message || error.message);
    return null;
  }
}

// Function to test URL budget update
async function testUrlBudget(urlId, clickValue = null, immediate = true) {
  try {
    console.log(`Testing URL ${urlId} budget update...`);
    
    const payload = {
      campaignId: CAMPAIGN_ID,
      urlId,
      immediate
    };
    
    if (clickValue) {
      payload.clickValue = clickValue;
    }
    
    const response = await axios.post(
      `${BASE_URL}/api/system/test-url-budget-update`,
      payload,
      {
        headers: {
          'Content-Type': 'application/json',
          'x-api-key': API_KEY
        }
      }
    );
    
    console.log(`✅ URL budget test response:`, response.data);
    return response.data;
  } catch (error) {
    console.error('❌ Error testing URL budget:', error.response?.data?.message || error.message);
    return null;
  }
}

// Function to get TrafficStar campaign info
async function getTrafficStarCampaignId() {
  try {
    console.log(`Getting campaign ${CAMPAIGN_ID} details...`);
    
    const response = await axios.get(
      `${BASE_URL}/api/campaigns/${CAMPAIGN_ID}`,
      {
        headers: {
          'x-api-key': API_KEY
        }
      }
    );
    
    console.log(`✅ Campaign details:`, {
      name: response.data.name,
      trafficstarId: response.data.trafficstarCampaignId
    });
    
    return response.data.trafficstarCampaignId;
  } catch (error) {
    console.error('❌ Error getting campaign details:', error.response?.data?.message || error.message);
    return null;
  }
}

// Function to get TrafficStar campaign spent value
async function getTrafficStarCampaignInfo(tsId) {
  try {
    console.log(`Getting TrafficStar campaign ${tsId} info...`);
    
    const response = await axios.get(
      `${BASE_URL}/api/trafficstar/campaigns/${tsId}`,
      {
        headers: {
          'x-api-key': API_KEY
        }
      }
    );
    
    console.log(`✅ TrafficStar info:`, {
      name: response.data.name,
      dailyBudget: response.data.max_daily,
      status: response.data.status
    });
    
    return response.data;
  } catch (error) {
    console.error('❌ Error getting TrafficStar info:', error.response?.data?.message || error.message);
    return null;
  }
}

// Main test function
async function runTest() {
  try {
    console.log('=== Starting URL Budget Handling Test ===');
    
    // Step 1: Get TrafficStar campaign ID 
    const trafficstarId = await getTrafficStarCampaignId();
    if (!trafficstarId) {
      console.error('Cannot proceed without TrafficStar campaign ID');
      return;
    }
    
    // Step 2: Get initial campaign info
    const initialInfo = await getTrafficStarCampaignInfo(trafficstarId);
    console.log(`\nInitial campaign daily budget: $${initialInfo?.max_daily || 'unknown'}`);
    
    // Step 3: Create URL with 10,000 clicks
    console.log('\n=== Test 1: Adding URL with 10,000 clicks ===');
    const url1 = await createUrl('Test URL 1 - 10k clicks', 10000);
    if (!url1) {
      console.error('Failed to create test URL 1');
      return;
    }
    
    // Step 4: Process the URL budget immediately (for testing)
    console.log('\nProcessing URL budget immediately...');
    await testUrlBudget(url1.id, null, true);
    
    // Step 5: Check updated campaign info
    const updatedInfo = await getTrafficStarCampaignInfo(trafficstarId);
    console.log(`\nUpdated campaign daily budget: $${updatedInfo?.max_daily || 'unknown'}`);
    
    // Step 6: Add multiple URLs in quick succession
    console.log('\n=== Test 2: Adding multiple URLs ===');
    const url2 = await createUrl('Test URL 2 - 5k clicks', 5000);
    const url3 = await createUrl('Test URL 3 - 7.5k clicks', 7500);
    
    if (!url2 || !url3) {
      console.error('Failed to create test URLs 2 or 3');
      return;
    }
    
    // Step 7: Process these URL budgets immediately (for testing)
    console.log('\nProcessing multiple URL budgets immediately...');
    await testUrlBudget(url2.id, null, true);
    await testUrlBudget(url3.id, null, true);
    
    // Step 8: Check final campaign info
    const finalInfo = await getTrafficStarCampaignInfo(trafficstarId);
    console.log(`\nFinal campaign daily budget: $${finalInfo?.max_daily || 'unknown'}`);
    
    console.log('\n=== URL Budget Handling Test Completed ===');
    
  } catch (error) {
    console.error('❌ Test failed:', error.message);
  }
}

// Run the test
runTest();
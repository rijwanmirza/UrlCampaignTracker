/**
 * Comprehensive Traffic Sender Testing Script
 * 
 * This script tests all 9 points of the Traffic Sender feature implementation:
 * - Point 1: UI Implementation (manually verified in the UI)
 * - Point 2: Traffic Sender Activation Process (pauseTrafficStarCampaign)
 * - Point 3: 10-Minute Waiting Period
 * - Point 4: Spent Value Check
 * - Point 5: Handling Spent Value ≥ $10
 * - Point 6: Budget Update and Activation
 * - Point 7: Handling Spent Value < $10 with clicks ≥ 10,000 and monitoring when < 5,000
 * - Point 8: Campaign Status Verification
 * - Point 9: Handling New URLs Added After Budget Update
 */

// Base URL for API calls
const API_BASE = 'http://localhost:5000/api';

// Helper function to make API calls
async function callApi(endpoint, method = 'GET', data = null) {
  const options = {
    method,
    headers: {
      'Content-Type': 'application/json'
    }
  };
  
  if (data && (method === 'POST' || method === 'PUT' || method === 'PATCH')) {
    options.body = JSON.stringify(data);
  }
  
  const response = await fetch(`${API_BASE}${endpoint}`, options);
  return await response.json();
}

// Test functions for each point
async function testPoint1_UI() {
  console.log('POINT 1: UI Implementation');
  console.log('This must be manually verified in the UI');
  console.log('✓ Verify the Traffic Sender toggle appears in the Campaign Edit form');
  console.log('✓ Verify the status shows in Campaign Details');
}

async function testPoint2_ActivationProcess(campaignId) {
  console.log('\nPOINT 2: Traffic Sender Activation Process');
  
  // Get campaign details
  const campaign = await callApi(`/campaigns/${campaignId}`);
  console.log(`Current campaign status: ${campaign.lastTrafficSenderStatus}`);
  
  // Enable Traffic Sender if not already enabled
  if (!campaign.trafficSenderEnabled) {
    console.log('Enabling Traffic Sender...');
    await callApi(`/campaigns/${campaignId}`, 'PATCH', {
      trafficSenderEnabled: true
    });
    console.log('Traffic Sender enabled');
  } else {
    console.log('Traffic Sender already enabled');
  }
  
  // Trigger processing
  await callApi('/trafficstar/process-pending-budget-updates', 'POST');
  console.log('Processing triggered');
  
  // Get updated campaign details
  const updatedCampaign = await callApi(`/campaigns/${campaignId}`);
  console.log(`Updated campaign status: ${updatedCampaign.lastTrafficSenderStatus}`);
  
  // Verify the TrafficStar campaign is paused
  if (updatedCampaign.lastTrafficSenderStatus === 'paused') {
    console.log('✓ SUCCESS: Campaign was paused successfully');
  } else {
    console.log('❌ FAILED: Campaign was not paused');
  }
}

async function testPoint3_WaitingPeriod(campaignId) {
  console.log('\nPOINT 3: 10-Minute Waiting Period');
  console.log('This test requires waiting 10 minutes between actions.');
  console.log('Current lastTrafficSenderAction timestamp will be used to determine elapsed time.');
  
  const campaign = await callApi(`/campaigns/${campaignId}`);
  if (campaign.lastTrafficSenderAction) {
    const lastAction = new Date(campaign.lastTrafficSenderAction);
    const now = new Date();
    const minutesElapsed = (now - lastAction) / (1000 * 60);
    
    console.log(`Last action time: ${lastAction.toISOString()}`);
    console.log(`Current time: ${now.toISOString()}`);
    console.log(`Minutes elapsed: ${minutesElapsed.toFixed(2)}`);
    
    if (minutesElapsed < 10) {
      console.log(`⚠️ Need to wait ${(10 - minutesElapsed).toFixed(2)} more minutes before reactivation check will happen`);
    } else {
      console.log('✓ 10-minute waiting period has passed, reactivation check will occur on next processing');
    }
  } else {
    console.log('❌ No lastTrafficSenderAction recorded yet');
  }
}

async function testPoint4_SpentValueCheck(campaignId) {
  console.log('\nPOINT 4: Spent Value Check');
  
  const campaign = await callApi(`/campaigns/${campaignId}`);
  const spentValue = parseFloat(campaign.dailySpent || '0');
  
  console.log(`Current spent value: $${spentValue.toFixed(4)}`);
  console.log(`Current spent date: ${campaign.dailySpentDate || 'N/A'}`);
  
  // Trigger a spent value update
  await callApi(`/trafficstar/campaigns/${campaign.trafficstarCampaignId}/spent`, 'GET');
  
  // Get updated campaign
  const updatedCampaign = await callApi(`/campaigns/${campaignId}`);
  const updatedSpentValue = parseFloat(updatedCampaign.dailySpent || '0');
  
  console.log(`Updated spent value: $${updatedSpentValue.toFixed(4)}`);
  console.log(`Updated spent date: ${updatedCampaign.dailySpentDate || 'N/A'}`);
  
  if (updatedCampaign.dailySpentDate) {
    console.log('✓ SUCCESS: Spent value check working properly');
  } else {
    console.log('❌ FAILED: Spent value date not updated');
  }
}

async function testPoint5And6_SpentAbove10(campaignId) {
  console.log('\nPOINT 5 & 6: Handling Spent Value ≥ $10 and Budget Update/Activation');
  
  const campaign = await callApi(`/campaigns/${campaignId}`);
  const spentValue = parseFloat(campaign.dailySpent || '0');
  
  console.log(`Current spent value: $${spentValue.toFixed(4)}`);
  
  if (spentValue >= 10) {
    console.log('✓ Spent value is >= $10, activation with budget should be used');
    
    // Get URLs to calculate remaining clicks
    const campaignWithUrls = await callApi(`/campaigns/${campaignId}/with-urls`);
    const urls = campaignWithUrls.urls || [];
    
    // Calculate remaining clicks
    let totalRemainingClicks = 0;
    for (const url of urls) {
      if (url.status === 'active') {
        totalRemainingClicks += (parseInt(url.clickLimit) - parseInt(url.clicks));
      }
    }
    
    console.log(`Total remaining clicks: ${totalRemainingClicks}`);
    
    // Calculate expected budget
    const pricePerClick = parseFloat(campaign.pricePerThousand) / 1000;
    const pendingClickPrice = totalRemainingClicks * pricePerClick;
    const expectedBudget = spentValue + pendingClickPrice;
    
    console.log(`Expected new budget: $${expectedBudget.toFixed(4)} (spent $${spentValue.toFixed(4)} + pending $${pendingClickPrice.toFixed(4)})`);
    
    // Trigger processing
    await callApi('/trafficstar/process-pending-budget-updates', 'POST');
    console.log('Processing triggered, this will update the budget and activate if paused');
    
    // Get updated campaign
    const updatedCampaign = await callApi(`/campaigns/${campaignId}`);
    console.log(`Updated status: ${updatedCampaign.lastTrafficSenderStatus}`);
    
    if (updatedCampaign.lastTrafficSenderStatus === 'activated_with_budget' || 
        updatedCampaign.lastTrafficSenderStatus === 'budget_updated') {
      console.log('✓ SUCCESS: Budget was updated or campaign was activated with budget');
    } else {
      console.log('❌ FAILED: Budget update/activation did not occur');
    }
  } else {
    console.log('⚠️ Spent value is < $10, skipping this test');
  }
}

async function testPoint7_SpentBelow10(campaignId) {
  console.log('\nPOINT 7: Handling Spent Value < $10');
  
  const campaign = await callApi(`/campaigns/${campaignId}`);
  const spentValue = parseFloat(campaign.dailySpent || '0');
  
  console.log(`Current spent value: $${spentValue.toFixed(4)}`);
  
  if (spentValue < 10) {
    console.log('✓ Spent value is < $10, checking remaining clicks...');
    
    // Get URLs to calculate remaining clicks
    const campaignWithUrls = await callApi(`/campaigns/${campaignId}/with-urls`);
    const urls = campaignWithUrls.urls || [];
    
    // Calculate remaining clicks
    let totalRemainingClicks = 0;
    for (const url of urls) {
      if (url.status === 'active') {
        totalRemainingClicks += (parseInt(url.clickLimit) - parseInt(url.clicks));
      }
    }
    
    console.log(`Total remaining clicks: ${totalRemainingClicks}`);
    
    if (totalRemainingClicks >= 10000) {
      console.log('✓ Remaining clicks ≥ 10,000, activation with end time and $10.15 budget should be used');
      
      // Trigger processing
      await callApi('/trafficstar/process-pending-budget-updates', 'POST');
      console.log('Processing triggered, this will activate with end time if paused');
      
      // Get updated campaign
      const updatedCampaign = await callApi(`/campaigns/${campaignId}`);
      console.log(`Updated status: ${updatedCampaign.lastTrafficSenderStatus}`);
      
      if (updatedCampaign.lastTrafficSenderStatus === 'activated_with_end_time' || 
          updatedCampaign.lastTrafficSenderStatus === 'end_time_updated') {
        console.log('✓ SUCCESS: Campaign was activated with end time or end time was updated');
      } else {
        console.log('❌ FAILED: End time activation did not occur');
      }
    } else if (totalRemainingClicks <= 5000) {
      console.log('✓ Remaining clicks ≤ 5,000, campaign should remain paused or be paused if active');
      
      // Trigger processing
      await callApi('/trafficstar/process-pending-budget-updates', 'POST');
      console.log('Processing triggered, this should keep the campaign paused');
      
      // Get updated campaign
      const updatedCampaign = await callApi(`/campaigns/${campaignId}`);
      console.log(`Updated status: ${updatedCampaign.lastTrafficSenderStatus}`);
      
      if (updatedCampaign.lastTrafficSenderStatus === 'paused') {
        console.log('✓ SUCCESS: Campaign was kept paused or paused');
      } else {
        console.log('❌ FAILED: Campaign was not paused despite low clicks');
      }
    } else {
      console.log('⚠️ Remaining clicks between 5,000 and 10,000, no specific action required');
    }
  } else {
    console.log('⚠️ Spent value is ≥ $10, skipping this test');
  }
}

async function testPoint8_StatusVerification(campaignId) {
  console.log('\nPOINT 8: Campaign Status Verification');
  
  // Get current TrafficStar campaign info
  const campaign = await callApi(`/campaigns/${campaignId}`);
  const trafficstarId = campaign.trafficstarCampaignId;
  
  // Get TrafficStar status
  const trafficstarInfo = await callApi(`/trafficstar/campaigns/${trafficstarId}`);
  
  console.log(`Campaign ID: ${campaignId}`);
  console.log(`TrafficStar ID: ${trafficstarId}`);
  console.log(`TrafficStar status: ${trafficstarInfo.status}`);
  console.log(`Last TrafficSender status: ${campaign.lastTrafficSenderStatus}`);
  
  // Trigger processing
  await callApi('/trafficstar/process-pending-budget-updates', 'POST');
  console.log('Processing triggered, this should correctly handle campaign status');
  
  // Get updated campaign
  const updatedCampaign = await callApi(`/campaigns/${campaignId}`);
  const updatedTrafficstarInfo = await callApi(`/trafficstar/campaigns/${trafficstarId}`);
  
  console.log(`Updated TrafficStar status: ${updatedTrafficstarInfo.status}`);
  console.log(`Updated last TrafficSender status: ${updatedCampaign.lastTrafficSenderStatus}`);
  
  console.log('Status verification check complete');
}

async function testPoint9_NewUrls(campaignId) {
  console.log('\nPOINT 9: Handling New URLs Added After Budget Update');
  
  const campaign = await callApi(`/campaigns/${campaignId}`);
  
  if (!campaign.lastBudgetUpdateTime) {
    console.log('⚠️ No lastBudgetUpdateTime recorded, skipping test');
    return;
  }
  
  console.log(`Last budget update time: ${campaign.lastBudgetUpdateTime}`);
  
  // Get new URLs added since last budget update
  const lastBudgetUpdateTime = new Date(campaign.lastBudgetUpdateTime);
  const campaignWithUrls = await callApi(`/campaigns/${campaignId}/with-urls`);
  const urls = campaignWithUrls.urls || [];
  
  const newUrls = urls.filter(url => {
    const urlCreatedAt = new Date(url.createdAt);
    return url.status === 'active' && urlCreatedAt > lastBudgetUpdateTime;
  });
  
  console.log(`URLs added since last budget update: ${newUrls.length}`);
  
  if (newUrls.length > 0) {
    console.log('New URLs found, checking waiting period...');
    
    // Calculate minutes elapsed
    const now = new Date();
    const minutesElapsed = (now - lastBudgetUpdateTime) / (1000 * 60);
    console.log(`Minutes elapsed since last budget update: ${minutesElapsed.toFixed(2)}`);
    
    // Check if 12 minutes have passed
    if (minutesElapsed >= 12) {
      console.log('✓ 12-minute waiting period has passed, budget should be updated on next processing');
      
      // Calculate expected budget increase
      let newClicksTotal = 0;
      for (const url of newUrls) {
        newClicksTotal += (parseInt(url.clickLimit) - parseInt(url.clicks));
      }
      
      const pricePerClick = parseFloat(campaign.pricePerThousand) / 1000;
      const additionalBudget = newClicksTotal * pricePerClick;
      
      console.log(`New clicks total: ${newClicksTotal}`);
      console.log(`Additional budget needed: $${additionalBudget.toFixed(4)}`);
      
      // Trigger processing
      await callApi('/trafficstar/process-pending-budget-updates', 'POST');
      console.log('Processing triggered, this should update the budget for new URLs');
      
      // Get updated campaign
      const updatedCampaign = await callApi(`/campaigns/${campaignId}`);
      console.log(`Updated status: ${updatedCampaign.lastTrafficSenderStatus}`);
      console.log(`Updated lastBudgetUpdateTime: ${updatedCampaign.lastBudgetUpdateTime}`);
      
      if (updatedCampaign.lastTrafficSenderStatus === 'budget_updated_for_new_urls' && 
          new Date(updatedCampaign.lastBudgetUpdateTime) > lastBudgetUpdateTime) {
        console.log('✓ SUCCESS: Budget was updated for new URLs');
      } else {
        console.log('❌ FAILED: Budget not updated for new URLs');
      }
    } else {
      console.log(`⚠️ Need to wait ${(12 - minutesElapsed).toFixed(2)} more minutes before budget will be updated`);
    }
  } else {
    console.log('⚠️ No new URLs found, skipping this test');
  }
}

// Main test function
async function runAllTests() {
  // Get a list of campaigns
  const campaigns = await callApi('/campaigns');
  
  if (campaigns.length === 0) {
    console.log('❌ No campaigns found. Please create a campaign first.');
    return;
  }
  
  // Choose the first campaign with TrafficStar ID
  const testCampaign = campaigns.find(c => c.trafficstarCampaignId);
  
  if (!testCampaign) {
    console.log('❌ No campaigns with TrafficStar ID found. Please link a campaign to TrafficStar first.');
    return;
  }
  
  console.log(`Using campaign for testing: ID=${testCampaign.id}, Name=${testCampaign.name}`);
  
  // Run all tests with error handling
  try {
    console.log('\n========== Testing Point 1: UI Implementation ==========');
    await testPoint1_UI();
  } catch (error) {
    console.error('Error testing Point 1:', error);
  }
  
  try {
    console.log('\n========== Testing Point 2: Traffic Sender Activation Process ==========');
    await testPoint2_ActivationProcess(testCampaign.id);
  } catch (error) {
    console.error('Error testing Point 2:', error);
  }
  
  try {
    console.log('\n========== Testing Point 3: 10-Minute Waiting Period ==========');
    await testPoint3_WaitingPeriod(testCampaign.id);
  } catch (error) {
    console.error('Error testing Point 3:', error);
  }
  
  try {
    console.log('\n========== Testing Point 4: Spent Value Check ==========');
    await testPoint4_SpentValueCheck(testCampaign.id);
  } catch (error) {
    console.error('Error testing Point 4:', error);
  }
  
  try {
    console.log('\n========== Testing Point 5 & 6: Handling Spent Value ≥ $10 ==========');
    await testPoint5And6_SpentAbove10(testCampaign.id);
  } catch (error) {
    console.error('Error testing Point 5 & 6:', error);
  }
  
  try {
    console.log('\n========== Testing Point 7: Handling Spent Value < $10 ==========');
    await testPoint7_SpentBelow10(testCampaign.id);
  } catch (error) {
    console.error('Error testing Point 7:', error);
  }
  
  try {
    console.log('\n========== Testing Point 8: Campaign Status Verification ==========');
    await testPoint8_StatusVerification(testCampaign.id);
  } catch (error) {
    console.error('Error testing Point 8:', error);
  }
  
  try {
    console.log('\n========== Testing Point 9: Handling New URLs ==========');
    await testPoint9_NewUrls(testCampaign.id);
  } catch (error) {
    console.error('Error testing Point 9:', error);
  }
  
  console.log('\nAll tests complete!');
}

// Entry point
console.log('Starting Traffic Sender tests...');
runAllTests()
  .then(() => {
    console.log('Testing complete');
  })
  .catch(error => {
    console.error('Error during testing:', error);
  });
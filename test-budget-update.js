// Direct internal test script to verify TrafficStar budget update functionality
// This script bypasses normal API authentication to directly test the TrafficStar service

// Using ES modules syntax since the project is configured with "type": "module"
import { trafficStarService } from './server/trafficstar-service.js';

// Test Parameters
const campaignId = 1000866;
const testBudget = 15.25; // Test budget value

async function testBudgetUpdate() {
  try {
    console.log('=== Testing TrafficStar Campaign Budget Update ===');
    console.log(`Directly testing updateCampaignBudget for campaign ${campaignId}...`);
    
    // Call the budget update method directly
    await trafficStarService.updateCampaignBudget(campaignId, testBudget);
    
    console.log('✅ TEST PASSED: Budget update was successful');
    console.log(`Updated campaign ${campaignId} budget to $${testBudget}`);
    
    // Let's also test the campaign end time update as it's a related operation
    const testEndTime = '2025-05-09 23:59:00';
    console.log(`Testing updateCampaignEndTime for campaign ${campaignId}...`);
    await trafficStarService.updateCampaignEndTime(campaignId, testEndTime);
    console.log('✅ TEST PASSED: End time update was successful');
    console.log(`Updated campaign ${campaignId} end time to ${testEndTime}`);
  } catch (error) {
    console.error('❌ TEST FAILED: Error occurred during test');
    console.error(`Error: ${error.message || error}`);
  }
}

// Run the test
testBudgetUpdate().catch(err => {
  console.error('Unhandled error in test:', err);
});
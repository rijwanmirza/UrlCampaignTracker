// We need to use require for Node.js compatibility
const { trafficStarService } = require('./server/trafficstar-service');
const { storage } = require('./server/storage');
const { db } = require('./server/db');

/**
 * Direct test script for URL budget handling functionality
 * This script bypasses the HTTP API and directly calls the service functions
 */
async function testUrlBudgetHandling() {
  try {
    console.log('=== URL Budget Handling Direct Test ===');
    
    // Step 1: Get campaign details
    const campaignId = 27; // Campaign ID
    const campaign = await storage.getCampaign(campaignId);
    
    if (!campaign) {
      console.error(`⚠️ Campaign ${campaignId} not found`);
      return;
    }
    
    if (!campaign.trafficstarCampaignId) {
      console.error(`⚠️ Campaign ${campaignId} is not linked to TrafficStar`);
      return;
    }
    
    console.log(`Campaign: ${campaign.name} (ID: ${campaign.id})`);
    console.log(`TrafficStar ID: ${campaign.trafficstarCampaignId}`);
    console.log(`Price Per Thousand: $${campaign.pricePerThousand}`);
    
    // Step 2: Create a URL with 10,000 clicks
    console.log('\n=== Creating First URL with 10,000 clicks ===');
    const url1 = await storage.createUrl({
      campaignId,
      name: `Test URL 1 (${Date.now()})`,
      targetUrl: 'https://example.com/test1',
      clickLimit: 10000,
      status: 'active'
    });
    
    console.log(`URL created: ${url1.name} (ID: ${url1.id}) with ${url1.clickLimit} clicks`);
    
    // Step 3: Track this URL for budget updates with the tracking service
    console.log('\n=== Tracking URL for Budget Updates ===');
    await trafficStarService.trackNewUrlForBudgetUpdate(
      url1.id,
      campaignId,
      campaign.trafficstarCampaignId,
      url1.clickLimit,
      campaign.pricePerThousand
    );
    
    console.log('URL tracked for budget updates - will be processed after 10 minutes');
    
    // Step 4: For testing, immediately process the pending URL budgets
    console.log('\n=== Immediately Processing Pending URL Budgets ===');
    await trafficStarService.processPendingUrlBudgets();
    
    // Step 5: Create additional URLs to test combining budgets
    console.log('\n=== Creating Additional URLs ===');
    const url2 = await storage.createUrl({
      campaignId,
      name: `Test URL 2 (${Date.now()})`,
      targetUrl: 'https://example.com/test2',
      clickLimit: 5000,
      status: 'active'
    });
    
    const url3 = await storage.createUrl({
      campaignId,
      name: `Test URL 3 (${Date.now()})`,
      targetUrl: 'https://example.com/test3',
      clickLimit: 7500,
      status: 'active'
    });
    
    console.log(`URL 2 created: ${url2.name} (ID: ${url2.id}) with ${url2.clickLimit} clicks`);
    console.log(`URL 3 created: ${url3.name} (ID: ${url3.id}) with ${url3.clickLimit} clicks`);
    
    // Step 6: Track these URLs for budget updates
    console.log('\n=== Tracking Additional URLs for Budget Updates ===');
    await trafficStarService.trackNewUrlForBudgetUpdate(
      url2.id,
      campaignId,
      campaign.trafficstarCampaignId,
      url2.clickLimit,
      campaign.pricePerThousand
    );
    
    await trafficStarService.trackNewUrlForBudgetUpdate(
      url3.id,
      campaignId,
      campaign.trafficstarCampaignId,
      url3.clickLimit,
      campaign.pricePerThousand
    );
    
    console.log('Additional URLs tracked - will be combined if processed within 10-minute window');
    
    // Step 7: For testing, immediately process the pending URL budgets again
    console.log('\n=== Immediately Processing Combined URL Budgets ===');
    await trafficStarService.processPendingUrlBudgets();
    
    console.log('\n=== Test Completed Successfully ===');
    console.log('Check the console logs for details on how URL budget handling processed the updates');
    
  } catch (error) {
    console.error('Error running URL budget test:', error);
  } finally {
    // Close database connection
    await db.pool.end();
  }
}

// Run the test
testUrlBudgetHandling();
// This is a development test script to verify the budget adjustment functionality
// after a campaign is paused due to exceeding the $10 daily spent value threshold
// @ts-nocheck

// Import required modules
import { trafficStarService } from './server/trafficstar-service.ts';
import { db } from './server/db.ts';
import { campaigns, urls } from './shared/schema.ts';
import { and, eq } from 'drizzle-orm';

/**
 * Test function to verify the budget adjustment workflow
 */
async function testBudgetAdjustmentWorkflow() {
  console.log('🧪 Starting Budget Adjustment Workflow Test');
  console.log('=============================================');
  
  try {
    // 1. Find a campaign with auto-management enabled
    console.log('1. Finding a campaign with auto-management enabled...');
    const [campaign] = await db
      .select()
      .from(campaigns)
      .where(eq(campaigns.id, 27)); // Use campaign ID 27 which we know has a TrafficStar ID
    
    if (!campaign) {
      console.error('❌ No auto-managed campaign found for testing');
      return;
    }
    
    console.log(`✅ Found campaign ID: ${campaign.id}, Name: ${campaign.name}`);
    
    if (!campaign.trafficstarCampaignId) {
      console.error('❌ Campaign does not have a TrafficStar ID');
      return;
    }
    
    const trafficstarId = Number(campaign.trafficstarCampaignId);
    console.log(`✅ TrafficStar Campaign ID: ${trafficstarId}`);
    
    // 2. Create test environment - simulate a campaign that was paused 15 minutes ago
    console.log('\n2. Setting up test environment...');
    const currentUtcDate = new Date().toISOString().split('T')[0];
    
    // Pause times - 15 minutes ago (pause) and 5 minutes ago (recheck)
    const pausedAt = new Date(Date.now() - 15 * 60 * 1000);
    const recheckAt = new Date(Date.now() - 5 * 60 * 1000);
    
    console.log(`- Current UTC Date: ${currentUtcDate}`);
    console.log(`- Simulated Pause Time: ${pausedAt.toISOString()}`);
    console.log(`- Simulated Recheck Time: ${recheckAt.toISOString()}`);
    
    // Enable test mode with environment variables
    process.env.TEST_MODE = 'true';
    process.env.TEST_MODE_SPENT_VALUE_PAUSE = 'true';
    process.env.TEST_CAMPAIGN_ID = trafficstarId.toString();
    process.env.TEST_PAUSE_TIME = pausedAt.toISOString();
    process.env.TEST_RECHECK_TIME = recheckAt.toISOString();
    process.env.TEST_UTC_DATE = currentUtcDate;
    
    console.log('✅ Test environment setup complete');
    
    // 3. Ensure we have active URLs for testing
    console.log('\n3. Setting up test URLs...');
    const existingUrls = await db
      .select()
      .from(urls)
      .where(eq(urls.campaignId, campaign.id));
    
    if (existingUrls.length === 0) {
      // Create a test URL
      await db.insert(urls).values({
        campaignId: campaign.id,
        name: 'Test URL for Budget Adjustment',
        targetUrl: 'https://example.com/test',
        clickLimit: 5000,
        clicks: 0,
        status: 'active',
        originalClickLimit: 5000,
        createdAt: new Date(),
        updatedAt: new Date()
      });
      
      console.log('✅ Created new test URL with 5000 clicks limit');
    } else {
      // Update existing URLs to be active with clicks
      await db.update(urls)
        .set({
          clickLimit: 5000,
          clicks: 0,
          status: 'active',
          updatedAt: new Date()
        })
        .where(eq(urls.campaignId, campaign.id));
        
      console.log(`✅ Updated ${existingUrls.length} existing URLs to be active with 5000 clicks`);
    }
    
    // 4. Get current campaign status before test
    console.log('\n4. Getting initial campaign status...');
    const currentStatus = await trafficStarService.getCachedCampaignStatus(trafficstarId);
    
    console.log(`- Initial Status: ${currentStatus?.status || 'unknown'}`);
    console.log(`- Initially Active: ${currentStatus?.active ? 'Yes' : 'No'}`);
    console.log(`- Last Action: ${currentStatus?.lastRequestedAction || 'none'}`);
    console.log(`- Last Action Time: ${currentStatus?.lastRequestedActionAt || 'unknown'}`);
    
    // 5. Calculate expected values for the budget adjustment
    console.log('\n5. Calculating expected budget adjustment values...');
    
    // Get active URLs for the campaign
    const activeUrls = await db
      .select()
      .from(urls)
      .where(
        and(
          eq(urls.campaignId, campaign.id),
          eq(urls.status, 'active')
        )
      );
    
    const activeUrlsCount = activeUrls.length;
    console.log(`- Active URLs: ${activeUrlsCount}`);
    
    // Calculate total click capacity
    let totalClickCapacity = 0;
    activeUrls.forEach(url => {
      totalClickCapacity += url.clickLimit || 0;
    });
    console.log(`- Total Click Capacity: ${totalClickCapacity}`);
    
    // Calculate pricing using pricePerThousand
    const pricePerThousand = parseFloat(campaign.pricePerThousand?.toString() || '1000.00');
    const pendingClickPricing = (totalClickCapacity / 1000) * pricePerThousand;
    console.log(`- Price Per Thousand: $${pricePerThousand.toFixed(2)}`);
    console.log(`- Pending Click Pricing: $${pendingClickPricing.toFixed(4)}`);
    
    // Simulated current spent value
    const currentSpentValue = 10.30; // This will be enforced by test mode
    console.log(`- Current Spent Value: $${currentSpentValue.toFixed(2)}`);
    
    // Calculate new daily budget
    const newDailyBudget = currentSpentValue + pendingClickPricing;
    console.log(`- Expected New Budget: $${newDailyBudget.toFixed(4)}`);
    
    // Generate expected end date (current UTC date 23:59)
    const endDateObj = new Date();
    endDateObj.setUTCHours(23, 59, 0, 0);
    const formattedEndDate = endDateObj.toISOString().split('T')[0];
    const formattedEndTime = endDateObj.toISOString().split('T')[1].substring(0, 5);
    const expectedEndDateTime = `${formattedEndDate} ${formattedEndTime}`;
    console.log(`- Expected End Date/Time: ${expectedEndDateTime}`);
    
    // 6. Run the spent value check which should trigger budget adjustment
    console.log('\n6. Running spent value check to trigger budget adjustment...');
    await trafficStarService.checkCampaignsSpentValue();
    console.log('✅ Spent value check completed');
    
    // 7. Check the results of the budget adjustment
    console.log('\n7. Checking results of budget adjustment...');
    
    // Small delay to ensure async operations complete
    await new Promise(resolve => setTimeout(resolve, 500));
    
    // Get updated status
    const updatedStatus = await trafficStarService.getCachedCampaignStatus(trafficstarId);
    
    console.log(`- Final Status: ${updatedStatus?.status || 'unknown'}`);
    console.log(`- Finally Active: ${updatedStatus?.active ? 'Yes' : 'No'}`);
    console.log(`- Last Action: ${updatedStatus?.lastRequestedAction || 'none'}`);
    console.log(`- Last Action Time: ${updatedStatus?.lastRequestedActionAt || 'unknown'}`);
    
    // Check if budget was adjusted
    console.log('\n8. Checking if budget was properly adjusted...');
    const budgetWasAdjusted = updatedStatus?.lastRequestedAction === 'activate';
    
    if (budgetWasAdjusted) {
      console.log('✅ Campaign was reactivated with adjusted budget');
    } else {
      console.log('❌ Campaign was not reactivated as expected');
    }
    
    // 9. Clean up test environment
    console.log('\n9. Cleaning up test environment...');
    process.env.TEST_MODE = 'false';
    process.env.TEST_MODE_SPENT_VALUE_PAUSE = 'false';
    delete process.env.TEST_CAMPAIGN_ID;
    delete process.env.TEST_PAUSE_TIME;
    delete process.env.TEST_RECHECK_TIME;
    delete process.env.TEST_UTC_DATE;
    console.log('✅ Test environment cleanup complete');
    
    // 10. Summary
    console.log('\n=============================================');
    console.log('BUDGET ADJUSTMENT TEST RESULTS:');
    console.log('=============================================');
    console.log(`Campaign ID: ${campaign.id}`);
    console.log(`TrafficStar ID: ${trafficstarId}`);
    console.log(`Current Spent Value: $${currentSpentValue.toFixed(2)}`);
    console.log(`Pending Click Pricing: $${pendingClickPricing.toFixed(4)}`);
    console.log(`New Daily Budget: $${newDailyBudget.toFixed(4)}`);
    console.log(`End Date/Time: ${expectedEndDateTime}`);
    console.log(`Budget Adjustment: ${budgetWasAdjusted ? 'SUCCESS' : 'FAILED'}`);
    console.log('=============================================');
    
  } catch (error) {
    console.error('❌ Error during budget adjustment test:', error);
    
    // Clean up test environment on error
    process.env.TEST_MODE = 'false';
    process.env.TEST_MODE_SPENT_VALUE_PAUSE = 'false';
    delete process.env.TEST_CAMPAIGN_ID;
    delete process.env.TEST_PAUSE_TIME;
    delete process.env.TEST_RECHECK_TIME;
    delete process.env.TEST_UTC_DATE;
  }
}

// Run the test
testBudgetAdjustmentWorkflow()
  .then(() => console.log('Test complete'))
  .catch(err => console.error('Test failed:', err));
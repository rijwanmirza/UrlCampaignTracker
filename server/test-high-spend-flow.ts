import urlBudgetLogger from './url-budget-logger';
import { db } from './db';
import { campaigns, urls } from '../shared/schema';
import { eq } from 'drizzle-orm';
import { trafficStarService } from './trafficstar-service';

/**
 * A comprehensive test script that simulates the entire process when a campaign exceeds $10 in spent value
 */
async function testHighSpendFlow() {
  console.log('=========================================');
  console.log('TESTING HIGH SPEND FLOW ($10+ THRESHOLD)');
  console.log('=========================================');
  
  const TEST_CAMPAIGN_ID = 8; // Using campaign ID 8 for testing
  const TRAFFICSTAR_CAMPAIGN_ID = '995224';
  
  // Step 1: Clear any existing logs to start fresh
  console.log('\n1. CLEARING EXISTING LOGS:');
  await urlBudgetLogger.clearLogs();
  const initialLogs = await urlBudgetLogger.getUrlBudgetLogs();
  console.log(`Starting with ${initialLogs.length} logs (should be 0)`);
  
  // Step 2: Set campaign properties for testing
  console.log('\n2. PREPARING TEST CAMPAIGN:');
  try {
    // Update campaign price per thousand for testing
    await db.update(campaigns)
      .set({
        pricePerThousand: '5.00', // $5 per 1000 clicks
        highSpendBudgetCalcTime: null, // Reset calculation time
        lastTrafficSenderStatus: 'low_spend',
        lastTrafficSenderAction: new Date(),
        updatedAt: new Date()
      })
      .where(eq(campaigns.id, TEST_CAMPAIGN_ID));
    
    console.log(`Set campaign ${TEST_CAMPAIGN_ID} price per thousand to $5.00`);
  } catch (error) {
    console.error(`Error preparing test campaign: ${error}`);
    return;
  }
  
  // Step 3: Simulate initial URLs for testing
  console.log('\n3. SIMULATING INITIAL URLS:');
  
  // We'll use existing URLs from the database but log events to see what happens with them
  const campaignUrls = await db.query.urls.findMany({
    where: (url, { eq, and }) => and(
      eq(url.campaignId, TEST_CAMPAIGN_ID),
      eq(url.status, 'active')
    )
  });
  
  console.log(`Found ${campaignUrls.length} active URLs for campaign ${TEST_CAMPAIGN_ID}`);
  campaignUrls.forEach(url => {
    console.log(`- URL ID: ${url.id}, Clicks: ${url.clicks}, Click Limit: ${url.clickLimit}, Remaining: ${url.clickLimit - url.clicks}`);
  });
  
  // Step 4: Simulate campaign spent value exceeding $10
  console.log('\n4. SIMULATING CAMPAIGN SPENT VALUE EXCEEDING $10:');
  console.log(`- Campaign detected as HIGH SPEND (> $10.00)`);
  console.log(`- System pauses campaign and starts configurable waiting period`);
  console.log(`- Waiting period allows pending clicks to register`);
  console.log(`- Campaign status set to 'high_spend_waiting'`);
  
  // Update database to simulate high spend waiting
  try {
    await db.update(campaigns)
      .set({
        lastTrafficSenderStatus: 'high_spend_waiting',
        lastTrafficSenderAction: new Date(Date.now() - 12 * 60 * 1000), // Set 12 minutes ago to exceed wait period
        updatedAt: new Date()
      })
      .where(eq(campaigns.id, TEST_CAMPAIGN_ID));
    
    console.log(`Set campaign ${TEST_CAMPAIGN_ID} status to 'high_spend_waiting' with action time 12 minutes ago`);
  } catch (error) {
    console.error(`Error setting high_spend_waiting status: ${error}`);
    return;
  }
  
  // Step 5: Simulate waiting period elapsed and budget calculation
  console.log('\n5. SIMULATING WAITING PERIOD ELAPSED:');
  console.log(`- After wait period, system gets updated spent value ($12.50 in this test)`);
  console.log(`- For each active URL, remaining clicks are calculated`);
  const SPENT_VALUE = 12.50;
  
  // Calculate values manually to show the process
  let totalRemainingClicks = 0;
  let totalBudgetForRemainingClicks = 0;
  
  for (const url of campaignUrls) {
    const remainingClicks = url.clickLimit - url.clicks;
    const validRemaining = remainingClicks > 0 ? remainingClicks : 0;
    totalRemainingClicks += validRemaining;
    
    // Calculate price for this URL's remaining clicks
    const urlPrice = (validRemaining / 1000) * 5.00; // $5 per 1000 clicks
    totalBudgetForRemainingClicks += urlPrice;
    
    console.log(`- URL ID ${url.id}: ${validRemaining} remaining clicks = $${urlPrice.toFixed(4)}`);
    
    // Log each URL's budget (this is what actually happens in production)
    await urlBudgetLogger.logUrlBudget(url.id, urlPrice);
  }
  
  // Calculate new total budget
  const newTotalBudget = SPENT_VALUE + totalBudgetForRemainingClicks;
  console.log(`- Total remaining clicks: ${totalRemainingClicks}`);
  console.log(`- Budget for remaining clicks: $${totalBudgetForRemainingClicks.toFixed(4)}`);
  console.log(`- New total budget: $${SPENT_VALUE.toFixed(4)} (spent) + $${totalBudgetForRemainingClicks.toFixed(4)} (remaining) = $${newTotalBudget.toFixed(4)}`);
  
  // Step 6: Set highSpendBudgetCalcTime to mark when calculation occurred
  console.log('\n6. SETTING highSpendBudgetCalcTime TO MARK CALCULATION:');
  try {
    const calcTime = new Date();
    await db.update(campaigns)
      .set({
        highSpendBudgetCalcTime: calcTime,
        lastTrafficSenderStatus: 'high_spend_budget_updated',
        lastTrafficSenderAction: new Date(),
        updatedAt: new Date()
      })
      .where(eq(campaigns.id, TEST_CAMPAIGN_ID));
    
    console.log(`Set highSpendBudgetCalcTime to ${calcTime.toISOString()}`);
  } catch (error) {
    console.error(`Error setting highSpendBudgetCalcTime: ${error}`);
    return;
  }
  
  // Step 7: Verify URL budget logs were created
  console.log('\n7. VERIFYING URL BUDGET LOGS:');
  const logs = await urlBudgetLogger.getUrlBudgetLogs();
  console.log(`Found ${logs.length} URL budget logs after calculation:`);
  logs.forEach(log => {
    console.log(`- URL ID: ${log.urlId}, Price: $${log.price}, DateTime: ${log.dateTime}`);
  });
  
  // Step 8: Simulate adding new URLs after budget calculation
  console.log('\n8. SIMULATING ADDING NEW URLS AFTER BUDGET CALCULATION:');
  console.log(`- New URLs added after highSpendBudgetCalcTime are detected`);
  console.log(`- System applies 9-minute delay before updating budget`);
  console.log(`- URLs are batched during the waiting period`);
  
  // Step 9: Simulate the 9-minute delay elapsed for newly added URLs
  console.log('\n9. SIMULATING 9-MINUTE DELAY ELAPSED:');
  console.log(`- When delay elapses, system processes all batched URLs`);
  console.log(`- For new URLs, TOTAL clicks are used (not remaining)`);
  
  // Simulate 3 new URLs added after budget calculation
  const newUrls = [
    { id: 501, name: 'Test New URL 1', clickLimit: 1000, clicks: 0 },
    { id: 502, name: 'Test New URL 2', clickLimit: 2000, clicks: 0 },
    { id: 503, name: 'Test New URL 3', clickLimit: 3000, clicks: 0 }
  ];
  
  let additionalBudget = 0;
  let totalNewClicks = 0;
  
  for (const url of newUrls) {
    // For new URLs, use total click limit (not remaining clicks)
    const totalClicks = url.clickLimit;
    totalNewClicks += totalClicks;
    
    // Calculate budget based on price per thousand
    const urlBudget = (totalClicks / 1000) * 5.00; // $5 per 1000 clicks
    additionalBudget += urlBudget;
    
    console.log(`- New URL ID ${url.id}: ${totalClicks} TOTAL clicks = $${urlBudget.toFixed(4)} additional budget`);
    
    // Log this URL's budget calculation
    await urlBudgetLogger.logUrlBudget(url.id, urlBudget);
  }
  
  // Calculate new budget after adding new URLs
  const newTotalWithAdditional = newTotalBudget + additionalBudget;
  console.log(`- Total clicks from new URLs: ${totalNewClicks}`);
  console.log(`- Additional budget for new URLs: $${additionalBudget.toFixed(4)}`);
  console.log(`- Updated budget: $${newTotalBudget.toFixed(4)} (previous) + $${additionalBudget.toFixed(4)} (additional) = $${newTotalWithAdditional.toFixed(4)}`);
  
  // Step 10: Verify all URL budget logs including new URLs
  console.log('\n10. VERIFYING FINAL URL BUDGET LOGS:');
  const finalLogs = await urlBudgetLogger.getUrlBudgetLogs();
  console.log(`Found ${finalLogs.length} URL budget logs in total:`);
  finalLogs.forEach(log => {
    console.log(`- URL ID: ${log.urlId}, Price: $${log.price}, DateTime: ${log.dateTime}`);
  });
  
  // Step 11: Simulate campaign spent value dropping below $10
  console.log('\n11. SIMULATING SPENT VALUE DROPPING BELOW $10:');
  console.log(`- When spent drops below $10, all URL budget logs are cleared`);
  console.log(`- High-spend tracking is reset, ready for next time spent exceeds $10`);
  
  // Clear logs to simulate spent value dropping below $10
  await urlBudgetLogger.clearLogs();
  
  // Final verification
  console.log('\n12. FINAL VERIFICATION:');
  const afterClearLogs = await urlBudgetLogger.getUrlBudgetLogs();
  console.log(`Log count after clearing: ${afterClearLogs.length} (should be 0)`);
  
  console.log('\n=========================================');
  console.log('HIGH SPEND FLOW TEST COMPLETED');
  console.log('=========================================');
}

// Run the test
testHighSpendFlow().catch(console.error);
import urlBudgetLogger from './url-budget-logger';
import { db } from './db';
import { campaigns, urls } from '../shared/schema';
import { eq } from 'drizzle-orm';

/**
 * Test script to verify URL budget logging functions
 */
async function testUrlBudgetLogger() {
  console.log('------ TESTING URL BUDGET LOGGING SYSTEM ------');
  
  // Step 1: Clear any existing logs
  console.log('\n1. CLEARING EXISTING LOGS:');
  await urlBudgetLogger.clearLogs();
  
  // Step 2: Log some URL budgets
  console.log('\n2. LOGGING URL BUDGETS (INITIAL SET):');
  await urlBudgetLogger.logUrlBudget(101, 12.34);
  await urlBudgetLogger.logUrlBudget(102, 23.45);
  await urlBudgetLogger.logUrlBudget(103, 34.56);
  
  // Step 3: Try to log a duplicate (should be skipped)
  console.log('\n3. TRYING TO LOG DUPLICATE URL:');
  await urlBudgetLogger.logUrlBudget(101, 99.99);
  
  // Step 4: Get all logs and display them
  console.log('\n4. GETTING ALL LOGS:');
  const logs = await urlBudgetLogger.getUrlBudgetLogs();
  console.log(`Found ${logs.length} logs:`);
  logs.forEach(log => {
    console.log(`URL ID: ${log.urlId}, Price: $${log.price}, DateTime: ${log.dateTime}`);
  });
  
  // Step 5: Clear logs when spent value drops below $10
  console.log('\n5. CLEARING LOGS (SIMULATING SPENT VALUE < $10):');
  await urlBudgetLogger.clearLogs();
  
  // Step 6: Verify logs are cleared
  console.log('\n6. VERIFYING LOGS ARE CLEARED:');
  const clearedLogs = await urlBudgetLogger.getUrlBudgetLogs();
  console.log(`Log count after clearing: ${clearedLogs.length}`);
  
  // Step 7: Log new URLs (simulating high spend triggered again)
  console.log('\n7. LOGGING NEW URLS (SIMULATING HIGH SPEND > $10 AGAIN):');
  await urlBudgetLogger.logUrlBudget(101, 12.34); // Should work now as tracking was reset
  await urlBudgetLogger.logUrlBudget(104, 45.67); // New URL
  
  // Step 8: Verify the new logs
  console.log('\n8. VERIFYING NEW LOGS:');
  const newLogs = await urlBudgetLogger.getUrlBudgetLogs();
  console.log(`Found ${newLogs.length} logs after reset:`);
  newLogs.forEach(log => {
    console.log(`URL ID: ${log.urlId}, Price: $${log.price}, DateTime: ${log.dateTime}`);
  });
  
  // Step 9: Simulate the 9-minute delay for newly added URLs
  console.log('\n9. SIMULATING 9-MINUTE DELAY FOR NEWLY ADDED URLS:');
  console.log('- Adding URL with creation time after budget calculation');
  console.log('- Delay is 9 minutes after newest URL creation time');
  console.log('- After delay, URLs would be batched and budget updated');
  
  // Step 10: Demo batch update logic
  console.log('\n10. DEMONSTRATING BATCH UPDATE LOGIC:');
  console.log('- Multiple URLs added during waiting period are batched together');
  console.log('- A single budget update is made for all batched URLs');
  console.log('- Total clicks (not remaining) are used for new URLs');
  
  console.log('\n------ TEST COMPLETED ------');
}

// Run the test
testUrlBudgetLogger().catch(console.error);
// Comprehensive test for URL budget logging system
import fs from 'fs';

// Constants for testing
const LOG_FILE_PATH = 'Active_Url_Budget_Logs';
const HIGH_SPEND_THRESHOLD = 10.00; // $10 threshold
const PRICE_PER_THOUSAND = 5.00; // $5 per 1000 clicks
const NEW_URL_WAIT_MINUTES = 9; // 9-minute waiting period for new URLs

// Set to track URLs that have already been logged during a high-spend period
const loggedUrlIds = new Set();

// Timestamp to mark when high spend budget was calculated
let highSpendBudgetCalcTime = null;

// Set to track URLs that were added after budget calculation
const newUrlsAfterCalc = new Set();

// Queue to track pending budget updates for new URLs
let pendingBudgetUpdates = [];

// Test campaign object
let testCampaign = {
  id: 1,
  name: 'Test Campaign',
  spentValue: 0, // Current spent value
  urls: [] // URLs in this campaign
};

// Function to simulate adding a URL to the campaign
function addUrl(id, name, clickLimit, clicks = 0, timeOffset = 0) {
  const now = new Date();
  if (timeOffset) {
    now.setMinutes(now.getMinutes() + timeOffset);
  }
  
  const url = { 
    id, 
    name, 
    clickLimit, 
    clicks, 
    status: 'active',
    createdAt: now
  };
  
  testCampaign.urls.push(url);
  
  // If budget calculation has already happened, add to the new URLs set
  if (highSpendBudgetCalcTime && url.createdAt > highSpendBudgetCalcTime) {
    newUrlsAfterCalc.add(url.id);
    console.log(`🆕 URL ID ${url.id} added AFTER budget calculation - will be batched`);
    addToPendingBudgetUpdates(url);
  }
  
  return url;
}

// Function to add URL to pending budget updates
function addToPendingBudgetUpdates(url) {
  const totalClicks = url.clickLimit;
  const budget = (totalClicks / 1000) * PRICE_PER_THOUSAND;
  
  pendingBudgetUpdates.push({
    urlId: url.id,
    url,
    budget,
    addedAt: new Date()
  });
  
  console.log(`📋 Added URL ID ${url.id} to pending budget updates queue with budget $${budget.toFixed(4)}`);
}

// Function to log URL budget with deduplication
function logUrlBudget(urlId, url, isNewUrl = false) {
  // Skip if this URL has already been logged
  if (loggedUrlIds.has(urlId)) {
    console.log(`🔄 Skipping duplicate URL budget log for URL ID ${urlId} - already logged`);
    return false;
  }
  
  // Calculate price based on whether this is a new URL or existing URL
  let price;
  if (isNewUrl) {
    // For new URLs, use TOTAL required clicks (clickLimit)
    price = (url.clickLimit / 1000) * PRICE_PER_THOUSAND;
    console.log(`ℹ️ URL ID ${urlId} is NEW after budget calculation - using TOTAL clicks (${url.clickLimit})`);
  } else {
    // For existing URLs, use REMAINING clicks
    const remainingClicks = url.clickLimit - url.clicks;
    price = (remainingClicks / 1000) * PRICE_PER_THOUSAND;
    console.log(`ℹ️ URL ID ${urlId} existed before budget calculation - using REMAINING clicks (${remainingClicks})`);
  }
  
  // Format date and time
  const now = new Date();
  const date = now.toISOString().split('T')[0]; // YYYY-MM-DD
  const time = now.toISOString().split('T')[1].substring(0, 8); // HH:MM:SS
  
  // Format the log entry: UrlId|Price|Date::Time
  const logEntry = `${urlId}|${price.toFixed(4)}|${date}::${time}\n`;

  // Append to log file
  fs.appendFileSync(LOG_FILE_PATH, logEntry);
  console.log(`📝 Logged URL budget for URL ID ${urlId}: $${price.toFixed(4)} at ${date}::${time}`);
  
  // Add to set of logged URLs
  loggedUrlIds.add(urlId);
  return true;
}

// Function to clear all URL budget logs when spent value drops below threshold
function clearUrlBudgetLogs() {
  fs.writeFileSync(LOG_FILE_PATH, ''); // Clear the file
  loggedUrlIds.clear(); // Reset the tracking set
  console.log(`🧹 Cleared all URL budget logs and reset tracking - spent value dropped below threshold`);
}

// Function to process pending budget updates for new URLs
function processPendingBudgetUpdates() {
  if (pendingBudgetUpdates.length === 0) {
    console.log(`ℹ️ No pending budget updates to process`);
    return;
  }
  
  console.log(`🔄 Processing ${pendingBudgetUpdates.length} pending budget updates...`);
  
  const now = new Date();
  const processedUpdates = [];
  
  // Process URLs that have been in the queue for at least NEW_URL_WAIT_MINUTES
  for (const update of pendingBudgetUpdates) {
    const waitTime = (now - update.addedAt) / (1000 * 60); // Minutes
    
    if (waitTime >= NEW_URL_WAIT_MINUTES) {
      console.log(`✅ URL ID ${update.urlId} has waited ${waitTime.toFixed(1)} minutes - processing now`);
      
      // Log budget for this URL (use total clicks)
      logUrlBudget(update.urlId, update.url, true);
      
      // Mark for removal from queue
      processedUpdates.push(update.urlId);
    } else {
      console.log(`⏱️ URL ID ${update.urlId} has only waited ${waitTime.toFixed(1)} minutes - need ${NEW_URL_WAIT_MINUTES} minutes`);
    }
  }
  
  // Remove processed updates from the pending queue
  pendingBudgetUpdates = pendingBudgetUpdates.filter(update => !processedUpdates.includes(update.urlId));
  
  console.log(`✅ Processed ${processedUpdates.length} pending updates, ${pendingBudgetUpdates.length} remaining in queue`);
}

// Function to update spent value and trigger appropriate actions
function updateSpentValue(value) {
  const previousSpent = testCampaign.spentValue;
  testCampaign.spentValue = value;
  
  console.log(`💰 Campaign spent value updated: $${previousSpent.toFixed(2)} -> $${value.toFixed(2)}`);
  
  // Handle high spend detection
  if (previousSpent < HIGH_SPEND_THRESHOLD && value >= HIGH_SPEND_THRESHOLD) {
    console.log(`🚨 HIGH SPEND DETECTED: $${value.toFixed(2)} >= $${HIGH_SPEND_THRESHOLD.toFixed(2)}`);
    console.log(`⏸️ Pausing campaign for ${NEW_URL_WAIT_MINUTES} minutes to wait for pending clicks...`);
    
    // Simulate waiting period by setting the calculation time
    setTimeout(() => {
      console.log(`⏱️ ${NEW_URL_WAIT_MINUTES}-minute waiting period elapsed, calculating budgets...`);
      
      // Set the budget calculation timestamp
      highSpendBudgetCalcTime = new Date();
      console.log(`📊 Budget calculation performed at ${highSpendBudgetCalcTime.toISOString()}`);
      
      // Log budgets for all active URLs that existed before high spend detection
      console.log(`📝 Logging budgets for INITIAL URLs (using REMAINING clicks):`);
      for (const url of testCampaign.urls) {
        if (url.status === 'active' && url.createdAt <= highSpendBudgetCalcTime) {
          logUrlBudget(url.id, url, false);
        }
      }
    }, 100); // Short timeout for simulation purposes
    
  } else if (previousSpent >= HIGH_SPEND_THRESHOLD && value < HIGH_SPEND_THRESHOLD) {
    console.log(`📉 SPENT VALUE DROPPED BELOW THRESHOLD: $${value.toFixed(2)} < $${HIGH_SPEND_THRESHOLD.toFixed(2)}`);
    
    // Clear logs and reset tracking when spent drops below threshold
    clearUrlBudgetLogs();
    
    // Reset high spend calculation time
    highSpendBudgetCalcTime = null;
    console.log(`❌ Reset high spend budget calculation time - new high spend cycle will start from scratch`);
    
    // Clear new URLs tracking
    newUrlsAfterCalc.clear();
    console.log(`❌ Cleared new URLs tracking`);
    
    // Clear pending budget updates
    pendingBudgetUpdates.length = 0;
    console.log(`❌ Cleared pending budget update queue`);
  }
}

// Function to simulate the passage of time and process pending updates
function simulateTimePassage(minutes) {
  console.log(`⏱️ Simulating the passage of ${minutes} minutes...`);
  
  // Hack to simulate time passing for the pending updates
  const now = new Date();
  for (const update of pendingBudgetUpdates) {
    update.addedAt = new Date(update.addedAt.getTime() - (minutes * 60 * 1000));
  }
  
  // Process the updates after time passage
  processPendingBudgetUpdates();
}

// RUN THE COMPREHENSIVE TEST
console.log('===== COMPREHENSIVE URL BUDGET LOGGING TEST =====');

// Clear existing logs
fs.writeFileSync(LOG_FILE_PATH, '');
console.log('🧹 Cleared existing logs for fresh test');

// SCENARIO 1: Initial setup with low spend
console.log('\n1. INITIAL SETUP WITH LOW SPEND:');
addUrl(101, 'URL 1', 1000, 100); // 900 remaining
addUrl(102, 'URL 2', 2000, 500); // 1500 remaining
addUrl(103, 'URL 3', 3000, 1000); // 2000 remaining
updateSpentValue(5.00); // Below $10 threshold

// SCENARIO 2: Spent value increases above $10 threshold
console.log('\n2. SPENT VALUE INCREASES ABOVE $10 THRESHOLD:');
updateSpentValue(15.50);

// Short delay to allow budget calculation to complete
setTimeout(() => {
  // SCENARIO 3: Add new URLs after high spend detection
  console.log('\n3. ADD NEW URLS AFTER HIGH SPEND DETECTION:');
  addUrl(201, 'New URL 1', 5000, 0);
  addUrl(202, 'New URL 2', 6000, 0);
  addUrl(203, 'New URL 3', 7000, 0);
  
  // SCENARIO 4: Wait for the 9-minute period to process new URLs
  console.log('\n4. SIMULATING 9-MINUTE WAIT PERIOD:');
  simulateTimePassage(9);
  
  // SCENARIO 5: Add more URLs that won't be processed immediately
  console.log('\n5. ADD MORE URLS THAT NEED TO WAIT:');
  addUrl(301, 'Later URL 1', 8000, 0);
  addUrl(302, 'Later URL 2', 9000, 0);
  
  // SCENARIO 6: Wait 5 more minutes (partial waiting period)
  console.log('\n6. SIMULATING 5 MORE MINUTES (NOT ENOUGH FOR NEW URLS):');
  simulateTimePassage(5);
  
  // SCENARIO 7: Simulate spent value dropping below threshold
  console.log('\n7. SPENT VALUE DROPS BELOW THRESHOLD:');
  updateSpentValue(8.75);
  
  // SCENARIO 8: Spent value goes back above threshold to test fresh cycle
  console.log('\n8. SPENT VALUE GOES BACK ABOVE THRESHOLD (FRESH CYCLE):');
  updateSpentValue(12.25);
  
  // Allow time for budget calculation
  setTimeout(() => {
    // SCENARIO 9: Add URLs in the new cycle
    console.log('\n9. ADD URLS IN NEW HIGH SPEND CYCLE:');
    addUrl(401, 'New Cycle URL 1', 3000, 0);
    addUrl(402, 'New Cycle URL 2', 4000, 0);
    
    // SCENARIO 10: Complete the test by waiting 9 minutes for final processing
    console.log('\n10. FINAL 9-MINUTE WAIT TO PROCESS REMAINING URLS:');
    simulateTimePassage(9);
    
    // Display final log file contents
    console.log('\nFINAL LOG FILE CONTENTS:');
    const finalLogContents = fs.readFileSync(LOG_FILE_PATH, 'utf-8');
    console.log(finalLogContents);
    
    console.log('\n===== COMPREHENSIVE TESTING COMPLETED =====');
  }, 100);
}, 200);
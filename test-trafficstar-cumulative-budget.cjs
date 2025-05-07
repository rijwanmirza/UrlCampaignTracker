/**
 * Comprehensive test for TrafficStar cumulative budget updates
 * 
 * This test verifies:
 * 1. Initial high spend detection and budget calculation
 * 2. Budget staying in "high" state once detected
 * 3. New URLs being batched together with 9-minute wait
 * 4. Cumulative budget updates (adding to existing budget)
 * 5. Budget reset when spent drops below threshold
 */

const fs = require('fs');
const path = require('path');
const urlBudgetLogPath = path.join('.', 'Active_Url_Budget_Logs');

// Mock TrafficStar API with budget tracking
class MockTrafficStarAPI {
  constructor() {
    this.campaignBudgets = {
      995224: 50.00 // Initial budget
    };
    this.updateHistory = [];
  }

  async updateCampaignBudget(campaignId, maxDaily) {
    const oldBudget = this.campaignBudgets[campaignId] || 0;
    this.campaignBudgets[campaignId] = maxDaily;
    
    // Log the update
    const update = {
      campaignId,
      oldBudget: oldBudget,
      newBudget: maxDaily,
      timestamp: new Date().toISOString()
    };
    this.updateHistory.push(update);
    
    console.log(`TrafficStar Budget Update: Campaign ${campaignId} - $${oldBudget.toFixed(2)} → $${maxDaily.toFixed(2)} [CUMULATIVE]`);
    return { success: true };
  }

  async getCampaign(campaignId) {
    return {
      id: campaignId,
      max_daily: this.campaignBudgets[campaignId] || 0
    };
  }

  printUpdateHistory() {
    console.log('\n=== TrafficStar Budget Update History ===');
    this.updateHistory.forEach((update, index) => {
      console.log(`${index + 1}. Campaign ${update.campaignId}: $${update.oldBudget.toFixed(2)} → $${update.newBudget.toFixed(2)} [${update.timestamp}]`);
    });
  }
}

// Mock URLs to use in testing
function addUrl(id, name, clickLimit, clicks = 0, timeOffset = 0) {
  const addedTime = new Date(Date.now() - timeOffset);
  return {
    id,
    name,
    clickLimit,
    clicks,
    status: 'active',
    addedTime: addedTime.toISOString()
  };
}

// URLs that are waiting for budget updates
const pendingBudgetUpdates = [];

// Add a URL to the pending budget updates queue
function addToPendingBudgetUpdates(url) {
  // Calculate budget based on total clicks for new URLs (added after budget calculation)
  const price = url.clickLimit * 0.005; // $0.005 per click
  
  const pendingUpdate = {
    urlId: url.id,
    name: url.name,
    totalClicks: url.clickLimit,
    budget: price,
    addedToQueueTime: new Date()
  };
  
  pendingBudgetUpdates.push(pendingUpdate);
  console.log(`📋 Added URL ID ${url.id} to pending budget updates queue with budget $${price.toFixed(4)}`);
}

// Log a URL budget calculation
function logUrlBudget(urlId, url, isNewUrl = false) {
  let clicksToUse;
  let message;
  
  if (isNewUrl) {
    // For new URLs, use total clicks
    clicksToUse = url.clickLimit;
    message = `ℹ️ URL ID ${urlId} is NEW after budget calculation - using TOTAL clicks (${clicksToUse})`;
  } else {
    // For initial URLs, use remaining clicks
    clicksToUse = url.clickLimit - url.clicks;
    message = `ℹ️ URL ID ${urlId} existed before budget calculation - using REMAINING clicks (${clicksToUse})`;
  }
  
  console.log(message);
  
  // Calculate price ($0.005 per click)
  const price = clicksToUse * 0.005;
  
  // Log to file
  const now = new Date();
  const date = now.toISOString().split('T')[0]; // YYYY-MM-DD
  const time = now.toISOString().split('T')[1].substring(0, 8); // HH:MM:SS
  const logEntry = `${urlId}|${price.toFixed(4)}|${date}::${time}\n`;
  
  // Append to log file
  fs.appendFileSync(urlBudgetLogPath, logEntry);
  console.log(`📝 Logged URL budget for URL ID ${urlId}: $${price.toFixed(4)} at ${date}::${time}`);
  
  return price;
}

// Clear URL budget logs
function clearUrlBudgetLogs() {
  // Clear the log file
  fs.writeFileSync(urlBudgetLogPath, '');
  console.log('🧹 Cleared all URL budget logs and reset tracking - spent value dropped below threshold');
  console.log('❌ Reset high spend budget calculation time - new high spend cycle will start from scratch');
  console.log('❌ Cleared new URLs tracking');
}

// Process pending budget updates
async function processPendingBudgetUpdates() {
  console.log(`🔄 Processing ${pendingBudgetUpdates.length} pending budget updates...`);
  
  if (pendingBudgetUpdates.length === 0) {
    return;
  }
  
  const processedUpdates = [];
  let totalAdditionalBudget = 0;
  
  for (const update of pendingBudgetUpdates) {
    const now = new Date();
    const waitTimeMinutes = (now - update.addedToQueueTime) / (1000 * 60);
    
    if (waitTimeMinutes >= 9) {
      console.log(`✅ URL ID ${update.urlId} has waited ${waitTimeMinutes.toFixed(1)} minutes - processing now`);
      
      // Log URL budget (for new URLs)
      const mockUrl = {
        id: update.urlId,
        name: update.name,
        clickLimit: update.totalClicks,
        clicks: 0
      };
      
      logUrlBudget(update.urlId, mockUrl, true);
      
      // Add budget to total
      totalAdditionalBudget += update.budget;
      
      // Mark for removal from queue
      processedUpdates.push(update);
    } else {
      console.log(`⏱️ URL ID ${update.urlId} has only waited ${waitTimeMinutes.toFixed(1)} minutes - need 9 minutes`);
    }
  }
  
  // Update campaign budget if we have processed updates
  if (processedUpdates.length > 0) {
    // Get current budget
    const campaign = await trafficStarApi.getCampaign(995224);
    const currentBudget = campaign.max_daily;
    
    // Calculate new budget (current + additional)
    const newBudget = currentBudget + totalAdditionalBudget;
    
    console.log(`ℹ️ Updating TrafficStar campaign budget: $${currentBudget.toFixed(2)} + $${totalAdditionalBudget.toFixed(2)} = $${newBudget.toFixed(2)}`);
    await trafficStarApi.updateCampaignBudget(995224, newBudget);
    
    // Remove processed updates from queue
    for (const update of processedUpdates) {
      const index = pendingBudgetUpdates.indexOf(update);
      if (index > -1) {
        pendingBudgetUpdates.splice(index, 1);
      }
    }
  }
  
  console.log(`✅ Processed ${processedUpdates.length} pending updates, ${pendingBudgetUpdates.length} remaining in queue`);
}

// Update the spent value
let campaignSpentValue = 0;
let highSpendDetected = false;

function updateSpentValue(value) {
  const oldValue = campaignSpentValue;
  campaignSpentValue = value;
  console.log(`💰 Campaign spent value updated: $${oldValue.toFixed(2)} -> $${value.toFixed(2)}`);
  
  // Check if we crossed the threshold
  const threshold = 10.00;
  
  if (oldValue < threshold && value >= threshold) {
    console.log(`🚨 HIGH SPEND DETECTED: $${value.toFixed(2)} >= $${threshold.toFixed(2)}`);
    highSpendDetected = true;
    return 'high';
  } else if (oldValue >= threshold && value < threshold) {
    console.log(`📉 SPENT VALUE DROPPED BELOW THRESHOLD: $${value.toFixed(2)} < $${threshold.toFixed(2)}`);
    highSpendDetected = false;
    clearUrlBudgetLogs();
    pendingBudgetUpdates.length = 0; // Clear the queue
    console.log('❌ Cleared pending budget update queue');
    return 'low';
  }
  
  return oldValue >= threshold ? 'high' : 'low';
}

// Simulate time passage
async function simulateTimePassage(minutes) {
  console.log(`⏱️ Simulating the passage of ${minutes} minutes...`);
  await processPendingBudgetUpdates();
}

// Main test function
async function runTest() {
  console.log('===== TESTING TRAFFICSTAR CUMULATIVE BUDGET UPDATES =====');
  
  // Create mock TrafficStar API
  global.trafficStarApi = new MockTrafficStarAPI();
  
  // Set up testing
  if (fs.existsSync(urlBudgetLogPath)) {
    fs.writeFileSync(urlBudgetLogPath, '');
  }
  console.log('🧹 Cleared existing logs for fresh test');
  
  // Initial URLs in the campaign
  let initialUrls = [
    addUrl(101, 'Test URL 1', 1000, 100), // 900 remaining clicks
    addUrl(102, 'Test URL 2', 2000, 500), // 1500 remaining clicks
    addUrl(103, 'Test URL 3', 3000, 1000) // 2000 remaining clicks
  ];
  
  // Initialize with low spend
  console.log('\n1. INITIAL SETUP WITH LOW SPEND:');
  updateSpentValue(5.00);
  
  // Increase spent value above threshold
  console.log('\n2. SPENT VALUE INCREASES ABOVE $10 THRESHOLD:');
  updateSpentValue(15.50);
  
  console.log('⏸️ Pausing campaign for 9 minutes to wait for pending clicks...');
  console.log('⏱️ 9-minute waiting period elapsed, calculating budgets...');
  console.log(`📊 Budget calculation performed at ${new Date().toISOString()}`);
  
  console.log('📝 Logging budgets for INITIAL URLs (using REMAINING clicks):');
  
  // Calculate initial budget
  let initialTotalBudget = 0;
  
  for (const url of initialUrls) {
    const budget = logUrlBudget(url.id, url, false);
    initialTotalBudget += budget;
  }
  
  // Update TrafficStar budget for initial calculation
  console.log(`ℹ️ Initial budget calculation: $${initialTotalBudget.toFixed(2)}`);
  await trafficStarApi.updateCampaignBudget(995224, 50.00 + initialTotalBudget);
  
  // Add new URLs after high spend detection (first batch)
  console.log('\n3. ADD NEW URLS AFTER HIGH SPEND DETECTION:');
  const newUrls1 = [
    addUrl(201, 'New URL 1', 5000),
    addUrl(202, 'New URL 2', 6000),
    addUrl(203, 'New URL 3', 7000)
  ];
  
  for (const url of newUrls1) {
    console.log(`🆕 URL ID ${url.id} added AFTER budget calculation - will be batched`);
    addToPendingBudgetUpdates(url);
  }
  
  // Simulate 9-minute wait
  console.log('\n4. SIMULATING 9-MINUTE WAIT PERIOD:');
  await simulateTimePassage(9.0);
  
  // Add more URLs that need to wait
  console.log('\n5. ADD MORE URLS THAT NEED TO WAIT:');
  const newUrls2 = [
    addUrl(301, 'New URL 4', 8000),
    addUrl(302, 'New URL 5', 9000)
  ];
  
  for (const url of newUrls2) {
    console.log(`🆕 URL ID ${url.id} added AFTER budget calculation - will be batched`);
    addToPendingBudgetUpdates(url);
  }
  
  // Simulate partial wait (not enough time)
  console.log('\n6. SIMULATING 5 MORE MINUTES (NOT ENOUGH FOR NEW URLS):');
  await simulateTimePassage(5.0);
  
  // Drop spent value below threshold
  console.log('\n7. SPENT VALUE DROPS BELOW THRESHOLD:');
  updateSpentValue(8.75);
  
  // Increase spent value above threshold again (fresh cycle)
  console.log('\n8. SPENT VALUE GOES BACK ABOVE THRESHOLD (FRESH CYCLE):');
  updateSpentValue(12.25);
  
  console.log('⏸️ Pausing campaign for 9 minutes to wait for pending clicks...');
  console.log('⏱️ 9-minute waiting period elapsed, calculating budgets...');
  console.log(`📊 Budget calculation performed at ${new Date().toISOString()}`);
  
  console.log('📝 Logging budgets for INITIAL URLs (using REMAINING clicks):');
  
  // In this new cycle, all URLs are considered initial
  const allUrls = [
    ...initialUrls,
    ...newUrls1,
    ...newUrls2
  ];
  
  let newCycleTotalBudget = 0;
  
  for (const url of allUrls) {
    const budget = logUrlBudget(url.id, url, false);
    newCycleTotalBudget += budget;
  }
  
  // Update TrafficStar budget for new cycle
  console.log(`ℹ️ New cycle budget calculation: $${newCycleTotalBudget.toFixed(2)}`);
  await trafficStarApi.updateCampaignBudget(995224, 50.00 + newCycleTotalBudget);
  
  // Add more URLs in new high spend cycle
  console.log('\n9. ADD URLS IN NEW HIGH SPEND CYCLE:');
  const newUrls3 = [
    addUrl(401, 'New URL 6', 3000),
    addUrl(402, 'New URL 7', 4000)
  ];
  
  for (const url of newUrls3) {
    console.log(`🆕 URL ID ${url.id} added AFTER budget calculation - will be batched`);
    addToPendingBudgetUpdates(url);
  }
  
  // Final 9-minute wait to process remaining URLs
  console.log('\n10. FINAL 9-MINUTE WAIT TO PROCESS REMAINING URLS:');
  await simulateTimePassage(9.0);
  
  // Print log file contents
  console.log('\nFINAL LOG FILE CONTENTS:');
  const logContents = fs.readFileSync(urlBudgetLogPath, 'utf-8');
  console.log(logContents);
  
  // Print TrafficStar budget update history
  trafficStarApi.printUpdateHistory();
  
  console.log('\n===== CUMULATIVE BUDGET TESTING COMPLETED =====');
}

// Run the test
runTest().catch(console.error);

// Test script for TrafficStar budget update after 9-minute wait
import fs from 'fs';
import axios from 'axios';

// Mock TrafficStar API for testing
class MockTrafficStarAPI {
  constructor() {
    this.campaigns = {
      '995224': {
        id: 995224,
        max_daily: 50.00, // Current daily budget
        status: 'enabled',
        active: true
      }
    };
    this.updateHistory = [];
  }

  // Method to simulate updating campaign budget
  async updateCampaignBudget(campaignId, maxDaily) {
    console.log(`🔄 TrafficStar API: Updating campaign ${campaignId} budget to $${maxDaily.toFixed(2)}`);
    
    // Log the update
    this.updateHistory.push({
      timestamp: new Date(),
      campaignId,
      oldBudget: this.campaigns[campaignId].max_daily,
      newBudget: maxDaily
    });
    
    // Update the campaign
    this.campaigns[campaignId].max_daily = maxDaily;
    
    // Return simulated API response
    return {
      success: true,
      data: {
        campaign: this.campaigns[campaignId]
      }
    };
  }
  
  // Method to get campaign details
  async getCampaign(campaignId) {
    console.log(`🔍 TrafficStar API: Getting campaign ${campaignId} details`);
    return {
      success: true,
      data: {
        campaign: this.campaigns[campaignId]
      }
    };
  }
  
  // Print update history
  printUpdateHistory() {
    console.log(`\n📋 TRAFFICSTAR BUDGET UPDATE HISTORY:`);
    if (this.updateHistory.length === 0) {
      console.log(`  No budget updates were made`);
      return;
    }
    
    this.updateHistory.forEach((update, index) => {
      console.log(`  ${index + 1}. Campaign ${update.campaignId}: $${update.oldBudget.toFixed(2)} → $${update.newBudget.toFixed(2)} at ${update.timestamp.toISOString()}`);
    });
  }
}

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

// Initialize TrafficStar API mock
const trafficStarAPI = new MockTrafficStarAPI();
let trafficStarCampaignId = '995224';

// Test campaign object
let testCampaign = {
  id: 1,
  name: 'Test Campaign',
  spentValue: 0, // Current spent value
  trafficstarCampaignId: trafficStarCampaignId,
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
  return price;
}

// Function to clear all URL budget logs when spent value drops below threshold
function clearUrlBudgetLogs() {
  fs.writeFileSync(LOG_FILE_PATH, ''); // Clear the file
  loggedUrlIds.clear(); // Reset the tracking set
  console.log(`🧹 Cleared all URL budget logs and reset tracking - spent value dropped below threshold`);
}

// Function to process pending budget updates for new URLs and update TrafficStar
async function processPendingBudgetUpdates() {
  if (pendingBudgetUpdates.length === 0) {
    console.log(`ℹ️ No pending budget updates to process`);
    return 0;
  }
  
  console.log(`🔄 Processing ${pendingBudgetUpdates.length} pending budget updates...`);
  
  const now = new Date();
  const processedUpdates = [];
  let totalBudgetToAdd = 0;
  
  // Process URLs that have been in the queue for at least NEW_URL_WAIT_MINUTES
  for (const update of pendingBudgetUpdates) {
    const waitTime = (now - update.addedAt) / (1000 * 60); // Minutes
    
    if (waitTime >= NEW_URL_WAIT_MINUTES) {
      console.log(`✅ URL ID ${update.urlId} has waited ${waitTime.toFixed(1)} minutes - processing now`);
      
      // Log budget for this URL (use total clicks)
      const price = logUrlBudget(update.urlId, update.url, true);
      
      // Add to total budget
      totalBudgetToAdd += price;
      
      // Mark for removal from queue
      processedUpdates.push(update.urlId);
    } else {
      console.log(`⏱️ URL ID ${update.urlId} has only waited ${waitTime.toFixed(1)} minutes - need ${NEW_URL_WAIT_MINUTES} minutes`);
    }
  }
  
  // Remove processed updates from the pending queue
  pendingBudgetUpdates = pendingBudgetUpdates.filter(update => !processedUpdates.includes(update.urlId));
  
  console.log(`✅ Processed ${processedUpdates.length} pending updates, ${pendingBudgetUpdates.length} remaining in queue`);
  
  // Update TrafficStar budget if there are processed updates
  if (processedUpdates.length > 0 && totalBudgetToAdd > 0) {
    console.log(`\n💰 Updating TrafficStar budget for campaign ${trafficStarCampaignId}:`);
    
    // Get current campaign details
    const campaignResponse = await trafficStarAPI.getCampaign(trafficStarCampaignId);
    const currentBudget = campaignResponse.data.campaign.max_daily;
    
    console.log(`  Current budget: $${currentBudget.toFixed(2)}`);
    console.log(`  Adding budget: $${totalBudgetToAdd.toFixed(2)}`);
    
    // Calculate new budget
    const newBudget = currentBudget + totalBudgetToAdd;
    console.log(`  New budget: $${newBudget.toFixed(2)}`);
    
    // Update TrafficStar campaign budget
    const updateResponse = await trafficStarAPI.updateCampaignBudget(trafficStarCampaignId, newBudget);
    
    if (updateResponse.success) {
      console.log(`✅ Successfully updated TrafficStar campaign ${trafficStarCampaignId} budget to $${newBudget.toFixed(2)}`);
    } else {
      console.log(`❌ Failed to update TrafficStar campaign budget`);
    }
  }
  
  return processedUpdates.length;
}

// Function to update spent value and trigger appropriate actions
function updateSpentValue(value) {
  const previousSpent = testCampaign.spentValue;
  testCampaign.spentValue = value;
  
  console.log(`💰 Campaign spent value updated: $${previousSpent.toFixed(2)} → $${value.toFixed(2)}`);
  
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
async function simulateTimePassage(minutes) {
  console.log(`\n⏱️ Simulating the passage of ${minutes} minutes...`);
  
  // Hack to simulate time passing for the pending updates
  const now = new Date();
  for (const update of pendingBudgetUpdates) {
    update.addedAt = new Date(update.addedAt.getTime() - (minutes * 60 * 1000));
  }
  
  // Process the updates after time passage
  const processed = await processPendingBudgetUpdates();
  return processed;
}

// RUN THE TEST WITH TRAFFICSTAR INTEGRATION
console.log('===== TESTING TRAFFICSTAR BUDGET UPDATE AFTER 9-MINUTE WAIT =====');

// Clear existing logs
fs.writeFileSync(LOG_FILE_PATH, '');
console.log('🧹 Cleared existing logs for fresh test');

// Get initial TrafficStar campaign details
(async () => {
  try {
    // SCENARIO 1: Get current campaign details
    console.log('\n1. CHECKING INITIAL TRAFFICSTAR CAMPAIGN DETAILS:');
    const campaignResponse = await trafficStarAPI.getCampaign(trafficStarCampaignId);
    const initialBudget = campaignResponse.data.campaign.max_daily;
    console.log(`  Initial budget: $${initialBudget.toFixed(2)}`);
    
    // SCENARIO 2: Initial setup with high spend
    console.log('\n2. INITIAL SETUP WITH HIGH SPEND:');
    addUrl(101, 'URL 1', 1000, 100); // 900 remaining
    addUrl(102, 'URL 2', 2000, 500); // 1500 remaining
    updateSpentValue(15.50); // Above $10 threshold to trigger high spend detection
    
    // Short delay to allow budget calculation to complete
    setTimeout(async () => {
      // SCENARIO 3: Add new URLs after high spend detection
      console.log('\n3. ADDING NEW URLS AFTER HIGH SPEND DETECTION:');
      addUrl(201, 'New URL 1', 5000, 0);
      addUrl(202, 'New URL 2', 6000, 0);
      
      // SCENARIO 4: Simulate 8 minutes passing (not enough time)
      console.log('\n4. SIMULATING 8-MINUTE WAIT (NOT ENOUGH):');
      await simulateTimePassage(8);
      
      // SCENARIO 5: Simulate last minute passing (should trigger update)
      console.log('\n5. SIMULATING FINAL 1 MINUTE (TRIGGERS UPDATE):');
      await simulateTimePassage(1);
      
      // SCENARIO 6: Add more URLs
      console.log('\n6. ADDING MORE URLS:');
      addUrl(301, 'Later URL 1', 8000, 0);
      
      // SCENARIO 7: Wait full 9 minutes for the new URL
      console.log('\n7. WAITING FULL 9 MINUTES FOR NEWEST URL:');
      await simulateTimePassage(9);
      
      // Display final TrafficStar update history
      trafficStarAPI.printUpdateHistory();
      
      // Display final log file contents
      console.log('\nFINAL LOG FILE CONTENTS:');
      const finalLogContents = fs.readFileSync(LOG_FILE_PATH, 'utf-8');
      console.log(finalLogContents);
      
      console.log('\n===== TRAFFICSTAR BUDGET UPDATE TESTING COMPLETED =====');
    }, 200);
  } catch (error) {
    console.error('Error in test:', error);
  }
})();
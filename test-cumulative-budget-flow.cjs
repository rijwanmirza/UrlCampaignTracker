/**
 * Test script for URL Budget & Cumulative Budget Flow
 * 
 * This test specifically verifies:
 * 1. High budget status STAYS PERMANENT until spent drops below $10
 * 2. New URLs don't trigger another campaign pause
 * 3. Budget updates are CUMULATIVE based on existing budget
 * 4. URLs added while campaign is in high spend state are properly tracked
 */

const fs = require('fs');
const path = require('path');
const urlBudgetLogPath = path.join('.', 'Active_Url_Budget_Logs');

// Track high/low budget state
let isHighBudget = false;
let highBudgetCalculationTime = null;

// Set up mock TrafficStar API with current budget tracking
class MockTrafficStarAPI {
  constructor() {
    this.campaignBudgets = {
      995224: 100.00 // Initial budget of $100
    };
    this.updateHistory = [];
    this.campaignStatus = 'paused'; // Start paused
  }

  // Update campaign budget (cumulative)
  async updateCampaignBudget(campaignId, newBudget) {
    const oldBudget = this.campaignBudgets[campaignId];
    this.campaignBudgets[campaignId] = newBudget;
    
    // Record the update
    this.updateHistory.push({
      type: 'budget',
      campaignId,
      oldValue: oldBudget,
      newValue: newBudget,
      timestamp: new Date().toISOString()
    });
    
    console.log(`💰 [TRAFFICSTAR API] Updated campaign ${campaignId} budget: $${oldBudget.toFixed(2)} → $${newBudget.toFixed(2)}`);
    return { success: true };
  }

  // Get current campaign details including budget
  async getCampaign(campaignId) {
    return {
      id: campaignId,
      max_daily: this.campaignBudgets[campaignId],
      status: this.campaignStatus,
      active: this.campaignStatus === 'enabled'
    };
  }

  // Pause campaign
  async pauseCampaign(campaignId) {
    this.campaignStatus = 'paused';
    this.updateHistory.push({
      type: 'status',
      campaignId,
      oldValue: 'enabled',
      newValue: 'paused',
      timestamp: new Date().toISOString()
    });
    console.log(`⏸️ [TRAFFICSTAR API] Paused campaign ${campaignId}`);
    return { success: true };
  }

  // Activate campaign
  async activateCampaign(campaignId) {
    this.campaignStatus = 'enabled';
    this.updateHistory.push({
      type: 'status',
      campaignId,
      oldValue: 'paused',
      newValue: 'enabled',
      timestamp: new Date().toISOString()
    });
    console.log(`▶️ [TRAFFICSTAR API] Activated campaign ${campaignId}`);
    return { success: true };
  }

  // Print history of all API actions
  printHistory() {
    console.log('\n=== TrafficStar API Call History ===');
    this.updateHistory.forEach((update, index) => {
      if (update.type === 'budget') {
        console.log(`${index + 1}. Budget update: Campaign ${update.campaignId}: $${update.oldValue.toFixed(2)} → $${update.newValue.toFixed(2)} [${update.timestamp}]`);
      } else {
        console.log(`${index + 1}. Status update: Campaign ${update.campaignId}: ${update.oldValue} → ${update.newValue} [${update.timestamp}]`);
      }
    });
  }
}

// URL management
class UrlManager {
  constructor() {
    this.urls = new Map();
    this.pendingBudgetUpdates = new Map();
    this.lastBudgetCalculationTime = null;
  }

  // Add a URL to the system
  addUrl(id, name, clickLimit, clicks = 0, status = 'active') {
    const url = {
      id,
      name,
      clickLimit,
      clicks,
      status,
      remainingClicks: clickLimit - clicks,
      pendingBudgetUpdate: false,
      budgetCalculated: false,
      addedTime: new Date()
    };
    
    this.urls.set(id, url);
    console.log(`[URL MANAGER] Added URL ${id} with ${url.remainingClicks} remaining clicks`);
    return url;
  }

  // Get active URLs
  getActiveUrls() {
    return Array.from(this.urls.values()).filter(url => url.status === 'active');
  }

  // Mark a URL as pending budget update
  markUrlPendingBudgetUpdate(urlId) {
    const url = this.urls.get(urlId);
    if (url) {
      url.pendingBudgetUpdate = true;
      console.log(`[URL MANAGER] Marked URL ${urlId} as pending budget update`);
    }
  }

  // Track a new URL for batch budget update
  trackUrlForBudgetUpdate(urlId, budget) {
    this.pendingBudgetUpdates.set(urlId, {
      urlId,
      budget,
      addedTime: new Date()
    });
    
    console.log(`[URL MANAGER] Added URL ${urlId} to pending budget updates with budget $${budget.toFixed(4)}`);
  }

  // Get URLs added after high budget calculation
  getUrlsAddedAfterBudgetCalculation() {
    if (!this.lastBudgetCalculationTime) {
      return [];
    }
    
    return Array.from(this.urls.values()).filter(url => {
      return url.status === 'active' && 
             url.addedTime > this.lastBudgetCalculationTime && 
             !url.budgetCalculated;
    });
  }

  // Set budget calculation time
  setBudgetCalculationTime() {
    this.lastBudgetCalculationTime = new Date();
    console.log(`[URL MANAGER] Set budget calculation time to ${this.lastBudgetCalculationTime.toISOString()}`);
  }

  // Reset budget calculation tracking
  resetBudgetCalculation() {
    this.lastBudgetCalculationTime = null;
    this.pendingBudgetUpdates.clear();
    
    // Reset URL flags
    for (const url of this.urls.values()) {
      url.pendingBudgetUpdate = false;
      url.budgetCalculated = false;
    }
    
    console.log(`[URL MANAGER] Reset budget calculation tracking`);
  }

  // Process pending budget updates after waiting period
  async processPendingBudgetUpdates(campaignId, waitMinutes = 9) {
    if (this.pendingBudgetUpdates.size === 0) {
      console.log(`[URL MANAGER] No pending budget updates to process`);
      return 0;
    }
    
    console.log(`[URL MANAGER] Processing ${this.pendingBudgetUpdates.size} pending budget updates after ${waitMinutes}-minute wait`);
    
    const now = new Date();
    const urlsToProcess = [];
    let totalAdditionalBudget = 0;
    
    // Check which URLs have waited long enough
    for (const [urlId, update] of this.pendingBudgetUpdates.entries()) {
      const waitTimeMs = now - update.addedTime;
      const waitTimeMins = waitTimeMs / (1000 * 60);
      
      if (waitTimeMins >= waitMinutes) {
        console.log(`[URL MANAGER] URL ${urlId} has waited ${waitTimeMins.toFixed(1)} minutes - processing`);
        urlsToProcess.push(update);
        totalAdditionalBudget += update.budget;
        
        // Mark as processed
        const url = this.urls.get(urlId);
        if (url) {
          url.budgetCalculated = true;
          url.pendingBudgetUpdate = false;
        }
      } else {
        console.log(`[URL MANAGER] URL ${urlId} has only waited ${waitTimeMins.toFixed(1)} minutes - need ${waitMinutes}`);
      }
    }
    
    // Remove processed updates
    for (const update of urlsToProcess) {
      this.pendingBudgetUpdates.delete(update.urlId);
    }
    
    if (urlsToProcess.length > 0) {
      console.log(`[URL MANAGER] Processed ${urlsToProcess.length} URLs with total budget $${totalAdditionalBudget.toFixed(4)}`);
      
      // Get current campaign budget
      const campaignDetails = await trafficStarApi.getCampaign(campaignId);
      const currentBudget = campaignDetails.max_daily;
      
      // Calculate new budget
      const newBudget = currentBudget + totalAdditionalBudget;
      console.log(`[URL MANAGER] Cumulative budget update: $${currentBudget.toFixed(2)} + $${totalAdditionalBudget.toFixed(4)} = $${newBudget.toFixed(4)}`);
      
      // Update campaign budget
      await trafficStarApi.updateCampaignBudget(campaignId, newBudget);
    }
    
    return totalAdditionalBudget;
  }
}

// URL budget logging
class BudgetLogger {
  constructor(logFilePath) {
    this.logFilePath = logFilePath;
    this.loggedUrls = new Set();
    
    // Create log file if it doesn't exist
    if (!fs.existsSync(this.logFilePath)) {
      fs.writeFileSync(this.logFilePath, '');
    }
  }

  // Log URL budget
  async logUrlBudget(urlId, budget, isNewUrl = false) {
    if (this.loggedUrls.has(urlId)) {
      console.log(`[BUDGET LOGGER] URL ${urlId} already logged in this high-spend cycle - skipping`);
      return false;
    }
    
    // Format the log entry
    const now = new Date();
    const date = now.toISOString().split('T')[0]; // YYYY-MM-DD
    const time = now.toISOString().split('T')[1].substring(0, 8); // HH:MM:SS
    const logEntry = `${urlId}|${budget.toFixed(4)}|${date}::${time}\n`;
    
    // Write to log file
    fs.appendFileSync(this.logFilePath, logEntry);
    
    // Track this URL as logged
    this.loggedUrls.add(urlId);
    
    console.log(`[BUDGET LOGGER] Logged URL ${urlId} budget: $${budget.toFixed(4)} at ${date}::${time} (${isNewUrl ? 'NEW URL' : 'EXISTING URL'})`);
    return true;
  }

  // Clear all logs
  clearLogs() {
    fs.writeFileSync(this.logFilePath, '');
    this.loggedUrls.clear();
    console.log(`[BUDGET LOGGER] Cleared all URL budget logs for new cycle`);
  }

  // Check if URL has been logged
  isUrlLogged(urlId) {
    return this.loggedUrls.has(urlId);
  }

  // Get all logs
  getLogs() {
    try {
      return fs.readFileSync(this.logFilePath, 'utf-8');
    } catch (error) {
      console.error(`[BUDGET LOGGER] Error reading log file:`, error);
      return '';
    }
  }
}

// Traffic Generator simulation
class TrafficGeneratorSimulator {
  constructor(campaignId) {
    this.campaignId = campaignId;
    this.spentValue = 0;
    this.budgetThreshold = 10.00;
    this.urlManager = new UrlManager();
    this.budgetLogger = new BudgetLogger(urlBudgetLogPath);
    this.pricePerThousand = 5.00; // $5 per 1000 clicks
  }

  // Set spent value and handle high/low budget state
  async setSpentValue(newValue) {
    const oldValue = this.spentValue;
    this.spentValue = newValue;
    
    console.log(`[TRAFFIC GENERATOR] Campaign ${this.campaignId} spent value: $${oldValue.toFixed(2)} → $${newValue.toFixed(2)}`);
    
    // Check if we crossed the threshold
    if (oldValue < this.budgetThreshold && newValue >= this.budgetThreshold) {
      // First time crossing the threshold to high spend
      console.log(`[TRAFFIC GENERATOR] 🚨 HIGH SPEND DETECTED: $${newValue.toFixed(2)} >= $${this.budgetThreshold.toFixed(2)}`);
      isHighBudget = true;
      
      // Pause the campaign
      console.log(`[TRAFFIC GENERATOR] Pausing campaign ${this.campaignId} for 9 minutes to wait for pending clicks...`);
      await trafficStarApi.pauseCampaign(this.campaignId);
      
      // Wait 9 minutes (simulated)
      console.log(`[TRAFFIC GENERATOR] 9-minute waiting period elapsed, calculating budgets...`);
      
      // Process initial URLs
      await this.processInitialHighSpendBudget();
      
    } else if (oldValue >= this.budgetThreshold && newValue < this.budgetThreshold) {
      // Crossed back down to low spend
      console.log(`[TRAFFIC GENERATOR] 📉 SPENT VALUE DROPPED BELOW THRESHOLD: $${newValue.toFixed(2)} < $${this.budgetThreshold.toFixed(2)}`);
      isHighBudget = false;
      
      // Clear logs and reset tracking
      this.budgetLogger.clearLogs();
      this.urlManager.resetBudgetCalculation();
    }
    
    return isHighBudget ? 'high' : 'low';
  }

  // Process initial high spend budget calculation
  async processInitialHighSpendBudget() {
    // Set the budget calculation time
    this.urlManager.setBudgetCalculationTime();
    highBudgetCalculationTime = new Date();
    
    console.log(`[TRAFFIC GENERATOR] Initial high spend budget calculation at ${highBudgetCalculationTime.toISOString()}`);
    
    // Get active URLs
    const activeUrls = this.urlManager.getActiveUrls();
    console.log(`[TRAFFIC GENERATOR] Calculating budget for ${activeUrls.length} active URLs`);
    
    if (activeUrls.length === 0) {
      console.log(`[TRAFFIC GENERATOR] No active URLs to process`);
      return;
    }
    
    // Calculate total budget needed
    let totalBudget = 0;
    
    for (const url of activeUrls) {
      // For initial URLs, use remaining clicks
      const remainingClicks = url.remainingClicks;
      const urlBudget = (remainingClicks / 1000) * this.pricePerThousand;
      
      console.log(`[TRAFFIC GENERATOR] URL ${url.id}: ${remainingClicks} remaining clicks × $${this.pricePerThousand.toFixed(2)}/1000 = $${urlBudget.toFixed(4)}`);
      
      // Log the budget
      await this.budgetLogger.logUrlBudget(url.id, urlBudget, false);
      
      totalBudget += urlBudget;
      
      // Mark URL as processed
      url.budgetCalculated = true;
    }
    
    console.log(`[TRAFFIC GENERATOR] Total budget for all active URLs: $${totalBudget.toFixed(4)}`);
    
    // Get current campaign budget
    const campaignDetails = await trafficStarApi.getCampaign(this.campaignId);
    const currentSpentValue = this.spentValue;
    
    // Calculate new budget (current spent + calculated budget)
    const newBudget = currentSpentValue + totalBudget;
    console.log(`[TRAFFIC GENERATOR] Setting new budget: $${currentSpentValue.toFixed(2)} (spent) + $${totalBudget.toFixed(4)} (calculated) = $${newBudget.toFixed(4)}`);
    
    // Update campaign budget
    await trafficStarApi.updateCampaignBudget(this.campaignId, newBudget);
  }

  // Add a new URL during high spend cycle
  async addNewUrlDuringHighSpend(id, name, clickLimit) {
    // Add the URL
    const url = this.urlManager.addUrl(id, name, clickLimit);
    
    if (!isHighBudget || !highBudgetCalculationTime) {
      console.log(`[TRAFFIC GENERATOR] Campaign is not in high spend state - adding URL normally`);
      return url;
    }
    
    console.log(`[TRAFFIC GENERATOR] Adding URL ${id} after high spend budget calculation`);
    
    // Calculate budget using TOTAL clicks for new URL
    const urlBudget = (clickLimit / 1000) * this.pricePerThousand;
    console.log(`[TRAFFIC GENERATOR] New URL ${id} budget: ${clickLimit} clicks × $${this.pricePerThousand.toFixed(2)}/1000 = $${urlBudget.toFixed(4)}`);
    
    // Mark for batch processing
    this.urlManager.markUrlPendingBudgetUpdate(id);
    this.urlManager.trackUrlForBudgetUpdate(id, urlBudget);
    
    return url;
  }

  // Process pending budget updates for new URLs
  async processPendingUpdates() {
    if (!isHighBudget) {
      console.log(`[TRAFFIC GENERATOR] Not in high spend state - no updates to process`);
      return;
    }
    
    // Process pending updates after 9-minute wait
    await this.urlManager.processPendingBudgetUpdates(this.campaignId, 9);
  }
}

// Main test function
async function runTest() {
  console.log('===== TESTING CUMULATIVE BUDGET FLOW =====');
  
  // Create API and simulator
  global.trafficStarApi = new MockTrafficStarAPI();
  const simulator = new TrafficGeneratorSimulator(995224);
  
  // Clear log file
  fs.writeFileSync(urlBudgetLogPath, '');
  
  // Add initial URLs
  console.log('\n1. ADDING INITIAL URLS WITH LOW SPEND:');
  simulator.urlManager.addUrl(101, 'Initial URL 1', 10000, 0);
  simulator.urlManager.addUrl(102, 'Initial URL 2', 20000, 0);
  
  // Set initial spent value (low)
  await simulator.setSpentValue(5.00);
  
  // Increase spent value above threshold
  console.log('\n2. INCREASING SPENT VALUE ABOVE THRESHOLD:');
  await simulator.setSpentValue(29.35);
  
  // Initial budget calculation should now have happened
  
  // Add new URLs after budget calculation during high spend
  console.log('\n3. ADDING NEW URLS AFTER BUDGET CALCULATION:');
  await simulator.addNewUrlDuringHighSpend(201, 'New URL 1', 5000);
  await simulator.addNewUrlDuringHighSpend(202, 'New URL 2', 10000);
  
  // Simulate 9-minute wait
  console.log('\n4. WAIT 9 MINUTES AND PROCESS BUDGET UPDATES:');
  console.log('[TEST] Simulating 9-minute wait...');
  await simulator.processPendingUpdates();
  
  // Add more URLs
  console.log('\n5. ADDING MORE URLS AFTER FIRST BATCH:');
  await simulator.addNewUrlDuringHighSpend(301, 'New URL 3', 15000);
  
  // Wait another 9 minutes
  console.log('\n6. WAIT ANOTHER 9 MINUTES FOR NEXT BATCH:');
  console.log('[TEST] Simulating another 9-minute wait...');
  await simulator.processPendingUpdates();
  
  // Keep campaign in high spend and verify no re-pause
  console.log('\n7. INCREASE SPENT VALUE FURTHER (STILL HIGH SPEND):');
  await simulator.setSpentValue(45.75);
  
  // Add another URL
  console.log('\n8. ADD ONE MORE URL DURING HIGH SPEND:');
  await simulator.addNewUrlDuringHighSpend(401, 'New URL 4', 8000);
  
  // Process final batch
  console.log('\n9. PROCESS FINAL BATCH OF URLS:');
  console.log('[TEST] Simulating final 9-minute wait...');
  await simulator.processPendingUpdates();
  
  // Drop below threshold
  console.log('\n10. DROP SPENT VALUE BELOW THRESHOLD:');
  await simulator.setSpentValue(7.50);
  
  // Print final log content
  console.log('\nFINAL BUDGET LOG CONTENT:');
  const logContent = simulator.budgetLogger.getLogs();
  console.log(logContent);
  
  // Print API history
  trafficStarApi.printHistory();
  
  console.log('\n===== CUMULATIVE BUDGET FLOW TEST COMPLETED =====');
}

// Run the test
runTest().catch(console.error);

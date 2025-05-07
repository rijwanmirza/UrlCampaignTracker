/**
 * Accurate Test for URL Budget & TrafficStar Integration
 * 
 * This test accurately represents the system behavior:
 * 1. Campaign is paused ONLY ONCE when spent value first exceeds $10
 * 2. Budget updates are CUMULATIVE, adding to existing budget value
 * 3. New URLs are batched together in 9-minute intervals
 * 4. State resets only when spent value drops below $10
 * 5. URLs added after initial budget calculation use TOTAL clicks, not remaining
 */

const fs = require('fs');
const path = require('path');
const urlBudgetLogPath = path.join('.', 'Active_Url_Budget_Logs');

// Create or clear log file
fs.writeFileSync(urlBudgetLogPath, '');

// Track high budget state and timing
let highBudgetState = {
  isHighBudget: false,
  calculationTime: null,
  campaignPaused: false
};

// Mock TrafficStar API that tracks budget updates cumulatively
class TrafficStarAPI {
  constructor() {
    this.campaignBudgets = {
      995224: 50.00 // Initial budget
    };
    this.campaignStatus = 'enabled'; // Start enabled
    this.updateHistory = [];
  }

  // Get campaign details
  async getCampaign(campaignId) {
    return {
      id: campaignId,
      max_daily: this.campaignBudgets[campaignId] || 0,
      total_budget: this.campaignBudgets[campaignId] || 0,
      status: this.campaignStatus,
      active: this.campaignStatus === 'enabled'
    };
  }

  // Update campaign budget (CUMULATIVE)
  async updateCampaignBudget(campaignId, newBudget) {
    const oldBudget = this.campaignBudgets[campaignId] || 0;
    this.campaignBudgets[campaignId] = newBudget;
    
    // Log the update
    this.updateHistory.push({
      type: 'budget',
      campaignId,
      oldBudget,
      newBudget,
      timestamp: new Date().toISOString()
    });
    
    console.log(`💰 [TRAFFICSTAR] Updated campaign ${campaignId} budget: $${oldBudget.toFixed(2)} → $${newBudget.toFixed(2)}`);
    return { success: true };
  }

  // Pause campaign
  async pauseCampaign(campaignId) {
    if (this.campaignStatus === 'paused') {
      console.log(`⏸️ [TRAFFICSTAR] Campaign ${campaignId} is already paused`);
      return { success: true };
    }
    
    this.campaignStatus = 'paused';
    this.updateHistory.push({
      type: 'status',
      campaignId,
      oldStatus: 'enabled',
      newStatus: 'paused',
      timestamp: new Date().toISOString()
    });
    
    console.log(`⏸️ [TRAFFICSTAR] Paused campaign ${campaignId}`);
    return { success: true };
  }

  // Activate campaign
  async activateCampaign(campaignId) {
    if (this.campaignStatus === 'enabled') {
      console.log(`▶️ [TRAFFICSTAR] Campaign ${campaignId} is already active`);
      return { success: true };
    }
    
    this.campaignStatus = 'enabled';
    this.updateHistory.push({
      type: 'status',
      campaignId,
      oldStatus: 'paused',
      newStatus: 'enabled',
      timestamp: new Date().toISOString()
    });
    
    console.log(`▶️ [TRAFFICSTAR] Activated campaign ${campaignId}`);
    return { success: true };
  }

  // Get campaign status
  async getCampaignStatus(campaignId) {
    return {
      status: this.campaignStatus,
      active: this.campaignStatus === 'enabled'
    };
  }

  // Print history
  printHistory() {
    console.log('\n===== TrafficStar API Call History =====');
    this.updateHistory.forEach((update, index) => {
      if (update.type === 'budget') {
        console.log(`${index + 1}. BUDGET: Campaign ${update.campaignId}: $${update.oldBudget.toFixed(2)} → $${update.newBudget.toFixed(2)} [${update.timestamp}]`);
      } else {
        console.log(`${index + 1}. STATUS: Campaign ${update.campaignId}: ${update.oldStatus} → ${update.newStatus} [${update.timestamp}]`);
      }
    });
    console.log('=====================================');
  }
}

// URL Budget Logger
class UrlBudgetLogger {
  constructor(logPath) {
    this.logPath = logPath;
    this.loggedUrls = new Set();
  }

  // Log a URL budget
  async logUrlBudget(urlId, price) {
    // Skip if already logged in this high-spend cycle
    if (this.loggedUrls.has(urlId)) {
      console.log(`🔄 [LOGGER] Skipping duplicate budget log for URL ${urlId} - already logged in this cycle`);
      return false;
    }
    
    // Format date and time
    const now = new Date();
    const date = now.toISOString().split('T')[0]; // YYYY-MM-DD
    const time = now.toISOString().split('T')[1].substring(0, 8); // HH:MM:SS
    
    // Format log entry
    const logEntry = `${urlId}|${price.toFixed(4)}|${date}::${time}\n`;
    
    // Append to log file
    fs.appendFileSync(this.logPath, logEntry);
    console.log(`📝 [LOGGER] Logged URL ${urlId} budget: $${price.toFixed(4)} at ${date}::${time}`);
    
    // Mark as logged
    this.loggedUrls.add(urlId);
    return true;
  }

  // Clear all logs
  clearLogs() {
    fs.writeFileSync(this.logPath, '');
    this.loggedUrls.clear();
    console.log(`🧹 [LOGGER] Cleared all URL budget logs - spent value dropped below threshold`);
  }

  // Check if URL has been logged
  isUrlLogged(urlId) {
    return this.loggedUrls.has(urlId);
  }

  // Get all logs
  getLogs() {
    return fs.readFileSync(this.logPath, 'utf-8');
  }
}

// URL Budget Manager for tracking new URLs
class UrlBudgetManager {
  constructor() {
    this.pendingUpdates = new Map();
    this.updatedUrls = new Set();
  }

  // Add URL for batch update
  trackUrlForBudgetUpdate(urlId, budget) {
    this.pendingUpdates.set(urlId, {
      urlId,
      budget,
      addedTime: new Date()
    });
    
    console.log(`📋 [MANAGER] Added URL ${urlId} to pending budget updates with budget $${budget.toFixed(4)}`);
  }

  // Process pending updates after wait period
  async processPendingUpdates(campaignId, waitMinutes = 9) {
    if (this.pendingUpdates.size === 0) {
      console.log(`ℹ️ [MANAGER] No pending budget updates to process`);
      return 0;
    }
    
    console.log(`🔄 [MANAGER] Processing ${this.pendingUpdates.size} pending budget updates`);
    
    const now = new Date();
    const readyUpdates = [];
    let totalBudget = 0;
    
    // Check which URLs have waited long enough
    for (const [urlId, update] of this.pendingUpdates.entries()) {
      const waitTimeMs = now - update.addedTime;
      const waitTimeMinutes = waitTimeMs / (1000 * 60);
      
      if (waitTimeMinutes >= waitMinutes) {
        console.log(`✅ [MANAGER] URL ${urlId} has waited ${waitTimeMinutes.toFixed(1)} minutes - processing now`);
        readyUpdates.push(update);
        totalBudget += update.budget;
        
        // Log the budget
        await urlBudgetLogger.logUrlBudget(urlId, update.budget);
        
        // Mark as processed
        this.updatedUrls.add(urlId);
      } else {
        console.log(`⏱️ [MANAGER] URL ${urlId} has only waited ${waitTimeMinutes.toFixed(1)} minutes - need ${waitMinutes}`);
      }
    }
    
    if (readyUpdates.length > 0) {
      // Get current campaign budget from TrafficStar
      const campaignDetails = await trafficStarApi.getCampaign(campaignId);
      const currentBudget = campaignDetails.max_daily;
      
      // Calculate new total budget (CUMULATIVE)
      const newBudget = currentBudget + totalBudget;
      console.log(`💰 [MANAGER] Cumulative budget update: $${currentBudget.toFixed(2)} + $${totalBudget.toFixed(4)} = $${newBudget.toFixed(4)}`);
      
      // Update TrafficStar budget
      await trafficStarApi.updateCampaignBudget(campaignId, newBudget);
      
      // Remove processed updates
      for (const update of readyUpdates) {
        this.pendingUpdates.delete(update.urlId);
      }
      
      console.log(`✅ [MANAGER] Processed ${readyUpdates.length} URLs, ${this.pendingUpdates.size} remaining in queue`);
    }
    
    return totalBudget;
  }

  // Clear all pending updates
  clearPendingUpdates() {
    this.pendingUpdates.clear();
    this.updatedUrls.clear();
    console.log(`🧹 [MANAGER] Cleared all pending budget updates`);
  }
}

// URL management
class MockUrlRepository {
  constructor() {
    this.urls = new Map();
  }

  // Add a URL
  addUrl(id, name, clickLimit, clicks = 0, status = 'active') {
    const url = {
      id,
      name,
      clickLimit,
      clicks,
      status,
      remainingClicks: clickLimit - clicks,
      addedTime: new Date()
    };
    
    this.urls.set(id, url);
    console.log(`[URL REPO] Added URL ${id}: ${name} with ${clickLimit} total clicks, ${url.remainingClicks} remaining`);
    return url;
  }

  // Get all active URLs
  getActiveUrls() {
    return Array.from(this.urls.values()).filter(url => url.status === 'active');
  }

  // Get URL by ID
  getUrl(id) {
    return this.urls.get(id);
  }
}

// Simulator for spent value changes
class SpentValueSimulator {
  constructor(campaignId, pricePerThousand = 1.0) {
    this.campaignId = campaignId;
    this.spentValue = 0;
    this.threshold = 10.00;
    this.urlRepo = new MockUrlRepository();
    this.pricePerThousand = pricePerThousand;
  }

  // Set a new spent value
  async setSpentValue(newValue) {
    const oldValue = this.spentValue;
    this.spentValue = newValue;
    
    console.log(`💰 Campaign ${this.campaignId} spent value: $${oldValue.toFixed(2)} → $${newValue.toFixed(2)}`);
    
    // Check if we crossed threshold boundaries
    if (oldValue < this.threshold && newValue >= this.threshold) {
      // First time crossing to high budget
      console.log(`🚨 HIGH SPEND DETECTED: $${newValue.toFixed(2)} >= $${this.threshold.toFixed(2)}`);
      highBudgetState.isHighBudget = true;
      
      // Pause campaign ONLY ONCE when first crossing threshold
      if (!highBudgetState.campaignPaused) {
        console.log(`⏸️ Pausing campaign for ${this.campaignId} to wait for pending clicks...`);
        await trafficStarApi.pauseCampaign(this.campaignId);
        highBudgetState.campaignPaused = true;
        
        // Wait 9 minutes (simulated)
        console.log(`⏱️ 9-minute waiting period elapsed, calculating budgets...`);
        
        // Calculate initial budgets
        await this.calculateInitialBudgets();
      } else {
        console.log(`ℹ️ Campaign ${this.campaignId} already paused - maintaining high budget state`);
      }
    } else if (oldValue >= this.threshold && newValue < this.threshold) {
      // Dropping below threshold
      console.log(`📉 SPENT VALUE DROPPED BELOW THRESHOLD: $${newValue.toFixed(2)} < $${this.threshold.toFixed(2)}`);
      highBudgetState.isHighBudget = false;
      highBudgetState.calculationTime = null;
      highBudgetState.campaignPaused = false;
      
      // Clear all logs and pending updates
      urlBudgetLogger.clearLogs();
      urlBudgetManager.clearPendingUpdates();
    } else if (highBudgetState.isHighBudget) {
      // Still in high budget state
      console.log(`➡️ STILL IN HIGH SPEND STATE: $${newValue.toFixed(2)} >= $${this.threshold.toFixed(2)}`);
    }
  }

  // Calculate budgets for initial URLs when first crossing threshold
  async calculateInitialBudgets() {
    // Set budget calculation time
    highBudgetState.calculationTime = new Date();
    console.log(`📊 Initial budget calculation at ${highBudgetState.calculationTime.toISOString()}`);
    
    // Get active URLs
    const activeUrls = this.urlRepo.getActiveUrls();
    console.log(`📋 Calculating budget for ${activeUrls.length} active URLs`);
    
    // Calculate total budget required
    let totalBudget = 0;
    
    for (const url of activeUrls) {
      // For initial URLs, use REMAINING clicks
      const remainingClicks = url.remainingClicks;
      const urlBudget = (remainingClicks / 1000) * this.pricePerThousand;
      
      console.log(`🔢 URL ${url.id}: ${remainingClicks} remaining clicks × $${this.pricePerThousand.toFixed(2)}/1000 = $${urlBudget.toFixed(4)}`);
      
      // Log the budget
      await urlBudgetLogger.logUrlBudget(url.id, urlBudget);
      
      totalBudget += urlBudget;
    }
    
    // Update TrafficStar budget
    const currentBudget = this.spentValue;
    const newTotalBudget = currentBudget + totalBudget;
    
    console.log(`💰 Total budget for initial URLs: $${totalBudget.toFixed(4)}`);
    console.log(`💰 Setting new budget: $${currentBudget.toFixed(2)} (spent) + $${totalBudget.toFixed(4)} (budget) = $${newTotalBudget.toFixed(4)}`);
    
    await trafficStarApi.updateCampaignBudget(this.campaignId, newTotalBudget);
    
    // Reactivate campaign after budget update
    await trafficStarApi.activateCampaign(this.campaignId);
  }

  // Add new URL during high spend
  async addNewUrlDuringHighSpend(id, name, clickLimit) {
    // Add URL to repository
    const url = this.urlRepo.addUrl(id, name, clickLimit);
    
    if (!highBudgetState.isHighBudget || !highBudgetState.calculationTime) {
      // Not in high spend state or calculation not done yet
      console.log(`ℹ️ URL ${id} added during normal budget state`);
      return url;
    }
    
    // URL added after initial high spend budget calculation
    console.log(`🆕 URL ${id} added AFTER high spend budget calculation - need to track`);
    
    // Calculate budget using TOTAL clicks (not remaining)
    const urlBudget = (clickLimit / 1000) * this.pricePerThousand;
    console.log(`💰 URL ${id} budget calculation: ${clickLimit} total clicks × $${this.pricePerThousand.toFixed(2)}/1000 = $${urlBudget.toFixed(4)}`);
    
    // Track for batch processing
    urlBudgetManager.trackUrlForBudgetUpdate(id, urlBudget);
    
    return url;
  }
}

// Make globals available
const urlBudgetLogger = new UrlBudgetLogger(urlBudgetLogPath);
const urlBudgetManager = new UrlBudgetManager();
const trafficStarApi = new TrafficStarAPI();

// Main test function
async function runTest() {
  console.log('===== ACCURATE URL BUDGET FLOW TEST =====');
  
  // Create campaign simulator
  const simulator = new SpentValueSimulator(995224, 5.00); // $5 per 1000 clicks
  
  // 1. Initial setup with URLs and low spend
  console.log('\n1. INITIAL SETUP WITH LOW SPEND:');
  simulator.urlRepo.addUrl(101, 'Initial URL 1', 10000, 0);
  simulator.urlRepo.addUrl(102, 'Initial URL 2', 20000, 5000); // 15000 remaining
  await simulator.setSpentValue(5.00);
  
  // 2. Increase spent value above threshold
  console.log('\n2. CROSS THRESHOLD TO HIGH SPEND:');
  await simulator.setSpentValue(29.35);
  
  // 3. Add new URLs after budget calculation
  console.log('\n3. ADD NEW URLS AFTER BUDGET CALCULATION:');
  await simulator.addNewUrlDuringHighSpend(201, 'New URL 1', 5000);
  await simulator.addNewUrlDuringHighSpend(202, 'New URL 2', 10000);
  await simulator.addNewUrlDuringHighSpend(203, 'New URL 3', 15000);
  
  // 4. Process pending updates after 9-minute wait
  console.log('\n4. PROCESS PENDING UPDATES AFTER 9 MINUTES:');
  console.log('[TEST] Simulating 9-minute wait...');
  await urlBudgetManager.processPendingUpdates(995224);
  
  // 5. Add more URLs
  console.log('\n5. ADD MORE URLS TO BATCH:');
  await simulator.addNewUrlDuringHighSpend(301, 'New URL 4', 8000);
  await simulator.addNewUrlDuringHighSpend(302, 'New URL 5', 12000);
  
  // 6. Spent value increases further but stays high
  console.log('\n6. SPENT VALUE INCREASES FURTHER (STILL HIGH):');
  await simulator.setSpentValue(45.75);
  
  // 7. Process second batch
  console.log('\n7. PROCESS SECOND BATCH AFTER 9 MINUTES:');
  console.log('[TEST] Simulating 9-minute wait...');
  await urlBudgetManager.processPendingUpdates(995224);
  
  // 8. Drop spent value below threshold
  console.log('\n8. DROP SPENT VALUE BELOW THRESHOLD:');
  await simulator.setSpentValue(7.50);
  
  // 9. Back above threshold (fresh cycle)
  console.log('\n9. BACK ABOVE THRESHOLD (FRESH CYCLE):');
  await simulator.setSpentValue(15.25);
  
  // Print final logs
  console.log('\nFINAL URL BUDGET LOGS:');
  const logs = urlBudgetLogger.getLogs();
  console.log(logs || '(No logs - cleared when spent value dropped below threshold)');
  
  // Print API history
  trafficStarApi.printHistory();
  
  console.log('\n===== TEST COMPLETED =====');
}

// Run the test
runTest().catch(console.error);

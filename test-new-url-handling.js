// Test script to test special handling of URLs added after budget calculation
import fs from 'fs';
import path from 'path';

// Set to track URLs that have already been logged
const loggedUrlIds = new Set();
// Timestamp to mark when high spend budget was calculated
let highSpendBudgetCalcTime = null;
// Set to track URLs that were added after budget calculation
const newUrlsAfterCalc = new Set();
// Price per thousand used for calculations
const pricePerThousand = 5.00; // $5 per 1000 clicks

// Function to log URL budgets with deduplication
function logUrlBudget(urlId, url, isNewUrl = false) {
  const logFilePath = 'Active_Url_Budget_Logs';
  
  // Skip if this URL has already been logged
  if (loggedUrlIds.has(urlId)) {
    console.log(`🔄 Skipping duplicate URL budget log for URL ID ${urlId} - already logged`);
    return false;
  }
  
  // Calculate price based on whether this is a new URL or existing URL
  let price;
  if (isNewUrl) {
    // For new URLs, use TOTAL clicks (not remaining)
    price = (url.clickLimit / 1000) * pricePerThousand;
    console.log(`ℹ️ URL ID ${urlId} is NEW after budget calculation - using TOTAL clicks (${url.clickLimit})`);
  } else {
    // For existing URLs, use REMAINING clicks
    const remainingClicks = url.clickLimit - url.clicks;
    price = (remainingClicks / 1000) * pricePerThousand;
    console.log(`ℹ️ URL ID ${urlId} existed before budget calculation - using REMAINING clicks (${remainingClicks})`);
  }
  
  // Format date and time
  const now = new Date();
  const date = now.toISOString().split('T')[0]; // YYYY-MM-DD
  const time = now.toISOString().split('T')[1].substring(0, 8); // HH:MM:SS
  
  // Format the log entry: UrlId|Price|Date::Time
  const logEntry = `${urlId}|${price.toFixed(4)}|${date}::${time}\n`;

  // Append to log file
  fs.appendFileSync(logFilePath, logEntry);
  console.log(`📝 Logged URL budget for URL ID ${urlId}: $${price.toFixed(4)} at ${date}::${time}`);
  
  // Add to set of logged URLs
  loggedUrlIds.add(urlId);
  return true;
}

// Function to simulate adding a new URL
function addNewUrl(urlId, name, clickLimit, clicks = 0) {
  const url = { id: urlId, name, clickLimit, clicks, createdAt: new Date() };
  
  // If budget calculation has already happened, add to the new URLs set
  if (highSpendBudgetCalcTime && url.createdAt > highSpendBudgetCalcTime) {
    newUrlsAfterCalc.add(urlId);
    console.log(`🆕 URL ID ${urlId} added AFTER budget calculation - will be batched`);
  }
  
  return url;
}

// Test special handling of URLs added after budget calculation
console.log('===== TESTING SPECIAL HANDLING OF URLS ADDED AFTER BUDGET CALCULATION =====');

// Clear existing logs
fs.writeFileSync('Active_Url_Budget_Logs', '');
console.log('🧹 Cleared existing logs');

// 1. Initial set of URLs before high spend detection
console.log('\n1. INITIAL URLS BEFORE HIGH SPEND:');
const url101 = addNewUrl(101, 'Initial URL 1', 1000, 100); // 900 remaining
const url102 = addNewUrl(102, 'Initial URL 2', 2000, 500); // 1500 remaining

// 2. Simulate high spend detection and budget calculation
console.log('\n2. HIGH SPEND DETECTED - PERFORMING BUDGET CALCULATION:');
highSpendBudgetCalcTime = new Date();
console.log(`ℹ️ Budget calculation performed at ${highSpendBudgetCalcTime.toISOString()}`);
console.log(`ℹ️ Logging budgets for INITIAL URLs (using REMAINING clicks):`);

// Log budgets for initial URLs
logUrlBudget(url101.id, url101);
logUrlBudget(url102.id, url102);

// 3. Add new URLs after budget calculation
console.log('\n3. ADDING NEW URLS AFTER BUDGET CALCULATION:');
// Simulate waiting 1 minute
const url201 = addNewUrl(201, 'New URL 1', 3000, 0);
const url202 = addNewUrl(202, 'New URL 2', 4000, 0);
const url203 = addNewUrl(203, 'New URL 3', 5000, 0);

// 4. Simulate 9-minute delay elapsed, now process new URLs
console.log('\n4. 9-MINUTE DELAY ELAPSED - PROCESSING NEW URLS:');
console.log(`ℹ️ Found ${newUrlsAfterCalc.size} URLs added after budget calculation`);

// Log budgets for new URLs
for (const urlId of newUrlsAfterCalc) {
  const url = [url201, url202, url203].find(u => u.id === urlId);
  if (url) {
    logUrlBudget(url.id, url, true);
  }
}

// Display log file contents
console.log('\nFINAL LOG FILE CONTENTS:');
const logContents = fs.readFileSync('Active_Url_Budget_Logs', 'utf-8');
console.log(logContents);

console.log('\n===== NEW URL HANDLING TESTING COMPLETED =====');
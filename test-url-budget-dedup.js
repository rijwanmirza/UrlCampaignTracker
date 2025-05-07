// Test script to test URL budget logger deduplication functionality
import fs from 'fs';
import path from 'path';

// Set to track URLs that have already been logged
const loggedUrlIds = new Set();

// Function to log URL budgets with deduplication
function logUrlBudget(urlId, price) {
  const logFilePath = 'Active_Url_Budget_Logs';
  
  // Skip if this URL has already been logged
  if (loggedUrlIds.has(urlId)) {
    console.log(`🔄 Skipping duplicate URL budget log for URL ID ${urlId} - already logged`);
    return false;
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

// Test URL budget logging with deduplication
console.log('===== TESTING URL BUDGET LOGGING WITH DEDUPLICATION =====');

// Clear existing logs
fs.writeFileSync('Active_Url_Budget_Logs', '');
console.log('🧹 Cleared existing logs');

// Log some initial URLs
console.log('\n1. INITIAL URLS:');
logUrlBudget(101, 5.2500);
logUrlBudget(102, 10.7500);
logUrlBudget(103, 15.8750);

// Try to log the same URLs again (should be deduplicated)
console.log('\n2. ATTEMPTING TO LOG DUPLICATE URLS:');
logUrlBudget(101, 99.9999); // Should be skipped
logUrlBudget(102, 88.8888); // Should be skipped
logUrlBudget(104, 22.2222); // New URL, should be logged

// Display the log file contents
console.log('\nCURRENT LOG FILE CONTENTS:');
const logContents = fs.readFileSync('Active_Url_Budget_Logs', 'utf-8');
console.log(logContents);

// Simulate clearing logs when spent value drops below $10
console.log('\n3. SIMULATING SPENT VALUE DROPPING BELOW $10:');
fs.writeFileSync('Active_Url_Budget_Logs', '');
loggedUrlIds.clear(); // Clear the tracking set
console.log('🧹 Cleared logs and reset tracking (spent value < $10)');

// After clearing, try logging the same URLs again (should work now)
console.log('\n4. LOGGING SAME URLS AFTER CLEARING:');
logUrlBudget(101, 5.2500); // Should work now
logUrlBudget(102, 10.7500); // Should work now

// Display final log file contents
console.log('\nFINAL LOG FILE CONTENTS:');
const finalLogContents = fs.readFileSync('Active_Url_Budget_Logs', 'utf-8');
console.log(finalLogContents);

console.log('\n===== DEDUPLICATION TESTING COMPLETED =====');
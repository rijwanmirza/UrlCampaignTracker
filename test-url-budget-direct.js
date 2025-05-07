// Test script to directly test URL budget logger functionality
import fs from 'fs';
import path from 'path';

// Function to log URL budgets
function logUrlBudget(urlId, price) {
  const logFilePath = 'Active_Url_Budget_Logs';
  
  // Format date and time
  const now = new Date();
  const date = now.toISOString().split('T')[0]; // YYYY-MM-DD
  const time = now.toISOString().split('T')[1].substring(0, 8); // HH:MM:SS
  
  // Format the log entry: UrlId|Price|Date::Time
  const logEntry = `${urlId}|${price.toFixed(4)}|${date}::${time}\n`;

  // Append to log file
  fs.appendFileSync(logFilePath, logEntry);
  console.log(`Logged URL budget for URL ID ${urlId}: $${price.toFixed(4)} at ${date}::${time}`);
}

// Test URL budget logging with multiple URLs and different conditions
console.log('===== TESTING URL BUDGET LOGGING =====');

// Clear existing logs
fs.writeFileSync('Active_Url_Budget_Logs', '');
console.log('Cleared existing logs');

// Condition 1: Initial high spend detection with multiple URLs
console.log('\n1. INITIAL HIGH SPEND DETECTION:');
logUrlBudget(101, 5.2500);
logUrlBudget(102, 10.7500);
logUrlBudget(103, 15.8750);

// Condition 2: Newly added URLs after high spend detection
console.log('\n2. NEWLY ADDED URLS AFTER HIGH SPEND:');
logUrlBudget(201, 12.0000);
logUrlBudget(202, 18.5000);

// Display the log file contents
console.log('\nCURRENT LOG FILE CONTENTS:');
const logContents = fs.readFileSync('Active_Url_Budget_Logs', 'utf-8');
console.log(logContents);

// Condition 3: Spent value drops below $10, logs are cleared
console.log('\n3. SPENT VALUE DROPS BELOW $10:');
fs.writeFileSync('Active_Url_Budget_Logs', '');
console.log('Cleared logs (spent value < $10)');

// Condition 4: High spend detected again later
console.log('\n4. HIGH SPEND DETECTED AGAIN LATER:');
logUrlBudget(301, 7.5000);
logUrlBudget(302, 9.2500);

// Display final log file contents
console.log('\nFINAL LOG FILE CONTENTS:');
const finalLogContents = fs.readFileSync('Active_Url_Budget_Logs', 'utf-8');
console.log(finalLogContents);

console.log('\n===== TESTING COMPLETED =====');
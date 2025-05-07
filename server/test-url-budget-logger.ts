import urlBudgetLogger from './url-budget-logger';

/**
 * Test function to verify URL budget logger functionality
 */
async function testUrlBudgetLogger() {
  console.log('Starting URL budget logger test...');
  
  // Clear logs at the beginning to start fresh
  await urlBudgetLogger.clearLogs();
  console.log('Cleared logs at the beginning of the test');
  
  // Simulate high-spend cycle (spent value > $10)
  console.log('\n--- SIMULATING HIGH SPEND CYCLE (>$10) ---');
  
  // Log multiple URLs in the first high-spend cycle
  await urlBudgetLogger.logUrlBudget(101, 50.1234);
  await urlBudgetLogger.logUrlBudget(102, 25.5678);
  await urlBudgetLogger.logUrlBudget(103, 10.9876);
  
  // Try to log the same URLs again - should be skipped
  console.log('\n--- TRYING TO LOG SAME URLS AGAIN (SHOULD BE SKIPPED) ---');
  await urlBudgetLogger.logUrlBudget(101, 51.0000); // Should be skipped
  await urlBudgetLogger.logUrlBudget(102, 26.0000); // Should be skipped
  
  // Add a new URL during the same high-spend cycle
  console.log('\n--- ADDING NEW URL IN SAME HIGH SPEND CYCLE ---');
  await urlBudgetLogger.logUrlBudget(104, 15.4321); // Should be logged
  
  // Read and display the logs
  console.log('\n--- CURRENT LOGS AFTER FIRST HIGH SPEND CYCLE ---');
  const logsAfterFirstCycle = await urlBudgetLogger.getUrlBudgetLogs();
  console.log(logsAfterFirstCycle);
  
  // Simulate spent value dropping below $10
  console.log('\n--- SIMULATING SPENT VALUE DROPPING BELOW $10 ---');
  await urlBudgetLogger.clearLogs();
  console.log('Cleared logs as spent value dropped below $10');
  
  // Read and display logs after clearing
  console.log('\n--- LOGS AFTER CLEARING (SHOULD BE EMPTY) ---');
  const logsAfterClearing = await urlBudgetLogger.getUrlBudgetLogs();
  console.log(logsAfterClearing);
  
  // Simulate new high-spend cycle (spent value > $10 again)
  console.log('\n--- SIMULATING NEW HIGH SPEND CYCLE (>$10) ---');
  
  // Log URLs in the new high-spend cycle - including previously logged URLs
  await urlBudgetLogger.logUrlBudget(101, 55.1234); // Should be logged in new cycle
  await urlBudgetLogger.logUrlBudget(102, 28.5678); // Should be logged in new cycle
  await urlBudgetLogger.logUrlBudget(105, 18.7654); // New URL
  
  // Read and display the logs after new cycle
  console.log('\n--- LOGS AFTER NEW HIGH SPEND CYCLE ---');
  const logsAfterNewCycle = await urlBudgetLogger.getUrlBudgetLogs();
  console.log(logsAfterNewCycle);
  
  console.log('\nURL budget logger test completed');
}

// Execute the test
testUrlBudgetLogger().catch(error => {
  console.error('Error running URL budget logger test:', error);
});
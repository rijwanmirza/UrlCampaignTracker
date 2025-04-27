#!/bin/bash

# Run-Tests
# This script runs all the test scripts to verify system functionality

echo "===== URL Campaign Manager Tests ====="
echo ""

# Function to run a test and check its exit code
run_test() {
  test_name=$1
  test_script=$2
  
  echo "Running test: $test_name"
  echo "------------------------"
  
  # Run the test script
  node $test_script
  
  # Check the exit code
  if [ $? -eq 0 ]; then
    echo "✅ Test passed: $test_name"
  else
    echo "❌ Test failed: $test_name"
  fi
  
  echo ""
}

# Run all tests
run_test "Click Protection Test" "test-click-protection.js"
run_test "URL Budget Test" "test-url-budget.js"
run_test "URL Budget Fixed Test" "test-url-budget-fixed.js"
run_test "Spent Value Workflow Test" "test-spent-value-workflow.js"

echo "===== All Tests Completed ====="
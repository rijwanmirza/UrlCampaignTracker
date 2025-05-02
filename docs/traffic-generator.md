# Traffic Generator Post-Pause Feature Implementation Plan

This document outlines the implementation plan for the Traffic Generator post-pause feature. The feature will check campaign status after pausing, wait for a configurable time, and then apply different actions based on the TrafficStar spent value.

## Phase 1: Database Schema & Migration
- [ ] Add necessary fields to the schema in `shared/schema.ts`:
  - `trafficGeneratorWaitMinutes`: number (default: 2)
  - `trafficGeneratorState`: enum (idle, waiting, condition1, condition2)
  - `lastTrafficGeneratorAction`: timestamp
  - `trafficGeneratorUrlsBudgeted`: JSON array of URL IDs
  - `trafficGeneratorCurrentDailyBudget`: number (for tracking current budget)
- [ ] Create migration script to add these fields to the database
- [ ] Run the migration to update the existing database

## Phase 2: Core Utility Functions
- [ ] Create utility functions for:
  - Wait functionality (`waitForMinutes()`)
  - Time formatting (`getTodayEndTime()`, `getCurrentUtcTime()`)
  - Status monitoring (`startStatusMonitoring()`)
  - Budget calculation (`calculateRequiredBudget()`)
- [ ] Implement shared utilities that will be used across both conditions
- [ ] Add proper error handling and logging

## Phase 3: Wait & Check Logic
- [ ] Implement the post-pause workflow handler
- [ ] Add configurable wait period functionality
- [ ] Create spent value checking logic
- [ ] Implement condition selection based on spent value
- [ ] Set up scheduling mechanism for periodic checks

## Phase 4: Condition #1 Implementation (<$10)
- [ ] Implement remaining clicks checking (>15,000 threshold)
- [ ] Add campaign start logic with proper end time
- [ ] Create status verification system (check every minute)
- [ ] Implement remaining clicks monitoring
- [ ] Add pause logic when clicks reach ≤5,000
- [ ] Create cycle restart functionality

## Phase 5: Condition #2 Implementation (≥$10)
- [ ] Implement budget calculation logic
- [ ] Add daily budget updating functionality
- [ ] Create URL budget tracking system
- [ ] Implement status verification (check every minute)

## Phase 6: Advanced Budget Management
- [ ] Implement high budget mode (≥$50 daily budget)
- [ ] Create logic to wait for spent value threshold
- [ ] Implement bulk budget updates when threshold reached
- [ ] Add URL budget tracking to prevent duplicates
- [ ] Create periodic budget update for new URLs

## Phase 7: Campaign Toggle & UI
- [ ] Implement toggle behavior for enabling/disabling
- [ ] Add reset logic when feature is toggled
- [ ] Create UI components for settings
- [ ] Add configurable wait time input
- [ ] Create monitoring display for current state

## Phase 8: Testing & Integration
- [ ] Create comprehensive test scenarios
- [ ] Implement logging for each critical step
- [ ] Test all conditions and edge cases
- [ ] Verify proper state transitions

## Notes:
- TrafficStar campaign status should always be checked in real-time without caching
- End time should be set to current UTC date with time 23:59 when starting campaigns
- Status verification must run every minute to ensure campaigns are in the correct state
- For Condition #1: Campaign runs until remaining clicks ≤ 5,000, then pauses
- For Condition #2: Daily budget updates depend on whether budget is ≥ $50
  - If budget < $50: Use 10-minute periodic updates
  - If budget ≥ $50: Wait until spent value reaches (budget - $1)

## Feature Requirements

### Core Functionality
1. **Configurable Wait Period After Pause**
   - After a campaign is paused, wait for a specified time (default: 2 minutes)
   - User can configure this wait time (1-5+ minutes) via UI

2. **TrafficStar Spent Value Check**
   - After the wait period, check the campaign's TrafficStar spent value
   - Use existing TrafficStar spent tracking functionality

3. **Intelligent Decision Logic**
   - Apply different actions based on the spent value ($10 threshold)
   - Two distinct workflows for low-spend vs high-spend campaigns

### Workflow #1: When Spent Value < $10
4. **Remaining Clicks Management**
   - Check if campaign's remaining clicks > 15,000
   - If yes, START the campaign via TrafficStar API
   - Set campaign end time to current UTC date with time 23:59
   - Continue until remaining clicks ≤ 5,000
   - When clicks reach threshold, PAUSE campaign
   - Restart cycle when clicks go above 15,000 again
   - Continue this cycle until spent value exceeds $10

5. **Status Verification**
   - Check campaign status EVERY MINUTE
   - For started campaigns, ensure they are actually running
   - For paused campaigns, ensure they are actually paused
   - Send additional API calls as needed to correct status

### Workflow #2: When Spent Value ≥ $10
6. **Budget Management**
   - Calculate required budget: campaign price/1000 × remaining clicks
   - Add this calculated budget to current spent value
   - Update TrafficStar daily budget to this combined amount
   - START campaign with end time set to current UTC date with time 23:59
   - Track which URLs have had budget allocated

7. **New URL Budget Handling**
   - When new URLs are added, check if daily budget < $50:
     - Wait 10 minutes
     - Calculate additional budget for all pending URLs
     - Add to existing daily budget
     - Mark these URLs as budgeted
   - When daily budget ≥ $50:
     - Disable 10-minute period updates
     - Wait until spent value reaches (current budget - $1)
     - Example: If budget is $50, wait until spent equals $49
     - Then add all pending URL budgets at once
     - Recalculate budget threshold after each update

8. **Duplicate Budget Prevention**
   - Track which URLs have had budget added
   - Never add budget twice for the same URL

### Toggle Behavior
9. **Feature Reset Logic**
   - When Traffic Generator is enabled/disabled, reset all processes
   - When enabled, check campaign status first
   - If running, pause it first before starting workflow
   - If already paused, start workflow immediately
   - When disabled, stop all monitoring processes

### User Interface Requirements
10. **Settings Controls**
    - Toggle switch to enable/disable Traffic Generator
    - Input field for wait time (1-5+ minutes)
    - Status indicator showing current state

11. **Monitoring Display**
    - Show current condition being applied (Workflow #1 or #2)
    - Display remaining clicks, spent value, and daily budget
    - Indicate budget management mode (10-minute or high budget mode)
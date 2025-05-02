/**
 * Traffic Generator Post-Pause Feature
 * 
 * This file implements the Traffic Generator post-pause feature, which:
 * 1. Checks campaign status after pausing
 * 2. Waits for a configurable time (default: 2 minutes)
 * 3. Checks TrafficStar spent value 
 * 4. Applies different actions based on spent value:
 *    - If < $10: Uses remaining clicks thresholds to start/pause campaigns
 *    - If ≥ $10: Uses budget management approach
 * 
 * See docs/traffic-generator.md for full implementation plan and details.
 */

import { db } from './db';
import { campaigns, Campaign } from '@shared/schema';
import { eq } from 'drizzle-orm';
import { trafficStarService } from './trafficstar-service-new';
import { storage } from './storage';

// Use the log function from vite.ts instead of a separate logger
import { log } from './vite';

// State enum for traffic generator
export enum TrafficGeneratorState {
  IDLE = 'idle',
  WAITING = 'waiting',
  CONDITION_ONE = 'condition1',
  CONDITION_TWO = 'condition2'
}

/**
 * Initialize the Traffic Generator scheduler
 * This runs on server startup to set up periodic checks
 */
export async function initializeTrafficGenerator() {
  log('Initializing Traffic Generator scheduler');
  
  // Run an immediate check on startup
  await runTrafficGeneratorForAllCampaigns();
  
  // Schedule checks every 5 minutes
  setInterval(async () => {
    log('Running scheduled traffic generator check (every 5 minutes)');
    await runTrafficGeneratorForAllCampaigns();
  }, 5 * 60 * 1000);
  
  log('Traffic Generator scheduler initialized successfully');
}

/**
 * Main function to run the Traffic Generator check for all campaigns
 * Finds all campaigns with the feature enabled and processes them
 * This function is exported and used by the API routes
 */
export async function runTrafficGeneratorForAllCampaigns() {
  try {
    // Find all campaigns with traffic generator enabled
    const enabledCampaigns = await db
      .select()
      .from(campaigns)
      .where(eq(campaigns.trafficGeneratorEnabled, true));
    
    log(`Processing ${enabledCampaigns.length} campaigns with traffic generator enabled`);
    
    // Process each campaign
    for (const campaign of enabledCampaigns) {
      await processTrafficGenerator(campaign.id);
    }
  } catch (error) {
    log(`Error running traffic generator check: ${error}`, 'error');
  }
}

/**
 * Process a specific campaign with Traffic Generator
 * This function can be called directly via API for a single campaign
 * @param campaignId The ID of the campaign to process
 */
export async function processTrafficGenerator(campaignId: number) {
  try {
    // Get the campaign
    const campaign = await storage.getCampaign(campaignId);
    
    if (!campaign) {
      log(`Campaign ${campaignId} not found, cannot process traffic generator`, 'error');
      return;
    }
    
    // Check if the traffic generator is enabled for this campaign
    if (!campaign.trafficGeneratorEnabled) {
      log(`Traffic Generator is not enabled for campaign ${campaignId}, skipping`, 'warn');
      return;
    }
    
    await processTrafficGeneratorCampaign(campaign);
  } catch (error) {
    log(`Error processing traffic generator for campaign ${campaignId}: ${error}`, 'error');
  }
}

/**
 * Process a single campaign with Traffic Generator
 * This is the internal implementation for handling an individual campaign
 */
async function processTrafficGeneratorCampaign(campaign: Campaign) {
  try {
    // If the campaign has no TrafficStar ID, skip it
    if (!campaign.trafficstarCampaignId) {
      log(`Campaign ${campaign.id} has no TrafficStar ID, skipping traffic generator`, 'warn');
      return;
    }
    
    log(`TRAFFIC-GENERATOR: Getting REAL-TIME status for campaign ${campaign.trafficstarCampaignId}`, 'info');
    
    // Get the REAL-TIME status of the TrafficStar campaign (no caching)
    const status = await getRealTimeTrafficStarCampaignStatus(campaign.trafficstarCampaignId);
    log(`TRAFFIC-GENERATOR: TrafficStar campaign ${campaign.trafficstarCampaignId} REAL status is ${status.status}, active=${status.active}`, 'info');
    
    // If we just enabled Traffic Generator and campaign is active, pause it first
    if (campaign.trafficGeneratorEnabled && 
        (status.status === 'enabled' || status.status === 'active' || status.active)) {
      log(`Campaign ${campaign.id} is active but Traffic Generator is enabled - ensuring it's paused`, 'info');
      try {
        await trafficStarService.updateCampaignStatus(campaign.trafficstarCampaignId, 'paused');
        log(`Successfully paused campaign ${campaign.trafficstarCampaignId} as part of Traffic Generator process`, 'info');
        
        // Update the status for later processing
        status.status = 'paused';
        status.active = false;
        
        // Verify the campaign is actually paused
        const verifyStatus = await getRealTimeTrafficStarCampaignStatus(campaign.trafficstarCampaignId);
        if (verifyStatus.active === true || verifyStatus.status !== 'paused') {
          const errorMsg = `Failed to verify campaign ${campaign.trafficstarCampaignId} is paused - API reports status=${verifyStatus.status}, active=${verifyStatus.active}`;
          log(errorMsg, 'error');
          throw new Error(errorMsg);
        }
      } catch (error) {
        // This is a critical error - Traffic Generator requires campaigns to be paused
        const errorMsg = `Critical: Failed to pause campaign ${campaign.trafficstarCampaignId}: ${error}`;
        log(errorMsg, 'error');
        throw new Error(errorMsg);
      }
    }
    
    // Phase 3: Post-Pause Workflow Logic
    // Check current state of the campaign
    if (!campaign.trafficGeneratorState) {
      // Initialize state if not set
      await updateCampaignTrafficGeneratorState(campaign.id, TrafficGeneratorState.IDLE);
      log(`Initialized Traffic Generator state for campaign ${campaign.id} to IDLE`, 'info');
      return;
    }
    
    // Check if campaign is in IDLE state - could be from re-enabling or being paused
    if (campaign.trafficGeneratorState === TrafficGeneratorState.IDLE) {
      // For recently re-enabled or paused campaigns, start processing
      log(`Campaign ${campaign.id} is in IDLE state - starting wait period for processing`, 'info');
      
      // Start waiting period
      const waitStartTime = new Date();
      const waitMinutes = campaign.trafficGeneratorWaitMinutes || 2; // Use configured wait time or default to 2
      
      log(`Using configured wait time of ${waitMinutes} minutes`, 'info');
      
      // Update campaign state to WAITING
      await updateCampaignTrafficGeneratorState(
        campaign.id, 
        TrafficGeneratorState.WAITING,
        waitStartTime,
        waitMinutes
      );
      
      log(`Campaign ${campaign.id} entering WAITING state for ${waitMinutes} minutes from ${waitStartTime.toISOString()}`, 'info');
      return;
    }
    
    // If campaign is in WAITING state, check if wait time has passed
    if (campaign.trafficGeneratorState === TrafficGeneratorState.WAITING) {
      // Check if the specified wait time has elapsed
      const hasWaitTimePassed = waitForMinutes(
        campaign.trafficGeneratorWaitStartTime,
        campaign.trafficGeneratorWaitMinutes || 2 // Default to 2 minutes if not specified
      );
      
      if (!hasWaitTimePassed) {
        log(`Campaign ${campaign.id} still waiting - ${campaign.trafficGeneratorWaitMinutes || 2} minutes not yet passed`, 'info');
        return;
      }
      
      log(`Wait period completed for campaign ${campaign.id} - checking TrafficStar spent value`, 'info');
      
      // Get campaign's spent value for today
      const today = new Date();
      const formattedDate = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-${String(today.getDate()).padStart(2, '0')}`;
      
      try {
        // Get today's spent value for the campaign
        const spentValue = await trafficStarService.getCampaignSpent(
          campaign.trafficstarCampaignId as string,
          formattedDate,
          formattedDate
        );
        
        log(`Campaign ${campaign.id} spent value for today (${formattedDate}): $${spentValue}`, 'info');
        
        // Determine which condition to apply based on spent value
        if (spentValue < 10) {
          // Update campaign state to CONDITION_ONE
          await updateCampaignTrafficGeneratorState(campaign.id, TrafficGeneratorState.CONDITION_ONE);
          log(`Campaign ${campaign.id} entering CONDITION_ONE (spent < $10)`, 'info');
        } else {
          // Update campaign state to CONDITION_TWO
          await updateCampaignTrafficGeneratorState(campaign.id, TrafficGeneratorState.CONDITION_TWO);
          log(`Campaign ${campaign.id} entering CONDITION_TWO (spent >= $10)`, 'info');
        }
        
        // Process the appropriate condition in the next cycle
        return;
      } catch (error) {
        log(`Error getting spent value for campaign ${campaign.id}: ${error}`, 'error');
        
        // If we can't get the spent value, default to Condition #1 for safety
        await updateCampaignTrafficGeneratorState(campaign.id, TrafficGeneratorState.CONDITION_ONE);
        log(`Campaign ${campaign.id} defaulting to CONDITION_ONE due to error getting spent value`, 'warn');
        return;
      }
    }
    
    // Process based on current state
    if (campaign.trafficGeneratorState === TrafficGeneratorState.CONDITION_ONE) {
      // Process Condition #1
      await processConditionOne(campaign, status);
    } else if (campaign.trafficGeneratorState === TrafficGeneratorState.CONDITION_TWO) {
      // Process Condition #2
      await processConditionTwo(campaign, status);
    }
    
    // Check for any pending URL budgets that need to be applied
    // This is separate from the main condition flow and runs on every check
    if (campaign.pendingUrlBudgets && Object.keys(campaign.pendingUrlBudgets).length > 0) {
      await processPendingUrlBudgets(campaign);
    }

  } catch (error) {
    log(`Error processing traffic generator for campaign ${campaign.id}: ${error}`, 'error');
  }
}

/**
 * Get the real-time status of a TrafficStar campaign
 * This bypasses any caching to ensure we have the actual current status
 */
async function getRealTimeTrafficStarCampaignStatus(campaignId: string): Promise<{ status: string, active: boolean }> {
  try {
    log(`REAL-TIME STATUS CHECK: Getting current status for TrafficStar campaign ${campaignId}`, 'info');
    log(`REAL-TIME CHECK: Bypassing cache to get ACTUAL status of TrafficStar campaign ${campaignId}`, 'info');
    
    const campaign = await trafficStarService.getCampaign(campaignId, true);
    
    if (!campaign) {
      log(`Failed to get real-time status for TrafficStar campaign ${campaignId}`, 'error');
      return { status: 'unknown', active: false };
    }
    
    // Determine if campaign is active based on status
    // TrafficStar uses 'enabled' status, but we need to check if it's active too
    const isActive = (campaign.status === 'active' || campaign.status === 'enabled') && campaign.active === true;
    
    log(`REAL STATUS: TrafficStar campaign ${campaignId} status=${campaign.status}, active=${isActive}`, 'info');
    
    return {
      status: campaign.status,
      active: isActive
    };
  } catch (error) {
    log(`Error getting real-time status for TrafficStar campaign ${campaignId}: ${error}`, 'error');
    return { status: 'error', active: false };
  }
}

// --- Phase 2: Core Utility Functions ---

/**
 * Check if the specified number of minutes has passed since a timestamp
 * @param startTime The starting timestamp
 * @param minutes The number of minutes to wait
 * @returns True if the specified number of minutes has passed
 */
export function waitForMinutes(startTime: Date, minutes: number): boolean {
  if (!startTime) return true;
  
  const now = new Date();
  const waitTimeMs = minutes * 60 * 1000;
  const elapsedMs = now.getTime() - startTime.getTime();
  
  return elapsedMs >= waitTimeMs;
}

/**
 * Get the end of today in UTC (23:59:59)
 * @returns Date object set to 23:59:59 UTC today
 */
export function getTodayEndTime(): Date {
  const now = new Date();
  const endTime = new Date(Date.UTC(
    now.getUTCFullYear(),
    now.getUTCMonth(),
    now.getUTCDate(),
    23, 59, 59, 999
  ));
  return endTime;
}

/**
 * Get the current time in UTC
 * @returns Current UTC time as Date object
 */
export function getCurrentUtcTime(): Date {
  return new Date();
}

/**
 * Check if a campaign has a high daily budget (≥ $50)
 * @param budget The campaign's daily budget
 * @returns True if the budget is at least $50
 */
export function isHighBudgetCampaign(budget: number): boolean {
  return budget >= 50;
}

/**
 * Calculate the required budget for a campaign based on remaining clicks
 * @param pricePerThousand The campaign's price per thousand clicks
 * @param remainingClicks The number of remaining clicks
 * @returns Required budget in dollars
 */
export function calculateRequiredBudget(pricePerThousand: number, remainingClicks: number): number {
  return (pricePerThousand / 1000) * remainingClicks;
}

/**
 * Get remaining clicks for a campaign
 * @param campaign The campaign object
 * @returns Total remaining clicks across all URLs in the campaign
 */
export async function getRemainingClicks(campaignId: number): Promise<number> {
  try {
    // Get all URLs for the campaign
    const urls = await storage.getUrlsByCampaignId(campaignId);
    
    // Calculate total remaining clicks
    let totalRemainingClicks = 0;
    for (const url of urls) {
      const remainingClicks = url.clickLimit - url.clicks;
      if (remainingClicks > 0) {
        totalRemainingClicks += remainingClicks;
      }
    }
    
    return totalRemainingClicks;
  } catch (error) {
    log(`Error calculating remaining clicks for campaign ${campaignId}: ${error}`, 'error');
    return 0;
  }
}

/**
 * Check if a URL has already been budgeted for
 * @param campaign The campaign object
 * @param urlId The URL ID to check
 * @returns True if the URL has already been budgeted for
 */
export function hasUrlBeenBudgeted(campaign: Campaign, urlId: number): boolean {
  if (!campaign.budgetedUrlIds) {
    return false;
  }
  
  return campaign.budgetedUrlIds.includes(urlId);
}

/**
 * Mark a URL as having received budget
 * @param campaignId The campaign ID
 * @param urlId The URL ID to mark as budgeted
 */
export async function trackBudgetedUrl(campaignId: number, urlId: number): Promise<void> {
  try {
    // Get the current campaign
    const campaign = await storage.getCampaign(campaignId);
    if (!campaign) {
      log(`Campaign ${campaignId} not found, cannot track budgeted URL`, 'error');
      return;
    }
    
    // Get the current budgeted URL IDs array or initialize it
    const currentBudgetedUrls = campaign.budgetedUrlIds || [];
    
    // Only add the URL ID if it's not already in the array
    if (!currentBudgetedUrls.includes(urlId)) {
      const updatedBudgetedUrls = [...currentBudgetedUrls, urlId];
      
      // Update the campaign in the database
      await db
        .update(campaigns)
        .set({ budgetedUrlIds: updatedBudgetedUrls })
        .where(eq(campaigns.id, campaignId));
      
      log(`URL ${urlId} marked as budgeted for campaign ${campaignId}`, 'info');
    }
  } catch (error) {
    log(`Error tracking budgeted URL: ${error}`, 'error');
  }
}

/**
 * Format a TrafficStar campaign end time to the required format
 * @param endTime The end time as a Date object
 * @returns Formatted end time string for TrafficStar API
 */
export function formatTrafficStarEndTime(endTime: Date): string {
  const year = endTime.getUTCFullYear();
  const month = String(endTime.getUTCMonth() + 1).padStart(2, '0');
  const day = String(endTime.getUTCDate()).padStart(2, '0');
  const hours = String(endTime.getUTCHours()).padStart(2, '0');
  const minutes = String(endTime.getUTCMinutes()).padStart(2, '0');
  const seconds = String(endTime.getUTCSeconds()).padStart(2, '0');
  
  return `${year}-${month}-${day} ${hours}:${minutes}:${seconds}`;
}

/**
 * Add a pending URL budget to a campaign
 * @param campaignId The campaign ID
 * @param urlId The URL ID
 * @param budget The budget amount to add
 */
export async function addPendingUrlBudget(campaignId: number, urlId: number, budget: number): Promise<void> {
  try {
    // Get the current campaign
    const campaign = await storage.getCampaign(campaignId);
    if (!campaign) {
      log(`Campaign ${campaignId} not found, cannot add pending URL budget`, 'error');
      return;
    }
    
    // Get the current pending URL budgets or initialize empty object
    const pendingBudgets = campaign.pendingUrlBudgets || {};
    
    // Add the URL budget to the pending budgets
    const updatedPendingBudgets = {
      ...pendingBudgets,
      [urlId.toString()]: budget
    };
    
    // Update the campaign in the database
    await db
      .update(campaigns)
      .set({ pendingUrlBudgets: updatedPendingBudgets })
      .where(eq(campaigns.id, campaignId));
    
    log(`Added pending budget of $${budget} for URL ${urlId} in campaign ${campaignId}`, 'info');
  } catch (error) {
    log(`Error adding pending URL budget: ${error}`, 'error');
  }
}

// --- Phase 3: Wait & Check Logic ---

/**
 * Update a campaign's Traffic Generator state
 * @param campaignId The campaign ID
 * @param state The new state
 * @param waitStartTime Optional wait start time for WAITING state
 * @param waitMinutes Optional wait minutes for WAITING state
 */
export async function updateCampaignTrafficGeneratorState(
  campaignId: number, 
  state: TrafficGeneratorState,
  waitStartTime?: Date,
  waitMinutes?: number
): Promise<void> {
  try {
    // Prepare update data
    const updateData: any = {
      trafficGeneratorState: state
    };
    
    // If this is a transition to WAITING state, include wait parameters
    if (state === TrafficGeneratorState.WAITING && waitStartTime) {
      updateData.trafficGeneratorWaitStartTime = waitStartTime;
      
      if (waitMinutes !== undefined) {
        updateData.trafficGeneratorWaitMinutes = waitMinutes;
      }
    }
    
    // Update the campaign in the database
    await db
      .update(campaigns)
      .set(updateData)
      .where(eq(campaigns.id, campaignId));
    
    log(`Updated campaign ${campaignId} Traffic Generator state to ${state}`, 'info');
  } catch (error) {
    log(`Error updating Traffic Generator state for campaign ${campaignId}: ${error}`, 'error');
  }
}

// --- Phase 4: Condition #1 Implementation ---

/**
 * Process a campaign using Condition #1 (spent < $10)
 * Checks remaining clicks:
 * - If > 15,000 clicks, start campaign with end time of 23:59 UTC today
 * - Monitor until clicks ≤ 5,000, then pause and repeat
 * 
 * @param campaign The campaign to process
 * @param status The current TrafficStar campaign status
 */
export async function processConditionOne(campaign: Campaign, status: { status: string, active: boolean }): Promise<void> {
  try {
    log(`Processing Condition #1 for campaign ${campaign.id} with status ${status.status}`, 'info');
    
    // Get total remaining clicks for the campaign
    const remainingClicks = await getRemainingClicks(campaign.id);
    log(`Campaign ${campaign.id} has ${remainingClicks} remaining clicks`, 'info');
    
    // If campaign is active, check if remaining clicks are ≤ 5,000
    if (status.active) {
      if (remainingClicks <= 5000) {
        // Pause the campaign
        log(`Campaign ${campaign.id} has reached ≤5,000 remaining clicks (${remainingClicks}), pausing...`, 'info');
        
        await trafficStarService.updateCampaignStatus(
          campaign.trafficstarCampaignId as string,
          'paused'
        );
        
        // Reset state to IDLE for next cycle
        await updateCampaignTrafficGeneratorState(campaign.id, TrafficGeneratorState.IDLE);
        
        log(`Campaign ${campaign.id} paused due to reaching click threshold, reset to IDLE state`, 'info');
      } else {
        log(`Campaign ${campaign.id} has ${remainingClicks} remaining clicks, continuing to run`, 'info');
      }
    }
    // If campaign is paused and remaining clicks are > 15,000, start it
    else if (!status.active && remainingClicks > 15000) {
      // Calculate end time (23:59:59 UTC today)
      const endTime = getTodayEndTime();
      const formattedEndTime = formatTrafficStarEndTime(endTime);
      
      log(`Campaign ${campaign.id} has ${remainingClicks} remaining clicks (>15,000), starting with end time ${formattedEndTime}`, 'info');
      
      // Start the campaign with end time set to 23:59:59 UTC today
      await trafficStarService.updateCampaign(
        campaign.trafficstarCampaignId as string,
        {
          status: 'active',
          end_time: formattedEndTime
        }
      );
      
      log(`Campaign ${campaign.id} started with end time set to ${formattedEndTime}`, 'info');
    } else {
      log(`Campaign ${campaign.id} has ${remainingClicks} remaining clicks, no action needed`, 'info');
    }
  } catch (error) {
    log(`Error processing Condition #1 for campaign ${campaign.id}: ${error}`, 'error');
  }
}

// --- Phase 5: Condition #2 Implementation ---

/**
 * Process a campaign using Condition #2 (spent ≥ $10)
 * Uses a budget-based approach:
 * - Calculate required budget based on price and remaining clicks
 * - Add budget to daily budget
 * - Start campaign
 * - Track budgeted URLs to prevent duplicate budget allocation
 * 
 * @param campaign The campaign to process
 * @param status The current TrafficStar campaign status
 */
export async function processConditionTwo(campaign: Campaign, status: { status: string, active: boolean }): Promise<void> {
  try {
    log(`Processing Condition #2 for campaign ${campaign.id} with status ${status.status}`, 'info');
    
    // Get all URLs for the campaign that haven't been budgeted yet
    const allUrls = await storage.getUrlsByCampaignId(campaign.id);
    const unbudgetedUrls = allUrls.filter(url => 
      !hasUrlBeenBudgeted(campaign, url.id) && 
      url.clickLimit > url.clicks
    );
    
    // If there are no unbudgeted URLs with remaining clicks, nothing to do
    if (unbudgetedUrls.length === 0) {
      log(`Campaign ${campaign.id} has no unbudgeted URLs with remaining clicks, no action needed`, 'info');
      return;
    }
    
    log(`Campaign ${campaign.id} has ${unbudgetedUrls.length} unbudgeted URLs with remaining clicks`, 'info');
    
    // Get the campaign's price per thousand
    const pricePerThousand = campaign.pricePerThousand || 0;
    if (pricePerThousand <= 0) {
      log(`Campaign ${campaign.id} has no valid price per thousand set (${pricePerThousand}), skipping budget calculation`, 'warn');
      return;
    }
    
    // Calculate total budget needed for all unbudgeted URLs
    let totalBudgetNeeded = 0;
    for (const url of unbudgetedUrls) {
      const remainingClicks = url.clickLimit - url.clicks;
      const budgetNeeded = calculateRequiredBudget(pricePerThousand, remainingClicks);
      
      log(`URL ${url.id} needs budget $${budgetNeeded.toFixed(2)} for ${remainingClicks} remaining clicks`, 'info');
      totalBudgetNeeded += budgetNeeded;
      
      // Track this URL as being budgeted
      await trackBudgetedUrl(campaign.id, url.id);
      
      // Add to pending URL budgets (for high budget campaigns)
      await addPendingUrlBudget(campaign.id, url.id, budgetNeeded);
    }
    
    log(`Campaign ${campaign.id} total budget needed: $${totalBudgetNeeded.toFixed(2)}`, 'info');
    
    // Check if this is a high budget campaign (≥ $50)
    const isHighBudget = isHighBudgetCampaign(totalBudgetNeeded);
    
    // For high budget campaigns, we'll add the budget incrementally via pendingUrlBudgets
    // This has already been done by addPendingUrlBudget calls above
    if (isHighBudget) {
      log(`Campaign ${campaign.id} has high budget ($${totalBudgetNeeded.toFixed(2)} ≥ $50), budget will be added incrementally`, 'info');
      
      // Start the campaign if it's not already active
      if (!status.active) {
        // Start campaign with end time set to 23:59:59 UTC today
        const endTime = getTodayEndTime();
        const formattedEndTime = formatTrafficStarEndTime(endTime);
        
        await trafficStarService.updateCampaign(
          campaign.trafficstarCampaignId as string,
          {
            status: 'active',
            end_time: formattedEndTime
          }
        );
        
        log(`High budget campaign ${campaign.id} started with end time ${formattedEndTime}`, 'info');
      }
      
      // Return to IDLE state
      await updateCampaignTrafficGeneratorState(campaign.id, TrafficGeneratorState.IDLE);
      return;
    }
    
    // For regular budget campaigns, add the budget all at once
    
    // First, get the current daily budget of the TrafficStar campaign
    const trafficstarCampaign = await trafficStarService.getCampaign(campaign.trafficstarCampaignId as string);
    if (!trafficstarCampaign) {
      log(`Could not get TrafficStar campaign ${campaign.trafficstarCampaignId}, cannot update budget`, 'error');
      return;
    }
    
    const currentBudget = trafficstarCampaign.daily_budget || 0;
    const newBudget = currentBudget + totalBudgetNeeded;
    
    log(`Campaign ${campaign.id} current budget: $${currentBudget}, new budget: $${newBudget}`, 'info');
    
    // Update the campaign with the new budget and start it
    const endTime = getTodayEndTime();
    const formattedEndTime = formatTrafficStarEndTime(endTime);
    
    await trafficStarService.updateCampaign(
      campaign.trafficstarCampaignId as string,
      {
        status: 'active',
        daily_budget: newBudget,
        end_time: formattedEndTime
      }
    );
    
    log(`Campaign ${campaign.id} budget updated to $${newBudget} and started with end time ${formattedEndTime}`, 'info');
    
    // Update lastBudgetUpdateTime
    await db
      .update(campaigns)
      .set({ lastBudgetUpdateTime: new Date() })
      .where(eq(campaigns.id, campaign.id));
    
    // Return to IDLE state
    await updateCampaignTrafficGeneratorState(campaign.id, TrafficGeneratorState.IDLE);
    
  } catch (error) {
    log(`Error processing Condition #2 for campaign ${campaign.id}: ${error}`, 'error');
  }
}

// --- Phase 6: Advanced Budget Management ---

/**
 * Process pending URL budgets for high budget campaigns
 * For campaigns with high budgets (≥$50), we add budget incrementally
 * Only adds pending URL budgets when spent reaches (current budget - $1)
 * 
 * @param campaign The campaign to process
 */
export async function processPendingUrlBudgets(campaign: Campaign): Promise<void> {
  try {
    // Skip if campaign has no TrafficStar ID
    if (!campaign.trafficstarCampaignId) {
      return;
    }
    
    // Skip if there are no pending URL budgets
    if (!campaign.pendingUrlBudgets || Object.keys(campaign.pendingUrlBudgets).length === 0) {
      return;
    }
    
    log(`Processing pending URL budgets for campaign ${campaign.id}`, 'info');
    
    // Get the current TrafficStar campaign
    const trafficstarCampaign = await trafficStarService.getCampaign(campaign.trafficstarCampaignId);
    if (!trafficstarCampaign) {
      log(`Could not get TrafficStar campaign ${campaign.trafficstarCampaignId}, cannot process pending budgets`, 'error');
      return;
    }
    
    // Get the current daily budget and spent
    const currentBudget = trafficstarCampaign.daily_budget || 0;
    
    // Get today's date for spent value
    const today = new Date();
    const formattedDate = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-${String(today.getDate()).padStart(2, '0')}`;
    
    // Get today's spent value
    const spentValue = await trafficStarService.getCampaignSpent(
      campaign.trafficstarCampaignId,
      formattedDate,
      formattedDate
    );
    
    log(`Campaign ${campaign.id} current budget: $${currentBudget}, spent: $${spentValue}`, 'info');
    
    // Check if spent is close to budget (within $1)
    if (spentValue >= (currentBudget - 1)) {
      log(`Campaign ${campaign.id} spent ($${spentValue}) is approaching budget ($${currentBudget}), adding pending URL budgets`, 'info');
      
      // Calculate sum of all pending budgets
      const pendingBudgets = campaign.pendingUrlBudgets || {};
      const totalPendingBudget = Object.values<number>(pendingBudgets).reduce((sum, budget) => sum + budget, 0);
      
      // Add pending budgets to current budget
      const newBudget = currentBudget + totalPendingBudget;
      
      log(`Campaign ${campaign.id} adding $${totalPendingBudget} from pending URL budgets, new budget: $${newBudget}`, 'info');
      
      // Update the campaign with the new budget
      await trafficStarService.updateCampaign(
        campaign.trafficstarCampaignId,
        {
          daily_budget: newBudget
        }
      );
      
      // Clear pending URL budgets
      await db
        .update(campaigns)
        .set({ 
          pendingUrlBudgets: {},
          lastBudgetUpdateTime: new Date()
        })
        .where(eq(campaigns.id, campaign.id));
      
      log(`Campaign ${campaign.id} pending URL budgets applied and cleared`, 'info');
    } else {
      log(`Campaign ${campaign.id} spent ($${spentValue}) is not close enough to budget ($${currentBudget}), not adding pending budgets yet`, 'info');
    }
  } catch (error) {
    log(`Error processing pending URL budgets for campaign ${campaign.id}: ${error}`, 'error');
  }
}

// --- Phase 7: Campaign Toggle & UI (API endpoints) ---

/**
 * Enable or disable Traffic Generator for a campaign
 * @param campaignId The campaign ID
 * @param enabled Whether to enable or disable
 */
export async function toggleTrafficGenerator(campaignId: number, enabled: boolean): Promise<void> {
  try {
    log(`Setting Traffic Generator for campaign ${campaignId} to ${enabled ? 'enabled' : 'disabled'}`, 'info');
    
    // Get the current campaign
    const campaign = await storage.getCampaign(campaignId);
    if (!campaign) {
      throw new Error(`Campaign ${campaignId} not found`);
    }
    
    // If we're enabling Traffic Generator, pause the campaign in TrafficStar first
    if (enabled && campaign.trafficstarCampaignId) {
      log(`Pausing TrafficStar campaign ${campaign.trafficstarCampaignId} before enabling Traffic Generator`, 'info');
      
      // Get the current real-time status
      const currentStatus = await getRealTimeTrafficStarCampaignStatus(campaign.trafficstarCampaignId);
      
      // Check if the campaign is already paused
      if (currentStatus.active === false && currentStatus.status === 'paused') {
        log(`TrafficStar campaign ${campaign.trafficstarCampaignId} is already paused, continuing`, 'info');
      } else {
        // Pause the campaign in TrafficStar - this is MANDATORY before enabling Traffic Generator
        try {
          // Pause the campaign in TrafficStar
          await trafficStarService.updateCampaignStatus(campaign.trafficstarCampaignId, 'paused');
          log(`TrafficStar campaign ${campaign.trafficstarCampaignId} paused successfully`, 'info');
          
          // Double-check that it's actually paused
          const verifyStatus = await getRealTimeTrafficStarCampaignStatus(campaign.trafficstarCampaignId);
          if (verifyStatus.active === true || verifyStatus.status !== 'paused') {
            throw new Error(`Campaign status could not be updated to paused: Current status=${verifyStatus.status}, active=${verifyStatus.active}`);
          }
        } catch (error) {
          // Throw an error instead of continuing - pausing MUST succeed
          const errorMessage = `Failed to pause TrafficStar campaign ${campaign.trafficstarCampaignId}: ${error}`;
          log(errorMessage, 'error');
          throw new Error(errorMessage);
        }
      }
    }
    
    // Update the campaign in the database
    await db
      .update(campaigns)
      .set({ 
        trafficGeneratorEnabled: enabled,
        // If enabling, set to WAITING state and use the specified wait time
        // If disabling, reset all Traffic Generator state
        ...(enabled ? { 
          trafficGeneratorState: TrafficGeneratorState.WAITING,
          trafficGeneratorWaitStartTime: new Date(), // Set to now - we'll actually wait the configured time
          trafficGeneratorWaitMinutes: campaign.trafficGeneratorWaitMinutes || 2 // Use configured wait time or default to 2
        } : {
          trafficGeneratorState: TrafficGeneratorState.IDLE,
          trafficGeneratorWaitStartTime: null,
          trafficGeneratorWaitMinutes: null,
          budgetedUrlIds: [],
          pendingUrlBudgets: {}
        })
      })
      .where(eq(campaigns.id, campaignId));
    
    log(`Traffic Generator for campaign ${campaignId} ${enabled ? 'enabled' : 'disabled'}`, 'info');
  } catch (error) {
    log(`Error toggling Traffic Generator for campaign ${campaignId}: ${error}`, 'error');
    throw error;
  }
}

/**
 * Get Traffic Generator status for a campaign
 * @param campaignId The campaign ID
 */
export async function getTrafficGeneratorStatus(campaignId: number): Promise<{
  enabled: boolean;
  state: TrafficGeneratorState | null;
  waitStartTime: Date | null;
  waitMinutes: number | null;
  remainingWaitSeconds: number | null;
  budgetedUrlIds: number[];
  pendingUrlBudgets: Record<string, number>;
}> {
  try {
    // Get the campaign
    const campaign = await storage.getCampaign(campaignId);
    if (!campaign) {
      throw new Error(`Campaign ${campaignId} not found`);
    }
    
    // Calculate remaining wait time in seconds if in WAITING state
    let remainingWaitSeconds = null;
    if (campaign.trafficGeneratorState === TrafficGeneratorState.WAITING && 
        campaign.trafficGeneratorWaitStartTime && 
        campaign.trafficGeneratorWaitMinutes) {
      
      const now = new Date();
      const waitTimeMs = campaign.trafficGeneratorWaitMinutes * 60 * 1000;
      const elapsedMs = now.getTime() - campaign.trafficGeneratorWaitStartTime.getTime();
      const remainingMs = Math.max(0, waitTimeMs - elapsedMs);
      
      remainingWaitSeconds = Math.ceil(remainingMs / 1000);
      
      log(`Remaining wait time for campaign ${campaignId}: ${remainingWaitSeconds} seconds`, 'info');
    }
    
    return {
      enabled: campaign.trafficGeneratorEnabled || false,
      state: campaign.trafficGeneratorState || null,
      waitStartTime: campaign.trafficGeneratorWaitStartTime || null,
      waitMinutes: campaign.trafficGeneratorWaitMinutes || null,
      remainingWaitSeconds,
      budgetedUrlIds: campaign.budgetedUrlIds || [],
      pendingUrlBudgets: campaign.pendingUrlBudgets || {}
    };
  } catch (error) {
    log(`Error getting Traffic Generator status for campaign ${campaignId}: ${error}`, 'error');
    throw error;
  }
}
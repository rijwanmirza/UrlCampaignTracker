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
    
    // TODO: Implement post-pause workflow logic for Phase 3

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
    const isActive = campaign.status === 'active';
    
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

// --- Phase 2: Core Utility Functions (To be implemented) ---

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

// --- Phase 3: Wait & Check Logic (To be implemented) ---

// --- Phase 4: Condition #1 Implementation (To be implemented) ---

// --- Phase 5: Condition #2 Implementation (To be implemented) ---

// --- Phase 6: Advanced Budget Management (To be implemented) ---

// --- Phase 7: Campaign Toggle & UI (API endpoints - To be implemented) ---
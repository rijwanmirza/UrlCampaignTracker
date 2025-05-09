/**
 * Independent Processing Functions
 * 
 * This file contains dedicated processing functions for various traffic management tasks.
 * Each function is designed to run independently without dependencies on other processes.
 */

import { db } from './db';
import { and, eq, sql } from 'drizzle-orm';
import { campaigns, urls, campaignMonitoring } from '@shared/schema';
import { trafficStarService } from './trafficstar-service';
import urlBudgetManager from './url-budget-manager';
import urlBudgetLogger from './url-budget-logger';
import { getCampaignThresholds } from './system/thresholds';
import campaignMonitoringManager from './campaign-monitoring-manager';

// Constants
const THRESHOLD = 10; // $10 spend threshold

/**
 * Process Spent Value Checks
 * 
 * Checks the spent value for all campaigns with TrafficStar IDs
 * Handles high spend and low spend conditions
 */
export async function processSpentValueChecks(): Promise<void> {
  console.log('🔍 Running independent spent value checks for all campaigns');
  
  try {
    // Using raw SQL to avoid Drizzle query builder issues
    const result = await db.execute(
      sql`SELECT id, trafficstar_campaign_id as "trafficstarCampaignId",
          traffic_generator_enabled as "trafficGeneratorEnabled",
          last_traffic_sender_status as "highSpendFirstTime",
          high_spend_wait_minutes as "highSpendWaitMinutes"
          FROM campaigns 
          WHERE trafficstar_campaign_id IS NOT NULL 
          AND traffic_generator_enabled = true`
    );
    
    // Safely extract campaigns from result
    const campaignsWithTrafficStar = result.rows || [];
      
    console.log(`📊 Found ${campaignsWithTrafficStar.length} campaigns with TrafficStar integration`);
    
    // Process each campaign's spent value
    for (const campaign of campaignsWithTrafficStar) {
      try {
        await processSpentValueForCampaign(campaign.id);
      } catch (error) {
        console.error(`❌ Error processing spent value for campaign ${campaign.id}:`, error);
      }
    }
  } catch (error) {
    console.error('❌ Error processing spent value checks:', error);
  }
}

/**
 * Process Spent Value for a Single Campaign
 * 
 * Checks the spent value for a campaign and takes action based on high/low spend
 * 
 * @param campaignId - The ID of the campaign to process
 */
export async function processSpentValueForCampaign(campaignId: number): Promise<void> {
  // Get the campaign details
  const campaign = await db.select({
    id: campaigns.id,
    trafficstarCampaignId: campaigns.trafficstarCampaignId,
    dailySpent: campaigns.dailySpent,
    lastTrafficSenderStatus: campaigns.lastTrafficSenderStatus,
    highSpendWaitMinutes: campaigns.highSpendWaitMinutes,
    highSpendBudgetCalcTime: campaigns.highSpendBudgetCalcTime
  })
  .from(campaigns)
  .where(eq(campaigns.id, campaignId))
  .then(records => records[0]);
  
  if (!campaign || !campaign.trafficstarCampaignId) {
    console.log(`⚠️ Campaign ${campaignId} not found or has no TrafficStar ID`);
    return;
  }
  
  // Get current spent value from TrafficStar
  try {
    console.log(`💲 Checking spent value for campaign ${campaignId} (TrafficStar ID: ${campaign.trafficstarCampaignId})`);
    
    // Get the spent value from TrafficStar API
    const today = new Date().toISOString().substring(0, 10);
    const { totalSpent } = await trafficStarService.getCampaignSpentValue(parseInt(campaign.trafficstarCampaignId));
    
    if (totalSpent === undefined) {
      console.log(`⚠️ No spent data returned for campaign ${campaignId}`);
      return;
    }
    
    const spentValue = totalSpent;
    console.log(`💲 Campaign ${campaignId} spent: $${spentValue.toFixed(4)} (on ${today})`);
    
    // Update the database with the latest spent value
    await db.update(campaigns)
      .set({
        dailySpent: spentValue.toString(),
        dailySpentDate: new Date(today), // Convert string date to actual Date object
        lastSpentCheck: new Date(),
        updatedAt: new Date()
      })
      .where(eq(campaigns.id, campaignId));
    
    // Check if spent value is high or low
    if (spentValue >= THRESHOLD) {
      await handleHighSpendCampaign(campaignId, campaign.trafficstarCampaignId, spentValue);
    } else {
      await handleLowSpendCampaign(campaignId, campaign.trafficstarCampaignId, spentValue);
    }
  } catch (error) {
    console.error(`❌ Error checking spent value for campaign ${campaignId}:`, error);
  }
}

/**
 * Handle High Spend Campaign
 * 
 * Handles a campaign that has spent at least $10
 * 
 * @param campaignId - The ID of the campaign
 * @param trafficstarCampaignId - The TrafficStar campaign ID
 * @param spentValue - The current spent value
 */
async function handleHighSpendCampaign(
  campaignId: number, 
  trafficstarCampaignId: string, 
  spentValue: number
): Promise<void> {
  console.log(`🔶 HIGH SPEND ($${spentValue.toFixed(4)} >= $${THRESHOLD.toFixed(2)}): Campaign ${trafficstarCampaignId} has spent at least $${THRESHOLD.toFixed(2)}`);
  
  const campaignRecord = await db.select({
    highSpendWaitMinutes: campaigns.highSpendWaitMinutes,
    lastTrafficSenderStatus: campaigns.lastTrafficSenderStatus
  })
  .from(campaigns)
  .where(eq(campaigns.id, campaignId))
  .then(records => records[0]);
  
  if (!campaignRecord) {
    console.log(`⚠️ Campaign record not found for campaign ${campaignId}`);
    return;
  }
  
  // Check if this is the first time we've seen high spend for this campaign
  const isFirstTimeHighSpend = campaignRecord.lastTrafficSenderStatus !== 'high_spend_first_time' && 
                             campaignRecord.lastTrafficSenderStatus !== 'high_spend_waiting' && 
                             campaignRecord.lastTrafficSenderStatus !== 'high_spend_budget_updated';
  
  if (isFirstTimeHighSpend) {
    console.log(`🆕 FIRST TIME HIGH SPEND for campaign ${trafficstarCampaignId} - initiating URL budget calculation`);
    
    // Update the database to record this is the first time high spend event
    await db.update(campaigns)
      .set({
        lastTrafficSenderStatus: 'high_spend_first_time',
        lastTrafficSenderAction: new Date(),
        updatedAt: new Date()
      })
      .where(eq(campaigns.id, campaignId));
      
    // Log URL budgets for all active URLs in this campaign
    await urlBudgetManager.addAllActiveCampaignUrls(campaignId);
    
    // Set up the wait period
    const waitMinutes = campaignRecord.highSpendWaitMinutes || 5;
    console.log(`⏱️ Setting up ${waitMinutes}-minute wait period before updating daily budget`);
    
    // Update to waiting status
    await db.update(campaigns)
      .set({
        lastTrafficSenderStatus: 'high_spend_waiting',
        lastTrafficSenderAction: new Date(),
        updatedAt: new Date()
      })
      .where(eq(campaigns.id, campaignId));
      
    // Schedule a budget update after the wait period using a one-time independent worker
    setTimeout(async () => {
      console.log(`⏱️ ${waitMinutes}-minute wait period has elapsed for campaign ${campaignId} - updating daily budget`);
      await processUrlBudgetsForCampaign(campaignId);
    }, waitMinutes * 60 * 1000);
  } 
  // If the campaign is already in high spend budget updated state
  // Check if there are new URLs added after the initial budget calculation
  else if (campaignRecord.lastTrafficSenderStatus === 'high_spend_budget_updated') {
    console.log(`🔄 Checking for URLs added after budget calculation for campaign ${campaignId}`);
    await checkForNewUrlsAfterBudgetCalculation(campaignId, trafficstarCampaignId);
  }
}

/**
 * Handle Low Spend Campaign
 * 
 * Handles a campaign that has spent less than $10
 * 
 * @param campaignId - The ID of the campaign
 * @param trafficstarCampaignId - The TrafficStar campaign ID
 * @param spentValue - The current spent value
 */
async function handleLowSpendCampaign(
  campaignId: number, 
  trafficstarCampaignId: string, 
  spentValue: number
): Promise<void> {
  console.log(`🔵 LOW SPEND ($${spentValue.toFixed(4)} < $${THRESHOLD.toFixed(2)}): Campaign ${trafficstarCampaignId} has spent less than $${THRESHOLD.toFixed(2)}`);
  
  // Check if the campaign was previously in high spend state
  const campaignRecord = await db.select({
    lastTrafficSenderStatus: campaigns.lastTrafficSenderStatus
  })
  .from(campaigns)
  .where(eq(campaigns.id, campaignId))
  .then(records => records[0]);
  
  if (!campaignRecord) {
    console.log(`⚠️ Campaign record not found for campaign ${campaignId}`);
    return;
  }
  
  // If campaign was previously in high spend state (any high spend status)
  if (
    campaignRecord.lastTrafficSenderStatus === 'high_spend_first_time' || 
    campaignRecord.lastTrafficSenderStatus === 'high_spend_waiting' || 
    campaignRecord.lastTrafficSenderStatus === 'high_spend_budget_updated'
  ) {
    // Clear URL budget logs for this specific campaign only
    await urlBudgetLogger.clearCampaignLogs(campaignId);
    
    // Cancel any pending budget updates for this campaign
    if (urlBudgetManager.hasPendingUpdates(campaignId)) {
      console.log(`🔄 Cancelling pending budget updates for campaign ${campaignId} as spent value is below threshold`);
      urlBudgetManager.cancelPendingUpdates(campaignId);
    }
    
    // Reset the high spend flag so next time it will be "first time" again
    await db.update(campaigns)
      .set({
        lastTrafficSenderStatus: 'low_spend_under_threshold',
        lastTrafficSenderAction: new Date(),
        updatedAt: new Date()
      })
      .where(eq(campaigns.id, campaignId));
  }
}

/**
 * Process URL Budgets For Campaign
 * 
 * Processes all pending URL budget updates for a specific campaign
 * 
 * @param campaignId - The ID of the campaign to process
 */
export async function processUrlBudgetsForCampaign(campaignId: number): Promise<void> {
  console.log(`🔄 Processing URL budgets for campaign ${campaignId}`);
  
  try {
    await urlBudgetManager.processUrlBudgets(campaignId);
    
    // After budget is updated, add campaign to active status monitoring
    const campaign = await db.select({
      trafficstarCampaignId: campaigns.trafficstarCampaignId
    })
    .from(campaigns)
    .where(eq(campaigns.id, campaignId))
    .then(records => records[0]);
    
    if (campaign && campaign.trafficstarCampaignId) {
      // Add to active status monitoring
      await campaignMonitoringManager.addCampaignToMonitoring(
        campaignId,
        campaign.trafficstarCampaignId,
        'active_status'
      );
    }
  } catch (error) {
    console.error(`❌ Error processing URL budgets for campaign ${campaignId}:`, error);
  }
}

/**
 * Check For New URLs After Budget Calculation
 * 
 * Checks if there are any new URLs added after the initial budget calculation
 * that need to be included in the budget update
 * 
 * @param campaignId - The ID of the campaign to check
 * @param trafficstarCampaignId - The TrafficStar campaign ID
 */
export async function checkForNewUrlsAfterBudgetCalculation(
  campaignId: number, 
  trafficstarCampaignId: string
): Promise<void> {
  console.log(`🔍 Checking for URLs added after high-spend budget calculation for campaign ${campaignId}`);
  
  const campaign = await db.select({
    highSpendBudgetCalcTime: campaigns.highSpendBudgetCalcTime
  })
  .from(campaigns)
  .where(eq(campaigns.id, campaignId))
  .then(records => records[0]);
  
  if (!campaign || !campaign.highSpendBudgetCalcTime) {
    console.log(`⚠️ Campaign ${campaignId} has no budget calculation time recorded`);
    return;
  }
  
  console.log(`🕒 Campaign ${campaignId} budget calculation time: ${campaign.highSpendBudgetCalcTime.toISOString()}`);
  
  try {
    // Get all active URLs added after the budget calculation time
    const newUrls = await db.select()
      .from(urls)
      .where(
        and(
          eq(urls.campaignId, campaignId),
          eq(urls.status, 'active'),
          sql`${urls.createdAt} > ${campaign.highSpendBudgetCalcTime}`
        )
      );
      
    if (newUrls.length === 0) {
      console.log(`✅ No new URLs found added after budget calculation for campaign ${campaignId}`);
      return;
    }
    
    console.log(`⚠️ Found ${newUrls.length} new URLs added after budget calculation`);
    console.log(`First URL (ID: ${newUrls[0].id}) was added ${
      Math.floor((Date.now() - newUrls[0].createdAt.getTime()) / (60 * 1000))
    } minutes ago`);
    
    // Add the new URLs to the URL budget manager
    const waitMinutes = 9; // Fixed 9-minute wait period for new URLs
    const elapsedMinutes = Math.floor((Date.now() - newUrls[0].createdAt.getTime()) / (60 * 1000));
    
    if (elapsedMinutes >= waitMinutes) {
      console.log(`⏱️ Wait period of ${waitMinutes} minutes has elapsed - adding new URLs to budget calculation`);
      
      // Add new URLs to budget log
      for (const url of newUrls) {
        await urlBudgetManager.addUrlBudget(url);
      }
      
      // Process the budget update
      await urlBudgetManager.processUrlBudgets(campaignId);
      
      console.log(`✅ Processed budget update for ${newUrls.length} new URLs`);
    } else {
      console.log(`⏱️ Waiting period not elapsed yet (${elapsedMinutes}/${waitMinutes} minutes) - will check again on next iteration`);
    }
  } catch (error) {
    console.error(`❌ Error checking for new URLs after budget calculation:`, error);
  }
}

/**
 * Process URL Threshold Checks
 * 
 * Checks all campaigns with TrafficStar IDs for URL thresholds
 * to determine if they should be paused or activated
 */
export async function processUrlThresholdChecks(): Promise<void> {
  console.log('🔍 Running independent URL threshold checks for all campaigns');
  
  try {
    // Get all campaigns with TrafficStar IDs - using raw SQL to avoid Drizzle query builder issues
    const result = await db.execute(
      sql`SELECT id, trafficstar_campaign_id as "trafficstarCampaignId", 
          budget_update_time as "budgetUpdateTime"
          FROM campaigns 
          WHERE trafficstar_campaign_id IS NOT NULL 
          AND traffic_generator_enabled = true`
    );
    
    // Safely extract campaigns from result
    const campaignsWithTrafficStar = result.rows || [];
      
    console.log(`📊 Found ${campaignsWithTrafficStar.length} campaigns with TrafficStar integration`);
    
    // Process each campaign's URL thresholds
    for (const campaign of campaignsWithTrafficStar) {
      try {
        if (campaign && campaign.id) {
          await processUrlThresholdsForCampaign(campaign.id);
        } else {
          console.log(`⚠️ Skipping campaign with invalid ID`);
        }
      } catch (error) {
        console.error(`❌ Error processing URL thresholds for campaign ${campaign?.id || 'unknown'}:`, error);
      }
    }
  } catch (error) {
    console.error('❌ Error processing URL threshold checks:', error);
  }
}

/**
 * Process URL Thresholds for a Single Campaign
 * 
 * Checks if a campaign should be paused or activated based on remaining clicks
 * 
 * @param campaignId - The ID of the campaign to process
 */
export async function processUrlThresholdsForCampaign(campaignId: number): Promise<void> {
  try {
    // Get the campaign details
    const campaignRecord = await db.select({
      id: campaigns.id,
      trafficstarCampaignId: campaigns.trafficstarCampaignId,
      minimumClicksThreshold: campaigns.minimumClicksThreshold,
      remainingClicksThreshold: campaigns.remainingClicksThreshold
    })
    .from(campaigns)
    .where(eq(campaigns.id, campaignId))
    .then(records => records[0]);
    
    if (!campaignRecord || !campaignRecord.trafficstarCampaignId) {
      console.log(`⚠️ Campaign ${campaignId} not found or has no TrafficStar ID`);
      return;
    }
    
    // Get campaign-specific thresholds or use defaults
    const thresholds = await getCampaignThresholds(campaignId);
    const minimumClicksThreshold = campaignRecord.minimumClicksThreshold || thresholds.minimumClicksThreshold;
    const remainingClicksThreshold = campaignRecord.remainingClicksThreshold || thresholds.remainingClicksThreshold;
    
    console.log(`📊 Using campaign-specific thresholds for campaign ${campaignId}: Auto-Pause=${minimumClicksThreshold} clicks, Auto-Activate=${remainingClicksThreshold} clicks`);
    
    // Get all active URLs for the campaign
    const activeUrls = await db.select()
      .from(urls)
      .where(
        and(
          eq(urls.campaignId, campaignId),
          eq(urls.status, 'active')
        )
      );
    
    // Count total remaining clicks
    let totalRemainingClicks = 0;
    for (const url of activeUrls) {
      const remainingClicks = url.clickLimit - url.clicks;
      if (remainingClicks > 0) {
        totalRemainingClicks += remainingClicks;
      }
    }
    
    console.log(`Campaign ${campaignId} has ${activeUrls.length} active URLs with ${totalRemainingClicks} total remaining clicks`);
    
    // Check if we should pause or activate the campaign
    if (totalRemainingClicks <= minimumClicksThreshold) {
      console.log(`⚠️ Campaign ${campaignId} has only ${totalRemainingClicks} remaining clicks, which is below the minimum threshold of ${minimumClicksThreshold}`);
      
      // Get current campaign status
      const status = await trafficStarService.getCampaignStatus(parseInt(campaignRecord.trafficstarCampaignId));
      
      if (status.active) {
        console.log(`🔴 Pausing campaign ${campaignId} (TrafficStar ID: ${campaignRecord.trafficstarCampaignId}) due to low remaining clicks`);
        
        // Pause the campaign
        await trafficStarService.pauseCampaign(parseInt(campaignRecord.trafficstarCampaignId));
        
        // Add to campaign monitoring for pause status to ensure it stays paused
        await campaignMonitoringManager.addCampaignToMonitoring(
          campaignId,
          campaignRecord.trafficstarCampaignId,
          'pause_status'
        );
        
        // Update the campaign status in our database
        await db.update(campaigns)
          .set({
            updatedAt: new Date()
          })
          .where(eq(campaigns.id, campaignId));
      }
    }
    // Check if we've surpassed the reactivation threshold (if campaign is currently paused)
    else if (totalRemainingClicks >= remainingClicksThreshold) {
      console.log(`Campaign ${campaignId} has ${totalRemainingClicks} remaining clicks, which exceeds the reactivation threshold of ${remainingClicksThreshold}`);
      await checkIfCampaignShouldBeReactivated(campaignId, campaignRecord.trafficstarCampaignId);
    }
  } catch (error) {
    console.error(`❌ Error processing URL thresholds for campaign ${campaignId}:`, error);
  }
}

/**
 * Process Empty URL Checks
 * 
 * Checks for campaigns with no active URLs and ensures they are paused
 */
export async function processEmptyUrlChecks(): Promise<void> {
  console.log('🔍 Running independent empty URL checks for all campaigns');
  
  try {
    console.log('Checking for campaigns with no active URLs to pause TrafficStar campaigns');
    
    // Using raw SQL to avoid Drizzle query builder issues
    const result = await db.execute(
      sql`SELECT id, trafficstar_campaign_id as "trafficstarCampaignId"
          FROM campaigns 
          WHERE trafficstar_campaign_id IS NOT NULL 
          AND traffic_generator_enabled = true`
    );
    
    // Safely extract campaigns from result
    const campaignsWithTrafficStar = result.rows || [];
      
    console.log(`Found ${campaignsWithTrafficStar.length} campaigns with TrafficStar integration`);
    
    // Process each campaign to check for empty URLs
    for (const campaign of campaignsWithTrafficStar) {
      try {
        // Get active URL count for the campaign
        const urlCount = await db.select()
          .from(urls)
          .where(
            and(
              eq(urls.campaignId, campaign.id),
              eq(urls.status, 'active')
            )
          );
          
        const activeUrlCount = urlCount.length;
        console.log(`Campaign ${campaign.id} (TrafficStar ID: ${campaign.trafficstarCampaignId}) has ${activeUrlCount} active URLs`);
        
        if (activeUrlCount === 0) {
          console.log(`⚠️ Campaign ${campaign.id} has no active URLs - should be paused`);
          
          // Get current campaign status
          const status = await trafficStarService.getCampaignStatus(parseInt(campaign.trafficstarCampaignId));
          
          if (status.active) {
            console.log(`🔴 Pausing campaign ${campaign.id} (TrafficStar ID: ${campaign.trafficstarCampaignId}) due to no active URLs`);
            
            // Pause the campaign
            await trafficStarService.pauseCampaign(parseInt(campaign.trafficstarCampaignId));
            
            // Add to campaign monitoring to ensure it stays paused
            await campaignMonitoringManager.addCampaignToMonitoring(
              campaign.id,
              campaign.trafficstarCampaignId,
              'empty_url'
            );
          }
        } else {
          // If the campaign has active URLs but was previously being monitored for empty URL
          // check if we should stop monitoring it
          const isMonitored = await campaignMonitoringManager.isCampaignMonitored(
            campaign.id,
            'empty_url'
          );
          
          if (isMonitored) {
            console.log(`Campaign ${campaign.id} now has ${activeUrlCount} active URLs - removing from empty URL monitoring`);
            await campaignMonitoringManager.removeCampaignFromMonitoring(
              campaign.id,
              'empty_url'
            );
          }
        }
      } catch (error) {
        console.error(`❌ Error checking empty URLs for campaign ${campaign.id}:`, error);
      }
    }
  } catch (error) {
    console.error('❌ Error processing empty URL checks:', error);
  }
}

/**
 * Process Campaign Status Monitoring
 * 
 * Checks all campaigns that are being monitored for status changes
 */
export async function processCampaignStatusMonitoring(): Promise<void> {
  console.log('🔍 Running independent campaign status monitoring checks');
  
  try {
    // Get all campaigns that are being monitored
    const monitoringEntries = await campaignMonitoringManager.getActiveCampaignMonitoring();
    
    if (monitoringEntries.length === 0) {
      console.log('✅ No campaigns currently being monitored');
      return;
    }
    
    console.log(`Found ${monitoringEntries.length} campaign monitoring entries to process`);
    
    // Process each monitoring entry
    for (const entry of monitoringEntries) {
      try {
        if (entry.type === 'active_status') {
          await monitorActiveStatus(entry.campaignId, entry.trafficstarCampaignId);
        } else if (entry.type === 'pause_status') {
          await monitorPauseStatus(entry.campaignId, entry.trafficstarCampaignId);
        } else if (entry.type === 'empty_url') {
          await monitorEmptyUrl(entry.campaignId, entry.trafficstarCampaignId);
        }
      } catch (error) {
        console.error(`❌ Error monitoring campaign ${entry.campaignId} for ${entry.type}:`, error);
      }
    }
  } catch (error) {
    console.error('❌ Error processing campaign status monitoring:', error);
  }
}

/**
 * Monitor Active Status
 * 
 * Ensures a campaign that should be active remains active
 * 
 * @param campaignId - The ID of the campaign to monitor
 * @param trafficstarCampaignId - The TrafficStar campaign ID
 */
async function monitorActiveStatus(campaignId: number, trafficstarCampaignId: string): Promise<void> {
  console.log(`🔍 Monitoring active status for campaign ${campaignId} (TrafficStar ID: ${trafficstarCampaignId})`);
  
  try {
    // Get current campaign status
    const status = await trafficStarService.getCampaignStatus(parseInt(trafficstarCampaignId));
    
    // If campaign is currently paused but should be active
    if (!status.active && status.status !== 'total_budget_is_reached') {
      console.log(`⚠️ Campaign ${campaignId} should be active but is currently paused`);
      
      // Reactivate the campaign
      await trafficStarService.activateCampaign(parseInt(trafficstarCampaignId));
      console.log(`✅ Reactivated campaign ${campaignId}`);
    } else if (status.status === 'total_budget_is_reached') {
      console.log(`⚠️ Campaign ${campaignId} has reached total budget - cannot reactivate`);
      
      // Remove from monitoring since we can't do anything about it
      await campaignMonitoringManager.removeCampaignFromMonitoring(
        campaignId,
        'active_status'
      );
    }
  } catch (error) {
    console.error(`❌ Error monitoring active status for campaign ${campaignId}:`, error);
  }
}

/**
 * Monitor Pause Status
 * 
 * Ensures a campaign that should be paused remains paused
 * 
 * @param campaignId - The ID of the campaign to monitor
 * @param trafficstarCampaignId - The TrafficStar campaign ID
 */
async function monitorPauseStatus(campaignId: number, trafficstarCampaignId: string): Promise<void> {
  console.log(`🔍 Monitoring pause status for campaign ${campaignId} (TrafficStar ID: ${trafficstarCampaignId})`);
  
  try {
    // Get current campaign status
    const status = await trafficStarService.getCampaignStatus(parseInt(trafficstarCampaignId));
    
    // If campaign is currently active but should be paused
    if (status.active) {
      console.log(`⚠️ Campaign ${campaignId} should be paused but is currently active`);
      
      // Pause the campaign
      await trafficStarService.pauseCampaign(parseInt(trafficstarCampaignId));
      console.log(`✅ Paused campaign ${campaignId}`);
    }
    
    // Also check if campaign now has enough remaining clicks to be reactivated
    await checkIfCampaignShouldBeReactivated(campaignId, trafficstarCampaignId);
  } catch (error) {
    console.error(`❌ Error monitoring pause status for campaign ${campaignId}:`, error);
  }
}

/**
 * Monitor Empty URL
 * 
 * Ensures a campaign with no active URLs remains paused
 * 
 * @param campaignId - The ID of the campaign to monitor
 * @param trafficstarCampaignId - The TrafficStar campaign ID
 */
async function monitorEmptyUrl(campaignId: number, trafficstarCampaignId: string): Promise<void> {
  console.log(`🔍 Monitoring empty URL status for campaign ${campaignId} (TrafficStar ID: ${trafficstarCampaignId})`);
  
  try {
    // Check if campaign still has no active URLs
    const urlCount = await db.select()
      .from(urls)
      .where(
        and(
          eq(urls.campaignId, campaignId),
          eq(urls.status, 'active')
        )
      );
      
    const activeUrlCount = urlCount.length;
    
    if (activeUrlCount === 0) {
      // Campaign still has no active URLs, ensure it's paused
      const status = await trafficStarService.getCampaignStatus(parseInt(trafficstarCampaignId));
      
      if (status.active) {
        console.log(`⚠️ Campaign ${campaignId} has no active URLs but is currently running - pausing it`);
        
        // Pause the campaign
        await trafficStarService.pauseCampaign(parseInt(trafficstarCampaignId));
        console.log(`✅ Paused campaign ${campaignId} due to no active URLs`);
      }
    } else {
      // Campaign now has active URLs, remove from monitoring
      console.log(`Campaign ${campaignId} now has ${activeUrlCount} active URLs - removing from empty URL monitoring`);
      await campaignMonitoringManager.removeCampaignFromMonitoring(
        campaignId,
        'empty_url'
      );
    }
  } catch (error) {
    console.error(`❌ Error monitoring empty URL status for campaign ${campaignId}:`, error);
  }
}

/**
 * Check If Campaign Should Be Reactivated
 * 
 * Checks if a paused campaign has enough remaining clicks to be reactivated
 * 
 * @param campaignId - The ID of the campaign to check
 * @param trafficstarCampaignId - The TrafficStar campaign ID
 */
async function checkIfCampaignShouldBeReactivated(campaignId: number, trafficstarCampaignId: string): Promise<void> {
  console.log(`🔄 Checking if campaign ${campaignId} should be reactivated`);
  
  try {
    // Get the campaign details
    const campaignRecord = await db.select({
      remainingClicksThreshold: campaigns.remainingClicksThreshold
    })
    .from(campaigns)
    .where(eq(campaigns.id, campaignId))
    .then(records => records[0]);
    
    if (!campaignRecord) {
      console.log(`⚠️ Campaign record not found for campaign ${campaignId}`);
      return;
    }
    
    // Get the reactivation threshold
    const thresholds = await getCampaignThresholds(campaignId);
    const reactivationThreshold = campaignRecord.remainingClicksThreshold || thresholds.remainingClicksThreshold;
    
    // Get all active URLs for the campaign
    const activeUrls = await db.select()
      .from(urls)
      .where(
        and(
          eq(urls.campaignId, campaignId),
          eq(urls.status, 'active')
        )
      );
    
    // Count total remaining clicks
    let totalRemainingClicks = 0;
    for (const url of activeUrls) {
      const remainingClicks = url.clickLimit - url.clicks;
      if (remainingClicks > 0) {
        totalRemainingClicks += remainingClicks;
      }
    }
    
    console.log(`Campaign ${campaignId} has ${totalRemainingClicks} remaining clicks, reactivation threshold is ${reactivationThreshold}`);
    
    // Check if the campaign has enough remaining clicks to be reactivated
    if (totalRemainingClicks >= reactivationThreshold) {
      // Get current campaign status
      const status = await trafficStarService.getCampaignStatus(parseInt(trafficstarCampaignId));
      
      // If campaign is paused, reactivate it
      if (!status.active) {
        console.log(`🟢 Reactivating campaign ${campaignId} (TrafficStar ID: ${trafficstarCampaignId}) as it now has ${totalRemainingClicks} remaining clicks`);
        
        // Activate the campaign
        await trafficStarService.activateCampaign(parseInt(trafficstarCampaignId));
        
        // Remove from pause monitoring
        await campaignMonitoringManager.removeCampaignFromMonitoring(
          campaignId,
          'pause_status'
        );
        
        // Add to active monitoring to ensure it stays active
        await campaignMonitoringManager.addCampaignToMonitoring(
          campaignId,
          trafficstarCampaignId,
          'active_status'
        );
      }
    }
  } catch (error) {
    console.error(`❌ Error checking if campaign ${campaignId} should be reactivated:`, error);
  }
}
/**
 * Traffic Generator Module
 * 
 * This module manages the traffic generator functionality,
 * which checks TrafficStar campaign status and manages campaigns
 * based on the traffic generator settings.
 */

import { trafficStarService, TrafficStarService } from './trafficstar-service-new';
import { db } from './db';
import { campaigns, urls, type Campaign, type Url } from '../shared/schema';
import { eq, and, sql } from 'drizzle-orm';
import { getSpentValueForDate } from './spent-value';
import axios from 'axios';

// Extended URL type with active status
interface UrlWithActiveStatus extends Url {
  isActive: boolean;
}

/**
 * Get TrafficStar campaign status - ALWAYS uses real-time data
 * @param trafficstarCampaignId The TrafficStar campaign ID
 * @returns The campaign status (active, paused, etc.) or null if error
 */
export async function getTrafficStarCampaignStatus(trafficstarCampaignId: string) {
  try {
    console.log(`TRAFFIC-GENERATOR: Getting REAL-TIME status for campaign ${trafficstarCampaignId}`);
    
    // Use trafficStarService to get campaign status - uses getCampaignStatus to ensure real-time data
    const status = await trafficStarService.getCampaignStatus(Number(trafficstarCampaignId));
    
    if (!status) {
      console.error(`Failed to get TrafficStar campaign ${trafficstarCampaignId} status`);
      return null;
    }
    
    // Return the campaign status (active or paused)
    console.log(`TRAFFIC-GENERATOR: TrafficStar campaign ${trafficstarCampaignId} REAL status is ${status.status}, active=${status.active}`);
    
    // Convert status object to string status for compatibility with existing code
    return status.active ? 'active' : 'paused';
  } catch (error) {
    console.error('Error getting TrafficStar campaign status:', error);
    return null;
  }
}

/**
 * Get current spent value for a TrafficStar campaign
 * @param campaignId The campaign ID in our system
 * @param trafficstarCampaignId The TrafficStar campaign ID
 * @returns The current spent value as a number, or null if error
 */
export async function getTrafficStarCampaignSpentValue(campaignId: number, trafficstarCampaignId: string): Promise<number | null> {
  try {
    // Get today's date in YYYY-MM-DD format
    const today = new Date();
    const formattedDate = today.toISOString().split('T')[0];
    
    console.log(`Fetching spent value for campaign ${trafficstarCampaignId} on ${formattedDate}`);
    
    // Use the existing spent value tracking functionality
    const spentValue = await getSpentValueForDate(Number(trafficstarCampaignId), formattedDate);
    
    if (spentValue === null) {
      console.error(`Failed to get spent value for campaign ${trafficstarCampaignId}`);
      return null;
    }
    
    // Convert spent value to number - remove $ and parse as float
    const numericValue = parseFloat(spentValue.replace('$', ''));
    console.log(`Campaign ${trafficstarCampaignId} spent value: $${numericValue.toFixed(4)}`);
    
    return numericValue;
  } catch (error) {
    console.error(`Error getting spent value for campaign ${trafficstarCampaignId}:`, error);
    return null;
  }
}

/**
 * Handle campaign based on spent value threshold after pause
 * @param campaignId The campaign ID in our system
 * @param trafficstarCampaignId The TrafficStar campaign ID
 * @param spentValue The current spent value of the campaign
 */
export async function handleCampaignBySpentValue(campaignId: number, trafficstarCampaignId: string, spentValue: number) {
  const THRESHOLD = 10.0; // $10 threshold for different handling
  const REMAINING_CLICKS_THRESHOLD = 15000; // Threshold for auto-activation if campaign has low spend
  const MINIMUM_CLICKS_THRESHOLD = 5000; // Threshold to pause campaign when remaining clicks fall below this value
  
  try {
    console.log(`TRAFFIC-GENERATOR: Handling campaign ${trafficstarCampaignId} by spent value - current spent: $${spentValue.toFixed(4)}`);
    
    if (spentValue < THRESHOLD) {
      // Handle campaign with less than $10 spent
      console.log(`🔵 LOW SPEND ($${spentValue.toFixed(4)} < $${THRESHOLD.toFixed(2)}): Campaign ${trafficstarCampaignId} has spent less than $${THRESHOLD.toFixed(2)}`);
      
      // Get the campaign details to check URLs and remaining clicks
      const campaign = await db.query.campaigns.findFirst({
        where: (campaign, { eq }) => eq(campaign.id, campaignId),
        with: {
          urls: true
        }
      }) as (Campaign & { urls: UrlWithActiveStatus[] }) | null;
      
      if (!campaign || !campaign.urls || campaign.urls.length === 0) {
        console.log(`⏹️ LOW SPEND ACTION: Campaign ${trafficstarCampaignId} has no URLs - skipping auto-reactivation check`);
      } else {
        // Calculate total remaining clicks across all active URLs
        let totalRemainingClicks = 0;
        for (const url of campaign.urls) {
          if (url.status === 'active' && url.isActive) {
            const remainingClicks = url.clickLimit - url.clicks;
            totalRemainingClicks += remainingClicks > 0 ? remainingClicks : 0;
          }
        }
        
        console.log(`📊 Campaign ${trafficstarCampaignId} has ${totalRemainingClicks} total remaining clicks across all active URLs`);
        
        // Get real-time campaign status
        const currentStatus = await getTrafficStarCampaignStatus(trafficstarCampaignId);
        console.log(`📊 Campaign ${trafficstarCampaignId} current status: ${currentStatus}`);
        
        // Handle based on remaining clicks and current status
        if (totalRemainingClicks >= REMAINING_CLICKS_THRESHOLD && currentStatus !== 'active') {
          // Case 1: High remaining clicks (≥15,000) but not active - ACTIVATE CAMPAIGN
          console.log(`✅ Campaign ${trafficstarCampaignId} has ${totalRemainingClicks} remaining clicks (>= ${REMAINING_CLICKS_THRESHOLD}) - will attempt auto-reactivation`);
          
          try {
            // Set end time to 23:59 UTC today
            const today = new Date();
            const todayStr = today.toISOString().split('T')[0]; // YYYY-MM-DD
            const endTimeStr = `${todayStr} 23:59:00`;
            
            // First set the end time, then activate
            await trafficStarService.updateCampaignEndTime(Number(trafficstarCampaignId), endTimeStr);
            console.log(`✅ Set campaign ${trafficstarCampaignId} end time to ${endTimeStr}`);
            
            // Attempt to reactivate the campaign since it has low spend but high remaining clicks
            try {
              await trafficStarService.activateCampaign(Number(trafficstarCampaignId));
              
              // If we get here without an error, the campaign was activated successfully
              console.log(`✅ AUTO-REACTIVATED low spend campaign ${trafficstarCampaignId} - it has ${totalRemainingClicks} remaining clicks`);
              
              // Mark as auto-reactivated in the database
              await db.update(campaigns)
                .set({
                  lastTrafficSenderStatus: 'auto_reactivated_low_spend',
                  lastTrafficSenderAction: new Date(),
                  updatedAt: new Date()
                })
                .where(eq(campaigns.id, campaignId));
              
              console.log(`✅ Marked campaign ${campaignId} as 'auto_reactivated_low_spend' in database`);
              
              // Start minute-by-minute monitoring to check if the campaign stays active
              startMinutelyStatusCheck(campaignId, trafficstarCampaignId);
              
              return;
            } catch (activateError) {
              console.error(`❌ Failed to auto-reactivate low spend campaign ${trafficstarCampaignId}:`, activateError);
            }
          } catch (error) {
            console.error(`❌ Error auto-reactivating low spend campaign ${trafficstarCampaignId}:`, error);
          }
        } else if (totalRemainingClicks <= MINIMUM_CLICKS_THRESHOLD && currentStatus === 'active') {
          // Case 2: Low remaining clicks (≤5,000) and active - PAUSE CAMPAIGN
          console.log(`⏹️ Campaign ${trafficstarCampaignId} only has ${totalRemainingClicks} remaining clicks (<= ${MINIMUM_CLICKS_THRESHOLD}) - will pause campaign`);
          
          try {
            // Set current date/time for end time
            const now = new Date();
            const formattedDateTime = now.toISOString().replace('T', ' ').split('.')[0]; // YYYY-MM-DD HH:MM:SS
            
            // First pause the campaign
            try {
              await trafficStarService.pauseCampaign(Number(trafficstarCampaignId));
              
              try {
                // Then set its end time
                await trafficStarService.updateCampaignEndTime(Number(trafficstarCampaignId), formattedDateTime);
                
                console.log(`✅ PAUSED low spend campaign ${trafficstarCampaignId} due to low remaining clicks (${totalRemainingClicks} <= ${MINIMUM_CLICKS_THRESHOLD})`);
                
                // Mark as auto-paused in the database
                await db.update(campaigns)
                  .set({
                    lastTrafficSenderStatus: 'auto_paused_low_clicks',
                    lastTrafficSenderAction: new Date(),
                    updatedAt: new Date()
                  })
                  .where(eq(campaigns.id, campaignId));
                
                console.log(`✅ Marked campaign ${campaignId} as 'auto_paused_low_clicks' in database`);
                
                // Start pause status monitoring to ensure campaign stays paused
                startMinutelyPauseStatusCheck(campaignId, trafficstarCampaignId);
                
                return;
              } catch (endTimeError) {
                console.error(`❌ Error setting end time for campaign ${trafficstarCampaignId}:`, endTimeError);
              }
            } catch (pauseError) {
              console.error(`❌ Failed to pause low spend campaign ${trafficstarCampaignId} with low remaining clicks:`, pauseError);
            }
          } catch (error) {
            console.error(`❌ Error pausing low spend campaign ${trafficstarCampaignId} with low remaining clicks:`, error);
          }
        } else if (totalRemainingClicks >= REMAINING_CLICKS_THRESHOLD && currentStatus === 'active') {
          // Case 3: High remaining clicks and already active - CONTINUE MONITORING
          console.log(`✅ Campaign ${trafficstarCampaignId} has ${totalRemainingClicks} remaining clicks and is already active - continuing monitoring`);
          
          // Ensure we're monitoring this campaign
          startMinutelyStatusCheck(campaignId, trafficstarCampaignId);
          
          // Mark status in database
          await db.update(campaigns)
            .set({
              lastTrafficSenderStatus: 'active_with_sufficient_clicks',
              lastTrafficSenderAction: new Date(),
              updatedAt: new Date()
            })
            .where(eq(campaigns.id, campaignId));
          
          return;
        } else if (totalRemainingClicks <= MINIMUM_CLICKS_THRESHOLD && currentStatus !== 'active') {
          // Case 4: Low remaining clicks and already paused - CONTINUE PAUSE MONITORING
          console.log(`⏹️ Campaign ${trafficstarCampaignId} has ${totalRemainingClicks} remaining clicks (<= ${MINIMUM_CLICKS_THRESHOLD}) and is already paused - monitoring to ensure it stays paused`);
          
          // Ensure we're monitoring this campaign's pause status
          startMinutelyPauseStatusCheck(campaignId, trafficstarCampaignId);
          
          // Mark status in database
          await db.update(campaigns)
            .set({
              lastTrafficSenderStatus: 'paused_with_low_clicks',
              lastTrafficSenderAction: new Date(),
              updatedAt: new Date()
            })
            .where(eq(campaigns.id, campaignId));
          
          return;
        } else {
          // Case 5: Remaining clicks between thresholds - maintain current status
          console.log(`⏸️ Campaign ${trafficstarCampaignId} has ${totalRemainingClicks} remaining clicks (between thresholds) - maintaining current status`);
          
          // Mark status in database
          await db.update(campaigns)
            .set({
              lastTrafficSenderStatus: 'between_click_thresholds',
              lastTrafficSenderAction: new Date(),
              updatedAt: new Date()
            })
            .where(eq(campaigns.id, campaignId));
        }
      }
      
      // Default action if no specific action was taken
      if (!await db.query.campaigns.findFirst({
        where: (c, { eq, and }) => and(
          eq(c.id, campaignId),
          eq(c.lastTrafficSenderStatus, 'low_spend')
        )
      })) {
        // Only update if not already set by one of the above conditions
        await db.update(campaigns)
          .set({
            lastTrafficSenderStatus: 'low_spend',
            lastTrafficSenderAction: new Date(),
            updatedAt: new Date()
          })
          .where(eq(campaigns.id, campaignId));
        
        console.log(`✅ Marked campaign ${campaignId} as 'low_spend' in database`);
      }
    } else {
      // Handle campaign with $10 or more spent
      console.log(`🟢 HIGH SPEND ($${spentValue.toFixed(4)} >= $${THRESHOLD.toFixed(2)}): Campaign ${trafficstarCampaignId} has spent $${THRESHOLD.toFixed(2)} or more`);
      
      // Mark this in the database
      await db.update(campaigns)
        .set({
          lastTrafficSenderStatus: 'high_spend',
          lastTrafficSenderAction: new Date(),
          updatedAt: new Date()
        })
        .where(eq(campaigns.id, campaignId));
      
      console.log(`✅ Marked campaign ${campaignId} as 'high_spend' in database`);
    }
  } catch (error) {
    console.error(`Error handling campaign ${trafficstarCampaignId} by spent value:`, error);
  }
}

/**
 * Maps to store status check intervals by campaign ID
 * These prevent duplicate intervals from being created for the same campaign
 */
const activeStatusChecks = new Map<number, NodeJS.Timeout>();
const pauseStatusChecks = new Map<number, NodeJS.Timeout>();

/**
 * Start minute-by-minute check for campaign status
 * This ensures the campaign stays active after reactivation
 * @param campaignId The campaign ID in our system
 * @param trafficstarCampaignId The TrafficStar campaign ID
 */
function startMinutelyStatusCheck(campaignId: number, trafficstarCampaignId: string) {
  // Clear existing interval if there is one
  if (activeStatusChecks.has(campaignId)) {
    clearInterval(activeStatusChecks.get(campaignId));
    activeStatusChecks.delete(campaignId);
  }
  
  // Also clear any pause status checks for this campaign
  if (pauseStatusChecks.has(campaignId)) {
    clearInterval(pauseStatusChecks.get(campaignId));
    pauseStatusChecks.delete(campaignId);
  }
  
  console.log(`🔄 Starting minute-by-minute ACTIVE status check for campaign ${trafficstarCampaignId}`);
  
  // Set up a new interval that runs every minute
  const interval = setInterval(async () => {
    console.log(`⏱️ Running minute check for campaign ${trafficstarCampaignId} active status`);
    
    try {
      // Get the current status
      const status = await getTrafficStarCampaignStatus(trafficstarCampaignId);
      
      if (status === 'active') {
        console.log(`✅ Campaign ${trafficstarCampaignId} is still active - monitoring will continue`);
        
        // Check if we need to pause based on remaining clicks
        const campaign = await db.query.campaigns.findFirst({
          where: (campaign, { eq }) => eq(campaign.id, campaignId),
          with: { urls: true }
        }) as (Campaign & { urls: UrlWithActiveStatus[] }) | null;
        
        if (campaign && campaign.urls && campaign.urls.length > 0) {
          // Calculate total remaining clicks
          let totalRemainingClicks = 0;
          for (const url of campaign.urls) {
            if (url.status === 'active' && url.isActive) {
              const remainingClicks = url.clickLimit - url.clicks;
              totalRemainingClicks += remainingClicks > 0 ? remainingClicks : 0;
            }
          }
          
          // If remaining clicks fell below threshold, pause the campaign
          const MINIMUM_CLICKS_THRESHOLD = 5000;
          if (totalRemainingClicks <= MINIMUM_CLICKS_THRESHOLD) {
            console.log(`⏹️ During monitoring: Campaign ${trafficstarCampaignId} remaining clicks (${totalRemainingClicks}) fell below threshold (${MINIMUM_CLICKS_THRESHOLD}) - pausing campaign`);
            
            // Stop active status monitoring since we're switching to pause monitoring
            clearInterval(interval);
            activeStatusChecks.delete(campaignId);
            
            try {
              // Set current date/time for end time
              const now = new Date();
              const formattedDateTime = now.toISOString().replace('T', ' ').split('.')[0]; // YYYY-MM-DD HH:MM:SS
              
              // First pause the campaign
              try {
                await trafficStarService.pauseCampaign(Number(trafficstarCampaignId));
                
                // Then set its end time
                await trafficStarService.updateCampaignEndTime(Number(trafficstarCampaignId), formattedDateTime);
                console.log(`✅ PAUSED campaign ${trafficstarCampaignId} during active monitoring due to low remaining clicks (${totalRemainingClicks} <= ${MINIMUM_CLICKS_THRESHOLD})`);
                
                // Mark as auto-paused in the database
                await db.update(campaigns)
                  .set({
                    lastTrafficSenderStatus: 'auto_paused_during_monitoring',
                    lastTrafficSenderAction: new Date(),
                    updatedAt: new Date()
                  })
                  .where(eq(campaigns.id, campaignId));
                
                // Start pause monitoring
                startMinutelyPauseStatusCheck(campaignId, trafficstarCampaignId);
              } catch (pauseError) {
                console.error(`❌ Error pausing campaign ${trafficstarCampaignId} during active monitoring:`, pauseError);
              }
            } catch (error) {
              console.error(`❌ Error pausing campaign ${trafficstarCampaignId} during active monitoring:`, error);
            }
          }
        }
      } else {
        console.log(`❌ Campaign ${trafficstarCampaignId} is no longer active (status: ${status}) - attempting to reactivate`);
        
        // Set end time to 23:59 UTC today before reactivating
        const today = new Date();
        const todayStr = today.toISOString().split('T')[0]; // YYYY-MM-DD
        const endTimeStr = `${todayStr} 23:59:00`;
        
        // First set the end time, then activate
        try {
          await trafficStarService.updateCampaignEndTime(Number(trafficstarCampaignId), endTimeStr);
          console.log(`✅ Updated campaign ${trafficstarCampaignId} end time to ${endTimeStr} before reactivation`);
          
          // Attempt to reactivate
          try {
            await trafficStarService.activateCampaign(Number(trafficstarCampaignId));
            console.log(`✅ Successfully reactivated campaign ${trafficstarCampaignId} during minute check`);
            
            // Update database status
            await db.update(campaigns)
              .set({
                lastTrafficSenderStatus: 'reactivated_during_monitoring',
                lastTrafficSenderAction: new Date(),
                updatedAt: new Date()
              })
              .where(eq(campaigns.id, campaignId));
          } catch (activateError) {
            console.error(`❌ Failed to reactivate campaign ${trafficstarCampaignId} during minute check:`, activateError);
            
            // Stop monitoring after multiple failures
            clearInterval(interval);
            activeStatusChecks.delete(campaignId);
            console.log(`⏹️ Stopped minute-by-minute monitoring for campaign ${trafficstarCampaignId} due to reactivation failure`);
          }
        } catch (endTimeError) {
          console.error(`❌ Error updating end time for campaign ${trafficstarCampaignId} during minute check:`, endTimeError);
        }
      }
    } catch (error) {
      console.error(`Error during minute check for campaign ${trafficstarCampaignId}:`, error);
    }
  }, 60 * 1000); // Check every minute
  
  // Store the interval in our map
  activeStatusChecks.set(campaignId, interval);
  
  // Automatically stop checking after 60 minutes (to prevent endless monitoring)
  setTimeout(() => {
    if (activeStatusChecks.has(campaignId)) {
      clearInterval(activeStatusChecks.get(campaignId));
      activeStatusChecks.delete(campaignId);
      console.log(`⏱️ Automatically stopped minute-by-minute active monitoring for campaign ${trafficstarCampaignId} after 60 minutes`);
    }
  }, 60 * 60 * 1000);
}

/**
 * Start minute-by-minute check for campaign PAUSE status
 * This ensures the campaign stays paused when it should be paused
 * @param campaignId The campaign ID in our system
 * @param trafficstarCampaignId The TrafficStar campaign ID
 */
function startMinutelyPauseStatusCheck(campaignId: number, trafficstarCampaignId: string) {
  // Clear existing pause interval if there is one
  if (pauseStatusChecks.has(campaignId)) {
    clearInterval(pauseStatusChecks.get(campaignId));
    pauseStatusChecks.delete(campaignId);
  }
  
  // Also clear any active status checks for this campaign
  if (activeStatusChecks.has(campaignId)) {
    clearInterval(activeStatusChecks.get(campaignId));
    activeStatusChecks.delete(campaignId);
  }
  
  console.log(`🔄 Starting minute-by-minute PAUSE status check for campaign ${trafficstarCampaignId}`);
  
  // Set up a new interval that runs every minute
  const interval = setInterval(async () => {
    console.log(`⏱️ Running minute check for campaign ${trafficstarCampaignId} pause status`);
    
    try {
      // Get the current status
      const status = await getTrafficStarCampaignStatus(trafficstarCampaignId);
      
      if (status === 'paused') {
        console.log(`✅ Campaign ${trafficstarCampaignId} is still paused - monitoring will continue`);
        
        // Check if we need to reactive based on remaining clicks
        const campaign = await db.query.campaigns.findFirst({
          where: (campaign, { eq }) => eq(campaign.id, campaignId),
          with: { urls: true }
        }) as (Campaign & { urls: UrlWithActiveStatus[] }) | null;
        
        if (campaign && campaign.urls && campaign.urls.length > 0) {
          // Calculate total remaining clicks
          let totalRemainingClicks = 0;
          for (const url of campaign.urls) {
            if (url.status === 'active' && url.isActive) {
              const remainingClicks = url.clickLimit - url.clicks;
              totalRemainingClicks += remainingClicks > 0 ? remainingClicks : 0;
            }
          }
          
          // If remaining clicks rose above threshold, reactivate the campaign
          const REMAINING_CLICKS_THRESHOLD = 15000;
          if (totalRemainingClicks >= REMAINING_CLICKS_THRESHOLD) {
            console.log(`▶️ During pause monitoring: Campaign ${trafficstarCampaignId} remaining clicks (${totalRemainingClicks}) rose above threshold (${REMAINING_CLICKS_THRESHOLD}) - reactivating campaign`);
            
            // Stop pause status monitoring since we're switching to active monitoring
            clearInterval(interval);
            pauseStatusChecks.delete(campaignId);
            
            try {
              // Set end time to 23:59 UTC today
              const today = new Date();
              const todayStr = today.toISOString().split('T')[0]; // YYYY-MM-DD
              const endTimeStr = `${todayStr} 23:59:00`;
              
              // First set the end time, then activate
              try {
                await trafficStarService.updateCampaignEndTime(Number(trafficstarCampaignId), endTimeStr);
                console.log(`✅ Set campaign ${trafficstarCampaignId} end time to ${endTimeStr}`);
                
                // Attempt to reactivate
                try {
                  await trafficStarService.activateCampaign(Number(trafficstarCampaignId));
                  console.log(`✅ Successfully reactivated campaign ${trafficstarCampaignId} during pause monitoring`);
                  
                  // Mark as auto-reactivated in the database
                  await db.update(campaigns)
                    .set({
                      lastTrafficSenderStatus: 'auto_reactivated_during_pause_monitoring',
                      lastTrafficSenderAction: new Date(),
                      updatedAt: new Date()
                    })
                    .where(eq(campaigns.id, campaignId));
                  
                  // Start active monitoring
                  startMinutelyStatusCheck(campaignId, trafficstarCampaignId);
                } catch (activateError) {
                  console.error(`❌ Error reactivating campaign ${trafficstarCampaignId} during pause monitoring:`, activateError);
                }
              } catch (endTimeError) {
                console.error(`❌ Error updating end time for campaign ${trafficstarCampaignId} during pause monitoring:`, endTimeError);
              }
            } catch (error) {
              console.error(`❌ Error reactivating campaign ${trafficstarCampaignId} during pause monitoring:`, error);
            }
          }
        }
      } else {
        console.log(`❌ Campaign ${trafficstarCampaignId} is not paused (status: ${status}) - attempting to pause`);
        
        // Set current date/time for end time
        const now = new Date();
        const formattedDateTime = now.toISOString().replace('T', ' ').split('.')[0]; // YYYY-MM-DD HH:MM:SS
        
        // Attempt to pause
        try {
          await trafficStarService.pauseCampaign(Number(trafficstarCampaignId));
          
          // Update end time
          await trafficStarService.updateCampaignEndTime(Number(trafficstarCampaignId), formattedDateTime);
          
          console.log(`✅ Successfully paused campaign ${trafficstarCampaignId} during pause monitoring`);
          
          // Update database status
          await db.update(campaigns)
            .set({
              lastTrafficSenderStatus: 'repaused_during_monitoring',
              lastTrafficSenderAction: new Date(),
              updatedAt: new Date()
            })
            .where(eq(campaigns.id, campaignId));
        } catch (pauseError) {
          console.error(`❌ Failed to pause campaign ${trafficstarCampaignId} during pause monitoring:`, pauseError);
          
          // Stop monitoring after multiple failures
          clearInterval(interval);
          pauseStatusChecks.delete(campaignId);
          console.log(`⏹️ Stopped minute-by-minute pause monitoring for campaign ${trafficstarCampaignId} due to repause failure`);
        }
      }
    } catch (error) {
      console.error(`Error during pause monitoring for campaign ${trafficstarCampaignId}:`, error);
    }
  }, 60 * 1000); // Check every minute
  
  // Store the interval in our map
  pauseStatusChecks.set(campaignId, interval);
  
  // Automatically stop checking after 60 minutes (to prevent endless monitoring)
  setTimeout(() => {
    if (pauseStatusChecks.has(campaignId)) {
      clearInterval(pauseStatusChecks.get(campaignId));
      pauseStatusChecks.delete(campaignId);
      console.log(`⏱️ Automatically stopped minute-by-minute pause monitoring for campaign ${trafficstarCampaignId} after 60 minutes`);
    }
  }, 60 * 60 * 1000);
}

/**
 * Pause TrafficStar campaign
 * @param trafficstarCampaignId The TrafficStar campaign ID
 * @returns True if the pause operation was successful, false otherwise
 */
export async function pauseTrafficStarCampaign(trafficstarCampaignId: string): Promise<boolean> {
  try {
    // Use trafficStarService to pause campaign
    await trafficStarService.pauseCampaign(Number(trafficstarCampaignId));
    return true;
  } catch (error) {
    console.error('Error pausing TrafficStar campaign:', error);
    return false;
  }
}

/**
 * Process Traffic Generator for a campaign
 * @param campaignId The campaign ID
 * @param forceMode Optional mode for testing - can be 'force_activate' or 'force_pause'
 */
export async function processTrafficGenerator(campaignId: number, forceMode?: string) {
  try {
    // Get campaign details
    const campaign = await db.query.campaigns.findFirst({
      where: (campaign, { eq }) => eq(campaign.id, campaignId)
    });
    
    if (!campaign) {
      console.log(`Campaign ${campaignId} not found for traffic generator processing`);
      return;
    }
    
    // Check if traffic generator is enabled
    if (!campaign.trafficGeneratorEnabled) {
      console.log(`Traffic generator is disabled for campaign ${campaignId}`);
      return;
    }
    
    // Check if campaign has TrafficStar campaign ID
    if (!campaign.trafficstarCampaignId) {
      console.log(`Campaign ${campaignId} has no TrafficStar campaign ID`);
      return;
    }
    
    // Get TrafficStar campaign status
    const status = await getTrafficStarCampaignStatus(campaign.trafficstarCampaignId);
    
    if (!status) {
      console.error(`Failed to get status for TrafficStar campaign ${campaign.trafficstarCampaignId}`);
      return;
    }
    
    console.log(`TrafficStar campaign ${campaign.trafficstarCampaignId} status: ${status}`);
    
    // Handle force mode for testing if specified
    const shouldForceActivate = forceMode === 'force_activate';
    const shouldForcePause = forceMode === 'force_pause';
    
    if (shouldForceActivate) {
      console.log(`🧪 TESTING: Force activating TrafficStar campaign ${campaign.trafficstarCampaignId}`);
      
      try {
        // Set end time to 23:59 UTC today
        const today = new Date();
        const endTime = new Date(today);
        endTime.setUTCHours(23, 59, 0, 0); // 23:59 UTC
        
        // Format date to TrafficStar expected format: YYYY-MM-DD HH:MM:SS
        const formattedEndTime = `${endTime.getUTCFullYear()}-${String(endTime.getUTCMonth() + 1).padStart(2, '0')}-${String(endTime.getUTCDate()).padStart(2, '0')} 23:59:00`;
        
        console.log(`Setting campaign end time to ${formattedEndTime}`);
        
        // Get API token
        const trafficStarService = new TrafficStarService();
        let accessToken;
        try {
          accessToken = await trafficStarService.ensureToken();
          
          if (!accessToken) {
            console.error(`Failed to get access token for TrafficStar campaign ${campaign.trafficstarCampaignId}`);
            return;
          }
        } catch (tokenError) {
          console.error(`Error getting access token for TrafficStar campaign ${campaign.trafficstarCampaignId}:`, tokenError);
          return;
        }
        
        // Use direct PATCH request to the API to both set end time and activate campaign
        const apiUrl = `https://api.trafficstars.com/v1.1/campaigns/${campaign.trafficstarCampaignId}`;
        console.log(`Making direct API call to ${apiUrl} to activate campaign and set end time to ${formattedEndTime}`);
        
        try {
          const response = await axios.patch(
            apiUrl, 
            { 
              active: true,
              end_time: formattedEndTime
            },
            { 
              headers: { 
                'Authorization': `Bearer ${accessToken}`,
                'Accept': 'application/json',
                'Content-Type': 'application/json'
              } 
            }
          );
          
          if (response.status === 200 || response.status === 204) {
            console.log(`✅ Successfully activated TrafficStar campaign ${campaign.trafficstarCampaignId} and set end time to ${formattedEndTime}`);
            
            // Update campaign status in database
            await db.update(campaigns)
              .set({
                lastTrafficSenderStatus: 'active',
                lastTrafficSenderAction: new Date(),
                updatedAt: new Date()
              })
              .where(eq(campaigns.id, campaign.id));
            
            // Start minute-by-minute check to ensure the campaign stays active
            startMinutelyStatusCheck(campaign.id, campaign.trafficstarCampaignId);
          } else {
            console.error(`❌ Unexpected status code ${response.status} when activating campaign ${campaign.trafficstarCampaignId}`);
          }
        } catch (apiError) {
          console.error(`❌ API error activating campaign ${campaign.trafficstarCampaignId}:`, apiError);
        }
      } catch (error) {
        console.error(`❌ Error during force activation of TrafficStar campaign ${campaign.trafficstarCampaignId}:`, error);
      }
      
      return;
    }
    
    // Now we have the correct API implemented, so we can resume pausing campaigns
    if (status === 'active' || shouldForcePause) {
      if (shouldForcePause) {
        console.log(`🧪 TESTING: Force pausing TrafficStar campaign ${campaign.trafficstarCampaignId}`);
      } else {
        console.log(`✓ CORRECTLY DETECTED: TrafficStar campaign ${campaign.trafficstarCampaignId} is ACTIVE!`);
      }
      console.log(`Pausing TrafficStar campaign ${campaign.trafficstarCampaignId} using updated API endpoints...`);
      
      // Try to pause the campaign using our improved API endpoints
      try {
        const pauseSuccessful = await pauseTrafficStarCampaign(campaign.trafficstarCampaignId);
        
        if (pauseSuccessful) {
          console.log(`✅ Successfully paused TrafficStar campaign ${campaign.trafficstarCampaignId}`);
          
          // Update campaign status in database
          await db.update(campaigns)
            .set({
              lastTrafficSenderStatus: 'paused',
              lastTrafficSenderAction: new Date(),
              updatedAt: new Date()
            })
            .where(eq(campaigns.id, campaign.id));
          
          // Get the configured post-pause check interval (default to 2 minutes if not set)
          const postPauseCheckMinutes = campaign.postPauseCheckMinutes || 2;
          
          // Schedule a post-pause spent value check after the configured minutes
          console.log(`⏱️ Scheduling post-pause spent value check for campaign ${campaign.id} in ${postPauseCheckMinutes} minutes...`);
          
          setTimeout(async () => {
            console.log(`⏰ Running scheduled post-pause spent value check for campaign ${campaign.id} after ${postPauseCheckMinutes} minutes`);
            
            try {
              // Get the spent value
              const spentValue = await getTrafficStarCampaignSpentValue(campaign.id, campaign.trafficstarCampaignId!);
              
              if (spentValue !== null) {
                // Handle campaign based on spent value
                await handleCampaignBySpentValue(campaign.id, campaign.trafficstarCampaignId!, spentValue);
              } else {
                console.error(`❌ Failed to get spent value for post-pause check of campaign ${campaign.id}`);
              }
            } catch (error) {
              console.error(`❌ Error in post-pause spent value check for campaign ${campaign.id}:`, error);
            }
          }, postPauseCheckMinutes * 60 * 1000); // Convert minutes to milliseconds
        } else {
          console.error(`❌ Failed to pause TrafficStar campaign ${campaign.trafficstarCampaignId}`);
        }
      } catch (error) {
        console.error(`❌ Error pausing TrafficStar campaign ${campaign.trafficstarCampaignId}:`, error);
      }
    } else {
      console.log(`TrafficStar campaign ${campaign.trafficstarCampaignId} is already ${status}, no action needed`);
    }
  } catch (error) {
    console.error('Error processing traffic generator for campaign:', campaignId, error);
  }
}

/**
 * Run traffic generator for all campaigns
 * This function should be scheduled to run periodically
 */
export async function runTrafficGeneratorForAllCampaigns() {
  try {
    // Get all campaigns with traffic generator enabled
    const campaignsWithGenerator = await db.select()
      .from(campaigns)
      .where(eq(campaigns.trafficGeneratorEnabled, true));
    
    console.log(`Processing ${campaignsWithGenerator.length} campaigns with traffic generator enabled`);
    
    // Process each campaign
    for (const campaign of campaignsWithGenerator) {
      await processTrafficGenerator(campaign.id);
    }
  } catch (error) {
    console.error('Error running traffic generator for all campaigns:', error);
  }
}

/**
 * Initialize Traffic Generator scheduler
 * This function sets up a periodic job to run the traffic generator
 */
export function initializeTrafficGeneratorScheduler() {
  console.log('Initializing Traffic Generator scheduler');
  
  // Check all campaigns with traffic generator enabled every 5 minutes
  const intervalMinutes = 5;
  const intervalMs = intervalMinutes * 60 * 1000;
  
  // Set up interval to run traffic generator
  setInterval(() => {
    console.log(`Running scheduled traffic generator check (every ${intervalMinutes} minutes)`);
    runTrafficGeneratorForAllCampaigns();
  }, intervalMs);
  
  // Also run immediately on startup
  console.log('Running initial traffic generator check on startup');
  runTrafficGeneratorForAllCampaigns();
}

/**
 * Debug function to test Traffic Generator with detailed logging
 * This function helps test campaigns with different click quantities
 * @param campaignId The campaign ID to test
 * @returns Debug information about the process
 */
export async function debugProcessCampaign(campaignId: number) {
  try {
    console.log(`🔍 DEBUG: Running detailed Traffic Generator check for campaign ID ${campaignId}`);
    
    // Get campaign details
    const campaignResult = await db.select()
      .from(campaigns)
      .where(eq(campaigns.id, campaignId))
      .limit(1);
    
    if (!campaignResult || campaignResult.length === 0) {
      return {
        success: false,
        message: `Campaign ${campaignId} not found`,
      };
    }
    
    const campaign = campaignResult[0];
    
    // Get campaign URLs via direct SQL query to avoid schema issues
    const urlsResult = await db.execute(
      sql`SELECT * FROM urls WHERE "campaign_id" = ${campaignId}`
    ).then(result => result.rows || []);
    
    const trafficstarCampaignId = campaign.trafficstarCampaignId;
    if (!trafficstarCampaignId) {
      return {
        success: false,
        message: `Campaign ${campaignId} does not have a TrafficStar campaign ID`,
      };
    }
    
    // Get real-time campaign status from TrafficStar
    const status = await getTrafficStarCampaignStatus(trafficstarCampaignId);
    console.log(`TrafficStar campaign ${trafficstarCampaignId} status: ${status}`);
    
    if (status === null) {
      return {
        success: false,
        message: `Failed to get status for TrafficStar campaign ${trafficstarCampaignId}`,
      };
    }
    
    // Calculate total remaining clicks for the campaign
    let totalRemainingClicks = 0;
    let highClickUrls = [];
    let lowClickUrls = [];
    
    if (urlsResult && urlsResult.length > 0) {
      for (const url of urlsResult) {
        // Cast the raw DB row to expected structure - handle both snake_case and camelCase
        const typedUrl = {
          status: url.status as string,
          clickLimit: Number(url.click_limit || url.clickLimit || 0),
          clicks: Number(url.clicks || 0),
          id: Number(url.id),
          name: url.name as string
        };
        
        if (typedUrl.status === 'active') {
          const remainingClicks = typedUrl.clickLimit - typedUrl.clicks;
          totalRemainingClicks += remainingClicks > 0 ? remainingClicks : 0;
          
          if (remainingClicks >= 15000) {
            highClickUrls.push({
              id: typedUrl.id,
              name: typedUrl.name,
              clickLimit: typedUrl.clickLimit,
              clicks: typedUrl.clicks,
              remainingClicks: remainingClicks
            });
          } else if (remainingClicks <= 5000) {
            lowClickUrls.push({
              id: typedUrl.id,
              name: typedUrl.name,
              clickLimit: typedUrl.clickLimit,
              clicks: typedUrl.clicks,
              remainingClicks: remainingClicks
            });
          }
        }
      }
    }
    
    // Get current spent value with timeout
    let spentValue = null;
    try {
      // Set a timeout of 5 seconds for the spent value API call
      const spentValuePromise = getTrafficStarCampaignSpentValue(campaignId, trafficstarCampaignId);
      const timeoutPromise = new Promise<null>((resolve) => {
        setTimeout(() => resolve(null), 5000); // 5 seconds timeout
      });
      
      spentValue = await Promise.race([spentValuePromise, timeoutPromise]);
      if (spentValue === null) {
        console.log(`Spent value API timed out for campaign ${trafficstarCampaignId}, using default value for debug purposes`);
        // Use a default value for debug purposes
        spentValue = 0.0;
      } else {
        console.log(`Campaign ${trafficstarCampaignId} spent value: ${spentValue}`);
      }
    } catch (error) {
      console.error(`Error getting spent value for campaign ${trafficstarCampaignId}:`, error);
      // For debug purposes only, use a default value
      spentValue = 0.0;
    }
    
    // Identify what action the Traffic Generator would take
    let expectedAction = "none";
    let actionReason = "";
    
    if (spentValue === null) {
      expectedAction = "error";
      actionReason = "Could not retrieve spent value";
    } else if (spentValue >= 10.0) {
      expectedAction = "high_spend_handling";
      actionReason = `Spent value $${spentValue.toFixed(4)} >= $10.00 threshold`;
    } else if (totalRemainingClicks >= 15000 && status !== 'active') {
      expectedAction = "activate";
      actionReason = `Low spend ($${spentValue.toFixed(4)}) with high remaining clicks (${totalRemainingClicks} >= 15,000)`;
    } else if (totalRemainingClicks <= 5000 && status === 'active') {
      expectedAction = "pause";
      actionReason = `Low spend ($${spentValue.toFixed(4)}) with low remaining clicks (${totalRemainingClicks} <= 5,000)`;
    } else if (totalRemainingClicks >= 15000 && status === 'active') {
      expectedAction = "monitor_active";
      actionReason = `Low spend ($${spentValue.toFixed(4)}) with high remaining clicks (${totalRemainingClicks} >= 15,000) and already active`;
    } else if (totalRemainingClicks <= 5000 && status !== 'active') {
      expectedAction = "monitor_paused";
      actionReason = `Low spend ($${spentValue.toFixed(4)}) with low remaining clicks (${totalRemainingClicks} <= 5,000) and already paused`;
    } else {
      expectedAction = "maintain_current";
      actionReason = `Low spend ($${spentValue.toFixed(4)}) with clicks between thresholds (${totalRemainingClicks})`;
    }
    
    return {
      success: true,
      campaign: {
        id: campaign.id,
        name: campaign.name,
        trafficstarCampaignId: trafficstarCampaignId,
        trafficGeneratorEnabled: campaign.trafficGeneratorEnabled,
        postPauseCheckMinutes: campaign.postPauseCheckMinutes,
        lastTrafficSenderStatus: campaign.lastTrafficSenderStatus,
        lastTrafficSenderAction: campaign.lastTrafficSenderAction
      },
      trafficStarStatus: status,
      spentValue: spentValue !== null ? `$${spentValue.toFixed(4)}` : "Unknown",
      totalRemainingClicks,
      urlStats: {
        totalUrls: urlsResult ? urlsResult.length : 0,
        highClickUrls: highClickUrls.length,
        lowClickUrls: lowClickUrls.length
      },
      trafficGeneratorAction: {
        expectedAction,
        actionReason
      },
      highClickUrls,
      lowClickUrls
    };
  } catch (error) {
    console.error(`Error in debug traffic generator for campaign ${campaignId}:`, error);
    return {
      success: false,
      message: `Error processing campaign ${campaignId}`,
      error: error instanceof Error ? error.message : String(error)
    };
  }
}
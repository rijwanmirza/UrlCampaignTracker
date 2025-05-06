/**
 * Traffic Generator Module
 * 
 * This module manages the traffic generator functionality,
 * which checks TrafficStar campaign status and manages campaigns
 * based on the traffic generator settings.
 */

import { trafficStarService } from './trafficstar-service-new';
import { db } from './db';
import { campaigns, urls, type Campaign, type Url } from '../shared/schema';
import { eq, and, sql } from 'drizzle-orm';
import { parseSpentValue } from './trafficstar-spent-helper';
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
    
    // Try getting campaign data directly from API and use our helper to parse the value
    try {
      const campaignData = await trafficStarService.getCampaign(Number(trafficstarCampaignId));
      
      // Use our parseSpentValue helper to extract the spent value regardless of format
      const spentValue = parseSpentValue(campaignData);
      
      if (spentValue > 0) {
        console.log(`Campaign ${trafficstarCampaignId} spent value from campaign object helper: $${spentValue.toFixed(4)}`);
        
        // Update our database record
        await db.update(campaigns)
          .set({
            dailySpent: spentValue.toString(),
            dailySpentDate: new Date(formattedDate),
            lastSpentCheck: new Date(),
            updatedAt: new Date()
          })
          .where(eq(campaigns.id, campaignId));
        
        return spentValue;
      }
    } catch (helperError) {
      console.error(`Failed to get spent value using helper for campaign ${trafficstarCampaignId}:`, helperError);
    }
    
    // Fallback: Try getting campaign data directly from API
    try {
      const campaignData = await trafficStarService.getCampaign(Number(trafficstarCampaignId));
      
      if (campaignData && typeof campaignData.spent === 'number') {
        console.log(`Campaign ${trafficstarCampaignId} spent value from campaign data: $${campaignData.spent.toFixed(4)}`);
        
        // Update our database record
        await db.update(campaigns)
          .set({
            dailySpent: campaignData.spent.toString(),
            dailySpentDate: new Date(formattedDate),
            lastSpentCheck: new Date(),
            updatedAt: new Date()
          })
          .where(eq(campaigns.id, campaignId));
        
        return campaignData.spent;
      } else if (campaignData && typeof campaignData.spent === 'string') {
        const numericValue = parseFloat(campaignData.spent.replace('$', ''));
        console.log(`Campaign ${trafficstarCampaignId} spent value from campaign data (string): $${numericValue.toFixed(4)}`);
        
        // Update our database record
        await db.update(campaigns)
          .set({
            dailySpent: numericValue.toString(),
            dailySpentDate: new Date(formattedDate),
            lastSpentCheck: new Date(),
            updatedAt: new Date()
          })
          .where(eq(campaigns.id, campaignId));
        
        return numericValue;
      }
    } catch (campaignDataError) {
      console.error(`Failed to get campaign data for campaign ${trafficstarCampaignId}:`, campaignDataError);
    }
    
    // Fallback: Try using the spent value service
    try {
      const result = await trafficStarService.getCampaignSpentValue(Number(trafficstarCampaignId));
      
      if (result && typeof result.totalSpent === 'number') {
        console.log(`Campaign ${trafficstarCampaignId} direct API spent value: $${result.totalSpent.toFixed(4)}`);
        
        // Update our database record
        await db.update(campaigns)
          .set({
            dailySpent: result.totalSpent.toString(),
            dailySpentDate: new Date(formattedDate),
            lastSpentCheck: new Date(),
            updatedAt: new Date()
          })
          .where(eq(campaigns.id, campaignId));
        
        return result.totalSpent;
      }
    } catch (directApiError) {
      console.error(`Failed to get spent value directly from TrafficStar API:`, directApiError);
    }
    
    // Last resort: Get the stored value from our database
    try {
      const [campaign] = await db
        .select()
        .from(campaigns)
        .where(eq(campaigns.id, campaignId));
      
      if (campaign && campaign.dailySpent !== null && campaign.dailySpent !== undefined) {
        const storedSpent = parseFloat(campaign.dailySpent);
        console.log(`Campaign ${trafficstarCampaignId} using stored spent value: $${storedSpent.toFixed(4)}`);
        return storedSpent;
      }
    } catch (dbError) {
      console.error(`Failed to get stored spent value for campaign ${trafficstarCampaignId}:`, dbError);
    }
    
    // If we couldn't get the spent value using any method, we'll use a default value of 0
    // This is not a mock/fallback, but a real representation that we don't have spent data
    console.log(`No spent data available for campaign ${trafficstarCampaignId} - using 0`);
    
    // Update database to record that we checked but found no value
    await db.update(campaigns)
      .set({
        lastSpentCheck: new Date(),
        updatedAt: new Date()
      })
      .where(eq(campaigns.id, campaignId));
    
    return 0;
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
        console.log(`🔍 DEBUG: Checking remaining clicks for ${campaign.urls.length} URLs in campaign ${trafficstarCampaignId}`);
        for (const url of campaign.urls) {
          console.log(`🔍 URL ID: ${url.id}, status: ${url.status}, clickLimit: ${url.clickLimit}, clicks: ${url.clicks}`);
          if (url.status === 'active') {
            const remainingClicks = url.clickLimit - url.clicks;
            const validRemaining = remainingClicks > 0 ? remainingClicks : 0;
            totalRemainingClicks += validRemaining;
            console.log(`✅ Adding ${validRemaining} remaining clicks from URL ID: ${url.id}`);
          } else {
            console.log(`❌ Skipping URL ID: ${url.id} with status: ${url.status}`);
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
const emptyUrlStatusChecks = new Map<number, NodeJS.Timeout>();

/**
 * Stop all monitoring intervals for a campaign
 * This is critical to ensure we don't continue monitoring
 * when Traffic Generator is disabled
 * @param campaignId The campaign ID to stop monitoring for
 */
export function stopAllMonitoring(campaignId: number): void {
  console.log(`🛑 Stopping ALL Traffic Generator monitoring for campaign ${campaignId}`);
  
  // Stop active status checks
  if (activeStatusChecks.has(campaignId)) {
    clearInterval(activeStatusChecks.get(campaignId));
    activeStatusChecks.delete(campaignId);
    console.log(`✅ Stopped active status monitoring for campaign ${campaignId}`);
  }
  
  // Stop pause status checks
  if (pauseStatusChecks.has(campaignId)) {
    clearInterval(pauseStatusChecks.get(campaignId));
    pauseStatusChecks.delete(campaignId);
    console.log(`✅ Stopped pause status monitoring for campaign ${campaignId}`);
  }
  
  // Stop empty URL status checks
  if (emptyUrlStatusChecks.has(campaignId)) {
    clearInterval(emptyUrlStatusChecks.get(campaignId));
    emptyUrlStatusChecks.delete(campaignId);
    console.log(`✅ Stopped empty URL monitoring for campaign ${campaignId}`);
  }
}

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
    // First check if Traffic Generator is still enabled
    try {
      const campaignSettings = await db.query.campaigns.findFirst({
        where: (c, { eq }) => eq(c.id, campaignId),
        columns: { trafficGeneratorEnabled: true }
      });
      
      // If campaign doesn't exist or Traffic Generator is disabled, stop monitoring
      if (!campaignSettings) {
        console.log(`❌ Campaign ${campaignId} not found - stopping monitoring`);
        if (activeStatusChecks.has(campaignId)) {
          clearInterval(activeStatusChecks.get(campaignId));
          activeStatusChecks.delete(campaignId);
        }
        return;
      }
      
      if (!campaignSettings.trafficGeneratorEnabled) {
        console.log(`⚠️ Traffic Generator disabled for campaign ${campaignId} - stopping all monitoring`);
        // Stop all monitoring for this campaign since feature is disabled
        if (activeStatusChecks.has(campaignId)) {
          clearInterval(activeStatusChecks.get(campaignId));
          activeStatusChecks.delete(campaignId);
        }
        return;
      }
      
      console.log(`⏱️ Running minute check for campaign ${trafficstarCampaignId} active status`);
      
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
          console.log(`🔍 ACTIVE MONITORING: Checking remaining clicks for ${campaign.urls.length} URLs in campaign ${trafficstarCampaignId}`);
          for (const url of campaign.urls) {
            console.log(`🔍 URL ID: ${url.id}, status: ${url.status}, clickLimit: ${url.clickLimit}, clicks: ${url.clicks}`);
            if (url.status === 'active') {
              const remainingClicks = url.clickLimit - url.clicks;
              const validRemaining = remainingClicks > 0 ? remainingClicks : 0;
              totalRemainingClicks += validRemaining;
              console.log(`✅ Adding ${validRemaining} remaining clicks from URL ID: ${url.id}`);
            } else {
              console.log(`❌ Skipping URL ID: ${url.id} with status: ${url.status}`);
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
                
                try {
                  // Then set its end time
                  await trafficStarService.updateCampaignEndTime(Number(trafficstarCampaignId), formattedDateTime);
                  
                  console.log(`✅ PAUSED low spend campaign ${trafficstarCampaignId} during monitoring due to low remaining clicks (${totalRemainingClicks} <= ${MINIMUM_CLICKS_THRESHOLD})`);
                  
                  // Mark as auto-paused in the database
                  await db.update(campaigns)
                    .set({
                      lastTrafficSenderStatus: 'auto_paused_low_clicks_during_monitoring',
                      lastTrafficSenderAction: new Date(),
                      updatedAt: new Date()
                    })
                    .where(eq(campaigns.id, campaignId));
                  
                  console.log(`✅ Marked campaign ${campaignId} as 'auto_paused_low_clicks_during_monitoring' in database`);
                  
                  // Start pause status monitoring to ensure campaign stays paused
                  startMinutelyPauseStatusCheck(campaignId, trafficstarCampaignId);
                } catch (endTimeError) {
                  console.error(`❌ Error setting end time for campaign ${trafficstarCampaignId}:`, endTimeError);
                }
              } catch (pauseError) {
                console.error(`❌ Failed to pause low spend campaign ${trafficstarCampaignId} with low remaining clicks:`, pauseError);
                
                // If we failed to pause, restart the active monitoring
                startMinutelyStatusCheck(campaignId, trafficstarCampaignId);
              }
            } catch (error) {
              console.error(`❌ Error pausing low spend campaign ${trafficstarCampaignId} with low remaining clicks:`, error);
              
              // If we failed to pause, restart the active monitoring
              startMinutelyStatusCheck(campaignId, trafficstarCampaignId);
            }
          }
        }
      } else if (status === 'paused') {
        console.log(`⚠️ Campaign ${trafficstarCampaignId} was found paused but should be active - will attempt to reactivate`);
        
        try {
          // Get the campaign details to check URLs and remaining clicks
          const campaign = await db.query.campaigns.findFirst({
            where: (campaign, { eq }) => eq(campaign.id, campaignId),
            with: { urls: true }
          }) as (Campaign & { urls: UrlWithActiveStatus[] }) | null;
          
          if (campaign && campaign.urls && campaign.urls.length > 0) {
            // Calculate total remaining clicks
            let totalRemainingClicks = 0;
            console.log(`🔍 PAUSE DETECTED: Checking remaining clicks for ${campaign.urls.length} URLs in campaign ${trafficstarCampaignId}`);
            for (const url of campaign.urls) {
              console.log(`🔍 URL ID: ${url.id}, status: ${url.status}, clickLimit: ${url.clickLimit}, clicks: ${url.clicks}`);
              if (url.status === 'active') {
                const remainingClicks = url.clickLimit - url.clicks;
                const validRemaining = remainingClicks > 0 ? remainingClicks : 0;
                totalRemainingClicks += validRemaining;
                console.log(`✅ Adding ${validRemaining} remaining clicks from URL ID: ${url.id}`);
              } else {
                console.log(`❌ Skipping URL ID: ${url.id} with status: ${url.status}`);
              }
            }
            
            // Only reactivate if there are enough remaining clicks
            const REMAINING_CLICKS_THRESHOLD = 15000;
            if (totalRemainingClicks >= REMAINING_CLICKS_THRESHOLD) {
              console.log(`✅ Campaign ${trafficstarCampaignId} has ${totalRemainingClicks} remaining clicks (>= ${REMAINING_CLICKS_THRESHOLD}) - will attempt reactivation during monitoring`);
              
              // Set end time to 23:59 UTC today
              const today = new Date();
              const todayStr = today.toISOString().split('T')[0]; // YYYY-MM-DD
              const endTimeStr = `${todayStr} 23:59:00`;
              
              // First set the end time, then activate
              await trafficStarService.updateCampaignEndTime(Number(trafficstarCampaignId), endTimeStr);
              
              // Attempt to reactivate the campaign
              await trafficStarService.activateCampaign(Number(trafficstarCampaignId));
              
              console.log(`✅ REACTIVATED campaign ${trafficstarCampaignId} during monitoring - it has ${totalRemainingClicks} remaining clicks`);
              
              // Mark as reactivated during monitoring in the database
              await db.update(campaigns)
                .set({
                  lastTrafficSenderStatus: 'reactivated_during_monitoring',
                  lastTrafficSenderAction: new Date(),
                  updatedAt: new Date()
                })
                .where(eq(campaigns.id, campaignId));
              
              console.log(`✅ Marked campaign ${campaignId} as 'reactivated_during_monitoring' in database`);
            } else {
              console.log(`⏹️ Campaign ${trafficstarCampaignId} has only ${totalRemainingClicks} remaining clicks (< ${REMAINING_CLICKS_THRESHOLD}) - will not reactivate during monitoring`);
              
              // Stop this monitoring since we're now in pause state
              clearInterval(interval);
              activeStatusChecks.delete(campaignId);
              
              // Start pause monitoring instead
              startMinutelyPauseStatusCheck(campaignId, trafficstarCampaignId);
              
              // Mark as staying paused during monitoring in the database
              await db.update(campaigns)
                .set({
                  lastTrafficSenderStatus: 'staying_paused_low_clicks',
                  lastTrafficSenderAction: new Date(),
                  updatedAt: new Date()
                })
                .where(eq(campaigns.id, campaignId));
              
              console.log(`✅ Marked campaign ${campaignId} as 'staying_paused_low_clicks' in database`);
            }
          }
        } catch (error) {
          console.error(`❌ Error handling paused campaign ${trafficstarCampaignId} during active monitoring:`, error);
        }
      } else {
        console.log(`⚠️ Campaign ${trafficstarCampaignId} has unknown status during monitoring: ${status}`);
      }
    } catch (error) {
      console.error(`❌ Error checking campaign ${trafficstarCampaignId} status during active monitoring:`, error);
    }
  }, 60 * 1000); // Check every minute
  
  // Store the interval so we can clear it later if needed
  activeStatusChecks.set(campaignId, interval);
}

/**
 * Start minute-by-minute check for campaign PAUSE status
 * This ensures the campaign stays paused when it should be paused
 * @param campaignId The campaign ID in our system
 * @param trafficstarCampaignId The TrafficStar campaign ID
 */
function startMinutelyPauseStatusCheck(campaignId: number, trafficstarCampaignId: string) {
  // Clear existing interval if there is one
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
    try {
      // FIRST, check if Traffic Generator is still enabled for this campaign
      const campaignSettings = await db.query.campaigns.findFirst({
        where: (c, { eq }) => eq(c.id, campaignId),
        columns: { trafficGeneratorEnabled: true }
      });
      
      // If campaign doesn't exist or Traffic Generator is disabled, stop monitoring
      if (!campaignSettings) {
        console.log(`❌ Campaign ${campaignId} not found - stopping pause monitoring`);
        if (pauseStatusChecks.has(campaignId)) {
          clearInterval(pauseStatusChecks.get(campaignId));
          pauseStatusChecks.delete(campaignId);
        }
        return;
      }
      
      if (!campaignSettings.trafficGeneratorEnabled) {
        console.log(`⚠️ Traffic Generator disabled for campaign ${campaignId} - stopping pause monitoring`);
        if (pauseStatusChecks.has(campaignId)) {
          clearInterval(pauseStatusChecks.get(campaignId));
          pauseStatusChecks.delete(campaignId);
        }
        return;
      }
      
      console.log(`⏱️ Running minute check for campaign ${trafficstarCampaignId} pause status`);
      
      // Get the current status
      const status = await getTrafficStarCampaignStatus(trafficstarCampaignId);
      
      if (status === 'paused') {
        console.log(`⏹️ Campaign ${trafficstarCampaignId} is still paused as expected - monitoring will continue`);
        
        // Check current spent value and remaining clicks periodically
        const campaign = await db.query.campaigns.findFirst({
          where: (campaign, { eq }) => eq(campaign.id, campaignId),
          with: { urls: true }
        }) as (Campaign & { urls: UrlWithActiveStatus[] }) | null;
        
        // Get current pause duration if we've auto-paused the campaign
        if (campaign && campaign.lastTrafficSenderAction && 
            (campaign.lastTrafficSenderStatus === 'auto_paused_low_clicks' || 
             campaign.lastTrafficSenderStatus === 'auto_paused_low_clicks_during_monitoring')) {
          
          const pauseDuration = Date.now() - campaign.lastTrafficSenderAction.getTime();
          const pauseMinutes = Math.floor(pauseDuration / (60 * 1000));
          
          // Check if we're past the wait period for low clicks (postPauseCheckMinutes or default 2 minutes)
          const postPauseMinutes = campaign.postPauseCheckMinutes || 2;
          
          console.log(`⏱️ Campaign ${trafficstarCampaignId} has been paused for ${pauseMinutes} minutes (check after ${postPauseMinutes} minutes)`);
          
          if (pauseMinutes >= postPauseMinutes) {
            console.log(`⏱️ ${pauseMinutes} minutes elapsed (>= ${postPauseMinutes}) since pausing - checking spent value and remaining clicks`);
            
            // Get spent value to determine next actions
            const spentValue = await getTrafficStarCampaignSpentValue(campaignId, trafficstarCampaignId);
            
            if (spentValue !== null) {
              // Calculate total remaining clicks
              let totalRemainingClicks = 0;
              console.log(`🔍 PAUSE MONITORING: Checking remaining clicks for ${campaign.urls.length} URLs in campaign ${trafficstarCampaignId}`);
              for (const url of campaign.urls) {
                console.log(`🔍 URL ID: ${url.id}, status: ${url.status}, clickLimit: ${url.clickLimit}, clicks: ${url.clicks}`);
                if (url.status === 'active') {
                  const remainingClicks = url.clickLimit - url.clicks;
                  const validRemaining = remainingClicks > 0 ? remainingClicks : 0;
                  totalRemainingClicks += validRemaining;
                  console.log(`✅ Adding ${validRemaining} remaining clicks from URL ID: ${url.id}`);
                } else {
                  console.log(`❌ Skipping URL ID: ${url.id} with status: ${url.status}`);
                }
              }
              
              // Check if clicks have been replenished
              const REMAINING_CLICKS_THRESHOLD = 15000;
              if (totalRemainingClicks >= REMAINING_CLICKS_THRESHOLD) {
                console.log(`✅ Campaign ${trafficstarCampaignId} now has ${totalRemainingClicks} remaining clicks (>= ${REMAINING_CLICKS_THRESHOLD}) - will attempt reactivation after pause period`);
                
                try {
                  // Set end time to 23:59 UTC today
                  const today = new Date();
                  const todayStr = today.toISOString().split('T')[0]; // YYYY-MM-DD
                  const endTimeStr = `${todayStr} 23:59:00`;
                  
                  // First set the end time, then activate
                  await trafficStarService.updateCampaignEndTime(Number(trafficstarCampaignId), endTimeStr);
                  
                  // Attempt to reactivate the campaign
                  await trafficStarService.activateCampaign(Number(trafficstarCampaignId));
                  
                  console.log(`✅ REACTIVATED campaign ${trafficstarCampaignId} after pause period - it now has ${totalRemainingClicks} remaining clicks`);
                  
                  // Mark as reactivated after pause in the database
                  await db.update(campaigns)
                    .set({
                      lastTrafficSenderStatus: 'reactivated_after_pause',
                      lastTrafficSenderAction: new Date(),
                      updatedAt: new Date()
                    })
                    .where(eq(campaigns.id, campaignId));
                  
                  console.log(`✅ Marked campaign ${campaignId} as 'reactivated_after_pause' in database`);
                  
                  // Stop pause monitoring and start active monitoring
                  clearInterval(interval);
                  pauseStatusChecks.delete(campaignId);
                  startMinutelyStatusCheck(campaignId, trafficstarCampaignId);
                } catch (error) {
                  console.error(`❌ Error reactivating campaign ${trafficstarCampaignId} after pause:`, error);
                }
              } else {
                console.log(`⏹️ Campaign ${trafficstarCampaignId} still has only ${totalRemainingClicks} remaining clicks (< ${REMAINING_CLICKS_THRESHOLD}) - continuing pause monitoring`);
                
                // Update the status in the database to reflect we checked after the pause period
                await db.update(campaigns)
                  .set({
                    lastTrafficSenderStatus: 'checked_after_pause_still_low_clicks',
                    lastTrafficSenderAction: new Date(),
                    updatedAt: new Date()
                  })
                  .where(eq(campaigns.id, campaignId));
                
                console.log(`✅ Marked campaign ${campaignId} as 'checked_after_pause_still_low_clicks' in database`);
              }
            }
          }
        }
      } else if (status === 'active') {
        console.log(`⚠️ Campaign ${trafficstarCampaignId} was found active but should be paused - will attempt to pause again`);
        
        try {
          // Get the campaign details to check URLs and remaining clicks
          const campaign = await db.query.campaigns.findFirst({
            where: (campaign, { eq }) => eq(campaign.id, campaignId),
            with: { urls: true }
          }) as (Campaign & { urls: UrlWithActiveStatus[] }) | null;
          
          if (campaign && campaign.urls && campaign.urls.length > 0) {
            // Calculate total remaining clicks
            let totalRemainingClicks = 0;
            for (const url of campaign.urls) {
              if (url.status === 'active') {
                const remainingClicks = url.clickLimit - url.clicks;
                totalRemainingClicks += remainingClicks > 0 ? remainingClicks : 0;
              }
            }
            
            console.log(`Campaign ${trafficstarCampaignId} has ${totalRemainingClicks} remaining clicks but should be paused - re-pausing campaign`);
            
            // Set current date/time for end time
            const now = new Date();
            const formattedDateTime = now.toISOString().replace('T', ' ').split('.')[0]; // YYYY-MM-DD HH:MM:SS
            
            // First pause the campaign
            await trafficStarService.pauseCampaign(Number(trafficstarCampaignId));
            
            // Then set its end time
            await trafficStarService.updateCampaignEndTime(Number(trafficstarCampaignId), formattedDateTime);
            
            console.log(`✅ RE-PAUSED campaign ${trafficstarCampaignId} during pause monitoring - it was found active`);
            
            // Mark as re-paused during monitoring in the database
            await db.update(campaigns)
              .set({
                lastTrafficSenderStatus: 're_paused_during_monitoring',
                lastTrafficSenderAction: new Date(),
                updatedAt: new Date()
              })
              .where(eq(campaigns.id, campaignId));
            
            console.log(`✅ Marked campaign ${campaignId} as 're_paused_during_monitoring' in database`);
          }
        } catch (error) {
          console.error(`❌ Error re-pausing campaign ${trafficstarCampaignId} during pause monitoring:`, error);
        }
      } else {
        console.log(`⚠️ Campaign ${trafficstarCampaignId} has unknown status during pause monitoring: ${status}`);
      }
    } catch (error) {
      console.error(`❌ Error checking campaign ${trafficstarCampaignId} status during pause monitoring:`, error);
    }
  }, 60 * 1000); // Check every minute
  
  // Store the interval so we can clear it later if needed
  pauseStatusChecks.set(campaignId, interval);
}

/**
 * Start a dedicated check for empty URL campaigns
 * This function is specifically designed to monitor campaigns with no active URLs
 * and ensure they stay paused until URLs become active
 * @param campaignId The campaign ID in our system
 * @param trafficstarCampaignId The TrafficStar campaign ID
 */
function startEmptyUrlStatusCheck(campaignId: number, trafficstarCampaignId: string) {
  // Clear existing interval if there is one
  if (emptyUrlStatusChecks.has(campaignId)) {
    clearInterval(emptyUrlStatusChecks.get(campaignId));
    emptyUrlStatusChecks.delete(campaignId);
  }
  
  // Also clear other check types for this campaign to avoid conflicts
  if (activeStatusChecks.has(campaignId)) {
    clearInterval(activeStatusChecks.get(campaignId));
    activeStatusChecks.delete(campaignId);
  }
  
  if (pauseStatusChecks.has(campaignId)) {
    clearInterval(pauseStatusChecks.get(campaignId));
    pauseStatusChecks.delete(campaignId);
  }
  
  console.log(`🔄 Starting minute-by-minute PAUSE status check for campaign ${trafficstarCampaignId} (empty URL monitor)`);
  
  // Set up a new interval that runs every minute
  const interval = setInterval(async () => {
    try {
      // FIRST, check if Traffic Generator is still enabled for this campaign
      const campaignSettings = await db.query.campaigns.findFirst({
        where: (c, { eq }) => eq(c.id, campaignId),
        columns: { trafficGeneratorEnabled: true }
      });
      
      // If campaign doesn't exist or Traffic Generator is disabled, stop monitoring
      if (!campaignSettings) {
        console.log(`❌ Campaign ${campaignId} not found - stopping empty URL monitoring`);
        if (emptyUrlStatusChecks.has(campaignId)) {
          clearInterval(emptyUrlStatusChecks.get(campaignId));
          emptyUrlStatusChecks.delete(campaignId);
        }
        return;
      }
      
      if (!campaignSettings.trafficGeneratorEnabled) {
        console.log(`⚠️ Traffic Generator disabled for campaign ${campaignId} - stopping empty URL monitoring`);
        if (emptyUrlStatusChecks.has(campaignId)) {
          clearInterval(emptyUrlStatusChecks.get(campaignId));
          emptyUrlStatusChecks.delete(campaignId);
        }
        return;
      }
      
      console.log(`⏱️ Running minute check for campaign ${trafficstarCampaignId} with no active URLs`);
      
      // Check if active URLs now exist
      const activeUrls = await db.select()
        .from(urls)
        .where(
          and(
            eq(urls.campaignId, campaignId),
            eq(urls.status, 'active')
          )
        );
      
      // If URLs are now active, stop this check as it's no longer needed
      if (activeUrls.length > 0) {
        console.log(`Campaign ${campaignId} now has ${activeUrls.length} active URLs - stopping empty URL monitoring`);
        
        clearInterval(interval);
        emptyUrlStatusChecks.delete(campaignId);
        
        // Update status in database
        await db.update(campaigns)
          .set({
            lastTrafficSenderStatus: 'active_urls_available',
            lastTrafficSenderAction: new Date(),
            updatedAt: new Date()
          })
          .where(eq(campaigns.id, campaignId));
        
        console.log(`✅ Stopped empty URL monitoring for campaign ${campaignId} as it now has active URLs`);
        return;
      }
      
      // If we're still here, no active URLs exist, so check the campaign status
      const status = await getTrafficStarCampaignStatus(trafficstarCampaignId);
      
      if (status === 'active') {
        console.log(`⚠️ Campaign ${trafficstarCampaignId} was found ACTIVE but has no active URLs - will pause it again`);
        
        try {
          // Set current date/time for end time
          const now = new Date();
          const formattedDateTime = now.toISOString().replace('T', ' ').split('.')[0]; // YYYY-MM-DD HH:MM:SS
          
          // First pause the campaign
          await trafficStarService.pauseCampaign(Number(trafficstarCampaignId));
          console.log(`Successfully paused campaign ${trafficstarCampaignId}`);
          
          // Then set its end time
          await trafficStarService.updateCampaignEndTime(Number(trafficstarCampaignId), formattedDateTime);
          console.log(`Setting campaign ${trafficstarCampaignId} end time to: ${formattedDateTime}`);
          console.log(`Successfully updated end time for campaign ${trafficstarCampaignId}`);
          console.log(`Confirmed end time update for campaign ${trafficstarCampaignId}`);
          
          console.log(`✅ RE-PAUSED campaign ${trafficstarCampaignId} during empty URL monitoring`);
          
          // Mark status in database
          await db.update(campaigns)
            .set({
              lastTrafficSenderStatus: 're_paused_no_active_urls',
              lastTrafficSenderAction: new Date(),
              updatedAt: new Date()
            })
            .where(eq(campaigns.id, campaignId));
        } catch (error) {
          console.error(`❌ Error re-pausing campaign ${trafficstarCampaignId} with no active URLs:`, error);
        }
      } else if (status === 'paused') {
        console.log(`Campaign ${trafficstarCampaignId} is properly paused with no active URLs - continuing monitoring`);
      } else {
        console.log(`Campaign ${trafficstarCampaignId} has unknown status (${status || 'null'}) during empty URL monitoring`);
      }
    } catch (error) {
      console.error(`❌ Error during empty URL monitoring for campaign ${trafficstarCampaignId}:`, error);
    }
  }, 60 * 1000); // Check every minute
  
  // Store the interval so we can clear it later if needed
  emptyUrlStatusChecks.set(campaignId, interval);
}

/**
 * Pause TrafficStar campaign
 * @param trafficstarCampaignId The TrafficStar campaign ID
 * @returns True if the pause operation was successful, false otherwise
 */
export async function pauseTrafficStarCampaign(trafficstarCampaignId: string): Promise<boolean> {
  try {
    console.log(`⏹️ Attempting to pause TrafficStar campaign ${trafficstarCampaignId}`);
    
    // Get current status first to see if it's already paused
    const status = await getTrafficStarCampaignStatus(trafficstarCampaignId);
    
    if (status === 'paused') {
      console.log(`TrafficStar campaign ${trafficstarCampaignId} is already paused, no action needed`);
      return true;
    }
    
    // Set current date/time for end time
    const now = new Date();
    const formattedDateTime = now.toISOString().replace('T', ' ').split('.')[0]; // YYYY-MM-DD HH:MM:SS
    
    // Pause the campaign
    await trafficStarService.pauseCampaign(Number(trafficstarCampaignId));
    
    // Set its end time
    await trafficStarService.updateCampaignEndTime(Number(trafficstarCampaignId), formattedDateTime);
    
    console.log(`✅ Successfully paused TrafficStar campaign ${trafficstarCampaignId} with end time ${formattedDateTime}`);
    
    return true;
  } catch (error) {
    console.error(`❌ Error pausing TrafficStar campaign ${trafficstarCampaignId}:`, error);
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
    console.log(`Processing Traffic Generator for campaign ${campaignId}`);
    
    // Get the campaign details with URLs
    const campaign = await db.query.campaigns.findFirst({
      where: (campaign, { eq }) => eq(campaign.id, campaignId),
      columns: {
        id: true,
        trafficGeneratorEnabled: true,
        trafficstarCampaignId: true,
        postPauseCheckMinutes: true,
        lastTrafficSenderStatus: true,
        lastTrafficSenderAction: true
      }
    });
    
    if (!campaign) {
      console.error(`Campaign ${campaignId} not found`);
      return;
    }
    
    // Skip if traffic generator is not enabled
    if (!campaign.trafficGeneratorEnabled && !forceMode) {
      console.log(`Traffic Generator not enabled for campaign ${campaignId} - skipping`);
      return;
    }
    
    if (!campaign.trafficstarCampaignId) {
      console.error(`Campaign ${campaignId} has no TrafficStar ID - skipping`);
      return;
    }
    
    console.log(`Processing Traffic Generator for campaign ${campaignId} with TrafficStar ID ${campaign.trafficstarCampaignId}`);
    
    // Handle force mode for testing
    if (forceMode === 'force_activate') {
      console.log(`💪 FORCE MODE: Forcing activation of campaign ${campaign.trafficstarCampaignId}`);
      
      try {
        // Set end time to 23:59 UTC today
        const today = new Date();
        const todayStr = today.toISOString().split('T')[0]; // YYYY-MM-DD
        const endTimeStr = `${todayStr} 23:59:00`;
        
        // First set the end time, then activate
        await trafficStarService.updateCampaignEndTime(Number(campaign.trafficstarCampaignId), endTimeStr);
        await trafficStarService.activateCampaign(Number(campaign.trafficstarCampaignId));
        
        console.log(`✅ FORCE MODE: Successfully activated campaign ${campaign.trafficstarCampaignId}`);
        
        // Start minute-by-minute monitoring
        startMinutelyStatusCheck(campaignId, campaign.trafficstarCampaignId);
        
        return;
      } catch (error) {
        console.error(`❌ FORCE MODE: Error activating campaign ${campaign.trafficstarCampaignId}:`, error);
        return;
      }
    } else if (forceMode === 'force_pause') {
      console.log(`💪 FORCE MODE: Forcing pause of campaign ${campaign.trafficstarCampaignId}`);
      
      try {
        // Pause the campaign
        await pauseTrafficStarCampaign(campaign.trafficstarCampaignId);
        
        console.log(`✅ FORCE MODE: Successfully paused campaign ${campaign.trafficstarCampaignId}`);
        
        // Start minute-by-minute pause monitoring
        startMinutelyPauseStatusCheck(campaignId, campaign.trafficstarCampaignId);
        
        return;
      } catch (error) {
        console.error(`❌ FORCE MODE: Error pausing campaign ${campaign.trafficstarCampaignId}:`, error);
        return;
      }
    }
    
    // Check if the Traffic Generator was JUST ENABLED
    // Important: specifically detect the transition from disabled to enabled
    const wasJustEnabled = campaign.lastTrafficSenderStatus === null;
    
    // ALWAYS IMMEDIATELY PAUSE when just enabled, no questions asked
    if (wasJustEnabled) {
      console.log(`⛔ CRITICAL: Traffic Generator just enabled - IMMEDIATELY PAUSING campaign ${campaign.trafficstarCampaignId} first`);
      
      try {
        // Set current date/time for end time
        const now = new Date();
        const formattedDateTime = now.toISOString().replace('T', ' ').split('.')[0]; // YYYY-MM-DD HH:MM:SS
        
        // IMMEDIATELY PAUSE the campaign
        await trafficStarService.pauseCampaign(Number(campaign.trafficstarCampaignId));
        console.log(`➡️ Step 1/2: Successfully paused campaign ${campaign.trafficstarCampaignId}`);
        
        // Then set its end time
        await trafficStarService.updateCampaignEndTime(Number(campaign.trafficstarCampaignId), formattedDateTime);
        console.log(`➡️ Step 2/2: Successfully set end time for campaign ${campaign.trafficstarCampaignId} to ${formattedDateTime}`);
        
        // Get the postPauseCheckMinutes from the campaign settings (default to 10 if not set)
        const waitMinutes = campaign.postPauseCheckMinutes || 10;
        
        // Update the database to reflect this initial pause
        await db.update(campaigns)
          .set({
            lastTrafficSenderStatus: 'initial_pause_on_enable',
            lastTrafficSenderAction: now,
            updatedAt: now
          })
          .where(eq(campaigns.id, campaignId));
          
        console.log(`✅ Traffic Generator has paused campaign ${campaign.trafficstarCampaignId} and will wait ${waitMinutes} minutes before checking spent value`);
        
        // Start the pause check monitoring which will handle the wait period
        startMinutelyPauseStatusCheck(campaignId, campaign.trafficstarCampaignId);
        
        return; // Exit early - the pause monitoring will handle the rest
      } catch (pauseError) {
        console.error(`❌ Critical error pausing campaign ${campaign.trafficstarCampaignId} at Traffic Generator startup:`, pauseError);
      }
    }
    
    // If campaign wasn't just enabled, check if we're in the waiting period after initial pause
    if (campaign.lastTrafficSenderStatus === 'initial_pause_on_enable' && campaign.lastTrafficSenderAction) {
      const waitDuration = Date.now() - campaign.lastTrafficSenderAction.getTime();
      const waitMinutes = Math.floor(waitDuration / (60 * 1000));
      const requiredWaitMinutes = campaign.postPauseCheckMinutes || 10; // Default to 10 minutes
      
      if (waitMinutes < requiredWaitMinutes) {
        console.log(`⏳ Campaign ${campaignId} is in waiting period (${waitMinutes}/${requiredWaitMinutes} minutes) after initial pause - pausing monitoring will continue`);
        return; // Still in waiting period, do not proceed yet
      }
      
      console.log(`⏰ Waiting period of ${requiredWaitMinutes} minutes complete - now proceeding to check spent value`);
    }
    
    // If we get here, we're past the waiting period and ready to perform regular checks
    
    // First, get the full campaign data with URLs
    const fullCampaign = await db.query.campaigns.findFirst({
      where: (campaign, { eq }) => eq(campaign.id, campaignId),
      with: {
        urls: true
      }
    }) as (Campaign & { urls: UrlWithActiveStatus[] }) | null;
    
    if (!fullCampaign) {
      console.error(`Campaign ${campaignId} not found during full data fetch`);
      return;
    }
    
    // Get the current spent value for the campaign
    const spentValue = await getTrafficStarCampaignSpentValue(campaignId, campaign.trafficstarCampaignId);
    
    if (spentValue === null) {
      console.error(`Failed to get spent value for campaign ${campaignId}`);
      return;
    }
    
    console.log(`Campaign ${campaignId} spent value: $${spentValue.toFixed(4)}`);
    
    // Handle the campaign based on spent value and clicks
    await handleCampaignBySpentValue(campaignId, campaign.trafficstarCampaignId, spentValue);
  } catch (error) {
    console.error(`Error processing Traffic Generator for campaign ${campaignId}:`, error);
  }
}

/**
 * Run traffic generator for all campaigns
 * This function should be scheduled to run periodically
 */
export async function runTrafficGeneratorForAllCampaigns() {
  try {
    console.log('Running Traffic Generator for all enabled campaigns');
    
    // Get all campaigns with traffic generator enabled
    const enabledCampaigns = await db.query.campaigns.findMany({
      where: (campaign, { eq }) => eq(campaign.trafficGeneratorEnabled, true),
    });
    
    if (enabledCampaigns.length === 0) {
      console.log('No campaigns have Traffic Generator enabled - skipping');
      return;
    }
    
    console.log(`Processing ${enabledCampaigns.length} campaigns with traffic generator enabled`);
    
    // Process each campaign
    for (const campaign of enabledCampaigns) {
      try {
        await processTrafficGenerator(campaign.id);
      } catch (error) {
        console.error(`Error processing campaign ${campaign.id}:`, error);
      }
    }
    
    console.log('Finished running Traffic Generator for all enabled campaigns');
  } catch (error) {
    console.error('Error running Traffic Generator for all campaigns:', error);
  }
}

/**
 * Check for campaigns with no active URLs and pause their TrafficStar campaigns
 * This function is separate from other Traffic Generator functionality
 * It only handles the specific case of no active URLs in a campaign
 */
export async function pauseTrafficStarForEmptyCampaigns() {
  try {
    console.log('Checking for campaigns with no active URLs to pause TrafficStar campaigns');
    
    // Get all campaigns with TrafficStar campaign IDs
    const campaignsWithTrafficStar = await db.select()
      .from(campaigns)
      .where(sql`trafficstar_campaign_id is not null AND traffic_generator_enabled = true`);
    
    if (!campaignsWithTrafficStar || campaignsWithTrafficStar.length === 0) {
      console.log('No campaigns with TrafficStar integration found');
      return;
    }
    
    console.log(`Found ${campaignsWithTrafficStar.length} campaigns with TrafficStar integration`);
    
    // Process each campaign
    for (const campaign of campaignsWithTrafficStar) {
      if (!campaign.trafficstarCampaignId) continue;
      
      console.log(`Checking active URLs for campaign ${campaign.id} (TrafficStar ID: ${campaign.trafficstarCampaignId})`);
      
      // Get all active URLs for this campaign
      const activeUrls = await db.select()
        .from(urls)
        .where(
          and(
            eq(urls.campaignId, campaign.id),
            eq(urls.status, 'active')
          )
        );
      
      const hasActiveUrls = activeUrls.length > 0;
      
      // If campaign has active URLs
      if (hasActiveUrls) {
        console.log(`Campaign ${campaign.id} has ${activeUrls.length} active URLs - no need to pause`);
        
        // If it was previously paused due to no URLs, update its status and stop monitoring
        if (campaign.lastTrafficSenderStatus === 'auto_paused_no_active_urls' || 
            campaign.lastTrafficSenderStatus === 'paused_no_active_urls') {
          console.log(`Campaign ${campaign.id} now has active URLs but was previously paused - updating status`);
          
          // Stop the empty URL status check
          if (emptyUrlStatusChecks.has(campaign.id)) {
            clearInterval(emptyUrlStatusChecks.get(campaign.id));
            emptyUrlStatusChecks.delete(campaign.id);
            console.log(`✅ Stopped empty URL monitoring for campaign ${campaign.id}`);
          }
          
          // Update status in database
          await db.update(campaigns)
            .set({
              lastTrafficSenderStatus: 'active_urls_available',
              lastTrafficSenderAction: new Date(),
              updatedAt: new Date()
            })
            .where(eq(campaigns.id, campaign.id));
        }
        continue;
      }
      
      // If the campaign has NO active URLs
      console.log(`Campaign ${campaign.id} has NO active URLs`);
      
      // Skip campaigns that are in a wait period after enabling
      if (campaign.lastTrafficSenderStatus === 'auto_reactivated_low_spend' || 
          campaign.lastTrafficSenderStatus === 'reactivated_during_monitoring') {
          
        // Check if we're within the wait period
        if (campaign.lastTrafficSenderAction) {
          const waitDuration = Date.now() - campaign.lastTrafficSenderAction.getTime();
          const waitMinutes = Math.floor(waitDuration / (60 * 1000));
          const requiredWaitMinutes = campaign.postPauseCheckMinutes || 10; // Default to 10 minutes if not set
          
          if (waitMinutes < requiredWaitMinutes) {
            console.log(`Campaign ${campaign.id} was recently activated (${waitMinutes}/${requiredWaitMinutes} minutes ago) - skipping empty URL check`);
            continue;
          }
        }
      }
      
      // Check the current status of the TrafficStar campaign
      const currentStatus = await getTrafficStarCampaignStatus(campaign.trafficstarCampaignId);
      
      if (currentStatus === 'active') {
        console.log(`TrafficStar campaign ${campaign.trafficstarCampaignId} is ACTIVE but has no active URLs - pausing it`);
        
        try {
          // Set current date/time for end time
          const now = new Date();
          const formattedDateTime = now.toISOString().replace('T', ' ').split('.')[0]; // YYYY-MM-DD HH:MM:SS
          
          // First pause the campaign
          await trafficStarService.pauseCampaign(Number(campaign.trafficstarCampaignId));
          console.log(`Successfully paused campaign ${campaign.trafficstarCampaignId}`);
          
          // Then set its end time
          await trafficStarService.updateCampaignEndTime(Number(campaign.trafficstarCampaignId), formattedDateTime);
          console.log(`Setting campaign ${campaign.trafficstarCampaignId} end time to: ${formattedDateTime}`);
          console.log(`Successfully updated end time for campaign ${campaign.trafficstarCampaignId}`);
          
          console.log(`✅ PAUSED TrafficStar campaign ${campaign.trafficstarCampaignId} due to no active URLs`);
          
          // Mark as auto-paused in the database
          await db.update(campaigns)
            .set({
              lastTrafficSenderStatus: 'auto_paused_no_active_urls',
              lastTrafficSenderAction: new Date(),
              updatedAt: new Date()
            })
            .where(eq(campaigns.id, campaign.id));
          
          // Start empty URL monitoring
          startEmptyUrlStatusCheck(campaign.id, campaign.trafficstarCampaignId);
        } catch (error) {
          console.error(`❌ Error pausing TrafficStar campaign ${campaign.trafficstarCampaignId}:`, error);
        }
      } else if (currentStatus === 'paused') {
        console.log(`TrafficStar campaign ${campaign.trafficstarCampaignId} is already PAUSED with no active URLs - continuing monitoring`);
        
        // Update status in database
        await db.update(campaigns)
          .set({
            lastTrafficSenderStatus: 'paused_no_active_urls',
            lastTrafficSenderAction: new Date(),
            updatedAt: new Date()
          })
          .where(eq(campaigns.id, campaign.id));
        
        // Ensure we're monitoring for empty URL scenario
        startEmptyUrlStatusCheck(campaign.id, campaign.trafficstarCampaignId);
      } else {
        console.log(`TrafficStar campaign ${campaign.trafficstarCampaignId} has status: ${currentStatus || 'unknown'} - monitoring`);
      }
    }
  } catch (error) {
    console.error('Error in pauseTrafficStarForEmptyCampaigns:', error);
  }
}

/**
 * Initialize Traffic Generator scheduler
 * This function sets up a periodic job to run the traffic generator
 */
export function initializeTrafficGeneratorScheduler() {
  console.log('Initializing Traffic Generator scheduler');
  
  // Run the traffic generator on startup
  console.log('Running initial traffic generator check on startup');
  runTrafficGeneratorForAllCampaigns();
  
  // Also run the empty URL check on startup (after 10 seconds to allow other initializations)
  setTimeout(() => {
    console.log('Running initial empty URL check');
    pauseTrafficStarForEmptyCampaigns();
  }, 10 * 1000);
  
  // Set up a periodic job to run the traffic generator every 5 minutes
  setInterval(() => {
    console.log('Running scheduled Traffic Generator check');
    runTrafficGeneratorForAllCampaigns();
  }, 5 * 60 * 1000); // 5 minutes
  
  // Set up a periodic job to check for empty campaigns every 3 minutes
  setInterval(() => {
    console.log('Running scheduled empty URL check');
    pauseTrafficStarForEmptyCampaigns();
  }, 3 * 60 * 1000); // 3 minutes
  
  console.log('Traffic Generator scheduler initialized successfully');
}

/**
 * Debug function to test Traffic Generator with detailed logging
 * This function helps test campaigns with different click quantities
 * @param campaignId The campaign ID to test
 * @returns Debug information about the process
 */
export async function debugProcessCampaign(campaignId: number) {
  try {
    console.log(`🔍 DEBUG: Testing Traffic Generator for campaign ${campaignId}`);
    
    // Get the campaign details with URLs
    const campaign = await db.query.campaigns.findFirst({
      where: (campaign, { eq }) => eq(campaign.id, campaignId),
      with: {
        urls: true
      }
    }) as (Campaign & { urls: UrlWithActiveStatus[] }) | null;
    
    if (!campaign) {
      return { success: false, error: `Campaign ${campaignId} not found` };
    }
    
    if (!campaign.trafficstarCampaignId) {
      return { success: false, error: `Campaign ${campaignId} has no TrafficStar ID` };
    }
    
    // Get all the debugging info
    const spentValue = await getTrafficStarCampaignSpentValue(campaignId, campaign.trafficstarCampaignId);
    const status = await getTrafficStarCampaignStatus(campaign.trafficstarCampaignId);
    
    // Calculate remaining clicks
    let totalRemainingClicks = 0;
    let activeUrls = 0;
    let inactiveUrls = 0;
    let urlDetails = [];
    
    for (const url of campaign.urls) {
      const isActive = url.status === 'active';
      const remainingClicks = url.clickLimit - url.clicks;
      const effectiveRemaining = remainingClicks > 0 ? remainingClicks : 0;
      
      urlDetails.push({
        id: url.id,
        name: url.name,
        status: url.status,
        clickLimit: url.clickLimit,
        clicks: url.clicks,
        remainingClicks: effectiveRemaining,
        isActive
      });
      
      if (isActive) {
        totalRemainingClicks += effectiveRemaining;
        activeUrls++;
      } else {
        inactiveUrls++;
      }
    }
    
    // Return all the debug information
    return {
      success: true,
      campaign: {
        id: campaign.id,
        name: campaign.name,
        trafficstarCampaignId: campaign.trafficstarCampaignId,
        trafficGeneratorEnabled: campaign.trafficGeneratorEnabled,
        lastTrafficSenderStatus: campaign.lastTrafficSenderStatus,
        lastTrafficSenderAction: campaign.lastTrafficSenderAction,
        postPauseCheckMinutes: campaign.postPauseCheckMinutes || 2
      },
      status: status,
      spentValue: spentValue !== null ? `$${spentValue.toFixed(4)}` : null,
      clicks: {
        totalRemainingClicks,
        totalUrls: campaign.urls.length,
        activeUrls,
        inactiveUrls,
        urlDetails
      },
      thresholds: {
        spentThreshold: 10.0,
        minimumClicksThreshold: 5000,
        remainingClicksThreshold: 15000
      }
    };
  } catch (error) {
    console.error(`Error in debug process:`, error);
    return { success: false, error: String(error) };
  }
}
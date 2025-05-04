/**
 * Traffic Generator Module
 * 
 * This module manages the traffic generator functionality,
 * which checks TrafficStar campaign status and manages campaigns
 * based on the traffic generator settings.
 */

import { trafficStarService } from './trafficstar-service-new';
import { db } from './db';
import { campaigns } from '../shared/schema';
import { eq } from 'drizzle-orm';
import { getSpentValueForDate } from './spent-value';

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
      });
      
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
        
        // Check if there are enough remaining clicks to auto-reactivate
        if (totalRemainingClicks >= REMAINING_CLICKS_THRESHOLD) {
          console.log(`✅ Campaign ${trafficstarCampaignId} has ${totalRemainingClicks} remaining clicks (>= ${REMAINING_CLICKS_THRESHOLD}) - will attempt auto-reactivation`);
          
          try {
            // Attempt to reactivate the campaign since it has low spend but high remaining clicks
            const activationResult = await trafficStarService.activateCampaign(Number(trafficstarCampaignId));
            
            if (activationResult) {
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
            } else {
              console.error(`❌ Failed to auto-reactivate low spend campaign ${trafficstarCampaignId}`);
            }
          } catch (error) {
            console.error(`❌ Error auto-reactivating low spend campaign ${trafficstarCampaignId}:`, error);
          }
        } else {
          console.log(`⏹️ Campaign ${trafficstarCampaignId} only has ${totalRemainingClicks} remaining clicks (< ${REMAINING_CLICKS_THRESHOLD}) - skipping auto-reactivation`);
        }
      }
      
      // Default action if auto-reactivation doesn't happen or fails
      // Mark this in the database
      await db.update(campaigns)
        .set({
          lastTrafficSenderStatus: 'low_spend',
          lastTrafficSenderAction: new Date(),
          updatedAt: new Date()
        })
        .where(eq(campaigns.id, campaignId));
      
      console.log(`✅ Marked campaign ${campaignId} as 'low_spend' in database`);
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
 * Map to store active status check intervals by campaign ID
 * This prevents duplicate intervals from being created for the same campaign
 */
const activeStatusChecks = new Map<number, NodeJS.Timeout>();

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
  
  console.log(`🔄 Starting minute-by-minute status check for campaign ${trafficstarCampaignId}`);
  
  // Set up a new interval that runs every minute
  const interval = setInterval(async () => {
    console.log(`⏱️ Running minute check for campaign ${trafficstarCampaignId} status`);
    
    try {
      // Get the current status
      const status = await getTrafficStarCampaignStatus(trafficstarCampaignId);
      
      if (status === 'active') {
        console.log(`✅ Campaign ${trafficstarCampaignId} is still active - monitoring will continue`);
      } else {
        console.log(`❌ Campaign ${trafficstarCampaignId} is no longer active (status: ${status}) - attempting to reactivate`);
        
        // Attempt to reactivate
        const result = await trafficStarService.activateCampaign(Number(trafficstarCampaignId));
        
        if (result) {
          console.log(`✅ Successfully reactivated campaign ${trafficstarCampaignId} during minute check`);
          
          // Update database status
          await db.update(campaigns)
            .set({
              lastTrafficSenderStatus: 'reactivated_during_monitoring',
              lastTrafficSenderAction: new Date(),
              updatedAt: new Date()
            })
            .where(eq(campaigns.id, campaignId));
        } else {
          console.error(`❌ Failed to reactivate campaign ${trafficstarCampaignId} during minute check`);
          
          // Stop monitoring after multiple failures
          clearInterval(interval);
          activeStatusChecks.delete(campaignId);
          console.log(`⏹️ Stopped minute-by-minute monitoring for campaign ${trafficstarCampaignId} due to reactivation failure`);
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
      console.log(`⏱️ Automatically stopped minute-by-minute monitoring for campaign ${trafficstarCampaignId} after 60 minutes`);
    }
  }, 60 * 60 * 1000);
}

/**
 * Pause TrafficStar campaign
 * @param trafficstarCampaignId The TrafficStar campaign ID
 * @returns True if the pause operation was successful, false otherwise
 */
export async function pauseTrafficStarCampaign(trafficstarCampaignId: string) {
  try {
    // Use trafficStarService to pause campaign
    const result = await trafficStarService.pauseCampaign(Number(trafficstarCampaignId));
    
    if (!result) {
      console.error(`Failed to pause TrafficStar campaign ${trafficstarCampaignId}`);
      return false;
    }
    
    return true;
  } catch (error) {
    console.error('Error pausing TrafficStar campaign:', error);
    return false;
  }
}

/**
 * Process Traffic Generator for a campaign
 * @param campaignId The campaign ID
 */
export async function processTrafficGenerator(campaignId: number) {
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
    
    // Now we have the correct API implemented, so we can resume pausing campaigns
    if (status === 'active') {
      console.log(`✓ CORRECTLY DETECTED: TrafficStar campaign ${campaign.trafficstarCampaignId} is ACTIVE!`);
      console.log(`Pausing TrafficStar campaign ${campaign.trafficstarCampaignId} using updated API endpoints...`);
      
      let pauseSuccessful = false;
      
      // Try to pause the campaign using our improved API endpoints
      try {
        const result = await pauseTrafficStarCampaign(campaign.trafficstarCampaignId);
        pauseSuccessful = result;
        
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
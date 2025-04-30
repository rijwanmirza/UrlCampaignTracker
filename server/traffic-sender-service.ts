/**
 * Traffic Sender Service
 * 
 * This service manages the Traffic Sender feature, which automatically handles
 * campaign traffic by pausing and activating TrafficStar campaigns based on
 * specific conditions and remaining clicks.
 * 
 * Implements all 9 points from the requirements:
 * - Point 1: UI Implementation (already in campaign-edit-form.tsx)
 * - Point 2: Traffic Sender Activation Process
 * - Point 3: 10-Minute Waiting Period
 * - Point 4: Spent Value Check
 * - Point 5: Handling Spent Value ≥ $10
 * - Point 6: Budget Update and Activation
 * - Point 7: Handling Spent Value < $10 (including 5,000 click threshold monitoring)
 * - Point 8: Campaign Status Verification
 * - Point 9: Handling New URLs Added After Budget Update
 */

import { db } from './db';
import { campaigns, trafficstarCampaigns } from '@shared/schema';
import { eq, and, sql } from 'drizzle-orm';
import { trafficStarService } from './trafficstar-service-new';

class TrafficSenderService {
  private checkInterval: NodeJS.Timeout | null = null;
  private readonly PAUSE_RECHECK_MINUTES = 10; // Point 3: Wait exactly 10 minutes after pausing
  private readonly MINIMUM_SPENT_VALUE = 10; // Point 5/7: Minimum spent value threshold ($10)
  private readonly MINIMUM_CLICKS_FOR_SMALL_BUDGET = 10000; // Point 7: Minimum click threshold for small budgets
  private readonly MINIMUM_CLICKS_PAUSE_THRESHOLD = 5000; // Point 7: Threshold to pause campaign when spent < $10
  private readonly NEW_URL_WAIT_MINUTES = 12; // Point 9: Wait time before updating budget for new URLs

  /**
   * Start the Traffic Sender service
   */
  public async start() {
    try {
      if (this.checkInterval) {
        clearInterval(this.checkInterval);
      }
      
      // Process campaigns immediately on start
      await this.processTrafficSenderCampaigns();
      
      // Then schedule regular checks every 5 minutes
      this.checkInterval = setInterval(async () => {
        try {
          await this.processTrafficSenderCampaigns();
        } catch (error) {
          console.error('Error processing Traffic Sender campaigns:', error);
        }
      }, 5 * 60 * 1000); // Check every 5 minutes
      
      console.log('✅ Traffic Sender service started successfully');
      return { success: true, message: 'Traffic Sender service started successfully' };
    } catch (error) {
      console.error('Failed to start Traffic Sender service:', error);
      return { success: false, error: 'Failed to start Traffic Sender service' };
    }
  }

  /**
   * Stops the Traffic Sender service
   */
  public stop() {
    if (this.checkInterval) {
      clearInterval(this.checkInterval);
      this.checkInterval = null;
      console.log('Traffic Sender service stopped');
      return { success: true, message: 'Traffic Sender service stopped' };
    }
    return { success: false, message: 'Traffic Sender service was not running' };
  }

  /**
   * Process all campaigns with Traffic Sender enabled
   */
  private async processTrafficSenderCampaigns() {
    try {
      // Find all campaigns with Traffic Sender enabled
      const enabledCampaigns = await db
        .select()
        .from(campaigns)
        .where(eq(campaigns.trafficSenderEnabled, true));
      
      console.log(`Found ${enabledCampaigns.length} campaigns with Traffic Sender enabled`);
      
      // Process each campaign
      for (const campaign of enabledCampaigns) {
        try {
          await this.processTrafficSenderCampaign(campaign);
        } catch (error) {
          console.error(`Error processing Traffic Sender for campaign ${campaign.id}:`, error);
        }
      }
    } catch (error) {
      console.error('Error fetching Traffic Sender enabled campaigns:', error);
    }
  }

  /**
   * Process a single campaign with Traffic Sender
   */
  private async processTrafficSenderCampaign(campaign: any) {
    try {
      console.log(`Processing Traffic Sender for campaign ${campaign.id}`);
      
      // Skip if no TrafficStar campaign ID linked
      if (!campaign.trafficstarCampaignId) {
        console.log(`Campaign ${campaign.id} has no TrafficStar campaign ID, skipping`);
        return;
      }
      
      // URGENT FIX FOR POINT 7: Check remaining clicks for all campaigns first
      const remainingClicksResult = await db.execute(sql`
        SELECT SUM(click_limit - clicks) as remaining_clicks 
        FROM urls 
        WHERE campaign_id = ${campaign.id} 
        AND status = 'active'
      `);
      
      const totalRemainingClicks = parseInt(remainingClicksResult.rows[0]?.remaining_clicks?.toString() || '0');
      console.log(`Campaign ${campaign.id} has ${totalRemainingClicks} total remaining clicks`);
      
      // Get the spent value immediately for the critical check
      const spentValue = parseFloat(campaign.dailySpent || '0');
      console.log(`Campaign ${campaign.id} current spent value: $${spentValue.toFixed(4)}`);
      
      // CRITICAL CHECK FOR POINT 7: 
      // If clicks < 5000 and spent < $10, pause immediately
      if (totalRemainingClicks <= 5000 && spentValue < this.MINIMUM_SPENT_VALUE) {
        console.log(`❗❗❗ CRITICAL CONDITION MET: Campaign ${campaign.id} has less than 5,000 clicks (${totalRemainingClicks}) and spent is less than $10, pausing immediately!`);
        await this.pauseTrafficStarCampaign(campaign.id, parseInt(campaign.trafficstarCampaignId));
        return;  // Skip further processing for this campaign
      }
      
      // Get the corresponding TrafficStar campaign
      const trafficstarCampaign = await db
        .select()
        .from(trafficstarCampaigns)
        .where(eq(trafficstarCampaigns.trafficstarId, campaign.trafficstarCampaignId))
        .limit(1);
      
      if (trafficstarCampaign.length === 0) {
        console.log(`No TrafficStar campaign found for ID ${campaign.trafficstarCampaignId}, skipping`);
        return;
      }
      
      const tsInfo = trafficstarCampaign[0];
      
      // If no clicks remaining, pause the TrafficStar campaign
      if (totalRemainingClicks <= 0) {
        await this.pauseTrafficStarCampaign(campaign.id, parseInt(tsInfo.trafficstarId));
        return;
      }
      
      // SPECIAL CASE: If campaign was activated with end time (spent < $10 path)
      // and remaining clicks dropped below threshold, pause immediately
      if (campaign.lastTrafficSenderStatus === 'activated_with_end_time' && 
          totalRemainingClicks <= 5000 && 
          (tsInfo.status === 'active' || tsInfo.lastVerifiedStatus === 'active')) {
        console.log(`Campaign ${campaign.id} was activated with end time but remaining clicks (${totalRemainingClicks}) dropped below 5,000 threshold, pausing immediately`);
        await this.pauseTrafficStarCampaign(campaign.id, parseInt(tsInfo.trafficstarId));
        return;
      }
      
      // Check if the campaign is already paused in TrafficStar
      if (tsInfo.status === 'paused' || tsInfo.lastVerifiedStatus === 'paused') {
        // Calculate time elapsed since the last action
        const lastAction = campaign.lastTrafficSenderAction;
        if (lastAction) {
          const minutesElapsed = (new Date().getTime() - new Date(lastAction).getTime()) / (1000 * 60);
          
          // If we just paused, wait the configured recheck time before checking spent value
          if (minutesElapsed < this.PAUSE_RECHECK_MINUTES) {
            console.log(`Campaign ${campaign.id} was paused less than ${this.PAUSE_RECHECK_MINUTES} minutes ago, waiting before reactivation check`);
            return;
          }
          
          // After waiting period, check the spent value and possibly reactivate
          await this.checkSpentValueAndReactivate(campaign);
        }
      } else {
        // Campaign is active, check for new URLs and update budget if needed
        await this.checkForNewUrlsAndUpdateBudget(campaign);
        
        // For active campaigns that were activated with end time,
        // continuously monitor remaining clicks (for spent < $10 path)
        if (campaign.lastTrafficSenderStatus === 'activated_with_end_time') {
          console.log(`Campaign ${campaign.id} is active with end time, continuously monitoring remaining clicks (currently ${totalRemainingClicks})`);
          // Actual pause will happen on next run if clicks drop below 5,000 (see check above)
        }
      }
    } catch (error) {
      console.error(`Error processing Traffic Sender campaign ${campaign.id}:`, error);
    }
  }

  /**
   * Pause a TrafficStar campaign as part of the Traffic Sender process
   * Implementation of missing requirement: Check campaign status before pausing
   */
  private async pauseTrafficStarCampaign(campaignId: number, trafficstarId: number) {
    try {
      console.log(`Pausing TrafficStar campaign ${trafficstarId} through Traffic Sender`);
      
      // First check if the campaign is already paused to avoid unnecessary API calls
      const tsInfo = await trafficStarService.getCampaign(trafficstarId);
      
      if (tsInfo && tsInfo.status === 'paused') {
        console.log(`TrafficStar campaign ${trafficstarId} is already paused, no action needed`);
        
        // Update the campaign with the latest Traffic Sender action time
        await db.update(campaigns)
          .set({
            lastTrafficSenderAction: new Date(),
            lastTrafficSenderStatus: 'paused',
            updatedAt: new Date()
          })
          .where(eq(campaigns.id, campaignId));
          
        return;
      }
      
      // Pause the campaign in TrafficStar
      await trafficStarService.pauseCampaign(trafficstarId);
      
      // Update the campaign with the latest Traffic Sender action time
      await db.update(campaigns)
        .set({
          lastTrafficSenderAction: new Date(),
          lastTrafficSenderStatus: 'paused',
          updatedAt: new Date()
        })
        .where(eq(campaigns.id, campaignId));
        
      console.log(`Successfully paused TrafficStar campaign ${trafficstarId} through Traffic Sender`);
    } catch (error) {
      console.error(`Error pausing TrafficStar campaign ${trafficstarId}:`, error);
    }
  }

  /**
   * Check spent value and reactivate a campaign if conditions are met (Point 4, 5, 6, 7)
   * IMPORTANT: This never changes the trafficSenderEnabled setting which is exclusively controlled by the user
   */
  private async checkSpentValueAndReactivate(campaign: any) {
    try {
      console.log(`Checking spent value for campaign ${campaign.id}`);
      
      // Point 4: Get the spent value (already cached in the campaign)
      const spentValue = parseFloat(campaign.dailySpent || '0');
      console.log(`Campaign ${campaign.id} current spent value: $${spentValue.toFixed(4)}`);
      
      // Point 5: Get total remaining clicks across all active URLs for this campaign
      const remainingClicksResult = await db.execute(sql`
        SELECT SUM(click_limit - clicks) as remaining_clicks 
        FROM urls 
        WHERE campaign_id = ${campaign.id} 
        AND status = 'active'
      `);
      
      const totalRemainingClicks = parseInt(String(remainingClicksResult.rows[0]?.remaining_clicks) || '0');
      console.log(`Campaign ${campaign.id} has ${totalRemainingClicks} total remaining clicks`);
      
      // If no clicks remaining, keep campaign paused
      if (totalRemainingClicks <= 0) {
        console.log(`Campaign ${campaign.id} has no remaining clicks, keeping paused`);
        return;
      }
      
      // Point 5: Calculate the price per click (price per thousand divided by 1000)
      const pricePerClick = parseFloat(campaign.pricePerThousand) / 1000;
      
      // Point 5: Calculate the pending click price (remaining clicks * price per click)
      const pendingClickPrice = totalRemainingClicks * pricePerClick;
      console.log(`Campaign ${campaign.id} pending click price: $${pendingClickPrice.toFixed(4)}`);
      
      // Point 7: Critical check for spent < $10 and clicks < 5,000
      if (spentValue < this.MINIMUM_SPENT_VALUE && totalRemainingClicks < this.MINIMUM_CLICKS_PAUSE_THRESHOLD) {
        console.log(`CRITICAL: Campaign ${campaign.id} has less than 5,000 clicks (${totalRemainingClicks}) with spent < $10, keeping paused`);
        return;
      }
      
      // Check conditions for reactivation
      if (spentValue >= this.MINIMUM_SPENT_VALUE) {
        // Point 5 & 6: Spent value >= $10, update budget and activate
        await this.activateWithBudget(campaign, spentValue, pendingClickPrice, totalRemainingClicks);
      } else if (totalRemainingClicks >= this.MINIMUM_CLICKS_FOR_SMALL_BUDGET) {
        // Point 7: Spent value < $10 but remaining clicks >= 10,000, activate with end time
        await this.activateWithEndTime(campaign, totalRemainingClicks);
      } else {
        console.log(`Campaign ${campaign.id} does not meet reactivation criteria: spent value is less than $${this.MINIMUM_SPENT_VALUE} and remaining clicks (${totalRemainingClicks}) are less than ${this.MINIMUM_CLICKS_FOR_SMALL_BUDGET}`);
      }
    } catch (error) {
      console.error(`Error checking spent value for campaign ${campaign.id}:`, error);
    }
  }

  /**
   * Activate a campaign with an updated budget based on spent value + pending clicks
   * This is used for Step 5: When spent value is more than $10
   * Implementation of missing requirement: Check campaign status before activating
   * IMPORTANT: This never changes the trafficSenderEnabled setting which is exclusively controlled by the user
   */
  private async activateWithBudget(campaign: any, spentValue: number, pendingClickPrice: number, totalRemainingClicks: number) {
    try {
      console.log(`Activating campaign ${campaign.id} with budget update (spent value >= $${this.MINIMUM_SPENT_VALUE})`);
      
      // Calculate new budget (spent + pending clicks cost)
      const newBudget = spentValue + pendingClickPrice;
      console.log(`New budget for campaign ${campaign.id}: $${newBudget.toFixed(4)} (spent $${spentValue.toFixed(4)} + pending $${pendingClickPrice.toFixed(4)})`);
      
      // Get the TrafficStar campaign ID
      const trafficstarId = parseInt(campaign.trafficstarCampaignId);
      
      // First check if the campaign is already active to avoid unnecessary API calls
      const tsInfo = await trafficStarService.getCampaign(trafficstarId);
      
      if (tsInfo && tsInfo.status === 'active') {
        console.log(`TrafficStar campaign ${trafficstarId} is already active, just updating budget`);
        
        // Just update the budget
        await trafficStarService.updateCampaignBudget(trafficstarId, newBudget);
        
        // Update the campaign with the latest Traffic Sender action time
        await db.update(campaigns)
          .set({
            lastTrafficSenderAction: new Date(),
            lastTrafficSenderStatus: 'budget_updated',
            lastBudgetUpdateTime: new Date(),
            updatedAt: new Date()
          })
          .where(eq(campaigns.id, campaign.id));
          
        return;
      }
      
      // Update the budget and activate the campaign
      await trafficStarService.updateCampaignBudget(trafficstarId, newBudget);
      await trafficStarService.activateCampaign(trafficstarId);
      
      // Update the campaign with the latest Traffic Sender action time
      await db.update(campaigns)
        .set({
          lastTrafficSenderAction: new Date(),
          lastTrafficSenderStatus: 'activated_with_budget',
          lastBudgetUpdateTime: new Date(),
          updatedAt: new Date()
        })
        .where(eq(campaigns.id, campaign.id));
        
      console.log(`Successfully activated TrafficStar campaign ${trafficstarId} with budget $${newBudget.toFixed(4)}`);
    } catch (error) {
      console.error(`Error activating campaign ${campaign.id} with budget:`, error);
    }
  }

  /**
   * Activate a campaign with just an end time and fixed budget for cases with low spent value
   * This is used for Step 6: When spent value is less than $10 AND remaining clicks >= 10000
   * Implementation of missing requirement: Check campaign status before activating
   * IMPORTANT: This never changes the trafficSenderEnabled setting which is exclusively controlled by the user
   */
  private async activateWithEndTime(campaign: any, totalRemainingClicks: number) {
    try {
      console.log(`Activating campaign ${campaign.id} with end time (spent value < $${this.MINIMUM_SPENT_VALUE} but clicks >= ${this.MINIMUM_CLICKS_FOR_SMALL_BUDGET})`);
      
      // Calculate end time for current UTC date at 23:59
      const now = new Date();
      const endTimeDate = new Date(Date.UTC(
        now.getUTCFullYear(),
        now.getUTCMonth(),
        now.getUTCDate(),
        23, 59, 0 // 23:59:00 UTC
      ));
      const endTime = endTimeDate.toISOString();
      
      // Get the TrafficStar campaign ID
      const trafficstarId = parseInt(campaign.trafficstarCampaignId);
      
      // Set fixed budget amount to $10.15 as specified in requirements
      const fixedBudget = 10.15;
      
      // First check if the campaign is already active to avoid unnecessary API calls
      const tsInfo = await trafficStarService.getCampaign(trafficstarId);
      
      if (tsInfo && tsInfo.status === 'active') {
        console.log(`TrafficStar campaign ${trafficstarId} is already active, updating budget and end time`);
        
        // Update the budget and end time
        await trafficStarService.updateCampaignBudget(trafficstarId, fixedBudget);
        await trafficStarService.updateCampaignEndTime(trafficstarId, endTime);
        
        // Update the campaign with the latest Traffic Sender action time
        await db.update(campaigns)
          .set({
            lastTrafficSenderAction: new Date(),
            lastTrafficSenderStatus: 'end_time_updated',
            updatedAt: new Date()
          })
          .where(eq(campaigns.id, campaign.id));
          
        return;
      }
      
      // Set the budget, update the end time and activate the campaign
      await trafficStarService.updateCampaignBudget(trafficstarId, fixedBudget);
      await trafficStarService.updateCampaignEndTime(trafficstarId, endTime);
      await trafficStarService.activateCampaign(trafficstarId);
      
      // Update the campaign with the latest Traffic Sender action time
      await db.update(campaigns)
        .set({
          lastTrafficSenderAction: new Date(),
          lastTrafficSenderStatus: 'activated_with_end_time',
          updatedAt: new Date()
        })
        .where(eq(campaigns.id, campaign.id));
        
      console.log(`Successfully activated TrafficStar campaign ${trafficstarId} with end time ${endTime} and budget $${fixedBudget.toFixed(2)}`);
    } catch (error) {
      console.error(`Error activating campaign ${campaign.id} with end time:`, error);
    }
  }

  /**
   * Check for new URLs added since the last budget update and update the budget if needed
   * This is for Point 9: If we add new URLs after activating Traffic Sender, we need to update the budget
   * Waits 12 minutes before updating budget for all URLs added during that period
   * IMPORTANT: This never changes the trafficSenderEnabled setting which is exclusively controlled by the user
   */
  private async checkForNewUrlsAndUpdateBudget(campaign: any) {
    try {
      console.log(`Checking for new URLs in campaign ${campaign.id}`);
      
      // Skip if there's no last budget update time (should be set when Traffic Sender is enabled)
      if (!campaign.lastBudgetUpdateTime) {
        console.log(`Campaign ${campaign.id} has no lastBudgetUpdateTime, setting it now`);
        
        // Set the lastBudgetUpdateTime to now
        await db.update(campaigns)
          .set({
            lastBudgetUpdateTime: new Date(),
            updatedAt: new Date()
          })
          .where(eq(campaigns.id, campaign.id));
          
        return;
      }
      
      // Calculate time elapsed since the last budget update
      const minutesElapsed = (new Date().getTime() - new Date(campaign.lastBudgetUpdateTime).getTime()) / (1000 * 60);
      
      // Get URLs created after the last budget update
      const newUrlsResult = await db.execute(sql`
        SELECT SUM(click_limit - clicks) as new_clicks 
        FROM urls 
        WHERE campaign_id = ${campaign.id} 
        AND status = 'active' 
        AND created_at > ${campaign.lastBudgetUpdateTime}
      `);
      
      const newClicksTotal = parseInt(newUrlsResult.rows[0]?.new_clicks || '0');
      console.log(`Campaign ${campaign.id} has ${newClicksTotal} new clicks since last budget update`);
      
      // If there are new URLs, check if it's time to update the budget
      if (newClicksTotal > 0) {
        if (minutesElapsed >= this.NEW_URL_WAIT_MINUTES) {
          console.log(`Time to update budget for campaign ${campaign.id} (${minutesElapsed.toFixed(2)} minutes elapsed, threshold is ${this.NEW_URL_WAIT_MINUTES} minutes)`);
          
          // Calculate the price per click (price per thousand divided by 1000)
          const pricePerClick = parseFloat(campaign.pricePerThousand) / 1000;
          
          // Calculate the additional budget needed for new clicks
          const additionalBudget = newClicksTotal * pricePerClick;
          console.log(`Additional budget for campaign ${campaign.id}: $${additionalBudget.toFixed(4)} (${newClicksTotal} new clicks at $${pricePerClick.toFixed(6)} per click)`);
          
          // Get the TrafficStar campaign info
          const trafficstarId = parseInt(campaign.trafficstarCampaignId);
          const tsInfo = await trafficStarService.getCampaign(trafficstarId);
          
          if (!tsInfo) {
            console.log(`Could not get TrafficStar campaign ${trafficstarId} info, skipping budget update`);
            return;
          }
          
          // Calculate new budget (current max daily + additional budget)
          const currentBudget = parseFloat(tsInfo.max_daily || '0');
          const newBudget = currentBudget + additionalBudget;
          console.log(`New budget for campaign ${campaign.id}: $${newBudget.toFixed(4)} (current $${currentBudget.toFixed(4)} + additional $${additionalBudget.toFixed(4)})`);
          
          // Update the budget
          await trafficStarService.updateCampaignBudget(trafficstarId, newBudget);
          
          // Update the campaign with the latest budget update time
          await db.update(campaigns)
            .set({
              lastBudgetUpdateTime: new Date(),
              lastTrafficSenderAction: new Date(),
              lastTrafficSenderStatus: 'budget_updated_for_new_urls',
              updatedAt: new Date()
            })
            .where(eq(campaigns.id, campaign.id));
            
          console.log(`Successfully updated budget for TrafficStar campaign ${trafficstarId} to $${newBudget.toFixed(4)}`);
        } else {
          console.log(`Waiting for ${this.NEW_URL_WAIT_MINUTES - minutesElapsed} more minutes before updating budget for campaign ${campaign.id}`);
        }
      } else {
        console.log(`No new URLs detected for campaign ${campaign.id} since last budget update`);
      }
    } catch (error) {
      console.error(`Error checking for new URLs in campaign ${campaign.id}:`, error);
    }
  }

  /**
   * Process pending budget updates for testing purposes
   */
  public async processPendingBudgetUpdates() {
    console.log('Processing pending URL budget updates');
    await this.processTrafficSenderCampaigns();
  }

  /**
   * Get campaigns with pending budget updates
   */
  public async getPendingBudgetUpdates() {
    // Find all campaigns with Traffic Sender enabled
    const enabledCampaigns = await db
      .select()
      .from(campaigns)
      .where(eq(campaigns.trafficSenderEnabled, true));
    
    const pendingUpdates = [];
    
    for (const campaign of enabledCampaigns) {
      // Skip if there's no last budget update time
      if (!campaign.lastBudgetUpdateTime) {
        continue;
      }
      
      // Calculate time elapsed since the last budget update
      const minutesElapsed = (new Date().getTime() - new Date(campaign.lastBudgetUpdateTime).getTime()) / (1000 * 60);
      
      // Get URLs created after the last budget update
      const newUrlsResult = await db.execute(sql`
        SELECT SUM(click_limit - clicks) as new_clicks 
        FROM urls 
        WHERE campaign_id = ${campaign.id} 
        AND status = 'active' 
        AND created_at > ${campaign.lastBudgetUpdateTime}
      `);
      
      const newClicksTotal = parseInt(newUrlsResult.rows[0]?.new_clicks || '0');
      
      // If there are new URLs, check if it's time to update the budget
      if (newClicksTotal > 0) {
        pendingUpdates.push({
          campaignId: campaign.id,
          campaignName: campaign.name,
          newClicksTotal,
          minutesElapsed,
          minutesRemaining: this.NEW_URL_WAIT_MINUTES - minutesElapsed,
          readyForUpdate: minutesElapsed >= this.NEW_URL_WAIT_MINUTES
        });
      }
    }
    
    return pendingUpdates;
  }
}

export const trafficSenderService = new TrafficSenderService();
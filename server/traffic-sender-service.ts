/**
 * Traffic Sender Service
 * 
 * This service manages the Traffic Sender feature, which automatically handles
 * campaign traffic by pausing and activating TrafficStar campaigns based on
 * specific conditions and remaining clicks.
 */

import { db } from './db';
import { eq, and, isNotNull, sql } from 'drizzle-orm';
import { campaigns, urls } from '@shared/schema';
import { trafficStarService } from './trafficstar-service';
import { storage } from './storage';

class TrafficSenderService {
  private checkInterval: NodeJS.Timeout | null = null;
  private readonly PAUSE_RECHECK_MINUTES = 10; // Wait time before checking spent value (step 2)
  private readonly MINIMUM_SPENT_VALUE = 10; // Minimum spent value threshold ($10)
  private readonly MINIMUM_CLICKS_FOR_SMALL_BUDGET = 10000; // Minimum click threshold for small budgets

  /**
   * Starts the Traffic Sender service
   */
  public async start() {
    console.log('🚀 Starting Traffic Sender service...');
    
    // Clear any existing interval
    if (this.checkInterval) {
      clearInterval(this.checkInterval);
    }
    
    // Set up checking interval (every 5 minutes)
    this.checkInterval = setInterval(() => this.processTrafficSenderCampaigns(), 5 * 60 * 1000);
    
    // Run the first check immediately
    await this.processTrafficSenderCampaigns();
    
    console.log('✅ Traffic Sender service started successfully');
  }
  
  /**
   * Stops the Traffic Sender service
   */
  public stop() {
    if (this.checkInterval) {
      clearInterval(this.checkInterval);
      this.checkInterval = null;
      console.log('⏹️ Traffic Sender service stopped');
    }
  }
  
  /**
   * Process all campaigns with Traffic Sender enabled
   */
  private async processTrafficSenderCampaigns() {
    try {
      console.log('🔄 Processing Traffic Sender campaigns...');
      
      // Get all campaigns with Traffic Sender enabled and valid TrafficStar IDs
      const enabledCampaigns = await db
        .select()
        .from(campaigns)
        .where(
          and(
            eq(campaigns.trafficSenderEnabled, true),
            isNotNull(campaigns.trafficstarCampaignId)
          )
        );
        
      if (enabledCampaigns.length === 0) {
        console.log('ℹ️ No campaigns with Traffic Sender enabled found');
        return;
      }
      
      console.log(`🔍 Found ${enabledCampaigns.length} campaigns with Traffic Sender enabled`);
      
      // Process each campaign
      for (const campaign of enabledCampaigns) {
        await this.processTrafficSenderCampaign(campaign);
      }
    } catch (error) {
      console.error('❌ Error processing Traffic Sender campaigns:', error);
    }
  }
  
  /**
   * Process a single campaign with Traffic Sender
   */
  private async processTrafficSenderCampaign(campaign: any) {
    try {
      if (!campaign.trafficstarCampaignId) {
        console.log(`⚠️ Campaign ${campaign.id} has no TrafficStar campaign ID`);
        return;
      }
      
      const trafficstarId = Number(campaign.trafficstarCampaignId);
      const now = new Date();
      
      // Check if this is a first-time activation (no last action timestamp)
      // As per step 1: When Traffic Sender is activated, we must pause the campaign
      if (!campaign.lastTrafficSenderAction) {
        console.log(`🆕 First-time activation for campaign ${campaign.id}`);
        // First-time activation - pause the campaign and set end time to current UTC
        await this.pauseTrafficStarCampaign(campaign.id, trafficstarId);
        return;
      }
      
      // If campaign was recently paused, check if it's time to reactivate
      const lastAction = new Date(campaign.lastTrafficSenderAction);
      const pauseTime = campaign.lastTrafficSenderStatus === 'paused' ? lastAction : null;
      
      if (pauseTime) {
        // As per step 2: Wait for 10 minutes after pausing
        const minutesSincePause = Math.floor((now.getTime() - pauseTime.getTime()) / (60 * 1000));
        
        // If it hasn't been long enough since the pause, wait
        if (minutesSincePause < this.PAUSE_RECHECK_MINUTES) {
          console.log(`⏳ Campaign ${campaign.id} was paused ${minutesSincePause} minutes ago, waiting until ${this.PAUSE_RECHECK_MINUTES} minutes before checking spent value`);
          return;
        }
        
        // As per step 3-6: After 10 minutes, check the spent value and reactivate based on conditions
        console.log(`⏱️ ${this.PAUSE_RECHECK_MINUTES} minutes have passed since pausing campaign ${campaign.id}, now checking spent value`);
        await this.checkSpentValueAndReactivate(campaign);
      } else {
        // As per step 7: If campaign is active, check if new URLs have been added
        await this.checkForNewUrlsAndUpdateBudget(campaign);
      }
    } catch (error) {
      console.error(`❌ Error processing Traffic Sender campaign ${campaign.id}:`, error);
      
      // Update the campaign with the error
      await db.update(campaigns)
        .set({
          lastTrafficSenderStatus: `Error: ${error instanceof Error ? error.message : String(error)}`,
          updatedAt: new Date()
        })
        .where(eq(campaigns.id, campaign.id));
    }
  }
  
  /**
   * Pause a TrafficStar campaign as part of the Traffic Sender process
   */
  private async pauseTrafficStarCampaign(campaignId: number, trafficstarId: number) {
    console.log(`⏸️ Pausing TrafficStar campaign ${trafficstarId} for campaign ${campaignId}`);
    
    try {
      // Pause the campaign in TrafficStar
      await trafficStarService.pauseCampaign(trafficstarId);
      
      // Set the end time to today at current time (UTC)
      const now = new Date();
      const currentUtcDate = now.toISOString().split('T')[0];
      const currentUtcTime = now.toISOString().split('T')[1].substring(0, 8);
      const endTimeValue = `${currentUtcDate} ${currentUtcTime}`;
      
      await trafficStarService.updateCampaignEndTime(trafficstarId, endTimeValue);
      
      // Update our database to record this action
      await db.update(campaigns)
        .set({
          lastTrafficSenderAction: now,
          lastTrafficSenderStatus: 'paused',
          updatedAt: now
        })
        .where(eq(campaigns.id, campaignId));
        
      console.log(`✅ Successfully paused TrafficStar campaign ${trafficstarId} and set end time to ${endTimeValue}`);
    } catch (error) {
      console.error(`❌ Error pausing TrafficStar campaign ${trafficstarId}:`, error);
      
      // Update the campaign with the error
      await db.update(campaigns)
        .set({
          lastTrafficSenderAction: new Date(),
          lastTrafficSenderStatus: `Error pausing: ${error instanceof Error ? error.message : String(error)}`,
          updatedAt: new Date()
        })
        .where(eq(campaigns.id, campaignId));
        
      throw error;
    }
  }
  
  /**
   * Check spent value and reactivate a campaign if conditions are met
   */
  private async checkSpentValueAndReactivate(campaign: any) {
    const campaignId = campaign.id;
    const trafficstarId = Number(campaign.trafficstarCampaignId);
    
    console.log(`🔍 Checking spent value for campaign ${campaignId} (TrafficStar ID: ${trafficstarId})`);
    
    try {
      // Get the current spent value for today
      const spentValue = await trafficStarService.getCampaignSpentValue(trafficstarId);
      
      if (typeof spentValue !== 'number') {
        throw new Error(`Failed to get spent value for campaign ${trafficstarId}`);
      }
      
      console.log(`💵 Current spent value for campaign ${campaignId}: $${spentValue.toFixed(2)}`);
      
      // Get active URLs for this campaign to calculate pending click value
      const activeUrls = await db
        .select()
        .from(urls)
        .where(
          and(
            eq(urls.campaignId, campaignId),
            eq(urls.status, 'active')
          )
        );
      
      // Calculate total remaining clicks
      let totalRemainingClicks = 0;
      activeUrls.forEach(url => {
        const remainingClicks = Math.max(0, (url.clickLimit || 0) - (url.clicks || 0));
        totalRemainingClicks += remainingClicks;
      });
      
      console.log(`🔢 Total remaining clicks for campaign ${campaignId}: ${totalRemainingClicks}`);
      
      // Calculate the price for remaining clicks
      const pricePerThousand = parseFloat(campaign.pricePerThousand?.toString() || '0');
      const pendingClickPrice = (totalRemainingClicks / 1000) * pricePerThousand;
      
      console.log(`💰 Pending click price for campaign ${campaignId}: $${pendingClickPrice.toFixed(2)}`);
      
      // Different logic based on spent value
      if (spentValue >= this.MINIMUM_SPENT_VALUE) {
        // If spent is above minimum, add pending click price to spent value for new budget
        await this.activateWithBudget(campaign, spentValue, pendingClickPrice, totalRemainingClicks);
      } else {
        // If spent is below minimum, check if we have enough remaining clicks
        if (totalRemainingClicks >= this.MINIMUM_CLICKS_FOR_SMALL_BUDGET) {
          await this.activateWithEndTime(campaign, totalRemainingClicks);
        } else {
          console.log(`⚠️ Campaign ${campaignId} has less than ${this.MINIMUM_CLICKS_FOR_SMALL_BUDGET} clicks (${totalRemainingClicks}) and spent value is below $${this.MINIMUM_SPENT_VALUE} ($${spentValue.toFixed(2)}), not activating`);
          
          // Update last action status
          await db.update(campaigns)
            .set({
              lastTrafficSenderAction: new Date(),
              lastTrafficSenderStatus: `Not activated: Spent value $${spentValue.toFixed(2)} below minimum and only ${totalRemainingClicks} clicks remaining`,
              updatedAt: new Date()
            })
            .where(eq(campaigns.id, campaignId));
        }
      }
    } catch (error) {
      console.error(`❌ Error checking spent value for campaign ${campaignId}:`, error);
      
      // Update the campaign with the error
      await db.update(campaigns)
        .set({
          lastTrafficSenderAction: new Date(),
          lastTrafficSenderStatus: `Error checking spent: ${error instanceof Error ? error.message : String(error)}`,
          updatedAt: new Date()
        })
        .where(eq(campaigns.id, campaignId));
        
      throw error;
    }
  }
  
  /**
   * Activate a campaign with an updated budget based on spent value + pending clicks
   * This is used for Step 5: When spent value is more than $10
   */
  private async activateWithBudget(campaign: any, spentValue: number, pendingClickPrice: number, totalRemainingClicks: number) {
    const campaignId = campaign.id;
    const trafficstarId = Number(campaign.trafficstarCampaignId);
    
    try {
      // Step 5: If spent value > $10, then calculate price for remaining clicks
      // and update TrafficStar daily budget to (spent value + remaining clicks price)
      const newBudget = spentValue + pendingClickPrice;
      
      console.log(`💲 Setting new budget for campaign ${campaignId}: $${newBudget.toFixed(4)} (spent: $${spentValue.toFixed(4)} + pending: $${pendingClickPrice.toFixed(4)})`);
      
      // Set the new budget in TrafficStar
      await trafficStarService.updateCampaignDailyBudget(trafficstarId, newBudget);
      
      // Step 5: Set end time to today at 23:59 UTC
      const today = new Date().toISOString().split('T')[0];
      const endTime = `${today} 23:59:00`;
      
      await trafficStarService.updateCampaignEndTime(trafficstarId, endTime);
      
      // Step 5: Activate the campaign
      await trafficStarService.activateCampaign(trafficstarId);
      
      // Update our database to record this action
      await db.update(campaigns)
        .set({
          lastTrafficSenderAction: new Date(),
          lastTrafficSenderStatus: `Activated with budget $${newBudget.toFixed(4)} for ${totalRemainingClicks} clicks, end time ${endTime}`,
          updatedAt: new Date()
        })
        .where(eq(campaigns.id, campaignId));
        
      console.log(`✅ Successfully activated TrafficStar campaign ${trafficstarId} with new budget $${newBudget.toFixed(4)} and end time ${endTime}`);
    } catch (error) {
      console.error(`❌ Error activating campaign ${campaignId} with budget:`, error);
      
      // Update the campaign with the error
      await db.update(campaigns)
        .set({
          lastTrafficSenderAction: new Date(),
          lastTrafficSenderStatus: `Error activating with budget: ${error instanceof Error ? error.message : String(error)}`,
          updatedAt: new Date()
        })
        .where(eq(campaigns.id, campaignId));
        
      throw error;
    }
  }
  
  /**
   * Activate a campaign with just an end time (for cases with low spent value)
   * This is used for Step 6: When spent value is less than $10 AND remaining clicks >= 10000
   */
  private async activateWithEndTime(campaign: any, totalRemainingClicks: number) {
    const campaignId = campaign.id;
    const trafficstarId = Number(campaign.trafficstarCampaignId);
    
    try {
      console.log(`🕒 Activating campaign ${campaignId} with end time only (for ${totalRemainingClicks} clicks, low spent value)`);
      
      // Step 6: If spent value < $10 AND remaining clicks >= 10000,
      // activate TrafficStar campaign with current UTC date and end time 23:59
      const today = new Date().toISOString().split('T')[0];
      const endTime = `${today} 23:59:00`;
      
      await trafficStarService.updateCampaignEndTime(trafficstarId, endTime);
      
      // Activate the campaign without changing budget
      await trafficStarService.activateCampaign(trafficstarId);
      
      // Update our database to record this action
      await db.update(campaigns)
        .set({
          lastTrafficSenderAction: new Date(),
          lastTrafficSenderStatus: `Activated with end time ${endTime} for ${totalRemainingClicks} clicks (low spent value)`,
          updatedAt: new Date()
        })
        .where(eq(campaigns.id, campaignId));
        
      console.log(`✅ Successfully activated TrafficStar campaign ${trafficstarId} with end time ${endTime} (no budget change, low spent value)`);
    } catch (error) {
      console.error(`❌ Error activating campaign ${campaignId} with end time:`, error);
      
      // Update the campaign with the error
      await db.update(campaigns)
        .set({
          lastTrafficSenderAction: new Date(),
          lastTrafficSenderStatus: `Error activating with end time: ${error instanceof Error ? error.message : String(error)}`,
          updatedAt: new Date()
        })
        .where(eq(campaigns.id, campaignId));
        
      throw error;
    }
  }
  
  /**
   * Check if new URLs have been added to an active campaign and update budget if needed
   * This implements Step 7: If new URLs are added after activation, update the budget
   */
  private async checkForNewUrlsAndUpdateBudget(campaign: any) {
    const campaignId = campaign.id;
    const trafficstarId = Number(campaign.trafficstarCampaignId);
    
    try {
      console.log(`🔍 Checking for new URLs in campaign ${campaignId}`);
      
      // Get the TrafficStar campaign status
      const tsCampaign = await trafficStarService.getCampaign(trafficstarId);
      
      // If the campaign isn't active, nothing to do
      if (!tsCampaign?.active) {
        console.log(`ℹ️ TrafficStar campaign ${trafficstarId} is not active, skipping budget update check`);
        return;
      }
      
      // Step 7: Check if any new URLs have been added since last action
      const lastAction = new Date(campaign.lastTrafficSenderAction);
      
      const newUrls = await db
        .select()
        .from(urls)
        .where(
          and(
            eq(urls.campaignId, campaignId),
            eq(urls.status, 'active'),
            sql`${urls.createdAt} > ${lastAction}`
          )
        );
        
      if (newUrls.length === 0) {
        console.log(`ℹ️ No new URLs added to campaign ${campaignId} since last action`);
        return;
      }
      
      console.log(`🆕 Found ${newUrls.length} new URLs added to campaign ${campaignId} since last action`);
      
      // Step 7: Calculate the price for the new URLs
      let newClicksTotal = 0;
      newUrls.forEach(url => {
        newClicksTotal += url.clickLimit || 0;
      });
      
      const pricePerThousand = parseFloat(campaign.pricePerThousand?.toString() || '0');
      const newUrlsPrice = (newClicksTotal / 1000) * pricePerThousand;
      
      console.log(`💰 New URLs price for campaign ${campaignId}: $${newUrlsPrice.toFixed(4)} (${newClicksTotal} clicks)`);
      
      // Get the current budget for the campaign
      const currentBudget = tsCampaign.max_daily || 0;
      
      // Step 7: Calculate the new budget by adding the price of the new URLs
      const newBudget = currentBudget + newUrlsPrice;
      
      console.log(`💲 Updating budget for campaign ${campaignId} from $${currentBudget.toFixed(4)} to $${newBudget.toFixed(4)} (+$${newUrlsPrice.toFixed(4)})`);
      
      // Step 7: Update the budget in TrafficStar with the new value
      await trafficStarService.updateCampaignDailyBudget(trafficstarId, newBudget);
      
      // Update our database to record this action
      await db.update(campaigns)
        .set({
          lastTrafficSenderAction: new Date(),
          lastTrafficSenderStatus: `Updated budget to $${newBudget.toFixed(4)} (+$${newUrlsPrice.toFixed(4)} for ${newClicksTotal} new clicks)`,
          updatedAt: new Date()
        })
        .where(eq(campaigns.id, campaignId));
        
      console.log(`✅ Successfully updated budget for TrafficStar campaign ${trafficstarId} to $${newBudget.toFixed(4)}`);
    } catch (error) {
      console.error(`❌ Error checking for new URLs in campaign ${campaignId}:`, error);
      
      // Update the campaign with the error
      await db.update(campaigns)
        .set({
          lastTrafficSenderAction: new Date(),
          lastTrafficSenderStatus: `Error updating budget: ${error instanceof Error ? error.message : String(error)}`,
          updatedAt: new Date()
        })
        .where(eq(campaigns.id, campaignId));
        
      throw error;
    }
  }
}

export const trafficSenderService = new TrafficSenderService();
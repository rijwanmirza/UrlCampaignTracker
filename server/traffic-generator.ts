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

/**
 * Get TrafficStar campaign status
 * @param trafficstarCampaignId The TrafficStar campaign ID
 * @returns The campaign status (active, paused, etc.) or null if error
 */
export async function getTrafficStarCampaignStatus(trafficstarCampaignId: string) {
  try {
    // Use trafficStarService to get campaign status
    const campaign = await trafficStarService.getCampaign(Number(trafficstarCampaignId));
    
    if (!campaign) {
      console.error(`Failed to get TrafficStar campaign ${trafficstarCampaignId}`);
      return null;
    }
    
    // Return the campaign status
    return campaign.status;
  } catch (error) {
    console.error('Error getting TrafficStar campaign status:', error);
    return null;
  }
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
    
    // Only pause if the campaign is active
    if (status === 'active') {
      console.log(`Pausing TrafficStar campaign ${campaign.trafficstarCampaignId}`);
      const success = await pauseTrafficStarCampaign(campaign.trafficstarCampaignId);
      
      if (success) {
        console.log(`Successfully paused TrafficStar campaign ${campaign.trafficstarCampaignId}`);
      } else {
        console.error(`Failed to pause TrafficStar campaign ${campaign.trafficstarCampaignId}`);
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
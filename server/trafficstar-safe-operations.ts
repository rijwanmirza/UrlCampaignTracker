/**
 * TrafficStar Safe Operations
 * 
 * This module provides safer operations for TrafficStar API integration,
 * ensuring that redundant pause/activate calls are never made.
 * It always checks the current status before attempting any state change.
 * 
 * This completely replaces the older pause/activate methods in trafficstar-service.ts.
 */

import { db } from './db';
import { trafficstarCampaigns } from '@shared/schema';
import { eq } from 'drizzle-orm';
import axios from 'axios';

/**
 * TrafficStar API Configuration
 */
interface TrafficStarConfig {
  apiKey: string;
  baseUrl: string;
}

/**
 * Cache for TrafficStar campaign statuses
 * Maps campaign ID to {status, timestamp}
 */
const campaignStatusCache = new Map<number, {
  active: boolean;
  status: string;
  lastCheckedAt: Date;
}>();

/**
 * Gets the TrafficStar configuration
 */
function getConfig(): TrafficStarConfig {
  return {
    apiKey: process.env.TRAFFICSTAR_API_KEY || '',
    baseUrl: 'https://api.trafficstar.com/v1'
  };
}

/**
 * Safely gets the current status of a TrafficStar campaign directly from the API
 * Returns complete API status information
 * 
 * @param campaignId TrafficStar campaign ID
 * @returns Complete campaign status information from the API
 */
export async function getTrafficStarCampaignStatus(campaignId: number): Promise<any> {
  try {
    // Check if we have a recent status in the cache
    const cachedStatus = campaignStatusCache.get(campaignId);
    const now = new Date();
    
    // Use cache if it's less than 30 seconds old
    if (cachedStatus && (now.getTime() - cachedStatus.lastCheckedAt.getTime() < 30 * 1000)) {
      console.log(`Using cached status for campaign ${campaignId}: active=${cachedStatus.active}, status=${cachedStatus.status}`);
      return { 
        active: cachedStatus.active, 
        status: cachedStatus.status,
        fromCache: true 
      };
    }
    
    // Otherwise, get fresh status from API
    const config = getConfig();
    const response = await axios.get(`${config.baseUrl}/campaign/${campaignId}`, {
      headers: {
        'Authorization': `Bearer ${config.apiKey}`
      }
    });
    
    const campaign = response.data;
    
    // Update the cache
    campaignStatusCache.set(campaignId, {
      active: campaign.active,
      status: campaign.status,
      lastCheckedAt: now
    });
    
    // Also update database
    await db.update(trafficstarCampaigns)
      .set({
        active: campaign.active,
        status: campaign.status,
        lastVerifiedStatus: campaign.status,
        updatedAt: new Date()
      })
      .where(eq(trafficstarCampaigns.trafficstarId, campaignId.toString()));
    
    return campaign;
  } catch (error) {
    console.error(`Error getting campaign status for ${campaignId}:`, error);
    
    try {
      // Attempt to get status from database as fallback
      const [dbCampaign] = await db
        .select()
        .from(trafficstarCampaigns)
        .where(eq(trafficstarCampaigns.trafficstarId, campaignId.toString()));
      
      if (dbCampaign) {
        console.log(`Using database status for campaign ${campaignId}: active=${dbCampaign.active}, status=${dbCampaign.status}`);
        return {
          active: dbCampaign.active,
          status: dbCampaign.status,
          fromDatabase: true
        };
      }
    } catch (dbError) {
      console.error(`Error getting database status for campaign ${campaignId}:`, dbError);
    }
    
    // If all fails, rethrow the original error
    throw error;
  }
}

/**
 * Safely pauses a TrafficStar campaign
 * Will first check the current status and only pause if the campaign is not already paused
 * 
 * @param campaignId TrafficStar campaign ID
 * @returns Status information including whether action was taken
 */
export async function safelyPauseCampaign(campaignId: number): Promise<{
  campaignId: number;
  newStatus: string;
  wasAlreadyPaused: boolean;
  actionTaken: boolean;
  statusResponse?: any;
}> {
  console.log(`Safely pausing campaign ${campaignId} - checking current status first`);
  
  try {
    // Always get the most current status from API
    const currentStatus = await getTrafficStarCampaignStatus(campaignId);
    
    // Check if campaign is already paused
    if (!currentStatus.active || currentStatus.status === 'paused') {
      console.log(`Campaign ${campaignId} is already paused (active=${currentStatus.active}, status=${currentStatus.status}) - no action needed`);
      
      // Still update the database to ensure it reflects the correct status
      await db.update(trafficstarCampaigns)
        .set({
          active: false,
          status: 'paused',
          lastVerifiedStatus: 'paused',
          lastRequestedAction: 'pause',
          lastRequestedActionAt: new Date(),
          lastRequestedActionSuccess: true,
          updatedAt: new Date()
        })
        .where(eq(trafficstarCampaigns.trafficstarId, campaignId.toString()));
      
      return {
        campaignId,
        newStatus: 'paused',
        wasAlreadyPaused: true,
        actionTaken: false
      };
    }
    
    // Campaign is active, so we need to pause it
    console.log(`Campaign ${campaignId} is currently active - sending pause request`);
    
    // Call the API to pause the campaign
    const config = getConfig();
    const response = await axios.post(`${config.baseUrl}/campaign/${campaignId}/pause`, {}, {
      headers: {
        'Authorization': `Bearer ${config.apiKey}`
      }
    });
    
    // Update cache with new status
    campaignStatusCache.set(campaignId, {
      active: false,
      status: 'paused',
      lastCheckedAt: new Date()
    });
    
    // Update database with new status
    await db.update(trafficstarCampaigns)
      .set({
        active: false,
        status: 'paused',
        lastVerifiedStatus: 'paused',
        lastRequestedAction: 'pause',
        lastRequestedActionAt: new Date(),
        lastRequestedActionSuccess: true,
        updatedAt: new Date()
      })
      .where(eq(trafficstarCampaigns.trafficstarId, campaignId.toString()));
    
    console.log(`✅ Successfully paused campaign ${campaignId}`);
    
    return {
      campaignId,
      newStatus: 'paused',
      wasAlreadyPaused: false,
      actionTaken: true,
      statusResponse: response.data
    };
  } catch (error) {
    console.error(`Error safely pausing campaign ${campaignId}:`, error);
    
    // Update database to record failed action
    try {
      await db.update(trafficstarCampaigns)
        .set({
          lastRequestedAction: 'pause',
          lastRequestedActionAt: new Date(),
          lastRequestedActionSuccess: false,
          updatedAt: new Date()
        })
        .where(eq(trafficstarCampaigns.trafficstarId, campaignId.toString()));
    } catch (dbError) {
      console.error(`Error updating database for failed pause action on campaign ${campaignId}:`, dbError);
    }
    
    throw error;
  }
}

/**
 * Safely activates a TrafficStar campaign
 * Will first check the current status and only activate if the campaign is not already active
 * 
 * @param campaignId TrafficStar campaign ID
 * @returns Status information including whether action was taken
 */
export async function safelyActivateCampaign(campaignId: number): Promise<{
  campaignId: number;
  newStatus: string;
  wasAlreadyActive: boolean;
  actionTaken: boolean;
  statusResponse?: any;
}> {
  console.log(`Safely activating campaign ${campaignId} - checking current status first`);
  
  try {
    // Always get the most current status from API
    const currentStatus = await getTrafficStarCampaignStatus(campaignId);
    
    // Check if campaign is already active
    if (currentStatus.active === true || currentStatus.status === 'enabled') {
      console.log(`Campaign ${campaignId} is already active (active=${currentStatus.active}, status=${currentStatus.status}) - no action needed`);
      
      // Still update the database to ensure it reflects the correct status
      await db.update(trafficstarCampaigns)
        .set({
          active: true,
          status: 'enabled',
          lastVerifiedStatus: 'enabled',
          lastRequestedAction: 'activate',
          lastRequestedActionAt: new Date(),
          lastRequestedActionSuccess: true,
          updatedAt: new Date()
        })
        .where(eq(trafficstarCampaigns.trafficstarId, campaignId.toString()));
      
      return {
        campaignId,
        newStatus: 'enabled',
        wasAlreadyActive: true,
        actionTaken: false
      };
    }
    
    // Campaign is not active, so we need to activate it
    console.log(`Campaign ${campaignId} is currently paused - sending activate request`);
    
    // Call the API to activate the campaign
    const config = getConfig();
    const response = await axios.post(`${config.baseUrl}/campaign/${campaignId}/enable`, {}, {
      headers: {
        'Authorization': `Bearer ${config.apiKey}`
      }
    });
    
    // Update cache with new status
    campaignStatusCache.set(campaignId, {
      active: true,
      status: 'enabled',
      lastCheckedAt: new Date()
    });
    
    // Update database with new status
    await db.update(trafficstarCampaigns)
      .set({
        active: true,
        status: 'enabled',
        lastVerifiedStatus: 'enabled',
        lastRequestedAction: 'activate',
        lastRequestedActionAt: new Date(),
        lastRequestedActionSuccess: true,
        updatedAt: new Date()
      })
      .where(eq(trafficstarCampaigns.trafficstarId, campaignId.toString()));
    
    console.log(`✅ Successfully activated campaign ${campaignId}`);
    
    return {
      campaignId,
      newStatus: 'enabled',
      wasAlreadyActive: false,
      actionTaken: true,
      statusResponse: response.data
    };
  } catch (error) {
    console.error(`Error safely activating campaign ${campaignId}:`, error);
    
    // Update database to record failed action
    try {
      await db.update(trafficstarCampaigns)
        .set({
          lastRequestedAction: 'activate',
          lastRequestedActionAt: new Date(),
          lastRequestedActionSuccess: false,
          updatedAt: new Date()
        })
        .where(eq(trafficstarCampaigns.trafficstarId, campaignId.toString()));
    } catch (dbError) {
      console.error(`Error updating database for failed activate action on campaign ${campaignId}:`, dbError);
    }
    
    throw error;
  }
}

/**
 * Updates the end time for a campaign, but only if it's different from the current end time
 * 
 * @param campaignId TrafficStar campaign ID
 * @param endTime New end time in format YYYY-MM-DD HH:MM:SS
 * @returns Result of the operation
 */
export async function safelyUpdateEndTime(campaignId: number, endTime: string): Promise<{
  campaignId: number;
  endTime: string;
  wasAlreadySame: boolean;
  actionTaken: boolean;
  statusResponse?: any;
}> {
  console.log(`Safely updating end time for campaign ${campaignId} to ${endTime} - checking current status first`);
  
  try {
    // Get current campaign details
    const currentStatus = await getTrafficStarCampaignStatus(campaignId);
    
    // Check if end time is already set to the desired value
    if (currentStatus.schedule_end_time === endTime) {
      console.log(`Campaign ${campaignId} already has end time ${endTime} - no action needed`);
      return {
        campaignId,
        endTime,
        wasAlreadySame: true,
        actionTaken: false
      };
    }
    
    // End time is different, update it
    console.log(`Campaign ${campaignId} has different end time (${currentStatus.schedule_end_time || 'not set'}) - updating to ${endTime}`);
    
    // Call the API to update the end time
    const config = getConfig();
    const response = await axios.put(`${config.baseUrl}/campaign/${campaignId}`, {
      schedule_end_time: endTime
    }, {
      headers: {
        'Authorization': `Bearer ${config.apiKey}`
      }
    });
    
    console.log(`✅ Successfully updated end time for campaign ${campaignId} to ${endTime}`);
    
    return {
      campaignId,
      endTime,
      wasAlreadySame: false,
      actionTaken: true,
      statusResponse: response.data
    };
  } catch (error) {
    console.error(`Error safely updating end time for campaign ${campaignId}:`, error);
    throw error;
  }
}

/**
 * Updates the daily budget for a campaign, but only if it's different from the current budget
 * 
 * @param campaignId TrafficStar campaign ID
 * @param budget New daily budget (e.g., 10.15)
 * @returns Result of the operation
 */
export async function safelyUpdateDailyBudget(campaignId: number, budget: number): Promise<{
  campaignId: number;
  budget: number;
  wasAlreadySame: boolean;
  actionTaken: boolean;
  statusResponse?: any;
}> {
  console.log(`Safely updating daily budget for campaign ${campaignId} to $${budget.toFixed(2)} - checking current status first`);
  
  try {
    // Get current campaign details
    const currentStatus = await getTrafficStarCampaignStatus(campaignId);
    
    // Allow a small rounding error (0.01)
    const currentBudget = parseFloat(currentStatus.max_daily) || 0;
    if (Math.abs(currentBudget - budget) < 0.01) {
      console.log(`Campaign ${campaignId} already has daily budget $${currentBudget.toFixed(2)} - no action needed`);
      return {
        campaignId,
        budget,
        wasAlreadySame: true,
        actionTaken: false
      };
    }
    
    // Budget is different, update it
    console.log(`Campaign ${campaignId} has different daily budget ($${currentBudget.toFixed(2)}) - updating to $${budget.toFixed(2)}`);
    
    // Call the API to update the budget
    const config = getConfig();
    const response = await axios.put(`${config.baseUrl}/campaign/${campaignId}`, {
      max_daily: budget
    }, {
      headers: {
        'Authorization': `Bearer ${config.apiKey}`
      }
    });
    
    console.log(`✅ Successfully updated daily budget for campaign ${campaignId} to $${budget.toFixed(2)}`);
    
    return {
      campaignId,
      budget,
      wasAlreadySame: false,
      actionTaken: true,
      statusResponse: response.data
    };
  } catch (error) {
    console.error(`Error safely updating daily budget for campaign ${campaignId}:`, error);
    throw error;
  }
}

/**
 * Clears the status cache for a campaign or all campaigns
 * 
 * @param campaignId Optional campaign ID to clear, if not provided clears all
 */
export function clearStatusCache(campaignId?: number): void {
  if (campaignId) {
    campaignStatusCache.delete(campaignId);
    console.log(`Cleared status cache for campaign ${campaignId}`);
  } else {
    campaignStatusCache.clear();
    console.log('Cleared status cache for all campaigns');
  }
}
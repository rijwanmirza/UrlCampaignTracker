/**
 * Scheduled Budget Updater
 * 
 * This module handles checking and executing scheduled budget updates
 * at the specific time configured for each campaign.
 */

import { db, pool } from './db';
import { campaigns } from '../shared/schema';
import { eq, and, isNull, not, or } from 'drizzle-orm';
import { trafficStarService } from './trafficstar-service';

/**
 * The default budget amount to set ($10.15)
 */
const DEFAULT_BUDGET_AMOUNT = 10.15;

/**
 * Check for and process any pending budget updates.
 * This should be run periodically, e.g., every minute.
 */
export async function processScheduledBudgetUpdates(): Promise<void> {
  try {
    // Get current UTC time
    const now = new Date();
    const currentHour = now.getUTCHours();
    const currentMinute = now.getUTCMinutes();
    
    // Format current time as HH:MM:00 for comparison with budgetUpdateTime
    // Using padStart to ensure 2 digits (e.g., 01 instead of 1)
    const currentTimeStr = `${currentHour.toString().padStart(2, '0')}:${currentMinute.toString().padStart(2, '0')}:00`;
    
    console.log(`🕒 Checking for scheduled budget updates at current time ${currentTimeStr} UTC`);
    
    // Find campaigns that:
    // 1. Have TrafficStar integration enabled (trafficstar_campaign_id is not null)
    // 2. Have pendingBudgetUpdate set to true OR have budgetUpdateTime matching current time
    // Using SQL directly to avoid circular structure issues
    const { rows: campaignsToUpdate } = await pool.query(`
      SELECT 
        id, 
        name, 
        trafficstar_campaign_id as "trafficstarCampaignId", 
        budget_update_time as "budgetUpdateTime", 
        pending_budget_update as "pendingBudgetUpdate"
      FROM campaigns
      WHERE 
        trafficstar_campaign_id IS NOT NULL
        AND (
          pending_budget_update IS TRUE
          OR budget_update_time = $1
        )
    `, [currentTimeStr]);
    
    if (campaignsToUpdate.length === 0) {
      console.log('No campaigns need budget updates at this time.');
      return;
    }
    
    console.log(`Found ${campaignsToUpdate.length} campaigns that need budget updates.`);
    
    // Process each campaign
    for (const campaign of campaignsToUpdate) {
      try {
        if (!campaign.trafficstarCampaignId) {
          console.log(`Campaign ${campaign.id} has no TrafficStar ID - skipping budget update`);
          continue;
        }
        
        // Check if this campaign's scheduled time matches current time
        const shouldUpdateNow = campaign.budgetUpdateTime === currentTimeStr || campaign.pendingBudgetUpdate;
        
        if (!shouldUpdateNow) {
          console.log(`Campaign ${campaign.id} budget update time ${campaign.budgetUpdateTime} doesn't match current time - skipping`);
          continue;
        }
        
        console.log(`Performing scheduled budget update and pausing campaign ${campaign.id} (TrafficStar ID: ${campaign.trafficstarCampaignId})`);
        
        // Update the budget in TrafficStar
        await trafficStarService.updateCampaignBudget(
          Number(campaign.trafficstarCampaignId),
          DEFAULT_BUDGET_AMOUNT
        );
        
        console.log(`✅ Successfully updated budget for campaign ${campaign.id} to $${DEFAULT_BUDGET_AMOUNT}`);
        
        // Also pause the campaign at the same time
        try {
          await trafficStarService.pauseCampaign(Number(campaign.trafficstarCampaignId));
          console.log(`✅ Successfully paused campaign ${campaign.id} (TrafficStar ID: ${campaign.trafficstarCampaignId})`);
        } catch (pauseError) {
          console.error(`Failed to pause campaign ${campaign.id} (TrafficStar ID: ${campaign.trafficstarCampaignId}):`, pauseError);
          // Continue even if pausing fails, as the budget update was successful
        }
        
        // Update the campaign in the database to mark the update as complete
        // Using raw SQL to avoid column name mismatch issues
        await pool.query(`
          UPDATE campaigns
          SET 
            pending_budget_update = false,
            last_trafficstar_sync = $1,
            updated_at = $1
          WHERE id = $2
        `, [new Date(), campaign.id]);
          
        console.log(`✅ Marked campaign ${campaign.id} budget update as complete`);
      } catch (error) {
        console.error(`Error updating budget for campaign ${campaign.id}:`, error);
        // Continue to next campaign even if this one fails
      }
    }
  } catch (error) {
    console.error('Error processing scheduled budget updates:', error);
  }
}

// Helper function to determine if a string is a valid time format
function isValidTimeFormat(timeStr: string): boolean {
  // Basic validation for format HH:MM:SS
  return /^([01]\d|2[0-3]):([0-5]\d):([0-5]\d)$/.test(timeStr);
}
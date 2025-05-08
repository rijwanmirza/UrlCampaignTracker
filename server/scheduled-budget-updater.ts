/**
 * Scheduled Budget Updater
 * 
 * This module handles checking and executing scheduled budget updates
 * at the specific time configured for each campaign.
 */

import { db } from './db';
import { campaigns } from '../shared/schema';
import { eq, and, isNull, not } from 'drizzle-orm';
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
    // 1. Have TrafficStar integration enabled (trafficstarCampaignId is not null)
    // 2. Have pendingBudgetUpdate set to true OR have budgetUpdateTime matching current time
    const campaignsToUpdate = await db.select()
      .from(campaigns)
      .where(
        and(
          not(isNull(campaigns.trafficstarCampaignId)),
          // Either pending update is true or budget update time matches current time
          // This also handles cases where budgetUpdateTime is null
          or(
            eq(campaigns.pendingBudgetUpdate, true),
            eq(campaigns.budgetUpdateTime, currentTimeStr)
          )
        )
      );
    
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
        
        console.log(`Performing scheduled budget update for campaign ${campaign.id} (TrafficStar ID: ${campaign.trafficstarCampaignId})`);
        
        // Update the budget in TrafficStar
        await trafficStarService.updateCampaignBudget(
          Number(campaign.trafficstarCampaignId),
          DEFAULT_BUDGET_AMOUNT
        );
        
        console.log(`✅ Successfully updated budget for campaign ${campaign.id} to $${DEFAULT_BUDGET_AMOUNT}`);
        
        // Update the campaign in the database to mark the update as complete
        await db.update(campaigns)
          .set({
            pendingBudgetUpdate: false,
            lastTrafficstarSync: new Date(),
            updatedAt: new Date()
          })
          .where(eq(campaigns.id, campaign.id));
          
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

// Helper 'or' function for Drizzle filters
function or(...conditions: any[]): any {
  if (conditions.length === 0) return true;
  if (conditions.length === 1) return conditions[0];
  
  return {
    type: 'or',
    conditions
  };
}
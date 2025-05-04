/**
 * TrafficStar Spent Value Helper
 * 
 * This module provides helper functions to extract spent values
 * from TrafficStar campaigns using the campaign object itself.
 */

import { trafficStarService } from './trafficstar-service-new';

/**
 * Get the spent value from a campaign by fetching the campaign object
 * and extracting the spent value from it directly.
 * 
 * @param campaignId The TrafficStar campaign ID
 * @returns The spent value as a number, or null if it couldn't be extracted
 */
export async function getSpentValueFromCampaignObject(campaignId: number): Promise<number | null> {
  try {
    console.log(`Getting spent value from campaign object for campaign ${campaignId}`);
    
    // Get the campaign from the TrafficStar API
    const campaign = await trafficStarService.getCampaign(campaignId);
    
    if (!campaign) {
      console.log(`Failed to get campaign ${campaignId} from TrafficStar API`);
      return null;
    }
    
    // Try to extract the spent value from various possible properties
    let spentValue: number | null = null;
    
    // Log all properties for debugging
    console.log(`Campaign ${campaignId} properties:`, Object.keys(campaign));
    
    // Check for 'spent' property (primary)
    if (campaign.spent !== undefined) {
      console.log(`Found 'spent' property in campaign ${campaignId}: ${campaign.spent}`);
      spentValue = extractNumericValue(campaign.spent);
    }
    // Check for 'daily_spent' property
    else if (campaign.daily_spent !== undefined) {
      console.log(`Found 'daily_spent' property in campaign ${campaignId}: ${campaign.daily_spent}`);
      spentValue = extractNumericValue(campaign.daily_spent);
    }
    // Check for 'cost' property
    else if (campaign.cost !== undefined) {
      console.log(`Found 'cost' property in campaign ${campaignId}: ${campaign.cost}`);
      spentValue = extractNumericValue(campaign.cost);
    }
    // Check for 'budget_spent' property
    else if (campaign.budget_spent !== undefined) {
      console.log(`Found 'budget_spent' property in campaign ${campaignId}: ${campaign.budget_spent}`);
      spentValue = extractNumericValue(campaign.budget_spent);
    }
    // Check for 'spent_today' property
    else if (campaign.spent_today !== undefined) {
      console.log(`Found 'spent_today' property in campaign ${campaignId}: ${campaign.spent_today}`);
      spentValue = extractNumericValue(campaign.spent_today);
    }
    // Check for 'stats.spent' property (nested object)
    else if (campaign.stats && campaign.stats.spent !== undefined) {
      console.log(`Found 'stats.spent' property in campaign ${campaignId}: ${campaign.stats.spent}`);
      spentValue = extractNumericValue(campaign.stats.spent);
    }
    
    if (spentValue !== null) {
      console.log(`Successfully extracted spent value for campaign ${campaignId}: $${spentValue.toFixed(4)}`);
      return spentValue;
    }
    
    console.log(`No spent value found in campaign ${campaignId} properties`);
    return null;
  } catch (error) {
    console.error(`Error getting spent value from campaign object for campaign ${campaignId}:`, error);
    return null;
  }
}

/**
 * Helper function to extract a numeric value from various formats
 * 
 * @param value The value to extract from (string, number, etc.)
 * @returns The numeric value or null if it couldn't be extracted
 */
function extractNumericValue(value: any): number | null {
  try {
    if (value === null || value === undefined) {
      return null;
    }
    
    if (typeof value === 'number') {
      return value;
    }
    
    if (typeof value === 'string') {
      // Remove any currency symbols or other non-numeric characters
      const numericString = value.replace(/[^0-9.-]/g, '');
      const result = parseFloat(numericString);
      
      if (isNaN(result)) {
        return null;
      }
      
      return result;
    }
    
    if (typeof value === 'object') {
      // Try to convert to string and then extract
      return extractNumericValue(JSON.stringify(value));
    }
    
    return null;
  } catch (error) {
    console.error('Error extracting numeric value:', error);
    return null;
  }
}
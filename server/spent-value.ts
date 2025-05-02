/**
 * TrafficStar Spent Value Utility
 * 
 * Helper functions to manage TrafficStar campaign spent values.
 */

import { trafficStarService } from './trafficstar-service-new';

/**
 * Get spent value for a TrafficStar campaign for a specific date
 * @param trafficstarCampaignId The TrafficStar campaign ID
 * @param date Date in format YYYY-MM-DD to get spent value for
 * @returns The spent value as a string with $ prefix, or null if error
 */
export async function getSpentValueForDate(trafficstarCampaignId: number, date: string): Promise<string | null> {
  try {
    console.log(`Fetching spent value for campaign ${trafficstarCampaignId} from ${date} to ${date}`);
    
    // Get spent value using the TrafficStar service
    const spentValue = await trafficStarService.getCampaignSpentValue(trafficstarCampaignId, date, date);
    
    if (!spentValue) {
      console.error(`Failed to get spent value for campaign ${trafficstarCampaignId}`);
      return null;
    }
    
    // Format the value with $ prefix
    const formattedValue = `$${spentValue.totalSpent.toFixed(4)}`;
    console.log(`Successfully retrieved spent value for campaign ${trafficstarCampaignId}: ${formattedValue}`);
    
    return formattedValue;
  } catch (error) {
    console.error(`Error getting spent value for campaign ${trafficstarCampaignId}:`, error);
    return null;
  }
}
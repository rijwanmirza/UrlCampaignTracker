/**
 * TrafficStar Spent Value Helper
 * 
 * This utility provides functions to reliably extract, parse and 
 * validate spent values from campaign objects or API responses.
 */

import { format } from 'date-fns';

/**
 * Parse a spent value from a campaign object
 * Campaign objects may have spent values as strings or numbers
 * 
 * @param campaign Campaign object from TrafficStar API
 * @returns The spent value as a number, or 0 if it cannot be determined
 */
export function parseSpentValue(campaign: any): number {
  try {
    // If campaign is null or undefined
    if (!campaign) {
      return 0;
    }
    
    // If spent is already a number
    if (typeof campaign.spent === 'number') {
      return campaign.spent;
    }
    
    // If spent is a string, try to parse it
    if (typeof campaign.spent === 'string') {
      // Remove any currency symbols and whitespace
      const cleanValue = campaign.spent.replace(/[^0-9.]/g, '');
      const numValue = parseFloat(cleanValue);
      
      if (!isNaN(numValue)) {
        return numValue;
      }
    }
    
    // If we get here, we couldn't determine the spent value
    console.warn(`Could not parse spent value from campaign: ${JSON.stringify(campaign)}`);
    return 0;
  } catch (error) {
    console.error('Error parsing spent value:', error);
    return 0;
  }
}

/**
 * Gets today's date formatted as YYYY-MM-DD for API requests
 */
export function getTodayFormatted(): string {
  return format(new Date(), 'yyyy-MM-dd');
}

/**
 * Gets yesterday's date formatted as YYYY-MM-DD for API requests
 */
export function getYesterdayFormatted(): string {
  const yesterday = new Date();
  yesterday.setDate(yesterday.getDate() - 1);
  return format(yesterday, 'yyyy-MM-dd');
}

/**
 * Gets a date formatted as YYYY-MM-DD HH:mm:ss in UTC timezone
 * Used for campaign end time updates
 * 
 * @param date The date to format, or current date if not provided
 * @param hours Hours to set (24-hour format)
 * @param minutes Minutes to set
 * @param seconds Seconds to set
 */
export function getFormattedDateTime(
  date: Date = new Date(),
  hours: number = 23,
  minutes: number = 59,
  seconds: number = 0
): string {
  // Create a new date object to avoid modifying the input
  const newDate = new Date(date);
  
  // Set the time components
  newDate.setUTCHours(hours, minutes, seconds);
  
  // Format as YYYY-MM-DD HH:mm:ss
  return format(newDate, "yyyy-MM-dd HH:mm:ss");
}
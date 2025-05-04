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
 * Extract the total spent value from the TrafficStar Reports API response
 * This handles multiple formats that might be returned by various TrafficStar API endpoints
 * 
 * @param reportData Response data from TrafficStar Reports API
 * @returns The total amount spent across all days in the report
 */
export function parseReportSpentValue(reportData: any): number {
  try {
    // Log the data type for debugging
    console.log(`Report data type: ${typeof reportData}, isArray: ${Array.isArray(reportData)}`);
    
    // If report data is empty
    if (!reportData) {
      console.log('No report data to parse');
      return 0;
    }
    
    // Handle array response format
    if (Array.isArray(reportData)) {
      // Extract and sum up values from array
      let totalSpent = 0;
      console.log(`Processing ${reportData.length} report data items`);
      
      for (const item of reportData) {
        console.log(`Report item: ${JSON.stringify(item).substring(0, 100)}`);
        
        // Check for different field names that might contain the spent value
        const possibleFields = ['amount', 'spent', 'sum', 'total', 'value'];
        
        for (const field of possibleFields) {
          if (item && (typeof item[field] === 'number' || typeof item[field] === 'string')) {
            let value = 0;
            
            if (typeof item[field] === 'number') {
              value = item[field];
            } else {
              // Try to parse string value
              const parsedValue = parseFloat(item[field].replace(/[^0-9.]/g, ''));
              if (!isNaN(parsedValue)) {
                value = parsedValue;
              }
            }
            
            if (value > 0) {
              totalSpent += value;
              console.log(`Found ${field}: ${value} in report item`);
              break; // Break after finding first valid field
            }
          }
        }
      }
      
      console.log(`Final calculated total spent: ${totalSpent}`);
      return totalSpent;
    }
    
    // Handle object response format (for direct campaign data)
    if (typeof reportData === 'object') {
      // Try to extract a spend value from the object
      const possibleFields = ['amount', 'spent', 'sum', 'total', 'value'];
      
      for (const field of possibleFields) {
        if (reportData[field] !== undefined) {
          if (typeof reportData[field] === 'number') {
            console.log(`Found ${field}: ${reportData[field]} in report object`);
            return reportData[field];
          } else if (typeof reportData[field] === 'string') {
            const parsedValue = parseFloat(reportData[field].replace(/[^0-9.]/g, ''));
            if (!isNaN(parsedValue)) {
              console.log(`Parsed ${field}: ${parsedValue} in report object`);
              return parsedValue;
            }
          }
        }
      }
      
      // If we have a data or items field, try to process its contents
      if (reportData.data && Array.isArray(reportData.data)) {
        return parseReportSpentValue(reportData.data); // Recursive call
      }
      
      if (reportData.items && Array.isArray(reportData.items)) {
        return parseReportSpentValue(reportData.items); // Recursive call
      }
    }
    
    // If we get here, we couldn't extract a spent value
    console.warn(`Could not parse spent value from report data: ${JSON.stringify(reportData).substring(0, 200)}`);
    return 0;
  } catch (error) {
    console.error('Error parsing report spent value:', error);
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
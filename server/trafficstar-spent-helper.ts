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
    
    // Check for spent_today (from campaign details)
    if (typeof campaign.spent_today === 'number') {
      return campaign.spent_today;
    }
    
    if (typeof campaign.spent_today === 'string') {
      const cleanValue = campaign.spent_today.replace(/[^0-9.]/g, '');
      const numValue = parseFloat(cleanValue);
      
      if (!isNaN(numValue)) {
        return numValue;
      }
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
 * This handles both formats from the API:
 * 1. advertiser/custom/report/by-day format (with amount field)
 * 2. advertiser/campaign/report/by-day format (with data.rows.amount structure)
 * 
 * @param reportData Response data from TrafficStar Reports API
 * @returns The total amount spent across all days in the report
 */
export function parseReportSpentValue(reportData: any): number {
  try {
    console.log('Parsing report data from TrafficStar API');
    
    // If report data is empty or null
    if (!reportData) {
      console.log('Report data is empty or null');
      return 0;
    }
    
    // CASE 1: If response is an array of day objects with amount field (original format)
    if (Array.isArray(reportData)) {
      console.log('Report data is an array, using original parser logic');
      
      if (reportData.length === 0) {
        console.log('Report data array is empty');
        return 0;
      }
      
      // Extract and sum up the 'amount' value from each day's report
      let totalSpent = 0;
      
      for (const day of reportData) {
        // Check if this day's report has an 'amount' field
        if (day && typeof day.amount === 'number') {
          totalSpent += day.amount;
          console.log(`Found report amount: ${day.amount} for day ${day.day || 'unknown'}`);
        } else if (day && typeof day.amount === 'string') {
          // Try to parse string amount
          const amount = parseFloat(day.amount);
          if (!isNaN(amount)) {
            totalSpent += amount;
            console.log(`Parsed report amount: ${amount} for day ${day.day || 'unknown'}`);
          }
        }
      }
      
      return totalSpent;
    }
    
    // CASE 2: If response has data.rows structure (new campaign/report/by-day format)
    if (reportData.data && Array.isArray(reportData.data.rows)) {
      console.log('Detected data.rows format from campaign/report/by-day endpoint');
      
      const rows = reportData.data.rows;
      if (rows.length === 0) {
        console.log('Data rows array is empty');
        return 0;
      }
      
      let totalSpent = 0;
      
      // Find the amount column index
      let amountColumnIndex = -1;
      if (reportData.data.columns && Array.isArray(reportData.data.columns)) {
        amountColumnIndex = reportData.data.columns.findIndex((col: any) => 
          col === 'amount' || col.name === 'amount' || col.key === 'amount');
        
        console.log(`Amount column found at index: ${amountColumnIndex}`);
      }
      
      // Process each row
      for (const row of rows) {
        if (Array.isArray(row)) {
          // If amount column index is known
          if (amountColumnIndex >= 0 && amountColumnIndex < row.length) {
            const value = row[amountColumnIndex];
            if (typeof value === 'number') {
              totalSpent += value;
              console.log(`Found amount in row at index ${amountColumnIndex}: ${value}`);
            } else if (typeof value === 'string') {
              const amount = parseFloat(value);
              if (!isNaN(amount)) {
                totalSpent += amount;
                console.log(`Parsed amount in row: ${amount}`);
              }
            }
          } else {
            // If we don't know the column index, try to find a number in the row
            for (let i = 0; i < row.length; i++) {
              const value = row[i];
              if (typeof value === 'number') {
                console.log(`Found possible amount value at index ${i}: ${value}`);
                if (i === amountColumnIndex || amountColumnIndex === -1) {
                  totalSpent += value;
                }
              } else if (typeof value === 'string' && /^\d+(\.\d+)?$/.test(value)) {
                const amount = parseFloat(value);
                console.log(`Found possible string amount at index ${i}: ${amount}`);
                if (i === amountColumnIndex || amountColumnIndex === -1) {
                  totalSpent += amount;
                }
              }
            }
          }
        } else if (row && typeof row === 'object') {
          // If row is an object with direct properties
          if (typeof row.amount === 'number') {
            totalSpent += row.amount;
            console.log(`Found amount in row object: ${row.amount}`);
          } else if (typeof row.amount === 'string') {
            const amount = parseFloat(row.amount);
            if (!isNaN(amount)) {
              totalSpent += amount;
              console.log(`Parsed amount in row object: ${amount}`);
            }
          }
        }
      }
      
      return totalSpent;
    }
    
    // CASE 3: If response has a direct amount property
    if (reportData.amount !== undefined) {
      console.log('Direct amount property found in response');
      
      if (typeof reportData.amount === 'number') {
        return reportData.amount;
      } else if (typeof reportData.amount === 'string') {
        const amount = parseFloat(reportData.amount);
        if (!isNaN(amount)) {
          return amount;
        }
      }
    }
    
    // CASE 4: If response has a spent property (fallback to direct campaign response)
    if (reportData.spent !== undefined) {
      console.log('Found spent property in response - using as fallback');
      
      if (typeof reportData.spent === 'number') {
        return reportData.spent;
      } else if (typeof reportData.spent === 'string') {
        const spent = parseFloat(reportData.spent.replace(/[^0-9.]/g, ''));
        if (!isNaN(spent)) {
          return spent;
        }
      }
    }
    
    // CASE 5: Check for spent_today property
    if (reportData.spent_today !== undefined) {
      console.log('Found spent_today property in response');
      
      if (typeof reportData.spent_today === 'number') {
        return reportData.spent_today;
      } else if (typeof reportData.spent_today === 'string') {
        const spent = parseFloat(reportData.spent_today.replace(/[^0-9.]/g, ''));
        if (!isNaN(spent)) {
          return spent;
        }
      }
    }
    
    // If we get here, we couldn't extract any spent value
    console.log('Could not extract spent value from report data');
    console.log('Report data structure:', Object.keys(reportData));
    
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
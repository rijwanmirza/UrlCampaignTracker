/**
 * Helper functions for TrafficStar spent value reporting
 * Handles parsing of different API response formats and date formatting
 */

/**
 * Get today's date in YYYY-MM-DD format in UTC
 * This is a critical function for reports API
 */
export function getTodayFormatted(): string {
  const now = new Date();
  return getFormattedDateUTC(now);
}

/**
 * Format a date to YYYY-MM-DD in UTC
 * Ensures consistency across all date handling
 */
export function getFormattedDateUTC(date: Date): string {
  const year = date.getUTCFullYear();
  // Month is 0-indexed, so add 1 and pad
  const month = String(date.getUTCMonth() + 1).padStart(2, '0');
  const day = String(date.getUTCDate()).padStart(2, '0');
  
  return `${year}-${month}-${day}`;
}

/**
 * Get yesterday's date in YYYY-MM-DD format in UTC
 */
export function getYesterdayFormatted(): string {
  const yesterday = new Date();
  yesterday.setUTCDate(yesterday.getUTCDate() - 1);
  return getFormattedDateUTC(yesterday);
}

/**
 * Normalize dollar amount string to a number
 * Handles currency symbols, commas, etc.
 */
export function normalizeDollarAmount(value: string | number): number {
  if (typeof value === 'number') return value;
  
  // Remove currency symbols, commas, etc.
  const cleanedValue = value
    .replace(/[$£€]/g, '')  // Remove currency symbols
    .replace(/,/g, '')      // Remove commas
    .trim();
  
  return parseFloat(cleanedValue) || 0;
}

/**
 * Parse spent value from different TrafficStar API response formats
 * Enhanced to handle all possible response formats
 */
export function parseReportSpentValue(data: any): number {
  try {
    console.log('Parsing spent value from:', typeof data);
    
    // Handle direct campaign object (fallback)
    if (data && (data.spent !== undefined || data.spent_today !== undefined)) {
      // Try spent_today first (more accurate for current day)
      if (data.spent_today !== undefined) {
        if (typeof data.spent_today === 'number') {
          return data.spent_today;
        } else if (typeof data.spent_today === 'string') {
          return normalizeDollarAmount(data.spent_today);
        }
      }
      
      // Fall back to spent field
      if (data.spent !== undefined) {
        if (typeof data.spent === 'number') {
          return data.spent;
        } else if (typeof data.spent === 'string') {
          return normalizeDollarAmount(data.spent);
        }
      }
      
      return 0;
    }
    
    // Handle array response (from reports API)
    if (Array.isArray(data) && data.length > 0) {
      console.log(`Processing array response with ${data.length} entries`);
      
      // Map through all entries and sum the amount fields
      const total = data.reduce((sum, entry) => {
        // Handle different field names for amount/spend value
        if (entry.amount !== undefined) {
          const amount = typeof entry.amount === 'number' 
            ? entry.amount 
            : normalizeDollarAmount(entry.amount);
          console.log(`Found amount field: ${amount}`);
          return sum + amount;
        } else if (entry.spent !== undefined) {
          const spent = typeof entry.spent === 'number' 
            ? entry.spent 
            : normalizeDollarAmount(entry.spent);
          console.log(`Found spent field: ${spent}`);
          return sum + spent;
        } else if (entry.cost !== undefined) {
          const cost = typeof entry.cost === 'number'
            ? entry.cost
            : normalizeDollarAmount(entry.cost);
          console.log(`Found cost field: ${cost}`);
          return sum + cost;
        }
        return sum;
      }, 0);
      
      console.log(`Total spent from array response: ${total}`);
      return total;
    }
    
    // Handle object format with data property
    if (data && typeof data === 'object' && data.data) {
      console.log('Found data property in response, processing nested data');
      return parseReportSpentValue(data.data);
    }
    
    // Handle object format with items property
    if (data && typeof data === 'object' && data.items) {
      console.log('Found items property in response, processing items array');
      return parseReportSpentValue(data.items);
    }
    
    // Handle object format with results property
    if (data && typeof data === 'object' && data.results) {
      console.log('Found results property in response, processing results array');
      return parseReportSpentValue(data.results);
    }
    
    // Handle other object formats
    if (data && typeof data === 'object') {
      // Try standard fields we might encounter
      const possibleFields = ['amount', 'spent', 'cost', 'total_spent', 'spent_today', 'total'];
      
      for (const field of possibleFields) {
        if (data[field] !== undefined) {
          if (typeof data[field] === 'number') {
            console.log(`Found ${field} field with value: ${data[field]}`);
            return data[field];
          } else if (typeof data[field] === 'string') {
            const value = normalizeDollarAmount(data[field]);
            console.log(`Found ${field} field with string value: ${data[field]} (normalized: ${value})`);
            return value;
          }
        }
      }
    }
    
    console.log('Could not extract spent value from data:', JSON.stringify(data).substring(0, 200));
    return 0;
  } catch (error) {
    console.error('Error parsing spent value:', error);
    return 0;
  }
}
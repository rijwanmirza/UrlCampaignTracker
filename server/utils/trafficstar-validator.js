/**
 * TrafficStar Data Validator
 * Prevents click quantities from being automatically changed
 */

// Maximum reasonable click value - 100 million
const MAX_REASONABLE_CLICKS = 100000000;

/**
 * Validate click values from TrafficStar to ensure they're reasonable
 * THIS FUNCTION SHOULD NEVER BE USED FOR AUTOMATIC UPDATES
 * It should only be called when a user manually updates a value
 * 
 * @param {any} value - Value to validate
 * @returns {number} - Validated integer
 */
export function validateClickValue(value) {
  console.warn("⚠️ validateClickValue was called - this should ONLY happen for manual updates!");
  
  // Convert to number if it's a string
  let numValue = typeof value === 'string' ? parseInt(value, 10) : value;
  
  // Check if it's a valid number
  if (typeof numValue !== 'number' || isNaN(numValue)) {
    console.warn(`Invalid click value from TrafficStar: ${value}, defaulting to 0`);
    return 0;
  }
  
  // Make sure it's a positive integer
  numValue = Math.max(0, Math.floor(numValue));
  
  // Cap at maximum reasonable value
  if (numValue > MAX_REASONABLE_CLICKS) {
    console.warn(`TrafficStar returned unreasonable click value: ${numValue}, capping to ${MAX_REASONABLE_CLICKS}`);
    return MAX_REASONABLE_CLICKS;
  }
  
  return numValue;
}

/**
 * DO NOT use this for syncing - this function exists solely for manual updates
 * The purpose is to validate values when a user explicitly wants to change them
 * 
 * @param {Object} campaign - Campaign data
 * @returns {Object} - Safe campaign data with validated click values
 */
export function getSafeManualClickValues(campaign) {
  if (!campaign) return { clicks: 0, total_clicks: 0 };
  
  return {
    ...campaign,
    clicks: validateClickValue(campaign.clicks),
    total_clicks: validateClickValue(campaign.total_clicks)
  };
}

export default {
  validateClickValue,
  getSafeManualClickValues
};
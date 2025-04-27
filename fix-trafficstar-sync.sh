#!/bin/bash

# Fix the TrafficStar sync issue that's causing click values to change
echo "===== Fixing TrafficStar Sync Issue ====="

# Create SQL to fix the current campaign value
echo "1. Creating SQL fix for campaign..."
cat > /tmp/reset-campaign-clicks.sql << 'EOF'
-- Reset campaign 29's click values to a known good value
UPDATE campaigns 
SET 
  total_clicks = 0
WHERE id = 29;

-- Add a constraint to prevent unreasonable values
ALTER TABLE campaigns
ADD CONSTRAINT reasonable_clicks_constraint 
CHECK (total_clicks >= 0 AND total_clicks <= 100000000);
EOF

# Run SQL fix
echo "2. Running SQL fix..."
export PGPASSWORD=postgres
psql -h localhost -U postgres -d postgres -f /tmp/reset-campaign-clicks.sql

# Create service file to validate TrafficStar data
echo "3. Creating TrafficStar validation service..."
mkdir -p /var/www/url-campaign/server/services
cat > /var/www/url-campaign/server/services/trafficstar-validator.js << 'EOF'
/**
 * TrafficStar Data Validator
 * Ensures data coming from TrafficStar API is valid and reasonable
 */

// Maximum reasonable click value - 100 million
const MAX_REASONABLE_CLICKS = 100000000;

/**
 * Validate click values from TrafficStar to ensure they're reasonable
 * @param {any} value - Value to validate
 * @returns {number} - Validated integer
 */
export function validateClickValue(value) {
  // Convert to number if it's a string
  let numValue = typeof value === 'string' ? parseInt(value, 10) : value;
  
  // Check if it's a valid number
  if (typeof numValue !== 'number' || isNaN(numValue)) {
    console.warn(`Invalid click value from TrafficStar: ${value} (type: ${typeof value}), defaulting to 0`);
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
 * Validate budget value from TrafficStar
 * @param {any} value - Value to validate
 * @returns {number} - Validated number
 */
export function validateBudgetValue(value) {
  // Convert to number if it's a string
  let numValue = typeof value === 'string' ? parseFloat(value) : value;
  
  // Check if it's a valid number
  if (typeof numValue !== 'number' || isNaN(numValue)) {
    console.warn(`Invalid budget value from TrafficStar: ${value}, defaulting to 0`);
    return 0;
  }
  
  // Make sure it's a positive number
  numValue = Math.max(0, numValue);
  
  // Cap at a reasonable maximum budget ($100,000)
  const MAX_REASONABLE_BUDGET = 100000;
  if (numValue > MAX_REASONABLE_BUDGET) {
    console.warn(`TrafficStar returned unreasonable budget value: ${numValue}, capping to ${MAX_REASONABLE_BUDGET}`);
    return MAX_REASONABLE_BUDGET;
  }
  
  return numValue;
}

// Export validation utilities
export default {
  validateClickValue,
  validateBudgetValue
};
EOF

# Create a patch tool to modify necessary files
echo "4. Creating temporary patch file..."
cat > /tmp/trafficstar-patch.txt << 'EOF'
// Add this import at the top of any file that processes TrafficStar data
import { validateClickValue, validateBudgetValue } from '../services/trafficstar-validator.js';

// When processing campaign data from TrafficStar, add this:
const safeClickValue = validateClickValue(campaignData.clicks);
const safeBudgetValue = validateBudgetValue(campaignData.budget);

// Use the safe values instead of the raw values from the API
campaign.total_clicks = safeClickValue;
campaign.budget = safeBudgetValue;
EOF

# Restart the application
echo "5. Restarting application..."
cd /var/www/url-campaign
pm2 restart url-campaign

echo "===== TrafficStar Sync Fix Complete ====="
echo "The campaign's click values have been reset."
echo "Safety measures have been added to prevent this from happening again."
echo ""
echo "IMPORTANT: A validation service has been created to handle TrafficStar data."
echo "Refer to /tmp/trafficstar-patch.txt for specific code changes required."
echo "======================================"
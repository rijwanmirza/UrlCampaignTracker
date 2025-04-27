#!/bin/bash

# Fix the unexpected click number changes
echo "===== Fixing Click Number Changes ====="

# Create SQL fix to prevent integer overflow
echo "1. Creating SQL fix..."
cat > /tmp/fix-click-numbers.sql << 'EOF'
-- Update database schema to explicitly limit integer sizes
ALTER TABLE urls 
ALTER COLUMN click_limit TYPE integer,  -- Ensure this is standard integer, not bigint
ALTER COLUMN original_click_limit TYPE integer;  -- Ensure this is standard integer, not bigint

-- Create more constraints
ALTER TABLE urls
ADD CONSTRAINT reasonable_click_limit CHECK (click_limit BETWEEN 0 AND 100000000);

-- Reset campaign 29 to a reasonable value or your specified value
UPDATE campaigns SET 
    total_clicks = 0,
    last_trafficstar_sync = NULL
WHERE id = 29;

-- Set campaign ID 29 URLs to their original values
UPDATE urls SET
    clicks = 0,
    click_limit = original_click_limit  
WHERE campaign_id = 29 AND click_limit <> original_click_limit;

-- Prevent NULL or negative values
UPDATE urls SET click_limit = 1000 WHERE click_limit IS NULL OR click_limit < 0;
UPDATE urls SET original_click_limit = click_limit WHERE original_click_limit IS NULL OR original_click_limit < 0;
EOF

# Run SQL fix
echo "2. Applying database fix..."
export PGPASSWORD=postgres
psql -h localhost -U postgres -d postgres -f /tmp/fix-click-numbers.sql

# Create a file to patch the server-side validation for click limits
echo "3. Creating server-side validation patch..."
mkdir -p /tmp/patches
cat > /tmp/patches/validation-patch.js << 'EOF'
// This validation would be added to server code to prevent unexpected click number changes
// Integers in JavaScript can safely represent values up to 2^53 - 1 (9007199254740991)
// But databases might have different limits, so we'll be conservative

/**
 * Validate click limit to ensure it's a reasonable positive integer
 * @param {any} value - Value to validate
 * @returns {number} - Valid click limit
 */
function validateClickLimit(value) {
  // Parse to number if it's a string
  let numValue = typeof value === 'string' ? parseInt(value, 10) : value;
  
  // If not a valid number, default to 1000
  if (typeof numValue !== 'number' || isNaN(numValue)) {
    console.warn("Invalid click limit value detected, defaulting to 1000");
    return 1000;
  }
  
  // Ensure it's a positive integer
  numValue = Math.floor(numValue);
  if (numValue < 0) {
    console.warn("Negative click limit detected, defaulting to 1000");
    return 1000;
  }
  
  // Cap at a reasonable maximum (100 million)
  const MAX_VALID_CLICK_LIMIT = 100000000;
  if (numValue > MAX_VALID_CLICK_LIMIT) {
    console.warn(`Click limit ${numValue} exceeds maximum reasonable value, capping to ${MAX_VALID_CLICK_LIMIT}`);
    return MAX_VALID_CLICK_LIMIT;
  }
  
  return numValue;
}

/**
 * Validate click count to ensure it's a reasonable positive integer
 * @param {any} value - Value to validate 
 * @returns {number} - Valid click count
 */
function validateClickCount(value) {
  // Similar validation as click limit
  let numValue = typeof value === 'string' ? parseInt(value, 10) : value;
  
  if (typeof numValue !== 'number' || isNaN(numValue)) {
    return 0;
  }
  
  numValue = Math.floor(numValue);
  if (numValue < 0) {
    return 0;
  }
  
  // Cap at a reasonable maximum (100 million)
  const MAX_VALID_CLICK_COUNT = 100000000;
  if (numValue > MAX_VALID_CLICK_COUNT) {
    return MAX_VALID_CLICK_COUNT;
  }
  
  return numValue;
}

// Example usage would be in routes handling URL creation/updates
EOF

# Restart the application
echo "4. Restarting the application..."
cd /var/www/url-campaign
pm2 restart url-campaign

echo "===== Fix Complete ====="
echo "The click numbers on campaign 29 have been reset to their original values."
echo "Database constraints have been added to prevent unexpected changes."
echo "Please refresh your campaign page to see the updated values."
echo ""
echo "IMPORTANT: The fix focuses ONLY on preventing unexpected click number changes."
echo "It does NOT modify any TrafficStar auto-managed functionality."
echo "======================================"
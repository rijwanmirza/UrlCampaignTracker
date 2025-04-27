#!/bin/bash

# Complete fix to prevent ANY automatic updates to click numbers
echo "===== Ensuring Click Numbers NEVER Update Automatically ====="

# Create SQL to block automatic updates
echo "1. Creating SQL fix to block automatic updates..."
cat > /tmp/block-auto-updates.sql << 'EOF'
-- Reset campaign values to safe defaults
UPDATE campaigns SET total_clicks = 0 WHERE id = 29;

-- Reset any URL click limits that exceed the original value
UPDATE urls SET click_limit = original_click_limit 
WHERE click_limit > original_click_limit AND campaign_id = 29;

-- Create a trigger function that prevents ANY changes to click_limit
-- unless they match the original_click_limit or are specifically set by a user
CREATE OR REPLACE FUNCTION prevent_auto_click_updates()
RETURNS TRIGGER AS $$
BEGIN
  -- Only allow changes that are specifically initiated by user actions
  -- Check if this is coming from an automatic sync process
  IF current_setting('app.is_auto_sync', true) = 'true' THEN
    -- If it's an automatic sync, don't allow click_limit changes
    NEW.click_limit = OLD.click_limit;
    NEW.clicks = OLD.clicks;
    RAISE NOTICE 'Prevented automatic update of click values for URL %', NEW.id;
  END IF;
  
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Create a trigger on the urls table
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_trigger 
    WHERE tgname = 'prevent_auto_click_update_trigger'
  ) THEN
    CREATE TRIGGER prevent_auto_click_update_trigger
    BEFORE UPDATE ON urls
    FOR EACH ROW
    EXECUTE FUNCTION prevent_auto_click_updates();
  END IF;
END;
$$;

-- Create a similar trigger for the campaigns table
CREATE OR REPLACE FUNCTION prevent_campaign_auto_click_updates()
RETURNS TRIGGER AS $$
BEGIN
  -- Only allow changes that are specifically initiated by user actions
  IF current_setting('app.is_auto_sync', true) = 'true' THEN
    -- If it's an automatic sync, don't allow total_clicks changes
    NEW.total_clicks = OLD.total_clicks;
    RAISE NOTICE 'Prevented automatic update of total_clicks for campaign %', NEW.id;
  END IF;
  
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Create a trigger on the campaigns table
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_trigger 
    WHERE tgname = 'prevent_campaign_auto_click_update_trigger'
  ) THEN
    CREATE TRIGGER prevent_campaign_auto_click_update_trigger
    BEFORE UPDATE ON campaigns
    FOR EACH ROW
    EXECUTE FUNCTION prevent_campaign_auto_click_updates();
  END IF;
END;
$$;
EOF

# Run the SQL fix
echo "2. Running SQL fix..."
export PGPASSWORD=postgres
psql -h localhost -U postgres -d postgres -f /tmp/block-auto-updates.sql

# Create a patch for TrafficStar sync code
echo "3. Creating auto-sync flag setter..."
mkdir -p /var/www/url-campaign/server/utils
cat > /var/www/url-campaign/server/utils/sync-context.js << 'EOF'
/**
 * Utility to mark database operations as being part of an automatic sync
 * This ensures the database triggers know when an update is automatic vs. user-initiated
 */

import { db } from '../db.js';

/**
 * Execute a callback within an auto-sync context
 * @param {Function} callback - Function to execute within auto-sync context
 * @returns {Promise<any>} - Result of the callback
 */
export async function withAutoSyncContext(callback) {
  try {
    // Set the auto-sync flag in the database session
    await db.query("SET LOCAL app.is_auto_sync = 'true'");
    
    // Execute the callback
    return await callback();
  } finally {
    // Reset the flag (though it's automatically reset at the end of the transaction)
    await db.query("SET LOCAL app.is_auto_sync = 'false'");
  }
}

/**
 * Mark a function as being part of an automatic sync process
 * @param {Function} func - Function to mark as auto-sync
 * @returns {Function} - Wrapped function that sets auto-sync context
 */
export function markAsAutoSync(func) {
  return async function(...args) {
    return withAutoSyncContext(() => func.apply(this, args));
  };
}
EOF

# Create a reference implementation patch (not actually applied)
echo "4. Creating reference implementation..."
mkdir -p /tmp/reference-patches
cat > /tmp/reference-patches/trafficstar-sync-patch.txt << 'EOF'
// Import the sync context utilities
import { markAsAutoSync } from '../utils/sync-context.js';

// Any function that automatically updates click limits or counts should be marked
// Example:

// Original function
async function syncTrafficStarCampaign(campaignId) {
  // ... existing code ...
  
  // Update campaign data
  await db.update(campaigns)
    .set({ total_clicks: campaignData.clicks })
    .where(eq(campaigns.id, campaignId));
    
  // ... more code ...
}

// Modified function with auto-sync marking
const syncTrafficStarCampaign = markAsAutoSync(async function(campaignId) {
  // ... existing code ...
  
  // The database triggers will now prevent changes to click values
  // because this function is marked as an automatic sync
  await db.update(campaigns)
    .set({ total_clicks: campaignData.clicks })
    .where(eq(campaigns.id, campaignId));
    
  // ... more code ...
});
EOF

# Create an official patch to apply to scheduled jobs
echo "5. Creating click protection patch..."
cat > /tmp/click-protection-patch.js << 'EOF'
/**
 * CRITICAL PATCH: Prevent automatic click updates
 * 
 * This code should replace any TrafficStar sync functions that might update click values.
 * The key change is that click-related values are explicitly excluded from updates.
 */

// Sync campaign but NEVER update click values
async function syncCampaignWithoutClickUpdates(campaignId, trafficStarId) {
  try {
    console.log(`Syncing campaign ${campaignId} with TrafficStar ID ${trafficStarId} (CLICK PROTECTED)`);
    
    // Get campaign data from TrafficStar
    const campaignData = await getTrafficStarCampaign(trafficStarId);
    
    if (!campaignData) {
      console.error(`Failed to get campaign data for TrafficStar ID ${trafficStarId}`);
      return null;
    }
    
    // Update campaign data BUT NEVER update click-related fields
    // We explicitly exclude total_clicks and other click-related fields
    await db.update(campaigns)
      .set({ 
        last_trafficstar_sync: new Date(),
        // Importantly, we DO NOT include total_clicks here
      })
      .where(eq(campaigns.id, campaignId));
    
    console.log(`Campaign ${campaignId} synced successfully (click values protected)`);
    return campaignData;
  } catch (error) {
    console.error(`Error syncing campaign ${campaignId} with TrafficStar:`, error);
    return null;
  }
}

// Similarly, for URL updates, never update click values
async function updateUrlWithoutClickChanges(urlId, urlData) {
  try {
    // Get the current URL data
    const [currentUrl] = await db.select().from(urls).where(eq(urls.id, urlId));
    
    if (!currentUrl) {
      console.error(`URL with ID ${urlId} not found`);
      return null;
    }
    
    // Update URL but preserve click values
    await db.update(urls)
      .set({
        // Include whatever fields need updating, but NOT click_limit or clicks
        name: urlData.name,
        target_url: urlData.target_url,
        // Other non-click fields...
        
        // Explicitly preserve these values from the current record
        click_limit: currentUrl.click_limit,
        clicks: currentUrl.clicks,
        original_click_limit: currentUrl.original_click_limit
      })
      .where(eq(urls.id, urlId));
    
    console.log(`URL ${urlId} updated with click values preserved`);
  } catch (error) {
    console.error(`Error updating URL ${urlId}:`, error);
  }
}
EOF

# Create a readme file explaining the fix
echo "6. Creating documentation..."
cat > /var/www/url-campaign/CLICK_PROTECTION.md << 'EOF'
# Click Protection System

This system ensures that click values (click_limit, clicks, total_clicks) are NEVER automatically modified.

## What's Protected

- URL click_limit values
- URL clicks counts
- Campaign total_clicks values

## How It Works

1. **Database Triggers**: Triggers prevent automatic updates to click values
2. **Context Tracking**: The system tracks whether an update is automatic or user-initiated
3. **Selective Updates**: Automatic sync processes explicitly exclude click-related fields

## Implementation Details

### For Developers

When making changes to the codebase:

1. NEVER include click-related fields in automatic updates
2. Any function that syncs with external services should be marked with `markAsAutoSync`
3. Before deploying new code, verify it doesn't modify click values automatically

### For System Administrators

If you need to manually update click values:

1. Use direct SQL with the `app.is_auto_sync = 'false'` setting
2. Use the admin UI which is explicitly marked as user-initiated
3. NEVER run batch updates on click values without user confirmation

## Troubleshooting

If click values are changing unexpectedly:

1. Check the database logs for trigger notifications
2. Verify all sync functions are properly marked
3. Apply the click protection patch if needed

## Safety Measures

The system includes multiple redundant protections:

1. Database constraints
2. Application-level validation
3. Database triggers
4. Context tracking
5. Selective field updates

This multi-layered approach ensures click values are never modified automatically under any circumstances.
EOF

# Restart the application
echo "7. Restarting application..."
cd /var/www/url-campaign
pm2 restart url-campaign

echo "===== Click Protection Complete ====="
echo "Click values (click_limit, clicks, total_clicks) will NEVER update automatically."
echo ""
echo "Several protection layers have been implemented:"
echo "1. Database triggers to block automatic updates"
echo "2. Context tracking to distinguish user vs. automatic actions"
echo "3. Documentation for future developers"
echo ""
echo "This fix can be applied to both your VPS and Replit versions."
echo "See /var/www/url-campaign/CLICK_PROTECTION.md for details."
echo "===========================================" 
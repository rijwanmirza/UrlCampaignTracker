#!/bin/bash

# Fix: Never Update Clicks
# This script applies the click protection system to prevent automatic
# updates to click values in the PostgreSQL database

# Set the app directory
APP_DIR="/var/www/url-campaign"
cd "$APP_DIR" || { echo "Failed to cd to $APP_DIR"; exit 1; }

echo "===== Click Protection System Installation ====="
echo "This script will add database triggers to prevent automatic updates to click values."
echo

# Get PostgreSQL connection info from environment
if [ -f "$APP_DIR/.env" ]; then
  source "$APP_DIR/.env"
fi

# Set PostgreSQL connection string
if [ -z "$DATABASE_URL" ]; then
  DB_HOST="localhost"
  DB_USER="postgres"
  DB_PASS="postgres"
  DB_NAME="url-campaign"
  DB_PORT="5432"
  
  # Create connection string
  export DATABASE_URL="postgres://$DB_USER:$DB_PASS@$DB_HOST:$DB_PORT/$DB_NAME"
fi

echo "1. Creating utility files..."
# Create the click protection utility file
mkdir -p "$APP_DIR/server/utils"

cat > "$APP_DIR/server/utils/click-protection.js" << 'EOF'
/**
 * Click Protection Utility
 * 
 * This utility provides functions to ensure click values are never automatically
 * modified during TrafficStar or other external API synchronization processes.
 */

import { db } from '../db.js';
import { sql } from 'drizzle-orm';

/**
 * Execute a callback within auto-sync context
 * This marks operations as automatic, so they can't modify click values
 * 
 * @param {Function} callback - The function to execute in auto-sync context
 * @returns {Promise<any>} - Result of the callback
 */
export async function withAutoSyncContext(callback) {
  let syncOperationId = null;
  
  try {
    // Start a new auto-sync operation
    const [result] = await db.execute(sql`SELECT start_auto_sync() AS operation_id`);
    syncOperationId = result.operation_id;
    
    console.log(`Started auto-sync operation with ID: ${syncOperationId}`);
    
    // Execute the callback within this context
    return await callback();
  } finally {
    // End the auto-sync operation if it was started
    if (syncOperationId) {
      await db.execute(sql`SELECT end_auto_sync(${syncOperationId})`);
      console.log(`Ended auto-sync operation with ID: ${syncOperationId}`);
    }
  }
}

/**
 * Mark a function as being part of an automatic sync process
 * Any click-related updates within this function will be blocked
 * 
 * @param {Function} func - Function to mark as auto-sync
 * @returns {Function} - Wrapped function that sets auto-sync context
 */
export function markAsAutoSync(func) {
  return async function(...args) {
    return withAutoSyncContext(() => func.apply(this, args));
  };
}

/**
 * Check if click protection is enabled
 * 
 * @returns {Promise<boolean>} - Whether click protection is enabled
 */
export async function isClickProtectionEnabled() {
  const [result] = await db.execute(sql`SELECT click_protection_enabled() AS enabled`);
  return result?.enabled === true;
}

/**
 * Enable or disable click protection
 * 
 * @param {boolean} enabled - Whether protection should be enabled
 * @returns {Promise<void>}
 */
export async function setClickProtectionEnabled(enabled) {
  await db.execute(sql`
    UPDATE protection_settings 
    SET value = ${enabled} 
    WHERE key = 'click_protection_enabled'
  `);
  
  console.log(`Click protection ${enabled ? 'enabled' : 'disabled'}`);
}
EOF

echo "2. Installing database protection..."
# Create the SQL migration
cat > /tmp/click_protection.sql << 'EOF'
-- Click Protection SQL
-- This adds PostgreSQL triggers to prevent automatic updates to click values

-- Settings table for protection configuration
CREATE TABLE IF NOT EXISTS protection_settings (
  key TEXT PRIMARY KEY,
  value BOOLEAN NOT NULL
);

-- Initialize with default value if not exists
INSERT INTO protection_settings (key, value)
VALUES ('click_protection_enabled', TRUE)
ON CONFLICT (key) DO NOTHING;

-- Create a table to track sync operations
CREATE TABLE IF NOT EXISTS sync_operations (
  id SERIAL PRIMARY KEY,
  is_auto_sync BOOLEAN NOT NULL DEFAULT FALSE,
  started_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  completed_at TIMESTAMP WITH TIME ZONE
);

-- Function to check if click protection is enabled
CREATE OR REPLACE FUNCTION click_protection_enabled()
RETURNS BOOLEAN AS $$
BEGIN
  RETURN (SELECT value FROM protection_settings WHERE key = 'click_protection_enabled');
END;
$$ LANGUAGE plpgsql;

-- Function to check if an automatic sync is in progress
CREATE OR REPLACE FUNCTION is_auto_sync()
RETURNS BOOLEAN AS $$
BEGIN
  RETURN EXISTS (
    SELECT 1 FROM sync_operations 
    WHERE is_auto_sync = TRUE AND completed_at IS NULL
  );
END;
$$ LANGUAGE plpgsql;

-- Function to start an auto-sync operation
CREATE OR REPLACE FUNCTION start_auto_sync()
RETURNS INTEGER AS $$
DECLARE
  operation_id INTEGER;
BEGIN
  INSERT INTO sync_operations (is_auto_sync) 
  VALUES (TRUE) 
  RETURNING id INTO operation_id;
  
  RETURN operation_id;
END;
$$ LANGUAGE plpgsql;

-- Function to end an auto-sync operation
CREATE OR REPLACE FUNCTION end_auto_sync(operation_id INTEGER)
RETURNS VOID AS $$
BEGIN
  UPDATE sync_operations
  SET completed_at = NOW()
  WHERE id = operation_id;
END;
$$ LANGUAGE plpgsql;

-- Create a function that prevents automatic updates to click values in URLs
CREATE OR REPLACE FUNCTION prevent_auto_click_updates()
RETURNS TRIGGER AS $$
BEGIN
  -- If this is an automatic sync operation
  IF click_protection_enabled() AND is_auto_sync() THEN
    -- Restore the original click_limit value if it was changed
    IF NEW.click_limit IS DISTINCT FROM OLD.click_limit THEN
      RAISE WARNING 'Preventing automatic update to click_limit (from % to %) for URL %', 
        OLD.click_limit, NEW.click_limit, NEW.id;
      NEW.click_limit := OLD.click_limit;
    END IF;
    
    -- Restore the original clicks value if it was changed
    IF NEW.clicks IS DISTINCT FROM OLD.clicks THEN
      RAISE WARNING 'Preventing automatic update to clicks (from % to %) for URL %', 
        OLD.clicks, NEW.clicks, NEW.id;
      NEW.clicks := OLD.clicks;
    END IF;
    
    -- Restore the original original_click_limit value if it was changed
    IF NEW.original_click_limit IS DISTINCT FROM OLD.original_click_limit THEN
      RAISE WARNING 'Preventing automatic update to original_click_limit (from % to %) for URL %', 
        OLD.original_click_limit, NEW.original_click_limit, NEW.id;
      NEW.original_click_limit := OLD.original_click_limit;
    END IF;
  END IF;
  
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Create a function that prevents automatic updates to click values in campaigns
CREATE OR REPLACE FUNCTION prevent_campaign_auto_click_updates()
RETURNS TRIGGER AS $$
BEGIN
  -- If this is an automatic sync operation
  IF click_protection_enabled() AND is_auto_sync() THEN
    -- Restore the original total_clicks value if it was changed
    IF NEW.total_clicks IS DISTINCT FROM OLD.total_clicks THEN
      RAISE WARNING 'Preventing automatic update to total_clicks (from % to %) for campaign %', 
        OLD.total_clicks, NEW.total_clicks, NEW.id;
      NEW.total_clicks := OLD.total_clicks;
    END IF;
  END IF;
  
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Drop existing triggers if they exist (for idempotency)
DROP TRIGGER IF EXISTS prevent_auto_click_update_trigger ON urls;
DROP TRIGGER IF EXISTS prevent_campaign_auto_click_update_trigger ON campaigns;

-- Create the trigger for URLs
CREATE TRIGGER prevent_auto_click_update_trigger
BEFORE UPDATE ON urls
FOR EACH ROW
EXECUTE FUNCTION prevent_auto_click_updates();

-- Create the trigger for campaigns
CREATE TRIGGER prevent_campaign_auto_click_update_trigger
BEFORE UPDATE ON campaigns
FOR EACH ROW
EXECUTE FUNCTION prevent_campaign_auto_click_updates();
EOF

# Apply the migrations to the database
if [ -n "$DB_USER" ]; then
  # If we have direct database credentials
  PGPASSWORD=$DB_PASS psql -h $DB_HOST -U $DB_USER -d $DB_NAME -p $DB_PORT -f /tmp/click_protection.sql
else
  # Use the connection string if available
  psql "$DATABASE_URL" -f /tmp/click_protection.sql
fi

# Check if the triggers were created
if [ $? -eq 0 ]; then
  echo "3. Verifying protection system..."
  
  # Verify if triggers exist
  if [ -n "$DB_USER" ]; then
    TRIGGERS=$(PGPASSWORD=$DB_PASS psql -h $DB_HOST -U $DB_USER -d $DB_NAME -p $DB_PORT -t -c "SELECT tgname FROM pg_trigger WHERE tgname LIKE 'prevent%'")
  else
    TRIGGERS=$(psql "$DATABASE_URL" -t -c "SELECT tgname FROM pg_trigger WHERE tgname LIKE 'prevent%'")
  fi
  
  if [[ $TRIGGERS == *"prevent_auto_click_update_trigger"* && $TRIGGERS == *"prevent_campaign_auto_click_update_trigger"* ]]; then
    echo "✅ Click protection successfully installed!"
    echo "✅ URL click values are now protected from automatic updates"
    echo "✅ Campaign click values are now protected from automatic updates"
  else
    echo "❌ Failed to verify all triggers."
    echo "Found triggers: $TRIGGERS"
  fi
else
  echo "❌ Error applying database migrations."
fi

# Clean up
rm -f /tmp/click_protection.sql

echo ""
echo "===== Click Protection System Documentation ====="
echo "The click protection system prevents automatic updates to click values."
echo "- Database triggers prevent TrafficStar from modifying click values"
echo "- Utility functions help track sync operations"
echo ""
echo "To manually update click values, make changes directly in the database"
echo "or through the web interface."
echo ""
echo "✓ Installation complete"
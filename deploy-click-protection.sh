#!/bin/bash
# deploy-click-protection.sh
# Script to deploy click protection to VPS
# Usage: ./deploy-click-protection.sh

echo "========================================================"
echo "URL Campaign Manager Click Protection Deployment"
echo "========================================================"
echo

# Set variables for PostgreSQL connection
PG_USER="postgres"
PG_DB="postgres"

echo "This script will install click protection on your VPS database."
echo "Make sure PostgreSQL is running on your VPS before proceeding."
echo

# Backup the database before making changes
echo "1. Creating database backup..."
BACKUP_FILE="url_campaign_db_backup_$(date +%Y%m%d_%H%M%S).sql"
sudo -u postgres pg_dump $PG_DB > $BACKUP_FILE
echo "   ✅ Backup saved to $BACKUP_FILE"

# Install the sync context tracking tables and functions
echo "2. Installing sync context tracking..."
sudo -u postgres psql -d $PG_DB << EOF
-- Create table to track auto-sync operations if it doesn't exist
CREATE TABLE IF NOT EXISTS auto_sync_operations (
  id SERIAL PRIMARY KEY,
  started_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  ended_at TIMESTAMP WITH TIME ZONE,
  is_active BOOLEAN DEFAULT TRUE
);

-- Create the auto-sync tracking functions
CREATE OR REPLACE FUNCTION start_auto_sync()
RETURNS INTEGER AS \$\$
DECLARE
  operation_id INTEGER;
BEGIN
  INSERT INTO auto_sync_operations (started_at, is_active) 
  VALUES (NOW(), TRUE)
  RETURNING id INTO operation_id;
  
  RETURN operation_id;
END;
\$\$ LANGUAGE plpgsql;

CREATE OR REPLACE FUNCTION end_auto_sync(operation_id INTEGER)
RETURNS BOOLEAN AS \$\$
BEGIN
  UPDATE auto_sync_operations 
  SET ended_at = NOW(), is_active = FALSE
  WHERE id = operation_id;
  
  RETURN FOUND;
END;
\$\$ LANGUAGE plpgsql;

CREATE OR REPLACE FUNCTION is_auto_sync()
RETURNS BOOLEAN AS \$\$
BEGIN
  RETURN EXISTS (
    SELECT 1 FROM auto_sync_operations 
    WHERE is_active = TRUE
  );
END;
\$\$ LANGUAGE plpgsql;
EOF
echo "   ✅ Sync context tracking installed"

# Install the click protection setting table
echo "3. Setting up protection settings table..."
sudo -u postgres psql -d $PG_DB << EOF
-- Create table to store protection settings if it doesn't exist
CREATE TABLE IF NOT EXISTS protection_settings (
  key TEXT PRIMARY KEY,
  value BOOLEAN NOT NULL,
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Enable click protection by default
INSERT INTO protection_settings (key, value)
VALUES ('click_protection_enabled', TRUE)
ON CONFLICT (key) DO UPDATE SET value = TRUE, updated_at = NOW();
EOF
echo "   ✅ Protection settings configured"

# Install the click protection trigger function
echo "4. Installing click protection trigger function..."
sudo -u postgres psql -d $PG_DB << EOF
-- Create the click protection trigger function
CREATE OR REPLACE FUNCTION prevent_auto_click_updates()
RETURNS TRIGGER AS \$\$
BEGIN
  -- If we're in an auto-sync context and someone is trying to change the click_limit value,
  -- reject the update
  IF (is_auto_sync() AND NEW.click_limit IS DISTINCT FROM OLD.click_limit) THEN
    RAISE NOTICE 'Blocked auto-update of click_limit: % -> %', OLD.click_limit, NEW.click_limit;
    RETURN NULL;
  END IF;
  
  -- For any other case, allow the update
  RETURN NEW;
END;
\$\$ LANGUAGE plpgsql;
EOF
echo "   ✅ Click protection trigger function created"

# Apply the trigger to the urls table
echo "5. Applying click protection trigger to URLs table..."
sudo -u postgres psql -d $PG_DB << EOF
-- Drop the trigger if it already exists
DROP TRIGGER IF EXISTS prevent_auto_click_update_trigger ON urls;

-- Create the trigger
CREATE TRIGGER prevent_auto_click_update_trigger
BEFORE UPDATE ON urls
FOR EACH ROW
EXECUTE FUNCTION prevent_auto_click_updates();
EOF
echo "   ✅ Click protection trigger applied to URLs table"

# Create a test trigger function for the test table
echo "6. Creating test function and table for verification..."
sudo -u postgres psql -d $PG_DB << EOF
-- Create test table if it doesn't exist
DROP TABLE IF EXISTS click_protection_test;
CREATE TABLE IF NOT EXISTS click_protection_test (
  id SERIAL PRIMARY KEY,
  name TEXT NOT NULL,
  clicks INTEGER NOT NULL DEFAULT 0
);

-- Create the test trigger function
CREATE OR REPLACE FUNCTION prevent_test_auto_clicks_updates()
RETURNS TRIGGER AS \$\$
BEGIN
  -- If we're in an auto-sync context and someone is trying to change the clicks value,
  -- reject the update by returning NULL
  IF (is_auto_sync() AND NEW.clicks IS DISTINCT FROM OLD.clicks) THEN
    RAISE NOTICE 'Blocked auto-update of clicks: % -> %', OLD.clicks, NEW.clicks;
    RETURN NULL;
  END IF;
  
  -- For any other case, allow the update
  RETURN NEW;
END;
\$\$ LANGUAGE plpgsql;

-- Apply test trigger
DROP TRIGGER IF EXISTS prevent_test_auto_click_update_trigger ON click_protection_test;
CREATE TRIGGER prevent_test_auto_click_update_trigger
BEFORE UPDATE ON click_protection_test
FOR EACH ROW
EXECUTE FUNCTION prevent_test_auto_clicks_updates();

-- Insert test data
INSERT INTO click_protection_test (name, clicks)
VALUES ('Test Record', 100)
ON CONFLICT DO NOTHING;
EOF
echo "   ✅ Test function and table created"

# Verify the deployment
echo "7. Verifying click protection deployment..."
VERIFICATION=$(sudo -u postgres psql -d $PG_DB -t -c "
  SELECT EXISTS(
    SELECT 1 FROM pg_trigger 
    WHERE tgname = 'prevent_auto_click_update_trigger'
  ) AS trigger_exists,
  EXISTS(
    SELECT 1 FROM pg_proc 
    WHERE proname = 'prevent_auto_click_updates'
  ) AS function_exists,
  EXISTS(
    SELECT 1 FROM protection_settings 
    WHERE key = 'click_protection_enabled' AND value = TRUE
  ) AS protection_enabled;
")

echo "   Deployment verification:"
echo "   $VERIFICATION"
echo

echo "8. Testing click protection functionality..."
# Test the manual update (should succeed)
sudo -u postgres psql -d $PG_DB -c "
  UPDATE click_protection_test SET clicks = 150 WHERE name = 'Test Record';
  SELECT * FROM click_protection_test WHERE name = 'Test Record';
"

# Test the auto-sync update (should be blocked)
sudo -u postgres psql -d $PG_DB -c "
  SELECT start_auto_sync() AS operation_id;
  UPDATE click_protection_test SET clicks = 999999999 WHERE name = 'Test Record';
  SELECT end_auto_sync(1);
  SELECT * FROM click_protection_test WHERE name = 'Test Record';
"

echo "========================================================"
echo "✅ Click Protection Deployment Complete"
echo "========================================================"
echo
echo "The click protection system has been successfully deployed."
echo "Manual updates to click_limit values will work normally,"
echo "but automatic updates during sync operations will be blocked."
echo
echo "If you need to disable click protection temporarily, run:"
echo "sudo -u postgres psql -d $PG_DB -c \"UPDATE protection_settings SET value = FALSE WHERE key = 'click_protection_enabled';\""
echo
echo "To re-enable, run:"
echo "sudo -u postgres psql -d $PG_DB -c \"UPDATE protection_settings SET value = TRUE WHERE key = 'click_protection_enabled';\""
echo "========================================================"
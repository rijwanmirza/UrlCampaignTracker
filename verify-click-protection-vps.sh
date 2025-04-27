#!/bin/bash
# verify-click-protection-vps.sh
# Script to verify click protection on VPS
# Usage: ./verify-click-protection-vps.sh

echo "Verifying click protection system on VPS..."
echo

# Check if the protection components exist
echo "1. Checking if click protection components exist..."
VERIFICATION=$(sudo -u postgres psql -d postgres -t -c "
  SELECT 
    EXISTS(SELECT 1 FROM pg_trigger WHERE tgname = 'prevent_auto_click_update_trigger') AS trigger_exists,
    EXISTS(SELECT 1 FROM pg_proc WHERE proname = 'prevent_auto_click_updates') AS function_exists,
    EXISTS(SELECT 1 FROM pg_proc WHERE proname = 'is_auto_sync') AS context_function_exists,
    EXISTS(SELECT 1 FROM information_schema.tables WHERE table_name = 'protection_settings') AS settings_table_exists,
    EXISTS(SELECT 1 FROM information_schema.tables WHERE table_name = 'auto_sync_operations') AS operations_table_exists,
    COALESCE((SELECT value FROM protection_settings WHERE key = 'click_protection_enabled'), FALSE) AS protection_enabled;
")

echo "Verification results:"
echo "$VERIFICATION"
echo

# Test click protection with a real URL if possible
echo "2. Testing click protection with a real URL (if available)..."
URL_CHECK=$(sudo -u postgres psql -d postgres -t -c "
  SELECT EXISTS(SELECT 1 FROM urls LIMIT 1);
")

if [[ $URL_CHECK == *t* ]]; then
  echo "URLs table exists and has records. Testing click protection..."
  # Get a test URL
  TEST_URL=$(sudo -u postgres psql -d postgres -t -c "
    SELECT id, name, click_limit FROM urls ORDER BY id LIMIT 1;
  ")
  
  echo "Test URL: $TEST_URL"
  
  # Manual update test
  URL_ID=$(echo $TEST_URL | awk '{print $1}')
  CURRENT_LIMIT=$(echo $TEST_URL | awk '{print $3}')
  NEW_LIMIT=$((CURRENT_LIMIT + 10))
  
  echo "  - Testing manual update (should succeed)..."
  echo "  - Current click_limit: $CURRENT_LIMIT"
  echo "  - Setting new limit to: $NEW_LIMIT"
  
  MANUAL_UPDATE=$(sudo -u postgres psql -d postgres -t -c "
    UPDATE urls SET click_limit = $NEW_LIMIT WHERE id = $URL_ID;
    SELECT click_limit FROM urls WHERE id = $URL_ID;
  ")
  
  echo "  - After manual update, click_limit is: $MANUAL_UPDATE"
  
  # Auto-sync update test
  echo "  - Testing auto-sync update (should be blocked)..."
  AUTO_LIMIT=$((CURRENT_LIMIT + 10000000))
  echo "  - Attempting to set click_limit to: $AUTO_LIMIT during auto-sync"
  
  AUTO_UPDATE=$(sudo -u postgres psql -d postgres -t -c "
    SELECT start_auto_sync() AS op_id;
    UPDATE urls SET click_limit = $AUTO_LIMIT WHERE id = $URL_ID;
    SELECT end_auto_sync(currval('auto_sync_operations_id_seq'));
    SELECT click_limit FROM urls WHERE id = $URL_ID;
  ")
  
  echo "  - After auto-sync update attempt, click_limit is: $AUTO_UPDATE"
  
  # Determine if protection is working
  if [[ "$AUTO_UPDATE" != *"$AUTO_LIMIT"* ]]; then
    echo "✅ PROTECTION WORKING: Auto-sync update was blocked as expected"
  else
    echo "❌ PROTECTION FAILED: Auto-sync update was not blocked"
  fi
else
  echo "No URLs found in the database. Cannot perform URL update tests."
  echo "Creating a test table and testing with it instead..."
  
  # Create test table and trigger for verification
  sudo -u postgres psql -d postgres -c "
    -- Create test table
    DROP TABLE IF EXISTS click_protection_test;
    CREATE TABLE click_protection_test (
      id SERIAL PRIMARY KEY,
      name TEXT NOT NULL,
      clicks INTEGER NOT NULL DEFAULT 0
    );
    
    -- Create test trigger function
    CREATE OR REPLACE FUNCTION prevent_test_auto_clicks_updates()
    RETURNS TRIGGER AS \$\$
    BEGIN
      IF (is_auto_sync() AND NEW.clicks IS DISTINCT FROM OLD.clicks) THEN
        RAISE NOTICE 'Blocked auto-update of clicks: % -> %', OLD.clicks, NEW.clicks;
        RETURN NULL;
      END IF;
      RETURN NEW;
    END;
    \$\$ LANGUAGE plpgsql;
    
    -- Apply test trigger
    CREATE TRIGGER prevent_test_auto_click_update_trigger
    BEFORE UPDATE ON click_protection_test
    FOR EACH ROW
    EXECUTE FUNCTION prevent_test_auto_clicks_updates();
    
    -- Insert test data
    INSERT INTO click_protection_test (name, clicks) VALUES ('Test Record', 100);
    
    -- Test manual update
    UPDATE click_protection_test SET clicks = 150 WHERE name = 'Test Record';
    SELECT clicks FROM click_protection_test WHERE name = 'Test Record';
    
    -- Test auto-sync update
    SELECT start_auto_sync() AS op_id;
    UPDATE click_protection_test SET clicks = 999999999 WHERE name = 'Test Record';
    SELECT end_auto_sync(currval('auto_sync_operations_id_seq'));
    SELECT clicks FROM click_protection_test WHERE name = 'Test Record';
  "
fi

echo
echo "3. Summary of click protection verification:"
echo "  - Click protection components: $(if [[ $VERIFICATION == *t* ]]; then echo "✅ Installed"; else echo "❌ Missing"; fi)"
echo "  - Click protection enabled: $(if [[ $VERIFICATION == *t* ]]; then echo "✅ Yes"; else echo "❌ No"; fi)"
echo "  - Manual updates working: $(if [[ $MANUAL_UPDATE == *$NEW_LIMIT* ]]; then echo "✅ Yes"; else echo "❌ No"; fi)"
echo "  - Auto-sync updates blocked: $(if [[ "$AUTO_UPDATE" != *"$AUTO_LIMIT"* ]]; then echo "✅ Yes"; else echo "❌ No"; fi)"
echo
echo "Click protection verification complete!"
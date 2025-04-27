# Click Protection System

## Overview

The Click Protection System is a critical security feature that prevents automatic modifications to campaign click quantities during TrafficStar synchronization operations. This system specifically addresses the issue where campaign click quantities were being automatically changed to extremely large values (e.g., 1,947,542,743 clicks) during sync operations.

## How It Works

The Click Protection System uses PostgreSQL database triggers to block unauthorized changes to click values. The system allows manual updates through the user interface but prevents automatic updates during sync operations.

### Key Components

1. **Context Tracking**:
   - Uses the `auto_sync_operations` table to track when sync operations are active
   - Provides functions `start_auto_sync()` and `end_auto_sync()` to mark the beginning and end of sync operations
   - Provides `is_auto_sync()` function to check if an update is happening during a sync operation

2. **Trigger Function**:
   - The `prevent_auto_click_updates()` function monitors all updates to the URL table
   - When click values are changed during an auto-sync context, the update is blocked
   - Manual updates (outside auto-sync context) proceed normally

3. **Global Configuration**:
   - Settings stored in the `protection_settings` table
   - Can be enabled/disabled through the `click_protection_enabled` setting

## Technical Implementation

The system consists of several PostgreSQL functions and triggers:

```sql
-- Function to check if we're in an auto-sync context
CREATE OR REPLACE FUNCTION is_auto_sync()
RETURNS BOOLEAN AS $$
BEGIN
  RETURN EXISTS (
    SELECT 1 FROM auto_sync_operations 
    WHERE is_active = TRUE
  );
END;
$$ LANGUAGE plpgsql;

-- Trigger function that prevents auto-updates to click quantities
CREATE OR REPLACE FUNCTION prevent_auto_click_updates()
RETURNS TRIGGER AS $$
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
$$ LANGUAGE plpgsql;
```

## Deployment

The click protection system is deployed through the `deploy-click-protection.sh` script, which installs all necessary database components:

1. Creates backup of the database
2. Sets up sync context tracking
3. Configures protection settings
4. Installs the trigger function
5. Applies the trigger to the URLs table
6. Creates test functions for verification
7. Verifies the deployment
8. Tests the functionality

## Usage

The click protection system operates automatically once deployed. There's no need for user intervention in normal operations. 

### Testing the System

The system can be tested using our test API endpoints:

```
curl -X POST http://yourserver.com/api/system/click-protection/simple-test
```

### Temporarily Disabling Protection

If you need to temporarily disable click protection for maintenance:

```sql
UPDATE protection_settings SET value = FALSE WHERE key = 'click_protection_enabled';
```

To re-enable:

```sql
UPDATE protection_settings SET value = TRUE WHERE key = 'click_protection_enabled';
```

## Troubleshooting

### Common Issues:

1. **Manual Updates Failing**:
   - Check if the protection setting is mistakenly set to block all updates
   - Verify the trigger function is correctly installed

2. **Protection Not Working**:
   - Ensure the trigger is properly attached to the URLs table
   - Check that the is_auto_sync() function is working correctly
   - Verify that TrafficStar sync operations are correctly wrapped in start_auto_sync/end_auto_sync calls

### Verification Query

To verify the click protection system is properly installed:

```sql
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
```
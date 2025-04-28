-- Fix click protection trigger function
CREATE OR REPLACE FUNCTION prevent_unauthorized_click_updates()
RETURNS TRIGGER AS $$
BEGIN
  -- If protection bypass is enabled (click protection is disabled),
  -- allow all updates to go through (this handles Original URL Records updates)
  IF NOT (SELECT value FROM protection_settings WHERE key = 'click_protection_enabled') THEN
    -- Bypass enabled, allow all updates
    RETURN NEW;
  END IF;
  
  -- If we get here, click protection is enabled (bypass is not enabled)
  -- We still want click_limit to be updatable for multiplier changes, etc.
  -- But we never want original_click_limit to change unless bypass is enabled
  
  -- Check if original click limit is being changed - never allow this without bypass
  IF NEW.original_click_limit IS DISTINCT FROM OLD.original_click_limit THEN
    RAISE WARNING 'Preventing unauthorized update to original_click_limit (from % to %) for URL %', 
      OLD.original_click_limit, NEW.original_click_limit, NEW.id;
    NEW.original_click_limit := OLD.original_click_limit;
  END IF;
  
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;
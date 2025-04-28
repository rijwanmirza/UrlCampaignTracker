-- Click Protection SQL
-- This adds PostgreSQL triggers to prevent unauthorized updates to click values

-- First, create a function to check whether an update is authorized
CREATE OR REPLACE FUNCTION check_click_protection_bypass()
RETURNS BOOLEAN AS $$
BEGIN
  -- If click protection is disabled, bypass is enabled
  RETURN NOT (SELECT value FROM protection_settings WHERE key = 'click_protection_enabled');
EXCEPTION
  WHEN OTHERS THEN
    -- Default to false (protection enabled) if table/setting doesn't exist
    RETURN FALSE;
END;
$$ LANGUAGE plpgsql;

-- Create a function that prevents unauthorized updates to click values in URLs
CREATE OR REPLACE FUNCTION prevent_unauthorized_click_updates()
RETURNS TRIGGER AS $$
BEGIN
  -- If protection bypass is not enabled (click protection is enabled)
  IF NOT check_click_protection_bypass() THEN
    -- Check if click limit is being changed
    IF NEW.click_limit IS DISTINCT FROM OLD.click_limit THEN
      RAISE WARNING 'Preventing unauthorized update to click_limit (from % to %) for URL %', 
        OLD.click_limit, NEW.click_limit, NEW.id;
      NEW.click_limit := OLD.click_limit;
    END IF;
    
    -- Check if original click limit is being changed
    IF NEW.original_click_limit IS DISTINCT FROM OLD.original_click_limit THEN
      RAISE WARNING 'Preventing unauthorized update to original_click_limit (from % to %) for URL %', 
        OLD.original_click_limit, NEW.original_click_limit, NEW.id;
      NEW.original_click_limit := OLD.original_click_limit;
    END IF;
  END IF;
  
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Apply this trigger to the URLs table
CREATE TRIGGER prevent_url_click_update_trigger
BEFORE UPDATE ON urls
FOR EACH ROW
EXECUTE FUNCTION prevent_unauthorized_click_updates();
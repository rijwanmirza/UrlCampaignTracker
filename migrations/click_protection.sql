-- Click Protection SQL
-- This adds PostgreSQL triggers to prevent automatic updates to click values

-- First, create a function to check whether an update is automatic or manual
CREATE OR REPLACE FUNCTION check_auto_sync()
RETURNS BOOLEAN AS $$
BEGIN
  -- Get the current session variable (set by the sync-context.js utility)
  RETURN NULLIF(current_setting('app.is_auto_sync', TRUE), '')::BOOLEAN;
EXCEPTION
  WHEN OTHERS THEN
    -- Default to false if variable doesn't exist
    RETURN FALSE;
END;
$$ LANGUAGE plpgsql;

-- Create a function that prevents automatic updates to click values in URLs
CREATE OR REPLACE FUNCTION prevent_auto_click_updates()
RETURNS TRIGGER AS $$
BEGIN
  -- If this is an automatic sync operation
  IF check_auto_sync() THEN
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
  IF check_auto_sync() THEN
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
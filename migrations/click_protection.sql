-- Click Protection Migrations
-- This prevents any automatic updates to click values

-- Create a trigger function that prevents ANY changes to click_limit
-- unless they are specifically set by a user action
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
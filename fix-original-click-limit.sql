-- Find URLs with potential data type issues in originalClickLimit
SELECT id, name, original_click_limit, click_limit
FROM urls
WHERE name = '63712293';

-- Fix the problem URL directly with the correct value
UPDATE urls
SET original_click_limit = 400
WHERE name = '63712293';

-- Verify the fix
SELECT id, name, original_click_limit, click_limit
FROM urls
WHERE name = '63712293';

-- Create a helper function to fix the trigger
CREATE OR REPLACE FUNCTION fix_click_protection_trigger() RETURNS void AS $$
BEGIN
    -- Drop existing trigger if it exists
    DROP TRIGGER IF EXISTS protect_click_limits ON urls;
    
    -- Create the fixed trigger that properly checks protection_settings
    CREATE TRIGGER protect_click_limits
    BEFORE UPDATE OF click_limit, original_click_limit ON urls
    FOR EACH ROW
    WHEN (OLD.click_limit IS DISTINCT FROM NEW.click_limit OR OLD.original_click_limit IS DISTINCT FROM NEW.original_click_limit)
    EXECUTE FUNCTION prevent_unauthorized_click_limit_changes();
    
    RAISE NOTICE 'Click protection trigger has been fixed';
END;
$$ LANGUAGE plpgsql;

-- Execute the fix
SELECT fix_click_protection_trigger();
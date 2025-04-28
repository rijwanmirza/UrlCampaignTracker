-- Fix-Click-Limits.sql
-- This script synchronizes original_click_limit values between original_url_records and urls tables
-- and recalculates click_limit values based on campaign multipliers

-- Step 1: Temporarily disable triggers to allow direct updates
ALTER TABLE urls DISABLE TRIGGER protect_original_click_values_trigger;
ALTER TABLE urls DISABLE TRIGGER prevent_auto_click_update_trigger;

-- Step 2: Find mismatched records where the original_click_limit values don't match
SELECT 
  'Mismatch found:' AS status,
  ou.id AS original_record_id,
  ou.name AS url_name,
  ou.original_click_limit AS original_limit,
  u.id AS url_id, 
  u.original_click_limit AS url_original_limit,
  u.click_limit AS url_click_limit,
  c.multiplier AS campaign_multiplier,
  c.id AS campaign_id
FROM original_url_records ou
JOIN urls u ON ou.name = u.name
JOIN campaigns c ON u.campaign_id = c.id
WHERE ou.original_click_limit != u.original_click_limit;

-- Step 3: Fix all mismatched records
UPDATE urls u
SET 
  original_click_limit = ou.original_click_limit,
  click_limit = ROUND(ou.original_click_limit * COALESCE(c.multiplier, 1))
FROM original_url_records ou, campaigns c
WHERE 
  u.name = ou.name AND
  u.campaign_id = c.id AND
  ou.original_click_limit != u.original_click_limit;

-- Step 4: Verify the fixes worked
SELECT 
  'After fix:' AS status,
  ou.id AS original_record_id,
  ou.name AS url_name,
  ou.original_click_limit AS original_limit,
  u.id AS url_id, 
  u.original_click_limit AS url_original_limit,
  u.click_limit AS url_click_limit,
  c.multiplier AS campaign_multiplier,
  c.id AS campaign_id
FROM original_url_records ou
JOIN urls u ON ou.name = u.name
JOIN campaigns c ON u.campaign_id = c.id
WHERE ou.name = u.name
ORDER BY ou.id;

-- Step 5: Re-enable the triggers
ALTER TABLE urls ENABLE TRIGGER protect_original_click_values_trigger;
ALTER TABLE urls ENABLE TRIGGER prevent_auto_click_update_trigger;

-- Result summary
SELECT 
  COUNT(*) AS total_records,
  SUM(CASE WHEN ou.original_click_limit = u.original_click_limit THEN 1 ELSE 0 END) AS matched_records,
  SUM(CASE WHEN ou.original_click_limit != u.original_click_limit THEN 1 ELSE 0 END) AS mismatched_records
FROM original_url_records ou
JOIN urls u ON ou.name = u.name;
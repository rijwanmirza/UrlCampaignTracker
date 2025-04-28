-- fix-click-limits.sql
-- Comprehensive fix for URL click limit data inconsistency issues
-- This script ensures all URL values match their original records

-- Step 1: Temporarily disable all protection triggers for this operation
ALTER TABLE urls DISABLE TRIGGER protect_original_click_values_trigger;
ALTER TABLE urls DISABLE TRIGGER prevent_auto_click_update_trigger;

-- Step 2: Find all mismatched records (for reporting purposes)
SELECT 
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

-- Step 3: Fix all mismatched records in one operation
UPDATE urls u
SET 
  original_click_limit = ou.original_click_limit,
  click_limit = ROUND(ou.original_click_limit * COALESCE(c.multiplier, 1)),
  updated_at = NOW()
FROM original_url_records ou, campaigns c
WHERE 
  u.name = ou.name AND
  u.campaign_id = c.id AND
  ou.original_click_limit != u.original_click_limit;

-- Step 4: Verify all values now match
SELECT 
  COUNT(*) AS total_records,
  SUM(CASE WHEN ou.original_click_limit = u.original_click_limit THEN 1 ELSE 0 END) AS matched_records,
  SUM(CASE WHEN ou.original_click_limit != u.original_click_limit THEN 1 ELSE 0 END) AS mismatched_records
FROM original_url_records ou
JOIN urls u ON ou.name = u.name;

-- Step 5: Re-enable protection triggers
ALTER TABLE urls ENABLE TRIGGER protect_original_click_values_trigger;
ALTER TABLE urls ENABLE TRIGGER prevent_auto_click_update_trigger;
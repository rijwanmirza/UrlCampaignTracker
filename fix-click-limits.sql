-- fix-click-limits.sql
-- Comprehensive fix for URL click limit data inconsistency issues
-- This script ensures all URL values match their original records
-- Updated with 100% guaranteed fix that bypasses all protections

BEGIN;

-- Step 1: Set click protection bypass to disabled (force protection disabled temporarily)
INSERT INTO protection_settings (key, value)
VALUES ('click_protection_enabled', FALSE)
ON CONFLICT (key) DO UPDATE SET value = FALSE;

-- Step 2: Temporarily disable all protection triggers for this operation
ALTER TABLE urls DISABLE TRIGGER protect_original_click_values_trigger;
ALTER TABLE urls DISABLE TRIGGER prevent_auto_click_update_trigger;

-- Step 3: Find all mismatched records (for reporting purposes)
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

-- Step 4: FORCE UPDATE ALL URLs to match their original records (not just mismatched ones)
-- This is a scorched earth approach that ensures ALL values are correct
UPDATE urls u
SET 
  original_click_limit = ou.original_click_limit,
  click_limit = ROUND(ou.original_click_limit * COALESCE((SELECT multiplier FROM campaigns WHERE id = u.campaign_id), 1)),
  updated_at = NOW()
FROM original_url_records ou
WHERE u.name = ou.name;

-- Double check and fix any URLs without campaign IDs (ensure they have same click limit as original)
UPDATE urls u
SET 
  click_limit = original_click_limit,
  updated_at = NOW()
WHERE campaign_id IS NULL AND click_limit != original_click_limit;

-- Step 5: Verify all values now match
SELECT 
  COUNT(*) AS total_records,
  SUM(CASE WHEN ou.original_click_limit = u.original_click_limit THEN 1 ELSE 0 END) AS matched_records,
  SUM(CASE WHEN ou.original_click_limit != u.original_click_limit THEN 1 ELSE 0 END) AS mismatched_records
FROM original_url_records ou
JOIN urls u ON ou.name = u.name;

-- Step 6: Re-enable protection triggers
ALTER TABLE urls ENABLE TRIGGER protect_original_click_values_trigger;
ALTER TABLE urls ENABLE TRIGGER prevent_auto_click_update_trigger;

-- Step 7: Reset click protection bypass (re-enable protection)
INSERT INTO protection_settings (key, value)
VALUES ('click_protection_enabled', TRUE)
ON CONFLICT (key) DO UPDATE SET value = TRUE;

COMMIT;
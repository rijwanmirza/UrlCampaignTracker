-- This SQL script fixes inconsistencies between original_url_records and urls tables
-- for original_click_limit values

-- First, enable the click protection bypass temporarily
INSERT INTO protection_settings (key, value, created_at, updated_at)
VALUES ('click_protection_bypass', 'true', NOW(), NOW())
ON CONFLICT (key) DO UPDATE SET value = 'true', updated_at = NOW();

-- Fix the specific URL with name = '63712293'
UPDATE urls
SET original_click_limit = 400
WHERE name = '63712293';

-- Disable the click protection bypass when done
UPDATE protection_settings
SET value = 'false', updated_at = NOW()
WHERE key = 'click_protection_bypass';

-- Verify the fix by selecting data from both tables
SELECT 'Original URL Record' as table_name, id, name, original_click_limit
FROM original_url_records
WHERE name = '63712293'
UNION ALL
SELECT 'URL' as table_name, id, name, original_click_limit
FROM urls
WHERE name = '63712293';
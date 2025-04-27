#!/bin/bash
# fix-click-protection-vps.sh
# Simplified script to deploy click protection to VPS
# Usage: ./fix-click-protection-vps.sh

echo "Deploying click protection system to VPS..."

# Quick fix for VPS environment - just the essential operations
sudo -u postgres psql -d postgres << EOF
-- Create sync context tracking if needed
CREATE TABLE IF NOT EXISTS auto_sync_operations (
  id SERIAL PRIMARY KEY,
  started_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  ended_at TIMESTAMP WITH TIME ZONE,
  is_active BOOLEAN DEFAULT TRUE
);

-- Create basic tracking functions if they don't exist
CREATE OR REPLACE FUNCTION start_auto_sync()
RETURNS INTEGER AS \$\$
DECLARE
  operation_id INTEGER;
BEGIN
  INSERT INTO auto_sync_operations (started_at, is_active) 
  VALUES (NOW(), TRUE)
  RETURNING id INTO operation_id;
  
  RETURN operation_id;
END;
\$\$ LANGUAGE plpgsql;

CREATE OR REPLACE FUNCTION end_auto_sync(operation_id INTEGER)
RETURNS BOOLEAN AS \$\$
BEGIN
  UPDATE auto_sync_operations 
  SET ended_at = NOW(), is_active = FALSE
  WHERE id = operation_id;
  
  RETURN FOUND;
END;
\$\$ LANGUAGE plpgsql;

CREATE OR REPLACE FUNCTION is_auto_sync()
RETURNS BOOLEAN AS \$\$
BEGIN
  RETURN EXISTS (
    SELECT 1 FROM auto_sync_operations 
    WHERE is_active = TRUE
  );
END;
\$\$ LANGUAGE plpgsql;

-- Create settings table
CREATE TABLE IF NOT EXISTS protection_settings (
  key TEXT PRIMARY KEY,
  value BOOLEAN NOT NULL,
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Enable click protection
INSERT INTO protection_settings (key, value)
VALUES ('click_protection_enabled', TRUE)
ON CONFLICT (key) DO UPDATE SET value = TRUE, updated_at = NOW();

-- Create trigger function
CREATE OR REPLACE FUNCTION prevent_auto_click_updates()
RETURNS TRIGGER AS \$\$
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
\$\$ LANGUAGE plpgsql;

-- Apply trigger to urls table
DROP TRIGGER IF EXISTS prevent_auto_click_update_trigger ON urls;
CREATE TRIGGER prevent_auto_click_update_trigger
BEFORE UPDATE ON urls
FOR EACH ROW
EXECUTE FUNCTION prevent_auto_click_updates();
EOF

echo "✅ Click protection system deployed successfully!"
echo "Manual click_limit changes will be allowed, but automatic sync changes will be blocked."
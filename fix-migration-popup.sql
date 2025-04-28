-- This script ensures all necessary migrations have been applied
-- Run with: psql $DATABASE_URL -f fix-migration-popup.sql

-- Add budget_update_time column if it doesn't exist
DO $$ 
BEGIN
  IF NOT EXISTS (
    SELECT 1 
    FROM information_schema.columns
    WHERE table_name='campaigns' AND column_name='budget_update_time'
  ) THEN
    ALTER TABLE campaigns ADD COLUMN budget_update_time TIME DEFAULT '00:00:00';
    RAISE NOTICE 'Added budget_update_time column';
  ELSE
    RAISE NOTICE 'budget_update_time column already exists';
  END IF;
END $$;

-- Add trafficstar_campaign_id column if it doesn't exist
DO $$ 
BEGIN
  IF NOT EXISTS (
    SELECT 1 
    FROM information_schema.columns
    WHERE table_name='campaigns' AND column_name='trafficstar_campaign_id'
  ) THEN
    ALTER TABLE campaigns ADD COLUMN trafficstar_campaign_id TEXT;
    RAISE NOTICE 'Added trafficstar_campaign_id column';
  ELSE
    RAISE NOTICE 'trafficstar_campaign_id column already exists';
  END IF;
END $$;

-- Create original_url_records table if it doesn't exist
DO $$ 
BEGIN
  IF NOT EXISTS (
    SELECT 1 
    FROM information_schema.tables
    WHERE table_name='original_url_records'
  ) THEN
    CREATE TABLE original_url_records (
      id SERIAL PRIMARY KEY,
      name TEXT NOT NULL UNIQUE,
      target_url TEXT NOT NULL,
      original_click_limit INTEGER NOT NULL,
      created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW() NOT NULL,
      updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW() NOT NULL
    );
    
    CREATE INDEX original_url_records_name_idx ON original_url_records (name);
    RAISE NOTICE 'Created original_url_records table';
  ELSE
    RAISE NOTICE 'original_url_records table already exists';
  END IF;
END $$;

-- Create protection_settings table if it doesn't exist
DO $$ 
BEGIN
  IF NOT EXISTS (
    SELECT 1 
    FROM information_schema.tables
    WHERE table_name='protection_settings'
  ) THEN
    CREATE TABLE protection_settings (
      key TEXT PRIMARY KEY,
      value BOOLEAN NOT NULL
    );
    
    INSERT INTO protection_settings (key, value)
    VALUES ('click_protection_enabled', TRUE)
    ON CONFLICT (key) DO UPDATE SET value = TRUE;
    
    RAISE NOTICE 'Created protection_settings table';
  ELSE
    RAISE NOTICE 'protection_settings table already exists';
  END IF;
END $$;
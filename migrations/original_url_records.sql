-- Migration to create the original_url_records table

-- Create table to store original URL records with click values
CREATE TABLE IF NOT EXISTS original_url_records (
  id SERIAL PRIMARY KEY,
  name TEXT NOT NULL UNIQUE,
  target_url TEXT NOT NULL,
  original_click_limit INTEGER NOT NULL,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW() NOT NULL,
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW() NOT NULL
);

-- Index for faster lookups by name
CREATE INDEX IF NOT EXISTS original_url_records_name_idx ON original_url_records (name);

-- Trigger to update the updated_at timestamp on record changes
CREATE OR REPLACE FUNCTION update_original_url_records_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS update_original_url_records_trigger ON original_url_records;
CREATE TRIGGER update_original_url_records_trigger
BEFORE UPDATE ON original_url_records
FOR EACH ROW
EXECUTE FUNCTION update_original_url_records_updated_at();
-- Add YouTube duration filter fields to campaigns table
ALTER TABLE campaigns 
ADD COLUMN IF NOT EXISTS youtube_check_duration BOOLEAN DEFAULT FALSE,
ADD COLUMN IF NOT EXISTS youtube_max_duration_minutes INTEGER DEFAULT 30;

-- Add exceeded_duration field to youtube_url_records table
ALTER TABLE youtube_url_records
ADD COLUMN IF NOT EXISTS exceeded_duration BOOLEAN DEFAULT FALSE;
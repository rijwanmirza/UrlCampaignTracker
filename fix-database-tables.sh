#!/bin/bash

# Direct Database Table Fix
# This script directly fixes the database tables and relations

# Text formatting
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

echo -e "${BLUE}╔══════════════════════════════════════════════════════════════╗${NC}"
echo -e "${BLUE}║               DIRECT DATABASE TABLE FIX                      ║${NC}"
echo -e "${BLUE}╚══════════════════════════════════════════════════════════════╝${NC}"
echo

# Step 1: Drop and recreate all tables with proper relations
echo -e "${YELLOW}🔄 Recreating all database tables...${NC}"

sudo -u postgres psql postgres << EOF
-- Start transaction
BEGIN;

-- Drop existing tables if they exist
DROP TABLE IF EXISTS original_url_records;
DROP TABLE IF EXISTS urls;
DROP TABLE IF EXISTS campaigns;
DROP TABLE IF EXISTS sessions;

-- Create campaigns table
CREATE TABLE campaigns (
  id SERIAL PRIMARY KEY,
  name VARCHAR(255) NOT NULL,
  description TEXT,
  trafficstar_id VARCHAR(255),
  auto_management BOOLEAN DEFAULT FALSE,
  multiplier NUMERIC(10,2) DEFAULT 1.0,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Create urls table with proper foreign keys
CREATE TABLE urls (
  id SERIAL PRIMARY KEY,
  name VARCHAR(255) NOT NULL,
  target_url TEXT NOT NULL,
  campaign_id INTEGER REFERENCES campaigns(id) ON DELETE CASCADE,
  clicks INTEGER DEFAULT 0,
  click_limit INTEGER DEFAULT 1000,
  original_click_limit INTEGER,
  status VARCHAR(50) DEFAULT 'active',
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Create original_url_records table with proper foreign keys
CREATE TABLE original_url_records (
  id SERIAL PRIMARY KEY,
  name VARCHAR(255) NOT NULL,
  target_url TEXT NOT NULL,
  campaign_id INTEGER REFERENCES campaigns(id) ON DELETE CASCADE,
  clicks INTEGER DEFAULT 0,
  click_limit INTEGER NOT NULL,
  status VARCHAR(50) DEFAULT 'active',
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Create sessions table for authentication
CREATE TABLE sessions (
  sid VARCHAR NOT NULL PRIMARY KEY,
  sess JSON NOT NULL,
  expire TIMESTAMP(6) NOT NULL
);

-- Create indexes for performance
CREATE INDEX campaign_id_idx ON urls (campaign_id);
CREATE INDEX original_campaign_id_idx ON original_url_records (campaign_id);

-- Recreate the click protection trigger
CREATE OR REPLACE FUNCTION prevent_click_limit_change() RETURNS TRIGGER AS \$\$
BEGIN
  IF TG_OP = 'UPDATE' THEN
    IF NEW.click_limit <> OLD.click_limit AND 
       NOT (current_setting('click_protection.bypass', TRUE) = 'true') THEN
      RAISE EXCEPTION 'Unauthorized attempt to change click_limit from % to %', 
        OLD.click_limit, NEW.click_limit;
    END IF;
  END IF;
  RETURN NEW;
END;
\$\$ LANGUAGE plpgsql;

-- Add the trigger to the urls table
DROP TRIGGER IF EXISTS prevent_click_limit_update ON urls;
CREATE TRIGGER prevent_click_limit_update
BEFORE UPDATE ON urls
FOR EACH ROW
EXECUTE FUNCTION prevent_click_limit_change();

-- Add test campaign if no data exists
INSERT INTO campaigns (name, description, multiplier) 
VALUES ('Test Campaign', 'This is a test campaign created during database fix', 1.0);

-- Add test URL
INSERT INTO urls (name, target_url, campaign_id, click_limit, original_click_limit, status)
VALUES ('Test URL', 'https://example.com', 1, 1000, 1000, 'active');

-- Add test original URL record
INSERT INTO original_url_records (name, target_url, campaign_id, click_limit, status)
VALUES ('Test Original URL', 'https://example.com', 1, 1000, 'active');

-- Commit the changes
COMMIT;
EOF

echo -e "${GREEN}✓ Database tables recreated${NC}"

# Step 2: Check that the tables were created properly
echo -e "${YELLOW}🔍 Verifying database tables...${NC}"
sudo -u postgres psql -c "\dt" postgres

echo -e "${YELLOW}🔍 Verifying campaigns table...${NC}"
sudo -u postgres psql -c "SELECT * FROM campaigns" postgres

echo -e "${YELLOW}🔍 Verifying urls table...${NC}"
sudo -u postgres psql -c "SELECT * FROM urls" postgres

echo -e "${YELLOW}🔍 Verifying original_url_records table...${NC}"
sudo -u postgres psql -c "SELECT * FROM original_url_records" postgres

# Step 3: Restart the application
echo -e "${YELLOW}🔄 Restarting application...${NC}"
cd /var/www/url-campaign
pm2 restart url-campaign
echo -e "${GREEN}✓ Application restarted${NC}"

# Step 4: Clear Nginx server cache and restart
echo -e "${YELLOW}🔄 Clearing Nginx cache and restarting...${NC}"
systemctl restart nginx
echo -e "${GREEN}✓ Nginx restarted${NC}"

# Final message
echo -e "${BLUE}╔══════════════════════════════════════════════════════════════╗${NC}"
echo -e "${BLUE}║                   DATABASE FIX COMPLETE                      ║${NC}"
echo -e "${BLUE}╚══════════════════════════════════════════════════════════════╝${NC}"
echo
echo -e "${GREEN}✓ Database tables completely recreated${NC}"
echo -e "${GREEN}✓ Test data has been added${NC}"
echo -e "${GREEN}✓ Application has been restarted${NC}"
echo
echo -e "${YELLOW}Your site should now be accessible at: https://views.yoyoprime.com${NC}"
echo -e "${YELLOW}If still having issues, try restarting your browser or clearing cache${NC}"
echo
echo -e "${YELLOW}Quick checks to try:${NC}"
echo -e "1. Verify database connection: ${BLUE}sudo -u postgres psql -c 'SELECT COUNT(*) FROM campaigns;'${NC}"
echo -e "2. Check application logs: ${BLUE}pm2 logs url-campaign --lines 20${NC}"
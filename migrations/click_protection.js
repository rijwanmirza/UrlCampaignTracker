/**
 * Click Protection Migration
 * 
 * This script applies the database triggers and functions
 * needed to protect click values from automatic changes.
 */

import { db } from '../server/db.ts';
import { sql } from 'drizzle-orm';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

// Get the directory name
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

async function applyClickProtection() {
  console.log('===== Applying Click Protection =====');
  
  try {
    // Create protection settings table
    console.log('1. Creating protection settings table...');
    await db.execute(sql`
      CREATE TABLE IF NOT EXISTS protection_settings (
        key TEXT PRIMARY KEY,
        value BOOLEAN NOT NULL
      );
      
      INSERT INTO protection_settings (key, value)
      VALUES ('click_protection_enabled', TRUE)
      ON CONFLICT (key) DO NOTHING;
    `);
    
    // Create sync operations tracking table
    console.log('2. Creating sync operations tracking table...');
    await db.execute(sql`
      CREATE TABLE IF NOT EXISTS sync_operations (
        id SERIAL PRIMARY KEY,
        is_auto_sync BOOLEAN NOT NULL DEFAULT FALSE,
        started_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
        completed_at TIMESTAMP WITH TIME ZONE
      );
    `);
    
    // Create helper functions
    console.log('3. Creating helper functions...');
    await db.execute(sql`
      -- Function to check if click protection is enabled
      CREATE OR REPLACE FUNCTION click_protection_enabled()
      RETURNS BOOLEAN AS $$
      BEGIN
        RETURN (SELECT value FROM protection_settings WHERE key = 'click_protection_enabled');
      END;
      $$ LANGUAGE plpgsql;
      
      -- Function to check if an automatic sync is in progress
      CREATE OR REPLACE FUNCTION is_auto_sync()
      RETURNS BOOLEAN AS $$
      BEGIN
        RETURN EXISTS (
          SELECT 1 FROM sync_operations 
          WHERE is_auto_sync = TRUE AND completed_at IS NULL
        );
      END;
      $$ LANGUAGE plpgsql;
      
      -- Function to start an auto-sync operation
      CREATE OR REPLACE FUNCTION start_auto_sync()
      RETURNS INTEGER AS $$
      DECLARE
        operation_id INTEGER;
      BEGIN
        INSERT INTO sync_operations (is_auto_sync) 
        VALUES (TRUE) 
        RETURNING id INTO operation_id;
        
        RETURN operation_id;
      END;
      $$ LANGUAGE plpgsql;
      
      -- Function to end an auto-sync operation
      CREATE OR REPLACE FUNCTION end_auto_sync(operation_id INTEGER)
      RETURNS VOID AS $$
      BEGIN
        UPDATE sync_operations
        SET completed_at = NOW()
        WHERE id = operation_id;
      END;
      $$ LANGUAGE plpgsql;
    `);
    
    // Create protection triggers
    console.log('4. Creating protection triggers...');
    await db.execute(sql`
      -- Function that prevents automatic updates to URL click values
      CREATE OR REPLACE FUNCTION prevent_auto_click_updates()
      RETURNS TRIGGER AS $$
      BEGIN
        -- Check if click protection is enabled and this is an auto sync operation
        IF click_protection_enabled() AND is_auto_sync() THEN
          -- Restore the original click_limit value if it was changed
          IF NEW.click_limit IS DISTINCT FROM OLD.click_limit THEN
            RAISE WARNING 'Preventing automatic update to click_limit (from % to %) for URL %', 
              OLD.click_limit, NEW.click_limit, NEW.id;
            NEW.click_limit := OLD.click_limit;
          END IF;
          
          -- Restore the original clicks value if it was changed
          IF NEW.clicks IS DISTINCT FROM OLD.clicks THEN
            RAISE WARNING 'Preventing automatic update to clicks (from % to %) for URL %', 
              OLD.clicks, NEW.clicks, NEW.id;
            NEW.clicks := OLD.clicks;
          END IF;
          
          -- Restore the original original_click_limit value if it was changed
          IF NEW.original_click_limit IS DISTINCT FROM OLD.original_click_limit THEN
            RAISE WARNING 'Preventing automatic update to original_click_limit (from % to %) for URL %', 
              OLD.original_click_limit, NEW.original_click_limit, NEW.id;
            NEW.original_click_limit := OLD.original_click_limit;
          END IF;
        END IF;
        
        RETURN NEW;
      END;
      $$ LANGUAGE plpgsql;
      
      -- Function that prevents automatic updates to campaign click values
      CREATE OR REPLACE FUNCTION prevent_campaign_auto_click_updates()
      RETURNS TRIGGER AS $$
      BEGIN
        -- Check if click protection is enabled and this is an auto sync operation
        IF click_protection_enabled() AND is_auto_sync() THEN
          -- Restore the original total_clicks value if it was changed
          IF NEW.total_clicks IS DISTINCT FROM OLD.total_clicks THEN
            RAISE WARNING 'Preventing automatic update to total_clicks (from % to %) for campaign %', 
              OLD.total_clicks, NEW.total_clicks, NEW.id;
            NEW.total_clicks := OLD.total_clicks;
          END IF;
        END IF;
        
        RETURN NEW;
      END;
      $$ LANGUAGE plpgsql;
      
      -- Drop existing triggers if they exist (for idempotency)
      DROP TRIGGER IF EXISTS prevent_auto_click_update_trigger ON urls;
      DROP TRIGGER IF EXISTS prevent_campaign_auto_click_update_trigger ON campaigns;
      
      -- Create the trigger for URLs
      CREATE TRIGGER prevent_auto_click_update_trigger
      BEFORE UPDATE ON urls
      FOR EACH ROW
      EXECUTE FUNCTION prevent_auto_click_updates();
      
      -- Create the trigger for campaigns
      CREATE TRIGGER prevent_campaign_auto_click_update_trigger
      BEFORE UPDATE ON campaigns
      FOR EACH ROW
      EXECUTE FUNCTION prevent_campaign_auto_click_updates();
    `);
    
    // Verify the triggers were created
    console.log('5. Verifying installation...');
    const [urlTriggerResult] = await db.execute(sql`
      SELECT EXISTS (
        SELECT 1 FROM pg_trigger 
        WHERE tgname = 'prevent_auto_click_update_trigger'
      );
    `);
    
    const [campaignTriggerResult] = await db.execute(sql`
      SELECT EXISTS (
        SELECT 1 FROM pg_trigger 
        WHERE tgname = 'prevent_campaign_auto_click_update_trigger'
      );
    `);
    
    const urlTriggerExists = urlTriggerResult?.exists === true;
    const campaignTriggerExists = campaignTriggerResult?.exists === true;
    
    if (urlTriggerExists && campaignTriggerExists) {
      console.log('✅ Click protection successfully applied!');
      console.log('✅ URL click values are now protected from automatic updates');
      console.log('✅ Campaign click values are now protected from automatic updates');
    } else {
      console.error('❌ Failed to verify triggers:', { urlTriggerExists, campaignTriggerExists });
    }
    
  } catch (error) {
    console.error('Error applying click protection:', error);
  }
}

// Run the migration
applyClickProtection();
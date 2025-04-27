/**
 * Click Protection Migration
 * 
 * This script applies the database triggers and functions
 * needed to protect click values from automatic changes.
 */

import { db } from '../server/db.js';
import { sql } from 'drizzle-orm';

/**
 * Apply the click protection triggers and functions
 */
async function applyClickProtection() {
  try {
    console.log('Starting click protection migration...');

    // Create settings table for protection configuration
    await db.execute(sql`
      CREATE TABLE IF NOT EXISTS protection_settings (
        key TEXT PRIMARY KEY,
        value BOOLEAN NOT NULL
      )
    `);

    // Initialize with default value if not exists
    await db.execute(sql`
      INSERT INTO protection_settings (key, value)
      VALUES ('click_protection_enabled', TRUE)
      ON CONFLICT (key) DO NOTHING
    `);

    // Create table to track sync operations
    await db.execute(sql`
      CREATE TABLE IF NOT EXISTS sync_operations (
        id SERIAL PRIMARY KEY,
        is_auto_sync BOOLEAN NOT NULL DEFAULT FALSE,
        started_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
        completed_at TIMESTAMP WITH TIME ZONE
      )
    `);

    // Function to check if click protection is enabled
    await db.execute(sql`
      CREATE OR REPLACE FUNCTION click_protection_enabled()
      RETURNS BOOLEAN AS $$
      BEGIN
        RETURN (SELECT value FROM protection_settings WHERE key = 'click_protection_enabled');
      END;
      $$ LANGUAGE plpgsql
    `);

    // Function to check if an automatic sync is in progress
    await db.execute(sql`
      CREATE OR REPLACE FUNCTION is_auto_sync()
      RETURNS BOOLEAN AS $$
      BEGIN
        RETURN EXISTS (
          SELECT 1 FROM sync_operations 
          WHERE is_auto_sync = TRUE AND completed_at IS NULL
        );
      END;
      $$ LANGUAGE plpgsql
    `);

    // Function to start an auto-sync operation
    await db.execute(sql`
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
      $$ LANGUAGE plpgsql
    `);

    // Function to end an auto-sync operation
    await db.execute(sql`
      CREATE OR REPLACE FUNCTION end_auto_sync(operation_id INTEGER)
      RETURNS VOID AS $$
      BEGIN
        UPDATE sync_operations
        SET completed_at = NOW()
        WHERE id = operation_id;
      END;
      $$ LANGUAGE plpgsql
    `);

    // Create a function that prevents automatic updates to click values in URLs
    await db.execute(sql`
      CREATE OR REPLACE FUNCTION prevent_auto_click_updates()
      RETURNS TRIGGER AS $$
      BEGIN
        -- If this is an automatic sync operation
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
      $$ LANGUAGE plpgsql
    `);

    // Create a function that prevents automatic updates to click values in campaigns
    await db.execute(sql`
      CREATE OR REPLACE FUNCTION prevent_campaign_auto_click_updates()
      RETURNS TRIGGER AS $$
      BEGIN
        -- If this is an automatic sync operation
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
      $$ LANGUAGE plpgsql
    `);

    // Drop existing triggers if they exist (for idempotency)
    await db.execute(sql`
      DROP TRIGGER IF EXISTS prevent_auto_click_update_trigger ON urls
    `);
    
    await db.execute(sql`
      DROP TRIGGER IF EXISTS prevent_campaign_auto_click_update_trigger ON campaigns
    `);

    // Create the trigger for URLs
    await db.execute(sql`
      CREATE TRIGGER prevent_auto_click_update_trigger
      BEFORE UPDATE ON urls
      FOR EACH ROW
      EXECUTE FUNCTION prevent_auto_click_updates()
    `);

    // Create the trigger for campaigns
    await db.execute(sql`
      CREATE TRIGGER prevent_campaign_auto_click_update_trigger
      BEFORE UPDATE ON campaigns
      FOR EACH ROW
      EXECUTE FUNCTION prevent_campaign_auto_click_updates()
    `);

    // Check if the triggers were created
    const [urlTriggers] = await db.execute(sql`
      SELECT COUNT(*) AS count FROM pg_trigger 
      WHERE tgname = 'prevent_auto_click_update_trigger'
    `);
    
    const [campaignTriggers] = await db.execute(sql`
      SELECT COUNT(*) AS count FROM pg_trigger 
      WHERE tgname = 'prevent_campaign_auto_click_update_trigger'
    `);

    if (urlTriggers.count > 0 && campaignTriggers.count > 0) {
      console.log('✅ Click protection triggers created successfully');
    } else {
      console.log('❌ Failed to create all triggers');
    }

    console.log('Click protection migration completed');
  } catch (error) {
    console.error('Error applying click protection:', error);
    throw error;
  }
}

// Run the migration
applyClickProtection().catch(error => {
  console.error('Migration failed:', error);
  process.exit(1);
});
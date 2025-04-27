/**
 * Script to apply click protection to prevent automatic updates to click values
 */

// For ESM compatibility
import { createRequire } from 'module';
const require = createRequire(import.meta.url);

// Import database utilities
import { Pool } from '@neondatabase/serverless';
import { drizzle } from 'drizzle-orm/neon-serverless';
import { sql } from 'drizzle-orm';

// Use DATABASE_URL environment variable directly
console.log('DATABASE_URL', process.env.DATABASE_URL ? 'is set' : 'is NOT set');
const pool = new Pool({ connectionString: process.env.DATABASE_URL });
const db = drizzle(pool);

async function applyClickProtection() {
  console.log('=== Applying Click Protection ===');
  console.log('This will install database triggers to prevent automatic updates to click values');
  console.log('');
  
  try {
    // Create settings table for protection configuration
    console.log('1. Creating settings table...');
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
    console.log('2. Creating sync operations table...');
    await db.execute(sql`
      CREATE TABLE IF NOT EXISTS sync_operations (
        id SERIAL PRIMARY KEY,
        is_auto_sync BOOLEAN NOT NULL DEFAULT FALSE,
        started_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
        completed_at TIMESTAMP WITH TIME ZONE
      )
    `);

    // Function to check if click protection is enabled
    console.log('3. Creating helper functions...');
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
    console.log('4. Creating protection triggers...');
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
    console.log('5. Verifying installation...');
    const [urlTriggers] = await db.execute(sql`
      SELECT COUNT(*) AS count FROM pg_trigger 
      WHERE tgname = 'prevent_auto_click_update_trigger'
    `);
    
    const [campaignTriggers] = await db.execute(sql`
      SELECT COUNT(*) AS count FROM pg_trigger 
      WHERE tgname = 'prevent_campaign_auto_click_update_trigger'
    `);

    if (urlTriggers.count > 0 && campaignTriggers.count > 0) {
      console.log('');
      console.log('✅ Click protection installed successfully!');
      console.log('✅ URL click values are now protected from automatic updates');
      console.log('✅ Campaign click values are now protected from automatic updates');
    } else {
      console.log('');
      console.log('❌ Failed to install click protection - triggers not found');
      console.log(`Found URL triggers: ${urlTriggers.count}, Campaign triggers: ${campaignTriggers.count}`);
    }

    console.log('');
    console.log('=== Click Protection Overview ===');
    console.log('The installed protection system:');
    console.log('1. Prevents automatic updates to click values during TrafficStar synchronization');
    console.log('2. Allows manual updates to click values through the web interface');
    console.log('3. Logs all prevented updates to the PostgreSQL logs');
    console.log('');
    console.log('For troubleshooting, check:');
    console.log('- PostgreSQL logs for "Preventing automatic update" warnings');
    console.log('- sync_operations table for a history of sync operations');
    console.log('- protection_settings table to enable/disable protection');
  } catch (error) {
    console.error('Error applying click protection:', error);
    console.log('');
    console.log('❌ Click protection installation failed');
    console.log('Please check the error message above and try again');
    process.exit(1);
  }
}

// Run the function
applyClickProtection().then(() => {
  console.log('');
  console.log('✓ Done');
  process.exit(0);
}).catch(error => {
  console.error('Fatal error:', error);
  process.exit(1);
});
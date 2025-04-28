import { db } from './db';
import { sql } from 'drizzle-orm';

/**
 * Applies the click protection triggers to the database
 * This will prevent unauthorized updates to click limits unless
 * the click protection bypass is enabled
 */
export async function applyClickProtection() {
  try {
    console.log('=== Applying Click Protection ===');
    console.log('This will install database triggers to prevent unauthorized updates to click values');
    
    // Create settings table for protection configuration
    await db.execute(sql`
      CREATE TABLE IF NOT EXISTS protection_settings (
        key TEXT PRIMARY KEY,
        value BOOLEAN NOT NULL
      )
    `);

    // Initialize with default value if not exists (protection enabled by default)
    await db.execute(sql`
      INSERT INTO protection_settings (key, value)
      VALUES ('click_protection_enabled', TRUE)
      ON CONFLICT (key) DO NOTHING
    `);

    // First, create a function to check whether an update is authorized
    await db.execute(sql`
      CREATE OR REPLACE FUNCTION check_click_protection_bypass()
      RETURNS BOOLEAN AS $$
      BEGIN
        -- If click protection is disabled, bypass is enabled
        RETURN NOT (SELECT value FROM protection_settings WHERE key = 'click_protection_enabled');
      EXCEPTION
        WHEN OTHERS THEN
          -- Default to false (protection enabled) if table/setting doesn't exist
          RETURN FALSE;
      END;
      $$ LANGUAGE plpgsql;
    `);

    // Create a function that prevents unauthorized updates to click values in URLs
    await db.execute(sql`
      CREATE OR REPLACE FUNCTION prevent_unauthorized_click_updates()
      RETURNS TRIGGER AS $$
      BEGIN
        -- If protection bypass is not enabled (click protection is enabled)
        IF NOT check_click_protection_bypass() THEN
          -- Check if click limit is being changed
          IF NEW.click_limit IS DISTINCT FROM OLD.click_limit THEN
            RAISE WARNING 'Preventing unauthorized update to click_limit (from % to %) for URL %', 
              OLD.click_limit, NEW.click_limit, NEW.id;
            NEW.click_limit := OLD.click_limit;
          END IF;
          
          -- Check if original click limit is being changed
          IF NEW.original_click_limit IS DISTINCT FROM OLD.original_click_limit THEN
            RAISE WARNING 'Preventing unauthorized update to original_click_limit (from % to %) for URL %', 
              OLD.original_click_limit, NEW.original_click_limit, NEW.id;
            NEW.original_click_limit := OLD.original_click_limit;
          END IF;
        END IF;
        
        RETURN NEW;
      END;
      $$ LANGUAGE plpgsql;
    `);

    // Drop any existing trigger
    try {
      await db.execute(sql`DROP TRIGGER IF EXISTS prevent_url_click_update_trigger ON urls;`);
    } catch (e) {
      console.log('No existing trigger to drop:', e);
    }

    // Apply this trigger to the URLs table
    await db.execute(sql`
      CREATE TRIGGER prevent_url_click_update_trigger
      BEFORE UPDATE ON urls
      FOR EACH ROW
      EXECUTE FUNCTION prevent_unauthorized_click_updates();
    `);

    // Check if the trigger was created
    const urlTriggers = await db.execute(sql`
      SELECT COUNT(*) AS count FROM pg_trigger 
      WHERE tgname = 'prevent_url_click_update_trigger'
    `);
    
    const triggerCount = urlTriggers.length > 0 && urlTriggers[0] ? Number(urlTriggers[0].count) : 0;

    if (triggerCount > 0) {
      console.log('✅ Click protection installed successfully!');
      return { 
        success: true, 
        message: "Click protection installed successfully!",
        details: { triggers: triggerCount }
      };
    } else {
      console.log('❌ Failed to install click protection - triggers not found');
      return { 
        success: false, 
        message: "Failed to install click protection - triggers not found",
        details: { triggers: 0 }
      };
    }
  } catch (error) {
    console.error('Error applying click protection:', error);
    return { 
      success: false, 
      message: "Failed to apply click protection", 
      error: error instanceof Error ? error.message : String(error)
    };
  }
}
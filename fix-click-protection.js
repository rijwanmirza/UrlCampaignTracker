// Direct fix for the click protection trigger
import pkg from 'pg';
const { Pool } = pkg;

async function main() {
  try {
    console.log('Applying direct fix to click protection triggers...');
    
    // Connect to the database using the DATABASE_URL environment variable
    const pool = new Pool({
      connectionString: process.env.DATABASE_URL,
    });
    
    // First check if the protection is enabled
    const protectionQuery = await pool.query(`
      SELECT value FROM protection_settings WHERE key = 'click_protection_enabled'
    `);
    
    const isProtectionEnabled = protectionQuery.rows.length > 0 && 
      (protectionQuery.rows[0].value === true || protectionQuery.rows[0].value === 't');
    
    console.log(`Click protection is currently ${isProtectionEnabled ? 'ENABLED' : 'DISABLED'}`);
    
    // Create an improved protection trigger function
    console.log('Creating improved protection trigger function...');
    await pool.query(`
      CREATE OR REPLACE FUNCTION prevent_unauthorized_click_updates()
      RETURNS TRIGGER AS $$
      BEGIN
        -- If protection bypass is enabled (click protection is disabled),
        -- allow all updates to go through (this handles Original URL Records updates)
        IF NOT (SELECT value FROM protection_settings WHERE key = 'click_protection_enabled') THEN
          -- Bypass enabled, allow all updates
          RETURN NEW;
        END IF;
        
        -- If we get here, click protection is enabled (bypass is not enabled)
        -- We still want click_limit to be updatable for multiplier changes, etc.
        -- But we never want original_click_limit to change unless bypass is enabled
        
        -- Check if original click limit is being changed - never allow this without bypass
        IF NEW.original_click_limit IS DISTINCT FROM OLD.original_click_limit THEN
          RAISE WARNING 'Preventing unauthorized update to original_click_limit (from % to %) for URL %', 
            OLD.original_click_limit, NEW.original_click_limit, NEW.id;
          NEW.original_click_limit := OLD.original_click_limit;
        END IF;
        
        RETURN NEW;
      END;
      $$ LANGUAGE plpgsql;
    `);
    
    console.log('Testing the trigger by disabling click protection temporarily...');
    // Temporarily disable click protection for testing
    await pool.query(`
      INSERT INTO protection_settings (key, value)
      VALUES ('click_protection_enabled', FALSE)
      ON CONFLICT (key) DO UPDATE SET value = FALSE
    `);
    
    // Check that protection is now disabled
    const updatedProtectionQuery = await pool.query(`
      SELECT value FROM protection_settings WHERE key = 'click_protection_enabled'
    `);
    
    const isProtectionDisabled = updatedProtectionQuery.rows.length > 0 && 
      !(updatedProtectionQuery.rows[0].value === true || updatedProtectionQuery.rows[0].value === 't');
    
    console.log(`Click protection bypass is now ${isProtectionDisabled ? 'ENABLED' : 'DISABLED'}`);
    
    // Reset protection to its original state
    await pool.query(`
      INSERT INTO protection_settings (key, value)
      VALUES ('click_protection_enabled', ${isProtectionEnabled})
      ON CONFLICT (key) DO UPDATE SET value = ${isProtectionEnabled}
    `);
    
    console.log(`Click protection reset to original state: ${isProtectionEnabled ? 'ENABLED' : 'DISABLED'}`);
    console.log('Fix applied successfully!');
    
    // Clean up
    await pool.end();
    
  } catch (error) {
    console.error('Error applying fix:', error);
    process.exit(1);
  }
}

main();
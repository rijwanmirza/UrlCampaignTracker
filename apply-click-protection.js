/**
 * Script to apply click protection to prevent automatic updates to click values
 */

import { db } from './server/db.js';
import { sql } from 'drizzle-orm';
import fs from 'fs';
import path from 'path';

async function applyClickProtection() {
  console.log('Applying Click Protection System...');
  
  try {
    // Read the migration SQL
    const migrationSQL = fs.readFileSync('./migrations/click_protection.sql', 'utf8');
    
    // Split into statements
    const statements = migrationSQL.split(';').filter(stmt => stmt.trim().length > 0);
    
    // Execute each statement
    for (const statement of statements) {
      console.log(`Executing: ${statement.substring(0, 50)}...`);
      await db.execute(sql.raw(statement));
    }
    
    // Verify the triggers were created
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
    
    // Test the protection
    console.log('\nTesting protection...');
    await db.execute(sql`SET LOCAL app.is_auto_sync = 'true'`);
    
    // Try to update a URL's click_limit in auto-sync mode (should be blocked)
    await db.execute(sql`
      UPDATE urls 
      SET click_limit = 999999
      WHERE id = (SELECT id FROM urls LIMIT 1)
    `);
    
    console.log('✅ If no errors occurred, the protection is working properly');
    console.log('✅ Click values are now safe from automatic changes');
    
  } catch (error) {
    console.error('Error applying click protection:', error);
  }
}

// Run the protection
applyClickProtection();
/**
 * Test Click Protection
 * 
 * This script tests the protection system that prevents automatic
 * updates to URL click values.
 */

// For ESM compatibility
import { createRequire } from 'module';
const require = createRequire(import.meta.url);

// Import database and click protection utilities
import { Pool } from '@neondatabase/serverless';
import { drizzle } from 'drizzle-orm/neon-serverless';
import { sql } from 'drizzle-orm';

// Use DATABASE_URL environment variable directly
const pool = new Pool({ connectionString: process.env.DATABASE_URL });
const db = drizzle(pool);

// Manually implement click protection functions for testing
async function withAutoSyncContext(callback) {
  let syncOperationId = null;
  
  try {
    // Start a new auto-sync operation
    const [result] = await db.execute(sql`SELECT start_auto_sync() AS operation_id`);
    syncOperationId = result.operation_id;
    
    console.log(`Started auto-sync operation with ID: ${syncOperationId}`);
    
    // Execute the callback within this context
    return await callback();
  } finally {
    // End the auto-sync operation if it was started
    if (syncOperationId) {
      await db.execute(sql`SELECT end_auto_sync(${syncOperationId})`);
      console.log(`Ended auto-sync operation with ID: ${syncOperationId}`);
    }
  }
}

async function isClickProtectionEnabled() {
  try {
    const [result] = await db.execute(sql`SELECT click_protection_enabled() AS enabled`);
    return result?.enabled === true;
  } catch (error) {
    console.log('Error checking if click protection is enabled:', error);
    return false;
  }
}

/**
 * Run the test script
 */
async function testClickProtection() {
  try {
    console.log('Starting Click Protection Test');

    // First check if click protection is enabled
    const protectionEnabled = await isClickProtectionEnabled();
    console.log(`Click protection is ${protectionEnabled ? 'enabled' : 'disabled'}`);

    if (!protectionEnabled) {
      console.log('Enabling click protection for test...');
      await db.execute(sql`
        INSERT INTO protection_settings (key, value)
        VALUES ('click_protection_enabled', TRUE)
        ON CONFLICT (key) DO UPDATE SET value = TRUE
      `);
      console.log('Click protection enabled');
    }

    // Test 1: Manual update (should succeed)
    console.log('\nTest 1: Manual update (should succeed)');
    try {
      // Get a test URL to update
      const [testUrl] = await db.execute(sql`
        SELECT id, name, clicks, click_limit 
        FROM urls 
        LIMIT 1
      `);

      if (!testUrl) {
        console.log('No URLs found for testing. Creating a test URL...');
        await db.execute(sql`
          INSERT INTO urls (name, url, campaign_id, clicks, click_limit)
          VALUES ('Test URL', 'https://example.com', 1, 0, 100)
        `);
        
        const [newUrl] = await db.execute(sql`
          SELECT id, name, clicks, click_limit 
          FROM urls 
          ORDER BY id DESC
          LIMIT 1
        `);
        
        console.log(`Created test URL: ${newUrl.name} (ID: ${newUrl.id})`);
        console.log(`  - Current clicks: ${newUrl.clicks}`);
        console.log(`  - Click limit: ${newUrl.click_limit}`);
        
        // Update the click value manually
        const newClickLimit = newUrl.click_limit + 50;
        await db.execute(sql`
          UPDATE urls
          SET click_limit = ${newClickLimit}
          WHERE id = ${newUrl.id}
        `);
        
        // Check if the update was successful
        const [updatedUrl] = await db.execute(sql`
          SELECT id, name, clicks, click_limit 
          FROM urls 
          WHERE id = ${newUrl.id}
        `);
        
        console.log(`Updated URL: ${updatedUrl.name} (ID: ${updatedUrl.id})`);
        console.log(`  - New click limit: ${updatedUrl.click_limit}`);
        
        if (updatedUrl.click_limit === newClickLimit) {
          console.log('✅ Manual update succeeded as expected');
        } else {
          console.log('❌ Manual update failed - value not updated');
        }
      } else {
        console.log(`Found test URL: ${testUrl.name} (ID: ${testUrl.id})`);
        console.log(`  - Current clicks: ${testUrl.clicks}`);
        console.log(`  - Click limit: ${testUrl.click_limit}`);
        
        // Update the click value manually
        const newClickLimit = testUrl.click_limit + 50;
        await db.execute(sql`
          UPDATE urls
          SET click_limit = ${newClickLimit}
          WHERE id = ${testUrl.id}
        `);
        
        // Check if the update was successful
        const [updatedUrl] = await db.execute(sql`
          SELECT id, name, clicks, click_limit 
          FROM urls 
          WHERE id = ${testUrl.id}
        `);
        
        console.log(`Updated URL: ${updatedUrl.name} (ID: ${updatedUrl.id})`);
        console.log(`  - New click limit: ${updatedUrl.click_limit}`);
        
        if (updatedUrl.click_limit === newClickLimit) {
          console.log('✅ Manual update succeeded as expected');
        } else {
          console.log('❌ Manual update failed - value not updated');
        }
      }
    } catch (error) {
      console.error('Error in Test 1:', error);
    }

    // Test 2: Automatic update (should be blocked)
    console.log('\nTest 2: Automatic update (should be blocked)');
    try {
      // Get a test URL to update
      const [testUrl] = await db.execute(sql`
        SELECT id, name, clicks, click_limit 
        FROM urls 
        LIMIT 1
      `);

      if (!testUrl) {
        console.log('No URLs found for testing. Skipping Test 2.');
      } else {
        console.log(`Found test URL: ${testUrl.name} (ID: ${testUrl.id})`);
        console.log(`  - Current clicks: ${testUrl.clicks}`);
        console.log(`  - Click limit: ${testUrl.click_limit}`);
        
        // Try to update the click value automatically (within auto-sync context)
        const newClickLimit = testUrl.click_limit + 1000000;
        
        console.log(`Attempting to auto-update click limit to ${newClickLimit} (should be blocked)...`);
        
        await withAutoSyncContext(async () => {
          await db.execute(sql`
            UPDATE urls
            SET click_limit = ${newClickLimit}
            WHERE id = ${testUrl.id}
          `);
        });
        
        // Check if the update was blocked
        const [updatedUrl] = await db.execute(sql`
          SELECT id, name, clicks, click_limit 
          FROM urls 
          WHERE id = ${testUrl.id}
        `);
        
        console.log(`URL after attempted auto-update: ${updatedUrl.name} (ID: ${updatedUrl.id})`);
        console.log(`  - Click limit after auto-update attempt: ${updatedUrl.click_limit}`);
        
        if (updatedUrl.click_limit !== newClickLimit) {
          console.log('✅ Automatic update was blocked as expected');
        } else {
          console.log('❌ Automatic update succeeded when it should have been blocked');
        }
      }
    } catch (error) {
      console.error('Error in Test 2:', error);
    }

    console.log('\nClick Protection Test completed');
  } catch (error) {
    console.error('Error running test:', error);
  } finally {
    process.exit(0);
  }
}

// Run the test
testClickProtection();
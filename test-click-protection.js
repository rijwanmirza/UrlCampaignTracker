/**
 * Test Click Protection System
 * 
 * This script tests whether the click protection is working
 * by attempting to update click values in different ways.
 */

import { db } from './server/db.ts';
import { sql } from 'drizzle-orm';
import { withAutoSyncContext } from './server/utils/sync-context.js';

async function testClickProtection() {
  console.log('===== TESTING CLICK PROTECTION SYSTEM =====');
  
  try {
    // Get a sample URL for testing
    const [sampleUrl] = await db.execute(sql`SELECT id, click_limit, clicks FROM urls LIMIT 1`);
    
    if (!sampleUrl) {
      console.error('No URLs found for testing');
      return;
    }
    
    console.log('Sample URL before test:', sampleUrl);
    
    // TEST 1: Direct update (should succeed, not in auto-sync context)
    console.log('\n🔍 TEST 1: Manual update (should succeed)');
    const testValue1 = 123456;
    await db.execute(sql`
      UPDATE urls 
      SET click_limit = ${testValue1}
      WHERE id = ${sampleUrl.id}
    `);
    
    const [afterManual] = await db.execute(sql`
      SELECT id, click_limit, clicks FROM urls WHERE id = ${sampleUrl.id}
    `);
    
    console.log('After manual update:', afterManual);
    console.log('Manual update succeeded?', afterManual.click_limit === testValue1);
    
    // TEST 2: Update in auto-sync context (should be blocked)
    console.log('\n🔍 TEST 2: Automatic update (should be blocked)');
    const testValue2 = 999999;
    
    await withAutoSyncContext(async () => {
      await db.execute(sql`
        UPDATE urls 
        SET click_limit = ${testValue2}
        WHERE id = ${sampleUrl.id}
      `);
    });
    
    const [afterAuto] = await db.execute(sql`
      SELECT id, click_limit, clicks FROM urls WHERE id = ${sampleUrl.id}
    `);
    
    console.log('After automatic update attempt:', afterAuto);
    console.log('Protection worked?', afterAuto.click_limit !== testValue2);
    
    // Restore original value
    await db.execute(sql`
      UPDATE urls 
      SET click_limit = ${sampleUrl.click_limit}
      WHERE id = ${sampleUrl.id}
    `);
    
    console.log('\n✅ Protection Test Results:');
    console.log('Manual updates: ' + (afterManual.click_limit === testValue1 ? 'ALLOWED ✓' : 'BLOCKED ✗'));
    console.log('Automatic updates: ' + (afterAuto.click_limit !== testValue2 ? 'BLOCKED ✓' : 'ALLOWED ✗'));
    
    if (afterManual.click_limit === testValue1 && afterAuto.click_limit !== testValue2) {
      console.log('\n🎉 CLICK PROTECTION SYSTEM IS WORKING CORRECTLY!');
      console.log('Only manual updates are allowed, automatic updates are blocked.');
    } else {
      console.log('\n⚠️ CLICK PROTECTION SYSTEM IS NOT WORKING AS EXPECTED!');
      console.log('Check the database triggers and sync context implementation.');
    }
    
  } catch (error) {
    console.error('Error testing click protection:', error);
  }
}

// Run the test
testClickProtection();
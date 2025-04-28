import { db } from './db';
import { sql } from 'drizzle-orm';

/**
 * This script fixes the mismatch between original_url_records and urls tables
 * for the originalClickLimit values
 */
async function fixUrlValues() {
  try {
    console.log('Starting fix for original click limit values...');
    
    // Step 1: Get the value from original_url_records
    const originalRecordResult = await db.execute(sql`
      SELECT id, name, original_click_limit
      FROM original_url_records
      WHERE name = '63712293'
    `);
    
    if (originalRecordResult.length === 0 || !originalRecordResult[0]) {
      console.error('Original record not found!');
      return;
    }
    
    const originalRecord = originalRecordResult[0];
    console.log(`Found original record: ${JSON.stringify(originalRecord)}`);
    const originalClickLimit = originalRecord.original_click_limit;
    
    // Step 2: Update the urls table with the correct value
    console.log(`Updating URLs with name '63712293' to have original_click_limit = ${originalClickLimit}`);
    const updateResult = await db.execute(sql`
      UPDATE urls
      SET original_click_limit = ${originalClickLimit}
      WHERE name = '63712293'
    `);
    
    console.log(`Update result: ${JSON.stringify(updateResult)}`);
    
    // Step 3: Verify the update
    const verifyResult = await db.execute(sql`
      SELECT id, name, original_click_limit, click_limit
      FROM urls
      WHERE name = '63712293'
    `);
    
    if (verifyResult.length === 0 || !verifyResult[0]) {
      console.error('URL not found after update!');
      return;
    }
    
    const updatedUrl = verifyResult[0];
    console.log(`Updated URL values: ${JSON.stringify(updatedUrl)}`);
    
    if (updatedUrl.original_click_limit === originalClickLimit) {
      console.log('✅ Fix successful! Values now match.');
    } else {
      console.error(`❌ Fix failed! Value is still ${updatedUrl.original_click_limit} instead of ${originalClickLimit}`);
    }
  } catch (error) {
    console.error('Error fixing URL values:', error);
  }
}

// Run the fix
fixUrlValues().catch(error => {
  console.error('Unhandled error:', error);
});
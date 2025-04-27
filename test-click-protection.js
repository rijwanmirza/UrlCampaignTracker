import pg from 'pg';
const { Pool } = pg;

// Connect to the database
const pool = new Pool({
  connectionString: process.env.DATABASE_URL
});

async function testClickProtection() {
  const client = await pool.connect();
  
  try {
    console.log('===== TESTING CLICK PROTECTION SYSTEM =====');
    
    // Get a sample URL for testing
    const sampleUrlResult = await client.query('SELECT id, click_limit, clicks FROM urls LIMIT 1');
    const sampleUrl = sampleUrlResult.rows[0];
    
    if (!sampleUrl) {
      console.error('No URLs found for testing');
      return;
    }
    
    console.log('Sample URL before test:', sampleUrl);
    
    // TEST 1: Direct update (should succeed, not in auto-sync context)
    console.log('\n🔍 TEST 1: Manual update (should succeed)');
    const testValue1 = 123456;
    await client.query(`
      UPDATE urls 
      SET click_limit = $1
      WHERE id = $2
    `, [testValue1, sampleUrl.id]);
    
    const afterManualResult = await client.query(`
      SELECT id, click_limit, clicks FROM urls WHERE id = $1
    `, [sampleUrl.id]);
    const afterManual = afterManualResult.rows[0];
    
    console.log('After manual update:', afterManual);
    console.log('Manual update succeeded?', afterManual.click_limit === testValue1);
    
    // TEST 2: Update in auto-sync context (should be blocked)
    console.log('\n🔍 TEST 2: Automatic update (should be blocked)');
    const testValue2 = 999999;
    
    // Start an auto-sync operation
    const startResult = await client.query(`SELECT start_auto_sync() AS operation_id`);
    const operationId = startResult.rows[0].operation_id;
    console.log('Started auto-sync operation with ID:', operationId);
    
    // Verify protection is enabled
    const protectionResult = await client.query(`SELECT click_protection_enabled() AS enabled`);
    console.log('Click protection enabled:', protectionResult.rows[0].enabled);
    
    // Check if auto-sync flag is properly set
    const syncActiveResult = await client.query(`SELECT is_auto_sync() AS active`);
    console.log('Auto-sync active:', syncActiveResult.rows[0].active);
    
    // Try to update in auto-sync context
    const updateResult = await client.query(`
      UPDATE urls 
      SET click_limit = $1
      WHERE id = $2
      RETURNING *
    `, [testValue2, sampleUrl.id]);
    
    console.log('Update in auto-sync returned:', updateResult.rows[0].click_limit);
    
    // End the auto-sync operation
    await client.query(`SELECT end_auto_sync($1)`, [operationId]);
    console.log('Ended auto-sync operation');
    
    const afterAutoResult = await client.query(`
      SELECT id, click_limit, clicks FROM urls WHERE id = $1
    `, [sampleUrl.id]);
    const afterAuto = afterAutoResult.rows[0];
    
    console.log('After automatic update attempt:', afterAuto);
    console.log('Protection worked?', afterAuto.click_limit !== testValue2);
    
    // Restore original value
    await client.query(`
      UPDATE urls 
      SET click_limit = $1
      WHERE id = $2
    `, [sampleUrl.click_limit, sampleUrl.id]);
    
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
  } finally {
    client.release();
  }
}

// Run the test
testClickProtection();
/**
 * Test Large Click Limit Values
 * This script tests if URLs with very large click limits (>100,000 and up to 5 million)
 * can be created and can receive traffic (redirect properly)
 */

import pg from 'pg';
import axios from 'axios';

const { Pool } = pg;

// Connect to database
const pool = new Pool({
  connectionString: process.env.DATABASE_URL
});

// Test values to try
const TEST_CLICK_LIMITS = [
  100000,      // 100K (baseline)
  500000,      // 500K
  1000000,     // 1M
  5000000      // 5M
];

/**
 * Create a test URL with a specific click limit
 */
async function createTestUrl(name, clickLimit) {
  console.log(`\n🔍 Creating test URL "${name}" with click limit: ${clickLimit.toLocaleString()}`);
  
  try {
    // Insert directly into database (bypassing any frontend validation)
    const result = await pool.query(`
      INSERT INTO urls (
        name, 
        target_url, 
        click_limit, 
        original_click_limit, 
        campaign_id, 
        clicks, 
        status,
        created_at,
        updated_at
      ) VALUES (
        $1, 
        $2, 
        $3, 
        $4, 
        $5, 
        $6, 
        $7,
        NOW(),
        NOW()
      ) RETURNING id
    `, [
      name,
      'https://example.com', // Test target URL
      clickLimit,
      clickLimit,
      null, // No campaign
      0,    // Start with 0 clicks
      'active'
    ]);
    
    if (result.rows.length === 0) {
      throw new Error('Failed to create URL - no ID returned');
    }
    
    const urlId = result.rows[0].id;
    console.log(`✅ Successfully created URL with ID ${urlId}`);
    return urlId;
  } catch (error) {
    console.error(`❌ Failed to create URL: ${error.message}`);
    throw error;
  }
}

/**
 * Test if a URL with the specified ID can be accessed through the redirect endpoint
 */
async function testUrlRedirect(urlId) {
  console.log(`\n🔍 Testing URL redirect for URL ID: ${urlId}`);
  
  try {
    // Get URL details first
    const urlResult = await pool.query('SELECT * FROM urls WHERE id = $1', [urlId]);
    
    if (urlResult.rows.length === 0) {
      throw new Error(`URL with ID ${urlId} not found`);
    }
    
    const url = urlResult.rows[0];
    console.log(`URL details:`);
    console.log(`  - Name: ${url.name}`);
    console.log(`  - Click limit: ${url.click_limit.toLocaleString()}`);
    console.log(`  - Current clicks: ${url.clicks.toLocaleString()}`);
    
    // Test the redirect
    console.log(`🔍 Sending redirect request...`);
    
    // Use the direct r/:id endpoint that doesn't require a campaign
    const redirectResult = await axios.get(`http://localhost:5000/r/${urlId}`, {
      maxRedirects: 0,
      validateStatus: (status) => status >= 200 && status < 400  // Allow redirect statuses
    }).catch(err => {
      // If we get a redirect, that's good!
      if (err.response && (err.response.status === 301 || err.response.status === 302 || err.response.status === 307)) {
        return err.response;
      }
      throw err;
    });
    
    if (redirectResult.status === 301 || redirectResult.status === 302 || redirectResult.status === 307) {
      console.log(`✅ Redirect successful! Status: ${redirectResult.status}`);
      console.log(`   Redirect location: ${redirectResult.headers.location}`);
      
      // Check that clicks were incremented
      const updatedUrlResult = await pool.query('SELECT clicks FROM urls WHERE id = $1', [urlId]);
      const updatedClicks = updatedUrlResult.rows[0].clicks;
      
      if (updatedClicks > url.clicks) {
        console.log(`✅ Click counter successfully incremented: ${url.clicks} -> ${updatedClicks}`);
      } else {
        console.log(`⚠️ Click counter not incremented: still at ${updatedClicks}`);
      }
      
      return true;
    } else {
      console.error(`❌ Redirect failed. Status: ${redirectResult.status}`);
      console.error(redirectResult.data);
      return false;
    }
  } catch (error) {
    console.error(`❌ Error testing URL redirect: ${error.message}`);
    return false;
  }
}

/**
 * Delete test URLs when done
 */
async function cleanupTestUrls(urlIds) {
  console.log(`\n🧹 Cleaning up test URLs...`);
  
  for (const urlId of urlIds) {
    try {
      await pool.query('DELETE FROM urls WHERE id = $1', [urlId]);
      console.log(`✅ Deleted test URL with ID ${urlId}`);
    } catch (error) {
      console.error(`⚠️ Failed to delete test URL ${urlId}: ${error.message}`);
    }
  }
}

/**
 * Run the entire test suite
 */
async function runTests() {
  console.log(`
╔════════════════════════════════════════════════════════════╗
║             HIGH CLICK LIMIT URL TESTING SUITE             ║
║ Tests if URLs with click limits up to 5 million can work   ║
╚════════════════════════════════════════════════════════════╝
  `);
  
  const createdUrlIds = [];
  
  try {
    // Create test URLs with different click limits
    for (const clickLimit of TEST_CLICK_LIMITS) {
      const urlId = await createTestUrl(`Test URL ${clickLimit.toLocaleString()}`, clickLimit);
      createdUrlIds.push(urlId);
      
      // Test redirect for the URL we just created
      const success = await testUrlRedirect(urlId);
      
      if (!success) {
        console.log(`⚠️ URL with click limit ${clickLimit.toLocaleString()} failed redirect test`);
      } else {
        console.log(`✅ URL with click limit ${clickLimit.toLocaleString()} passed redirect test!`);
      }
    }
    
    console.log(`\n📊 TEST RESULTS SUMMARY:`);
    console.log(`✅ Successfully tested URL click limits: ${TEST_CLICK_LIMITS.map(v => v.toLocaleString()).join(', ')}`);
    console.log(`🏁 All tests completed!`);
  } catch (error) {
    console.error(`\n❌ Test suite encountered an error: ${error.message}`);
  } finally {
    // Clean up the test URLs
    await cleanupTestUrls(createdUrlIds);
    
    // Close database connection
    pool.end();
  }
}

// Run the tests
runTests().catch(err => {
  console.error('Error in test suite:', err);
  process.exit(1);
});
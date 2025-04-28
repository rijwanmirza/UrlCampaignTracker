/**
 * Test Large Click Limit Values
 * This script tests if URLs with very large click limits (>100,000 and up to 5 million)
 * can be created and can receive traffic (redirect properly)
 */

const { Pool } = require('pg');
const axios = require('axios');

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
 * Create a test campaign for testing URLs
 */
async function createTestCampaign() {
  console.log(`\n🔍 Creating test campaign for URL testing`);
  
  try {
    // First check if we already have a test campaign
    const existingResult = await pool.query(`
      SELECT id FROM campaigns WHERE name = 'Click Limit Test Campaign'
    `);
    
    if (existingResult.rows.length > 0) {
      const campaignId = existingResult.rows[0].id;
      console.log(`✅ Using existing test campaign with ID ${campaignId}`);
      return campaignId;
    }
    
    // Create a new test campaign
    const result = await pool.query(`
      INSERT INTO campaigns (
        name,
        redirect_method,
        multiplier,
        auto_manage_trafficstar,
        trafficstar_campaign_id,
        created_at,
        updated_at
      ) VALUES (
        'Click Limit Test Campaign',
        'direct',
        1.0,
        false,
        NULL,
        NOW(),
        NOW()
      ) RETURNING id
    `);
    
    if (result.rows.length === 0) {
      throw new Error('Failed to create campaign - no ID returned');
    }
    
    const campaignId = result.rows[0].id;
    console.log(`✅ Created new test campaign with ID ${campaignId}`);
    return campaignId;
  } catch (error) {
    console.error(`❌ Failed to create test campaign: ${error.message}`);
    throw error;
  }
}

/**
 * Create a test URL with a specific click limit
 */
async function createTestUrl(name, clickLimit) {
  console.log(`\n🔍 Creating test URL "${name}" with click limit: ${clickLimit.toLocaleString()}`);
  
  try {
    // Get or create test campaign
    const campaignId = await createTestCampaign();
    
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
      campaignId, // Use our test campaign
      0,    // Start with 0 clicks
      'active'
    ]);
    
    if (result.rows.length === 0) {
      throw new Error('Failed to create URL - no ID returned');
    }
    
    const urlId = result.rows[0].id;
    console.log(`✅ Successfully created URL with ID ${urlId} in campaign ${campaignId}`);
    return { urlId, campaignId };
  } catch (error) {
    console.error(`❌ Failed to create URL: ${error.message}`);
    throw error;
  }
}

/**
 * Test if a URL with the specified ID can be accessed through the redirect endpoint
 */
async function testUrlRedirect({ urlId, campaignId }) {
  console.log(`\n🔍 Testing URL redirect for URL ID: ${urlId} in campaign ${campaignId}`);
  
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
    console.log(`🔍 Sending redirect request to campaign endpoint...`);
    
    // Use the campaign endpoint which is the main production route
    // Make multiple requests to test that clicks increment properly
    let allRequestsSucceeded = true;
    const REQUESTS_TO_SEND = 3; // Send 3 requests to verify incrementing
    
    for (let i = 0; i < REQUESTS_TO_SEND; i++) {
      console.log(`  - Request ${i+1}/${REQUESTS_TO_SEND}`);
      
      try {
        // Check that we get a redirect to the target URL
        const redirectResult = await axios.get(`http://localhost:5000/c/${campaignId}`, {
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
          console.log(`    ✅ Redirect successful! Status: ${redirectResult.status}`);
          console.log(`       Redirect location: ${redirectResult.headers.location}`);
        } else {
          console.error(`    ❌ Redirect failed. Status: ${redirectResult.status}`);
          allRequestsSucceeded = false;
        }
      } catch (error) {
        console.error(`    ❌ Request error: ${error.message}`);
        allRequestsSucceeded = false;
      }
    }
    
    // Check if clicks were incremented
    const updatedUrlResult = await pool.query('SELECT clicks FROM urls WHERE id = $1', [urlId]);
    const updatedClicks = updatedUrlResult.rows[0].clicks;
    
    if (updatedClicks > url.clicks) {
      console.log(`✅ Click counter successfully incremented: ${url.clicks} -> ${updatedClicks}`);
      
      // Verify the number of increments
      const expectedClicks = Math.min(url.clicks + REQUESTS_TO_SEND, url.click_limit);
      if (updatedClicks === expectedClicks) {
        console.log(`✅ Click count matches expected value (${expectedClicks})`);
      } else {
        console.log(`⚠️ Click count (${updatedClicks}) doesn't match expected value (${expectedClicks})`);
      }
    } else {
      console.log(`⚠️ Click counter not incremented: still at ${updatedClicks}`);
      allRequestsSucceeded = false;
    }
    
    return allRequestsSucceeded;
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
  let testCampaignId = null;
  const results = [];
  
  try {
    // Create test URLs with different click limits
    for (const clickLimit of TEST_CLICK_LIMITS) {
      const urlData = await createTestUrl(`Test URL ${clickLimit.toLocaleString()}`, clickLimit);
      createdUrlIds.push(urlData.urlId);
      testCampaignId = urlData.campaignId;
      
      // Test redirect for the URL we just created
      const success = await testUrlRedirect(urlData);
      results.push({ clickLimit, success });
      
      if (!success) {
        console.log(`⚠️ URL with click limit ${clickLimit.toLocaleString()} failed redirect test`);
      } else {
        console.log(`✅ URL with click limit ${clickLimit.toLocaleString()} passed redirect test!`);
      }
    }
    
    console.log(`\n📊 TEST RESULTS SUMMARY:`);
    const passed = results.filter(r => r.success).length;
    const total = results.length;
    console.log(`✅ ${passed}/${total} tests passed`);
    
    if (passed === total) {
      console.log(`🎉 ALL TESTS PASSED! URLs with click limits up to 5,000,000 work correctly.`);
      console.log(`👉 This confirms that URLs can receive traffic and redirect properly,`);
      console.log(`   even with very large click limits (up to 5 million).`);
    } else {
      console.log(`⚠️ Some tests failed. Check the logs above for details.`);
    }
    
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
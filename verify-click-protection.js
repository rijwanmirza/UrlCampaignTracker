import axios from 'axios';
const { log } = console;

// Basic test to verify that click limits cannot be updated from URLs directly
async function testClickProtection() {
  try {
    log('Starting click protection verification test...');
    
    // 1. Attempt to update click limit directly - should fail
    const urlId = 5; // ID from the database
    log(`1. Attempting to update URL ID ${urlId} click limit directly...`);
    
    try {
      const updateResponse = await axios.put(`http://localhost:3000/api/urls/${urlId}`, {
        clickLimit: 20000 // Try to update to a new value
      });
      log('❌ FAIL: Was able to update URL click limit directly!');
      log(updateResponse.data);
    } catch (error) {
      if (error.response && error.response.status === 403) {
        log('✅ PASS: Could not update URL click limit directly');
        log(`Error message: ${error.response.data.message}`);
      } else {
        log('❌ UNEXPECTED ERROR:', error.message);
      }
    }
    
    // 2. Fetch current values for reference
    log('\n2. Fetching current campaign and URL information...');
    const campaignResponse = await axios.get('http://localhost:3000/api/campaigns/5');
    const campaign = campaignResponse.data;
    log(`Campaign "${campaign.name}" has ${campaign.urls.length} URLs`);
    
    // Find our test URL
    const testUrl = campaign.urls.find(url => url.id === urlId);
    if (testUrl) {
      log(`URL "${testUrl.name}" has clickLimit: ${testUrl.clickLimit}, originalClickLimit: ${testUrl.originalClickLimit}`);
    } else {
      log(`URL with ID ${urlId} not found in campaign`);
    }
    
    // Display TrafficStar spent info
    log(`\nTrafficStar daily spent: $${campaign.dailySpent} (last checked: ${campaign.lastSpentCheck})`);
    
    log('\nClick protection verification test completed!');
    
  } catch (error) {
    log('❌ Test failed with error:', error.message);
  }
}

testClickProtection();
/**
 * Manual testing script for TrafficStar campaign management
 * This script simulates various scenarios to test campaign management
 */

// Import necessary modules
import { trafficStarService } from './trafficstar-service.js';
import { db } from './db.js';
import { eq } from 'drizzle-orm';
import { campaigns, urls, trafficstarCampaigns } from '../shared/schema.js';

/**
 * Test 1: Date Change Testing
 * Simulates a date change to see if it pauses the campaign
 */
async function testDateChange() {
  try {
    console.log('🧪 TEST 1: Date Change Testing');
    
    // Get a campaign with auto-management enabled
    const [campaign] = await db
      .select()
      .from(campaigns)
      .where(eq(campaigns.autoManageTrafficstar, true));
    
    if (!campaign) {
      console.log('❌ No auto-managed campaign found for testing');
      return;
    }
    
    console.log(`Found campaign ${campaign.id} for testing`);
    
    // Update lastTrafficstarSync to yesterday to simulate a date change
    const yesterday = new Date();
    yesterday.setDate(yesterday.getDate() - 1);
    
    await db.update(campaigns)
      .set({
        lastTrafficstarSync: yesterday,
        updatedAt: new Date()
      })
      .where(eq(campaigns.id, campaign.id));
    
    console.log(`Updated campaign ${campaign.id} lastTrafficstarSync to yesterday: ${yesterday.toISOString()}`);
    
    // Trigger auto-management
    console.log('Triggering auto-management to test date change behavior...');
    await trafficStarService.autoManageCampaigns();
    
    console.log('✅ Date change test completed - check logs for results');
  } catch (error) {
    console.error('Error in date change test:', error);
  }
}

/**
 * Test 2: Click Threshold Testing
 * Tests if campaigns with less than 5000 clicks are paused
 * and if campaigns with more than 15000 clicks are activated
 */
async function testClickThreshold() {
  try {
    console.log('🧪 TEST 2: Click Threshold Testing');
    
    // Get a campaign with auto-management enabled
    const [campaign] = await db
      .select()
      .from(campaigns)
      .where(eq(campaigns.autoManageTrafficstar, true));
    
    if (!campaign) {
      console.log('❌ No auto-managed campaign found for testing');
      return;
    }
    
    console.log(`Found campaign ${campaign.id} for testing`);
    
    // Get existing URLs for the campaign
    const existingUrls = await db
      .select()
      .from(urls)
      .where(eq(urls.campaignId, campaign.id));
    
    console.log(`Campaign has ${existingUrls.length} URLs`);
    
    // Create test URLs with different click scenarios
    if (existingUrls.length === 0) {
      // Test scenario 1: Less than 5000 clicks remaining
      await db.insert(urls).values({
        campaignId: campaign.id,
        name: 'Test URL 1 - Below Threshold',
        targetUrl: 'https://example.com/test1',
        clickLimit: 4000,
        clicks: 0,
        status: 'active',
        originalClickLimit: 4000,
        createdAt: new Date(),
        updatedAt: new Date()
      });
      
      console.log('Created test URL with 4000 clicks remaining (below 5000 threshold)');
    } else {
      // Update existing URLs for testing
      await db.update(urls)
        .set({
          clickLimit: 4000,
          clicks: 0,
          status: 'active',
          updatedAt: new Date()
        })
        .where(eq(urls.campaignId, campaign.id));
        
      console.log('Updated existing URLs to have 4000 clicks remaining (below 5000 threshold)');
    }
    
    // Trigger auto-management
    console.log('Triggering auto-management to test pause due to low clicks...');
    await trafficStarService.autoManageCampaigns();
    
    // Now test the scenario with more than 15000 clicks
    await db.update(urls)
      .set({
        clickLimit: 20000,
        clicks: 0,
        status: 'active',
        updatedAt: new Date()
      })
      .where(eq(urls.campaignId, campaign.id));
      
    console.log('Updated URLs to have 20000 clicks remaining (above 15000 threshold)');
    
    // Trigger auto-management again
    console.log('Triggering auto-management to test activation due to high clicks...');
    await trafficStarService.autoManageCampaigns();
    
    console.log('✅ Click threshold test completed - check logs for results');
  } catch (error) {
    console.error('Error in click threshold test:', error);
  }
}

/**
 * Test 3: Spent Value Testing
 * Tests if campaigns are paused when spent value exceeds $10
 * and if they're rechecked after 10 minutes
 */
async function testSpentValue() {
  try {
    console.log('🧪 TEST 3: Spent Value Testing');
    
    // Enable test mode to get simulated spent value
    process.env.TEST_MODE = 'true';
    
    // Get a campaign with auto-management enabled
    const [campaign] = await db
      .select()
      .from(campaigns)
      .where(eq(campaigns.autoManageTrafficstar, true));
    
    if (!campaign) {
      console.log('❌ No auto-managed campaign found for testing');
      return;
    }
    
    console.log(`Found campaign ${campaign.id} for testing`);
    
    // Make the campaign active in TrafficStar
    if (campaign.trafficstarCampaignId) {
      const trafficstarId = Number(campaign.trafficstarCampaignId);
      
      await db.update(trafficstarCampaigns)
        .set({
          active: true,
          status: 'enabled',
          updatedAt: new Date()
        })
        .where(eq(trafficstarCampaigns.trafficstarId, trafficstarId.toString()));
      
      console.log(`Set TrafficStar campaign ${trafficstarId} as active for testing`);
    }
    
    // Run spent value check (in test mode, should report >$10 and pause)
    console.log('Running spent value check to test pause due to high spent value...');
    await trafficStarService.checkCampaignsSpentValue();
    
    // Check if campaign was paused
    if (campaign.trafficstarCampaignId) {
      const trafficstarId = Number(campaign.trafficstarCampaignId);
      const currentUtcDate = new Date().toISOString().split('T')[0];
      const pauseInfo = trafficStarService.getSpentValuePauseInfo(trafficstarId, currentUtcDate);
      
      if (pauseInfo) {
        console.log(`Campaign was paused due to high spent value`);
        console.log(`Recheck scheduled for: ${pauseInfo.recheckAt.toISOString()}`);
        console.log(`Minutes until recheck: ${Math.ceil((pauseInfo.recheckAt.getTime() - Date.now()) / (60 * 1000))}`);
      } else {
        console.log(`Campaign was NOT paused due to high spent value - test failed`);
      }
    }
    
    // Check that click threshold is disabled after spent value pause
    console.log('Triggering auto-management to verify click threshold is disabled...');
    await trafficStarService.autoManageCampaigns();
    
    // Clean up
    process.env.TEST_MODE = 'false';
    
    console.log('✅ Spent value test completed - check logs for results');
  } catch (error) {
    console.error('Error in spent value test:', error);
  }
}

/**
 * Run all tests
 */
async function runAllTests() {
  console.log('🧪🧪🧪 STARTING TRAFFICSTAR AUTOMATIC MANAGEMENT TESTS 🧪🧪🧪');
  
  await testDateChange();
  console.log('\n');
  
  await testClickThreshold();
  console.log('\n');
  
  await testSpentValue();
  console.log('\n');
  
  console.log('🧪🧪🧪 ALL TESTS COMPLETED 🧪🧪🧪');
}

// Export functions for external use
module.exports = {
  runAllTests,
  testDateChange,
  testClickThreshold,
  testSpentValue
};

// Run tests if script is executed directly
if (require.main === module) {
  runAllTests();
}
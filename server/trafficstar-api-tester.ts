/**
 * TrafficStar API Direct Tester
 * 
 * This script tests essential TrafficStar API functions directly
 * to verify the exact endpoints and parameters that work.
 */

import axios from 'axios';
import { trafficStarService } from './trafficstar-service';
import { db } from './db';
import { trafficstarCredentials } from '../shared/schema';

// Test campaign ID (using our test campaign)
const TEST_CAMPAIGN_ID = 1000866;

/**
 * Main test function to verify all TrafficStar API endpoints
 */
export async function testTrafficStarAPI() {
  console.log(`🧪 TESTING TRAFFICSTAR API ENDPOINTS`);
  console.log(`====================================`);
  console.log(`Testing with campaign ID: ${TEST_CAMPAIGN_ID}`);
  
  // Test each function
  await testAuth();
  await testGetStatus();
  await testActivateCampaign();
  await testPauseCampaign();
  await testUpdateEndTime();
  await testGetSpentValue();
  
  console.log(`====================================`);
  console.log(`🧪 TRAFFICSTAR API TESTING COMPLETE`);
}

/**
 * Test authentication and token retrieval
 */
async function testAuth() {
  console.log(`\n🔑 TESTING AUTH`);
  
  try {
    // Use the service to get a token
    const token = await trafficStarService.ensureToken();
    
    if (token) {
      console.log(`✅ AUTH SUCCESS: Retrieved token successfully`);
    } else {
      console.log(`❌ AUTH FAILED: Could not get token`);
    }
  } catch (error) {
    console.error(`❌ AUTH ERROR:`, error);
  }
}

/**
 * Test campaign status retrieval
 */
async function testGetStatus() {
  console.log(`\n📊 TESTING GET STATUS`);
  
  try {
    // First test service method
    const status = await trafficStarService.getCampaignStatus(TEST_CAMPAIGN_ID);
    console.log(`Service method result:`, status);
    
    // Now test direct HTTP call to the known good endpoint
    try {
      const token = await trafficStarService.ensureToken();
      
      // Test v1.1 endpoint (known working)
      const url = `https://api.trafficstars.com/v1.1/campaigns/${TEST_CAMPAIGN_ID}`;
      console.log(`Making direct request to: ${url}`);
      
      const response = await axios.get(url, {
        headers: {
          'Authorization': `Bearer ${token}`,
          'Accept': 'application/json'
        }
      });
      
      if (response.status === 200) {
        console.log(`✅ GET STATUS SUCCESS: Direct API call successful`);
        console.log(`Campaign status:`, response.data.active ? 'active' : 'paused');
      } else {
        console.log(`❌ GET STATUS FAILED: Unexpected status code ${response.status}`);
      }
    } catch (error) {
      console.error(`❌ GET STATUS ERROR (direct method):`, error);
    }
  } catch (error) {
    console.error(`❌ GET STATUS ERROR (service method):`, error);
  }
}

/**
 * Test activating a campaign
 */
async function testActivateCampaign() {
  console.log(`\n▶️ TESTING ACTIVATE CAMPAIGN`);
  
  try {
    // First check current status to avoid unnecessary activation
    const currentStatus = await trafficStarService.getCampaignStatus(TEST_CAMPAIGN_ID);
    
    if (currentStatus && currentStatus.active) {
      console.log(`Campaign is already active, skipping activation test`);
      return;
    }
    
    // Set end time to 23:59 UTC today
    const today = new Date();
    const endTime = new Date(today);
    endTime.setUTCHours(23, 59, 0, 0); // 23:59 UTC
    
    // Format date to TrafficStar expected format: YYYY-MM-DD HH:MM:SS
    const formattedEndTime = `${endTime.getUTCFullYear()}-${String(endTime.getUTCMonth() + 1).padStart(2, '0')}-${String(endTime.getUTCDate()).padStart(2, '0')} 23:59:00`;
    
    // Get API token
    const token = await trafficStarService.ensureToken();
    
    // Try different activation approaches
    
    // 1. Test direct PATCH method to v1.1 API
    try {
      const url = `https://api.trafficstars.com/v1.1/campaigns/${TEST_CAMPAIGN_ID}`;
      console.log(`Testing activation via PATCH to ${url}`);
      
      const response = await axios.patch(url, 
        { 
          active: true,
          end_time: formattedEndTime
        },
        { 
          headers: { 
            'Authorization': `Bearer ${token}`,
            'Accept': 'application/json',
            'Content-Type': 'application/json'
          } 
        }
      );
      
      if (response.status === 200 || response.status === 204) {
        console.log(`✅ ACTIVATE SUCCESS: PATCH method worked`);
        
        // Verify activation worked
        const activationSucceeded = await verifyActivation();
        
        if (activationSucceeded) {
          // Call pause to return to original state
          await pauseForTest();
        }
      } else {
        console.log(`❌ ACTIVATE FAILED: PATCH method returned unexpected status ${response.status}`);
      }
    } catch (error) {
      console.error(`❌ ACTIVATE ERROR (PATCH method):`, error);
      
      // 2. Test service method
      try {
        console.log(`Testing activation via service method`);
        await trafficStarService.activateCampaign(TEST_CAMPAIGN_ID);
        
        // Verify activation worked
        const success = await verifyActivation();
        
        if (success) {
          console.log(`✅ ACTIVATE SUCCESS: Service method worked`);
          
          // Call pause to return to original state  
          await pauseForTest();
        } else {
          console.log(`❌ ACTIVATE FAILED: Service method did not activate campaign`);
        }
      } catch (error) {
        console.error(`❌ ACTIVATE ERROR (service method):`, error);
        
        // 3. Test PUT method
        try {
          const url = `https://api.trafficstars.com/v1.1/campaigns/${TEST_CAMPAIGN_ID}`;
          console.log(`Testing activation via PUT to ${url}`);
          
          const response = await axios.put(url, 
            { 
              active: true,
              end_time: formattedEndTime
            },
            { 
              headers: { 
                'Authorization': `Bearer ${token}`,
                'Accept': 'application/json',
                'Content-Type': 'application/json'
              } 
            }
          );
          
          if (response.status === 200 || response.status === 204) {
            console.log(`✅ ACTIVATE SUCCESS: PUT method worked`);
            
            // Verify activation worked
            await verifyActivation();
            
            // Call pause to return to original state
            await pauseForTest();
          } else {
            console.log(`❌ ACTIVATE FAILED: PUT method returned unexpected status ${response.status}`);
          }
        } catch (error) {
          console.error(`❌ ACTIVATE ERROR (PUT method):`, error);
          
          // 4. Test POST to activate endpoint
          try {
            const url = `https://api.trafficstars.com/v1.1/campaigns/${TEST_CAMPAIGN_ID}/activate`;
            console.log(`Testing activation via POST to ${url}`);
            
            const response = await axios.post(url, 
              {},
              { 
                headers: { 
                  'Authorization': `Bearer ${token}`,
                  'Accept': 'application/json'
                } 
              }
            );
            
            if (response.status === 200 || response.status === 204) {
              console.log(`✅ ACTIVATE SUCCESS: POST to activate endpoint worked`);
              
              // Verify activation worked
              await verifyActivation();
              
              // Call pause to return to original state
              await pauseForTest();
            } else {
              console.log(`❌ ACTIVATE FAILED: POST to activate endpoint returned unexpected status ${response.status}`);
            }
          } catch (error) {
            console.error(`❌ ACTIVATE ERROR (POST to activate endpoint):`, error);
          }
        }
      }
    }
  } catch (error) {
    console.error(`❌ ACTIVATE ERROR (general):`, error);
  }
}

/**
 * Verify a campaign was activated
 */
async function verifyActivation(): Promise<boolean> {
  try {
    // Wait a moment for activation to take effect
    await new Promise(resolve => setTimeout(resolve, 1000));
    
    // Check status
    const status = await trafficStarService.getCampaignStatus(TEST_CAMPAIGN_ID);
    
    if (status && status.active) {
      console.log(`✅ VERIFICATION: Campaign was successfully activated`);
      return true;
    } else {
      console.log(`❌ VERIFICATION: Campaign is still not active`);
      return false;
    }
  } catch (error) {
    console.error(`❌ VERIFICATION ERROR:`, error);
    return false;
  }
}

/**
 * Pause a campaign for testing purposes
 */
async function pauseForTest() {
  try {
    console.log(`Pausing campaign after activation test`);
    await trafficStarService.pauseCampaign(TEST_CAMPAIGN_ID);
    
    // Verify pause worked
    const status = await trafficStarService.getCampaignStatus(TEST_CAMPAIGN_ID);
    if (status && !status.active) {
      console.log(`✅ Successfully paused campaign after test`);
    } else {
      console.log(`❌ Failed to pause campaign after test`);
    }
  } catch (error) {
    console.error(`❌ ERROR pausing campaign after test:`, error);
  }
}

/**
 * Test pausing a campaign
 */
async function testPauseCampaign() {
  console.log(`\n⏸️ TESTING PAUSE CAMPAIGN`);
  
  try {
    // First check current status to decide flow
    const currentStatus = await trafficStarService.getCampaignStatus(TEST_CAMPAIGN_ID);
    
    if (currentStatus && !currentStatus.active) {
      console.log(`Campaign is already paused, activating first for pause test`);
      
      // Activate for test
      await testActivateForPauseTest();
    }
    
    // Test pause directly
    const token = await trafficStarService.ensureToken();
    
    // 1. Test PATCH method
    try {
      const url = `https://api.trafficstars.com/v1.1/campaigns/${TEST_CAMPAIGN_ID}`;
      console.log(`Testing pause via PATCH to ${url}`);
      
      const response = await axios.patch(url, 
        { active: false },
        { 
          headers: { 
            'Authorization': `Bearer ${token}`,
            'Accept': 'application/json',
            'Content-Type': 'application/json'
          } 
        }
      );
      
      if (response.status === 200 || response.status === 204) {
        console.log(`✅ PAUSE SUCCESS: PATCH method worked`);
        
        // Verify pause worked
        const success = await verifyPause();
        if (!success) {
          console.log(`❌ PAUSE VERIFICATION FAILED: Campaign is still active after PATCH method`);
        }
      } else {
        console.log(`❌ PAUSE FAILED: PATCH method returned unexpected status ${response.status}`);
        
        // Try service method
        await testPauseWithService();
      }
    } catch (error) {
      console.error(`❌ PAUSE ERROR (PATCH method):`, error);
      
      // Try service method
      await testPauseWithService();
    }
  } catch (error) {
    console.error(`❌ PAUSE ERROR (general):`, error);
  }
}

/**
 * Test pause with service method
 */
async function testPauseWithService() {
  try {
    console.log(`Testing pause via service method`);
    await trafficStarService.pauseCampaign(TEST_CAMPAIGN_ID);
    
    // Verify pause worked
    const success = await verifyPause();
    if (success) {
      console.log(`✅ PAUSE SUCCESS: Service method worked`);
    } else {
      console.log(`❌ PAUSE VERIFICATION FAILED: Campaign is still active after service method`);
    }
  } catch (error) {
    console.error(`❌ PAUSE ERROR (service method):`, error);
  }
}

/**
 * Activate campaign for pause test
 */
async function testActivateForPauseTest() {
  try {
    // Use direct PATCH since we already know it works from earlier test
    const token = await trafficStarService.ensureToken();
    const url = `https://api.trafficstars.com/v1.1/campaigns/${TEST_CAMPAIGN_ID}`;
    
    // Set end time to 23:59 UTC today
    const today = new Date();
    const endTime = new Date(today);
    endTime.setUTCHours(23, 59, 0, 0); // 23:59 UTC
    
    // Format date to TrafficStar expected format: YYYY-MM-DD HH:MM:SS
    const formattedEndTime = `${endTime.getUTCFullYear()}-${String(endTime.getUTCMonth() + 1).padStart(2, '0')}-${String(endTime.getUTCDate()).padStart(2, '0')} 23:59:00`;
    
    const response = await axios.patch(url, 
      { 
        active: true,
        end_time: formattedEndTime
      },
      { 
        headers: { 
          'Authorization': `Bearer ${token}`,
          'Accept': 'application/json',
          'Content-Type': 'application/json'
        } 
      }
    );
    
    if (response.status === 200 || response.status === 204) {
      console.log(`✅ Successfully activated campaign for pause test`);
      await verifyActivation();
    } else {
      console.log(`❌ Failed to activate campaign for pause test`);
    }
  } catch (error) {
    console.error(`❌ ERROR activating campaign for pause test:`, error);
  }
}

/**
 * Verify a campaign was paused
 */
async function verifyPause(): Promise<boolean> {
  try {
    // Wait a moment for pause to take effect
    await new Promise(resolve => setTimeout(resolve, 1000));
    
    // Check status
    const status = await trafficStarService.getCampaignStatus(TEST_CAMPAIGN_ID);
    
    if (status && !status.active) {
      console.log(`✅ VERIFICATION: Campaign was successfully paused`);
      return true;
    } else {
      console.log(`❌ VERIFICATION: Campaign is still active`);
      return false;
    }
  } catch (error) {
    console.error(`❌ VERIFICATION ERROR:`, error);
    return false;
  }
}

/**
 * Test updating campaign end time
 */
async function testUpdateEndTime() {
  console.log(`\n🕒 TESTING UPDATE END TIME`);
  
  try {
    // Set end time to 23:59 UTC today
    const today = new Date();
    const endTime = new Date(today);
    endTime.setUTCHours(23, 59, 0, 0); // 23:59 UTC
    
    // Format date to TrafficStar expected format: YYYY-MM-DD HH:MM:SS
    const formattedEndTime = `${endTime.getUTCFullYear()}-${String(endTime.getUTCMonth() + 1).padStart(2, '0')}-${String(endTime.getUTCDate()).padStart(2, '0')} 23:59:00`;
    
    console.log(`Setting end time to: ${formattedEndTime}`);
    
    // 1. Test service method
    try {
      console.log(`Testing end time update via service method`);
      await trafficStarService.updateCampaignEndTime(TEST_CAMPAIGN_ID, formattedEndTime);
      
      // If we got here without an error, it was successful
      console.log(`✅ UPDATE END TIME SUCCESS: Service method worked`);
    } catch (error) {
      console.error(`❌ UPDATE END TIME ERROR (service method):`, error);
      
      // Try direct method
      await testUpdateEndTimeDirectly(formattedEndTime);
    }
  } catch (error) {
    console.error(`❌ UPDATE END TIME ERROR (general):`, error);
  }
}

/**
 * Test updating end time directly
 */
async function testUpdateEndTimeDirectly(formattedEndTime: string) {
  try {
    const token = await trafficStarService.ensureToken();
    const url = `https://api.trafficstars.com/v1.1/campaigns/${TEST_CAMPAIGN_ID}`;
    
    console.log(`Testing end time update via PATCH to ${url}`);
    
    const response = await axios.patch(url, 
      { end_time: formattedEndTime },
      { 
        headers: { 
          'Authorization': `Bearer ${token}`,
          'Accept': 'application/json',
          'Content-Type': 'application/json'
        } 
      }
    );
    
    if (response.status === 200 || response.status === 204) {
      console.log(`✅ UPDATE END TIME SUCCESS: Direct PATCH method worked`);
    } else {
      console.log(`❌ UPDATE END TIME FAILED: Direct PATCH method returned unexpected status ${response.status}`);
    }
  } catch (error) {
    console.error(`❌ UPDATE END TIME ERROR (direct method):`, error);
  }
}

/**
 * Test getting campaign spent value
 */
async function testGetSpentValue() {
  console.log(`\n💰 TESTING GET SPENT VALUE`);
  
  try {
    // Get today's date in YYYY-MM-DD format
    const today = new Date();
    const formattedDate = today.toISOString().split('T')[0];
    
    // 1. Test service method
    try {
      console.log(`Testing get spent value via service method for date ${formattedDate}`);
      const spentValue = await trafficStarService.getCampaignSpentValue(TEST_CAMPAIGN_ID, formattedDate, formattedDate);
      
      if (spentValue !== null) {
        console.log(`✅ GET SPENT VALUE SUCCESS: Service method returned ${JSON.stringify(spentValue)}`);
      } else {
        console.log(`❌ GET SPENT VALUE FAILED: Service method returned null`);
        
        // Try direct method with known good endpoint
        await testGetSpentValueDirectly(formattedDate);
      }
    } catch (error) {
      console.error(`❌ GET SPENT VALUE ERROR (service method):`, error);
      
      // Try direct method with known good endpoint
      await testGetSpentValueDirectly(formattedDate);
    }
  } catch (error) {
    console.error(`❌ GET SPENT VALUE ERROR (general):`, error);
  }
}

/**
 * Test getting spent value directly
 */
async function testGetSpentValueDirectly(formattedDate: string) {
  try {
    const token = await trafficStarService.ensureToken();
    
    // Try multiple endpoints for spent value
    const endpoints = [
      `https://api.trafficstars.com/v1.1/campaigns/${TEST_CAMPAIGN_ID}/stats`,
      `https://api.trafficstars.com/v1.1/campaigns/${TEST_CAMPAIGN_ID}/spent`
    ];
    
    for (const url of endpoints) {
      try {
        console.log(`Testing get spent value via GET to ${url}`);
        
        const response = await axios.get(url, {
          params: {
            date_from: formattedDate,
            date_to: formattedDate
          },
          headers: { 
            'Authorization': `Bearer ${token}`,
            'Accept': 'application/json'
          }
        });
        
        if (response.status === 200) {
          console.log(`✅ GET SPENT VALUE SUCCESS: Direct method to ${url} worked`);
          console.log(`Response data:`, JSON.stringify(response.data, null, 2));
          break;
        } else {
          console.log(`❌ GET SPENT VALUE FAILED: Direct method to ${url} returned unexpected status ${response.status}`);
        }
      } catch (error) {
        console.error(`❌ GET SPENT VALUE ERROR (${url}):`, error);
      }
    }
  } catch (error) {
    console.error(`❌ GET SPENT VALUE ERROR (direct method):`, error);
  }
}

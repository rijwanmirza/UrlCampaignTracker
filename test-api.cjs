// Simple direct test for TrafficStar API
const https = require('https');
const querystring = require('querystring');

// Campaign ID to test
const campaignId = '995224';

// First, get a token
console.log('Getting token...');

// This uses the API key from the environment
const authData = querystring.stringify({
  grant_type: 'refresh_token',
  refresh_token: process.env.TRAFFICSTAR_API_KEY
});

const authOptions = {
  hostname: 'api.trafficstars.com',
  port: 443,
  path: '/v1/auth/token',
  method: 'POST',
  headers: {
    'Content-Type': 'application/x-www-form-urlencoded',
    'Content-Length': authData.length
  }
};

const authReq = https.request(authOptions, (res) => {
  let data = '';
  
  res.on('data', (chunk) => {
    data += chunk;
  });
  
  res.on('end', () => {
    if (res.statusCode !== 200) {
      console.error('Error getting token:', data);
      return;
    }
    
    try {
      const tokenData = JSON.parse(data);
      const token = tokenData.access_token;
      console.log('Got token! Now testing campaign action...');
      
      // Now try to pause/activate the campaign
      getCampaignStatus(token, campaignId);
    } catch (error) {
      console.error('Error parsing token response:', error);
    }
  });
});

authReq.on('error', (error) => {
  console.error('Error getting token:', error);
});

authReq.write(authData);
authReq.end();

function getCampaignStatus(token, id) {
  const options = {
    hostname: 'api.trafficstars.com',
    port: 443,
    path: `/v1.1/campaigns/${id}`,
    method: 'GET',
    headers: {
      'Authorization': `Bearer ${token}`,
      'Content-Type': 'application/json'
    }
  };
  
  const req = https.request(options, (res) => {
    let data = '';
    
    res.on('data', (chunk) => {
      data += chunk;
    });
    
    res.on('end', () => {
      console.log('Campaign status response code:', res.statusCode);
      console.log('Raw campaign response:', data);
      
      try {
        const responseData = JSON.parse(data);
        console.log('Parsed response:', responseData);
        
        // Check different response formats
        const campaign = responseData.response || responseData.data || responseData;
        console.log('Campaign data:', campaign);
        
        if (!campaign || !campaign.id) {
          console.error('Could not find campaign data in response');
          return;
        }
        
        console.log('Current campaign status:', {
          id: campaign.id,
          name: campaign.name,
          active: campaign.active,
          status: campaign.status,
          paused: campaign.paused
        });
        
        // Now toggle the status
        if (campaign.active) {
          pauseCampaign(token, id);
        } else {
          activateCampaign(token, id);
        }
      } catch (error) {
        console.error('Error parsing campaign status:', error);
      }
    });
  });
  
  req.on('error', (error) => {
    console.error('Error getting campaign status:', error);
  });
  
  req.end();
}

function pauseCampaign(token, id) {
  console.log('Attempting to PAUSE campaign...');
  
  // Try with a different parameter format
  const payload = JSON.stringify({
    is_paused: 1,
    status: 'paused'
  });
  
  const options = {
    hostname: 'api.trafficstars.com',
    port: 443,
    path: `/v1.1/campaigns/${id}`,
    method: 'PATCH',
    headers: {
      'Authorization': `Bearer ${token}`,
      'Content-Type': 'application/json',
      'Content-Length': payload.length
    }
  };
  
  const req = https.request(options, (res) => {
    let data = '';
    
    res.on('data', (chunk) => {
      data += chunk;
    });
    
    res.on('end', () => {
      console.log('Pause response status:', res.statusCode);
      console.log('Pause response:', data);
      
      // Verify the status changed
      setTimeout(() => {
        verifyCampaignStatus(token, id, false);
      }, 2000);
    });
  });
  
  req.on('error', (error) => {
    console.error('Error pausing campaign:', error);
  });
  
  req.write(payload);
  req.end();
}

function activateCampaign(token, id) {
  console.log('Attempting to ACTIVATE campaign...');
  
  // This is the payload we're testing
  const payload = JSON.stringify({
    paused: false
  });
  
  const options = {
    hostname: 'api.trafficstars.com',
    port: 443,
    path: `/v1.1/campaigns/${id}`,
    method: 'PATCH',
    headers: {
      'Authorization': `Bearer ${token}`,
      'Content-Type': 'application/json',
      'Content-Length': payload.length
    }
  };
  
  const req = https.request(options, (res) => {
    let data = '';
    
    res.on('data', (chunk) => {
      data += chunk;
    });
    
    res.on('end', () => {
      console.log('Activate response status:', res.statusCode);
      console.log('Activate response:', data);
      
      // Verify the status changed
      setTimeout(() => {
        verifyCampaignStatus(token, id, true);
      }, 2000);
    });
  });
  
  req.on('error', (error) => {
    console.error('Error activating campaign:', error);
  });
  
  req.write(payload);
  req.end();
}

function verifyCampaignStatus(token, id, expectedActive) {
  const options = {
    hostname: 'api.trafficstars.com',
    port: 443,
    path: `/v1.1/campaigns/${id}`,
    method: 'GET',
    headers: {
      'Authorization': `Bearer ${token}`,
      'Content-Type': 'application/json'
    }
  };
  
  const req = https.request(options, (res) => {
    let data = '';
    
    res.on('data', (chunk) => {
      data += chunk;
    });
    
    res.on('end', () => {
      try {
        const responseData = JSON.parse(data);
        const campaign = responseData.response;
        console.log('Updated campaign status:', {
          id: campaign.id,
          name: campaign.name,
          active: campaign.active,
          status: campaign.status
        });
        
        if (expectedActive === campaign.active) {
          console.log('SUCCESS! Campaign status was changed successfully.');
        } else {
          console.log('FAILURE! Campaign status was not changed as expected.');
        }
      } catch (error) {
        console.error('Error parsing verify status:', error);
      }
    });
  });
  
  req.on('error', (error) => {
    console.error('Error verifying campaign status:', error);
  });
  
  req.end();
}
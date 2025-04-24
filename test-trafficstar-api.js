/**
 * Test script to verify TrafficStar API hosts
 * Run with: node test-trafficstar-api.js
 */
import { execSync } from 'child_process';
import https from 'https';

// List of potential TrafficStar API hosts to test
const hosts = [
  'api.trafficstars.com',
  'app.trafficstars.com',
  'client.trafficstars.com',
  'traffic-stars.com',
  'trafficstars.com',
  'ts-api.com',
  'api.traffic-stars.com'
];

// Get API key from environment
const apiKey = process.env.TRAFFICSTAR_API_KEY;
if (!apiKey) {
  console.error('TRAFFICSTAR_API_KEY environment variable not found');
  process.exit(1);
}

// Test DNS resolution for each host
console.log('Testing DNS resolution...');
hosts.forEach(host => {
  try {
    // Try to ping the host
    console.log(`Testing ${host}...`);
    execSync(`ping -c 1 ${host}`, { stdio: 'ignore' });
    console.log(`✅ ${host} is reachable`);

    // Now try HTTPS connection
    const req = https.request({
      host: host,
      port: 443,
      path: '/',
      method: 'GET'
    }, (res) => {
      console.log(`✅ HTTPS connection to ${host} succeeded with status: ${res.statusCode}`);
    });
    
    req.on('error', (e) => {
      console.error(`❌ HTTPS connection to ${host} failed: ${e.message}`);
    });
    
    req.end();
  } catch (error) {
    console.error(`❌ ${host} is not reachable: ${error.message}`);
  }
});

// Wait a moment for all the HTTPS requests to complete
setTimeout(() => {
  console.log('\nTrying OAuth authentication endpoints on each host...');
  
  hosts.forEach(host => {
    const tokenUrl = `https://${host}/auth/token`;
    console.log(`Testing OAuth endpoint: ${tokenUrl}`);
    
    const curlCommand = `curl -s -o /dev/null -w "%{http_code}" -X POST "${tokenUrl}" \
      -H "Content-Type: application/x-www-form-urlencoded" \
      -d "grant_type=refresh_token&refresh_token=${apiKey}"`;
    
    try {
      const statusCode = execSync(curlCommand, { encoding: 'utf8' });
      console.log(`✅ OAuth token endpoint on ${host} returned status: ${statusCode}`);
    } catch (error) {
      console.error(`❌ Failed to reach OAuth endpoint on ${host}: ${error.message}`);
    }
  });
  
  console.log('\nTesting complete!');
}, 2000);
/**
 * Simple script to test the Traffic Sender service
 */

const trafficSenderUrl = 'http://localhost:5000/api/trafficstar/process-pending-budget-updates';

// Make a request to trigger processing
fetch(trafficSenderUrl)
  .then(response => response.json())
  .then(data => {
    console.log('Traffic Sender processing response:', data);
  })
  .catch(error => {
    console.error('Error testing Traffic Sender:', error);
  });
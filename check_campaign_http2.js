import { spawn } from 'child_process';
import http2 from 'http2';

// URL to check
const url = 'http://localhost:5000/c/19';

console.log(`Checking HTTP/2 capability for: ${url}`);

// Try with Node.js HTTP/2 client
try {
  const client = http2.connect(url);

  client.on('error', (err) => {
    console.error('Error with HTTP/2 connection:', err);
    // Fall back to using curl with HTTP/2
    checkWithCurl();
  });

  client.on('connect', () => {
    console.log('Successfully connected with HTTP/2!');
    const req = client.request({ ':path': '/' });
    
    req.on('response', (headers) => {
      console.log('HTTP/2 Response headers:', headers);
    });
    
    req.on('data', (chunk) => {
      console.log('Data:', chunk.toString());
    });
    
    req.on('end', () => {
      client.close();
    });
    
    req.end();
  });
} catch (err) {
  console.error('Failed to use HTTP/2 client directly:', err);
  checkWithCurl();
}

// Fallback to curl with HTTP/2 enabled
function checkWithCurl() {
  console.log('\nFalling back to curl with --http2 flag:');
  
  const curl = spawn('curl', [
    '-I',
    '--http2',
    '-v',
    url
  ]);
  
  curl.stdout.on('data', (data) => {
    console.log(`curl stdout: ${data}`);
  });
  
  curl.stderr.on('data', (data) => {
    console.log(`curl stderr: ${data}`);
  });
  
  curl.on('close', (code) => {
    console.log(`curl process exited with code ${code}`);
  });
}
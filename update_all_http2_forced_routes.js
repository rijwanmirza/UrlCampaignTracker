// This script updates all HTTP2_FORCED_307 implementations in routes.ts to match viralplayer.xyz exactly
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

// Get the directory name
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Path to routes.ts file
const routesFile = path.join(__dirname, 'server', 'routes.ts');

// Read the routes.ts file
fs.readFile(routesFile, 'utf8', (err, data) => {
  if (err) {
    console.error('Error reading routes.ts file:', err);
    process.exit(1);
  }

  // Find all http2_forced_307 case blocks
  const startPattern = 'case "http2_forced_307":';
  const endPattern = 'break;';
  
  let updatedData = data;
  let startIndex = updatedData.indexOf(startPattern);
  
  // Loop through all occurrences of http2_forced_307
  while (startIndex !== -1) {
    let endIndex = updatedData.indexOf(endPattern, startIndex);
    if (endIndex === -1) {
      console.error('Could not find end of HTTP2_FORCED_307 case in routes.ts');
      process.exit(1);
    }
    endIndex += endPattern.length;

    // New implementation with viralplayer.xyz exact format
    const newImplementation = `case "http2_forced_307":
          // This implementation matches the exact format seen in viralplayer.xyz
          // First, set all headers exactly in the same order as the reference implementation
          
          // Create a set-cookie that matches reference implementation format
          const cookieExpiration = new Date();
          cookieExpiration.setFullYear(cookieExpiration.getFullYear() + 1); // Expire in 1 year
          const cookieExpiryString = cookieExpiration.toUTCString();
          
          // Generate a random ID similar to viralplayer.xyz
          const randomId = Math.random().toString(16).substring(2, 10);
          
          // Set headers exactly matching viralplayer.xyz in their specific order
          res.removeHeader('X-Powered-By'); // Clear default Express headers
          res.setHeader("date", new Date().toUTCString());
          res.setHeader("content-length", "0");
          res.setHeader("location", targetUrl);
          res.setHeader("server", "cloudflare");
          
          // Generate a UUID for x-request-id
          const uuid = 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, function(c) {
            const r = Math.random() * 16 | 0, v = c == 'x' ? r : (r & 0x3 | 0x8);
            return v.toString(16);
          });
          res.setHeader("x-request-id", uuid);
          
          res.setHeader("cf-cache-status", "DYNAMIC");
          
          // Set cookies that match the format
          res.setHeader("set-cookie", [
            \`bc45=fpc0|\${randomId}::351:55209; SameSite=Lax; Max-Age=31536000; Expires=\${cookieExpiryString}\`,
            \`rc45=fpc0|\${randomId}::28; SameSite=Lax; Max-Age=31536000; Expires=\${cookieExpiryString}\`,
            \`uclick=mr7ZxwtaaNs1gOWlamCY4hIUD7craeFLJuyMJz3hmBMFe4/9c70RDu5SgPFmEHXMW9DJfw==; SameSite=Lax; Max-Age=31536000\`,
            \`bcid=d0505amc402c73djlgl0; SameSite=Lax; Max-Age=31536000\`
          ]);
          
          // Generate a random CF-Ray value
          const cfRay = Math.random().toString(16).substring(2, 11) + "a3fe-EWR";
          res.setHeader("cf-ray", cfRay);
          
          // Alt-Svc header for HTTP/3 protocol negotiation
          res.setHeader("alt-svc", "h3=\\":443\"; ma=86400");
          
          // Send 307 redirect
          res.status(307).end();
          break;`;

    // Replace the HTTP2_FORCED_307 case with the new implementation
    updatedData = updatedData.substring(0, startIndex) + newImplementation + updatedData.substring(endIndex);
    
    // Find the next occurrence
    startIndex = updatedData.indexOf(startPattern, startIndex + newImplementation.length);
  }

  // Write the updated data back to the file
  fs.writeFile(routesFile, updatedData, 'utf8', (err) => {
    if (err) {
      console.error('Error writing to routes.ts file:', err);
      process.exit(1);
    }
    console.log('Successfully updated all HTTP2_FORCED_307 implementations to match viralplayer.xyz');
  });
});
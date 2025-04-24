import fs from 'fs';

// Read the routes.ts file
let routesContent = fs.readFileSync('server/routes.ts', 'utf8');

// Update the first occurrence of the HTTP/2.0 307 implementation in app.get("/r/:campaignId/:urlId")
routesContent = routesContent.replace(
  /case "http2_307_temporary":\s+\/\/ HTTP\/2.0 307 Temporary Redirect \(matching viralplayer\.xyz implementation\)\s+res\.setHeader\("X-Processing-Time", `\${timeInMs}ms`\);\s+\/\/ Simply send a 307 status - HTTP\/2 is handled at the server protocol level\s+res\.status\(307\)\.header\("Location", targetUrl\)\.end\(\);/,
  `case "http2_307_temporary":
          // HTTP/2.0 307 Temporary Redirect (matching viralplayer.xyz implementation)
          res.setHeader("X-Processing-Time", \`\${timeInMs}ms\`);
          
          // Force HTTP/2.0 protocol in the response
          res.setHeader("HTTP-Version", "HTTP/2.0");
          res.setHeader("X-HTTP-Version", "HTTP/2.0");
          res.setHeader("Alt-Svc", "h2=\\":443\\"; ma=86400");
          res.setHeader("Upgrade", "h2,h2c");
          res.setHeader("Connection", "Upgrade, keep-alive");
          
          res.status(307).header("Location", targetUrl).end();`
);

// Update the second occurrence in app.get("/c/:campaignId")
routesContent = routesContent.replace(
  /case "http2_307_temporary":\s+\/\/ HTTP\/2\.0 307 Temporary Redirect \(matching viralplayer\.xyz implementation\)\s+\/\/ Simply send/,
  `case "http2_307_temporary":
          // HTTP/2.0 307 Temporary Redirect (matching viralplayer.xyz implementation)
          // Force HTTP/2.0 protocol in the response
          res.setHeader("HTTP-Version", "HTTP/2.0");
          res.setHeader("X-HTTP-Version", "HTTP/2.0");
          res.setHeader("Alt-Svc", "h2=\\":443\\"; ma=86400");
          res.setHeader("Upgrade", "h2,h2c");
          res.setHeader("Connection", "Upgrade, keep-alive");
          
          // Simply send`
);

// Write the modified content back to the file
fs.writeFileSync('server/routes.ts', routesContent);

console.log('Updated HTTP/2.0 307 Temporary redirect implementation');
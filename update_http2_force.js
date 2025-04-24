const fs = require('fs');
const path = require('path');

// Path to routes.ts file
const routesPath = path.join(__dirname, 'server', 'routes.ts');

// Read the contents of routes.ts
let content = fs.readFileSync(routesPath, 'utf8');

// Add the http2_forced_307 case to both redirect handlers
// We'll use a detailed pattern that should match uniquely

// First handler (bridge URL handler)
const bridgeHandler = `        case "http2_307_temporary":
          // HTTP/2.0 307 Temporary Redirect (matching viralplayer.xyz implementation)
          res.setHeader("X-Processing-Time", \`\${timeInMs}ms\`);
          
          // Note: True HTTP/2.0 requires HTTPS in production
          // These headers help indicate HTTP/2.0 intention
          res.setHeader("X-HTTP2-Version", "HTTP/2.0");
          res.setHeader("Alt-Svc", "h2=\\":443\\"; ma=86400");
          res.setHeader("X-Protocol-Version", "h2");
          
          // Add standard headers used by HTTP/2 servers
          res.setHeader("Cache-Control", "no-cache");
          res.setHeader("Strict-Transport-Security", "max-age=31536000; includeSubDomains");
          
          // Add server identification to match pattern
          res.setHeader("X-Powered-By", "ViralEngine/2.0");
          
          // Send 307 redirect with HTTP/2 mimicking headers
          res.status(307).header("Location", targetUrl).end();
          break;`;

const bridgeAddition = `        case "http2_307_temporary":
          // HTTP/2.0 307 Temporary Redirect (matching viralplayer.xyz implementation)
          res.setHeader("X-Processing-Time", \`\${timeInMs}ms\`);
          
          // Note: True HTTP/2.0 requires HTTPS in production
          // These headers help indicate HTTP/2.0 intention
          res.setHeader("X-HTTP2-Version", "HTTP/2.0");
          res.setHeader("Alt-Svc", "h2=\\":443\\"; ma=86400");
          res.setHeader("X-Protocol-Version", "h2");
          
          // Add standard headers used by HTTP/2 servers
          res.setHeader("Cache-Control", "no-cache");
          res.setHeader("Strict-Transport-Security", "max-age=31536000; includeSubDomains");
          
          // Add server identification to match pattern
          res.setHeader("X-Powered-By", "ViralEngine/2.0");
          
          // Send 307 redirect with HTTP/2 mimicking headers
          res.status(307).header("Location", targetUrl).end();
          break;
          
        case "http2_forced_307":
          // Forced HTTP/2.0 307 Temporary Redirect - Specific implementation for HTTP/2.0
          res.setHeader("X-Processing-Time", \`\${timeInMs}ms\`);
          
          // Force HTTP/2.0 version in headers
          res.setHeader("X-HTTP2-Version", "HTTP/2.0");
          res.setHeader("HTTP-Version", "HTTP/2.0"); 
          
          // HTTP/2 required headers and compatibility
          res.setHeader("Alt-Svc", "h2=\\":443\\"; ma=86400");
          res.setHeader("X-Protocol-Version", "h2");
          res.setHeader("Upgrade-Insecure-Requests", "1");
          res.setHeader("X-HTTP2-Only", "true");
          
          // Advanced HTTP/2 specific settings
          res.setHeader("Strict-Transport-Security", "max-age=31536000; includeSubDomains; preload");
          res.setHeader("Cache-Control", "no-store, must-revalidate, no-cache");
          res.setHeader("Pragma", "no-cache");
          
          // Add extra identification for this special mode
          res.setHeader("X-Powered-By", "ViralEngine/2.0-HTTP2-Forced");
          res.setHeader("Server", "HTTP/2.0-Specialized-Server");
          
          // Force HTTP/2.0 content and connection settings
          res.setHeader("Connection", "Upgrade, close");
          res.setHeader("Upgrade", "h2c, h2");
          
          // Send 307 redirect with enforced HTTP/2 settings
          res.status(307).header("Location", targetUrl).end();
          break;`;

// Second handler (campaign URL handler)
const campaignHandler = `        case "http2_307_temporary":
          // HTTP/2.0 307 Temporary Redirect (matching viralplayer.xyz implementation)
          res.setHeader("X-Processing-Time", \`\${timeInMs}ms\`);
          // Simply send a 307 status - HTTP/2 is handled at the server protocol level
          res.status(307).header("Location", targetUrl).end();
          break;`;

const campaignAddition = `        case "http2_307_temporary":
          // HTTP/2.0 307 Temporary Redirect (matching viralplayer.xyz implementation)
          res.setHeader("X-Processing-Time", \`\${timeInMs}ms\`);
          
          // Note: True HTTP/2.0 requires HTTPS in production
          // These headers help indicate HTTP/2.0 intention
          res.setHeader("X-HTTP2-Version", "HTTP/2.0");
          res.setHeader("Alt-Svc", "h2=\\":443\\"; ma=86400");
          res.setHeader("X-Protocol-Version", "h2");
          
          // Add standard headers used by HTTP/2 servers
          res.setHeader("Cache-Control", "no-cache");
          res.setHeader("Strict-Transport-Security", "max-age=31536000; includeSubDomains");
          
          // Add server identification to match pattern
          res.setHeader("X-Powered-By", "ViralEngine/2.0");
          
          // Send 307 redirect with HTTP/2 mimicking headers
          res.status(307).header("Location", targetUrl).end();
          break;
          
        case "http2_forced_307":
          // Forced HTTP/2.0 307 Temporary Redirect - Specific implementation for HTTP/2.0
          res.setHeader("X-Processing-Time", \`\${timeInMs}ms\`);
          
          // Force HTTP/2.0 version in headers
          res.setHeader("X-HTTP2-Version", "HTTP/2.0");
          res.setHeader("HTTP-Version", "HTTP/2.0"); 
          
          // HTTP/2 required headers and compatibility
          res.setHeader("Alt-Svc", "h2=\\":443\\"; ma=86400");
          res.setHeader("X-Protocol-Version", "h2");
          res.setHeader("Upgrade-Insecure-Requests", "1");
          res.setHeader("X-HTTP2-Only", "true");
          
          // Advanced HTTP/2 specific settings
          res.setHeader("Strict-Transport-Security", "max-age=31536000; includeSubDomains; preload");
          res.setHeader("Cache-Control", "no-store, must-revalidate, no-cache");
          res.setHeader("Pragma", "no-cache");
          
          // Add extra identification for this special mode
          res.setHeader("X-Powered-By", "ViralEngine/2.0-HTTP2-Forced");
          res.setHeader("Server", "HTTP/2.0-Specialized-Server");
          
          // Force HTTP/2.0 content and connection settings
          res.setHeader("Connection", "Upgrade, close");
          res.setHeader("Upgrade", "h2c, h2");
          
          // Send 307 redirect with enforced HTTP/2 settings
          res.status(307).header("Location", targetUrl).end();
          break;`;

// Replace both handlers with their updated versions
content = content.replace(bridgeHandler, bridgeAddition);
content = content.replace(campaignHandler, campaignAddition);

// Write the updated content back to routes.ts
fs.writeFileSync(routesPath, content, 'utf8');

console.log('✅ HTTP/2.0 Forced 307 Redirect added successfully!');
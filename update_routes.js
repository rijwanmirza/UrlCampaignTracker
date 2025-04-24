const fs = require('fs');

// Read the routes.ts file
let content = fs.readFileSync('server/routes.ts', 'utf8');

// Define the case blocks to add
const http2CaseBlock = `        case "http2_307_temporary":
          // HTTP/2.0 307 Temporary Redirect
          res.setHeader("X-Processing-Time", \`\${timeInMs}ms\`);
          res.setHeader("HTTP-Version", "HTTP/2.0");
          res.setHeader("X-HTTP-Version", "HTTP/2.0");
          res.status(307).header("Location", targetUrl).header("Connection", "keep-alive").end();
          break;
          `;

// Function to find and add our case after the HTTP_307 case
function addAfterPattern(content, pattern, addition) {
  const index = content.indexOf(pattern);
  if (index === -1) return content;
  
  const endOfPattern = index + pattern.length;
  return content.slice(0, endOfPattern) + addition + content.slice(endOfPattern);
}

// Find each instance of the http_307 case ending with "break;"
const httpPattern1 = `        case "http_307":
          // HTTP 307 Temporary Redirect
          res.setHeader("X-Processing-Time", \`\${timeInMs}ms\`);
          res.status(307).header("Location", targetUrl).end();
          break;`;

const httpPattern2 = `        case "http_307":
          // HTTP 307 Temporary Redirect
          res.status(307).header("Location", targetUrl).end();
          break;`;

// Update the content by adding our HTTP/2.0 307 case after each HTTP 307 case
content = addAfterPattern(content, httpPattern1, "\n" + http2CaseBlock);
content = addAfterPattern(content, httpPattern2, "\n" + http2CaseBlock);

// Write the updated content back to the file
fs.writeFileSync('server/routes.ts', content);
console.log('Successfully updated routes.ts with HTTP/2.0 307 Temporary redirect');
const fs = require('fs');
const routes = fs.readFileSync('server/routes.ts', 'utf8');

// Find the first location - around line 635
let modifiedContent = routes.replace(
  /case "http_307":\s+\/\/ HTTP 307 Temporary Redirect\s+res\.setHeader\("X-Processing-Time", `\${timeInMs}ms`\);\s+res\.status\(307\)\.header\("Location", targetUrl\)\.end\();\s+break;\s+\s+case "direct":/g,
  `case "http_307":
          // HTTP 307 Temporary Redirect
          res.setHeader("X-Processing-Time", \`\${timeInMs}ms\`);
          res.status(307).header("Location", targetUrl).end();
          break;
          
        case "http2_307_temporary":
          // HTTP/2.0 307 Temporary Redirect
          res.setHeader("X-Processing-Time", \`\${timeInMs}ms\`);
          res.setHeader("HTTP-Version", "HTTP/2.0");
          res.setHeader("X-HTTP-Version", "HTTP/2.0");
          res.status(307).header("Location", targetUrl).header("Connection", "keep-alive").end();
          break;
          
        case "direct":`
);

// Find the second location - around line 724
modifiedContent = modifiedContent.replace(
  /case "http_307":\s+\/\/ HTTP 307 Temporary Redirect\s+res\.setHeader\("X-Processing-Time", `\${timeInMs}ms`\);\s+res\.status\(307\)\.header\("Location", targetUrl\)\.end\();\s+break;\s+\s+case "direct":/g,
  `case "http_307":
          // HTTP 307 Temporary Redirect
          res.setHeader("X-Processing-Time", \`\${timeInMs}ms\`);
          res.status(307).header("Location", targetUrl).end();
          break;
          
        case "http2_307_temporary":
          // HTTP/2.0 307 Temporary Redirect
          res.setHeader("X-Processing-Time", \`\${timeInMs}ms\`);
          res.setHeader("HTTP-Version", "HTTP/2.0");
          res.setHeader("X-HTTP-Version", "HTTP/2.0");
          res.status(307).header("Location", targetUrl).header("Connection", "keep-alive").end();
          break;
          
        case "direct":`
);

fs.writeFileSync('server/routes.ts', modifiedContent);

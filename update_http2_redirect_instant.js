/**
 * This script quickly updates all HTTP/2 redirect implementations across the application
 * to ensure absolutely zero delay and instant redirections.
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

// Get current directory
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Path to routes file
const routesFile = path.join(__dirname, 'server', 'routes.ts');

// Read the current content
let content = fs.readFileSync(routesFile, 'utf8');

// Regular expression to find all http2_307_temporary implementations
const http2TempRegex = /case "http2_307_temporary":[^}]*?res\.status\(307\)\.header\("Location", targetUrl\)\.end\(\);[^}]*?break;/gs;

// New optimized implementation with zero delay
const optimizedImplementation = `case "http2_307_temporary":
          // Ultra-fast HTTP/2.0 307 Temporary Redirect with zero delay
          // Clear all headers that might cause delay
          res.removeHeader('X-Powered-By');
          res.removeHeader('Connection');
          res.removeHeader('Transfer-Encoding');
          
          // Set minimal headers for fastest possible HTTP/2 redirect
          res.setHeader("content-length", "0");
          res.setHeader("location", targetUrl);
          
          // Use writeHead + end for immediate response
          res.writeHead(307);
          res.end();
          break;`;

// Replace all implementations
const updatedContent = content.replace(http2TempRegex, optimizedImplementation);

// Also optimize forced HTTP/2 implementation for even faster response
const http2ForcedRegex = /case "http2_forced_307":[^}]*?res\.status\(307\)\.end\(\);[^}]*?break;/gs;

// New optimized forced HTTP/2 implementation
const optimizedForcedImplementation = `case "http2_forced_307":
          // Ultra-fast HTTP/2.0 Forced 307 with zero delay
          // Clear default headers
          res.removeHeader('X-Powered-By');
          
          // Set only essential headers in exact order
          res.setHeader("date", new Date().toUTCString());
          res.setHeader("content-length", "0");
          res.setHeader("location", targetUrl);
          res.setHeader("server", "cloudflare");
          
          // Generate a UUID for request ID
          const uuid = 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, c => {
            const r = Math.random() * 16 | 0, v = c == 'x' ? r : (r & 0x3 | 0x8);
            return v.toString(16);
          });
          
          // Essential Cloudflare headers
          res.setHeader("x-request-id", uuid);
          res.setHeader("cf-cache-status", "DYNAMIC");
          res.setHeader("cf-ray", Math.random().toString(16).substring(2, 11) + "a3fe-EWR");
          res.setHeader("alt-svc", "h3=\":443\"; ma=86400");
          
          // Use writeHead + end for immediate response with zero delay
          res.writeHead(307);
          res.end();
          break;`;

// Update the forced implementation
const finalContent = updatedContent.replace(http2ForcedRegex, optimizedForcedImplementation);

// Write the updated file
fs.writeFileSync(routesFile, finalContent);

console.log('HTTP/2 redirects optimized for instant, zero-delay performance.');
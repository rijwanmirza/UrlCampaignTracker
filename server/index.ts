import express, { type Request, Response, NextFunction } from "express";
import { registerRoutes } from "./routes";
import { setupVite, serveStatic, log } from "./vite";
import compression from "compression";
import { gmailReader } from "./gmail-reader";
import { storage } from "./storage";
import * as spdy from 'spdy';
import * as fs from 'fs';
import * as path from 'path';

const app = express();

// Enable compression for all responses
app.use(compression());

// High-performance JSON parsing with limits to prevent DoS attacks
app.use(express.json({ limit: '1mb' }));
app.use(express.urlencoded({ extended: false, limit: '1mb' }));

// Add performance and caching headers for redirect URLs
app.use((req, res, next) => {
  // Set cache for campaign URLs
  if (req.path.startsWith('/c/') || req.path.startsWith('/r/')) {
    res.setHeader('X-Server-ID', 'high-perf-redirector-1');
    res.setHeader('Cache-Control', 'public, max-age=0');
  }
  next();
});

app.use((req, res, next) => {
  const start = Date.now();
  const path = req.path;
  let capturedJsonResponse: Record<string, any> | undefined = undefined;

  const originalResJson = res.json;
  res.json = function (bodyJson, ...args) {
    capturedJsonResponse = bodyJson;
    return originalResJson.apply(res, [bodyJson, ...args]);
  };

  res.on("finish", () => {
    const duration = Date.now() - start;
    if (path.startsWith("/api")) {
      let logLine = `${req.method} ${path} ${res.statusCode} in ${duration}ms`;
      if (capturedJsonResponse) {
        logLine += ` :: ${JSON.stringify(capturedJsonResponse)}`;
      }

      if (logLine.length > 80) {
        logLine = logLine.slice(0, 79) + "…";
      }

      log(logLine);
    }
  });

  next();
});

(async () => {
  const server = await registerRoutes(app);

  app.use((err: any, _req: Request, res: Response, _next: NextFunction) => {
    const status = err.status || err.statusCode || 500;
    const message = err.message || "Internal Server Error";

    res.status(status).json({ message });
    throw err;
  });

  // importantly only setup vite in development and after
  // setting up all the other routes so the catch-all route
  // doesn't interfere with the other routes
  if (app.get("env") === "development") {
    await setupVite(app, server);
  } else {
    serveStatic(app);
  }

  // ALWAYS serve the app on port 5000
  // this serves both the API and the client.
  // It is the only port that is not firewalled.
  const port = 5000;
  server.listen({
    port,
    host: "0.0.0.0",
    reusePort: true,
  }, async () => {
    log(`serving on port ${port}`);
    
    // Auto-configure and start Gmail reader with provided credentials
    try {
      // Check if there are campaigns but DON'T override defaultCampaignId
      // This prevents setting first campaign as default which could change user settings
      const campaigns = await storage.getCampaigns();
      
      // Configure Gmail reader with the credentials
      const gmailConfig = {
        user: 'compaignwalabhai@gmail.com',
        password: 'hciuemplthdkwfho',
        host: 'imap.gmail.com',
        port: 993,
        tls: true,
        tlsOptions: { rejectUnauthorized: false },
        whitelistSenders: ['help@donot-reply.in']
        // DO NOT set defaultCampaignId here - use existing config value instead
      };
      
      // Update Gmail reader configuration
      gmailReader.updateConfig(gmailConfig);
      
      // Try to verify the credentials
      try {
        const verifyResult = await gmailReader.verifyCredentials();
        if (verifyResult.success) {
          log(`Gmail credentials verified successfully, starting reader...`, 'gmail-reader');
          gmailReader.start();
          log(`Gmail reader started successfully and monitoring emails from help@donot-reply.in`, 'gmail-reader');
        } else {
          log(`Gmail verification failed: ${verifyResult.message}`, 'gmail-reader');
        }
      } catch (verifyError) {
        log(`Error verifying Gmail credentials: ${verifyError}`, 'gmail-reader');
      }
    } catch (error) {
      log(`Error auto-configuring Gmail reader: ${error}`, 'gmail-reader');
    }
  });
})();

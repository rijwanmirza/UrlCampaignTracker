import express, { type Request, Response, NextFunction } from "express";
import { registerRoutes } from "./routes";
import { setupVite, serveStatic, log } from "./vite";
import compression from "compression";
import cookieParser from "cookie-parser";
import { gmailReader } from "./gmail-reader";
import { storage } from "./storage";
import { initializeTrafficStar } from "./init-trafficstar";
import { trafficStarService } from "./trafficstar-service";
import { requireAuth } from "./auth/middleware";
import { registerAuthRoutes } from "./auth/routes";
import { initializeTrafficGeneratorScheduler } from "./traffic-generator-new";
import { youtubeApiService } from "./youtube-api-service";
import { initKeyManager } from "./auth/key-manager";
import { initAccessCodeManager } from "./auth/access-code-manager";
import { handleAccessRoutes, isValidTemporaryLoginPath, isSessionValid } from "./access-control";
import { processScheduledBudgetUpdates } from "./scheduled-budget-updater";
import * as spdy from 'spdy';
import * as fs from 'fs';
import * as path from 'path';

const app = express();

// Enable compression for all responses
app.use(compression());

// High-performance JSON parsing with limits to prevent DoS attacks
app.use(express.json({ limit: '1mb' }));
app.use(express.urlencoded({ extended: false, limit: '1mb' }));

// Parse cookies for authentication
app.use(cookieParser());

// Add performance and caching headers for redirect URLs
app.use((req, res, next) => {
  // Set cache for campaign URLs
  if (req.path.startsWith('/c/') || req.path.startsWith('/r/')) {
    res.setHeader('X-Server-ID', 'high-perf-redirector-1');
    res.setHeader('Cache-Control', 'public, max-age=0');
  }
  next();
});

// Apply access control to all routes
app.use(handleAccessRoutes);

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
  // Register authentication routes first
  registerAuthRoutes(app);
  
  // Apply authentication middleware to protect API routes
  app.use('/api', (req, res, next) => {
    // Skip auth for login/status routes and redirect routes
    if (req.path === '/auth/login' || 
        req.path === '/auth/verify' || 
        req.path === '/auth/status' ||
        req.path.startsWith('/campaigns/') && (req.method === 'GET' || req.method === 'OPTIONS') ||
        req.path.startsWith('/youtube-url-records') ||
        req.path.startsWith('/gmail-reader/') ||
        req.path.startsWith('/system/')) {
      return next();
    }
    
    // Apply authentication
    requireAuth(req, res, next);
  });
  
  const server = await registerRoutes(app);

  app.use((err: any, _req: Request, res: Response, _next: NextFunction) => {
    const status = err.status || err.statusCode || 500;
    const message = err.message || "Internal Server Error";

    res.status(status).json({ message });
    throw err;
  });

  // Create a custom 404 middleware for any route not matched by the API
  app.use("*", (req, res, next) => {
    // If we've already set headers from API routes, continue
    if (res.headersSent) {
      return next();
    }
    
    // Handle access control first - if the path is not /access/* or a valid temp login path
    // and the request doesn't have a valid session, return 404
    const path = req.path;
    const sessionId = req.cookies.session_id;
    const apiKey = req.cookies.apiKey;
    
    if (path !== '/access' && !path.startsWith('/access/') && !isValidTemporaryLoginPath(path) && 
        (!sessionId || !apiKey || !isSessionValid(sessionId))) {
      return res.status(404).send('Page not found');
    }
    
    // Otherwise, continue to Vite middleware
    next();
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
      // Initialize API key manager to load key from database
      await initKeyManager();
      log('API key manager initialized successfully');
      
      // Initialize access code manager to load special access code from database
      await initAccessCodeManager();
      log('Access code manager initialized successfully');
      
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
      
      // Initialize TrafficStar with API key from environment variable
      try {
        await initializeTrafficStar();
        log('TrafficStar API initialized successfully');
        
        // Remove test code - fix has been verified
        
        // Initialize Traffic Generator scheduler
        initializeTrafficGeneratorScheduler();
        log('Traffic Generator scheduler initialized successfully');
        
        // Set up a scheduler for budget updates - check every minute
        setInterval(() => {
          processScheduledBudgetUpdates().catch(error => {
            log(`Error processing scheduled budget updates: ${error}`, 'budget-updater');
          });
        }, 60 * 1000); // Run every minute
        log('Budget update scheduler initialized successfully');
        
        // Initialize YouTube API service if key is present
        if (youtubeApiService.isConfigured()) {
          youtubeApiService.scheduleChecks();
          log('YouTube API service initialized successfully');
        } else {
          log('YouTube API service not initialized - API key not configured');
        }
        
        // Traffic Sender service has been removed
      } catch (trafficstarError) {
        log(`Error initializing TrafficStar API: ${trafficstarError}`);
      }
    } catch (error) {
      log(`Error auto-configuring integrations: ${error}`, 'startup');
    }
  });
})();

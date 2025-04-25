import express, { type Request, Response, NextFunction } from "express";
import { registerRoutes } from "./routes";
import { setupVite, serveStatic, log } from "./vite";
import compression from "compression";
import { gmailReader } from "./gmail-reader";
import { storage } from "./storage";
import { initializeTrafficStar } from "./init-trafficstar";
import { trafficStarService } from "./trafficstar-service";
import { initializeAuth } from "./init-auth";
import { configureSession } from "./session";
import { pool } from "./db";
import cookieParser from "cookie-parser";
import authRouter from "./routes/auth-routes";
import * as spdy from 'spdy';
import * as fs from 'fs';
import * as path from 'path';

const app = express();

// Enable compression for all responses
app.use(compression());

// Cookie parser middleware
app.use(cookieParser());

// Session middleware
app.use(configureSession(pool));

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

// Site security check middleware for admin sections (not for public routes like redirects)
app.use((req: Request, res: Response, next: NextFunction) => {
  // Allow all redirect routes without security check
  if (req.path.startsWith('/c/') || 
      req.path.startsWith('/r/') || 
      req.path.startsWith('/views/') || 
      req.path.startsWith('/api/auth/') ||
      req.path === '/login' ||
      // Allow OPTIONS requests for CORS
      req.method === 'OPTIONS') {
    return next();
  }
  
  console.log(`🔒 Security check for path: ${req.path}`); // Debug logging
  
  // API security key check
  const apiKey = req.headers['x-api-key'] || req.query.apiKey || req.cookies.apiKey;
  
  // The API key is hardcoded here for simplicity and speed
  const validApiKey = 'rijwa487mirza';
  
  if (apiKey === validApiKey) {
    // Key matches - set cookie for future requests
    res.cookie('apiKey', validApiKey, { 
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      maxAge: 30 * 24 * 60 * 60 * 1000 // 30 days
    });
    
    // Automatically set admin user in session
    // This ensures all auth checks will pass internally
    if (!req.session.user) {
      req.session.user = {
        id: 2,
        username: 'rijwamirza',
        role: 'admin'
      };
    }
    
    return next();
  }
  
  // If no API key is found and this is an API request, return 401
  if (req.path.startsWith('/api/')) {
    return res.status(401).json({ message: 'Unauthorized - API key required' });
  }
  
  // For web UI access, redirect to login page rather than showing a white screen
  return res.redirect('/login');
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

// Register authentication routes
app.use("/api/auth", authRouter);

// Root route redirect to direct login if not authenticated
app.get("/login", (req: Request, res: Response) => {
  // Check if we're coming back from a failed authentication
  const apiKey = req.cookies.apiKey || req.query.apiKey || req.headers['x-api-key'];
  const validApiKey = 'rijwa487mirza';
  
  // If we already have the correct API key in the cookie, go directly to campaigns
  if (apiKey === validApiKey) {
    return res.redirect("/campaigns");
  }
  
  // Otherwise go to login page
  // If there was an invalid API key, add the error parameter
  if (apiKey && apiKey !== validApiKey) {
    return res.redirect("/api/auth/direct-login?error=invalid");
  }
  
  return res.redirect("/api/auth/direct-login");
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
      
      // Run database migrations
      try {
        // Import and run the daily spent fields migration
        const { addDailySpentFields } = await import("./migrations/add-daily-spent-fields");
        const migrationResult = await addDailySpentFields();
        if (migrationResult) {
          log('✅ Daily spent fields migration completed successfully');
        } else {
          log('❌ Daily spent fields migration failed');
        }
      } catch (migrationError) {
        log(`Error running migrations: ${migrationError}`);
      }

      // Initialize TrafficStar with API key from environment variable
      try {
        await initializeTrafficStar();
        log('TrafficStar API initialized successfully');
        
        // Start auto-management of TrafficStar campaigns
        try {
          await trafficStarService.scheduleAutoManagement();
          log('TrafficStar campaign auto-management initialized successfully');
        } catch (autoManageError) {
          log(`Error initializing TrafficStar auto-management: ${autoManageError}`);
        }
      } catch (trafficstarError) {
        log(`Error initializing TrafficStar API: ${trafficstarError}`);
      }

      // Initialize authentication system (admin users)
      try {
        await initializeAuth();
        log('Authentication system initialized successfully');
      } catch (authError) {
        log(`Error initializing authentication system: ${authError}`);
      }
    } catch (error) {
      log(`Error auto-configuring integrations: ${error}`, 'startup');
    }
  });
})();

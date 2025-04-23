import type { Express, Request, Response, NextFunction } from "express";
import { createServer, type Server } from "http";
import { storage } from "./storage";
import { 
  insertCampaignSchema, 
  updateCampaignSchema,
  insertUrlSchema, 
  updateUrlSchema,
  bulkUrlActionSchema
} from "@shared/schema";
import { ZodError, z } from "zod";
import { fromZodError } from "zod-validation-error";
import { gmailReader } from "./gmail-reader";
import Imap from "imap";

export async function registerRoutes(app: Express): Promise<Server> {
  // API route for campaigns
  app.get("/api/campaigns", async (_req: Request, res: Response) => {
    try {
      const campaigns = await storage.getCampaigns();
      res.json(campaigns);
    } catch (error) {
      console.error('Error fetching campaigns:', error);
      res.status(500).json({ message: "Failed to fetch campaigns", error: error instanceof Error ? error.message : String(error) });
    }
  });
  
  // Get campaign by custom path
  app.get("/api/campaigns/path/:customPath", async (req: Request, res: Response) => {
    try {
      const customPath = req.params.customPath;
      if (!customPath) {
        return res.status(400).json({ message: "Invalid custom path" });
      }
      
      const campaign = await storage.getCampaignByCustomPath(customPath);
      if (!campaign) {
        return res.status(404).json({ message: "Campaign not found" });
      }
      
      res.json(campaign);
    } catch (error) {
      res.status(500).json({ message: "Failed to fetch campaign" });
    }
  });

  app.get("/api/campaigns/:id", async (req: Request, res: Response) => {
    try {
      const id = parseInt(req.params.id);
      if (isNaN(id)) {
        return res.status(400).json({ message: "Invalid campaign ID" });
      }

      const campaign = await storage.getCampaign(id);
      if (!campaign) {
        return res.status(404).json({ message: "Campaign not found" });
      }

      res.json(campaign);
    } catch (error) {
      res.status(500).json({ message: "Failed to fetch campaign" });
    }
  });

  app.post("/api/campaigns", async (req: Request, res: Response) => {
    try {
      const result = insertCampaignSchema.safeParse(req.body);
      if (!result.success) {
        const validationError = fromZodError(result.error);
        return res.status(400).json({ message: validationError.message });
      }

      const campaign = await storage.createCampaign(result.data);
      res.status(201).json(campaign);
    } catch (error) {
      res.status(500).json({ message: "Failed to create campaign" });
    }
  });
  
  // Update an existing campaign
  app.put("/api/campaigns/:id", async (req: Request, res: Response) => {
    try {
      const id = parseInt(req.params.id);
      if (isNaN(id)) {
        return res.status(400).json({ message: "Invalid campaign ID" });
      }
      
      const result = updateCampaignSchema.safeParse(req.body);
      if (!result.success) {
        const validationError = fromZodError(result.error);
        return res.status(400).json({ message: validationError.message });
      }
      
      // Check if multiplier is being updated
      const { multiplier } = result.data;
      const existingCampaign = await storage.getCampaign(id);
      
      if (!existingCampaign) {
        return res.status(404).json({ message: "Campaign not found" });
      }
      
      console.log('🔍 DEBUG: Campaign update requested: ID', id);
      const oldMultiplier = existingCampaign.multiplier || 1;
      console.log(`  - Current multiplier: ${oldMultiplier}`);
      console.log(`  - Requested multiplier: ${multiplier || 'unchanged'}`);
      
      // Update campaign first
      const updatedCampaign = await storage.updateCampaign(id, result.data);
      
      // If multiplier changed, update all active/paused URLs in the campaign
      if (multiplier && multiplier !== existingCampaign.multiplier) {
        console.log(`🔍 DEBUG: Multiplier change detected: ${oldMultiplier} → ${multiplier}`);
        
        // Get all active/paused URLs
        const campaignUrls = await storage.getUrls(id);
        const activeOrPausedUrls = campaignUrls.filter(
          url => url.status === 'active' || url.status === 'paused'
        );
        
        console.log(`  - Found ${activeOrPausedUrls.length} active/paused URLs to update`);
        
        // Update each URL with new clickLimit based on original value * new multiplier
        for (const url of activeOrPausedUrls) {
          // When multiplier changes, only update the clickLimit based on originalClickLimit
          // The originalClickLimit remains unchanged (it's always the user's original input)
          await storage.updateUrl(url.id, {
            clickLimit: url.originalClickLimit * multiplier, // Recalculate the click limit
            // Keep all other values unchanged
            originalClickLimit: url.originalClickLimit, // Original always stays the same
            name: url.name,
            targetUrl: url.targetUrl,
            status: url.status as 'active' | 'paused' | 'completed' | 'deleted' | 'rejected' | undefined
          });
        }
      }
      
      res.json(updatedCampaign);
    } catch (error) {
      console.error('Failed to update campaign:', error);
      res.status(500).json({ message: "Failed to update campaign" });
    }
  });
  
  // Delete a campaign and mark all its URLs as deleted
  app.delete("/api/campaigns/:id", async (req: Request, res: Response) => {
    try {
      const id = parseInt(req.params.id);
      if (isNaN(id)) {
        return res.status(400).json({ message: "Invalid campaign ID" });
      }
      
      const campaign = await storage.getCampaign(id);
      if (!campaign) {
        return res.status(404).json({ message: "Campaign not found" });
      }
      
      // Delete the campaign and all its URLs
      const deleted = await storage.deleteCampaign(id);
      
      if (deleted) {
        res.status(200).json({ message: "Campaign deleted successfully" });
      } else {
        res.status(500).json({ message: "Failed to delete campaign" });
      }
    } catch (error) {
      res.status(500).json({ message: "Failed to delete campaign" });
    }
  });

  // API routes for URLs
  app.get("/api/campaigns/:campaignId/urls", async (req: Request, res: Response) => {
    try {
      const campaignId = parseInt(req.params.campaignId);
      if (isNaN(campaignId)) {
        return res.status(400).json({ message: "Invalid campaign ID" });
      }

      const urls = await storage.getUrls(campaignId);
      res.json(urls);
    } catch (error) {
      res.status(500).json({ message: "Failed to fetch URLs" });
    }
  });

  app.post("/api/campaigns/:campaignId/urls", async (req: Request, res: Response) => {
    try {
      const campaignId = parseInt(req.params.campaignId);
      if (isNaN(campaignId)) {
        return res.status(400).json({ message: "Invalid campaign ID" });
      }

      const campaign = await storage.getCampaign(campaignId);
      if (!campaign) {
        return res.status(404).json({ message: "Campaign not found" });
      }

      console.log('🔍 DEBUG: Received URL creation request:', JSON.stringify(req.body, null, 2));
      console.log('🔍 DEBUG: Campaign multiplier:', campaign.multiplier);
      
      // Store original click limit - EXACTLY as entered by user
      const originalClickLimit = parseInt(req.body.clickLimit, 10);
      if (isNaN(originalClickLimit) || originalClickLimit <= 0) {
        return res.status(400).json({ message: "Click limit must be a positive number" });
      }
      console.log('🔍 DEBUG: Original click limit (user input):', originalClickLimit);
      
      // Calculate click limit with multiplier
      let calculatedClickLimit = originalClickLimit;
      if (campaign.multiplier && campaign.multiplier > 1) {
        calculatedClickLimit = originalClickLimit * campaign.multiplier;
        console.log('🔍 DEBUG: Calculated click limit after multiplier:', calculatedClickLimit);
      }
      
      // Create the URL data object with both the calculated limit and original input
      let urlData = { 
        ...req.body, 
        campaignId,
        clickLimit: calculatedClickLimit,
        originalClickLimit: originalClickLimit // IMPORTANT: This is the raw user input value without multiplier
      };
      
      console.log('🔍 DEBUG: Final URL data to be saved:', JSON.stringify(urlData, null, 2));
      
      const result = insertUrlSchema.safeParse(urlData);
      if (!result.success) {
        const validationError = fromZodError(result.error);
        return res.status(400).json({ message: validationError.message });
      }

      const url = await storage.createUrl(result.data);
      
      // If the URL was created but marked as rejected due to duplicate name,
      // we still return 201 Created but also include a message about the rejection
      if (url.status === 'rejected') {
        // Check if it's a numbered rejection (name contains #)
        if (url.name.includes('#')) {
          // Return success with warning about duplicate name and auto-numbering
          return res.status(201).json({ 
            ...url,
            __message: `URL "${req.body.name}" was auto-numbered due to duplicate name` 
          });
        } else {
          // First rejection - just return with warning
          return res.status(201).json({ 
            ...url,
            __message: `URL "${req.body.name}" was rejected due to duplicate name` 
          });
        }
      }
      
      // Normal case - URL created successfully without duplication
      res.status(201).json(url);
    } catch (error) {
      console.error('Error creating URL:', error);
      res.status(500).json({ message: "Failed to create URL" });
    }
  });

  app.put("/api/urls/:id", async (req: Request, res: Response) => {
    try {
      const id = parseInt(req.params.id);
      if (isNaN(id)) {
        return res.status(400).json({ message: "Invalid URL ID" });
      }

      // Get existing URL to check its campaign multiplier
      const existingUrl = await storage.getUrl(id);
      if (!existingUrl) {
        return res.status(404).json({ message: "URL not found" });
      }

      // Check if this is a click limit update with new multiplier needed
      let updateData = { ...req.body };

      // If updating clickLimit and the URL belongs to a campaign
      if (updateData.clickLimit && existingUrl.campaignId) {
        console.log('🔍 DEBUG: URL edit - updating click limit');
        
        // Get campaign to check for multiplier
        const campaign = await storage.getCampaign(existingUrl.campaignId);
        if (campaign && campaign.multiplier && campaign.multiplier > 1) {
          // Save the new originalClickLimit (user input)
          const newOriginalLimit = parseInt(updateData.clickLimit, 10);
          
          // Apply campaign multiplier to get the new required limit
          updateData.clickLimit = newOriginalLimit * campaign.multiplier;
          updateData.originalClickLimit = newOriginalLimit;
          
          console.log('🔍 DEBUG: URL updated with new limits:');
          console.log(`  - Original user input: ${newOriginalLimit}`);
          console.log(`  - After multiplier (${campaign.multiplier}x): ${updateData.clickLimit}`);
        }
      }

      const result = updateUrlSchema.safeParse(updateData);
      if (!result.success) {
        const validationError = fromZodError(result.error);
        return res.status(400).json({ message: validationError.message });
      }

      const url = await storage.updateUrl(id, result.data);
      if (!url) {
        return res.status(404).json({ message: "URL not found" });
      }

      res.json(url);
    } catch (error) {
      console.error('Error updating URL:', error);
      res.status(500).json({ message: "Failed to update URL" });
    }
  });

  app.delete("/api/urls/:id", async (req: Request, res: Response) => {
    try {
      const id = parseInt(req.params.id);
      if (isNaN(id)) {
        return res.status(400).json({ message: "Invalid URL ID" });
      }

      const success = await storage.deleteUrl(id);
      if (!success) {
        return res.status(404).json({ message: "URL not found" });
      }

      res.status(204).end();
    } catch (error) {
      res.status(500).json({ message: "Failed to delete URL" });
    }
  });
  
  // Permanently delete a URL (hard delete)
  app.delete("/api/urls/:id/permanent", async (req: Request, res: Response) => {
    try {
      const id = parseInt(req.params.id);
      if (isNaN(id)) {
        return res.status(400).json({ message: "Invalid URL ID" });
      }

      const success = await storage.permanentlyDeleteUrl(id);
      if (!success) {
        return res.status(404).json({ message: "URL not found" });
      }

      res.status(204).end();
    } catch (error) {
      res.status(500).json({ message: "Failed to permanently delete URL" });
    }
  });
  
  // Bulk URL actions (pause, activate, delete, etc.)
  app.post("/api/urls/bulk", async (req: Request, res: Response) => {
    try {
      const result = bulkUrlActionSchema.safeParse(req.body);
      if (!result.success) {
        const validationError = fromZodError(result.error);
        return res.status(400).json({ message: validationError.message });
      }
      
      const { urlIds, action } = result.data;
      
      if (!urlIds.length) {
        return res.status(400).json({ message: "No URL IDs provided" });
      }
      
      const success = await storage.bulkUpdateUrls(urlIds, action);
      if (!success) {
        return res.status(404).json({ message: "No valid URLs found" });
      }
      
      res.status(204).end();
    } catch (error) {
      res.status(500).json({ message: "Failed to perform bulk action" });
    }
  });
  
  // Get all URLs with pagination, search and filtering
  app.get("/api/urls", async (req: Request, res: Response) => {
    try {
      const page = parseInt(req.query.page as string) || 1;
      const limit = parseInt(req.query.limit as string) || 50;
      const search = req.query.search as string;
      const status = req.query.status as string;
      
      const result = await storage.getAllUrls(page, limit, search, status);
      res.json(result);
    } catch (error) {
      res.status(500).json({ message: "Failed to fetch URLs" });
    }
  });

  // Redirect endpoint
  app.get("/r/:campaignId/:urlId", async (req: Request, res: Response) => {
    try {
      const campaignId = parseInt(req.params.campaignId);
      const urlId = parseInt(req.params.urlId);
      
      if (isNaN(campaignId) || isNaN(urlId)) {
        return res.status(400).json({ message: "Invalid redirect parameters" });
      }

      // Get both the URL and the campaign
      const url = await storage.getUrl(urlId);
      if (!url) {
        return res.status(404).json({ message: "URL not found" });
      }

      if (url.campaignId !== campaignId) {
        return res.status(400).json({ message: "URL does not belong to this campaign" });
      }

      if (url.clicks >= url.clickLimit) {
        return res.status(410).json({ message: "This link has reached its click limit" });
      }

      // Get the campaign to determine the redirect method
      const campaign = await storage.getCampaign(campaignId);
      if (!campaign) {
        return res.status(404).json({ message: "Campaign not found" });
      }

      // Increment click count 
      await storage.incrementUrlClicks(urlId);

      // Handle the redirect based on the campaign's redirect method
      const targetUrl = url.targetUrl;
      
      switch (campaign.redirectMethod) {
        case "meta_refresh":
          // Meta refresh redirect with no visible content
          res.send(`
            <!DOCTYPE html>
            <html>
              <head>
                <meta http-equiv="refresh" content="0;url=${targetUrl}">
                <title></title>
                <style>body{display:none}</style>
              </head>
              <body></body>
            </html>
          `);
          break;
          
        case "double_meta_refresh":
          // Double meta refresh redirect (redirects through an intermediary page)
          const bridgeUrl = `/r/bridge/${campaignId}/${urlId}`;
          res.send(`
            <!DOCTYPE html>
            <html>
              <head>
                <meta http-equiv="refresh" content="0;url=${bridgeUrl}">
                <title></title>
                <style>body{display:none}</style>
              </head>
              <body></body>
            </html>
          `);
          break;
          
        case "http_307":
          // HTTP 307 Temporary Redirect
          res.status(307).header("Location", targetUrl).end();
          break;
          
        case "direct":
        default:
          // Standard redirect (302 Found)
          res.redirect(targetUrl);
          break;
      }
    } catch (error) {
      res.status(500).json({ message: "Redirect failed" });
    }
  });
  
  // Bridge page for double meta refresh
  app.get("/r/bridge/:campaignId/:urlId", async (req: Request, res: Response) => {
    try {
      const campaignId = parseInt(req.params.campaignId);
      const urlId = parseInt(req.params.urlId);
      
      if (isNaN(campaignId) || isNaN(urlId)) {
        return res.status(400).json({ message: "Invalid redirect parameters" });
      }

      const url = await storage.getUrl(urlId);
      if (!url) {
        return res.status(404).json({ message: "URL not found" });
      }

      // Second stage of double meta refresh - minimal content for speed
      res.send(`
        <!DOCTYPE html>
        <html>
          <head>
            <meta http-equiv="refresh" content="0;url=${url.targetUrl}">
            <title></title>
            <style>body{display:none}</style>
          </head>
          <body></body>
        </html>
      `);
    } catch (error) {
      res.status(500).json({ message: "Redirect failed" });
    }
  });
  
  // Custom path URL access for campaigns
  app.get("/views/:customPath", async (req: Request, res: Response) => {
    try {
      const startTime = process.hrtime();
      const customPath = req.params.customPath;
      
      if (!customPath) {
        return res.status(400).json({ message: "Invalid custom path" });
      }
      
      // Get the campaign by custom path
      const campaign = await storage.getCampaignByCustomPath(customPath);
      if (!campaign) {
        return res.status(404).json({ message: "Campaign not found" });
      }
      
      // Use our optimized method to get a URL based on weighted distribution
      const selectedUrl = await storage.getRandomWeightedUrl(campaign.id);
      
      if (!selectedUrl) {
        return res.status(410).json({ message: "All URLs in this campaign have reached their click limits" });
      }
      
      // Increment click count
      await storage.incrementUrlClicks(selectedUrl.id);
      
      // Performance metrics
      const endTime = process.hrtime(startTime);
      const timeInMs = (endTime[0] * 1000 + endTime[1] / 1000000).toFixed(2);
      
      // Handle the redirect based on the campaign's redirect method
      const targetUrl = selectedUrl.targetUrl;
      
      switch (campaign.redirectMethod) {
        case "meta_refresh":
          // Meta refresh redirect - completely invisible
          res.send(`
            <!DOCTYPE html>
            <html>
              <head>
                <meta http-equiv="refresh" content="0;url=${targetUrl}">
                <title></title>
                <style>body{display:none}</style>
              </head>
              <body></body>
            </html>
          `);
          break;
          
        case "double_meta_refresh":
          // For double meta refresh - completely invisible
          res.send(`
            <!DOCTYPE html>
            <html>
              <head>
                <meta http-equiv="refresh" content="0;url=${targetUrl}">
                <title></title>
                <style>body{display:none}</style>
                <script>
                  // Immediate redirect without any visible elements
                  window.location.href = "${targetUrl}";
                </script>
              </head>
              <body></body>
            </html>
          `);
          break;
          
        case "http_307":
          // HTTP 307 Temporary Redirect
          res.setHeader("X-Processing-Time", `${timeInMs}ms`);
          res.status(307).header("Location", targetUrl).end();
          break;
          
        case "direct":
        default:
          // Standard redirect (302 Found)
          res.setHeader("X-Processing-Time", `${timeInMs}ms`);
          res.redirect(targetUrl);
          break;
      }
    } catch (error) {
      res.status(500).json({ message: "Redirect failed" });
    }
  });
  
  // High-performance campaign URL with optimized weighted distribution
  app.get("/c/:campaignId", async (req: Request, res: Response) => {
    try {
      const startTime = process.hrtime();
      const campaignId = parseInt(req.params.campaignId);
      
      if (isNaN(campaignId)) {
        return res.status(400).json({ message: "Invalid campaign ID" });
      }

      // Get the campaign to check if it exists and to get the redirect method
      const campaign = await storage.getCampaign(campaignId);
      if (!campaign) {
        return res.status(404).json({ message: "Campaign not found" });
      }

      // Use our optimized method to get a URL based on weighted distribution
      const selectedUrl = await storage.getRandomWeightedUrl(campaignId);
      
      if (!selectedUrl) {
        return res.status(410).json({ message: "All URLs in this campaign have reached their click limits" });
      }
      
      // Redirect to the specific URL directly without going through the /r/ endpoint
      // This saves an extra HTTP redirect and improves performance
      
      // Increment click count first
      await storage.incrementUrlClicks(selectedUrl.id);
      
      // Performance metrics
      const endTime = process.hrtime(startTime);
      const timeInMs = (endTime[0] * 1000 + endTime[1] / 1000000).toFixed(2);
      
      // Handle the redirect based on the campaign's redirect method
      const targetUrl = selectedUrl.targetUrl;
      
      switch (campaign.redirectMethod) {
        case "meta_refresh":
          // Meta refresh redirect - completely invisible
          res.send(`
            <!DOCTYPE html>
            <html>
              <head>
                <meta http-equiv="refresh" content="0;url=${targetUrl}">
                <title></title>
                <style>body{display:none}</style>
              </head>
              <body></body>
            </html>
          `);
          break;
          
        case "double_meta_refresh":
          // For double meta refresh - completely invisible
          res.send(`
            <!DOCTYPE html>
            <html>
              <head>
                <meta http-equiv="refresh" content="0;url=${targetUrl}">
                <title></title>
                <style>body{display:none}</style>
                <script>
                  // Immediate redirect without any visible elements
                  window.location.href = "${targetUrl}";
                </script>
              </head>
              <body></body>
            </html>
          `);
          break;
          
        case "http_307":
          // HTTP 307 Temporary Redirect
          res.setHeader("X-Processing-Time", `${timeInMs}ms`);
          res.status(307).header("Location", targetUrl).end();
          break;
          
        case "direct":
        default:
          // Standard redirect (302 Found)
          res.setHeader("X-Processing-Time", `${timeInMs}ms`);
          res.redirect(targetUrl);
          break;
      }
    } catch (error) {
      res.status(500).json({ message: "Redirect failed" });
    }
  });

  // Gmail Reader API endpoints
  const gmailConfigSchema = z.object({
    user: z.string().email(),
    password: z.string().min(1),
    host: z.string().default('imap.gmail.com'),
    port: z.number().int().positive().default(993),
    tls: z.boolean().default(true),
    tlsOptions: z.object({
      rejectUnauthorized: z.boolean()
    }).optional().default({ rejectUnauthorized: false }),
    whitelistSenders: z.array(z.string()).default([]),
    subjectPattern: z.string(),
    messagePattern: z.object({
      orderIdRegex: z.string(),
      urlRegex: z.string(),
      quantityRegex: z.string()
    }),
    defaultCampaignId: z.number().int().positive(),
    checkInterval: z.number().int().positive().default(60000)
  });

  // Get Gmail reader status
  app.get("/api/gmail-reader/status", (_req: Request, res: Response) => {
    try {
      const status = gmailReader.getStatus();
      res.json(status);
    } catch (error) {
      res.status(500).json({ 
        message: "Failed to get Gmail reader status",
        error: error instanceof Error ? error.message : String(error)
      });
    }
  });

  // Configure Gmail reader
  app.post("/api/gmail-reader/config", async (req: Request, res: Response) => {
    try {
      // Convert string regex to RegExp objects
      const rawConfig = req.body;
      
      // Parse the input with basic validation
      const result = gmailConfigSchema.safeParse(rawConfig);
      
      if (!result.success) {
        const validationError = fromZodError(result.error);
        return res.status(400).json({ message: validationError.message });
      }
      
      // Convert string patterns to RegExp objects
      const config = {
        ...result.data,
        subjectPattern: new RegExp(result.data.subjectPattern),
        messagePattern: {
          orderIdRegex: new RegExp(result.data.messagePattern.orderIdRegex),
          urlRegex: new RegExp(result.data.messagePattern.urlRegex),
          quantityRegex: new RegExp(result.data.messagePattern.quantityRegex)
        }
      };
      
      // Check if the campaign exists
      const campaign = await storage.getCampaign(config.defaultCampaignId);
      if (!campaign) {
        return res.status(404).json({ message: "Campaign not found for defaultCampaignId" });
      }
      
      // Update the Gmail reader configuration
      const updatedConfig = gmailReader.updateConfig(config);
      
      res.json({
        message: "Gmail reader configuration updated successfully",
        config: {
          ...updatedConfig,
          password: "******" // Hide password in response
        }
      });
    } catch (error) {
      res.status(500).json({ 
        message: "Failed to configure Gmail reader",
        error: error instanceof Error ? error.message : String(error)
      });
    }
  });
  
  // Test Gmail connection (using both SMTP and IMAP methods)
  app.post("/api/gmail-reader/test-connection", async (req: Request, res: Response) => {
    try {
      const { user, password, host = 'imap.gmail.com', port = 993, tls = true } = req.body;
      
      if (!user || !password) {
        return res.status(400).json({ 
          success: false,
          message: "Missing credentials. Please provide user and password."
        });
      }
      
      // First try SMTP verification (often more reliable with Gmail)
      // Create a temporary instance with our credentials
      const tempConfig = {
        user,
        password,
        host,
        port, 
        tls,
        whitelistSenders: ['help@donot-reply.in'] // Include the requested whitelist
      };
      
      // Update the main Gmail reader with the credentials for testing
      gmailReader.updateConfig(tempConfig);
      
      try {
        // Try to verify using SMTP first (faster and more reliable for Gmail)
        const smtpResult = await gmailReader.verifyCredentials();
        if (smtpResult.success) {
          return res.json(smtpResult);
        }
        // If SMTP failed, fall back to IMAP verification
        console.log('SMTP verification failed, trying IMAP:', smtpResult.message);
      } catch (smtpError) {
        console.log('SMTP verification threw an error, trying IMAP:', smtpError);
      }
      
      // Fall back to IMAP connection testing
      // Create a new IMAP connection for testing
      const testImap = new Imap({
        user,
        password,
        host,
        port,
        tls,
        tlsOptions: { rejectUnauthorized: false },
        authTimeout: 30000, // Increase auth timeout
        connTimeout: 30000  // Increase connection timeout
      });
      
      // Set up a promise to handle the connection test
      const connectionTest = new Promise<{success: boolean, message: string}>((resolve, reject) => {
        // Set a timeout to prevent hanging
        const timeout = setTimeout(() => {
          try {
            testImap.end();
          } catch (e) {
            // Ignore errors when ending the connection
          }
          resolve({ 
            success: false, 
            message: "Connection timeout. Please check your credentials and network. Gmail sometimes blocks automated login attempts. Try again later or visit your Google account security settings." 
          });
        }, 30000); // 30 second timeout
        
        // Handle errors
        testImap.once('error', (err: Error) => {
          clearTimeout(timeout);
          console.log('IMAP connection error:', err.message);
          
          // Parse the error message to provide more helpful feedback
          let friendlyMessage = `Connection failed: ${err.message}`;
          
          if (err.message.includes('Invalid credentials') || err.message.includes('Authentication failed')) {
            friendlyMessage = 'Authentication failed: Please check your email and app password. Make sure you\'re using an App Password if you have 2-factor authentication enabled.';
          } else if (err.message.includes('ENOTFOUND') || err.message.includes('getaddrinfo')) {
            friendlyMessage = 'Could not reach Gmail server: Please check your internet connection and host settings';
          } else if (err.message.includes('ETIMEDOUT')) {
            friendlyMessage = 'Connection timed out: Gmail server might be blocking the request or there are network issues. Try again later.';
          }
          
          resolve({ 
            success: false, 
            message: friendlyMessage
          });
        });
        
        // Handle successful connection
        testImap.once('ready', () => {
          clearTimeout(timeout);
          testImap.getBoxes((err, boxes) => {
            if (err) {
              resolve({ 
                success: true, 
                message: "Connected successfully, but couldn't list mailboxes." 
              });
            } else {
              resolve({ 
                success: true, 
                message: "Connected successfully! Gmail credentials are working." 
              });
            }
            
            // Close the connection
            try {
              testImap.end();
            } catch (e) {
              // Ignore errors when ending the connection
            }
          });
        });
        
        // Start the connection
        testImap.connect();
      });
      
      // Wait for the connection test to complete
      const result = await connectionTest;
      
      // Send the result
      res.json(result);
    } catch (error) {
      res.status(500).json({ 
        success: false,
        message: `Failed to test connection: ${error instanceof Error ? error.message : String(error)}`
      });
    }
  });

  // Start Gmail reader
  app.post("/api/gmail-reader/start", (_req: Request, res: Response) => {
    try {
      gmailReader.start();
      res.json({ message: "Gmail reader started successfully" });
    } catch (error) {
      res.status(500).json({ 
        message: "Failed to start Gmail reader",
        error: error instanceof Error ? error.message : String(error)
      });
    }
  });

  // Stop Gmail reader
  app.post("/api/gmail-reader/stop", (_req: Request, res: Response) => {
    try {
      gmailReader.stop();
      res.json({ message: "Gmail reader stopped successfully" });
    } catch (error) {
      res.status(500).json({ 
        message: "Failed to stop Gmail reader",
        error: error instanceof Error ? error.message : String(error)
      });
    }
  });
  
  // Clean up Gmail reader processed email logs by date
  app.post("/api/gmail-reader/cleanup-logs", (req: Request, res: Response) => {
    try {
      const { beforeDate, afterDate, daysToKeep } = req.body;
      
      // Parse dates if provided
      const options: { before?: Date, after?: Date, daysToKeep?: number } = {};
      
      if (beforeDate) {
        options.before = new Date(beforeDate);
      }
      
      if (afterDate) {
        options.after = new Date(afterDate);
      }
      
      if (daysToKeep) {
        options.daysToKeep = parseInt(daysToKeep, 10);
      }
      
      // Perform the cleanup
      const result = gmailReader.cleanupEmailLogsByDate(options);
      
      res.json({
        message: `Successfully cleaned up email logs: removed ${result.entriesRemoved}, kept ${result.entriesKept}`,
        ...result
      });
    } catch (error) {
      res.status(500).json({ 
        message: "Failed to clean up Gmail reader logs",
        error: error instanceof Error ? error.message : String(error)
      });
    }
  });
  
  // Full system cleanup endpoint
  app.post("/api/system/full-cleanup", async (req: Request, res: Response) => {
    try {
      const { confirmText } = req.body;
      
      // Safety check - require explicit confirmation
      if (confirmText !== "DELETE ALL DATA") {
        return res.status(400).json({
          message: "Confirmation failed. Please provide the correct confirmation text."
        });
      }
      
      // Stop Gmail reader first if it's running
      if (gmailReader.getStatus().isRunning) {
        gmailReader.stop();
      }
      
      // Clear email processing logs
      const emailLogsResult = gmailReader.clearAllEmailLogs();
      
      // Clear database (delete all campaigns and URLs)
      const dbResult = await storage.fullSystemCleanup();
      
      res.json({ 
        message: "Full system cleanup completed successfully", 
        result: {
          campaignsDeleted: dbResult.campaignsDeleted,
          urlsDeleted: dbResult.urlsDeleted,
          emailLogsCleared: emailLogsResult.success,
          emailLogsRemoved: emailLogsResult.entriesRemoved
        }
      });
    } catch (error) {
      console.error("Error performing full system cleanup:", error);
      res.status(500).json({ 
        message: "Failed to perform full system cleanup",
        error: error instanceof Error ? error.message : String(error)
      });
    }
  });

  const httpServer = createServer(app);
  return httpServer;
}

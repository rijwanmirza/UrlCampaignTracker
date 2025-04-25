import type { Express, Request, Response, NextFunction } from "express";
import { createServer, type Server } from "http";
import spdy from 'spdy';
import type { Server as SpdyServer } from 'spdy';
import { storage } from "./storage";
import { 
  insertCampaignSchema, 
  updateCampaignSchema,
  insertUrlSchema, 
  updateUrlSchema,
  bulkUrlActionSchema,
  insertTrafficstarCredentialSchema,
  trafficstarCampaignActionSchema,
  trafficstarCampaignBudgetSchema,
  trafficstarCampaignEndTimeSchema,
  trafficstarCampaigns,
  campaigns 
} from "@shared/schema";
import { ZodError, z } from "zod";
import { fromZodError } from "zod-validation-error";
import { gmailReader } from "./gmail-reader";
import { trafficStarService } from "./trafficstar-service-fix";
import { db } from "./db";
import { eq } from "drizzle-orm";
import Imap from "imap";
import axios from "axios";

export async function registerRoutes(app: Express): Promise<Server> {
  // Just create a regular HTTP server for now
  // We'll handle HTTP/2 headers in the route handlers
  const server = createServer(app);
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
      console.log('🔍 DEBUG: Campaign creation request received:', JSON.stringify(req.body, null, 2));
      
      // Parse and validate the input data
      const result = insertCampaignSchema.safeParse(req.body);
      if (!result.success) {
        const validationError = fromZodError(result.error);
        console.log('🔍 DEBUG: Campaign validation failed:', validationError.message);
        return res.status(400).json({ message: validationError.message });
      }
      
      // Ensure multiplier is properly processed
      const campaignData = result.data;
      
      // Log the validated data
      console.log('🔍 DEBUG: Validated campaign data:', JSON.stringify(campaignData, null, 2));
      console.log('🔍 DEBUG: Multiplier type:', typeof campaignData.multiplier);
      console.log('🔍 DEBUG: Multiplier value:', campaignData.multiplier);
      
      // Create the campaign
      const campaign = await storage.createCampaign(campaignData);
      console.log('🔍 DEBUG: Campaign created successfully with ID:', campaign.id);
      
      res.status(201).json(campaign);
    } catch (error) {
      console.error('Error creating campaign:', error);
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
      
      console.log('🔍 DEBUG: Campaign update request received:', JSON.stringify(req.body, null, 2));
      console.log('🔍 DEBUG: Campaign update request TYPE:', typeof req.body.pricePerThousand);
      console.log('🔍 DEBUG: Campaign update request VALUE:', req.body.pricePerThousand);
      
      const result = updateCampaignSchema.safeParse(req.body);
      if (!result.success) {
        const validationError = fromZodError(result.error);
        console.log('🔍 DEBUG: Campaign update validation failed:', validationError.message);
        return res.status(400).json({ message: validationError.message });
      }
      
      // Check if multiplier is being updated
      const { multiplier } = result.data;
      const existingCampaign = await storage.getCampaign(id);
      
      if (!existingCampaign) {
        return res.status(404).json({ message: "Campaign not found" });
      }
      
      console.log('🔍 DEBUG: Campaign update requested: ID', id);
      
      // Handle multiplier data type conversions for comparison
      const oldMultiplierValue = typeof existingCampaign.multiplier === 'string'
        ? parseFloat(existingCampaign.multiplier)
        : (existingCampaign.multiplier || 1);
      
      const newMultiplierValue = multiplier !== undefined ? Number(multiplier) : oldMultiplierValue;
      
      console.log(`  - Current multiplier: ${oldMultiplierValue} (type: ${typeof oldMultiplierValue})`);
      console.log(`  - Requested multiplier: ${newMultiplierValue} (type: ${typeof newMultiplierValue})`);
      
      // Update campaign first
      const updatedCampaign = await storage.updateCampaign(id, result.data);
      
      // Check if multiplier actually changed (compare numeric values)
      const multiplierChanged = multiplier !== undefined && 
        Math.abs(oldMultiplierValue - newMultiplierValue) > 0.00001; // Floating point comparison with small epsilon
      
      if (multiplierChanged) {
        console.log(`🔍 DEBUG: Multiplier change detected: ${oldMultiplierValue} → ${newMultiplierValue}`);
        
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
          const newClickLimit = Math.ceil(url.originalClickLimit * newMultiplierValue);
          
          console.log(`  - Updating URL ${url.id}: ${url.originalClickLimit} × ${newMultiplierValue} = ${newClickLimit}`);
          
          await storage.updateUrl(url.id, {
            clickLimit: newClickLimit, // Recalculate the click limit
            // Keep all other values unchanged
            originalClickLimit: url.originalClickLimit, // Original always stays the same
            name: url.name,
            targetUrl: url.targetUrl,
            status: url.status as 'active' | 'paused' | 'completed' | 'deleted' | 'rejected' | undefined
          });
        }
      } else {
        console.log('🔍 DEBUG: No multiplier change detected, skipping URL updates');
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
      if (campaign.multiplier) {
        // Convert multiplier to number if it's a string
        const multiplierValue = typeof campaign.multiplier === 'string' 
          ? parseFloat(campaign.multiplier) 
          : campaign.multiplier;
        
        // Apply multiplier if greater than 0.01
        if (multiplierValue > 0.01) {
          calculatedClickLimit = Math.ceil(originalClickLimit * multiplierValue);
          console.log('🔍 DEBUG: Calculated click limit after multiplier:', calculatedClickLimit);
          console.log(`🔍 DEBUG: Calculation: ${originalClickLimit} × ${multiplierValue} = ${calculatedClickLimit}`);
        }
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
        if (campaign && campaign.multiplier) {
          // Convert multiplier to number if it's a string
          const multiplierValue = typeof campaign.multiplier === 'string'
            ? parseFloat(campaign.multiplier)
            : campaign.multiplier;
          
          // Apply multiplier if greater than 0.01
          if (multiplierValue > 0.01) {
            // Save the new originalClickLimit (user input)
            const newOriginalLimit = parseInt(updateData.clickLimit, 10);
            
            // Apply campaign multiplier to get the new required limit
            updateData.clickLimit = Math.ceil(newOriginalLimit * multiplierValue);
            updateData.originalClickLimit = newOriginalLimit;
            
            console.log('🔍 DEBUG: URL updated with new limits:');
            console.log(`  - Original user input: ${newOriginalLimit}`);
            console.log(`  - After multiplier (${multiplierValue}x): ${updateData.clickLimit}`);
            console.log(`  - Calculation: ${newOriginalLimit} × ${multiplierValue} = ${updateData.clickLimit}`);
          }
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
          
        case "http2_307_temporary":
          // Ultra-fast HTTP/2.0 307 Temporary Redirect (matching viralplayer.xyz implementation)
          // Clear any existing headers that might slow down the response
          res.removeHeader('X-Powered-By');
          res.removeHeader('Connection');
          res.removeHeader('Transfer-Encoding');
          
          // Set minimal headers for the fastest possible HTTP/2 redirect
          res.setHeader("content-length", "0");
          res.setHeader("location", targetUrl);
          res.setHeader("alt-svc", "h3=\":443\"; ma=86400");
          
          // Send immediate response without any processing delay
          res.writeHead(307);
          res.end();
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
      
      console.log(`Processing custom path request for: ${customPath}`);
      
      // Get the campaign by custom path with fresh database lookup
      const campaign = await storage.getCampaignByCustomPath(customPath);
      if (!campaign) {
        console.log(`Campaign not found for custom path: ${customPath}`);
        return res.status(404).json({ message: "Campaign not found" });
      }
      
      console.log(`Found campaign ID ${campaign.id} for custom path: ${customPath}`);
      console.log(`Campaign has ${campaign.urls.length} total URLs`);
      console.log(`Campaign has ${campaign.urls.filter(url => url.isActive).length} active URLs`);
      
      // Use our optimized method to get a URL based on weighted distribution
      const selectedUrl = await storage.getRandomWeightedUrl(campaign.id);
      
      // If no active URLs are available, show an error message
      if (!selectedUrl) {
        console.log(`No active URLs available for campaign ID ${campaign.id}`);
        return res.status(410).json({ message: "All URLs in this campaign have reached their click limits" });
      }
      
      console.log(`Selected URL ID ${selectedUrl.id} (${selectedUrl.name}) for redirect`);
      
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
          
        case "http2_307_temporary":
          // HTTP/2.0 307 Temporary Redirect (matching viralplayer.xyz implementation)
          res.setHeader("X-Processing-Time", `${timeInMs}ms`);
          
          // Note: True HTTP/2.0 requires HTTPS in production
          // These headers help indicate HTTP/2.0 intention
          res.setHeader("X-HTTP2-Version", "HTTP/2.0");
          res.setHeader("Alt-Svc", "h2=\":443\"; ma=86400");
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
            `bc45=fpc0|${randomId}::351:55209; SameSite=Lax; Max-Age=31536000; Expires=${cookieExpiryString}`,
            `rc45=fpc0|${randomId}::28; SameSite=Lax; Max-Age=31536000; Expires=${cookieExpiryString}`,
            `uclick=mr7ZxwtaaNs1gOWlamCY4hIUD7craeFLJuyMJz3hmBMFe4/9c70RDu5SgPFmEHXMW9DJfw==; SameSite=Lax; Max-Age=31536000`,
            `bcid=d0505amc402c73djlgl0; SameSite=Lax; Max-Age=31536000`
          ]);
          
          // Generate a random CF-Ray value
          const cfRay = Math.random().toString(16).substring(2, 11) + "a3fe-EWR";
          res.setHeader("cf-ray", cfRay);
          
          // Alt-Svc header for HTTP/3 protocol negotiation
          res.setHeader("alt-svc", "h3=\":443\"; ma=86400");
          
          // Send 307 redirect
          res.status(307).end();
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

      console.log(`Processing campaign ID: ${campaignId}`);
      
      // Get the campaign to check if it exists - use fresh data 
      const campaign = await storage.getCampaign(campaignId);
      if (!campaign) {
        console.log(`Campaign not found for ID: ${campaignId}`);
        return res.status(404).json({ message: "Campaign not found" });
      }
      
      console.log(`Found campaign ID ${campaign.id}`);
      console.log(`Campaign has ${campaign.urls.length} total URLs`);
      console.log(`Campaign has ${campaign.urls.filter(url => url.isActive).length} active URLs`);
      
      // Use our optimized method to get a URL based on weighted distribution
      const selectedUrl = await storage.getRandomWeightedUrl(campaignId);
      
      // If no active URLs are available, show an error
      if (!selectedUrl) {
        console.log(`No active URLs available for campaign ID ${campaignId}`);
        return res.status(410).json({ message: "All URLs in this campaign have reached their click limits" });
      }
      
      console.log(`Selected URL ID ${selectedUrl.id} (${selectedUrl.name}) for redirect`);
      
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
          
        case "http2_307_temporary":
          // HTTP/2.0 307 Temporary Redirect (matching viralplayer.xyz implementation)
          res.setHeader("X-Processing-Time", `${timeInMs}ms`);
          
          // Note: True HTTP/2.0 requires HTTPS in production
          // These headers help indicate HTTP/2.0 intention
          res.setHeader("X-HTTP2-Version", "HTTP/2.0");
          res.setHeader("Alt-Svc", "h2=\":443\"; ma=86400");
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
            `bc45=fpc0|${randomId}::351:55209; SameSite=Lax; Max-Age=31536000; Expires=${cookieExpiryString}`,
            `rc45=fpc0|${randomId}::28; SameSite=Lax; Max-Age=31536000; Expires=${cookieExpiryString}`,
            `uclick=mr7ZxwtaaNs1gOWlamCY4hIUD7craeFLJuyMJz3hmBMFe4/9c70RDu5SgPFmEHXMW9DJfw==; SameSite=Lax; Max-Age=31536000`,
            `bcid=d0505amc402c73djlgl0; SameSite=Lax; Max-Age=31536000`
          ]);
          
          // Generate a random CF-Ray value
          const cfRay = Math.random().toString(16).substring(2, 11) + "a3fe-EWR";
          res.setHeader("cf-ray", cfRay);
          
          // Alt-Svc header for HTTP/3 protocol negotiation
          res.setHeader("alt-svc", "h3=\":443\"; ma=86400");
          
          // Send 307 redirect
          res.status(307).end();
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
    checkInterval: z.number().int().positive().default(60000),
    // Make sure auto-delete minutes is properly typed and validated
    autoDeleteMinutes: z.number().int().nonnegative().default(0).transform(val => 
      // Explicitly convert to number to handle string values from form submissions
      typeof val === 'string' ? parseInt(val, 10) : val
    )
  });

  // Get Gmail reader status
  app.get("/api/gmail-reader/status", (_req: Request, res: Response) => {
    try {
      const status = gmailReader.getStatus();
      
      // Make sure autoDeleteMinutes is explicitly included (in case it's undefined or not set)
      if (status.config && typeof status.config.autoDeleteMinutes !== 'number') {
        status.config.autoDeleteMinutes = 0; // Default value if not set
      }
      
      console.log('🔍 DEBUG: Returning Gmail status with autoDeleteMinutes:', 
                  status.config?.autoDeleteMinutes);
      
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
        },
        // Ensure autoDeleteMinutes is explicitly set (and default to 0 if undefined)
        autoDeleteMinutes: typeof result.data.autoDeleteMinutes === 'number' 
          ? result.data.autoDeleteMinutes 
          : 0
      };
      
      console.log('🔍 DEBUG: Updating Gmail config with autoDeleteMinutes:', config.autoDeleteMinutes);
      
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
      // Get the current config to preserve important settings like autoDeleteMinutes
      const currentConfig = gmailReader.getStatus().config;
      
      // Create a temporary config that preserves important settings
      const tempConfig = {
        user,
        password,
        host,
        port, 
        tls,
        whitelistSenders: ['help@donot-reply.in'], // Include the requested whitelist
        autoDeleteMinutes: currentConfig?.autoDeleteMinutes || 0 // Preserve auto-delete setting
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
  
  // Reset Gmail tracking system (clear all processed email logs)
  app.post("/api/gmail-reader/reset-tracking", (_req: Request, res: Response) => {
    try {
      // Stop the Gmail reader first to clear any in-progress operations
      gmailReader.stop();
      
      // Clear all email logs
      const result = gmailReader.clearAllEmailLogs();
      
      // Restart with a clean state after a short delay
      setTimeout(() => {
        // Start Gmail reader again to force a fresh scan
        gmailReader.start();
        
        console.log('Gmail reader restarted with clean tracking state for fresh email scan');
      }, 2000);
      
      res.json({
        success: true,
        message: `Gmail tracking system reset successfully. Removed ${result.entriesRemoved} entries. Reader restarted to perform a complete fresh scan.`,
        details: result
      });
    } catch (error) {
      res.status(500).json({
        success: false,
        message: `Error resetting Gmail tracking system: ${error instanceof Error ? error.message : String(error)}`,
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
  
  // Database migration - update campaign multiplier to decimal type
  app.post("/api/system/migrate-decimal-multiplier", async (_req: Request, res: Response) => {
    try {
      // Import the migration function
      const { updateMultiplierToDecimal } = await import("./migrations/decimal-multiplier");
      
      // Execute the migration
      const result = await updateMultiplierToDecimal();
      
      if (result.success) {
        console.log("✅ Multiplier migration successful:", result.message);
        res.status(200).json({
          message: "Multiplier migration completed successfully",
          details: result.message
        });
      } else {
        console.error("❌ Multiplier migration failed:", result.message);
        res.status(500).json({
          message: "Multiplier migration failed",
          details: result.message
        });
      }
    } catch (error) {
      console.error("Failed to run multiplier migration:", error);
      res.status(500).json({ message: "Failed to run multiplier migration" });
    }
  });

  // TrafficStar API Routes

  // Check if TrafficStar API is configured (has API key)
  app.get("/api/trafficstar/status", async (_req: Request, res: Response) => {
    try {
      const isConfigured = await trafficStarService.isConfigured();
      res.json({ configured: isConfigured });
    } catch (error) {
      console.error('Error checking TrafficStar configuration:', error);
      res.status(500).json({ 
        message: "Failed to check TrafficStar configuration",
        error: error instanceof Error ? error.message : String(error)
      });
    }
  });

  // Save TrafficStar API key
  app.post("/api/trafficstar/config", async (req: Request, res: Response) => {
    try {
      const result = insertTrafficstarCredentialSchema.safeParse(req.body);
      if (!result.success) {
        const validationError = fromZodError(result.error);
        return res.status(400).json({ message: validationError.message });
      }

      await trafficStarService.saveApiKey(result.data.apiKey);
      res.json({ success: true, message: "TrafficStar API key saved successfully" });
    } catch (error) {
      console.error('Error saving TrafficStar API key:', error);
      res.status(500).json({ 
        message: "Failed to save TrafficStar API key",
        error: error instanceof Error ? error.message : String(error)
      });
    }
  });

  // Get TrafficStar campaigns
  app.get("/api/trafficstar/campaigns", async (_req: Request, res: Response) => {
    try {
      const campaigns = await trafficStarService.getCampaigns();
      res.json(campaigns);
    } catch (error) {
      console.error('Error fetching TrafficStar campaigns:', error);
      res.status(500).json({ 
        message: "Failed to fetch TrafficStar campaigns",
        error: error instanceof Error ? error.message : String(error)
      });
    }
  });

  // Get TrafficStar campaign by ID
  app.get("/api/trafficstar/campaigns/:id", async (req: Request, res: Response) => {
    try {
      const id = parseInt(req.params.id);
      if (isNaN(id)) {
        return res.status(400).json({ message: "Invalid campaign ID" });
      }

      const campaign = await trafficStarService.getCampaign(id);
      res.json(campaign);
    } catch (error) {
      console.error(`Error fetching TrafficStar campaign ${req.params.id}:`, error);
      res.status(500).json({ 
        message: `Failed to fetch TrafficStar campaign ${req.params.id}`,
        error: error instanceof Error ? error.message : String(error)
      });
    }
  });

  // Get all campaigns' daily spending data for current UTC date
  app.get("/api/trafficstar/daily-spending", async (_req: Request, res: Response) => {
    try {
      // Import the function from debug-endpoint
      const { getAllCampaignsDailySpending } = await import('./debug-endpoint');
      const spendingData = await getAllCampaignsDailySpending();
      res.json(spendingData);
    } catch (error) {
      console.error(`Error fetching all TrafficStar campaign daily spending:`, error);
      res.status(500).json({ 
        message: `Failed to fetch daily spending for all TrafficStar campaigns`,
        error: error instanceof Error ? error.message : String(error)
      });
    }
  });
  
  // Get campaign daily spending data for current UTC date from TrafficStar API
  app.get("/api/trafficstar/campaigns/:id/spending", async (req: Request, res: Response) => {
    // Use our debug endpoint implementation for testing
    const { testCustomReport } = await import('./debug-endpoint');
    await testCustomReport(req, res);
  });

  // Get saved TrafficStar campaigns from database
  app.get("/api/trafficstar/saved-campaigns", async (_req: Request, res: Response) => {
    try {
      const campaigns = await trafficStarService.getSavedCampaigns();
      res.json(campaigns);
    } catch (error) {
      console.error('Error fetching saved TrafficStar campaigns:', error);
      res.status(500).json({ 
        message: "Failed to fetch saved TrafficStar campaigns",
        error: error instanceof Error ? error.message : String(error)
      });
    }
  });

  // Perform campaign action (pause/activate)
  app.post("/api/trafficstar/campaigns/action", async (req: Request, res: Response) => {
    try {
      const result = trafficstarCampaignActionSchema.safeParse(req.body);
      if (!result.success) {
        const validationError = fromZodError(result.error);
        return res.status(400).json({ message: validationError.message });
      }

      const { campaignId, action } = result.data;

      // INSTANT DB UPDATE FIRST - Make the change instantly visible in the UI
      try {
        const targetActive = action === 'activate';
        const targetStatus = action === 'activate' ? 'enabled' : 'paused';
        
        // Update database first - this is what the user will see immediately
        await db.update(trafficstarCampaigns)
          .set({ 
            active: targetActive,
            status: targetStatus,
            lastRequestedAction: action,
            lastRequestedActionAt: new Date(),
            updatedAt: new Date() 
          })
          .where(eq(trafficstarCampaigns.trafficstarId, campaignId.toString()));
      } catch (dbError) {
        console.error(`Error updating campaign ${campaignId} in database: ${dbError}`);
        // Continue even if there's an error, as the API call might still work
      }
      
      // IMMEDIATE RESPONSE - Respond to user right away
      res.json({ 
        success: true, 
        message: `Campaign ${campaignId} ${action === 'pause' ? 'paused' : 'activated'} successfully`,
        statusChanged: true, // Always true since we updated DB first
        pendingSync: false, // Don't show pending status in UI
        lastRequestedAction: action,
        lastRequestedActionAt: new Date().toISOString(),
        timestamp: new Date().toISOString()
      });
      
      // BACKGROUND API CALL - Process API call after response is sent
      // This way API delays won't affect the user experience
      setTimeout(() => {
        try {
          if (action === 'pause') {
            trafficStarService.pauseCampaign(campaignId)
              .catch(error => console.error(`Background API call to pause campaign ${campaignId} failed:`, error));
          } else if (action === 'activate') {
            trafficStarService.activateCampaign(campaignId)
              .catch(error => console.error(`Background API call to activate campaign ${campaignId} failed:`, error));
          }
        } catch (apiError) {
          console.error(`Error in background API operation for campaign ${campaignId}:`, apiError);
          // Error in background process - already responded to user, so just log it
        }
      }, 100); // Start background processing after a small delay
    } catch (error) {
      console.error('Error performing TrafficStar campaign action:', error);
      res.status(500).json({ 
        message: "Failed to perform TrafficStar campaign action",
        error: error instanceof Error ? error.message : String(error)
      });
    }
  });

  // Update campaign daily budget
  app.post("/api/trafficstar/campaigns/budget", async (req: Request, res: Response) => {
    try {
      const result = trafficstarCampaignBudgetSchema.safeParse(req.body);
      if (!result.success) {
        const validationError = fromZodError(result.error);
        return res.status(400).json({ message: validationError.message });
      }

      const { campaignId, maxDaily } = result.data;
      
      // Update database first for immediate UI response
      try {
        await db.update(trafficstarCampaigns)
          .set({ 
            maxDaily: maxDaily.toString(), // Convert to string for DB numeric type
            lastBudgetUpdate: new Date(),
            lastBudgetUpdateValue: maxDaily.toString(), // Store the exact value we're setting
            updatedAt: new Date() 
          })
          .where(eq(trafficstarCampaigns.trafficstarId, campaignId.toString()));
      } catch (dbError) {
        console.error(`Error updating campaign budget ${campaignId} in database: ${dbError}`);
        // Continue even if there's an error, as the API call might still work
      }
      
      // IMMEDIATE RESPONSE - Respond to user right away
      res.json({ 
        success: true, 
        message: `Campaign ${campaignId} budget updated to ${maxDaily} successfully`,
        timestamp: new Date().toISOString()
      });
      
      // BACKGROUND API CALL - Process API call after response is sent
      setTimeout(() => {
        try {
          trafficStarService.updateCampaignDailyBudget(campaignId, maxDaily)
            .catch(error => console.error(`Background API call to update budget for campaign ${campaignId} failed:`, error));
            
          // Refresh campaign in background
          trafficStarService.getCampaign(campaignId)
            .catch(error => console.error(`Background API call to refresh campaign ${campaignId} failed:`, error));
        } catch (apiError) {
          console.error(`Error in background budget update for campaign ${campaignId}:`, apiError);
          // Error in background process - already responded to user, so just log it
        }
      }, 100); // Start background processing after a small delay
    } catch (error) {
      console.error('Error updating TrafficStar campaign budget:', error);
      res.status(500).json({ 
        message: "Failed to update TrafficStar campaign budget",
        error: error instanceof Error ? error.message : String(error)
      });
    }
  });

  // Run multiple campaigns simultaneously
  app.post("/api/trafficstar/campaigns/run-multiple", async (req: Request, res: Response) => {
    try {
      const { campaignIds } = req.body;
      
      if (!campaignIds || !Array.isArray(campaignIds) || campaignIds.length === 0) {
        return res.status(400).json({ message: "Invalid campaign IDs. Please provide an array of campaign IDs." });
      }
      
      // Validate all campaign IDs are numbers
      const validIds = campaignIds.filter(id => !isNaN(Number(id))).map(id => Number(id));
      if (validIds.length === 0) {
        return res.status(400).json({ message: "No valid campaign IDs provided" });
      }
      
      // Immediate response to user - we'll process in background
      res.json({
        success: true,
        message: `Processing ${validIds.length} campaigns for activation`,
        campaignIds: validIds,
        timestamp: new Date().toISOString()
      });
      
      // Process activations in background using the batch API method
      setTimeout(async () => {
        try {
          console.log(`Starting batch activation of ${validIds.length} campaigns using V2 API...`);
          
          // Use the new batch activation method
          const result = await trafficStarService.activateMultipleCampaigns(validIds);
          
          // Log the complete results
          console.log(`Completed batch activation of ${validIds.length} campaigns.`);
          console.log(`Success: ${result.success.length} campaigns - ${result.success.join(', ')}`);
          
          if (result.failed.length > 0) {
            console.log(`Failed: ${result.failed.length} campaigns - ${result.failed.join(', ')}`);
          } else {
            console.log(`No failures reported.`);
          }
        } catch (batchError) {
          // If the batch activation fails, fall back to individual activation
          console.error(`Batch activation failed, falling back to individual activations:`, batchError);
          
          const results = {
            success: [] as number[],
            failed: [] as number[],
            total: validIds.length
          };
          
          // Process campaigns in parallel as a fallback
          await Promise.all(validIds.map(async (id) => {
            try {
              // Activate the campaign via TrafficStar API (individual method)
              await trafficStarService.activateCampaign(id);
              
              // Update database record for immediate UI feedback on refresh
              await db.update(trafficstarCampaigns)
                .set({ 
                  active: true,
                  status: 'active',
                  lastRequestedAction: 'activate',
                  lastRequestedActionAt: new Date(),
                  lastRequestedActionSuccess: true,
                  updatedAt: new Date() 
                })
                .where(eq(trafficstarCampaigns.trafficstarId, id.toString()));
                
              results.success.push(id);
              console.log(`✅ Successfully activated campaign ${id} (fallback method)`);
            } catch (error) {
              results.failed.push(id);
              console.error(`❌ Failed to activate campaign ${id}:`, error);
              
              // Update database record with failure
              await db.update(trafficstarCampaigns)
                .set({ 
                  lastRequestedAction: 'activate',
                  lastRequestedActionAt: new Date(),
                  lastRequestedActionSuccess: false,
                  updatedAt: new Date()
                })
                .where(eq(trafficstarCampaigns.trafficstarId, id.toString()));
            }
          }));
          
          console.log(`Completed fallback activation of ${validIds.length} campaigns. Success: ${results.success.length}, Failed: ${results.failed.length}`);
        }
      }, 100); // Start processing after response is sent
      
    } catch (error) {
      console.error('Error in batch campaign activation:', error);
      res.status(500).json({ 
        message: "Failed to process campaign batch activation",
        error: error instanceof Error ? error.message : String(error)
      });
    }
  });

  // Force immediate budget update for a campaign (used when budget update time changes)
  app.post("/api/trafficstar/campaigns/force-budget-update", async (req: Request, res: Response) => {
    try {
      const { campaignId } = req.body;
      
      if (!campaignId || isNaN(Number(campaignId))) {
        return res.status(400).json({ message: "Invalid campaign ID" });
      }

      // Get campaign from database
      const campaign = await storage.getCampaign(Number(campaignId));
      if (!campaign) {
        return res.status(404).json({ message: "Campaign not found" });
      }

      // Only process if TrafficStar integration is enabled
      if (!campaign.trafficstarCampaignId || !campaign.autoManageTrafficstar) {
        return res.status(400).json({ 
          message: "Cannot force budget update: TrafficStar integration not enabled for this campaign" 
        });
      }

      // Manually trigger auto-management for this campaign
      console.log(`🔄 Forcing immediate TrafficStar budget update for campaign ${campaignId}`);
      
      try {
        // Set daily budget to $10.15 via TrafficStar API
        await trafficStarService.updateCampaignDailyBudget(
          Number(campaign.trafficstarCampaignId), 
          10.15
        );
        
        // Update last sync time in campaigns table
        await db.update(campaigns)
          .set({
            lastTrafficstarSync: new Date(),
            updatedAt: new Date()
          })
          .where(eq(campaigns.id, Number(campaignId)));
          
        return res.json({ 
          success: true, 
          message: `Budget for campaign ${campaignId} updated to $10.15 successfully`,
          timestamp: new Date().toISOString()
        });
      } catch (error) {
        console.error(`Error forcing budget update for campaign ${campaignId}:`, error);
        return res.status(500).json({ 
          success: false,
          message: "Failed to force budget update",
          error: error instanceof Error ? error.message : String(error)
        });
      }
    } catch (error) {
      console.error('Error forcing TrafficStar budget update:', error);
      res.status(500).json({ 
        message: "Failed to force TrafficStar budget update",
        error: error instanceof Error ? error.message : String(error)
      });
    }
  });

  // Update campaign end time
  app.post("/api/trafficstar/campaigns/end-time", async (req: Request, res: Response) => {
    try {
      const result = trafficstarCampaignEndTimeSchema.safeParse(req.body);
      if (!result.success) {
        const validationError = fromZodError(result.error);
        return res.status(400).json({ message: validationError.message });
      }

      const { campaignId, scheduleEndTime } = result.data;
      
      // Update database first for immediate UI response
      try {
        await db.update(trafficstarCampaigns)
          .set({ 
            scheduleEndTime: scheduleEndTime,
            lastEndTimeUpdate: new Date(),
            lastEndTimeUpdateValue: scheduleEndTime, // Store the exact value we're setting
            updatedAt: new Date() 
          })
          .where(eq(trafficstarCampaigns.trafficstarId, campaignId.toString()));
      } catch (dbError) {
        console.error(`Error updating campaign end time ${campaignId} in database: ${dbError}`);
        // Continue even if there's an error, as the API call might still work
      }
      
      // IMMEDIATE RESPONSE - Respond to user right away
      res.json({ 
        success: true, 
        message: `Campaign ${campaignId} end time updated to ${scheduleEndTime} successfully`,
        timestamp: new Date().toISOString()
      });
      
      // BACKGROUND API CALL - Process API call after response is sent
      setTimeout(() => {
        try {
          trafficStarService.updateCampaignEndTime(campaignId, scheduleEndTime)
            .catch(error => console.error(`Background API call to update end time for campaign ${campaignId} failed:`, error));
            
          // Refresh campaign in background
          trafficStarService.getCampaign(campaignId)
            .catch(error => console.error(`Background API call to refresh campaign ${campaignId} failed:`, error));
        } catch (apiError) {
          console.error(`Error in background end time update for campaign ${campaignId}:`, apiError);
          // Error in background process - already responded to user, so just log it
        }
      }, 100); // Start background processing after a small delay
    } catch (error) {
      console.error('Error updating TrafficStar campaign end time:', error);
      res.status(500).json({ 
        message: "Failed to update TrafficStar campaign end time",
        error: error instanceof Error ? error.message : String(error)
      });
    }
  });

  // Database migration - add TrafficStar fields to campaigns table
  app.post("/api/system/migrate-trafficstar-fields", async (_req: Request, res: Response) => {
    try {
      // Import the migration function
      const { addTrafficStarFields } = await import("./migrations/add-trafficstar-fields");
      
      // Execute the migration
      const result = await addTrafficStarFields();
      
      if (result.success) {
        console.log("✅ TrafficStar fields migration successful:", result.message);
        res.status(200).json({
          message: "TrafficStar fields migration completed successfully",
          details: result.message
        });
      } else {
        console.error("❌ TrafficStar fields migration failed:", result.message);
        res.status(500).json({
          message: "TrafficStar fields migration failed",
          details: result.message
        });
      }
    } catch (error) {
      console.error("Failed to add TrafficStar fields:", error);
      res.status(500).json({ message: "Failed to add TrafficStar fields to campaigns table" });
    }
  });
  
  // Check migration status - Find out if migrations are needed
  app.get("/api/system/check-migrations", async (_req: Request, res: Response) => {
    try {
      // Import the migration check functions
      const { 
        isBudgetUpdateTimeMigrationNeeded, 
        isTrafficStarFieldsMigrationNeeded 
      } = await import("./migrations/check-migration-needed");
      
      // Check migration status
      const budgetUpdateTimeMigrationNeeded = await isBudgetUpdateTimeMigrationNeeded();
      const trafficStarFieldsMigrationNeeded = await isTrafficStarFieldsMigrationNeeded();
      
      // Return migration status
      res.status(200).json({
        budgetUpdateTimeMigrationNeeded,
        trafficStarFieldsMigrationNeeded,
        migrationNeeded: budgetUpdateTimeMigrationNeeded || trafficStarFieldsMigrationNeeded,
        message: "Migration status checked successfully"
      });
    } catch (error) {
      console.error("Failed to check migration status:", error);
      res.status(500).json({ 
        message: "Failed to check migration status", 
        error: error instanceof Error ? error.message : String(error),
        // Assume migrations are needed if check fails
        migrationNeeded: true,
        budgetUpdateTimeMigrationNeeded: true,
        trafficStarFieldsMigrationNeeded: true
      });
    }
  });

  // Database migration - add budget update time field to campaigns table
  app.post("/api/system/migrate-budget-update-time", async (_req: Request, res: Response) => {
    try {
      // Import the migration function
      const { addBudgetUpdateTimeField } = await import("./migrations/add-budget-update-time");
      
      // Execute the migration
      const result = await addBudgetUpdateTimeField();
      
      if (result.success) {
        console.log("✅ Budget update time field migration successful");
        res.status(200).json({
          message: "Budget update time field migration completed successfully"
        });
      } else {
        console.error("❌ Budget update time field migration failed:", result.error);
        res.status(500).json({
          message: "Budget update time field migration failed",
          error: result.error
        });
      }
    } catch (error) {
      console.error("Failed to add budget update time field:", error);
      res.status(500).json({ message: "Failed to add budget update time field to campaigns table" });
    }
  });
  
  // DEBUG endpoint to get spending for a specific campaign
  app.get("/api/debug/trafficstar/spending/:id", async (req: Request, res: Response) => {
    try {
      const campaignId = parseInt(req.params.id);
      if (isNaN(campaignId)) {
        return res.status(400).json({ error: "Invalid campaign ID" });
      }
      
      console.log(`DEBUG: Getting spending for campaign ${campaignId}`);
      const spendingData = await trafficStarService.getCampaignSpending(campaignId);
      console.log(`DEBUG: Spending data:`, spendingData);
      
      res.json(spendingData);
    } catch (error) {
      console.error(`DEBUG: Error getting spending for campaign:`, error);
      res.status(500).json({ 
        error: "Failed to get campaign spending", 
        details: error instanceof Error ? error.message : String(error) 
      });
    }
  });
  
  // New endpoint specifically using advertiser/custom/report/by-day API
  app.get("/api/debug/trafficstar/custom-report/:id", async (req: Request, res: Response) => {
    // Use the isolated debug endpoint implementation
    const { testCustomReport } = await import('./debug-endpoint');
    await testCustomReport(req, res);
  });

  // Debug endpoint to get daily spending for all campaigns
  app.get("/api/debug/trafficstar/all-spending", async (_req: Request, res: Response) => {
    try {
      // Import the function from debug-endpoint
      const { getAllCampaignsDailySpending } = await import('./debug-endpoint');
      const spendingData = await getAllCampaignsDailySpending();
      res.json(spendingData);
    } catch (error) {
      console.error(`Error fetching debug daily spending data:`, error);
      res.status(500).json({ 
        message: `Failed to fetch debug daily spending data`,
        error: error instanceof Error ? error.message : String(error)
      });
    }
  });

  // Create an HTTP/2 capable server
  // We're using a regular HTTP server instead of SPDY for now due to compatibility issues
  // We'll handle the HTTP/2.0 headers in the individual route handlers
  return server;
}

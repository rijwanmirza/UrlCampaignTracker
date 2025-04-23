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
import { ZodError } from "zod";
import { fromZodError } from "zod-validation-error";

export async function registerRoutes(app: Express): Promise<Server> {
  // API route for campaigns
  app.get("/api/campaigns", async (_req: Request, res: Response) => {
    try {
      const campaigns = await storage.getCampaigns();
      res.json(campaigns);
    } catch (error) {
      res.status(500).json({ message: "Failed to fetch campaigns" });
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
      
      // Update campaign first
      const updatedCampaign = await storage.updateCampaign(id, result.data);
      
      // If multiplier changed, update all active/paused URLs in the campaign
      if (multiplier && multiplier !== existingCampaign.multiplier) {
        // Get all active/paused URLs
        const campaignUrls = await storage.getUrls(id);
        const activeOrPausedUrls = campaignUrls.filter(
          url => url.status === 'active' || url.status === 'paused'
        );
        
        // Update each URL with new clickLimit based on original value * new multiplier
        for (const url of activeOrPausedUrls) {
          // Include the original click limit in the update
          await storage.updateUrl(url.id, {
            clickLimit: url.originalClickLimit * multiplier,
            originalClickLimit: url.originalClickLimit,
            // Keep other values unchanged
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

      // Store original click limit and apply campaign multiplier if set
      const originalClickLimit = req.body.clickLimit;
      let urlData = { 
        ...req.body, 
        campaignId,
        originalClickLimit 
      };
      
      if (campaign.multiplier && campaign.multiplier > 1 && urlData.clickLimit) {
        // Multiply the click limit by the campaign multiplier
        urlData.clickLimit = urlData.clickLimit * campaign.multiplier;
      }
      
      const result = insertUrlSchema.safeParse(urlData);
      if (!result.success) {
        const validationError = fromZodError(result.error);
        return res.status(400).json({ message: validationError.message });
      }

      const url = await storage.createUrl(result.data);
      res.status(201).json(url);
    } catch (error) {
      res.status(500).json({ message: "Failed to create URL" });
    }
  });

  app.put("/api/urls/:id", async (req: Request, res: Response) => {
    try {
      const id = parseInt(req.params.id);
      if (isNaN(id)) {
        return res.status(400).json({ message: "Invalid URL ID" });
      }

      const result = updateUrlSchema.safeParse(req.body);
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

  const httpServer = createServer(app);
  return httpServer;
}

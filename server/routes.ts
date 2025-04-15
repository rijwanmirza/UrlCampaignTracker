import type { Express, Request, Response } from "express";
import { createServer, type Server } from "http";
import { storage } from "./storage";
import { insertCampaignSchema, insertUrlSchema, updateUrlSchema } from "@shared/schema";
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

      const urlData = { ...req.body, campaignId };
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

  // Redirect endpoint
  app.get("/r/:campaignId/:urlId", async (req: Request, res: Response) => {
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

      if (url.campaignId !== campaignId) {
        return res.status(400).json({ message: "URL does not belong to this campaign" });
      }

      if (url.clicks >= url.clickLimit) {
        return res.status(410).json({ message: "This link has reached its click limit" });
      }

      // Increment click count and redirect
      await storage.incrementUrlClicks(urlId);
      res.redirect(url.targetUrl);
    } catch (error) {
      res.status(500).json({ message: "Redirect failed" });
    }
  });

  const httpServer = createServer(app);
  return httpServer;
}

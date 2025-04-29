import { Request, Response } from "express";
import { redirectLogsManager } from "./redirect-logs-manager";
import { TimeRangeFilter } from "@shared/schema";
import { storage } from "./storage";

// API Routes for Campaign Redirect Logs
export function registerRedirectLogsRoutes(app: any) {

  // Get summary of campaign redirects with daily and hourly breakdown
  app.get("/api/redirect-logs/summary/:campaignId", async (req: Request, res: Response) => {
    try {
      const campaignId = parseInt(req.params.campaignId);
      
      if (isNaN(campaignId)) {
        return res.status(400).json({ message: "Invalid campaign ID" });
      }
      
      // Verify campaign exists
      const campaign = await storage.getCampaign(campaignId);
      if (!campaign) {
        return res.status(404).json({ message: "Campaign not found" });
      }
      
      // Build filter from query parameters
      const filterType = req.query.filterType as string || 'today';
      const showHourly = req.query.showHourly === 'true';
      
      const filter: TimeRangeFilter = {
        filterType: filterType as any,
        showHourly
      };
      
      // Add date range for custom filters
      if (filterType === 'custom_range') {
        if (req.query.startDate && req.query.endDate) {
          filter.startDate = req.query.startDate as string;
          filter.endDate = req.query.endDate as string;
        } else {
          return res.status(400).json({ 
            message: "startDate and endDate are required for custom_range filter type"
          });
        }
      }
      
      // Get redirect logs summary
      const summary = await redirectLogsManager.getCampaignSummary(campaignId, filter);
      
      res.json({
        ...summary,
        campaignName: campaign.name,
        campaignId: campaign.id
      });
    } catch (error) {
      console.error("Error fetching redirect logs summary:", error);
      res.status(500).json({
        message: "Failed to fetch redirect logs summary",
        error: error instanceof Error ? error.message : String(error)
      });
    }
  });
  
  // Get raw redirect logs for a campaign
  app.get("/api/redirect-logs/raw/:campaignId", async (req: Request, res: Response) => {
    try {
      const campaignId = parseInt(req.params.campaignId);
      
      if (isNaN(campaignId)) {
        return res.status(400).json({ message: "Invalid campaign ID" });
      }
      
      // Verify campaign exists
      const campaign = await storage.getCampaign(campaignId);
      if (!campaign) {
        return res.status(404).json({ message: "Campaign not found" });
      }
      
      // Get raw redirect logs from log file
      const logs = await redirectLogsManager.getRawRedirectLogs(campaignId);
      
      res.json({
        campaignName: campaign.name,
        campaignId: campaign.id,
        totalLogs: logs.length,
        logs
      });
    } catch (error) {
      console.error("Error fetching raw redirect logs:", error);
      res.status(500).json({
        message: "Failed to fetch raw redirect logs",
        error: error instanceof Error ? error.message : String(error)
      });
    }
  });
  
  // Generate test redirect logs for development and testing
  app.post("/api/redirect-logs/generate-test-data", async (req: Request, res: Response) => {
    try {
      const { campaignId, count = 100, days = 7 } = req.body;
      
      if (!campaignId) {
        return res.status(400).json({ message: "Campaign ID is required" });
      }
      
      // Verify campaign exists
      const campaign = await storage.getCampaign(parseInt(campaignId));
      if (!campaign) {
        return res.status(404).json({ message: "Campaign not found" });
      }
      
      // Get all URLs for this campaign
      const urls = await storage.getUrls(parseInt(campaignId));
      if (!urls || urls.length === 0) {
        return res.status(400).json({ message: "Campaign has no URLs" });
      }
      
      // Generate random test data
      const now = new Date();
      const records = [];
      
      // Generate random redirect logs over the specified number of days
      for (let i = 0; i < parseInt(count.toString()); i++) {
        // Random URL from campaign
        const url = urls[Math.floor(Math.random() * urls.length)];
        
        // Random timestamp in past N days (specified by 'days' parameter)
        const randomDayOffset = Math.floor(Math.random() * parseInt(days.toString()));
        const timestamp = new Date(now);
        timestamp.setDate(timestamp.getDate() - randomDayOffset);
        
        // Random hour of day bias (for realistic hourly patterns)
        const hour = Math.floor(Math.random() * 24);
        timestamp.setHours(hour);
        timestamp.setMinutes(Math.floor(Math.random() * 60));
        timestamp.setSeconds(Math.floor(Math.random() * 60));
        
        // Log a redirect
        await redirectLogsManager.logRedirect(
          parseInt(campaignId),
          url.id
        );
        
        records.push({
          timestamp,
          urlId: url.id
        });
      }
      
      res.json({
        success: true,
        message: `Generated ${count} test redirect logs for campaign #${campaignId} across ${days} days`,
        recordsGenerated: records.length
      });
    } catch (error) {
      console.error("Error generating test redirect logs:", error);
      res.status(500).json({
        message: "Failed to generate test redirect logs",
        error: error instanceof Error ? error.message : String(error)
      });
    }
  });
}
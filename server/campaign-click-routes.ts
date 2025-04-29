import { Request, Response } from "express";
import { storage } from "./storage";
import { TimeRangeFilter } from "@shared/schema";

// API Routes for Campaign Click Records
export function registerCampaignClickRoutes(app: any) {

  // Get all campaign click records with filtering
  app.get("/api/campaign-click-records", async (req: Request, res: Response) => {
    try {
      const page = parseInt(req.query.page as string) || 1;
      const limit = parseInt(req.query.limit as string) || 10;
      const search = req.query.search as string || undefined;
      const campaignId = req.query.campaignId ? parseInt(req.query.campaignId as string) : undefined;
      
      // Build filter from query parameters
      let filter: TimeRangeFilter | undefined;
      
      const filterType = req.query.filterType as string;
      if (filterType) {
        filter = {
          filterType: filterType as any,
          timezone: (req.query.timezone as string) || "UTC",
          showHourly: req.query.showHourly === 'true'
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
      }
      
      // Get records with filtering
      const result = await storage.getCampaignClickRecords(page, limit, campaignId, filter);
      
      // Enhance the records with campaign and URL names
      const enhancedRecords = await Promise.all(result.records.map(async (record) => {
        try {
          // Get campaign name
          let campaignName = "";
          if (record.campaignId) {
            const campaign = await storage.getCampaign(record.campaignId);
            if (campaign) {
              campaignName = campaign.name;
            }
          }
          
          // Get URL name if available
          let urlName = "";
          if (record.urlId) {
            const url = await storage.getUrl(record.urlId);
            if (url) {
              urlName = url.name;
            }
          }
          
          return {
            ...record,
            campaignName,
            urlName
          };
          
        } catch (error) {
          console.error("Error enhancing click record:", error);
          return {
            ...record,
            campaignName: `Campaign ${record.campaignId}`,
            urlName: record.urlId ? `URL ${record.urlId}` : null
          };
        }
      }));
      
      res.json({
        records: enhancedRecords,
        total: result.total,
        page,
        limit,
      });
    } catch (error) {
      console.error("Error fetching campaign click records:", error);
      res.status(500).json({
        message: "Failed to fetch campaign click records",
        error: error instanceof Error ? error.message : String(error)
      });
    }
  });
  
  // Get summary of campaign clicks with hourly breakdown
  app.get("/api/campaign-click-records/summary/:campaignId", async (req: Request, res: Response) => {
    try {
      const campaignId = parseInt(req.params.campaignId);
      
      if (isNaN(campaignId)) {
        return res.status(400).json({ message: "Invalid campaign ID" });
      }
      
      // Build filter from query parameters
      const filterType = req.query.filterType as string || 'today';
      const showHourly = req.query.showHourly === 'true';
      
      const filter: TimeRangeFilter = {
        filterType: filterType as any,
        timezone: (req.query.timezone as string) || "UTC",
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
      
      // Get campaign click summary
      const summary = await storage.getCampaignClickSummary(campaignId, filter);
      
      res.json(summary);
    } catch (error) {
      console.error("Error fetching campaign click summary:", error);
      res.status(500).json({
        message: "Failed to fetch campaign click summary",
        error: error instanceof Error ? error.message : String(error)
      });
    }
  });
  
  // Test endpoint to generate sample campaign click records
  app.post("/api/campaign-click-records/generate-test-data", async (req: Request, res: Response) => {
    try {
      const { campaignId, count = 100 } = req.body;
      
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
      
      // Generate random click records over the past week
      for (let i = 0; i < parseInt(count.toString()); i++) {
        // Random URL from campaign
        const url = urls[Math.floor(Math.random() * urls.length)];
        
        // Random timestamp in past 7 days
        const timestamp = new Date(
          now.getTime() - Math.floor(Math.random() * 7 * 24 * 60 * 60 * 1000)
        );
        
        // Random hour of day bias (for realistic hourly patterns)
        const hour = Math.floor(Math.random() * 24);
        timestamp.setHours(hour);
        
        // Record a campaign click
        await storage.recordCampaignClick(
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
        message: `Generated ${count} test click records for campaign #${campaignId}`,
        recordsGenerated: records.length
      });
    } catch (error) {
      console.error("Error generating test click records:", error);
      res.status(500).json({
        message: "Failed to generate test click records",
        error: error instanceof Error ? error.message : String(error)
      });
    }
  });
}
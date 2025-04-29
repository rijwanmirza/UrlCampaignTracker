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
      const userAgents = [
        "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36",
        "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/14.1.1 Safari/605.1.15",
        "Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:89.0) Gecko/20100101 Firefox/89.0",
        "Mozilla/5.0 (iPhone; CPU iPhone OS 14_6 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/14.0 Mobile/15E148 Safari/604.1",
        "Mozilla/5.0 (iPad; CPU OS 14_6 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/14.0 Mobile/15E148 Safari/604.1"
      ];
      
      const referers = [
        "https://www.google.com/",
        "https://www.facebook.com/",
        "https://www.instagram.com/",
        "https://www.twitter.com/",
        "https://www.reddit.com/",
        "https://www.youtube.com/",
        null
      ];
      
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
        
        // Random user agent and referer
        const userAgent = userAgents[Math.floor(Math.random() * userAgents.length)];
        const referer = referers[Math.floor(Math.random() * referers.length)];
        
        // Record a campaign click
        await storage.recordCampaignClick(
          parseInt(campaignId),
          url.id,
          `192.168.${Math.floor(Math.random() * 255)}.${Math.floor(Math.random() * 255)}`,
          userAgent,
          referer
        );
        
        records.push({
          timestamp,
          urlId: url.id,
          userAgent,
          referer
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
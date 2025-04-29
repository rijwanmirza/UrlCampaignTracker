import { Request, Response } from "express";
import { storage } from "./storage";
import { TimeRangeFilter, campaignRedirectLogs } from "@shared/schema";
import { format } from "date-fns";
import { db } from "./db";
import { eq, and, gte, lte } from "drizzle-orm";
import { redirectLogsManager } from "./redirect-logs-manager";

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
      
      // Build filter from query parameters - be very specific about filterType
      const filterType = (req.query.filterType as string) || 'today';
      const showHourly = req.query.showHourly === 'true';
      const timestamp = req.query._timestamp; // Used for cache-busting on the client side
      
      console.log(`📊 Filtering campaign ${campaignId} clicks with filter type: ${filterType} (timestamp: ${timestamp})`);
      
      // Create a properly typed filter object - ensure we create a new object and don't use references
      const filter: TimeRangeFilter = {
        filterType: filterType as any, // Explicitly set the filterType from request
        timezone: (req.query.timezone as string) || "UTC",
        showHourly
      };
      
      // Add date range for custom filters
      if (filterType === 'custom_range') {
        if (req.query.startDate && req.query.endDate) {
          filter.startDate = req.query.startDate as string;
          filter.endDate = req.query.endDate as string;
          console.log(`📊 Custom date range: ${filter.startDate} to ${filter.endDate}`);
        } else {
          return res.status(400).json({ 
            message: "startDate and endDate are required for custom_range filter type"
          });
        }
      }
      
      // Log the filter to help with debugging
      console.log(`📊 Using filter with exact type "${filter.filterType}" for summary query`);
      console.log(`📊 Complete filter object:`, JSON.stringify(filter));
      
      // Check if the campaign exists
      const campaign = await storage.getCampaign(campaignId);
      
      if (!campaign) {
        return res.status(404).json({ message: "Campaign not found" });
      }
      
      // Use the redirect logs system for accurate click data
      try {
        // Create a fresh filter object to prevent any reference issues
        const redirectLogsFilter: TimeRangeFilter = {
          ...filter,
          filterType: filterType as any, // Force the exact filterType to be used
        };
        
        console.log(`📊 Using filter with type '${redirectLogsFilter.filterType}' for redirect logs query`);
        
        // Pass the filter to the redirect logs system
        const redirectLogsSummary = await storage.getRedirectLogsSummary(campaignId, redirectLogsFilter);
        
        if (redirectLogsSummary) {
          console.log(`📊 Redirect logs summary for filter ${filterType}:`, {
            totalClicks: redirectLogsSummary.totalClicks,
            filterInfo: redirectLogsSummary.filterInfo
          });
          return res.json(redirectLogsSummary);
        }
      } catch (redirectLogsError) {
        console.error("Error getting redirect logs summary, falling back to campaign clicks:", redirectLogsError);
        // Continue with the regular campaign click summary as fallback
      }
      
      // Get campaign click summary from the original system (fallback)
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
      
      // Generate random click records over the specified number of days
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
        message: `Generated ${count} test click records for campaign #${campaignId} across ${days} days`,
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
  
  // Advanced test endpoint to generate click data across specific time periods
  app.post("/api/campaign-click-records/generate-specific-test-data", async (req: Request, res: Response) => {
    try {
      const { campaignId, clicksPerDay = 20 } = req.body;
      
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
      
      const now = new Date();
      let totalRecords = 0;
      const allRecords = [];
      
      // First clear existing logs for clean test data
      console.log(`🧹 Clearing existing redirect logs for campaign ${campaignId} before generating new test data`);
      try {
        await db.delete(campaignRedirectLogs)
          .where(eq(campaignRedirectLogs.campaignId, parseInt(campaignId)));
      } catch (err) {
        console.error("Error clearing existing logs:", err);
      }
      
      // 1. Generate clicks for today - using the redirect logs approach for accurate time-based filtering
      console.log(`📊 Generating ${clicksPerDay} clicks for today`);
      for (let i = 0; i < clicksPerDay; i++) {
        const url = urls[Math.floor(Math.random() * urls.length)];
        const timestamp = new Date(now);
        timestamp.setHours(Math.floor(Math.random() * 24));
        timestamp.setMinutes(Math.floor(Math.random() * 60));
        timestamp.setSeconds(Math.floor(Math.random() * 60));
        
        // Record in both systems
        await storage.recordCampaignClick(parseInt(campaignId), url.id);
        await redirectLogsManager.logRedirect(parseInt(campaignId), url.id);
        
        allRecords.push({ timestamp, urlId: url.id });
        totalRecords++;
      }
      
      // 2. Generate clicks for yesterday
      console.log(`📊 Generating ${clicksPerDay} clicks for yesterday`);
      const yesterday = new Date(now);
      yesterday.setDate(yesterday.getDate() - 1);
      
      for (let i = 0; i < clicksPerDay; i++) {
        const url = urls[Math.floor(Math.random() * urls.length)];
        const timestamp = new Date(yesterday);
        timestamp.setHours(Math.floor(Math.random() * 24));
        timestamp.setMinutes(Math.floor(Math.random() * 60));
        timestamp.setSeconds(Math.floor(Math.random() * 60));
        
        // Insert directly into the campaign_redirect_logs table with yesterday's timestamp
        const formattedDate = format(timestamp, 'yyyy-MM-dd');
        const hour = timestamp.getHours();
        
        try {
          await db.insert(campaignRedirectLogs).values({
            campaignId: parseInt(campaignId),
            urlId: url.id,
            redirectTime: timestamp,
            dateKey: formattedDate,
            hourKey: hour
          });
        } catch (err) {
          console.error("Error inserting test log for yesterday:", err);
        }
        
        allRecords.push({ timestamp, urlId: url.id });
        totalRecords++;
      }
      
      // 3. Generate clicks for last month
      console.log(`📊 Generating ${clicksPerDay * 5} clicks for last month`);
      const lastMonth = new Date(now);
      lastMonth.setMonth(lastMonth.getMonth() - 1);
      
      for (let i = 0; i < clicksPerDay * 5; i++) { // 5x more data for month
        const url = urls[Math.floor(Math.random() * urls.length)];
        const timestamp = new Date(lastMonth);
        // Set to random day within that month
        timestamp.setDate(Math.floor(Math.random() * 28) + 1);
        timestamp.setHours(Math.floor(Math.random() * 24));
        timestamp.setMinutes(Math.floor(Math.random() * 60));
        timestamp.setSeconds(Math.floor(Math.random() * 60));
        
        // Insert directly into the campaign_redirect_logs table with last month's timestamp
        const formattedDate = format(timestamp, 'yyyy-MM-dd');
        const hour = timestamp.getHours();
        
        try {
          await db.insert(campaignRedirectLogs).values({
            campaignId: parseInt(campaignId),
            urlId: url.id,
            redirectTime: timestamp,
            dateKey: formattedDate,
            hourKey: hour
          });
        } catch (err) {
          console.error("Error inserting test log for last month:", err);
        }
        
        allRecords.push({ timestamp, urlId: url.id });
        totalRecords++;
      }
      
      // 4. Generate clicks for last year
      console.log(`📊 Generating ${clicksPerDay * 10} clicks for last year`);
      const lastYear = new Date(now);
      lastYear.setFullYear(lastYear.getFullYear() - 1);
      
      for (let i = 0; i < clicksPerDay * 10; i++) { // 10x more data for year
        const url = urls[Math.floor(Math.random() * urls.length)];
        const timestamp = new Date(lastYear);
        // Set to random month and day within that year
        timestamp.setMonth(Math.floor(Math.random() * 12));
        timestamp.setDate(Math.floor(Math.random() * 28) + 1);
        timestamp.setHours(Math.floor(Math.random() * 24));
        timestamp.setMinutes(Math.floor(Math.random() * 60));
        timestamp.setSeconds(Math.floor(Math.random() * 60));
        
        // Insert directly into the campaign_redirect_logs table with last year's timestamp
        const formattedDate = format(timestamp, 'yyyy-MM-dd');
        const hour = timestamp.getHours();
        
        try {
          await db.insert(campaignRedirectLogs).values({
            campaignId: parseInt(campaignId),
            urlId: url.id,
            redirectTime: timestamp,
            dateKey: formattedDate,
            hourKey: hour
          });
        } catch (err) {
          console.error("Error inserting test log for last year:", err);
        }
        
        allRecords.push({ timestamp, urlId: url.id });
        totalRecords++;
      }
      
      res.json({
        success: true,
        message: `Generated ${totalRecords} test click records for campaign #${campaignId} across different time periods`,
        counts: {
          today: clicksPerDay,
          yesterday: clicksPerDay,
          lastMonth: clicksPerDay * 5,
          lastYear: clicksPerDay * 10,
          total: totalRecords
        }
      });
    } catch (error) {
      console.error("Error generating specific test click records:", error);
      res.status(500).json({
        message: "Failed to generate test click records",
        error: error instanceof Error ? error.message : String(error)
      });
    }
  });
}
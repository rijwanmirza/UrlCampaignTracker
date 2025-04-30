import { Request, Response } from "express";
import { urlClickLogsManager, timeRangeFilterSchema } from "./url-click-logs-manager";
import { db } from "./db";
import { eq } from "drizzle-orm";
import { urls } from "@shared/schema";

/**
 * Register URL click routes with the Express app
 */
export function registerUrlClickRoutes(app: any) {
  // Initialize the click logs manager
  urlClickLogsManager.initialize();
  
  // Run a log file check on startup
  import('./fix-url-click-logs').then(({ fixMissingUrlClickLogs }) => {
    fixMissingUrlClickLogs().then(result => {
      console.log('🔄 Auto-fix for missing URL click logs completed:', result.message);
    }).catch(error => {
      console.error('❌ Error during auto-fix for URL click logs:', error);
    });
  }).catch(error => {
    console.error('❌ Error importing URL click log fix:', error);
  });
  
  /**
   * API endpoint to get a summary of all URL clicks with optional filtering
   */
  app.get("/api/url-click-records/summary", async (req: Request, res: Response) => {
    try {
      // Check if an ID was provided in the URL
      if (req.query.urlId) {
        // Redirect to the specific URL endpoint
        const urlId = parseInt(req.query.urlId as string);
        if (isNaN(urlId)) {
          return res.status(400).json({ message: "Invalid URL ID" });
        }
        
        // Forward to the specific URL endpoint
        return res.redirect(`/api/url-click-records/${urlId}?${new URLSearchParams(req.query as any).toString()}`);
      }
      
      // Parse and validate filter parameters
      const filterResult = timeRangeFilterSchema.safeParse({
        filterType: req.query.filterType || 'today',
        startDate: req.query.startDate,
        endDate: req.query.endDate,
        timezone: req.query.timezone || 'Asia/Kolkata'
      });
      
      if (!filterResult.success) {
        return res.status(400).json({ 
          message: "Invalid filter parameters", 
          errors: filterResult.error.errors 
        });
      }
      
      // Get all URLs
      const allUrls = await db.query.urls.findMany();
      
      // Fetch analytics for each URL
      const urlBreakdown = [];
      const dailyBreakdown: Record<string, number> = {};
      let totalClicks = 0;
      let dateRangeText = "Unknown date range";
      
      for (const url of allUrls) {
        const analytics = await urlClickLogsManager.getUrlClickAnalytics(url.id, filterResult.data);
        
        urlBreakdown.push({
          urlId: url.id,
          name: url.name,
          clicks: analytics.totalClicks
        });
        
        // Merge daily breakdowns
        for (const [date, clicks] of Object.entries(analytics.dailyBreakdown)) {
          dailyBreakdown[date] = (dailyBreakdown[date] || 0) + clicks;
        }
        
        totalClicks += analytics.totalClicks;
        
        // Save date range text from the first URL with analytics
        if (analytics && dateRangeText === "Unknown date range") {
          dateRangeText = analytics.filterInfo.dateRange;
        }
      }
      
      return res.status(200).json({
        totalClicks,
        dailyBreakdown,
        urlBreakdown,
        filterInfo: {
          type: filterResult.data.filterType,
          dateRange: dateRangeText
        }
      });
    } catch (error) {
      console.error("Error getting URL click summary:", error);
      return res.status(500).json({ message: "Failed to get URL click summary" });
    }
  });
  
  /**
   * API endpoint to generate test data for URL clicks
   */
  app.post("/api/url-click-records/generate-test-data/:urlId", async (req: Request, res: Response) => {
    try {
      const urlId = parseInt(req.params.urlId);
      
      if (isNaN(urlId)) {
        return res.status(400).json({ message: "Invalid URL ID" });
      }
      
      // Check if the URL exists
      const url = await db.query.urls.findFirst({
        where: eq(urls.id, urlId)
      });
      
      if (!url) {
        return res.status(404).json({ message: "URL not found" });
      }
      
      const {
        count = 100,
        startDate,
        endDate,
        minHour,
        maxHour
      } = req.body;
      
      // Parse date strings to Date objects
      const dateRange = startDate && endDate ? {
        start: new Date(startDate),
        end: new Date(endDate)
      } : undefined;
      
      const hourRange = minHour !== undefined && maxHour !== undefined ? {
        min: parseInt(minHour),
        max: parseInt(maxHour)
      } : undefined;
      
      // Generate the test data
      await urlClickLogsManager.generateTestData(urlId, {
        count: parseInt(count),
        dateRange,
        hourRange
      });
      
      return res.status(200).json({ 
        message: `Successfully generated ${count} test click logs for URL ID ${urlId}` 
      });
    } catch (error) {
      console.error("Error generating test URL click data:", error);
      return res.status(500).json({ message: "Failed to generate test URL click data" });
    }
  });
  
  /**
   * API endpoint to delete click logs for a URL
   */
  app.delete("/api/url-click-records/:urlId", async (req: Request, res: Response) => {
    try {
      const urlId = parseInt(req.params.urlId);
      
      if (isNaN(urlId)) {
        return res.status(400).json({ message: "Invalid URL ID" });
      }
      
      // Check if the URL exists
      const url = await db.query.urls.findFirst({
        where: eq(urls.id, urlId)
      });
      
      if (!url) {
        return res.status(404).json({ message: "URL not found" });
      }
      
      // Delete the logs
      await urlClickLogsManager.deleteUrlLogs(urlId);
      
      // Reset click count in the database
      await db.update(urls)
        .set({ clicks: 0 })
        .where(eq(urls.id, urlId));
      
      return res.status(200).json({ 
        message: `Successfully deleted click logs for URL ID ${urlId}` 
      });
    } catch (error) {
      console.error("Error deleting URL click logs:", error);
      return res.status(500).json({ message: "Failed to delete URL click logs" });
    }
  });
  
  /**
   * API endpoint to get raw click logs for a URL
   */
  app.get("/api/url-click-records/raw/:urlId", async (req: Request, res: Response) => {
    try {
      const urlId = parseInt(req.params.urlId);
      
      if (isNaN(urlId)) {
        return res.status(400).json({ message: "Invalid URL ID" });
      }
      
      // Check if the URL exists
      const url = await db.query.urls.findFirst({
        where: eq(urls.id, urlId)
      });
      
      if (!url) {
        return res.status(404).json({ message: "URL not found" });
      }
      
      // Get the raw logs
      const rawLogs = await urlClickLogsManager.getRawLogs(urlId);
      
      return res.status(200).json({ rawLogs });
    } catch (error) {
      console.error("Error getting URL click logs:", error);
      return res.status(500).json({ message: "Failed to get URL click logs" });
    }
  });
  
  /**
   * API endpoint to log a click for a URL
   */
  app.post("/api/url-click-records/:urlId", async (req: Request, res: Response) => {
    try {
      const urlId = parseInt(req.params.urlId);
      
      if (isNaN(urlId)) {
        return res.status(400).json({ message: "Invalid URL ID" });
      }
      
      // Check if the URL exists
      const url = await db.query.urls.findFirst({
        where: eq(urls.id, urlId)
      });
      
      if (!url) {
        return res.status(404).json({ message: "URL not found" });
      }
      
      // Log the click
      await urlClickLogsManager.logClick(urlId);
      
      return res.status(200).json({ success: true });
    } catch (error) {
      console.error("Error logging URL click:", error);
      return res.status(500).json({ message: "Failed to log URL click" });
    }
  });
  
  /**
   * API endpoint to get detailed analytics for a specific URL with filtering options
   * This must be the last route in the group to avoid conflicts with other routes
   */
  app.get("/api/url-click-records/:urlId", async (req: Request, res: Response) => {
    try {
      const urlId = parseInt(req.params.urlId);
      
      if (isNaN(urlId)) {
        return res.status(400).json({ message: "Invalid URL ID" });
      }
      
      // Check if the URL exists
      const url = await db.query.urls.findFirst({
        where: eq(urls.id, urlId)
      });
      
      if (!url) {
        return res.status(404).json({ message: "URL not found" });
      }
      
      // Parse and validate filter parameters
      const filterResult = timeRangeFilterSchema.safeParse({
        filterType: req.query.filterType || 'today',
        startDate: req.query.startDate,
        endDate: req.query.endDate,
        timezone: req.query.timezone || 'Asia/Kolkata'
      });
      
      if (!filterResult.success) {
        return res.status(400).json({ 
          message: "Invalid filter parameters", 
          errors: filterResult.error.errors 
        });
      }
      
      // Get the click analytics
      const analytics = await urlClickLogsManager.getUrlClickAnalytics(urlId, filterResult.data);
      
      return res.status(200).json(analytics);
    } catch (error) {
      console.error("Error getting URL click analytics:", error);
      return res.status(500).json({ message: "Failed to get URL click analytics" });
    }
  });
}
import { Request, Response } from "express";
import { storage } from "./storage";
import { TimeRangeFilter, urlClickLogs } from "@shared/schema";
import { format } from "date-fns";
import { db } from "./db";
import { eq, and, gte, lte } from "drizzle-orm";
import { urlClickLogsManager } from "./url-click-logs-manager";

// API Routes for URL Click Records
export function registerUrlClickRoutes(app: any) {

  // Get all URL click records with filtering
  app.get("/api/url-click-records", async (req: Request, res: Response) => {
    try {
      const page = parseInt(req.query.page as string) || 1;
      const limit = parseInt(req.query.limit as string) || 10;
      const search = req.query.search as string || undefined;
      const urlId = req.query.urlId ? parseInt(req.query.urlId as string) : undefined;
      
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
      const result = await storage.getUrlClickRecords(page, limit, urlId, filter);
      
      // Enhance the records with URL details
      const enhancedRecords = await Promise.all(result.records.map(async (record) => {
        try {
          // Get URL details
          const url = await storage.getUrl(record.urlId);
          
          return {
            ...record,
            url: url || { name: 'Unknown', targetUrl: 'Unknown' }
          };
        } catch (error) {
          console.error(`Error enhancing URL click record ${record.id}:`, error);
          return {
            ...record,
            url: { name: 'Unknown', targetUrl: 'Unknown' }
          };
        }
      }));
      
      res.json({
        records: enhancedRecords,
        total: result.total,
        page,
        limit,
        totalPages: Math.ceil(result.total / limit)
      });
    } catch (error) {
      console.error("Error fetching URL click records:", error);
      res.status(500).json({
        message: "Failed to fetch URL click records",
        error: error instanceof Error ? error.message : String(error)
      });
    }
  });

  // Get summary stats for a specific URL's clicks
  app.get("/api/url-click-records/summary/:urlId", async (req: Request, res: Response) => {
    try {
      const urlId = parseInt(req.params.urlId);
      
      if (isNaN(urlId)) {
        return res.status(400).json({ message: "Invalid URL ID" });
      }
      
      // Build filter from query parameters - be very specific about filterType
      const filterType = (req.query.filterType as string) || 'today';
      const showHourly = req.query.showHourly === 'true';
      const timestamp = req.query._timestamp; // Used for cache-busting on the client side
      
      console.log(`📊 Filtering URL ${urlId} clicks with filter type: ${filterType} (timestamp: ${timestamp})`);
      
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
      
      // Check if the URL exists
      const url = await storage.getUrl(urlId);
      
      if (!url) {
        return res.status(404).json({ message: "URL not found" });
      }
      
      // Use the URL click logs system for accurate click data
      try {
        // Create a fresh filter object to prevent any reference issues
        const urlClickLogsFilter: TimeRangeFilter = {
          ...filter,
          filterType: filterType as any, // Force the exact filterType to be used
        };
        
        console.log(`📊 Using filter with type '${urlClickLogsFilter.filterType}' for URL click logs query`);
        
        // Pass the filter to the URL click logs system
        const urlClickLogsSummary = await urlClickLogsManager.getUrlClickSummary(urlId, urlClickLogsFilter);
        
        if (urlClickLogsSummary) {
          console.log(`📊 URL click logs summary for filter ${filterType}:`, {
            totalClicks: urlClickLogsSummary.totalClicks,
            filterInfo: urlClickLogsSummary.filterInfo
          });
          return res.json(urlClickLogsSummary);
        }
      } catch (urlClickLogsError) {
        console.error("Error getting URL click logs summary, falling back to URL clicks:", urlClickLogsError);
        // Continue with a fallback method if needed
      }
      
      // Fallback response if the above fails
      res.json({
        totalClicks: url.clicks.toString(),
        dailyBreakdown: {},
        hourlyBreakdown: [],
        filterInfo: {
          type: filterType,
          dateRange: 'All time (fallback)'
        }
      });
    } catch (error) {
      console.error("Error fetching URL click summary:", error);
      res.status(500).json({
        message: "Failed to fetch URL click summary",
        error: error instanceof Error ? error.message : String(error)
      });
    }
  });

  // Test endpoint to generate sample URL click records
  app.post("/api/url-click-records/generate-test-data", async (req: Request, res: Response) => {
    try {
      const { urlId, count = 100, days = 7 } = req.body;
      
      if (!urlId) {
        return res.status(400).json({ message: "URL ID is required" });
      }
      
      // Verify URL exists
      const url = await storage.getUrl(parseInt(urlId));
      if (!url) {
        return res.status(404).json({ message: "URL not found" });
      }
      
      // Generate random test data
      const now = new Date();
      const records = [];
      
      // Generate random click records over the specified number of days
      for (let i = 0; i < parseInt(count.toString()); i++) {
        // Random timestamp in past N days (specified by 'days' parameter)
        const randomDayOffset = Math.floor(Math.random() * parseInt(days.toString()));
        const timestamp = new Date(now);
        timestamp.setDate(timestamp.getDate() - randomDayOffset);
        
        // Random hour of day bias (for realistic hourly patterns)
        const hour = Math.floor(Math.random() * 24);
        timestamp.setHours(hour);
        timestamp.setMinutes(Math.floor(Math.random() * 60));
        timestamp.setSeconds(Math.floor(Math.random() * 60));
        
        // Record a URL click using the logs manager
        await urlClickLogsManager.logClick(parseInt(urlId));
        
        records.push({
          timestamp,
          urlId: parseInt(urlId)
        });
      }
      
      res.json({
        success: true,
        message: `Generated ${count} test URL click records across ${days} days`,
        recordsGenerated: records.length
      });
    } catch (error) {
      console.error("Error generating test URL click records:", error);
      res.status(500).json({
        message: "Failed to generate test URL click records",
        error: error instanceof Error ? error.message : String(error)
      });
    }
  });

  // Advanced test endpoint to generate click data across specific time periods
  app.post("/api/url-click-records/generate-specific-test-data", async (req: Request, res: Response) => {
    try {
      const { urlId, clicksPerDay = 20 } = req.body;
      
      if (!urlId) {
        return res.status(400).json({ message: "URL ID is required" });
      }
      
      // Verify URL exists
      const url = await storage.getUrl(parseInt(urlId));
      if (!url) {
        return res.status(404).json({ message: "URL not found" });
      }
      
      const now = new Date();
      let totalRecords = 0;
      const allRecords = [];
      
      // First clear existing logs for clean test data
      console.log(`🧹 Clearing existing URL click logs for URL ${urlId} before generating new test data`);
      try {
        await db.delete(urlClickLogs)
          .where(eq(urlClickLogs.urlId, parseInt(urlId)));
      } catch (err) {
        console.error("Error clearing existing logs:", err);
      }
      
      // 1. Generate clicks for today
      console.log(`📊 Generating ${clicksPerDay} clicks for today`);
      for (let i = 0; i < clicksPerDay; i++) {
        const timestamp = new Date(now);
        timestamp.setHours(Math.floor(Math.random() * 24));
        timestamp.setMinutes(Math.floor(Math.random() * 60));
        timestamp.setSeconds(Math.floor(Math.random() * 60));
        
        // Record using URL click logs manager
        await urlClickLogsManager.logClick(parseInt(urlId));
        
        allRecords.push({ timestamp, urlId: parseInt(urlId) });
        totalRecords++;
      }
      
      // 2. Generate clicks for yesterday
      console.log(`📊 Generating ${clicksPerDay} clicks for yesterday`);
      const yesterday = new Date(now);
      yesterday.setDate(yesterday.getDate() - 1);
      
      for (let i = 0; i < clicksPerDay; i++) {
        const timestamp = new Date(yesterday);
        timestamp.setHours(Math.floor(Math.random() * 24));
        timestamp.setMinutes(Math.floor(Math.random() * 60));
        timestamp.setSeconds(Math.floor(Math.random() * 60));
        
        // Insert directly into the URL click logs table with yesterday's timestamp
        const { formatted: indianTime, dateKey, hourKey } = formatIndianTime(timestamp);
        
        try {
          await db.insert(urlClickLogs).values({
            urlId: parseInt(urlId),
            clickTime: timestamp,
            indianTime,
            dateKey,
            hourKey
          });
        } catch (err) {
          console.error("Error inserting test log for yesterday:", err);
        }
        
        allRecords.push({ timestamp, urlId: parseInt(urlId) });
        totalRecords++;
      }
      
      // 3. Generate clicks for last month
      console.log(`📊 Generating ${clicksPerDay * 5} clicks for last month`);
      const lastMonth = new Date(now);
      lastMonth.setMonth(lastMonth.getMonth() - 1);
      
      for (let i = 0; i < clicksPerDay * 5; i++) { // 5x more data for month
        const timestamp = new Date(lastMonth);
        // Set to random day within that month
        timestamp.setDate(Math.floor(Math.random() * 28) + 1);
        timestamp.setHours(Math.floor(Math.random() * 24));
        timestamp.setMinutes(Math.floor(Math.random() * 60));
        timestamp.setSeconds(Math.floor(Math.random() * 60));
        
        // Insert directly into the URL click logs table with last month's timestamp
        const { formatted: indianTime, dateKey, hourKey } = formatIndianTime(timestamp);
        
        try {
          await db.insert(urlClickLogs).values({
            urlId: parseInt(urlId),
            clickTime: timestamp,
            indianTime,
            dateKey,
            hourKey
          });
        } catch (err) {
          console.error("Error inserting test log for last month:", err);
        }
        
        allRecords.push({ timestamp, urlId: parseInt(urlId) });
        totalRecords++;
      }
      
      // 4. Generate clicks for last year
      console.log(`📊 Generating ${clicksPerDay * 10} clicks for last year`);
      const lastYear = new Date(now);
      lastYear.setFullYear(lastYear.getFullYear() - 1);
      
      for (let i = 0; i < clicksPerDay * 10; i++) { // 10x more data for year
        const timestamp = new Date(lastYear);
        // Set to random month and day within that year
        timestamp.setMonth(Math.floor(Math.random() * 12));
        timestamp.setDate(Math.floor(Math.random() * 28) + 1);
        timestamp.setHours(Math.floor(Math.random() * 24));
        timestamp.setMinutes(Math.floor(Math.random() * 60));
        timestamp.setSeconds(Math.floor(Math.random() * 60));
        
        // Insert directly into the URL click logs table with last year's timestamp
        const { formatted: indianTime, dateKey, hourKey } = formatIndianTime(timestamp);
        
        try {
          await db.insert(urlClickLogs).values({
            urlId: parseInt(urlId),
            clickTime: timestamp,
            indianTime,
            dateKey,
            hourKey
          });
        } catch (err) {
          console.error("Error inserting test log for last year:", err);
        }
        
        allRecords.push({ timestamp, urlId: parseInt(urlId) });
        totalRecords++;
      }
      
      // Update the URL's clicks count to match the total records
      await storage.updateUrl(parseInt(urlId), { clicks: totalRecords });
      
      res.json({
        success: true,
        message: `Generated URL click records across different time periods`,
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
        message: "Failed to generate specific test click records",
        error: error instanceof Error ? error.message : String(error)
      });
    }
  });
  
  // Get raw URL click logs
  app.get("/api/url-click-records/raw/:urlId", async (req: Request, res: Response) => {
    try {
      const urlId = parseInt(req.params.urlId);
      
      if (isNaN(urlId)) {
        return res.status(400).json({ message: "Invalid URL ID" });
      }
      
      const rawLogs = await urlClickLogsManager.getRawClickLogs(urlId);
      
      res.json({
        urlId,
        rawLogs
      });
    } catch (error) {
      console.error("Error fetching raw URL click logs:", error);
      res.status(500).json({
        message: "Failed to fetch raw URL click logs",
        error: error instanceof Error ? error.message : String(error)
      });
    }
  });
}

// Helper function to format in Indian time
function formatIndianTime(date: Date) {
  const indianTimeZone = "Asia/Kolkata";
  const utcToZonedTime = (date: Date, timeZone: string) => {
    // Simple implementation for when date-fns-tz is not available
    const targetTime = new Date(date.toISOString());
    // Indian time is UTC+5:30, so add 5 hours and 30 minutes
    targetTime.setHours(targetTime.getHours() + 5);
    targetTime.setMinutes(targetTime.getMinutes() + 30);
    return targetTime;
  };
  
  const indianTime = utcToZonedTime(date, indianTimeZone);
  
  const formatted = `${indianTime.getFullYear()}-${String(indianTime.getMonth() + 1).padStart(2, '0')}-${String(indianTime.getDate()).padStart(2, '0')} ${String(indianTime.getHours()).padStart(2, '0')}:${String(indianTime.getMinutes()).padStart(2, '0')}:${String(indianTime.getSeconds()).padStart(2, '0')}`;
  const dateKey = `${indianTime.getFullYear()}-${String(indianTime.getMonth() + 1).padStart(2, '0')}-${String(indianTime.getDate()).padStart(2, '0')}`;
  const hourKey = indianTime.getHours();
  
  return { formatted, dateKey, hourKey };
}
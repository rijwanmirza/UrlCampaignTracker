import { Request, Response } from "express";
import { Express } from "express";
import { db } from "./db";
import { clickAnalytics, campaigns, urls } from "@shared/schema";
import { eq, sql } from "drizzle-orm";

export function registerAnalyticsRoutes(app: Express) {
  // Record a click for analytics
  app.post("/api/analytics/click", async (req: Request, res: Response) => {
    try {
      // Extract required data from request
      const { urlId, campaignId, userAgent, ipAddress, referrer } = req.body;
      
      if (!urlId) {
        return res.status(400).json({ error: "URL ID is required" });
      }
      
      // Get the current date and time
      const now = new Date();
      const clickHour = now.getUTCHours(); // 0-23 in UTC
      
      // Create click analytics record
      await db.insert(clickAnalytics).values({
        urlId,
        campaignId,
        clickTime: now,
        clickHour,
        clickDate: now,
        timezone: "UTC", // Default to UTC, can be overridden
        userAgent,
        ipAddress,
        referrer,
        // Other fields can be populated as needed
      });
      
      return res.status(201).json({ success: true });
    } catch (error) {
      console.error("Error recording click analytics:", error);
      return res.status(500).json({ 
        error: "Failed to record click analytics",
        details: error instanceof Error ? error.message : String(error)
      });
    }
  });

  // Get analytics for a specific campaign
  app.get("/api/analytics/campaign/:campaignId", async (req: Request, res: Response) => {
    try {
      const campaignId = parseInt(req.params.campaignId);
      
      if (isNaN(campaignId)) {
        return res.status(400).json({ error: "Invalid campaign ID" });
      }
      
      // Get filter parameters from query string
      const filterType = req.query.filterType as string || 'total';
      const timezone = req.query.timezone as string || 'UTC';
      const showHourly = req.query.showHourly === 'true';
      const startDate = req.query.startDate as string;
      const endDate = req.query.endDate as string;
      
      // Build the base query
      let query = db.select().from(clickAnalytics)
        .where(eq(clickAnalytics.campaignId, campaignId));
      
      // Apply date filters based on filterType
      if (filterType === 'today') {
        const today = new Date();
        today.setUTCHours(0, 0, 0, 0);
        query = query.where(sql`${clickAnalytics.clickDate} >= ${today.toISOString()}`);
      } else if (filterType === 'yesterday') {
        const yesterday = new Date();
        yesterday.setUTCDate(yesterday.getUTCDate() - 1);
        yesterday.setUTCHours(0, 0, 0, 0);
        
        const today = new Date();
        today.setUTCHours(0, 0, 0, 0);
        
        query = query.where(sql`${clickAnalytics.clickDate} >= ${yesterday.toISOString()}`)
                     .where(sql`${clickAnalytics.clickDate} < ${today.toISOString()}`);
      } else if (filterType === 'last_7_days') {
        const lastWeek = new Date();
        lastWeek.setUTCDate(lastWeek.getUTCDate() - 7);
        lastWeek.setUTCHours(0, 0, 0, 0);
        
        query = query.where(sql`${clickAnalytics.clickDate} >= ${lastWeek.toISOString()}`);
      } else if (filterType === 'this_month') {
        const startOfMonth = new Date();
        startOfMonth.setUTCDate(1);
        startOfMonth.setUTCHours(0, 0, 0, 0);
        
        query = query.where(sql`${clickAnalytics.clickDate} >= ${startOfMonth.toISOString()}`);
      } else if (filterType === 'last_month') {
        const startOfLastMonth = new Date();
        startOfLastMonth.setUTCMonth(startOfLastMonth.getUTCMonth() - 1);
        startOfLastMonth.setUTCDate(1);
        startOfLastMonth.setUTCHours(0, 0, 0, 0);
        
        const startOfThisMonth = new Date();
        startOfThisMonth.setUTCDate(1);
        startOfThisMonth.setUTCHours(0, 0, 0, 0);
        
        query = query.where(sql`${clickAnalytics.clickDate} >= ${startOfLastMonth.toISOString()}`)
                     .where(sql`${clickAnalytics.clickDate} < ${startOfThisMonth.toISOString()}`);
      } else if (filterType === 'this_year') {
        const startOfYear = new Date();
        startOfYear.setUTCMonth(0, 1);
        startOfYear.setUTCHours(0, 0, 0, 0);
        
        query = query.where(sql`${clickAnalytics.clickDate} >= ${startOfYear.toISOString()}`);
      } else if (filterType === 'custom_range' && startDate && endDate) {
        // Parse dates and ensure they're valid
        const parsedStartDate = new Date(startDate);
        const parsedEndDate = new Date(endDate);
        
        if (isNaN(parsedStartDate.getTime()) || isNaN(parsedEndDate.getTime())) {
          return res.status(400).json({ error: "Invalid date format for custom range" });
        }
        
        // Add one day to end date to make it inclusive
        parsedEndDate.setUTCDate(parsedEndDate.getUTCDate() + 1);
        
        query = query.where(sql`${clickAnalytics.clickDate} >= ${parsedStartDate.toISOString()}`)
                     .where(sql`${clickAnalytics.clickDate} < ${parsedEndDate.toISOString()}`);
      }
      // For 'total', no date filter is needed
      
      // Execute the query
      const analytics = await query;
      
      // Get URLs for this campaign to include in response
      const campaignUrls = await db.select().from(urls)
        .where(eq(urls.campaignId, campaignId));
      
      // Get the campaign details
      const [campaign] = await db.select().from(campaigns)
        .where(eq(campaigns.id, campaignId));
      
      // Process the data for the response
      // If showHourly is true, group by hour
      const processedData = {
        campaign: campaign || null,
        urls: campaignUrls,
        analytics: analytics,
        summary: {
          totalClicks: analytics.length,
          clicksByDate: {} as Record<string, number>,
          clicksByHour: {} as Record<string, number>,
          clicksByUrl: {} as Record<string, number>,
        }
      };
      
      // Generate summary stats
      analytics.forEach(click => {
        // Count by date
        const dateStr = new Date(click.clickDate).toISOString().split('T')[0];
        if (!processedData.summary.clicksByDate[dateStr]) {
          processedData.summary.clicksByDate[dateStr] = 0;
        }
        processedData.summary.clicksByDate[dateStr]++;
        
        // Count by hour if requested
        if (showHourly) {
          const hourStr = click.clickHour.toString().padStart(2, '0');
          if (!processedData.summary.clicksByHour[hourStr]) {
            processedData.summary.clicksByHour[hourStr] = 0;
          }
          processedData.summary.clicksByHour[hourStr]++;
        }
        
        // Count by URL
        if (!processedData.summary.clicksByUrl[click.urlId]) {
          processedData.summary.clicksByUrl[click.urlId] = 0;
        }
        processedData.summary.clicksByUrl[click.urlId]++;
      });
      
      return res.json(processedData);
    } catch (error) {
      console.error("Error fetching campaign analytics:", error);
      return res.status(500).json({ 
        error: "Failed to fetch campaign analytics",
        details: error instanceof Error ? error.message : String(error)
      });
    }
  });

  // Get analytics for a specific URL
  app.get("/api/analytics/url/:urlId", async (req: Request, res: Response) => {
    try {
      const urlId = parseInt(req.params.urlId);
      
      if (isNaN(urlId)) {
        return res.status(400).json({ error: "Invalid URL ID" });
      }
      
      // Get filter parameters from query string
      const filterType = req.query.filterType as string || 'total';
      const timezone = req.query.timezone as string || 'UTC';
      const showHourly = req.query.showHourly === 'true';
      const startDate = req.query.startDate as string;
      const endDate = req.query.endDate as string;
      
      // Build the base query
      let query = db.select().from(clickAnalytics)
        .where(eq(clickAnalytics.urlId, urlId));
      
      // Apply date filters based on filterType (same logic as campaign endpoint)
      if (filterType === 'today') {
        const today = new Date();
        today.setUTCHours(0, 0, 0, 0);
        query = query.where(sql`${clickAnalytics.clickDate} >= ${today.toISOString()}`);
      } else if (filterType === 'yesterday') {
        const yesterday = new Date();
        yesterday.setUTCDate(yesterday.getUTCDate() - 1);
        yesterday.setUTCHours(0, 0, 0, 0);
        
        const today = new Date();
        today.setUTCHours(0, 0, 0, 0);
        
        query = query.where(sql`${clickAnalytics.clickDate} >= ${yesterday.toISOString()}`)
                     .where(sql`${clickAnalytics.clickDate} < ${today.toISOString()}`);
      } else if (filterType === 'last_7_days') {
        const lastWeek = new Date();
        lastWeek.setUTCDate(lastWeek.getUTCDate() - 7);
        lastWeek.setUTCHours(0, 0, 0, 0);
        
        query = query.where(sql`${clickAnalytics.clickDate} >= ${lastWeek.toISOString()}`);
      } else if (filterType === 'this_month') {
        const startOfMonth = new Date();
        startOfMonth.setUTCDate(1);
        startOfMonth.setUTCHours(0, 0, 0, 0);
        
        query = query.where(sql`${clickAnalytics.clickDate} >= ${startOfMonth.toISOString()}`);
      } else if (filterType === 'last_month') {
        const startOfLastMonth = new Date();
        startOfLastMonth.setUTCMonth(startOfLastMonth.getUTCMonth() - 1);
        startOfLastMonth.setUTCDate(1);
        startOfLastMonth.setUTCHours(0, 0, 0, 0);
        
        const startOfThisMonth = new Date();
        startOfThisMonth.setUTCDate(1);
        startOfThisMonth.setUTCHours(0, 0, 0, 0);
        
        query = query.where(sql`${clickAnalytics.clickDate} >= ${startOfLastMonth.toISOString()}`)
                     .where(sql`${clickAnalytics.clickDate} < ${startOfThisMonth.toISOString()}`);
      } else if (filterType === 'this_year') {
        const startOfYear = new Date();
        startOfYear.setUTCMonth(0, 1);
        startOfYear.setUTCHours(0, 0, 0, 0);
        
        query = query.where(sql`${clickAnalytics.clickDate} >= ${startOfYear.toISOString()}`);
      } else if (filterType === 'custom_range' && startDate && endDate) {
        // Parse dates and ensure they're valid
        const parsedStartDate = new Date(startDate);
        const parsedEndDate = new Date(endDate);
        
        if (isNaN(parsedStartDate.getTime()) || isNaN(parsedEndDate.getTime())) {
          return res.status(400).json({ error: "Invalid date format for custom range" });
        }
        
        // Add one day to end date to make it inclusive
        parsedEndDate.setUTCDate(parsedEndDate.getUTCDate() + 1);
        
        query = query.where(sql`${clickAnalytics.clickDate} >= ${parsedStartDate.toISOString()}`)
                     .where(sql`${clickAnalytics.clickDate} < ${parsedEndDate.toISOString()}`);
      }
      
      // Execute the query
      const analytics = await query;
      
      // Get URL details
      const [url] = await db.select().from(urls)
        .where(eq(urls.id, urlId));
      
      // Get campaign if this URL belongs to one
      let campaign = null;
      if (url?.campaignId) {
        const [campaignData] = await db.select().from(campaigns)
          .where(eq(campaigns.id, url.campaignId));
        campaign = campaignData;
      }
      
      // Process the data for the response
      const processedData = {
        url: url || null,
        campaign,
        analytics: analytics,
        summary: {
          totalClicks: analytics.length,
          clicksByDate: {} as Record<string, number>,
          clicksByHour: {} as Record<string, number>,
          clicksByCountry: {} as Record<string, number>,
          clicksByCity: {} as Record<string, number>,
          clicksByReferrer: {} as Record<string, number>,
        }
      };
      
      // Generate summary stats
      analytics.forEach(click => {
        // Count by date
        const dateStr = new Date(click.clickDate).toISOString().split('T')[0];
        if (!processedData.summary.clicksByDate[dateStr]) {
          processedData.summary.clicksByDate[dateStr] = 0;
        }
        processedData.summary.clicksByDate[dateStr]++;
        
        // Count by hour if requested
        if (showHourly) {
          const hourStr = click.clickHour.toString().padStart(2, '0');
          if (!processedData.summary.clicksByHour[hourStr]) {
            processedData.summary.clicksByHour[hourStr] = 0;
          }
          processedData.summary.clicksByHour[hourStr]++;
        }
        
        // Count by country if available
        if (click.country) {
          if (!processedData.summary.clicksByCountry[click.country]) {
            processedData.summary.clicksByCountry[click.country] = 0;
          }
          processedData.summary.clicksByCountry[click.country]++;
        }
        
        // Count by city if available
        if (click.city) {
          if (!processedData.summary.clicksByCity[click.city]) {
            processedData.summary.clicksByCity[click.city] = 0;
          }
          processedData.summary.clicksByCity[click.city]++;
        }
        
        // Count by referrer if available
        if (click.referrer) {
          if (!processedData.summary.clicksByReferrer[click.referrer]) {
            processedData.summary.clicksByReferrer[click.referrer] = 0;
          }
          processedData.summary.clicksByReferrer[click.referrer]++;
        }
      });
      
      return res.json(processedData);
    } catch (error) {
      console.error("Error fetching URL analytics:", error);
      return res.status(500).json({ 
        error: "Failed to fetch URL analytics",
        details: error instanceof Error ? error.message : String(error)
      });
    }
  });

  // Get overall analytics summary
  app.get("/api/analytics/summary", async (req: Request, res: Response) => {
    try {
      // Get filter parameters from query string
      const filterType = req.query.filterType as string || 'total';
      const startDate = req.query.startDate as string;
      const endDate = req.query.endDate as string;
      
      // Build the base query for analytics
      let query = db.select().from(clickAnalytics);
      
      // Apply date filters based on filterType (same logic as other endpoints)
      if (filterType === 'today') {
        const today = new Date();
        today.setUTCHours(0, 0, 0, 0);
        query = query.where(sql`${clickAnalytics.clickDate} >= ${today.toISOString()}`);
      } else if (filterType === 'yesterday') {
        const yesterday = new Date();
        yesterday.setUTCDate(yesterday.getUTCDate() - 1);
        yesterday.setUTCHours(0, 0, 0, 0);
        
        const today = new Date();
        today.setUTCHours(0, 0, 0, 0);
        
        query = query.where(sql`${clickAnalytics.clickDate} >= ${yesterday.toISOString()}`)
                     .where(sql`${clickAnalytics.clickDate} < ${today.toISOString()}`);
      } else if (filterType === 'last_7_days') {
        const lastWeek = new Date();
        lastWeek.setUTCDate(lastWeek.getUTCDate() - 7);
        lastWeek.setUTCHours(0, 0, 0, 0);
        
        query = query.where(sql`${clickAnalytics.clickDate} >= ${lastWeek.toISOString()}`);
      } else if (filterType === 'this_month') {
        const startOfMonth = new Date();
        startOfMonth.setUTCDate(1);
        startOfMonth.setUTCHours(0, 0, 0, 0);
        
        query = query.where(sql`${clickAnalytics.clickDate} >= ${startOfMonth.toISOString()}`);
      } else if (filterType === 'last_month') {
        const startOfLastMonth = new Date();
        startOfLastMonth.setUTCMonth(startOfLastMonth.getUTCMonth() - 1);
        startOfLastMonth.setUTCDate(1);
        startOfLastMonth.setUTCHours(0, 0, 0, 0);
        
        const startOfThisMonth = new Date();
        startOfThisMonth.setUTCDate(1);
        startOfThisMonth.setUTCHours(0, 0, 0, 0);
        
        query = query.where(sql`${clickAnalytics.clickDate} >= ${startOfLastMonth.toISOString()}`)
                     .where(sql`${clickAnalytics.clickDate} < ${startOfThisMonth.toISOString()}`);
      } else if (filterType === 'this_year') {
        const startOfYear = new Date();
        startOfYear.setUTCMonth(0, 1);
        startOfYear.setUTCHours(0, 0, 0, 0);
        
        query = query.where(sql`${clickAnalytics.clickDate} >= ${startOfYear.toISOString()}`);
      } else if (filterType === 'custom_range' && startDate && endDate) {
        // Parse dates and ensure they're valid
        const parsedStartDate = new Date(startDate);
        const parsedEndDate = new Date(endDate);
        
        if (isNaN(parsedStartDate.getTime()) || isNaN(parsedEndDate.getTime())) {
          return res.status(400).json({ error: "Invalid date format for custom range" });
        }
        
        // Add one day to end date to make it inclusive
        parsedEndDate.setUTCDate(parsedEndDate.getUTCDate() + 1);
        
        query = query.where(sql`${clickAnalytics.clickDate} >= ${parsedStartDate.toISOString()}`)
                     .where(sql`${clickAnalytics.clickDate} < ${parsedEndDate.toISOString()}`);
      }
      
      // Get basic counts
      const analytics = await query;
      const allCampaigns = await db.select().from(campaigns);
      const allUrls = await db.select().from(urls);
      
      // Prepare the response
      const summary = {
        totalClicks: analytics.length,
        totalCampaigns: allCampaigns.length,
        totalUrls: allUrls.length,
        averageClicksPerUrl: allUrls.length > 0 ? Math.round(analytics.length / allUrls.length) : 0,
        clicksByDate: {} as Record<string, number>,
        topCampaigns: [] as { id: number, name: string, clicks: number }[],
        topUrls: [] as { id: number, name: string, clicks: number }[]
      };
      
      // Generate date stats
      analytics.forEach(click => {
        const dateStr = new Date(click.clickDate).toISOString().split('T')[0];
        if (!summary.clicksByDate[dateStr]) {
          summary.clicksByDate[dateStr] = 0;
        }
        summary.clicksByDate[dateStr]++;
      });
      
      // Count clicks by campaign
      const campaignClicks: Record<number, number> = {};
      analytics.forEach(click => {
        if (click.campaignId) {
          if (!campaignClicks[click.campaignId]) {
            campaignClicks[click.campaignId] = 0;
          }
          campaignClicks[click.campaignId]++;
        }
      });
      
      // Generate top campaigns
      summary.topCampaigns = Object.entries(campaignClicks)
        .map(([id, clicks]) => {
          const campaign = allCampaigns.find(c => c.id === parseInt(id));
          return {
            id: parseInt(id),
            name: campaign?.name || `Campaign ${id}`,
            clicks
          };
        })
        .sort((a, b) => b.clicks - a.clicks)
        .slice(0, 5); // Top 5
      
      // Count clicks by URL
      const urlClicks: Record<number, number> = {};
      analytics.forEach(click => {
        if (!urlClicks[click.urlId]) {
          urlClicks[click.urlId] = 0;
        }
        urlClicks[click.urlId]++;
      });
      
      // Generate top URLs
      summary.topUrls = Object.entries(urlClicks)
        .map(([id, clicks]) => {
          const url = allUrls.find(u => u.id === parseInt(id));
          return {
            id: parseInt(id),
            name: url?.name || `URL ${id}`,
            clicks
          };
        })
        .sort((a, b) => b.clicks - a.clicks)
        .slice(0, 5); // Top 5
      
      return res.json(summary);
    } catch (error) {
      console.error("Error fetching analytics summary:", error);
      return res.status(500).json({ 
        error: "Failed to fetch analytics summary",
        details: error instanceof Error ? error.message : String(error)
      });
    }
  });
}
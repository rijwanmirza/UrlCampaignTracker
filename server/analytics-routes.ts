import { Request, Response, Router } from "express";
import { db } from "./db";
import { sql } from "drizzle-orm";
import { clickAnalytics } from "@shared/schema";

export const analyticsRouter = Router();

// Helper function to get date range based on filter type
const getDateRange = (filterType: string, startDate?: string, endDate?: string) => {
  const now = new Date();
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  let start: Date;
  let end: Date = new Date(now.getTime() + 24 * 60 * 60 * 1000); // tomorrow

  switch (filterType) {
    case 'today':
      start = today;
      end = new Date(today.getTime() + 24 * 60 * 60 * 1000);
      break;
    case 'yesterday':
      start = new Date(today.getTime() - 24 * 60 * 60 * 1000);
      end = today;
      break;
    case 'this_week':
      const dayOfWeek = today.getDay();
      start = new Date(today.getTime() - dayOfWeek * 24 * 60 * 60 * 1000);
      end = new Date(today.getTime() + (7 - dayOfWeek) * 24 * 60 * 60 * 1000);
      break;
    case 'last_week':
      const lastWeekDay = today.getDay();
      start = new Date(today.getTime() - (lastWeekDay + 7) * 24 * 60 * 60 * 1000);
      end = new Date(today.getTime() - lastWeekDay * 24 * 60 * 60 * 1000);
      break;
    case 'last_2_days':
      start = new Date(today.getTime() - 2 * 24 * 60 * 60 * 1000);
      end = new Date(today.getTime() + 24 * 60 * 60 * 1000);
      break;
    case 'last_3_days':
      start = new Date(today.getTime() - 3 * 24 * 60 * 60 * 1000);
      end = new Date(today.getTime() + 24 * 60 * 60 * 1000);
      break;
    case 'last_7_days':
      start = new Date(today.getTime() - 7 * 24 * 60 * 60 * 1000);
      end = new Date(today.getTime() + 24 * 60 * 60 * 1000);
      break;
    case 'last_10_days':
      start = new Date(today.getTime() - 10 * 24 * 60 * 60 * 1000);
      end = new Date(today.getTime() + 24 * 60 * 60 * 1000);
      break;
    case 'last_30_days':
      start = new Date(today.getTime() - 30 * 24 * 60 * 60 * 1000);
      end = new Date(today.getTime() + 24 * 60 * 60 * 1000);
      break;
    case 'this_month':
      start = new Date(now.getFullYear(), now.getMonth(), 1);
      end = new Date(now.getFullYear(), now.getMonth() + 1, 0, 23, 59, 59);
      break;
    case 'last_month':
      start = new Date(now.getFullYear(), now.getMonth() - 1, 1);
      end = new Date(now.getFullYear(), now.getMonth(), 0, 23, 59, 59);
      break;
    case 'this_year':
      start = new Date(now.getFullYear(), 0, 1);
      end = new Date(now.getFullYear(), 11, 31, 23, 59, 59);
      break;
    case 'last_year':
      start = new Date(now.getFullYear() - 1, 0, 1);
      end = new Date(now.getFullYear() - 1, 11, 31, 23, 59, 59);
      break;
    case 'custom_date':
      if (startDate && endDate) {
        start = new Date(startDate);
        end = new Date(endDate);
        end.setHours(23, 59, 59, 999); // Set to end of day
      } else {
        // Default to all time if custom range is not properly specified
        start = new Date(0); // Jan 1, 1970
        end = new Date(now.getTime() + 24 * 60 * 60 * 1000); // tomorrow
      }
      break;
    case 'all_time':
    default:
      start = new Date(0); // Jan 1, 1970
      end = new Date(now.getTime() + 24 * 60 * 60 * 1000); // tomorrow
      break;
  }

  return { start, end };
};

// Helper function to generate hourly ranges for a day
function generateHourlyRanges() {
  const hourlyRanges = [];
  for (let hour = 0; hour < 24; hour++) {
    const startHour = hour.toString().padStart(2, '0');
    const endHour = ((hour + 1) % 24).toString().padStart(2, '0');
    hourlyRanges.push({
      label: `${startHour}:00-${endHour}:00`,
      startHour: hour,
      endHour: (hour + 1) % 24
    });
  }
  return hourlyRanges;
}

// Get timezone offset for a specific timezone
function getTimezoneOffset(timezone: string): number {
  try {
    // Get current date in the specified timezone
    const date = new Date();
    const options: Intl.DateTimeFormatOptions = {
      timeZone: timezone,
      year: 'numeric',
      month: 'numeric',
      day: 'numeric',
      hour: 'numeric',
      minute: 'numeric',
      second: 'numeric',
      hour12: false
    };
    
    const formatter = new Intl.DateTimeFormat('en-US', options);
    const parts = formatter.formatToParts(date);
    
    // Extract hours from the formatted date
    const hour = parseInt(parts.find(part => part.type === 'hour')?.value || '0');
    
    // Calculate offset in hours from UTC
    const utcHour = date.getUTCHours();
    let offset = hour - utcHour;
    
    // Adjust for day boundary crossings
    if (offset > 12) {
      offset -= 24;
    } else if (offset < -12) {
      offset += 24;
    }
    
    return offset;
  } catch (error) {
    console.error(`Error calculating timezone offset for ${timezone}:`, error);
    return 0; // Default to UTC
  }
}

// Get all campaigns with click counts
analyticsRouter.get("/campaigns", async (req: Request, res: Response) => {
  try {
    const filterType = (req.query.filterType as string) || 'today';
    const startDate = req.query.startDate as string | undefined;
    const endDate = req.query.endDate as string | undefined;
    const timezone = req.query.timezone as string || 'UTC';
    
    const { start, end } = getDateRange(filterType, startDate, endDate);
    
    // Get all campaigns with their click counts in the date range
    const campaignClicksQuery = await db.execute(sql`
      SELECT 
        c.id,
        c.name,
        COUNT(ca.id) as clicks
      FROM campaigns c
      LEFT JOIN ${clickAnalytics} ca ON ca."campaignId" = c.id
        AND ca."timestamp" >= ${sql.raw(`'${start.toISOString()}'::timestamp`)}
        AND ca."timestamp" <= ${sql.raw(`'${end.toISOString()}'::timestamp`)}
      GROUP BY c.id, c.name
      ORDER BY c.id
    `);
    
    const campaigns = campaignClicksQuery.rows.map((row: any) => ({
      id: parseInt(row.id),
      name: row.name,
      clicks: parseInt(row.clicks) || 0
    }));
    
    res.json({
      campaigns,
      dateRange: {
        start: start.toISOString(),
        end: end.toISOString(),
        filterType
      },
      timezone
    });
  } catch (error) {
    console.error("Error fetching campaign clicks:", error);
    res.status(500).json({ error: "Failed to fetch campaign clicks" });
  }
});

// Get detailed campaign analytics with hourly breakdown
analyticsRouter.get("/campaign/:id", async (req: Request, res: Response) => {
  try {
    const campaignId = parseInt(req.params.id);
    const filterType = (req.query.filterType as string) || 'today';
    const startDate = req.query.startDate as string | undefined;
    const endDate = req.query.endDate as string | undefined;
    const timezone = req.query.timezone as string || 'UTC';
    
    if (isNaN(campaignId)) {
      return res.status(400).json({ error: "Invalid campaign ID" });
    }
    
    const { start, end } = getDateRange(filterType, startDate, endDate);
    
    // Get campaign details
    const campaignResult = await db.execute(sql`
      SELECT 
        id, 
        name,
        redirect_method as "redirectMethod",
        custom_path as "customPath",
        multiplier,
        price_per_thousand as "pricePerThousand",
        trafficstar_campaign_id as "trafficstarCampaignId",
        created_at as "createdAt",
        updated_at as "updatedAt"
      FROM campaigns 
      WHERE id = ${campaignId}
    `);
    
    if (campaignResult.rows.length === 0) {
      return res.status(404).json({ error: "Campaign not found" });
    }
    
    const campaign = campaignResult.rows[0];
    
    // Get total clicks for the campaign in the date range
    const totalClicksResult = await db.execute(sql`
      SELECT COUNT(*) as total
      FROM ${clickAnalytics}
      WHERE "campaignId" = ${campaignId}
        AND "timestamp" >= ${sql.raw(`'${start.toISOString()}'::timestamp`)}
        AND "timestamp" <= ${sql.raw(`'${end.toISOString()}'::timestamp`)}
    `);
    
    const totalClicks = parseInt(totalClicksResult.rows[0].total) || 0;
    
    // Get hourly breakdown for specific timezone
    const timezoneOffset = getTimezoneOffset(timezone);
    
    // Using PostgreSQL's timezone conversion for accurate grouping
    const hourlyBreakdownResult = await db.execute(sql`
      SELECT 
        EXTRACT(HOUR FROM ("timestamp" AT TIME ZONE 'UTC' AT TIME ZONE ${timezone})) as hour,
        COUNT(*) as clicks
      FROM ${clickAnalytics}
      WHERE "campaignId" = ${campaignId}
        AND "timestamp" >= ${sql.raw(`'${start.toISOString()}'::timestamp`)}
        AND "timestamp" <= ${sql.raw(`'${end.toISOString()}'::timestamp`)}
      GROUP BY hour
      ORDER BY hour
    `);
    
    // Create hourly data structure with all 24 hours
    const hourlyRanges = generateHourlyRanges();
    const hourlyData = hourlyRanges.map(range => {
      const hourRow = hourlyBreakdownResult.rows.find(row => parseInt(row.hour) === range.startHour);
      return {
        hour: range.label,
        clicks: hourRow ? parseInt(hourRow.clicks) : 0
      };
    });
    
    // Get daily breakdown
    const dailyBreakdownResult = await db.execute(sql`
      SELECT 
        DATE("timestamp" AT TIME ZONE 'UTC' AT TIME ZONE ${timezone}) as date,
        COUNT(*) as clicks
      FROM ${clickAnalytics}
      WHERE "campaignId" = ${campaignId}
        AND "timestamp" >= ${sql.raw(`'${start.toISOString()}'::timestamp`)}
        AND "timestamp" <= ${sql.raw(`'${end.toISOString()}'::timestamp`)}
      GROUP BY date
      ORDER BY date
    `);
    
    const dailyData = dailyBreakdownResult.rows.map((row: any) => ({
      date: row.date,
      clicks: parseInt(row.clicks) || 0
    }));
    
    // Get clicks by URL for this campaign 
    // Use analytics data as the source of truth, not URLs table
    // This ensures we can see analytics for deleted URLs too
    const urlClicksResult = await db.execute(sql`
      SELECT 
        ca."urlId" as id,
        COALESCE(u.name, 'Deleted URL ' || ca."urlId") as name,
        COUNT(ca.id) as clicks
      FROM ${clickAnalytics} ca
      LEFT JOIN urls u ON ca."urlId" = u.id
      WHERE ca."campaignId" = ${campaignId}
        AND ca."timestamp" >= ${sql.raw(`'${start.toISOString()}'::timestamp`)}
        AND ca."timestamp" <= ${sql.raw(`'${end.toISOString()}'::timestamp`)}
      GROUP BY ca."urlId", u.name
      ORDER BY clicks DESC
    `);
    
    const urlClicks = urlClicksResult.rows.map((row: any) => ({
      id: parseInt(row.id),
      name: row.name,
      clicks: parseInt(row.clicks) || 0
    }));
    
    res.json({
      campaign: {
        id: parseInt(campaign.id),
        name: campaign.name,
        redirectMethod: campaign.redirectMethod,
        customPath: campaign.customPath,
        multiplier: campaign.multiplier,
        pricePerThousand: campaign.pricePerThousand,
        trafficstarCampaignId: campaign.trafficstarCampaignId,
        createdAt: campaign.createdAt,
        updatedAt: campaign.updatedAt
      },
      analytics: {
        totalClicks,
        hourlyData,
        dailyData,
        urlClicks
      },
      dateRange: {
        start: start.toISOString(),
        end: end.toISOString(),
        filterType
      },
      timezone,
      timezoneOffset
    });
  } catch (error) {
    console.error("Error fetching campaign analytics:", error);
    res.status(500).json({ error: "Failed to fetch campaign analytics" });
  }
});

// Get detailed URL analytics with hourly breakdown
analyticsRouter.get("/url/:id", async (req: Request, res: Response) => {
  try {
    const urlId = parseInt(req.params.id);
    const filterType = (req.query.filterType as string) || 'today';
    const startDate = req.query.startDate as string | undefined;
    const endDate = req.query.endDate as string | undefined;
    const timezone = req.query.timezone as string || 'UTC';
    
    if (isNaN(urlId)) {
      return res.status(400).json({ error: "Invalid URL ID" });
    }
    
    const { start, end } = getDateRange(filterType, startDate, endDate);
    
    // Check if URL exists, but even if it doesn't, we want to show analytics
    // for deleted URLs using the click data from the analytics table
    const urlResult = await db.execute(sql`
      SELECT 
        u.id, 
        u.name,
        u.target_url as "targetUrl",
        u.status,
        u.clicks as "clickCount",
        u.click_limit as "clickLimit",
        u.original_click_limit as "originalClickLimit",
        u.created_at as "createdAt",
        u.updated_at as "updatedAt",
        c.id as "campaignId",
        c.name as "campaignName",
        c.multiplier
      FROM urls u
      JOIN campaigns c ON u.campaign_id = c.id
      WHERE u.id = ${urlId}
    `);
    
    // If URL is not found in the URLs table, it may have been deleted
    // We'll try to get information from click analytics
    if (urlResult.rows.length === 0) {
      // Check if there are any clicks for this URL ID in the analytics data
      const analyticsCheckResult = await db.execute(sql`
        SELECT 
          ca."urlId",
          ca."campaignId",
          c.name as "campaignName",
          COUNT(*) as "totalClicks",
          MIN(ca."timestamp") as "firstClick",
          MAX(ca."timestamp") as "lastClick"
        FROM ${clickAnalytics} ca
        JOIN campaigns c ON ca."campaignId" = c.id
        WHERE ca."urlId" = ${urlId}
        GROUP BY ca."urlId", ca."campaignId", c.name
      `);
      
      if (analyticsCheckResult.rows.length === 0) {
        // No URL or analytics data found
        return res.status(404).json({ error: "URL not found and no analytics data available" });
      }
      
      // Create a synthetic URL record based on analytics data
      const urlData = analyticsCheckResult.rows[0];
      const url = {
        id: urlId,
        name: "Deleted URL",
        targetUrl: "Unknown (URL deleted)",
        status: "deleted",
        clickCount: parseInt(urlData.totalClicks) || 0,
        clickLimit: 0,
        originalClickLimit: 0,
        createdAt: urlData.firstClick,
        updatedAt: urlData.lastClick,
        campaignId: parseInt(urlData.campaignId),
        campaignName: urlData.campaignName,
        multiplier: 1
      };
      urlResult.rows = [url];
    }
    
    if (urlResult.rows.length === 0) {
      return res.status(404).json({ error: "URL not found" });
    }
    
    const url = urlResult.rows[0];
    
    // Get total clicks for the URL in the date range
    const totalClicksResult = await db.execute(sql`
      SELECT COUNT(*) as total
      FROM ${clickAnalytics}
      WHERE "urlId" = ${urlId}
        AND "timestamp" >= ${sql.raw(`'${start.toISOString()}'::timestamp`)}
        AND "timestamp" <= ${sql.raw(`'${end.toISOString()}'::timestamp`)}
    `);
    
    const totalClicks = parseInt(totalClicksResult.rows[0].total) || 0;
    
    // Get hourly breakdown adjusted for timezone
    const timezoneOffset = getTimezoneOffset(timezone);
    
    const hourlyBreakdownResult = await db.execute(sql`
      SELECT 
        EXTRACT(HOUR FROM ("timestamp" AT TIME ZONE 'UTC' AT TIME ZONE ${timezone})) as hour,
        COUNT(*) as clicks
      FROM ${clickAnalytics}
      WHERE "urlId" = ${urlId}
        AND "timestamp" >= ${sql.raw(`'${start.toISOString()}'::timestamp`)}
        AND "timestamp" <= ${sql.raw(`'${end.toISOString()}'::timestamp`)}
      GROUP BY hour
      ORDER BY hour
    `);
    
    // Create hourly data structure with all 24 hours
    const hourlyRanges = generateHourlyRanges();
    const hourlyData = hourlyRanges.map(range => {
      const hourRow = hourlyBreakdownResult.rows.find(row => parseInt(row.hour) === range.startHour);
      return {
        hour: range.label,
        clicks: hourRow ? parseInt(hourRow.clicks) : 0
      };
    });
    
    // Get daily breakdown
    const dailyBreakdownResult = await db.execute(sql`
      SELECT 
        DATE("timestamp" AT TIME ZONE 'UTC' AT TIME ZONE ${timezone}) as date,
        COUNT(*) as clicks
      FROM ${clickAnalytics}
      WHERE "urlId" = ${urlId}
        AND "timestamp" >= ${sql.raw(`'${start.toISOString()}'::timestamp`)}
        AND "timestamp" <= ${sql.raw(`'${end.toISOString()}'::timestamp`)}
      GROUP BY date
      ORDER BY date
    `);
    
    const dailyData = dailyBreakdownResult.rows.map((row: any) => ({
      date: row.date,
      clicks: parseInt(row.clicks) || 0
    }));
    
    // We don't track any information that could identify users
    // No referrer, device, country, etc. data - only timestamps and URL/campaign IDs
    
    res.json({
      url: {
        id: parseInt(url.id),
        name: url.name,
        targetUrl: url.targetUrl,
        status: url.status,
        clickCount: parseInt(url.clickCount) || 0,
        clickLimit: parseInt(url.clickLimit) || 0,
        originalClickLimit: parseInt(url.originalClickLimit) || 0,
        createdAt: url.createdAt,
        updatedAt: url.updatedAt,
        campaign: {
          id: parseInt(url.campaignId),
          name: url.campaignName,
          multiplier: parseFloat(url.multiplier) || 1
        }
      },
      analytics: {
        totalClicks,
        hourlyData,
        dailyData
      },
      dateRange: {
        start: start.toISOString(),
        end: end.toISOString(),
        filterType
      },
      timezone,
      timezoneOffset
    });
  } catch (error) {
    console.error("Error fetching URL analytics:", error);
    res.status(500).json({ error: "Failed to fetch URL analytics" });
  }
});

// Get clicks for a specific date range
analyticsRouter.get("/clicks", async (req: Request, res: Response) => {
  try {
    const filterType = (req.query.filterType as string) || 'today';
    const startDate = req.query.startDate as string | undefined;
    const endDate = req.query.endDate as string | undefined;
    const timezone = req.query.timezone as string || 'UTC';
    const campaignId = req.query.campaignId ? parseInt(req.query.campaignId as string) : undefined;
    const urlId = req.query.urlId ? parseInt(req.query.urlId as string) : undefined;
    
    const { start, end } = getDateRange(filterType, startDate, endDate);
    
    // Build the query based on filters - simplified for our minimal schema
    // Use LEFT JOIN with URLs since URLs might be deleted but we still want to keep the analytics
    let query = sql`
      SELECT 
        ca."timestamp",
        ca."campaignId",
        ca."urlId",
        c.name as "campaignName",
        COALESCE(u.name, 'Deleted URL') as "urlName"
      FROM ${clickAnalytics} ca
      JOIN campaigns c ON ca."campaignId" = c.id
      LEFT JOIN urls u ON ca."urlId" = u.id
      WHERE ca."timestamp" >= ${sql.raw(`'${start.toISOString()}'::timestamp`)}
        AND ca."timestamp" <= ${sql.raw(`'${end.toISOString()}'::timestamp`)}
    `;
    
    // Add campaign filter if provided
    if (campaignId !== undefined) {
      query = sql`${query} AND ca."campaignId" = ${campaignId}`;
    }
    
    // Add URL filter if provided
    if (urlId !== undefined) {
      query = sql`${query} AND ca."urlId" = ${urlId}`;
    }
    
    // Add ordering
    query = sql`${query} ORDER BY ca."timestamp" DESC`;
    
    // Execute the query
    const clicksResult = await db.execute(query);
    
    // Convert to the client's timezone
    const clicks = clicksResult.rows.map((row: any) => {
      // Format the timestamp in the client's timezone
      const timestamp = new Date(row.timestamp);
      
      return {
        timestamp: timestamp.toISOString(),
        campaignId: parseInt(row.campaignId),
        urlId: parseInt(row.urlId),
        campaignName: row.campaignName,
        urlName: row.urlName
      };
    });
    
    res.json({
      clicks,
      dateRange: {
        start: start.toISOString(),
        end: end.toISOString(),
        filterType
      },
      timezone
    });
  } catch (error) {
    console.error("Error fetching clicks:", error);
    res.status(500).json({ error: "Failed to fetch clicks" });
  }
});

// Save user timezone preference
analyticsRouter.post("/timezone", (req: Request, res: Response) => {
  try {
    // You would typically save this to a user preferences table in a real app
    // For now, we'll just return success
    const timezone = req.body.timezone;
    
    if (!timezone) {
      return res.status(400).json({ error: "Timezone is required" });
    }
    
    res.json({ success: true, timezone });
  } catch (error) {
    console.error("Error saving timezone preference:", error);
    res.status(500).json({ error: "Failed to save timezone preference" });
  }
});

export function registerAnalyticsRoutes(app: any) {
  app.use("/api/analytics", analyticsRouter);
}
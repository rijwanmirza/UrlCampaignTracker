import { Request, Response, Router } from "express";
import { db } from "./db";
import { sql } from "drizzle-orm";
import { clickAnalytics } from "@shared/schema";
import { and, between, count, desc, eq, gte, lte } from "drizzle-orm";

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
    case 'last_7_days':
      start = new Date(today.getTime() - 7 * 24 * 60 * 60 * 1000);
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
      end = new Date(now.getFullYear() + 1, 0, 0, 23, 59, 59);
      break;
    case 'custom_range':
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
    case 'total':
    default:
      start = new Date(0); // Jan 1, 1970
      end = new Date(now.getTime() + 24 * 60 * 60 * 1000); // tomorrow
      break;
  }

  return { start, end };
};

// Get analytics summary
analyticsRouter.get("/summary", async (req: Request, res: Response) => {
  try {
    const filterType = (req.query.filterType as string) || 'total';
    const startDate = req.query.startDate as string | undefined;
    const endDate = req.query.endDate as string | undefined;
    
    const { start, end } = getDateRange(filterType, startDate, endDate);
    
    // Get total clicks
    const totalClicksResult = await db.execute(sql`
      SELECT COUNT(*) as count
      FROM ${clickAnalytics}
      WHERE ${clickAnalytics.timestamp} >= ${sql.raw(`'${start.toISOString()}'::timestamp`)}
      AND ${clickAnalytics.timestamp} <= ${sql.raw(`'${end.toISOString()}'::timestamp`)}
    `);
    
    const totalClicks = Number(totalClicksResult[0]?.count || 0);
    
    // Get total campaigns with clicks
    const campaignsResult = await db.execute(sql`
      SELECT COUNT(DISTINCT ${clickAnalytics.campaignId}) as count
      FROM ${clickAnalytics}
      WHERE ${clickAnalytics.timestamp} >= ${sql.raw(`'${start.toISOString()}'::timestamp`)}
      AND ${clickAnalytics.timestamp} <= ${sql.raw(`'${end.toISOString()}'::timestamp`)}
    `);
    
    const totalCampaigns = Number(campaignsResult[0]?.count || 0);
    
    // Get total URLs with clicks
    const urlsResult = await db.execute(sql`
      SELECT COUNT(DISTINCT ${clickAnalytics.urlId}) as count
      FROM ${clickAnalytics}
      WHERE ${clickAnalytics.timestamp} >= ${sql.raw(`'${start.toISOString()}'::timestamp`)}
      AND ${clickAnalytics.timestamp} <= ${sql.raw(`'${end.toISOString()}'::timestamp`)}
    `);
    
    const totalUrls = Number(urlsResult[0]?.count || 0);
    
    // Calculate average clicks per URL
    const averageClicksPerUrl = totalUrls > 0 ? Math.round(totalClicks / totalUrls) : 0;
    
    // Get clicks by date
    const clicksByDateQuery = await db.execute(sql`
      SELECT 
        DATE_TRUNC('day', ${clickAnalytics.timestamp}) as click_date,
        COUNT(*) as click_count
      FROM ${clickAnalytics}
      WHERE 
        ${clickAnalytics.timestamp} >= ${sql.raw(`'${start.toISOString()}'::timestamp`)} AND 
        ${clickAnalytics.timestamp} <= ${sql.raw(`'${end.toISOString()}'::timestamp`)}
      GROUP BY click_date
      ORDER BY click_date
    `);
    
    // Transform to a more frontend-friendly format
    const clicksByDate: Record<string, number> = {};
    clicksByDateQuery.rows.forEach((row: any) => {
      const date = new Date(row.click_date).toISOString().split('T')[0];
      clicksByDate[date] = parseInt(row.click_count);
    });
    
    // Get top campaigns
    const topCampaignsQuery = await db.execute(sql`
      SELECT 
        ${clickAnalytics.campaignId} as id,
        c.name,
        COUNT(*) as clicks
      FROM ${clickAnalytics}
      JOIN campaigns c ON c.id = ${clickAnalytics.campaignId}
      WHERE 
        ${clickAnalytics.timestamp} >= ${sql.raw(`'${start.toISOString()}'::timestamp`)} AND 
        ${clickAnalytics.timestamp} <= ${sql.raw(`'${end.toISOString()}'::timestamp`)}
      GROUP BY ${clickAnalytics.campaignId}, c.name
      ORDER BY clicks DESC
      LIMIT 5
    `);
    
    const topCampaigns = topCampaignsQuery.rows.map((row: any) => ({
      id: parseInt(row.id),
      name: row.name,
      clicks: parseInt(row.clicks)
    }));
    
    // Get top URLs
    const topUrlsQuery = await db.execute(sql`
      SELECT 
        ${clickAnalytics.urlId} as id,
        u.name,
        COUNT(*) as clicks
      FROM ${clickAnalytics}
      JOIN urls u ON u.id = ${clickAnalytics.urlId}
      WHERE 
        ${clickAnalytics.timestamp} >= ${sql.raw(`'${start.toISOString()}'::timestamp`)} AND 
        ${clickAnalytics.timestamp} <= ${sql.raw(`'${end.toISOString()}'::timestamp`)}
      GROUP BY ${clickAnalytics.urlId}, u.name
      ORDER BY clicks DESC
      LIMIT 5
    `);
    
    const topUrls = topUrlsQuery.rows.map((row: any) => ({
      id: parseInt(row.id),
      name: row.name,
      clicks: parseInt(row.clicks)
    }));
    
    res.json({
      totalClicks,
      totalCampaigns,
      totalUrls,
      averageClicksPerUrl,
      clicksByDate,
      topCampaigns,
      topUrls
    });
  } catch (error) {
    console.error("Error fetching analytics summary:", error);
    res.status(500).json({ error: "Failed to fetch analytics summary" });
  }
});

// Get campaign analytics
analyticsRouter.get("/campaign/:campaignId", async (req: Request, res: Response) => {
  try {
    const campaignId = parseInt(req.params.campaignId);
    const filterType = (req.query.filterType as string) || 'total';
    const startDate = req.query.startDate as string | undefined;
    const endDate = req.query.endDate as string | undefined;
    
    if (isNaN(campaignId)) {
      return res.status(400).json({ error: "Invalid campaign ID" });
    }
    
    const { start, end } = getDateRange(filterType, startDate, endDate);
    
    // Get campaign details
    const campaignQuery = await db.execute(sql`
      SELECT 
        c.id,
        c.name,
        c.created_at as createdAt,
        c.updated_at as updatedAt,
        COUNT(DISTINCT ${clickAnalytics.urlId}) as totalUrls,
        COUNT(*) as totalClicks,
        COALESCE(
          CASE 
            WHEN EXISTS (SELECT 1 FROM original_url_records our WHERE our.campaign_id = c.id AND our.status = 'active')
            THEN 'active'
            ELSE 'inactive'
          END,
          'inactive'
        ) as status
      FROM campaigns c
      LEFT JOIN ${clickAnalytics} ON ${clickAnalytics.campaignId} = c.id
        AND ${clickAnalytics.timestamp} >= ${sql.raw(`'${start.toISOString()}'::timestamp`)}
        AND ${clickAnalytics.timestamp} <= ${sql.raw(`'${end.toISOString()}'::timestamp`)}
      WHERE c.id = ${campaignId}
      GROUP BY c.id, c.name, c.created_at, c.updated_at
    `);
    
    if (campaignQuery.rows.length === 0) {
      return res.status(404).json({ error: "Campaign not found" });
    }
    
    const campaign = {
      id: parseInt(campaignQuery.rows[0].id),
      name: campaignQuery.rows[0].name,
      totalClicks: parseInt(campaignQuery.rows[0].totalclicks) || 0,
      totalUrls: parseInt(campaignQuery.rows[0].totalurls) || 0,
      createdAt: campaignQuery.rows[0].createdat,
      status: campaignQuery.rows[0].status
    };
    
    // Get clicks by date
    const clicksByDateQuery = await db.execute(sql`
      SELECT 
        DATE_TRUNC('day', ${clickAnalytics.timestamp}) as click_date,
        COUNT(*) as click_count
      FROM ${clickAnalytics}
      WHERE 
        ${clickAnalytics.campaignId} = ${campaignId} AND
        ${clickAnalytics.timestamp} >= ${sql.raw(`'${start.toISOString()}'::timestamp`)} AND 
        ${clickAnalytics.timestamp} <= ${sql.raw(`'${end.toISOString()}'::timestamp`)}
      GROUP BY click_date
      ORDER BY click_date
    `);
    
    const clicksByDate: Record<string, number> = {};
    clicksByDateQuery.rows.forEach((row: any) => {
      const date = new Date(row.click_date).toISOString().split('T')[0];
      clicksByDate[date] = parseInt(row.click_count);
    });
    
    // Get clicks by hour
    const clicksByHourQuery = await db.execute(sql`
      SELECT 
        EXTRACT(HOUR FROM ${clickAnalytics.timestamp}) as hour,
        COUNT(*) as click_count
      FROM ${clickAnalytics}
      WHERE 
        ${clickAnalytics.campaignId} = ${campaignId} AND
        ${clickAnalytics.timestamp} >= ${sql.raw(`'${start.toISOString()}'::timestamp`)} AND 
        ${clickAnalytics.timestamp} <= ${sql.raw(`'${end.toISOString()}'::timestamp`)}
      GROUP BY hour
      ORDER BY hour
    `);
    
    const clicksByHour: Record<string, number> = {};
    clicksByHourQuery.rows.forEach((row: any) => {
      clicksByHour[row.hour] = parseInt(row.click_count);
    });
    
    // Get clicks by device
    const clicksByDeviceQuery = await db.execute(sql`
      SELECT 
        CASE
          WHEN ${clickAnalytics.userAgent} LIKE '%Mobile%' THEN 'Mobile'
          WHEN ${clickAnalytics.userAgent} LIKE '%Tablet%' THEN 'Tablet'
          WHEN ${clickAnalytics.userAgent} LIKE '%iPad%' THEN 'Tablet'
          WHEN ${clickAnalytics.userAgent} LIKE '%Android%' THEN 'Mobile'
          WHEN ${clickAnalytics.userAgent} LIKE '%iPhone%' THEN 'Mobile'
          ELSE 'Desktop'
        END as device,
        COUNT(*) as click_count
      FROM ${clickAnalytics}
      WHERE 
        ${clickAnalytics.campaignId} = ${campaignId} AND
        ${clickAnalytics.timestamp} >= ${sql.raw(`'${start.toISOString()}'::timestamp`)} AND 
        ${clickAnalytics.timestamp} <= ${sql.raw(`'${end.toISOString()}'::timestamp`)}
      GROUP BY device
      ORDER BY click_count DESC
    `);
    
    const clicksByDevice: Record<string, number> = {};
    clicksByDeviceQuery.rows.forEach((row: any) => {
      clicksByDevice[row.device] = parseInt(row.click_count);
    });
    
    // Get clicks by browser
    const clicksByBrowserQuery = await db.execute(sql`
      SELECT 
        CASE
          WHEN ${clickAnalytics.userAgent} LIKE '%Firefox%' THEN 'Firefox'
          WHEN ${clickAnalytics.userAgent} LIKE '%Chrome%' THEN 'Chrome'
          WHEN ${clickAnalytics.userAgent} LIKE '%Safari%' THEN 'Safari'
          WHEN ${clickAnalytics.userAgent} LIKE '%Edge%' THEN 'Edge'
          WHEN ${clickAnalytics.userAgent} LIKE '%MSIE%' OR ${clickAnalytics.userAgent} LIKE '%Trident%' THEN 'Internet Explorer'
          WHEN ${clickAnalytics.userAgent} LIKE '%Opera%' OR ${clickAnalytics.userAgent} LIKE '%OPR%' THEN 'Opera'
          ELSE 'Other'
        END as browser,
        COUNT(*) as click_count
      FROM ${clickAnalytics}
      WHERE 
        ${clickAnalytics.campaignId} = ${campaignId} AND
        ${clickAnalytics.timestamp} >= ${start.toISOString()} AND 
        ${clickAnalytics.timestamp} <= ${end.toISOString()}
      GROUP BY browser
      ORDER BY click_count DESC
    `);
    
    const clicksByBrowser: Record<string, number> = {};
    clicksByBrowserQuery.rows.forEach((row: any) => {
      clicksByBrowser[row.browser] = parseInt(row.click_count);
    });
    
    // Get clicks by country (would require IP geolocation, using a simplified version)
    const clicksByCountry: Record<string, number> = {
      "Unknown": campaign.totalClicks
    };
    
    // Get top URLs in this campaign
    const topUrlsQuery = await db.execute(sql`
      SELECT 
        ${clickAnalytics.urlId} as id,
        u.name,
        u.target_url as targetUrl,
        COUNT(*) as clicks
      FROM ${clickAnalytics}
      JOIN urls u ON u.id = ${clickAnalytics.urlId}
      WHERE 
        ${clickAnalytics.campaignId} = ${campaignId} AND
        ${clickAnalytics.timestamp} >= ${start.toISOString()} AND 
        ${clickAnalytics.timestamp} <= ${end.toISOString()}
      GROUP BY ${clickAnalytics.urlId}, u.name, u.target_url
      ORDER BY clicks DESC
      LIMIT 10
    `);
    
    const topUrls = topUrlsQuery.rows.map((row: any) => ({
      id: parseInt(row.id),
      name: row.name,
      targetUrl: row.targeturl,
      clicks: parseInt(row.clicks)
    }));
    
    res.json({
      campaign,
      clicksByDate,
      clicksByHour,
      clicksByDevice,
      clicksByBrowser,
      clicksByCountry,
      topUrls
    });
  } catch (error) {
    console.error("Error fetching campaign analytics:", error);
    res.status(500).json({ error: "Failed to fetch campaign analytics" });
  }
});

// Get URL analytics
analyticsRouter.get("/url/:urlId", async (req: Request, res: Response) => {
  try {
    const urlId = parseInt(req.params.urlId);
    const filterType = (req.query.filterType as string) || 'total';
    const startDate = req.query.startDate as string | undefined;
    const endDate = req.query.endDate as string | undefined;
    
    if (isNaN(urlId)) {
      return res.status(400).json({ error: "Invalid URL ID" });
    }
    
    const { start, end } = getDateRange(filterType, startDate, endDate);
    
    // Get URL details
    const urlQuery = await db.execute(sql`
      SELECT 
        u.id,
        u.name,
        u.target_url as targetUrl,
        u.campaign_id as campaignId,
        c.name as campaignName,
        u.clicks as totalClicks,
        u.click_limit as clickLimit,
        COALESCE(our.original_click_limit, u.click_limit) as originalClickLimit,
        u.created_at as createdAt,
        u.status
      FROM urls u
      JOIN campaigns c ON c.id = u.campaign_id
      LEFT JOIN original_url_records our ON our.id = u.original_url_record_id
      WHERE u.id = ${urlId}
    `);
    
    if (urlQuery.rows.length === 0) {
      return res.status(404).json({ error: "URL not found" });
    }
    
    const url = {
      id: parseInt(urlQuery.rows[0].id),
      name: urlQuery.rows[0].name,
      targetUrl: urlQuery.rows[0].targeturl,
      campaignId: parseInt(urlQuery.rows[0].campaignid),
      campaignName: urlQuery.rows[0].campaignname,
      totalClicks: parseInt(urlQuery.rows[0].totalclicks) || 0,
      clickLimit: parseInt(urlQuery.rows[0].clicklimit) || 0,
      originalClickLimit: parseInt(urlQuery.rows[0].originalclicklimit) || 0,
      createdAt: urlQuery.rows[0].createdat,
      status: urlQuery.rows[0].status
    };
    
    // Get clicks by date
    const clicksByDateQuery = await db.execute(sql`
      SELECT 
        DATE_TRUNC('day', ${clickAnalytics.timestamp}) as click_date,
        COUNT(*) as click_count
      FROM ${clickAnalytics}
      WHERE 
        ${clickAnalytics.urlId} = ${urlId} AND
        ${clickAnalytics.timestamp} >= ${start.toISOString()} AND 
        ${clickAnalytics.timestamp} <= ${end.toISOString()}
      GROUP BY click_date
      ORDER BY click_date
    `);
    
    const clicksByDate: Record<string, number> = {};
    clicksByDateQuery.rows.forEach((row: any) => {
      const date = new Date(row.click_date).toISOString().split('T')[0];
      clicksByDate[date] = parseInt(row.click_count);
    });
    
    // Get clicks by hour
    const clicksByHourQuery = await db.execute(sql`
      SELECT 
        EXTRACT(HOUR FROM ${clickAnalytics.timestamp}) as hour,
        COUNT(*) as click_count
      FROM ${clickAnalytics}
      WHERE 
        ${clickAnalytics.urlId} = ${urlId} AND
        ${clickAnalytics.timestamp} >= ${start.toISOString()} AND 
        ${clickAnalytics.timestamp} <= ${end.toISOString()}
      GROUP BY hour
      ORDER BY hour
    `);
    
    const clicksByHour: Record<string, number> = {};
    clicksByHourQuery.rows.forEach((row: any) => {
      clicksByHour[row.hour] = parseInt(row.click_count);
    });
    
    // Get clicks by referrer
    const clicksByReferrerQuery = await db.execute(sql`
      SELECT 
        ${clickAnalytics.referrer} as referrer,
        COUNT(*) as click_count
      FROM ${clickAnalytics}
      WHERE 
        ${clickAnalytics.urlId} = ${urlId} AND
        ${clickAnalytics.timestamp} >= ${start.toISOString()} AND 
        ${clickAnalytics.timestamp} <= ${end.toISOString()}
      GROUP BY referrer
      ORDER BY click_count DESC
    `);
    
    const clicksByReferrer: Record<string, number> = {};
    clicksByReferrerQuery.rows.forEach((row: any) => {
      const referrer = row.referrer || "Direct";
      clicksByReferrer[referrer] = parseInt(row.click_count);
    });
    
    // Get clicks by device
    const clicksByDeviceQuery = await db.execute(sql`
      SELECT 
        CASE
          WHEN ${clickAnalytics.userAgent} LIKE '%Mobile%' THEN 'Mobile'
          WHEN ${clickAnalytics.userAgent} LIKE '%Tablet%' THEN 'Tablet'
          WHEN ${clickAnalytics.userAgent} LIKE '%iPad%' THEN 'Tablet'
          WHEN ${clickAnalytics.userAgent} LIKE '%Android%' THEN 'Mobile'
          WHEN ${clickAnalytics.userAgent} LIKE '%iPhone%' THEN 'Mobile'
          ELSE 'Desktop'
        END as device,
        COUNT(*) as click_count
      FROM ${clickAnalytics}
      WHERE 
        ${clickAnalytics.urlId} = ${urlId} AND
        ${clickAnalytics.timestamp} >= ${start.toISOString()} AND 
        ${clickAnalytics.timestamp} <= ${end.toISOString()}
      GROUP BY device
      ORDER BY click_count DESC
    `);
    
    const clicksByDevice: Record<string, number> = {};
    clicksByDeviceQuery.rows.forEach((row: any) => {
      clicksByDevice[row.device] = parseInt(row.click_count);
    });
    
    // Get clicks by browser
    const clicksByBrowserQuery = await db.execute(sql`
      SELECT 
        CASE
          WHEN ${clickAnalytics.userAgent} LIKE '%Firefox%' THEN 'Firefox'
          WHEN ${clickAnalytics.userAgent} LIKE '%Chrome%' THEN 'Chrome'
          WHEN ${clickAnalytics.userAgent} LIKE '%Safari%' THEN 'Safari'
          WHEN ${clickAnalytics.userAgent} LIKE '%Edge%' THEN 'Edge'
          WHEN ${clickAnalytics.userAgent} LIKE '%MSIE%' OR ${clickAnalytics.userAgent} LIKE '%Trident%' THEN 'Internet Explorer'
          WHEN ${clickAnalytics.userAgent} LIKE '%Opera%' OR ${clickAnalytics.userAgent} LIKE '%OPR%' THEN 'Opera'
          ELSE 'Other'
        END as browser,
        COUNT(*) as click_count
      FROM ${clickAnalytics}
      WHERE 
        ${clickAnalytics.urlId} = ${urlId} AND
        ${clickAnalytics.timestamp} >= ${start.toISOString()} AND 
        ${clickAnalytics.timestamp} <= ${end.toISOString()}
      GROUP BY browser
      ORDER BY click_count DESC
    `);
    
    const clicksByBrowser: Record<string, number> = {};
    clicksByBrowserQuery.rows.forEach((row: any) => {
      clicksByBrowser[row.browser] = parseInt(row.click_count);
    });
    
    // Get clicks by country (would require IP geolocation, using a simplified version)
    const clicksByCountry: Record<string, number> = {
      "Unknown": url.totalClicks
    };
    
    res.json({
      url,
      clicksByDate,
      clicksByHour,
      clicksByReferrer,
      clicksByDevice,
      clicksByBrowser,
      clicksByCountry
    });
  } catch (error) {
    console.error("Error fetching URL analytics:", error);
    res.status(500).json({ error: "Failed to fetch URL analytics" });
  }
});

// Additional routes for specific analytics features can be added here

export function registerAnalyticsRoutes(app: any) {
  app.use("/api/analytics", analyticsRouter);
}
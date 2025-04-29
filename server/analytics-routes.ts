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
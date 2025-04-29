import fs from "fs";
import path from "path";
import { format, formatISO, parseISO, subDays, subMonths, startOfMonth, endOfMonth, subYears, startOfYear, endOfYear } from "date-fns";
import { utcToZonedTime, zonedTimeToUtc } from "date-fns-tz";
import { db } from "./db";
import { urlClickLogs, insertUrlClickLogSchema } from "@shared/schema";
import { eq, and, gte, lte, sql, desc } from "drizzle-orm";
import { timeRangeFilterSchema } from "@shared/schema";

/**
 * URL Clicks Logs Manager Class
 * Manages URL click logs both in the database and as log files
 */
export class UrlClickLogsManager {
  private initialized = false;
  private logDir: string;

  constructor() {
    this.logDir = path.join(process.cwd(), "url_click_logs");
  }

  /**
   * Initialize the logs directory
   */
  public initialize() {
    if (this.initialized) return;
    
    try {
      if (!fs.existsSync(this.logDir)) {
        fs.mkdirSync(this.logDir, { recursive: true });
      }
      this.initialized = true;
    } catch (error) {
      console.error("Failed to initialize URL click logs directory:", error);
    }
  }

  /**
   * Get the path to a URL's log file
   */
  private getUrlLogFilePath(urlId: number): string {
    return path.join(this.logDir, `url_${urlId}_clicks.log`);
  }

  /**
   * Format a date in Indian timezone (UTC+5:30)
   */
  private formatIndianTime(date: Date): { formatted: string, dateKey: string, hourKey: number } {
    const indianTimeZone = "Asia/Kolkata";
    const indianTime = utcToZonedTime(date, indianTimeZone);
    
    const formatted = format(indianTime, "yyyy-MM-dd HH:mm:ss");
    const dateKey = format(indianTime, "yyyy-MM-dd");
    const hourKey = indianTime.getHours();
    
    return { formatted, dateKey, hourKey };
  }

  /**
   * Log a click for a URL
   */
  public async logClick(urlId: number): Promise<void> {
    this.initialize();
    
    try {
      const timestamp = new Date();
      const { formatted: indianTime, dateKey, hourKey } = this.formatIndianTime(timestamp);
      
      // Write to log file
      const logFile = this.getUrlLogFilePath(urlId);
      fs.appendFileSync(logFile, `${formatISO(timestamp)} | ${indianTime}\n`);
      
      // Add to database for analytics
      await db.insert(urlClickLogs).values({
        urlId,
        clickTime: timestamp,
        indianTime,
        dateKey,
        hourKey
      });
    } catch (error) {
      console.error(`Error logging URL click for URL ${urlId}:`, error);
    }
  }

  /**
   * Get URL summary data from click logs for a specific time range
   */
  public async getUrlClickSummary(urlId: number, filter: z.infer<typeof timeRangeFilterSchema>) {
    console.log(`📊 UrlClickLogsManager: Getting summary for URL ${urlId} with filter type: ${filter.filterType}`);
    
    try {
      const { startDate, endDate } = this.getDateRangeForFilter(filter);
      
      console.log(`📊 UrlClickLogsManager: Date range calculated for ${filter.filterType}: ${startDate.toISOString()} to ${endDate.toISOString()}`);
      
      // Get total clicks within the date range
      const totalClicksResult = await db
        .select({ count: sql`COUNT(*)` })
        .from(urlClickLogs)
        .where(
          and(
            eq(urlClickLogs.urlId, urlId),
            gte(urlClickLogs.clickTime, startDate),
            lte(urlClickLogs.clickTime, endDate)
          )
        );
      
      const totalClicks = totalClicksResult[0]?.count?.toString() || "0";
      console.log(`📊 UrlClickLogsManager: Found ${totalClicks} clicks for date range`);
      
      // Get daily breakdown
      const dailyBreakdownResult = await db
        .select({
          date: urlClickLogs.dateKey,
          count: sql`COUNT(*)`
        })
        .from(urlClickLogs)
        .where(
          and(
            eq(urlClickLogs.urlId, urlId),
            gte(urlClickLogs.clickTime, startDate),
            lte(urlClickLogs.clickTime, endDate)
          )
        )
        .groupBy(urlClickLogs.dateKey)
        .orderBy(urlClickLogs.dateKey);
      
      const dailyBreakdown: Record<string, number> = {};
      dailyBreakdownResult.forEach(row => {
        dailyBreakdown[row.date] = Number(row.count);
      });
      
      // Get hourly breakdown if requested
      let hourlyBreakdown: any[] = [];
      if (filter.showHourly) {
        const hourlyBreakdownResult = await db
          .select({
            hour: urlClickLogs.hourKey,
            count: sql`COUNT(*)`
          })
          .from(urlClickLogs)
          .where(
            and(
              eq(urlClickLogs.urlId, urlId),
              gte(urlClickLogs.clickTime, startDate),
              lte(urlClickLogs.clickTime, endDate)
            )
          )
          .groupBy(urlClickLogs.hourKey)
          .orderBy(urlClickLogs.hourKey);
        
        hourlyBreakdown = hourlyBreakdownResult.map(row => ({
          hour: row.hour,
          clicks: row.count.toString()
        }));
      }
      
      // Create a friendly date range text for display
      const dateRangeText = this.getDateRangeText(filter, startDate, endDate);
      
      return {
        totalClicks,
        dailyBreakdown,
        hourlyBreakdown,
        filterInfo: {
          type: filter.filterType,
          dateRange: dateRangeText
        }
      };
    } catch (error) {
      console.error(`Error getting URL click summary for URL ${urlId}:`, error);
      throw error;
    }
  }

  /**
   * Calculate date range based on filter type
   */
  private getDateRangeForFilter(filter: z.infer<typeof timeRangeFilterSchema>): { startDate: Date, endDate: Date } {
    const now = new Date();
    
    let startDate: Date;
    let endDate: Date = new Date(now);
    
    switch (filter.filterType) {
      case 'today':
        startDate = new Date(now);
        startDate.setHours(0, 0, 0, 0);
        break;
        
      case 'yesterday':
        startDate = new Date(now);
        startDate.setDate(startDate.getDate() - 1);
        startDate.setHours(0, 0, 0, 0);
        endDate = new Date(startDate);
        endDate.setHours(23, 59, 59, 999);
        break;
        
      case 'last_2_days':
        startDate = subDays(now, 1);
        startDate.setHours(0, 0, 0, 0);
        break;
        
      case 'last_3_days':
        startDate = subDays(now, 2);
        startDate.setHours(0, 0, 0, 0);
        break;
        
      case 'last_4_days':
        startDate = subDays(now, 3);
        startDate.setHours(0, 0, 0, 0);
        break;
        
      case 'last_5_days':
        startDate = subDays(now, 4);
        startDate.setHours(0, 0, 0, 0);
        break;
        
      case 'last_6_days':
        startDate = subDays(now, 5);
        startDate.setHours(0, 0, 0, 0);
        break;
        
      case 'last_7_days':
        startDate = subDays(now, 6);
        startDate.setHours(0, 0, 0, 0);
        break;
        
      case 'this_month':
        startDate = startOfMonth(now);
        break;
        
      case 'last_month':
        startDate = startOfMonth(subMonths(now, 1));
        endDate = endOfMonth(subMonths(now, 1));
        break;
        
      case 'last_30_days':
        startDate = subDays(now, 29);
        startDate.setHours(0, 0, 0, 0);
        break;
        
      case 'last_6_months':
        startDate = subMonths(now, 6);
        startDate.setHours(0, 0, 0, 0);
        break;
        
      case 'this_year':
        startDate = startOfYear(now);
        break;
        
      case 'last_year':
        startDate = startOfYear(subYears(now, 1));
        endDate = endOfYear(subYears(now, 1));
        break;
        
      case 'custom_range':
        if (filter.startDate && filter.endDate) {
          startDate = parseISO(filter.startDate);
          startDate.setHours(0, 0, 0, 0);
          endDate = parseISO(filter.endDate);
          endDate.setHours(23, 59, 59, 999);
        } else {
          throw new Error("Start date and end date are required for custom range filter");
        }
        break;
        
      case 'total':
      default:
        // A date far in the past (2020-01-01)
        startDate = new Date(2020, 0, 1);
        break;
    }
    
    // Always set endDate to end of day
    if (filter.filterType !== 'custom_range' && filter.filterType !== 'yesterday' && 
        filter.filterType !== 'last_month' && filter.filterType !== 'last_year') {
      endDate.setHours(23, 59, 59, 999);
    }
    
    return { startDate, endDate };
  }

  /**
   * Get raw click logs for a URL from file
   */
  public async getRawClickLogs(urlId: number): Promise<string[]> {
    this.initialize();
    
    try {
      const logFile = this.getUrlLogFilePath(urlId);
      if (!fs.existsSync(logFile)) {
        return [];
      }
      
      const content = fs.readFileSync(logFile, 'utf8');
      return content.split('\n').filter(line => line.trim() !== '');
    } catch (error) {
      console.error(`Error reading URL click logs for URL ${urlId}:`, error);
      return [];
    }
  }

  /**
   * Delete click logs for a URL (called when a URL is deleted)
   */
  public async deleteUrlClickLogs(urlId: number): Promise<void> {
    this.initialize();
    
    try {
      // Delete from database
      await db.delete(urlClickLogs).where(eq(urlClickLogs.urlId, urlId));
      
      // Delete log file
      const logFile = this.getUrlLogFilePath(urlId);
      if (fs.existsSync(logFile)) {
        fs.unlinkSync(logFile);
      }
    } catch (error) {
      console.error(`Error deleting URL click logs for URL ${urlId}:`, error);
    }
  }

  /**
   * Get a formatted date range text based on the filter type
   */
  private getDateRangeText(filter: z.infer<typeof timeRangeFilterSchema>, startDate: Date, endDate: Date): string {
    const formatDate = (date: Date) => format(date, 'yyyy-MM-dd');
    
    switch (filter.filterType) {
      case 'today':
        return 'Today';
      case 'yesterday':
        return 'Yesterday';
      case 'last_2_days':
        return 'Last 2 days';
      case 'last_3_days':
        return 'Last 3 days';
      case 'last_4_days':
        return 'Last 4 days';
      case 'last_5_days':
        return 'Last 5 days';
      case 'last_6_days':
        return 'Last 6 days';
      case 'last_7_days':
        return 'Last 7 days';
      case 'last_30_days':
        return 'Last 30 days';
      case 'this_month':
        return `This month (${format(startDate, 'MMMM yyyy')})`;
      case 'last_month':
        return `Last month (${format(startDate, 'MMMM yyyy')})`;
      case 'last_6_months':
        return `Last 6 months (${formatDate(startDate)} to ${formatDate(endDate)})`;
      case 'this_year':
        return `This year (${format(startDate, 'yyyy')})`;
      case 'last_year':
        return `Last year (${format(startDate, 'yyyy')})`;
      case 'custom_range':
        return `${formatDate(startDate)} to ${formatDate(endDate)}`;
      case 'total':
      default:
        return 'All time';
    }
  }
}

export const urlClickLogsManager = new UrlClickLogsManager();
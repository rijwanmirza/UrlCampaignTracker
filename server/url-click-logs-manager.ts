import fs from 'fs';
import path from 'path';
import { format, subDays, startOfMonth, endOfMonth, subMonths, addHours, addMinutes } from 'date-fns';
import { z } from 'zod';
import { eq, and, gte, lte, sql } from 'drizzle-orm';
import { db } from './db';
import { urlClickLogs, timeRangeFilterSchema } from '@shared/schema';

/**
 * URL Click Logs Manager Class
 * Manages URL click logs both in the database and as log files
 * Uses Indian timezone (UTC+5:30) for all timestamps
 */
export class UrlClickLogsManager {
  private initialized = false;
  private logsDirectory: string;
  
  constructor() {
    this.logsDirectory = path.join(process.cwd(), 'url_click_logs');
  }
  
  /**
   * Initialize the logs directory
   */
  public initialize() {
    if (this.initialized) return;
    
    // Create logs directory if it doesn't exist
    if (!fs.existsSync(this.logsDirectory)) {
      fs.mkdirSync(this.logsDirectory, { recursive: true });
    }
    
    this.initialized = true;
  }
  
  /**
   * Get the path to a URL's log file
   */
  private getUrlLogFilePath(urlId: number): string {
    return path.join(this.logsDirectory, `url_${urlId}.log`);
  }
  
  /**
   * Format a date in Indian timezone (UTC+5:30)
   */
  private formatIndianTime(date: Date): { formatted: string, dateKey: string, hourKey: number } {
    // Convert UTC to Indian timezone (UTC+5:30)
    // Add 5 hours and 30 minutes to the UTC time
    const indianTime = addMinutes(addHours(new Date(date), 5), 30);
    
    // Format for display
    const formatted = format(indianTime, 'yyyy-MM-dd HH:mm:ss');
    
    // Format date key for database indexing (YYYY-MM-DD)
    const dateKey = format(indianTime, 'yyyy-MM-dd');
    
    // Extract hour (0-23) for hourly analysis
    const hourKey = parseInt(format(indianTime, 'H'));
    
    return { formatted, dateKey, hourKey };
  }
  
  /**
   * Log a click for a URL
   */
  public async logClick(urlId: number): Promise<void> {
    this.initialize();
    
    try {
      const now = new Date();
      const { formatted: indianTime, dateKey, hourKey } = this.formatIndianTime(now);
      
      // Log to file with the format: "click generated, date{time}"
      const logMessage = `click generated, ${indianTime}`;
      const logFile = this.getUrlLogFilePath(urlId);
      
      fs.appendFileSync(logFile, logMessage + '\n');
      
      // Also log to database for analytics
      await db.insert(urlClickLogs).values({
        urlId,
        clickTime: now,
        indianTime,
        dateKey,
        hourKey
      });
      
      // Update the URL's click count in the database
      await db.execute(sql`
        UPDATE urls 
        SET clicks = clicks + 1,
            updated_at = NOW()
        WHERE id = ${urlId}
      `);
      
    } catch (error) {
      console.error(`Error logging URL click for URL ${urlId}:`, error);
    }
  }
  
  /**
   * Get click summary data for a URL for a specific time range
   */
  public async getUrlClickSummary(urlId: number, filter: z.infer<typeof timeRangeFilterSchema>) {
    this.initialize();
    
    try {
      // Calculate date range based on filter
      const { startDate, endDate } = this.getDateRangeForFilter(filter);
      
      // Query the database for filtered click logs
      const clickLogs = await db
        .select()
        .from(urlClickLogs)
        .where(
          and(
            eq(urlClickLogs.urlId, urlId),
            gte(urlClickLogs.clickTime, startDate),
            lte(urlClickLogs.clickTime, endDate)
          )
        );
      
      // Count total clicks in this period
      const totalClicks = clickLogs.length;
      
      // Group by dateKey for daily breakdown
      const dailyBreakdown: Record<string, number> = {};
      
      // Group by hourKey for hourly breakdown
      const hourlyBreakdown: { hour: number, clicks: number }[] = Array.from({ length: 24 }, (_, i) => ({
        hour: i,
        clicks: 0
      }));
      
      // Process the logs
      clickLogs.forEach(log => {
        // Update daily breakdown
        if (dailyBreakdown[log.dateKey]) {
          dailyBreakdown[log.dateKey]++;
        } else {
          dailyBreakdown[log.dateKey] = 1;
        }
        
        // Update hourly breakdown
        hourlyBreakdown[log.hourKey].clicks++;
      });
      
      return {
        totalClicks,
        dailyBreakdown,
        hourlyBreakdown,
        urlBreakdown: [{ urlId, clicks: totalClicks }],
        filterInfo: {
          type: filter.filterType,
          dateRange: this.getDateRangeText(filter, startDate, endDate)
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
    
    // For all filter types except custom range
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
        endDate = endOfMonth(now);
        break;
        
      case 'last_month':
        const lastMonth = subMonths(now, 1);
        startDate = startOfMonth(lastMonth);
        endDate = endOfMonth(lastMonth);
        break;
        
      case 'all':
        startDate = new Date(0); // January 1, 1970
        break;
        
      case 'custom_range':
        if (filter.startDate && filter.endDate) {
          startDate = new Date(filter.startDate);
          startDate.setHours(0, 0, 0, 0);
          
          endDate = new Date(filter.endDate);
          endDate.setHours(23, 59, 59, 999);
        } else {
          // Default to last 7 days if no dates provided
          startDate = subDays(now, 6);
          startDate.setHours(0, 0, 0, 0);
        }
        break;
        
      default:
        // Default to today
        startDate = new Date(now);
        startDate.setHours(0, 0, 0, 0);
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
        return `Today (${formatDate(startDate)})`;
      case 'yesterday':
        return `Yesterday (${formatDate(startDate)})`;
      case 'last_2_days':
        return `Last 2 days (${formatDate(startDate)} to ${formatDate(endDate)})`;
      case 'last_3_days':
        return `Last 3 days (${formatDate(startDate)} to ${formatDate(endDate)})`;
      case 'last_4_days':
        return `Last 4 days (${formatDate(startDate)} to ${formatDate(endDate)})`;
      case 'last_5_days':
        return `Last 5 days (${formatDate(startDate)} to ${formatDate(endDate)})`;
      case 'last_6_days':
        return `Last 6 days (${formatDate(startDate)} to ${formatDate(endDate)})`;
      case 'last_7_days':
        return `Last 7 days (${formatDate(startDate)} to ${formatDate(endDate)})`;
      case 'this_month':
        return `This month (${format(startDate, 'MMMM yyyy')})`;
      case 'last_month':
        return `Last month (${format(startDate, 'MMMM yyyy')})`;
      case 'all':
        return 'All time';
      case 'custom_range':
        return `${formatDate(startDate)} to ${formatDate(endDate)}`;
      default:
        return 'Custom period';
    }
  }
}

// Create a singleton instance
export const urlClickLogsManager = new UrlClickLogsManager();
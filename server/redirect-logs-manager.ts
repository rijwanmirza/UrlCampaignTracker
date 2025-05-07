import * as fs from 'fs';
import * as path from 'path';
import { format, getHours } from 'date-fns';
// We'll implement a simpler timezone conversion for now
// The date-fns-tz library seems to be having some compatibility issues
import { db } from './db';
import { campaignRedirectLogs, campaigns, urls } from '../shared/schema';
import { timeRangeFilterSchema } from '../shared/schema';
import { eq, and, between, sql, desc, gte, lte } from 'drizzle-orm';

// Indian timezone
const INDIAN_TIMEZONE = 'Asia/Kolkata';

// Base directory for all redirect logs
const LOGS_BASE_DIR = path.join(process.cwd(), 'redirect_logs');

/**
 * Redirect Logs Manager Class
 * Manages campaign redirect logs both in the database and as log files
 */
export class RedirectLogsManager {
  private initialized = false;
  
  constructor() {
    this.initialize();
  }
  
  /**
   * Initialize the logs directory
   */
  public initialize() {
    if (this.initialized) return;
    
    try {
      // Create base logs directory if it doesn't exist
      if (!fs.existsSync(LOGS_BASE_DIR)) {
        fs.mkdirSync(LOGS_BASE_DIR, { recursive: true });
        console.log(`Created redirect logs directory: ${LOGS_BASE_DIR}`);
      }
      
      this.initialized = true;
    } catch (error) {
      console.error('Error initializing redirect logs directory:', error);
    }
  }
  
  /**
   * Clear all redirect logs files
   * Used during system cleanup
   */
  public clearAllLogs(): { success: boolean, entriesRemoved: number } {
    try {
      let entriesRemoved = 0;
      
      // Make sure logs directory exists
      if (!fs.existsSync(LOGS_BASE_DIR)) {
        return { success: true, entriesRemoved: 0 };
      }
      
      // Read all files in the logs directory
      const files = fs.readdirSync(LOGS_BASE_DIR);
      
      // Delete each log file
      for (const file of files) {
        const filePath = path.join(LOGS_BASE_DIR, file);
        
        // Make sure it's a file, not a directory
        if (fs.statSync(filePath).isFile() && file.endsWith('.log')) {
          fs.unlinkSync(filePath);
          entriesRemoved++;
        }
      }
      
      console.log(`Cleared all redirect logs: ${entriesRemoved} files deleted`);
      return { success: true, entriesRemoved };
    } catch (error) {
      console.error('Failed to clear redirect logs:', error);
      return { success: false, entriesRemoved: 0 };
    }
  }
  
  /**
   * Get the path to a campaign's log file
   */
  private getCampaignLogFilePath(campaignId: number): string {
    return path.join(LOGS_BASE_DIR, `campaign_${campaignId}_redirects.log`);
  }
  
  /**
   * Format a date in Indian timezone (UTC+5:30)
   */
  private formatIndianTime(date: Date): { formatted: string, dateKey: string, hourKey: number } {
    // Indian Standard Time is UTC+5:30
    const offsetHours = 5;
    const offsetMinutes = 30;
    
    // Create a new date object with the Indian time offset
    const indianTime = new Date(date.getTime());
    indianTime.setHours(indianTime.getHours() + offsetHours);
    indianTime.setMinutes(indianTime.getMinutes() + offsetMinutes);
    
    return {
      formatted: format(indianTime, 'yyyy-MM-dd HH:mm:ss'),
      dateKey: format(indianTime, 'yyyy-MM-dd'),
      hourKey: getHours(indianTime)
    };
  }
  
  /**
   * Log a redirect for a campaign
   */
  public async logRedirect(campaignId: number, urlId?: number): Promise<void> {
    try {
      const now = new Date();
      const { formatted, dateKey, hourKey } = this.formatIndianTime(now);
      
      // Create log entry in database
      await db.insert(campaignRedirectLogs).values({
        campaignId,
        urlId: urlId || null,
        redirectTime: now,
        indianTime: formatted,
        dateKey,
        hourKey
      });
      
      // Format log line for file
      let logLine = '';
      if (urlId) {
        const url = await db.select().from(urls).where(eq(urls.id, urlId)).limit(1);
        logLine = `Redirect happened: ${formatted} | Campaign ID: ${campaignId} | URL ID: ${urlId} | URL Name: ${url[0]?.name || 'Unknown'}`;
      } else {
        logLine = `Redirect happened: ${formatted} | Campaign ID: ${campaignId} | Direct campaign redirect`;
      }
      
      // Append to log file
      const logFilePath = this.getCampaignLogFilePath(campaignId);
      fs.appendFileSync(logFilePath, logLine + '\\n');
      
      // Return success
      return Promise.resolve();
    } catch (error) {
      console.error('Error logging redirect:', error);
      return Promise.reject(error);
    }
  }
  
  /**
   * Get campaign summary data from redirect logs for a specific time range
   */
  public async getCampaignSummary(campaignId: number, filter: z.infer<typeof timeRangeFilterSchema>) {
    // Check if campaign exists
    const campaignCheck = await db.select().from(campaigns).where(eq(campaigns.id, campaignId)).limit(1);
    if (campaignCheck.length === 0) {
      throw new Error(`Campaign with ID ${campaignId} not found`);
    }
    
    // Debug logging
    console.log(`📊 RedirectLogsManager: Getting summary for campaign ${campaignId} with filter type: ${filter.filterType}`);
    
    // Set up time range filter conditions based on the requested filter type (today, yesterday, etc.)
    const { startDate, endDate } = this.getDateRangeForFilter(filter);
    
    console.log(`📊 RedirectLogsManager: Date range calculated for ${filter.filterType}: ${startDate.toISOString()} to ${endDate.toISOString()}`);
    
    // Check if campaign exists but has no logs for the selected date range
    // This will happen in two scenarios:
    // 1. The date range is in the future
    // 2. The campaign was created after the selected date range
    const now = new Date();
    const campaignCreated = campaignCheck[0]?.createdAt || now;
    
    // For past date ranges where no data could exist (before campaign creation)
    // or future date ranges where no data can exist yet
    if (endDate < campaignCreated || startDate > now) {
      console.log(`📊 RedirectLogsManager: No logs for this date range (before campaign creation or in future)`);
      // Return empty data if no logs can exist for this time range
      return {
        totalClicks: 0,
        dailyBreakdown: {},
        hourlyBreakdown: [],
        filterInfo: {
          type: filter.filterType,
          dateRange: this.getDateRangeText(filter, startDate, endDate)
        }
      };
    }
    
    // Get total clicks for the campaign in the specified time range
    const totalClicksQuery = await db.select({
      count: sql<number>`count(*)`.as('count')
    }).from(campaignRedirectLogs)
      .where(
        and(
          eq(campaignRedirectLogs.campaignId, campaignId),
          gte(campaignRedirectLogs.redirectTime, startDate),
          lte(campaignRedirectLogs.redirectTime, endDate)
        )
      );
    
    const totalClicks = totalClicksQuery[0]?.count || 0;
    console.log(`📊 RedirectLogsManager: Found ${totalClicks} clicks for date range`);
    
    // Get daily breakdown if needed
    let dailyBreakdown = {};
    let hourlyBreakdown = [];
    
    // Get daily breakdown only for the filtered time range
    const dailyBreakdownQuery = await db
      .select({
        dateKey: campaignRedirectLogs.dateKey,
        count: sql<number>`count(*)`.as('count')
      })
      .from(campaignRedirectLogs)
      .where(
        and(
          eq(campaignRedirectLogs.campaignId, campaignId),
          gte(campaignRedirectLogs.redirectTime, startDate),
          lte(campaignRedirectLogs.redirectTime, endDate)
        )
      )
      .groupBy(campaignRedirectLogs.dateKey)
      .orderBy(campaignRedirectLogs.dateKey);
    
    // Format daily breakdown as an object for easy access
    dailyBreakdown = dailyBreakdownQuery.reduce((acc, { dateKey, count }) => {
      acc[dateKey] = count;
      return acc;
    }, {});
    
    // Get hourly breakdown if requested, only for the filtered time range
    if (filter.showHourly) {
      const hourlyBreakdownQuery = await db
        .select({
          hour: campaignRedirectLogs.hourKey,
          count: sql<number>`count(*)`.as('count')
        })
        .from(campaignRedirectLogs)
        .where(
          and(
            eq(campaignRedirectLogs.campaignId, campaignId),
            gte(campaignRedirectLogs.redirectTime, startDate),
            lte(campaignRedirectLogs.redirectTime, endDate)
          )
        )
        .groupBy(campaignRedirectLogs.hourKey)
        .orderBy(campaignRedirectLogs.hourKey);
      
      // Format hourly breakdown as an array of {hour, clicks} objects
      hourlyBreakdown = hourlyBreakdownQuery.map(({ hour, count }) => ({
        hour,
        clicks: count
      }));
    }
    
    // Get the date range description for the filter
    const dateRangeText = this.getDateRangeText(filter, startDate, endDate);
    
    return {
      totalClicks,
      dailyBreakdown,
      hourlyBreakdown: filter.showHourly ? hourlyBreakdown : [],
      filterInfo: {
        type: filter.filterType,
        dateRange: dateRangeText
      }
    };
  }
  
  /**
   * Calculate date range based on filter type
   */
  private getDateRangeForFilter(filter: z.infer<typeof timeRangeFilterSchema>): { startDate: Date, endDate: Date } {
    const now = new Date();
    let startDate: Date;
    let endDate: Date = new Date(now);
    
    // Set the end of day for the end date (23:59:59.999)
    endDate.setHours(23, 59, 59, 999);
    
    // Store the campaign creation date if needed
    const campaignCreationDate = new Date('2025-01-01T00:00:00.000Z');
    
    switch (filter.filterType) {
      case 'today':
        startDate = new Date(now);
        startDate.setHours(0, 0, 0, 0);
        break;
        
      case 'yesterday':
        startDate = new Date(now);
        startDate.setDate(startDate.getDate() - 1);
        startDate.setHours(0, 0, 0, 0);
        endDate = new Date(now);
        endDate.setDate(endDate.getDate() - 1);
        endDate.setHours(23, 59, 59, 999);
        break;
        
      case 'last_7_days':
        startDate = new Date(now);
        startDate.setDate(startDate.getDate() - 7);
        startDate.setHours(0, 0, 0, 0);
        break;
        
      case 'last_30_days':
        startDate = new Date(now);
        startDate.setDate(startDate.getDate() - 30);
        startDate.setHours(0, 0, 0, 0);
        break;
        
      case 'this_month':
        startDate = new Date(now.getFullYear(), now.getMonth(), 1);
        startDate.setHours(0, 0, 0, 0);
        break;
        
      case 'last_month':
        startDate = new Date(now.getFullYear(), now.getMonth() - 1, 1);
        startDate.setHours(0, 0, 0, 0);
        endDate = new Date(now.getFullYear(), now.getMonth(), 0);
        endDate.setHours(23, 59, 59, 999);
        break;
        
      case 'this_year':
        startDate = new Date(now.getFullYear(), 0, 1);
        startDate.setHours(0, 0, 0, 0);
        break;
        
      case 'last_year':
        startDate = new Date(now.getFullYear() - 1, 0, 1);
        startDate.setHours(0, 0, 0, 0);
        endDate = new Date(now.getFullYear() - 1, 11, 31);
        endDate.setHours(23, 59, 59, 999);
        break;
        
      case 'custom_range':
        if (!filter.startDate || !filter.endDate) {
          throw new Error('Start date and end date are required for custom range filter');
        }
        startDate = new Date(filter.startDate);
        startDate.setHours(0, 0, 0, 0);
        endDate = new Date(filter.endDate);
        endDate.setHours(23, 59, 59, 999);
        break;
        
      case 'total':
      default:
        // For total, get all time data
        startDate = new Date(0); // beginning of time
        break;
    }
    
    return { startDate, endDate };
  }
  
  /**
   * Get raw redirect logs for a campaign from file
   */
  public async getRawRedirectLogs(campaignId: number): Promise<string[]> {
    const logFilePath = this.getCampaignLogFilePath(campaignId);
    
    try {
      if (!fs.existsSync(logFilePath)) {
        return [];
      }
      
      const logContent = fs.readFileSync(logFilePath, 'utf8');
      return logContent.split('\\n').filter(line => line.trim() !== '');
    } catch (error) {
      console.error(`Error reading redirect logs for campaign ${campaignId}:`, error);
      return [];
    }
  }
  
  /**
   * Delete redirect logs for a campaign
   * Called when a campaign is deleted
   */
  public async deleteCampaignLogs(campaignId: number): Promise<void> {
    try {
      const logFilePath = this.getCampaignLogFilePath(campaignId);
      
      // Delete file if exists
      if (fs.existsSync(logFilePath)) {
        fs.unlinkSync(logFilePath);
        console.log(`Deleted redirect logs file for campaign ${campaignId}`);
      }
      
      // Delete database entries
      await db.delete(campaignRedirectLogs)
        .where(eq(campaignRedirectLogs.campaignId, campaignId));
      
      return Promise.resolve();
    } catch (error) {
      console.error(`Error deleting redirect logs for campaign ${campaignId}:`, error);
      return Promise.reject(error);
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
      case 'last_7_days':
        return `Last 7 days (${formatDate(startDate)} to ${formatDate(endDate)})`;
      case 'last_30_days':
        return `Last 30 days (${formatDate(startDate)} to ${formatDate(endDate)})`;
      case 'this_month':
        return `This month (${formatDate(startDate)} to ${formatDate(endDate)})`;
      case 'last_month':
        return `Last month (${formatDate(startDate)} to ${formatDate(endDate)})`;
      case 'this_year':
        return `This year (${formatDate(startDate)} to ${formatDate(endDate)})`;
      case 'last_year':
        return `Last year (${formatDate(startDate)} to ${formatDate(endDate)})`;
      case 'custom_range':
        return `${formatDate(startDate)} to ${formatDate(endDate)}`;
      case 'total':
      default:
        return 'All time';
    }
  }
}

// Create and export a singleton instance
export const redirectLogsManager = new RedirectLogsManager();
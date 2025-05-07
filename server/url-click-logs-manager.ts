import fs from 'fs';
import path from 'path';
import { format } from 'date-fns';
import { formatInTimeZone } from 'date-fns-tz';
import z from 'zod';
import { db } from './db';
import { eq } from 'drizzle-orm';
import { urls } from '@shared/schema';

// Time range filter schema for analytics
export const timeRangeFilterSchema = z.object({
  filterType: z.enum([
    'today', 
    'yesterday',
    'last_2_days',
    'last_3_days',
    'last_4_days',
    'last_5_days',
    'last_6_days',
    'last_7_days',
    'this_month',
    'last_month',
    'this_year',
    'last_year',
    'all_time',
    'custom_range'
  ]),
  startDate: z.string().optional(),
  endDate: z.string().optional(),
  timezone: z.string().default('Asia/Kolkata') // Default to Indian timezone
});

export type TimeRangeFilter = z.infer<typeof timeRangeFilterSchema>;

/**
 * URL Click Logs Manager Class
 * Handles logging and retrieval of URL click data with detailed analytics
 */
export class UrlClickLogsManager {
  private logsDir: string;
  private initialized = false;

  constructor() {
    this.logsDir = path.join(process.cwd(), 'url_click_logs');
  }

  /**
   * Initialize the logs directory
   */
  public initialize() {
    if (this.initialized) return;
    
    if (!fs.existsSync(this.logsDir)) {
      fs.mkdirSync(this.logsDir, { recursive: true });
    }
    
    this.initialized = true;
  }
  
  /**
   * Clear all URL click logs
   * Used during system cleanup to remove all log files
   */
  public clearAllLogs(): { success: boolean, entriesRemoved: number } {
    try {
      this.initialize(); // Make sure we're initialized
      
      let entriesRemoved = 0;
      
      // Make sure logs directory exists
      if (!fs.existsSync(this.logsDir)) {
        return { success: true, entriesRemoved: 0 };
      }
      
      // Read all files in the logs directory
      const files = fs.readdirSync(this.logsDir);
      
      // Delete each log file
      for (const file of files) {
        const filePath = path.join(this.logsDir, file);
        
        // Make sure it's a file, not a directory
        if (fs.statSync(filePath).isFile() && file.endsWith('.log')) {
          fs.unlinkSync(filePath);
          entriesRemoved++;
        }
      }
      
      console.log(`Cleared all URL click logs: ${entriesRemoved} files deleted`);
      return { success: true, entriesRemoved };
    } catch (error) {
      console.error('Failed to clear URL click logs:', error);
      return { success: false, entriesRemoved: 0 };
    }
  }

  /**
   * Get the path to a URL's log file
   */
  private getUrlLogFilePath(urlId: number): string {
    this.initialize();
    return path.join(this.logsDir, `url_${urlId}.log`);
  }

  /**
   * Format a date in Indian timezone (UTC+5:30)
   */
  private formatIndianTime(date: Date = new Date()): { formatted: string, dateKey: string, hourKey: number } {
    const formatted = formatInTimeZone(date, 'Asia/Kolkata', 'dd-MMMM-yyyy:HH:mm:ss');
    const dateKey = formatInTimeZone(date, 'Asia/Kolkata', 'yyyy-MM-dd');
    const hourKey = parseInt(formatInTimeZone(date, 'Asia/Kolkata', 'HH'));
    
    return { formatted, dateKey, hourKey };
  }

  /**
   * Log a click for a URL - ONLY LOGS, DOES NOT INCREMENT COUNTER
   * (The counter is incremented by storage.incrementUrlClicks)
   */
  public async logClick(urlId: number): Promise<void> {
    this.initialize();
    
    try {
      // Format the current time in Indian timezone
      const { formatted, dateKey, hourKey } = this.formatIndianTime();
      
      // Create the log entry
      const logEntry = `New click received{${formatted}}`;
      
      // Append to the log file
      const logFilePath = this.getUrlLogFilePath(urlId);
      fs.appendFileSync(logFilePath, logEntry + '\n');
      
      // BUGFIX: Removed database increment to prevent double counting
      // The click counter is already incremented by storage.incrementUrlClicks
      // When a click happens, the counter should only be incremented once
      
      console.log(`Logged click for URL ID ${urlId}: ${logEntry}`);
      
    } catch (error) {
      console.error(`Error logging click for URL ID ${urlId}:`, error);
    }
  }

  /**
   * Get raw click logs for a URL
   */
  public async getRawLogs(urlId: number): Promise<string[]> {
    this.initialize();
    
    const logFilePath = this.getUrlLogFilePath(urlId);
    
    if (!fs.existsSync(logFilePath)) {
      return [];
    }
    
    try {
      const logContent = fs.readFileSync(logFilePath, 'utf-8');
      return logContent.split('\n').filter(line => line.trim() !== '');
    } catch (error) {
      console.error(`Error reading logs for URL ID ${urlId}:`, error);
      return [];
    }
  }

  /**
   * Get click analytics for a specific URL with time filtering
   */
  public async getUrlClickAnalytics(urlId: number, filter: TimeRangeFilter) {
    this.initialize();
    
    // Calculate date range based on filter
    const { startDate, endDate } = this.getDateRangeForFilter(filter);
    
    // Get the logs for this URL
    const rawLogs = await this.getRawLogs(urlId);
    
    // Parse logs to extract timestamps and organize by date and hour
    const dailyBreakdown: Record<string, number> = {};
    
    // Changed to organize hourly data by date
    const hourlyBreakdownByDate: Record<string, Record<number, number>> = {};
    let totalClicks = 0;
    
    // Get the timezone from the filter
    const timezone = filter.timezone || 'Asia/Kolkata';
    
    // Regular expression to match the timestamp in log format: New click received{30-April-2024:08:04:02}
    const timestampRegex = /New click received\{(\d{2}-[A-Za-z]+-\d{4}):(\d{2}):(\d{2}):(\d{2})\}/;
    
    for (const log of rawLogs) {
      const match = log.match(timestampRegex);
      
      if (match) {
        const datePart = match[1]; // e.g., "30-April-2024"
        const hourString = match[2]; // e.g., "08"
        const minuteString = match[3]; // e.g., "04"
        const secondString = match[4]; // e.g., "02"
        
        // Parse the full date from the log entry (in Indian time - IST/GMT+5:30)
        // This is the original timestamp stored in logs
        const originalDate = new Date(datePart.replace(/-/g, ' '));
        originalDate.setHours(
          parseInt(hourString),
          parseInt(minuteString),
          parseInt(secondString)
        );
        
        // Convert the date to the requested timezone
        let dateInRequestedTimezone: Date;
        let hourInRequestedTimezone: number;
        
        if (timezone === 'UTC') {
          // Convert from IST to UTC (subtract 5:30 hours)
          dateInRequestedTimezone = new Date(originalDate.getTime() - (5 * 60 + 30) * 60 * 1000);
          hourInRequestedTimezone = dateInRequestedTimezone.getUTCHours();
        } else {
          // Keep as IST
          dateInRequestedTimezone = originalDate;
          hourInRequestedTimezone = parseInt(hourString);
        }
        
        // Check if this log falls within our date range in the requested timezone
        if (dateInRequestedTimezone >= startDate && dateInRequestedTimezone <= endDate) {
          // Format the date as YYYY-MM-DD for consistent keys based on the requested timezone
          const dateKey = timezone === 'UTC' 
            ? format(dateInRequestedTimezone, 'yyyy-MM-dd')
            : format(originalDate, 'yyyy-MM-dd');
          
          // Increment daily count
          dailyBreakdown[dateKey] = (dailyBreakdown[dateKey] || 0) + 1;
          
          // Initialize hourly breakdown for this date if it doesn't exist
          if (!hourlyBreakdownByDate[dateKey]) {
            hourlyBreakdownByDate[dateKey] = {};
          }
          
          // Increment hourly count for this specific date
          hourlyBreakdownByDate[dateKey][hourInRequestedTimezone] = 
            (hourlyBreakdownByDate[dateKey][hourInRequestedTimezone] || 0) + 1;
          
          totalClicks++;
        }
      }
    }
    
    // Get the human-readable date range description
    const dateRangeText = this.getDateRangeText(filter, startDate, endDate);
    
    // Process hourlyBreakdownByDate to create hourly data by date
    // Format each date as DD-MM-YYYY for display
    const hourlyByDate: Record<string, Record<string, number>> = {};
    
    // Sort dates in descending order (most recent first)
    const sortedDates = Object.keys(hourlyBreakdownByDate).sort().reverse();
    
    for (const dateKey of sortedDates) {
      // Convert YYYY-MM-DD to DD-MM-YYYY for display
      const dateParts = dateKey.split('-');
      const displayDate = `${dateParts[2]}-${dateParts[1]}-${dateParts[0]}`;
      
      hourlyByDate[displayDate] = {};
      
      // Add all hours (0-23) to ensure complete 24-hour coverage
      for (let hour = 0; hour < 24; hour++) {
        const hourStr = `${hour.toString().padStart(2, '0')}:00`;
        hourlyByDate[displayDate][hourStr] = hourlyBreakdownByDate[dateKey][hour] || 0;
      }
    }
    
    // For backward compatibility, still include the flat hourlyBreakdown
    // Create a flattened hourly breakdown (sum across all dates for each hour)
    const hourlyBreakdownFlat: Record<number, number> = {};
    for (const dateBreakdown of Object.values(hourlyBreakdownByDate)) {
      for (const [hour, count] of Object.entries(dateBreakdown)) {
        const hourNum = parseInt(hour);
        hourlyBreakdownFlat[hourNum] = (hourlyBreakdownFlat[hourNum] || 0) + count;
      }
    }
    
    return {
      urlId,
      totalClicks,
      dailyBreakdown,
      hourlyBreakdown: hourlyBreakdownFlat,
      hourlyByDate,
      filterInfo: {
        type: filter.filterType,
        dateRange: dateRangeText
      }
    };
  }

  /**
   * Calculate date range based on filter type with timezone consideration
   */
  private getDateRangeForFilter(filter: TimeRangeFilter): { startDate: Date, endDate: Date } {
    // Get timezone-adjusted now date
    const timezone = filter.timezone || 'Asia/Kolkata';
    let now: Date;
    
    if (timezone === 'UTC') {
      // Use UTC date directly
      now = new Date();
    } else {
      // For Indian timezone, no adjustment needed as the dates are already in IST
      now = new Date();
    }
    
    // Create today at 00:00:00 in the requested timezone
    const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    
    let startDate: Date;
    let endDate: Date = new Date(now);
    
    // Set the time to the end of the day for the end date
    endDate.setHours(23, 59, 59, 999);
    
    switch (filter.filterType) {
      case 'today':
        startDate = today;
        break;
      case 'yesterday':
        startDate = new Date(today);
        startDate.setDate(startDate.getDate() - 1);
        endDate = new Date(today);
        endDate.setDate(endDate.getDate() - 1);
        endDate.setHours(23, 59, 59, 999);
        break;
      case 'last_2_days':
        startDate = new Date(today);
        startDate.setDate(startDate.getDate() - 1);
        break;
      case 'last_3_days':
        startDate = new Date(today);
        startDate.setDate(startDate.getDate() - 2);
        break;
      case 'last_4_days':
        startDate = new Date(today);
        startDate.setDate(startDate.getDate() - 3);
        break;
      case 'last_5_days':
        startDate = new Date(today);
        startDate.setDate(startDate.getDate() - 4);
        break;
      case 'last_6_days':
        startDate = new Date(today);
        startDate.setDate(startDate.getDate() - 5);
        break;
      case 'last_7_days':
        startDate = new Date(today);
        startDate.setDate(startDate.getDate() - 6);
        break;
      case 'this_month':
        startDate = new Date(today.getFullYear(), today.getMonth(), 1);
        break;
      case 'last_month':
        startDate = new Date(today.getFullYear(), today.getMonth() - 1, 1);
        endDate = new Date(today.getFullYear(), today.getMonth(), 0);
        endDate.setHours(23, 59, 59, 999);
        break;
      case 'this_year':
        startDate = new Date(today.getFullYear(), 0, 1);
        break;
      case 'last_year':
        startDate = new Date(today.getFullYear() - 1, 0, 1);
        endDate = new Date(today.getFullYear() - 1, 11, 31);
        endDate.setHours(23, 59, 59, 999);
        break;
      case 'all_time':
        startDate = new Date(0); // Beginning of time
        break;
      case 'custom_range':
        if (filter.startDate && filter.endDate) {
          startDate = new Date(filter.startDate);
          endDate = new Date(filter.endDate);
          endDate.setHours(23, 59, 59, 999);
        } else {
          startDate = new Date(today);
          startDate.setDate(startDate.getDate() - 7);
        }
        break;
      default:
        startDate = today;
    }
    
    return { startDate, endDate };
  }

  /**
   * Get a formatted date range text based on the filter type
   */
  private getDateRangeText(filter: TimeRangeFilter, startDate: Date, endDate: Date): string {
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
      case 'this_year':
        return `This year (${format(startDate, 'yyyy')})`;
      case 'last_year':
        return `Last year (${format(startDate, 'yyyy')})`;
      case 'all_time':
        return 'All time';
      case 'custom_range':
        return `${formatDate(startDate)} to ${formatDate(endDate)}`;
      default:
        return `${formatDate(startDate)} to ${formatDate(endDate)}`;
    }
  }

  /**
   * Delete logs for a specific URL
   */
  public async deleteUrlLogs(urlId: number): Promise<void> {
    this.initialize();
    
    const logFilePath = this.getUrlLogFilePath(urlId);
    
    if (fs.existsSync(logFilePath)) {
      try {
        fs.unlinkSync(logFilePath);
        console.log(`Deleted logs for URL ID ${urlId}`);
      } catch (error) {
        console.error(`Error deleting logs for URL ID ${urlId}:`, error);
      }
    }
  }

  /**
   * Generate test click data for a URL with specified parameters
   */
  public async generateTestData(urlId: number, options: {
    count: number;
    dateRange?: { start: Date; end: Date };
    hourRange?: { min: number; max: number };
  }): Promise<void> {
    this.initialize();
    
    const { count, dateRange, hourRange } = options;
    
    const now = new Date();
    const startDate = dateRange?.start || new Date(now.setDate(now.getDate() - 7));
    const endDate = dateRange?.end || new Date();
    
    const minHour = hourRange?.min || 0;
    const maxHour = hourRange?.max || 23;
    
    const logs: string[] = [];
    
    for (let i = 0; i < count; i++) {
      // Generate a random date within the range
      const randomTimestamp = startDate.getTime() + Math.random() * (endDate.getTime() - startDate.getTime());
      const randomDate = new Date(randomTimestamp);
      
      // Set a random hour within the specified range
      const randomHour = Math.floor(Math.random() * (maxHour - minHour + 1)) + minHour;
      randomDate.setHours(randomHour, Math.floor(Math.random() * 60), Math.floor(Math.random() * 60));
      
      // Format in Indian timezone
      const { formatted } = this.formatIndianTime(randomDate);
      
      // Create log entry
      const logEntry = `New click received{${formatted}}`;
      logs.push(logEntry);
    }
    
    // Write logs to file
    const logFilePath = this.getUrlLogFilePath(urlId);
    fs.writeFileSync(logFilePath, logs.join('\n') + '\n');
    
    // Update the URL clicks count
    await db.update(urls)
      .set({ clicks: count })
      .where(eq(urls.id, urlId));
    
    console.log(`Generated ${count} test click logs for URL ID ${urlId}`);
  }
}

export const urlClickLogsManager = new UrlClickLogsManager();
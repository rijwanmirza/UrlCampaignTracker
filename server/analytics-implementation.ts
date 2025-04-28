import { IStorage } from './storage';
import { AnalyticsFilter, AnalyticsResponse } from '@shared/schema';
import { Pool } from 'pg';
import { Request } from 'express';

// Helper function to get date range from time range
export function getDateRangeFromTimeRange(timeRange: string, startDate?: string, endDate?: string): { start: Date, end: Date } {
  const now = new Date();
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  
  switch (timeRange) {
    case 'today':
      return {
        start: today,
        end: now
      };
    case 'yesterday': {
      const yesterday = new Date(today);
      yesterday.setDate(yesterday.getDate() - 1);
      const yesterdayEnd = new Date(yesterday);
      yesterdayEnd.setHours(23, 59, 59, 999);
      return {
        start: yesterday,
        end: yesterdayEnd
      };
    }
    case 'last_2_days': {
      const twoDaysAgo = new Date(today);
      twoDaysAgo.setDate(twoDaysAgo.getDate() - 2);
      return {
        start: twoDaysAgo,
        end: now
      };
    }
    case 'last_3_days': {
      const threeDaysAgo = new Date(today);
      threeDaysAgo.setDate(threeDaysAgo.getDate() - 3);
      return {
        start: threeDaysAgo,
        end: now
      };
    }
    case 'last_7_days': {
      const sevenDaysAgo = new Date(today);
      sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);
      return {
        start: sevenDaysAgo,
        end: now
      };
    }
    case 'this_week': {
      const firstDayOfWeek = new Date(today);
      const day = firstDayOfWeek.getDay() || 7; // Convert Sunday (0) to 7
      firstDayOfWeek.setDate(firstDayOfWeek.getDate() - (day - 1)); // Get Monday
      return {
        start: firstDayOfWeek,
        end: now
      };
    }
    case 'last_week': {
      const lastWeekMonday = new Date(today);
      const day = lastWeekMonday.getDay() || 7; // Convert Sunday (0) to 7
      lastWeekMonday.setDate(lastWeekMonday.getDate() - (day - 1) - 7); // Get last Monday
      const lastWeekSunday = new Date(lastWeekMonday);
      lastWeekSunday.setDate(lastWeekSunday.getDate() + 6);
      lastWeekSunday.setHours(23, 59, 59, 999);
      return {
        start: lastWeekMonday,
        end: lastWeekSunday
      };
    }
    case 'this_month': {
      const firstDayOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);
      return {
        start: firstDayOfMonth,
        end: now
      };
    }
    case 'last_month': {
      const firstDayOfLastMonth = new Date(now.getFullYear(), now.getMonth() - 1, 1);
      const lastDayOfLastMonth = new Date(now.getFullYear(), now.getMonth(), 0);
      lastDayOfLastMonth.setHours(23, 59, 59, 999);
      return {
        start: firstDayOfLastMonth,
        end: lastDayOfLastMonth
      };
    }
    case 'last_6_months': {
      const sixMonthsAgo = new Date(now);
      sixMonthsAgo.setMonth(sixMonthsAgo.getMonth() - 6);
      return {
        start: sixMonthsAgo,
        end: now
      };
    }
    case 'this_year': {
      const firstDayOfYear = new Date(now.getFullYear(), 0, 1);
      return {
        start: firstDayOfYear,
        end: now
      };
    }
    case 'last_year': {
      const firstDayOfLastYear = new Date(now.getFullYear() - 1, 0, 1);
      const lastDayOfLastYear = new Date(now.getFullYear() - 1, 11, 31);
      lastDayOfLastYear.setHours(23, 59, 59, 999);
      return {
        start: firstDayOfLastYear,
        end: lastDayOfLastYear
      };
    }
    case 'all_time': {
      // Set a date far in the past for "all time"
      const past = new Date(2020, 0, 1);
      return {
        start: past,
        end: now
      };
    }
    case 'custom': {
      // If custom time range, use provided dates
      if (startDate && endDate) {
        const start = new Date(startDate);
        const end = new Date(endDate);
        end.setHours(23, 59, 59, 999); // Set to end of day
        return { start, end };
      }
      
      // Default to last 7 days if custom but no dates provided
      const sevenDaysAgo = new Date(today);
      sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);
      return {
        start: sevenDaysAgo,
        end: now
      };
    }
    default:
      // Default to last 7 days
      const sevenDaysAgo = new Date(today);
      sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);
      return {
        start: sevenDaysAgo,
        end: now
      };
  }
}

// Extract client information from request
export function extractClientInfo(req: Request): {
  ipAddress: string;
  userAgent: string;
  referer: string;
} {
  // Get IP address with fallbacks for various proxy setups
  const ipAddress = 
    (req.headers['x-forwarded-for'] as string)?.split(',')[0].trim() || 
    req.socket.remoteAddress || 
    '';
  
  // Get user agent and referer
  const userAgent = req.headers['user-agent'] || '';
  const referer = req.headers.referer || '';
  
  return {
    ipAddress,
    userAgent,
    referer
  };
}

// Parse user agent string to get device information
export function parseUserAgent(userAgent: string): {
  deviceType: string;
  browser: string;
  operatingSystem: string;
} {
  let deviceType = 'Unknown';
  let browser = 'Unknown';
  let operatingSystem = 'Unknown';
  
  // Simple device type detection
  if (/mobile|android|iphone|ipad|ipod|windows phone/i.test(userAgent)) {
    deviceType = 'Mobile';
  } else if (/tablet|ipad/i.test(userAgent)) {
    deviceType = 'Tablet';
  } else {
    deviceType = 'Desktop';
  }
  
  // Simple browser detection
  if (/chrome/i.test(userAgent) && !/edge|opr|edg/i.test(userAgent)) {
    browser = 'Chrome';
  } else if (/firefox/i.test(userAgent)) {
    browser = 'Firefox';
  } else if (/safari/i.test(userAgent) && !/chrome|chromium|edg/i.test(userAgent)) {
    browser = 'Safari';
  } else if (/edge|edg/i.test(userAgent)) {
    browser = 'Edge';
  } else if (/opr|opera/i.test(userAgent)) {
    browser = 'Opera';
  } else if (/msie|trident/i.test(userAgent)) {
    browser = 'Internet Explorer';
  }
  
  // Simple OS detection
  if (/windows/i.test(userAgent)) {
    operatingSystem = 'Windows';
  } else if (/macintosh|mac os x/i.test(userAgent)) {
    operatingSystem = 'macOS';
  } else if (/linux/i.test(userAgent)) {
    operatingSystem = 'Linux';
  } else if (/android/i.test(userAgent)) {
    operatingSystem = 'Android';
  } else if (/iphone|ipad|ipod/i.test(userAgent)) {
    operatingSystem = 'iOS';
  }
  
  return {
    deviceType,
    browser,
    operatingSystem
  };
}

// Format period string based on grouping
export function formatPeriod(date: Date, groupBy: string): string {
  if (groupBy === 'hour') {
    return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')} ${String(date.getHours()).padStart(2, '0')}:00`;
  } else if (groupBy === 'day') {
    return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
  } else if (groupBy === 'week') {
    // Get the first day of the week (Monday)
    const firstDayOfWeek = new Date(date);
    const day = date.getDay() || 7; // Convert Sunday (0) to 7
    firstDayOfWeek.setDate(date.getDate() - (day - 1));
    return `Week of ${firstDayOfWeek.getFullYear()}-${String(firstDayOfWeek.getMonth() + 1).padStart(2, '0')}-${String(firstDayOfWeek.getDate()).padStart(2, '0')}`;
  } else if (groupBy === 'month') {
    return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`;
  }
  
  // Default to daily format
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
}

// Implementation for storage.getAnalytics method
export async function getAnalyticsImpl(pool: Pool, filter: AnalyticsFilter): Promise<AnalyticsResponse> {
  try {
    // Get date range based on time range
    const { start, end } = getDateRangeFromTimeRange(filter.timeRange, filter.startDate, filter.endDate);
    
    let resourceName = '';
    let resourceType = filter.type;
    let totalClicks = 0;
    let timeseries: { period: string; clicks: number }[] = [];
    
    // Format date strings for SQL
    const startStr = start.toISOString();
    const endStr = end.toISOString();
    
    // Get resource name
    if (filter.type === 'campaign') {
      const campaignResult = await pool.query(
        'SELECT name FROM campaigns WHERE id = $1',
        [filter.id]
      );
      
      if (campaignResult.rows.length > 0) {
        resourceName = campaignResult.rows[0].name;
      }
      
      // Get total clicks for the campaign in the time range
      const totalClicksResult = await pool.query(
        'SELECT COUNT(*) as count FROM click_analytics WHERE campaign_id = $1 AND timestamp >= $2 AND timestamp <= $3',
        [filter.id, startStr, endStr]
      );
      
      totalClicks = parseInt(totalClicksResult.rows[0].count, 10) || 0;
      
      // Get time series data grouped by the specified interval
      let timeSeriesQuery = '';
      const params = [filter.id, startStr, endStr];
      
      // Build query based on grouping
      if (filter.groupBy === 'hour') {
        timeSeriesQuery = `
          SELECT 
            DATE_TRUNC('hour', timestamp AT TIME ZONE $4) as period,
            COUNT(*) as clicks
          FROM click_analytics 
          WHERE campaign_id = $1 AND timestamp >= $2 AND timestamp <= $3
          GROUP BY period
          ORDER BY period ASC
        `;
        params.push(filter.timezone || 'UTC');
      } else if (filter.groupBy === 'day') {
        timeSeriesQuery = `
          SELECT 
            DATE_TRUNC('day', timestamp AT TIME ZONE $4) as period,
            COUNT(*) as clicks
          FROM click_analytics 
          WHERE campaign_id = $1 AND timestamp >= $2 AND timestamp <= $3
          GROUP BY period
          ORDER BY period ASC
        `;
        params.push(filter.timezone || 'UTC');
      } else if (filter.groupBy === 'week') {
        timeSeriesQuery = `
          SELECT 
            DATE_TRUNC('week', timestamp AT TIME ZONE $4) as period,
            COUNT(*) as clicks
          FROM click_analytics 
          WHERE campaign_id = $1 AND timestamp >= $2 AND timestamp <= $3
          GROUP BY period
          ORDER BY period ASC
        `;
        params.push(filter.timezone || 'UTC');
      } else if (filter.groupBy === 'month') {
        timeSeriesQuery = `
          SELECT 
            DATE_TRUNC('month', timestamp AT TIME ZONE $4) as period,
            COUNT(*) as clicks
          FROM click_analytics 
          WHERE campaign_id = $1 AND timestamp >= $2 AND timestamp <= $3
          GROUP BY period
          ORDER BY period ASC
        `;
        params.push(filter.timezone || 'UTC');
      }
      
      const timeSeriesResult = await pool.query(timeSeriesQuery, params);
      
      // Format the timeseries data
      timeseries = timeSeriesResult.rows.map(row => ({
        period: formatPeriod(new Date(row.period), filter.groupBy),
        clicks: parseInt(row.clicks, 10) || 0
      }));
    } else if (filter.type === 'url') {
      // Similar implementation for URLs
      const urlResult = await pool.query(
        'SELECT name FROM urls WHERE id = $1',
        [filter.id]
      );
      
      if (urlResult.rows.length > 0) {
        resourceName = urlResult.rows[0].name;
      }
      
      // Get total clicks for the URL in the time range
      const totalClicksResult = await pool.query(
        'SELECT COUNT(*) as count FROM click_analytics WHERE url_id = $1 AND timestamp >= $2 AND timestamp <= $3',
        [filter.id, startStr, endStr]
      );
      
      totalClicks = parseInt(totalClicksResult.rows[0].count, 10) || 0;
      
      // Get time series data grouped by the specified interval
      let timeSeriesQuery = '';
      const params = [filter.id, startStr, endStr];
      
      // Build query based on grouping
      if (filter.groupBy === 'hour') {
        timeSeriesQuery = `
          SELECT 
            DATE_TRUNC('hour', timestamp AT TIME ZONE $4) as period,
            COUNT(*) as clicks
          FROM click_analytics 
          WHERE url_id = $1 AND timestamp >= $2 AND timestamp <= $3
          GROUP BY period
          ORDER BY period ASC
        `;
        params.push(filter.timezone || 'UTC');
      } else if (filter.groupBy === 'day') {
        timeSeriesQuery = `
          SELECT 
            DATE_TRUNC('day', timestamp AT TIME ZONE $4) as period,
            COUNT(*) as clicks
          FROM click_analytics 
          WHERE url_id = $1 AND timestamp >= $2 AND timestamp <= $3
          GROUP BY period
          ORDER BY period ASC
        `;
        params.push(filter.timezone || 'UTC');
      } else if (filter.groupBy === 'week') {
        timeSeriesQuery = `
          SELECT 
            DATE_TRUNC('week', timestamp AT TIME ZONE $4) as period,
            COUNT(*) as clicks
          FROM click_analytics 
          WHERE url_id = $1 AND timestamp >= $2 AND timestamp <= $3
          GROUP BY period
          ORDER BY period ASC
        `;
        params.push(filter.timezone || 'UTC');
      } else if (filter.groupBy === 'month') {
        timeSeriesQuery = `
          SELECT 
            DATE_TRUNC('month', timestamp AT TIME ZONE $4) as period,
            COUNT(*) as clicks
          FROM click_analytics 
          WHERE url_id = $1 AND timestamp >= $2 AND timestamp <= $3
          GROUP BY period
          ORDER BY period ASC
        `;
        params.push(filter.timezone || 'UTC');
      }
      
      const timeSeriesResult = await pool.query(timeSeriesQuery, params);
      
      // Format the timeseries data
      timeseries = timeSeriesResult.rows.map(row => ({
        period: formatPeriod(new Date(row.period), filter.groupBy),
        clicks: parseInt(row.clicks, 10) || 0
      }));
    }
    
    // Fill in gaps in time series if no data for certain periods
    const filledTimeseries = fillTimeSeriesGaps(timeseries, start, end, filter.groupBy);
    
    return {
      summary: {
        totalClicks,
        resourceType,
        resourceId: filter.id,
        resourceName,
        dateRangeStart: start.toISOString(),
        dateRangeEnd: end.toISOString(),
        timezone: filter.timezone
      },
      timeseries: filledTimeseries
    };
  } catch (error) {
    console.error('Error getting analytics:', error);
    throw error;
  }
}

// Fill in gaps in time series data
function fillTimeSeriesGaps(
  timeseries: { period: string; clicks: number }[],
  start: Date,
  end: Date,
  groupBy: string
): { period: string; clicks: number }[] {
  const result: { period: string; clicks: number }[] = [];
  const existing = new Map<string, number>();
  
  // Store existing data in a map for quick lookup
  timeseries.forEach(item => {
    existing.set(item.period, item.clicks);
  });
  
  // Create a new date to iterate from start to end
  const current = new Date(start);
  
  // Iterate through each period and fill gaps
  while (current <= end) {
    const period = formatPeriod(current, groupBy);
    const clicks = existing.has(period) ? existing.get(period)! : 0;
    
    result.push({ period, clicks });
    
    // Advance to the next period based on grouping
    if (groupBy === 'hour') {
      current.setHours(current.getHours() + 1);
    } else if (groupBy === 'day') {
      current.setDate(current.getDate() + 1);
    } else if (groupBy === 'week') {
      current.setDate(current.getDate() + 7);
    } else if (groupBy === 'month') {
      current.setMonth(current.getMonth() + 1);
    }
  }
  
  return result;
}
// NOTE: This file contains the analytics implementation to be added to the storage.ts file
// Copy these methods to the DatabaseStorage class in server/storage.ts

  /**
   * Record a click in the analytics system
   */
  async recordClick(urlId: number, campaignId: number, data?: {
    userAgent?: string;
    ipAddress?: string;
    referer?: string;
    country?: string;
    city?: string;
    deviceType?: string;
    browser?: string;
    os?: string;
  }): Promise<void> {
    try {
      const now = new Date();
      
      // Create record data
      const recordData = {
        urlId,
        campaignId,
        clickTime: now,
        clickTimeUtc: now, // Store UTC timestamp for consistent querying
        ...data
      };
      
      // Insert into analytics table
      await db.insert(clickAnalytics).values(recordData);
    } catch (error) {
      console.error('Error recording click for analytics:', error);
      // Fail silently - don't disrupt the redirect process for analytics failures
    }
  }
  
  /**
   * Get analytics data based on provided filters
   */
  async getAnalytics(filter: AnalyticsFilter): Promise<AnalyticsResponse> {
    // Process time range
    const { startDate, endDate } = this.getDateRangeFromFilter(filter);
    
    // Get the resource name (campaign or URL)
    let resourceName = '';
    if (filter.type === 'campaign') {
      const campaign = await this.getCampaign(filter.id);
      resourceName = campaign?.name || `Campaign #${filter.id}`;
    } else {
      const url = await this.getUrl(filter.id);
      resourceName = url?.name || `URL #${filter.id}`;
    }
    
    // Get total clicks
    const totalClicks = await this.getClickCount(filter, startDate, endDate);
    
    // Get timeseries data
    const timeseries = await this.getTimeseriesData(filter, startDate, endDate);
    
    // Build response
    const response: AnalyticsResponse = {
      summary: {
        totalClicks,
        dateRangeStart: startDate.toISOString(),
        dateRangeEnd: endDate.toISOString(),
        timezone: filter.timezone,
        resourceType: filter.type,
        resourceId: filter.id,
        resourceName
      },
      timeseries
    };
    
    return response;
  }
  
  /**
   * Get a list of all campaigns for analytics selection
   */
  async getCampaignsList(): Promise<{ id: number, name: string }[]> {
    const result = await db
      .select({
        id: campaigns.id,
        name: campaigns.name
      })
      .from(campaigns)
      .orderBy(desc(campaigns.createdAt));
    
    return result;
  }
  
  /**
   * Get a list of all URLs for analytics selection
   */
  async getUrlsList(search?: string): Promise<{ id: number, name: string, campaignId: number }[]> {
    // Base query to get URLs
    let query = db
      .select({
        id: urls.id,
        name: urls.name,
        campaignId: urls.campaignId
      })
      .from(urls)
      .where(ne(urls.status, 'deleted'));
    
    // Add search filter if provided
    if (search) {
      query = query.where(or(
        ilike(urls.name, `%${search}%`),
        ilike(urls.targetUrl, `%${search}%`)
      ));
    }
    
    // Execute query
    const result = await query.orderBy(desc(urls.createdAt));
    
    return result;
  }
  
  /**
   * Helper function to extract date range from filter
   */
  private getDateRangeFromFilter(filter: AnalyticsFilter): { startDate: Date, endDate: Date } {
    const now = new Date();
    let startDate = new Date(now);
    let endDate = new Date(now);
    
    // Handle custom date range
    if (filter.timeRange === 'custom' && filter.startDate && filter.endDate) {
      startDate = new Date(filter.startDate);
      endDate = new Date(filter.endDate);
      // Add 1 day to end date to include the entire day
      endDate.setDate(endDate.getDate() + 1);
      return { startDate, endDate };
    }
    
    // Process predefined ranges
    switch (filter.timeRange) {
      case 'today':
        startDate.setHours(0, 0, 0, 0);
        endDate.setHours(23, 59, 59, 999);
        break;
      case 'yesterday':
        startDate.setDate(startDate.getDate() - 1);
        startDate.setHours(0, 0, 0, 0);
        endDate.setDate(endDate.getDate() - 1);
        endDate.setHours(23, 59, 59, 999);
        break;
      case 'last_2_days':
        startDate.setDate(startDate.getDate() - 1);
        startDate.setHours(0, 0, 0, 0);
        endDate.setHours(23, 59, 59, 999);
        break;
      case 'last_3_days':
        startDate.setDate(startDate.getDate() - 2);
        startDate.setHours(0, 0, 0, 0);
        endDate.setHours(23, 59, 59, 999);
        break;
      case 'last_7_days':
        startDate.setDate(startDate.getDate() - 6);
        startDate.setHours(0, 0, 0, 0);
        endDate.setHours(23, 59, 59, 999);
        break;
      case 'this_week':
        // Start from Monday of current week
        const day = startDate.getDay();
        const diff = startDate.getDate() - day + (day === 0 ? -6 : 1);
        startDate.setDate(diff);
        startDate.setHours(0, 0, 0, 0);
        endDate.setHours(23, 59, 59, 999);
        break;
      case 'last_week':
        // Start from Monday of last week
        const lastWeekDay = startDate.getDay();
        const lastWeekDiff = startDate.getDate() - lastWeekDay - 6;
        startDate.setDate(lastWeekDiff);
        startDate.setHours(0, 0, 0, 0);
        endDate.setDate(lastWeekDiff + 6);
        endDate.setHours(23, 59, 59, 999);
        break;
      case 'this_month':
        startDate.setDate(1);
        startDate.setHours(0, 0, 0, 0);
        endDate.setHours(23, 59, 59, 999);
        break;
      case 'last_month':
        startDate.setMonth(startDate.getMonth() - 1);
        startDate.setDate(1);
        startDate.setHours(0, 0, 0, 0);
        endDate.setDate(0); // Last day of previous month
        endDate.setHours(23, 59, 59, 999);
        break;
      case 'last_6_months':
        startDate.setMonth(startDate.getMonth() - 6);
        startDate.setHours(0, 0, 0, 0);
        endDate.setHours(23, 59, 59, 999);
        break;
      case 'this_year':
        startDate.setMonth(0);
        startDate.setDate(1);
        startDate.setHours(0, 0, 0, 0);
        endDate.setHours(23, 59, 59, 999);
        break;
      case 'last_year':
        startDate.setFullYear(startDate.getFullYear() - 1);
        startDate.setMonth(0);
        startDate.setDate(1);
        startDate.setHours(0, 0, 0, 0);
        endDate.setFullYear(endDate.getFullYear() - 1);
        endDate.setMonth(11);
        endDate.setDate(31);
        endDate.setHours(23, 59, 59, 999);
        break;
      case 'all_time':
      default:
        // Set to a far past date
        startDate = new Date(2020, 0, 1);
        break;
    }
    
    return { startDate, endDate };
  }
  
  /**
   * Get total click count for a resource
   */
  private async getClickCount(
    filter: AnalyticsFilter, 
    startDate: Date, 
    endDate: Date
  ): Promise<number> {
    try {
      // Create base query
      let query = db
        .select({ count: count() })
        .from(clickAnalytics)
        .where(
          and(
            gte(clickAnalytics.clickTimeUtc, startDate),
            lte(clickAnalytics.clickTimeUtc, endDate)
          )
        );
      
      // Add resource filter
      if (filter.type === 'campaign') {
        query = query.where(eq(clickAnalytics.campaignId, filter.id));
      } else {
        query = query.where(eq(clickAnalytics.urlId, filter.id));
      }
      
      // Execute query
      const result = await query;
      return Number(result[0].count) || 0;
    } catch (error) {
      console.error('Error getting click count:', error);
      return 0;
    }
  }
  
  /**
   * Get timeseries data for analytics
   */
  private async getTimeseriesData(
    filter: AnalyticsFilter,
    startDate: Date,
    endDate: Date
  ): Promise<AnalyticsTimeseriesData[]> {
    try {
      // Use raw SQL for time-based aggregation 
      // as it's more flexible with different time formats
      let timeFormat: string;
      let groupByClause: string;
      
      switch (filter.groupBy) {
        case 'hour':
          timeFormat = 'YYYY-MM-DD HH24:00';
          groupByClause = `DATE_TRUNC('hour', click_time_utc)`;
          break;
        case 'week':
          timeFormat = 'YYYY-WW';
          groupByClause = `DATE_TRUNC('week', click_time_utc)`;
          break;
        case 'month':
          timeFormat = 'YYYY-MM';
          groupByClause = `DATE_TRUNC('month', click_time_utc)`;
          break;
        case 'day':
        default:
          timeFormat = 'YYYY-MM-DD';
          groupByClause = `DATE_TRUNC('day', click_time_utc)`;
          break;
      }
      
      // Add resource filter
      let resourceFilter: string;
      if (filter.type === 'campaign') {
        resourceFilter = `campaign_id = ${filter.id}`;
      } else {
        resourceFilter = `url_id = ${filter.id}`;
      }
      
      // Build query
      const query = `
        SELECT 
          TO_CHAR(${groupByClause}, '${timeFormat}') AS period,
          COUNT(*) AS clicks
        FROM click_analytics
        WHERE 
          click_time_utc >= $1 AND
          click_time_utc <= $2 AND
          ${resourceFilter}
        GROUP BY period
        ORDER BY period
      `;
      
      // Execute query
      const result = await pool.query(query, [startDate, endDate]);
      
      // Map results to the expected format
      return result.rows.map(row => ({
        period: row.period,
        clicks: parseInt(row.clicks)
      }));
    } catch (error) {
      console.error('Error getting timeseries data:', error);
      return [];
    }
  }
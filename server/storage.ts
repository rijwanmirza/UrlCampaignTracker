
import { 
  Campaign, 
  InsertCampaign,
  UpdateCampaign,
  Url, 
  InsertUrl, 
  UpdateUrl, 
  CampaignWithUrls,
  UrlWithActiveStatus,
  campaigns,
  urls,
  OriginalUrlRecord,
  InsertOriginalUrlRecord,
  UpdateOriginalUrlRecord,
  originalUrlRecords,
  CampaignClickRecord,
  InsertCampaignClickRecord,
  campaignClickRecords,
  UrlClickRecord,
  InsertUrlClickRecord,
  urlClickRecords,
  TimeRangeFilter
} from "@shared/schema";
import { db, pool } from "./db";
import { eq, and, isNull, asc, desc, sql, inArray, ne, ilike, or, gte, lte } from "drizzle-orm";
import { redirectLogsManager } from "./redirect-logs-manager";
import { urlClickLogsManager } from "./url-click-logs-manager";

export interface IStorage {
  // Campaign operations
  getCampaigns(): Promise<CampaignWithUrls[]>;
  getCampaign(id: number): Promise<CampaignWithUrls | undefined>;
  getCampaignByCustomPath(customPath: string): Promise<CampaignWithUrls | undefined>;
  createCampaign(campaign: InsertCampaign): Promise<Campaign>;
  updateCampaign(id: number, campaign: UpdateCampaign): Promise<Campaign | undefined>;
  deleteCampaign(id: number): Promise<boolean>;
  
  // URL operations
  getUrls(campaignId: number): Promise<UrlWithActiveStatus[]>;
  getAllUrls(page: number, limit: number, search?: string, status?: string): Promise<{ urls: UrlWithActiveStatus[], total: number }>;
  getUrl(id: number): Promise<Url | undefined>;
  createUrl(url: InsertUrl): Promise<Url>;
  updateUrl(id: number, url: UpdateUrl): Promise<Url | undefined>;
  deleteUrl(id: number): Promise<boolean>;
  permanentlyDeleteUrl(id: number): Promise<boolean>;
  bulkUpdateUrls(ids: number[], action: string): Promise<boolean>;
  
  // Original URL Records operations
  getOriginalUrlRecords(page: number, limit: number, search?: string): Promise<{ records: OriginalUrlRecord[], total: number }>;
  getOriginalUrlRecord(id: number): Promise<OriginalUrlRecord | undefined>;
  getOriginalUrlRecordByName(name: string): Promise<OriginalUrlRecord | undefined>;
  createOriginalUrlRecord(record: InsertOriginalUrlRecord): Promise<OriginalUrlRecord>;
  updateOriginalUrlRecord(id: number, record: UpdateOriginalUrlRecord): Promise<OriginalUrlRecord | undefined>;
  
  // Click protection bypass
  setClickProtectionBypass(enabled: boolean): Promise<void>;
  deleteOriginalUrlRecord(id: number): Promise<boolean>;
  syncUrlsWithOriginalRecord(recordId: number): Promise<number>; // Returns number of URLs updated
  
  // Redirect operation
  incrementUrlClicks(id: number): Promise<Url | undefined>;

  getRandomWeightedUrl(campaignId: number): Promise<UrlWithActiveStatus | null>;
  getWeightedUrlDistribution(campaignId: number): Promise<{
    activeUrls: UrlWithActiveStatus[],
    weightedDistribution: {
      url: UrlWithActiveStatus,
      weight: number,
      startRange: number,
      endRange: number
    }[]
  }>;
  
  // Campaign Click Records operations
  recordCampaignClick(
    campaignId: number, 
    urlId?: number, 
    ipAddress?: string, 
    userAgent?: string,
    referer?: string
  ): Promise<CampaignClickRecord>;
  
  getCampaignClickRecords(
    page: number, 
    limit: number,
    campaignId?: number,
    filter?: TimeRangeFilter
  ): Promise<{ records: CampaignClickRecord[], total: number }>;
  
  getCampaignClickSummary(
    campaignId: number,
    filter: TimeRangeFilter
  ): Promise<{
    totalClicks: number,
    hourlyBreakdown?: { hour: number, clicks: number }[],
    dailyBreakdown?: Record<string, number>
  }>;
  
  // URL Click Records operations
  recordUrlClick(
    urlId: number,
    ipAddress?: string,
    userAgent?: string,
    referer?: string
  ): Promise<UrlClickRecord>;
  
  getUrlClickRecords(
    page: number,
    limit: number,
    urlId?: number,
    filter?: TimeRangeFilter
  ): Promise<{ records: UrlClickRecord[], total: number }>;
  
  getUrlClickSummary(
    urlId: number,
    filter: TimeRangeFilter
  ): Promise<{
    totalClicks: string | number,
    hourlyBreakdown?: { hour: number, clicks: string | number }[],
    dailyBreakdown?: Record<string, string | number>,
    filterInfo?: { type: string, dateRange: string }
  }>;
  
  // Redirect logs summary (more accurate click tracking)
  getRedirectLogsSummary(
    campaignId: number,
    filter: TimeRangeFilter
  ): Promise<{
    totalClicks: number | string,
    hourlyBreakdown?: { hour: number, clicks: number | string }[],
    dailyBreakdown?: Record<string, number | string>,
    filterInfo?: { type: string, dateRange: string }
  }>;
  
  // System operations
  fullSystemCleanup(): Promise<{ campaignsDeleted: number, urlsDeleted: number, originalUrlRecordsDeleted: number }>;
}

export class DatabaseStorage implements IStorage {
  // Ultra-optimized multi-level caching system for millions of redirects per second
  
  // Primary weighted distribution cache for campaign URLs
  private campaignUrlsCache: Map<number, {
    lastUpdated: number,
    activeUrls: UrlWithActiveStatus[],
    weightedDistribution: {
      url: UrlWithActiveStatus,
      weight: number,
      startRange: number,
      endRange: number
    }[]
  }>;
  
  // Single URL lookup cache for direct access (bypasses DB queries)
  private urlCache: Map<number, {
    lastUpdated: number,
    url: Url
  }>;
  
  // Campaign lookup cache (bypasses DB for campaign info)
  private campaignCache: Map<number, {
    lastUpdated: number,
    campaign: Campaign
  }>;
  
  // Custom path lookup cache for instant path resolution
  private customPathCache: Map<string, {
    lastUpdated: number,
    campaignId: number
  }>;
  
  // In-memory redirect counter to batch DB updates
  private pendingClickUpdates: Map<number, number>;
  
  // Set cache TTL to -1 for forced immediate updates (always bypass cache)
  private cacheTTL = -1; // Always bypass cache for instant updates
  
  // Batch processing threshold before writing to DB
  private clickUpdateThreshold = 10;
  
  // Timer for periodic persistence of clicks
  private clickUpdateTimer: NodeJS.Timeout | null = null;
  
  // Flag to temporarily bypass click protection for legitimate operations
  private clickProtectionBypassed = false;

  constructor() {
    this.campaignUrlsCache = new Map();
    this.urlCache = new Map();
    this.campaignCache = new Map();
    this.customPathCache = new Map();
    this.pendingClickUpdates = new Map();
    
    // Set up periodic persistence every 1 second to ensure data is eventually consistent
    this.clickUpdateTimer = setInterval(() => this.flushPendingClickUpdates(), 1000);
    
    // Ensure we flush any pending updates when the app shuts down
    process.on('SIGTERM', () => {
      this.flushPendingClickUpdates();
    });
    process.on('SIGINT', () => {
      this.flushPendingClickUpdates();
    });
  }

  async getCampaigns(): Promise<CampaignWithUrls[]> {
    // Use a safer approach to handle missing columns
    try {
      // First try to fetch all columns
      const campaignsResult = await db.select().from(campaigns).orderBy(desc(campaigns.createdAt));
      
      const campaignsWithUrls: CampaignWithUrls[] = [];
      
      for (const campaign of campaignsResult) {
        const urls = await this.getUrls(campaign.id);
        campaignsWithUrls.push({
          ...campaign,
          urls
        });
      }
      
      return campaignsWithUrls;
    } catch (error) {
      // If we get a column does not exist error, fall back to selecting only the base columns
      if (error instanceof Error && error.message.includes('column') && error.message.includes('does not exist')) {
        console.log('⚠️ Falling back to base columns for campaigns query as schema migration is pending');
        
        // Explicitly select only the columns we know exist in the original schema
        const campaignsResult = await db.select({
          id: campaigns.id,
          name: campaigns.name,
          redirectMethod: campaigns.redirectMethod,
          customPath: campaigns.customPath,
          multiplier: campaigns.multiplier,
          pricePerThousand: campaigns.pricePerThousand,
          createdAt: campaigns.createdAt,
          updatedAt: campaigns.updatedAt
        }).from(campaigns).orderBy(desc(campaigns.createdAt));
        
        const campaignsWithUrls: CampaignWithUrls[] = [];
        
        for (const campaign of campaignsResult) {
          const urls = await this.getUrls(campaign.id);
          // Add default values for new fields
          campaignsWithUrls.push({
            ...campaign,
            trafficstarCampaignId: null as any, // Type assertion to handle missing field
            autoManageTrafficstar: false as any, // Type assertion to handle missing field
            lastTrafficstarSync: null as any, // Type assertion to handle missing field
            budgetUpdateTime: "00:00:00" as any, // Default to midnight UTC
            urls
          });
        }
        
        return campaignsWithUrls;
      }
      
      // For other errors, rethrow
      throw error;
    }
  }

  async getCampaign(id: number, forceRefresh: boolean = false): Promise<CampaignWithUrls | undefined> {
    // Check campaign cache first for better performance
    const cachedCampaign = this.campaignCache.get(id);
    const now = Date.now();
    
    // If force refresh is requested or cache is stale/missing, bypass cache
    if (!forceRefresh && cachedCampaign && (now - cachedCampaign.lastUpdated < this.cacheTTL)) {
      // Use cached campaign data
      const campaign = cachedCampaign.campaign;
      
      // Still need to get fresh URLs for this campaign
      const urls = await this.getUrls(id);
      
      return {
        ...campaign,
        urls
      };
    }
    
    if (forceRefresh) {
      console.log(`🔄 Force refreshing campaign data for ID: ${id}`);
    }
    
    try {
      // Cache miss - fetch from database
      const [campaign] = await db.select().from(campaigns).where(eq(campaigns.id, id));
      if (!campaign) return undefined;
      
      // Add to cache for future requests
      this.campaignCache.set(id, {
        lastUpdated: now,
        campaign
      });
      
      const urls = await this.getUrls(id);
      return {
        ...campaign,
        urls
      };
    } catch (error) {
      // If we get a column does not exist error, fall back to selecting only the base columns
      if (error instanceof Error && error.message.includes('column') && error.message.includes('does not exist')) {
        console.log('⚠️ Falling back to base columns for campaign query as schema migration is pending');
        
        // Explicitly select only the columns we know exist in the original schema
        const [campaign] = await db.select({
          id: campaigns.id,
          name: campaigns.name,
          redirectMethod: campaigns.redirectMethod,
          customPath: campaigns.customPath,
          multiplier: campaigns.multiplier,
          pricePerThousand: campaigns.pricePerThousand,
          createdAt: campaigns.createdAt,
          updatedAt: campaigns.updatedAt
        }).from(campaigns).where(eq(campaigns.id, id));
        
        if (!campaign) return undefined;
        
        // Add to cache for future requests with default values for new fields
        const campaignWithDefaults = {
          ...campaign,
          trafficstarCampaignId: null as any,
          autoManageTrafficstar: false as any,
          lastTrafficstarSync: null as any,
          budgetUpdateTime: "00:00:00" as any // Default to midnight UTC
        };
        
        this.campaignCache.set(id, {
          lastUpdated: now,
          campaign: campaignWithDefaults
        });
        
        const urls = await this.getUrls(id);
        return {
          ...campaignWithDefaults,
          urls
        };
      }
      
      // For other errors, rethrow
      throw error;
    }
  }

  async getCampaignByCustomPath(customPath: string): Promise<CampaignWithUrls | undefined> {
    // Skip cache entirely for custom paths
    // Always do a fresh database lookup
    
    try {
      // Direct database lookup to ensure fresh data
      const [campaign] = await db.select().from(campaigns).where(eq(campaigns.customPath, customPath));
      if (!campaign) return undefined;
      
      // Get fresh URLs for this campaign
      const urls = await this.getUrls(campaign.id);
      
      // Return fresh data
      return {
        ...campaign,
        urls
      };
    } catch (error) {
      // If we get a column does not exist error, fall back to selecting only the base columns
      if (error instanceof Error && error.message.includes('column') && error.message.includes('does not exist')) {
        console.log('⚠️ Falling back to base columns for custom path query as schema migration is pending');
        
        // Explicitly select only the columns we know exist in the original schema
        const [campaign] = await db.select({
          id: campaigns.id,
          name: campaigns.name,
          redirectMethod: campaigns.redirectMethod,
          customPath: campaigns.customPath,
          multiplier: campaigns.multiplier,
          pricePerThousand: campaigns.pricePerThousand,
          createdAt: campaigns.createdAt,
          updatedAt: campaigns.updatedAt
        }).from(campaigns).where(eq(campaigns.customPath, customPath));
        
        if (!campaign) return undefined;
        
        // Get fresh URLs for this campaign
        const urls = await this.getUrls(campaign.id);
        
        // Return fresh data with default values for new fields
        return {
          ...campaign,
          trafficstarCampaignId: null as any,
          autoManageTrafficstar: false as any, 
          lastTrafficstarSync: null as any,
          budgetUpdateTime: "00:00:00" as any, // Default to midnight UTC
          urls
        };
      }
      
      // For other errors, rethrow
      throw error;
    }
  }

  async createCampaign(insertCampaign: InsertCampaign): Promise<Campaign> {
    const now = new Date();
    
    // Handle price value
    let priceValue = 0;
    if (insertCampaign.pricePerThousand !== undefined) {
      if (typeof insertCampaign.pricePerThousand === 'string') {
        priceValue = parseFloat(insertCampaign.pricePerThousand);
        if (isNaN(priceValue)) priceValue = 0;
      } else {
        priceValue = insertCampaign.pricePerThousand;
      }
    }
    
    // Prepare data for insert, converting multiplier to string if needed
    const campaignData = {
      name: insertCampaign.name,
      redirectMethod: insertCampaign.redirectMethod || "direct",
      customPath: insertCampaign.customPath,
      // Convert multiplier to string for numeric DB field
      multiplier: insertCampaign.multiplier !== undefined ? 
        String(insertCampaign.multiplier) : "1",
      // Format price with 4 decimal places
      pricePerThousand: priceValue.toFixed(4),
      createdAt: now,
      updatedAt: now
    };
    
    const [campaign] = await db
      .insert(campaigns)
      .values(campaignData)
      .returning();
    
    return campaign;
  }

  async updateCampaign(id: number, updateCampaign: UpdateCampaign): Promise<Campaign | undefined> {
    const [existing] = await db.select().from(campaigns).where(eq(campaigns.id, id));
    if (!existing) return undefined;
    
    // Prepare data for update, converting multiplier to string if needed
    const updateData: any = {
      updatedAt: new Date()
    };
    
    // Copy fields from updateCampaign that are defined
    if (updateCampaign.name !== undefined) {
      updateData.name = updateCampaign.name;
    }
    
    if (updateCampaign.redirectMethod !== undefined) {
      updateData.redirectMethod = updateCampaign.redirectMethod;
    }
    
    if (updateCampaign.customPath !== undefined) {
      updateData.customPath = updateCampaign.customPath;
    }
    
    // Handle multiplier specially to convert to string for numeric DB field
    if (updateCampaign.multiplier !== undefined) {
      updateData.multiplier = String(updateCampaign.multiplier);
    }
    
    // Handle pricePerThousand field - CRITICAL FIX
    if (updateCampaign.pricePerThousand !== undefined) {
      console.log('🔍 DEBUG: Received pricePerThousand:', updateCampaign.pricePerThousand, 'type:', typeof updateCampaign.pricePerThousand);
      
      let priceValue = updateCampaign.pricePerThousand;
      
      // Make sure we always have a valid number
      if (typeof priceValue === 'string') {
        priceValue = parseFloat(priceValue);
        if (isNaN(priceValue)) priceValue = 0;
      }
      
      // Always ensure we're using at least 4 decimal places for the string version
      updateData.pricePerThousand = priceValue === 0 
        ? '0.0000' 
        : priceValue.toFixed(4);
      
      console.log('🔍 DEBUG: Setting pricePerThousand to:', updateData.pricePerThousand);
    }
    
    // Handle TrafficStar campaign ID - CRITICAL FIX
    if (updateCampaign.trafficstarCampaignId !== undefined) {
      // If the value is "none" or empty string, set to null
      if (updateCampaign.trafficstarCampaignId === "none" || updateCampaign.trafficstarCampaignId === "") {
        updateData.trafficstarCampaignId = null;
        console.log('🔍 DEBUG: Setting trafficstarCampaignId to null (no integration)');
      } else {
        // Otherwise, use the provided value
        updateData.trafficstarCampaignId = updateCampaign.trafficstarCampaignId;
        console.log('🔍 DEBUG: Setting trafficstarCampaignId to:', updateData.trafficstarCampaignId);
      }
    }
    
    // Handle TrafficStar auto-management - CRITICAL FIX
    if (updateCampaign.autoManageTrafficstar !== undefined) {
      updateData.autoManageTrafficstar = updateCampaign.autoManageTrafficstar;
      console.log('🔍 DEBUG: Setting autoManageTrafficstar to:', updateData.autoManageTrafficstar);
    }
    
    // Handle budgetUpdateTime field
    if (updateCampaign.budgetUpdateTime !== undefined) {
      updateData.budgetUpdateTime = updateCampaign.budgetUpdateTime;
      console.log('🔍 DEBUG: Setting budgetUpdateTime to:', updateData.budgetUpdateTime);
    }
    
    // If auto-management is enabled, record the time of change
    if (updateData.autoManageTrafficstar === true) {
      updateData.lastTrafficstarSync = new Date();
    }
    
    const [updated] = await db
      .update(campaigns)
      .set(updateData)
      .where(eq(campaigns.id, id))
      .returning();
    
    return updated;
  }
  
  async deleteCampaign(id: number): Promise<boolean> {
    // First check if the campaign exists
    const [campaign] = await db.select().from(campaigns).where(eq(campaigns.id, id));
    if (!campaign) return false;
    
    // Start a transaction to ensure all operations complete together
    try {
      // Mark all URLs in this campaign as deleted (soft delete)
      await db
        .update(urls)
        .set({
          status: 'deleted',
          updatedAt: new Date()
        })
        .where(eq(urls.campaignId, id));
      
      // Delete the campaign
      await db.delete(campaigns).where(eq(campaigns.id, id));
      
      return true;
    } catch (error) {
      console.error('Error deleting campaign:', error);
      return false;
    }
  }

  async getUrls(campaignId: number, forceRefresh: boolean = false): Promise<UrlWithActiveStatus[]> {
    // Get all URLs for a campaign that are not deleted or rejected
    // This ensures rejected URLs with duplicate names don't appear in campaigns
    
    // Check campaignUrls cache first if not force refreshing
    const cachedUrls = this.campaignUrlsCache.get(campaignId);
    const now = Date.now();
    
    // Use cache if available, not forcing refresh, and not stale
    if (!forceRefresh && cachedUrls && (now - cachedUrls.lastUpdated < this.cacheTTL)) {
      console.log(`📋 Using cached URLs for campaign ID: ${campaignId}`);
      
      // If there's a weightedDistribution, we have the active URLs ready to go
      if (cachedUrls.activeUrls && cachedUrls.activeUrls.length > 0) {
        return cachedUrls.activeUrls;
      }
    }
    
    // Force refresh or cache miss, log for debugging
    if (forceRefresh) {
      console.log(`🔄 Force refreshing URLs for campaign ID: ${campaignId}`);
    } else if (!cachedUrls) {
      console.log(`🔍 Cache miss - fetching fresh URLs for campaign ID: ${campaignId}`);
    } else {
      console.log(`⏰ Cache stale - refreshing URLs for campaign ID: ${campaignId}`);
    }
    
    const urlsResult = await db
      .select()
      .from(urls)
      .where(
        and(
          eq(urls.campaignId, campaignId),
          ne(urls.status, 'deleted'),
          ne(urls.status, 'rejected')
        )
      )
      .orderBy(desc(urls.createdAt));
    
    // Add isActive status based on click limit and status
    return urlsResult.map(url => {
      // Check if URL should be marked as completed
      const needsStatusUpdate = url.clicks >= url.clickLimit && url.status !== 'completed';
      
      // If we find a URL that has reached its click limit but hasn't been marked as completed,
      // update its status in the database asynchronously
      if (needsStatusUpdate) {
        this.updateUrlStatus(url.id, 'completed');
      }
      
      // Return URL with isActive flag (URLs are active only if they haven't reached their click limit
      // and are explicitly marked as active)
      return {
        ...url,
        // If the URL has reached its click limit, it's considered completed regardless of DB status
        status: url.clicks >= url.clickLimit ? 'completed' : url.status,
        isActive: url.clicks < url.clickLimit && url.status === 'active'
      };
    });
  }

  async getAllUrls(
    page: number = 1, 
    limit: number = 100, 
    search?: string, 
    status?: string
  ): Promise<{ urls: UrlWithActiveStatus[], total: number }> {
    const offset = (page - 1) * limit;
    
    // Base query conditions
    let conditions = [];
    
    // Add search condition if provided
    if (search) {
      conditions.push(
        or(
          ilike(urls.name, `%${search}%`),
          ilike(urls.targetUrl, `%${search}%`)
        )
      );
    }
    
    // Add status filter if provided
    if (status && status !== 'all') {
      conditions.push(eq(urls.status, status));
    }
    
    // Count total records
    const countResult = await db
      .select({ count: sql<number>`count(*)` })
      .from(urls)
      .where(conditions.length > 0 ? and(...conditions) : undefined);
    
    const total = Number(countResult[0]?.count || 0);
    
    // Get paginated results
    const urlsResult = await db
      .select()
      .from(urls)
      .where(conditions.length > 0 ? and(...conditions) : undefined)
      .limit(limit)
      .offset(offset)
      .orderBy(desc(urls.createdAt));
    
    // Add isActive status and check if URLs have reached their click limit
    const urlsWithStatus = urlsResult.map(url => {
      // Check if URL should be marked as completed
      const needsStatusUpdate = url.clicks >= url.clickLimit && url.status !== 'completed';
      
      // If we find a URL that has reached its click limit but hasn't been marked as completed,
      // update its status in the database asynchronously
      if (needsStatusUpdate) {
        this.updateUrlStatus(url.id, 'completed');
      }
      
      return {
        ...url,
        // If the URL has reached its click limit, it's considered completed regardless of DB status
        status: url.clicks >= url.clickLimit ? 'completed' : url.status,
        isActive: url.clicks < url.clickLimit && url.status === 'active'
      };
    });
    
    return { 
      urls: urlsWithStatus, 
      total
    };
  }

  async getUrl(id: number): Promise<Url | undefined> {
    // Ultra-fast URL lookup using cache
    const cachedUrl = this.urlCache.get(id);
    const now = Date.now();
    
    // Use cache if available and fresh
    if (cachedUrl && (now - cachedUrl.lastUpdated < this.cacheTTL)) {
      // Add any pending clicks to the cached URL before returning
      const pendingClicks = this.pendingClickUpdates.get(id) || 0;
      if (pendingClicks > 0) {
        // Return a copy with the pending clicks included
        return {
          ...cachedUrl.url,
          clicks: cachedUrl.url.clicks + pendingClicks
        };
      }
      
      // Return the cached URL directly
      return cachedUrl.url;
    }
    
    // Cache miss - fetch from database
    const [url] = await db.select().from(urls).where(eq(urls.id, id));
    
    // Add to cache if found
    if (url) {
      this.urlCache.set(id, {
        lastUpdated: now,
        url
      });
    }
    
    return url;
  }

  async createUrl(insertUrl: InsertUrl & { originalClickLimit?: number }): Promise<Url> {
    const now = new Date();
    
    // If originalClickLimit wasn't provided explicitly, use the clickLimit value
    // However, routes.ts should be sending this correctly!
    const originalClickLimit = insertUrl.originalClickLimit || insertUrl.clickLimit;
    
    // Make sure originalClickLimit is an exact copy of what was provided and not affected by multiplier calculations
    const safeOriginalClickLimit = originalClickLimit;
    
    console.log('🔍 DEBUG: Storage - Creating URL');
    console.log('  - Name:', insertUrl.name);
    console.log('  - Target URL:', insertUrl.targetUrl);
    console.log('  - Campaign ID:', insertUrl.campaignId);
    console.log('  - Click limit (after multiplier):', insertUrl.clickLimit);
    console.log('  - Original click limit (user input):', originalClickLimit);
    
    // Check if we already have an original URL record for this name
    const existingRecord = await this.getOriginalUrlRecordByName(insertUrl.name);
    
    // If no original record exists, create one to track the original click value
    if (!existingRecord) {
      try {
        await this.createOriginalUrlRecord({
          name: insertUrl.name,
          targetUrl: insertUrl.targetUrl,
          originalClickLimit: safeOriginalClickLimit
        });
        console.log('🔍 DEBUG: Created original URL record for', insertUrl.name);
      } catch (error) {
        // If there was an error creating the record, log it but continue
        // This shouldn't block creating the URL itself
        console.error('Error creating original URL record:', error);
      }
    }
    
    // IMPORTANT: Check if a URL with this name already exists
    // This should apply globally to prevent all duplicate names, not just within the campaign
    const existingUrls = await db
      .select()
      .from(urls)
      .where(eq(urls.name, insertUrl.name));
    
    // If we found any URL with the same name
    if (existingUrls.length > 0) {
      console.log(`⚠️ Duplicate URL name detected: "${insertUrl.name}"`);
      
      // For the first duplicate, just mark as rejected with the original name
      if (existingUrls.length === 1 && existingUrls[0].status !== 'rejected') {
        console.log(`  - First duplicate: marking as rejected`);
        
        // Create a new URL entry with "rejected" status
        const [rejectedUrl] = await db
          .insert(urls)
          .values({
            ...insertUrl,
            originalClickLimit,
            clicks: 0,
            status: 'rejected', // Mark as rejected
            createdAt: now,
            updatedAt: now
          })
          .returning();
          
        return rejectedUrl;
      } 
      // For subsequent duplicates, add a number suffix (#2, #3, etc.)
      else {
        // Find the highest number suffix
        let maxNumber = 1;
        const nameBase = insertUrl.name;
        
        // Get all URLs with this base name to find the highest suffix
        const allDuplicateUrls = await db
          .select()
          .from(urls)
          .where(
            or(
              eq(urls.name, nameBase),
              ilike(urls.name, `${nameBase} #%`)
            )
          );
        
        console.log(`  - Found ${allDuplicateUrls.length} potential duplicates`);
        
        // Regex to match "name #N" 
        const regex = new RegExp(`^${nameBase.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')} #(\\d+)$`);
        
        for (const existingUrl of allDuplicateUrls) {
          // Skip the base URL itself
          if (existingUrl.name === nameBase) continue;
          
          const match = existingUrl.name.match(regex);
          console.log(`  - Checking: "${existingUrl.name}" against regex`);
          
          if (match && match[1]) {
            const num = parseInt(match[1], 10);
            console.log(`    - Found number: ${num}`);
            if (num > maxNumber) {
              maxNumber = num;
              console.log(`    - New max number: ${maxNumber}`);
            }
          }
        }
        
        // Generate a new name with the next number suffix
        const newNumber = maxNumber + 1;
        const newName = `${nameBase} #${newNumber}`;
        console.log(`  - Creating with numbered suffix: "${newName}"`);
        
        // Create a new URL with the numbered name and rejected status
        const [numberedUrl] = await db
          .insert(urls)
          .values({
            ...insertUrl,
            name: newName, // Use the name with the number suffix
            originalClickLimit,
            clicks: 0,
            status: 'rejected', // Mark as rejected
            createdAt: now,
            updatedAt: now
          })
          .returning();
          
        return numberedUrl;
      }
    }
    
    // Ensure these values don't match if we have a valid multiplier applied
    if (insertUrl.campaignId) {
      const [campaign] = await db.select().from(campaigns).where(eq(campaigns.id, insertUrl.campaignId));
      if (campaign) {
        // Convert multiplier to number if it's a string
        const multiplierValue = typeof campaign.multiplier === 'string'
          ? parseFloat(campaign.multiplier)
          : (campaign.multiplier || 1);
          
        if (multiplierValue > 0.01) {
          const expectedClickLimit = Math.ceil(originalClickLimit * multiplierValue);
          
          if (expectedClickLimit !== insertUrl.clickLimit) {
            console.warn('⚠️ WARNING: Calculated click limit does not match expected value!');
            console.warn(`  - Expected: ${originalClickLimit} × ${multiplierValue} = ${expectedClickLimit}`);
            console.warn(`  - Received: ${insertUrl.clickLimit}`);
          }
        }
      }
    }
    
    // No duplicates found, proceed with normal URL creation
    const [url] = await db
      .insert(urls)
      .values({
        ...insertUrl,
        originalClickLimit: safeOriginalClickLimit, // Explicitly use the safe original value
        clicks: 0,
        status: 'active',
        createdAt: now,
        updatedAt: now
      })
      .returning();
    
    // Invalidate the campaign cache when adding a new URL
    if (url.campaignId) {
      this.invalidateCampaignCache(url.campaignId);
    }
    
    return url;
  }

  async updateUrl(id: number, updateUrl: UpdateUrl): Promise<Url | undefined> {
    const [existingUrl] = await db.select().from(urls).where(eq(urls.id, id));
    if (!existingUrl) return undefined;
    
    // Check if the URL has completed all clicks
    if (existingUrl.clicks >= existingUrl.clickLimit && updateUrl.status !== 'completed') {
      updateUrl.status = 'completed';
    }
    
    // CRITICAL FIX: If status is changing, sync with original URL record
    if (updateUrl.status && updateUrl.status !== existingUrl.status) {
      console.log(`🔄 Status change detected for URL #${id}: ${existingUrl.status || 'none'} -> ${updateUrl.status}`);
      
      // Sync status with original URL record
      if (existingUrl.name) {
        try {
          const syncResult = await this.syncStatusFromUrlToOriginalRecord(existingUrl.name, updateUrl.status);
          console.log(`🔄 Status sync to original record result: ${syncResult ? 'success' : 'no matching record found'}`);
        } catch (syncError) {
          console.error(`❌ Error syncing status to original record:`, syncError);
          // Continue with URL update even if sync fails
        }
      }
    }
    
    // If click limit is being updated, check for original URL record
    if (updateUrl.clickLimit !== undefined || updateUrl.originalClickLimit !== undefined) {
      console.log('🔍 DEBUG: URL edit - updating click limit');
      
      // If we're changing the click limit, we need to determine if we should update the original record
      const existingRecord = await this.getOriginalUrlRecordByName(existingUrl.name);
      
      // NEW BEHAVIOR: When originalClickLimit is NOT provided explicitly but clickLimit is, 
      // we DON'T update the originalClickLimit in the Original URL Records database.
      // This prevents automatic changes to the master value.
      
      // Only if originalClickLimit is explicitly provided, we update the original record
      if (updateUrl.originalClickLimit !== undefined) {
        // If we have an original click limit and the original record doesn't exist, create it
        if (!existingRecord) {
          try {
            await this.createOriginalUrlRecord({
              name: existingUrl.name,
              targetUrl: updateUrl.targetUrl || existingUrl.targetUrl,
              originalClickLimit: updateUrl.originalClickLimit,
              status: updateUrl.status || existingUrl.status // Include status when creating record
            });
            console.log('🔍 DEBUG: Created original URL record for', existingUrl.name);
          } catch (error) {
            console.error('Error creating original URL record during update:', error);
          }
        }
        // If record exists and we're changing original click limit, update the master record
        else {
          try {
            await this.updateOriginalUrlRecord(existingRecord.id, {
              originalClickLimit: updateUrl.originalClickLimit,
              status: updateUrl.status || existingUrl.status // Include status when updating record
            });
            console.log('🔍 DEBUG: Updated original URL record for', existingUrl.name);
          } catch (error) {
            console.error('Error updating original URL record:', error);
          }
        }
        
        // Log details about the update
        const campaignMultiplier = existingUrl.campaignId ? 
          await this.getCampaignMultiplier(existingUrl.campaignId) : 1;
        
        const calculatedLimit = Math.round(updateUrl.originalClickLimit * campaignMultiplier);
        
        console.log('🔍 DEBUG: URL updated with new limits:');
        console.log(`  - Original user input: ${updateUrl.originalClickLimit}`);
        console.log(`  - After multiplier (${campaignMultiplier}x): ${calculatedLimit}`);
        console.log(`  - Calculation: ${updateUrl.originalClickLimit} × ${campaignMultiplier} = ${calculatedLimit}`);
        
        // If clickLimit isn't provided but originalClickLimit is, calculate the clickLimit
        if (updateUrl.clickLimit === undefined) {
          updateUrl.clickLimit = calculatedLimit;
        }
      }
    }
    
    const [updatedUrl] = await db
      .update(urls)
      .set({
        ...updateUrl,
        updatedAt: new Date()
      })
      .where(eq(urls.id, id))
      .returning();
    
    // Invalidate the campaign cache when updating a URL
    if (existingUrl.campaignId) {
      this.invalidateCampaignCache(existingUrl.campaignId);
    }
    
    return updatedUrl;
  }
  
  // Helper method to get campaign multiplier
  private async getCampaignMultiplier(campaignId: number): Promise<number> {
    const [campaign] = await db.select().from(campaigns).where(eq(campaigns.id, campaignId));
    if (!campaign) return 1;
    
    // Convert multiplier to number if it's a string
    const multiplierValue = typeof campaign.multiplier === 'string'
      ? parseFloat(campaign.multiplier)
      : (campaign.multiplier || 1);
      
    return multiplierValue > 0.01 ? multiplierValue : 1;
  }

  async deleteUrl(id: number): Promise<boolean> {
    const [url] = await db.select().from(urls).where(eq(urls.id, id));
    if (!url) return false;
    
    console.log(`🗑️ Soft deleting URL ID #${id} "${url.name}"`);
    
    // CRITICAL FIX: When deleting a URL, sync status with Original URL Record
    if (url.name) {
      // Start bidirectional sync process in the background
      this.syncStatusFromUrlToOriginalRecord(url.name, 'deleted').catch(err => {
        console.error(`❌ Error syncing deleted status to original record for "${url.name}":`, err);
      });
    }
    
    // Soft delete - just update status to 'deleted'
    await db
      .update(urls)
      .set({ 
        status: 'deleted',
        updatedAt: new Date() 
      })
      .where(eq(urls.id, id));
    
    // Invalidate the campaign cache
    if (url.campaignId) {
      this.invalidateCampaignCache(url.campaignId);
    }
    
    console.log(`✅ URL ID #${id} "${url.name}" successfully soft-deleted (status=deleted)`);
    
    return true;
  }

  async permanentlyDeleteUrl(id: number): Promise<boolean> {
    try {
      // First get the URL to find its campaign ID (for cache invalidation)
      const [url] = await db.select().from(urls).where(eq(urls.id, id));
      if (!url) return false;
      
      console.log(`Permanently deleting URL ID ${id} (${url.name}) while preserving analytics data`);
      
      // Store the URL details for future analytics reference
      // (we could save this to a deleted_urls table if needed)
      const urlDetails = {
        id: url.id,
        name: url.name,
        campaignId: url.campaignId,
        deletedAt: new Date()
      };
      
      // Remove the URL but preserve click analytics data
      // This ensures analytics will still work even after the URL is deleted
      await db.delete(urls).where(eq(urls.id, id));
      
      // Invalidate campaign cache if this URL was associated with a campaign
      if (url.campaignId) {
        this.invalidateCampaignCache(url.campaignId);
      }
      
      console.log(`URL ${id} permanently deleted while preserving analytics data`);
      
      return true;
    } catch (error) {
      console.error("Failed to permanently delete URL:", error);
      return false;
    }
  }
  
  /**
   * NEW CAMPAIGN CLICK TRACKING SYSTEM
   * Each successful redirect counts as exactly 1 click in campaign record
   * For example: 50 redirects = 50 clicks in campaign analytics
   * 
   * - Stores redirect time to show hourly breakdowns (00:00-01:00, 01:00-02:00, etc.)
   * - Preserves click data even when URLs are deleted
   * - Analytics page shows clicks by date with time details
   * - Detailed campaign analytics shows hourly breakdown for selected time frame
   * - Supports timezone conversion and date range filtering
   * 
   * @param campaignId The campaign ID that generated this redirect
   * @param urlId URL ID used for the redirect (null for direct campaign access)
   */


  async bulkUpdateUrls(ids: number[], action: string): Promise<boolean> {
    // Validate that URLs exist
    const urlsToUpdate = await db.select().from(urls).where(inArray(urls.id, ids));
    if (urlsToUpdate.length === 0) return false;
    
    let newStatus: string | undefined;
    let shouldDelete = false;
    
    switch (action) {
      case 'pause':
        newStatus = 'paused';
        break;
      case 'activate':
        newStatus = 'active';
        break;
      case 'delete':
        newStatus = 'deleted';
        break;
      case 'permanent_delete':
        shouldDelete = true;
        break;
    }
    
    // CRITICAL FIX: Sync status changes with original URL records
    // Collect the URL names to use for syncing with original records
    const urlNames = urlsToUpdate.map(url => url.name);
    console.log(`🔄 Bulk updating ${urlsToUpdate.length} URLs with action: ${action}`);
    
    // For each URL name, find and update the corresponding original URL record
    if (newStatus && urlNames.length > 0) {
      console.log(`🔄 Starting bidirectional sync for ${urlNames.length} original URL records with status: ${newStatus}`);
      
      // Find all original URL records matching the URL names
      const originalRecords = await db.select().from(originalUrlRecords).where(inArray(originalUrlRecords.name, urlNames));
      console.log(`✅ Found ${originalRecords.length} matching original URL records to update`);
      
      // Update all matching original URL records with the new status
      if (originalRecords.length > 0) {
        await db
          .update(originalUrlRecords)
          .set({ 
            status: newStatus,
            updatedAt: new Date() 
          })
          .where(inArray(originalUrlRecords.name, urlNames));
        
        console.log(`✅ Successfully synced ${originalRecords.length} original URL records with status: ${newStatus}`);
      }
    }
    
    if (shouldDelete) {
      // Permanently delete URLs but preserve analytics data
      console.log(`Permanently deleting ${ids.length} URLs while preserving analytics data`);
      
      // We could save URL information to a deleted_urls table here if needed
      // This would allow fully reconstructing analytics with URL names
      
      // Delete URLs but keep the analytics data
      await db.delete(urls).where(inArray(urls.id, ids));
      
      console.log(`${ids.length} URLs permanently deleted while preserving analytics data`);
    } else if (newStatus) {
      // Update status
      await db
        .update(urls)
        .set({ 
          status: newStatus,
          updatedAt: new Date() 
        })
        .where(inArray(urls.id, ids));
    }
    
    // Invalidate cache for all affected campaigns
    const campaignIds = new Set<number>();
    for (const url of urlsToUpdate) {
      if (url.campaignId) {
        campaignIds.add(url.campaignId);
      }
    }
    
    campaignIds.forEach(id => this.invalidateCampaignCache(id));
    
    return true;
  }

  /**
   * Ultra-high performance click incrementing to handle millions of redirects per second
   * Uses memory-first approach with batched database updates
   */
  async incrementUrlClicks(id: number): Promise<Url | undefined> {
    // Check URL cache first for ultra-fast performance
    const cachedUrl = this.urlCache.get(id);
    const now = Date.now();
    
    if (cachedUrl && (now - cachedUrl.lastUpdated < this.cacheTTL)) {
      // Ultra-fast path: Use cached data and update in memory only
      const pendingClicks = this.pendingClickUpdates.get(id) || 0;
      
      // Create copy with updated clicks for immediate use
      const urlWithUpdatedClicks = {
        ...cachedUrl.url,
        clicks: cachedUrl.url.clicks + pendingClicks + 1
      };
      
      // Check if URL has reached its click limit
      const isCompleted = urlWithUpdatedClicks.clicks >= urlWithUpdatedClicks.clickLimit;
      if (isCompleted && urlWithUpdatedClicks.status !== 'completed') {
        // Update status to completed
        urlWithUpdatedClicks.status = 'completed';
        
        // CRITICAL FIX: Sync status change to original record
        if (urlWithUpdatedClicks.name) {
          // Use non-blocking promise to avoid slowing down redirect
          this.syncStatusFromUrlToOriginalRecord(urlWithUpdatedClicks.name, 'completed')
            .then(result => {
              console.log(`🔄 Auto-sync to original record "${urlWithUpdatedClicks.name}" completed with result: ${result ? 'success' : 'no matching record'}`);
            })
            .catch(err => {
              console.error(`❌ Error auto-syncing status to original record:`, err);
            });
        }
      }
      
      // Update pending clicks counter (batched DB updates)
      this.pendingClickUpdates.set(id, pendingClicks + 1);
      
      // Update cache with latest data
      this.urlCache.set(id, {
        lastUpdated: now,
        url: urlWithUpdatedClicks
      });
      
      // Invalidate campaign cache for proper weighting
      if (urlWithUpdatedClicks.campaignId) {
        this.invalidateCampaignCache(urlWithUpdatedClicks.campaignId);
      }
      
      // Threshold-based batch processing to database
      const newPendingCount = pendingClicks + 1;
      if (newPendingCount >= this.clickUpdateThreshold) {
        // Async database update (non-blocking)
        this.batchUpdateUrlClicks(id, newPendingCount, isCompleted).catch(err => {
          console.error(`Error in batch click update for URL ${id}:`, err);
        });
      }
      
      return urlWithUpdatedClicks;
    }
    
    // Cache miss - need to fetch from database (slower path)
    try {
      const [url] = await db.select().from(urls).where(eq(urls.id, id));
      if (!url) return undefined;
      
      // Initialize click tracking for this URL
      const pendingClicks = this.pendingClickUpdates.get(id) || 0;
      const newPendingCount = pendingClicks + 1;
      this.pendingClickUpdates.set(id, newPendingCount);
      
      // Create updated URL with new click count
      const newClicks = url.clicks + 1;
      const isCompleted = newClicks >= url.clickLimit;
      const newStatus = isCompleted ? 'completed' : url.status;
      
      // CRITICAL FIX: Sync status change to original record when URL is completed
      if (isCompleted && url.status !== 'completed' && url.name) {
        // Use non-blocking promise to avoid slowing down redirect
        this.syncStatusFromUrlToOriginalRecord(url.name, 'completed')
          .then(result => {
            console.log(`🔄 Auto-sync to original record "${url.name}" completed with result: ${result ? 'success' : 'no matching record'}`);
          })
          .catch(err => {
            console.error(`❌ Error auto-syncing status to original record:`, err);
          });
      }
      
      const updatedUrl = {
        ...url,
        clicks: newClicks,
        status: newStatus
      };
      
      // Cache the updated URL
      this.urlCache.set(id, {
        lastUpdated: now,
        url: updatedUrl
      });
      
      // Invalidate campaign cache
      if (url.campaignId) {
        this.invalidateCampaignCache(url.campaignId);
      }
      
      // Perform immediate database update for first encounter
      // but still batch subsequent updates
      const [dbUpdatedUrl] = await db
        .update(urls)
        .set({ 
          clicks: newClicks,
          status: isCompleted ? 'completed' : url.status,
          updatedAt: new Date() 
        })
        .where(eq(urls.id, id))
        .returning();
      
      // Reset pending count since we just updated
      this.pendingClickUpdates.set(id, 0);
      
      return dbUpdatedUrl;
    } catch (error) {
      console.error(`Error incrementing clicks for URL ${id}:`, error);
      return undefined;
    }
  }
  
  /**
   * Asynchronous batch update of URL clicks to database
   * This reduces database load for high-volume traffic
   */
  private async batchUpdateUrlClicks(id: number, pendingCount: number, isCompleted: boolean): Promise<void> {
    try {
      if (isCompleted) {
        // First get the URL to determine if it belongs to a campaign
        const [url] = await db.select().from(urls).where(eq(urls.id, id));
        if (url?.campaignId) {
          // Store the campaign ID before removing it
          const campaignId = url.campaignId;
          
          // If URL is completed and belongs to a campaign, update and remove from campaign
          await db
            .update(urls)
            .set({ 
              clicks: sql`${urls.clicks} + ${pendingCount}`,
              status: 'completed',
              campaignId: null, // Remove from campaign
              updatedAt: new Date() 
            })
            .where(eq(urls.id, id));
          
          // Invalidate campaign cache since we've removed a URL
          this.invalidateCampaignCache(campaignId);
          console.log(`URL ${id} reached click limit and was removed from campaign ${campaignId}`);
        } else {
          // URL is completed but doesn't belong to a campaign, just update status
          await db
            .update(urls)
            .set({ 
              clicks: sql`${urls.clicks} + ${pendingCount}`,
              status: 'completed',
              updatedAt: new Date() 
            })
            .where(eq(urls.id, id));
        }
      } else {
        // Standard update for non-completed URLs
        await db
          .update(urls)
          .set({ 
            clicks: sql`${urls.clicks} + ${pendingCount}`,
            status: sql`${urls.status}`,
            updatedAt: new Date() 
          })
          .where(eq(urls.id, id));
      }
      
      // Reset pending count
      this.pendingClickUpdates.set(id, 0);
    } catch (error) {
      console.error(`Error in batch update for URL ${id}:`, error);
    }
  }
  
  /**
   * Flushes all pending click updates to the database
   * Called periodically via timer and on app shutdown
   * This ensures we don't lose track of clicks during high-load periods
   */
  private async flushPendingClickUpdates(): Promise<void> {
    // Skip if no pending updates
    if (this.pendingClickUpdates.size === 0) return;
    
    try {
      // For each URL with pending clicks, perform a batch update
      const updatePromises = Array.from(this.pendingClickUpdates.entries())
        .filter(([_, clicks]) => clicks > 0)
        .map(async ([id, pendingCount]) => {
          const cachedUrl = this.urlCache.get(id);
          
          // If we have the URL in cache, we can check if it's completed
          const isCompleted = cachedUrl && 
            (cachedUrl.url.clicks >= cachedUrl.url.clickLimit);
          
          try {
            if (isCompleted) {
              // First get the URL to check if we need to sync with original record
              const [urlInfo] = await db.select().from(urls).where(eq(urls.id, id));
              const needsStatusSync = urlInfo && urlInfo.status !== 'completed';
              
              // If URL is completed, use our updateUrlStatus method which handles
              // removing from campaign and status sync
              await this.updateUrlStatus(id, 'completed');
              
              // Also update the click count (updateUrlStatus only updates status and campaignId)
              await db
                .update(urls)
                .set({
                  clicks: sql`${urls.clicks} + ${pendingCount}`,
                  updatedAt: new Date()
                })
                .where(eq(urls.id, id));
                
              // CRITICAL FIX: Sync status to original record
              if (needsStatusSync && urlInfo?.name) {
                try {
                  const syncResult = await this.syncStatusFromUrlToOriginalRecord(urlInfo.name, 'completed');
                  console.log(`🔄 Batch sync to original record "${urlInfo.name}" completed with result: ${syncResult ? 'success' : 'no matching record'}`);
                } catch (syncError) {
                  console.error(`❌ Error batch syncing status to original record:`, syncError);
                }
              }
            } else {
              // Standard update for non-completed URLs
              await db
                .update(urls)
                .set({
                  clicks: sql`${urls.clicks} + ${pendingCount}`,
                  status: sql`${urls.status}`,
                  updatedAt: new Date()
                })
                .where(eq(urls.id, id));
            }
            
            // Reset the pending count
            this.pendingClickUpdates.set(id, 0);
            
            // Get the latest version from DB to keep cache in sync
            const [updatedUrl] = await db
              .select()
              .from(urls)
              .where(eq(urls.id, id));
              
            if (updatedUrl) {
              // Update cache with fresh data
              this.urlCache.set(id, {
                lastUpdated: Date.now(),
                url: updatedUrl
              });
              
              // Invalidate campaign cache
              if (updatedUrl.campaignId) {
                this.invalidateCampaignCache(updatedUrl.campaignId);
              }
            }
          } catch (error) {
            console.error(`Error updating URL ${id} with ${pendingCount} pending clicks:`, error);
          }
        });
      
      // Execute all updates in parallel for performance
      await Promise.all(updatePromises);
      
      console.log(`Flushed ${updatePromises.length} pending click updates to database`);
    } catch (error) {
      console.error('Error flushing pending click updates:', error);
    }
  }
  
  // Helper method to get weighted URL distribution for a campaign
  async getWeightedUrlDistribution(campaignId: number) {
    // Skip the cache entirely to always get fresh data from database
    // This ensures newly created URLs are immediately available for selection
    
    // If not in cache or expired, recalculate
    const campaign = await this.getCampaign(campaignId);
    if (!campaign) return { activeUrls: [], weightedDistribution: [] };
    
    // Get only active URLs (those that haven't reached their click limit)
    const activeUrls = campaign.urls.filter(url => url.isActive);
    
    // Calculate remaining clicks for each URL as weight
    const totalWeight = activeUrls.reduce((sum, url) => {
      const remainingClicks = url.clickLimit - url.clicks;
      return sum + remainingClicks;
    }, 0);
    
    // Build weighted distribution ranges
    const weightedDistribution: {
      url: UrlWithActiveStatus;
      weight: number;
      startRange: number;
      endRange: number;
    }[] = [];
    
    let currentRange = 0;
    for (const url of activeUrls) {
      const remainingClicks = url.clickLimit - url.clicks;
      const weight = remainingClicks / totalWeight;
      
      const startRange = currentRange;
      const endRange = currentRange + weight;
      
      weightedDistribution.push({
        url,
        weight,
        startRange,
        endRange
      });
      
      currentRange = endRange;
    }
    
    // Update cache
    const now = Date.now();
    const cacheEntry = {
      lastUpdated: now,
      activeUrls,
      weightedDistribution
    };
    
    this.campaignUrlsCache.set(campaignId, cacheEntry);
    
    return { activeUrls, weightedDistribution };
  }
  
  // Fast method to get a URL based on weighted distribution
  async getRandomWeightedUrl(campaignId: number): Promise<UrlWithActiveStatus | null> {
    const { activeUrls, weightedDistribution } = await this.getWeightedUrlDistribution(campaignId);
    
    if (activeUrls.length === 0) return null;
    
    if (activeUrls.length === 1) return activeUrls[0];
    
    // Generate random number between 0 and 1
    const randomValue = Math.random();
    
    // Find the URL whose range contains the random value
    for (const entry of weightedDistribution) {
      if (randomValue >= entry.startRange && randomValue < entry.endRange) {
        return entry.url;
      }
    }
    
    // Fallback to first URL (should rarely happen)
    return activeUrls[0];
  }
  
  // Invalidate campaign cache when URLs are modified
  private invalidateCampaignCache(campaignId: number) {
    console.log(`🧹 Invalidating campaign cache for ID: ${campaignId}`);
    
    // Remove from campaign URLs cache
    this.campaignUrlsCache.delete(campaignId);
    
    // Remove from direct campaign cache
    this.campaignCache.delete(campaignId);
    
    // Also check custom path cache and clear if found
    const customPathEntry = Array.from(this.customPathCache.entries())
      .find(([_, value]) => {
        if (value && typeof value === 'object' && 'campaign' in value && typeof value.campaign === 'object') {
          // Safely access the campaign id property using type assertion
          const campaign = value.campaign as any;
          return campaign && typeof campaign.id === 'number' && campaign.id === campaignId;
        }
        return false;
      });
    
    if (customPathEntry) {
      console.log(`🧹 Also removing campaign from custom path cache: ${customPathEntry[0]}`);
      this.customPathCache.delete(customPathEntry[0]);
    }
  }

  private invalidateUrlCache(urlId: number) {
    console.log(`🧹 Invalidating URL cache for ID: ${urlId}`);
    
    // Clear direct URL cache entry
    this.urlCache.delete(urlId);
    
    // Find the URL's campaign ID from the database if possible
    db.select({
      id: urls.id,
      campaignId: urls.campaignId
    })
    .from(urls)
    .where(eq(urls.id, urlId))
    .then(results => {
      if (results.length > 0 && results[0].campaignId) {
        // Also invalidate the campaign cache
        console.log(`🧹 URL #${urlId} belongs to campaign #${results[0].campaignId} - invalidating campaign cache`);
        this.invalidateCampaignCache(results[0].campaignId);
      }
    })
    .catch(err => {
      console.error(`Error finding campaign for URL #${urlId}:`, err);
    });
  }
  
  // Helper to update URL status (used for async marking URLs as completed)
  /**
   * Syncs status from a URL to its original URL record
   * This function ensures bidirectional status synchronization
   * @param urlName The name of the URL to sync from
   * @param status The status to apply to the original URL record
   */
  async syncStatusFromUrlToOriginalRecord(urlName: string, status: string): Promise<boolean> {
    try {
      if (!urlName) {
        console.error("❌ Cannot sync status - URL name is empty or undefined");
        return false;
      }
      
      console.log(`🔄 BIDIRECTIONAL SYNC: Updating Original URL Record for "${urlName}" with status "${status}"`);
      
      // Find the original URL record with the matching name
      const [originalRecord] = await db.select().from(originalUrlRecords).where(eq(originalUrlRecords.name, urlName));
      
      if (!originalRecord) {
        console.log(`⚠️ Could not find Original URL Record for "${urlName}" - skipping status sync`);
        return false;
      }
      
      console.log(`🔍 Found Original URL Record #${originalRecord.id} for "${urlName}", current status: "${originalRecord.status || 'none'}"`);
      
      // Don't update if status is already the same to avoid unnecessary DB operations
      if (originalRecord.status === status) {
        console.log(`ℹ️ Original URL Record #${originalRecord.id} already has status "${status}" - no update needed`);
        return true;
      }
      
      // Update the original URL record with the new status
      const result = await db
        .update(originalUrlRecords)
        .set({
          status,
          updatedAt: new Date()
        })
        .where(eq(originalUrlRecords.id, originalRecord.id))
        .returning();
        
      const success = result && result.length > 0;
      
      if (success) {
        console.log(`✅ Successfully updated Original URL Record #${originalRecord.id} status from "${originalRecord.status || 'none'}" to "${status}"`);
      } else {
        console.log(`⚠️ Failed to update Original URL Record #${originalRecord.id} status to "${status}"`);
      }
      
      return success;
    } catch (error) {
      console.error(`❌ Error syncing status from URL "${urlName}" to Original URL Record:`, error);
      return false;
    }
  }
  
  async updateUrlStatus(id: number, status: string): Promise<Url | undefined> {
    // First, get the URL to find its campaign ID and name
    const [url] = await db.select().from(urls).where(eq(urls.id, id));
    if (!url) {
      console.log(`⚠️ URL with ID ${id} not found, cannot update status`);
      return undefined;
    }
    
    console.log(`🔄 Updating URL #${id} "${url.name}" status to "${status}"`);
    
    // CRITICAL FIX: When a URL status is changed, sync it with the Original URL Record
    if (url.name) {
      // First sync status to original record
      try {
        const syncResult = await this.syncStatusFromUrlToOriginalRecord(url.name, status);
        console.log(`📊 Original URL Record sync result: ${syncResult ? "✅ Success" : "⚠️ No matching record found"}`);
      } catch (syncError) {
        console.error(`❌ Error in bidirectional sync:`, syncError);
        // Continue with URL update even if sync fails
      }
    }
    
    let updatedUrl;
    
    // When a URL is completed, we need to remove it from the campaign
    if (status === 'completed') {
      if (url?.campaignId) {
        // Store the campaign ID before removing it
        const campaignId = url.campaignId;
        
        // Update the URL: set status to completed and remove from campaign (set campaignId to null)
        const [result] = await db
          .update(urls)
          .set({
            status,
            campaignId: null, // Remove from campaign
            updatedAt: new Date()
          })
          .where(eq(urls.id, id))
          .returning();
          
        updatedUrl = result;
        
        // Invalidate the campaign cache since we've removed a URL
        this.invalidateCampaignCache(campaignId);
        
        console.log(`URL ${id} marked as completed and removed from campaign ${campaignId}`);
      } else {
        // If there's no campaign ID, just update the status
        const [result] = await db
          .update(urls)
          .set({
            status,
            updatedAt: new Date()
          })
          .where(eq(urls.id, id))
          .returning();
          
        updatedUrl = result;
      }
    } else {
      // For non-completed status updates, use the original behavior
      const [result] = await db
        .update(urls)
        .set({
          status,
          updatedAt: new Date()
        })
        .where(eq(urls.id, id))
        .returning();
        
      updatedUrl = result;
      
      // Get the URL to find its campaign ID
      if (url?.campaignId) {
        this.invalidateCampaignCache(url.campaignId);
      }
    }
    
    return updatedUrl;
  }
  
  // Full system cleanup - deletes all campaigns and URLs
  async fullSystemCleanup(): Promise<{ campaignsDeleted: number, urlsDeleted: number, originalUrlRecordsDeleted: number }> {
    try {
      // First, count how many items we'll delete
      const allCampaigns = await this.getCampaigns();
      let totalUrls = 0;
      
      for (const campaign of allCampaigns) {
        totalUrls += campaign.urls.length;
      }
      
      // Count original URL records too
      const originalRecordsResult = await db.select({ count: sql`count(*)` }).from(originalUrlRecords);
      const originalRecordsCount = Number(originalRecordsResult[0]?.count || 0);
      
      console.log(`🧹 SYSTEM RESET: Starting complete database cleanup - Found ${allCampaigns.length} campaigns, ${totalUrls} URLs, and ${originalRecordsCount} original URL records to delete`);
      
      // Delete in proper order to respect foreign key constraints
      
      // 1. Delete all URLs first (to handle foreign key constraints)
      await db.delete(urls);
      console.log(`✅ SYSTEM RESET: Deleted all URLs (${totalUrls} records)`);
      
      // 2. Delete all original URL records
      await db.delete(originalUrlRecords);
      console.log(`✅ SYSTEM RESET: Deleted all original URL records (${originalRecordsCount} records)`);
      
      // 3. Delete all campaigns
      await db.delete(campaigns);
      console.log(`✅ SYSTEM RESET: Deleted all campaigns (${allCampaigns.length} records)`);
      
      // 4. Also delete protection settings if they exist
      try {
        await db.execute(sql`DELETE FROM protection_settings`);
        console.log(`✅ SYSTEM RESET: Deleted all protection settings`);
      } catch (error) {
        console.log(`ℹ️ SYSTEM RESET: No protection_settings table found or nothing to delete`);
      }
      
      // 5. Delete pending budget updates if they exist
      try {
        await db.execute(sql`DELETE FROM pending_url_budget_updates`);
        console.log(`✅ SYSTEM RESET: Deleted all pending URL budget updates`);
      } catch (error) {
        console.log(`ℹ️ SYSTEM RESET: No pending_url_budget_updates table found or nothing to delete`);
      }
      
      // 6. Delete sessions table data if it exists
      try {
        await db.execute(sql`DELETE FROM sessions`);
        console.log(`✅ SYSTEM RESET: Deleted all session data`);
      } catch (error) {
        console.log(`ℹ️ SYSTEM RESET: No sessions table found or nothing to delete`);
      }
      
      // 7. CRITICAL FIX: Reset all ID sequences to start from 1 again
      console.log(`🔄 SYSTEM RESET: Resetting all database sequences to start from 1...`);
      try {
        // Reset URLs sequence
        await db.execute(sql`ALTER SEQUENCE urls_id_seq RESTART WITH 1`);
        console.log(`✅ SYSTEM RESET: Reset URLs sequence to start from ID 1`);
        
        // Reset campaigns sequence  
        await db.execute(sql`ALTER SEQUENCE campaigns_id_seq RESTART WITH 1`);
        console.log(`✅ SYSTEM RESET: Reset campaigns sequence to start from ID 1`);
        
        // Reset original URL records sequence
        await db.execute(sql`ALTER SEQUENCE original_url_records_id_seq RESTART WITH 1`);
        console.log(`✅ SYSTEM RESET: Reset original URL records sequence to start from ID 1`);
        
        // Reset TrafficStar campaigns sequence if it exists
        try {
          await db.execute(sql`ALTER SEQUENCE trafficstar_campaigns_id_seq RESTART WITH 1`);
          console.log(`✅ SYSTEM RESET: Reset TrafficStar campaigns sequence to start from ID 1`);
        } catch (error) {
          // Ignore error if table doesn't exist
          console.log(`ℹ️ SYSTEM RESET: No TrafficStar campaigns sequence found to reset`);
        }
      } catch (error) {
        console.error(`❌ SYSTEM RESET: Error resetting sequences:`, error);
        // Continue anyway, as the main data is still deleted
      }
      
      // Clear all caches for complete reset
      this.campaignUrlsCache.clear();
      this.urlCache.clear();
      this.campaignCache.clear();
      this.customPathCache.clear();
      this.pendingClickUpdates.clear();
      console.log(`✅ SYSTEM RESET: Cleared all application caches`);
      
      // Cancel any pending update timer
      if (this.clickUpdateTimer) {
        clearInterval(this.clickUpdateTimer);
        // Restart the timer
        this.clickUpdateTimer = setInterval(() => this.flushPendingClickUpdates(), 1000);
        console.log(`✅ SYSTEM RESET: Reset click update timer`);
      }
      
      console.log(`✅ SYSTEM RESET COMPLETED: Successfully deleted ${allCampaigns.length} campaigns, ${totalUrls} URLs, and ${originalRecordsCount} original URL records`);
      
      return {
        campaignsDeleted: allCampaigns.length,
        urlsDeleted: totalUrls,
        originalUrlRecordsDeleted: originalRecordsCount
      };
    } catch (error) {
      console.error("Error during full system cleanup:", error);
      throw error;
    }
  }

  // Original URL Records methods
  async getOriginalUrlRecords(page: number, limit: number, search?: string, status?: string, campaignId?: number): Promise<{ records: OriginalUrlRecord[], total: number }> {
    const offset = (page - 1) * limit;
    
    let query = db.select().from(originalUrlRecords);
    let countQuery = db.select({ count: sql`count(*)` }).from(originalUrlRecords);
    
    // Apply search filter if provided
    if (search) {
      const likeSearch = `%${search}%`;
      query = query.where(or(
        ilike(originalUrlRecords.name, likeSearch),
        ilike(originalUrlRecords.targetUrl, likeSearch)
      ));
      countQuery = countQuery.where(or(
        ilike(originalUrlRecords.name, likeSearch),
        ilike(originalUrlRecords.targetUrl, likeSearch)
      ));
    }
    
    // Apply status filter if provided
    if (status && status !== 'all') {
      query = query.where(eq(originalUrlRecords.status, status));
      countQuery = countQuery.where(eq(originalUrlRecords.status, status));
    }
    
    // Apply campaign filter if provided
    if (campaignId) {
      console.log(`Filtering original URL records by campaign ID: ${campaignId}`);
      
      try {
        // Find all URL names that belong to this campaign
        const campaignUrls = await db.select({ name: urls.name })
          .from(urls)
          .where(eq(urls.campaignId, campaignId));
        
        console.log(`Found ${campaignUrls.length} URLs for campaign ID ${campaignId}`);
        
        // If there are URLs, filter original records by these names
        if (campaignUrls.length > 0) {
          const urlNames = campaignUrls.map(url => url.name);
          console.log('URL names to filter by:', urlNames);
          
          query = query.where(inArray(originalUrlRecords.name, urlNames));
          countQuery = countQuery.where(inArray(originalUrlRecords.name, urlNames));
        } else {
          // If no URLs found for this campaign, return empty result
          console.log(`No URLs found for campaign ID ${campaignId}, returning empty result`);
          return { records: [], total: 0 };
        }
      } catch (error) {
        console.error('Error filtering by campaign ID:', error);
        // Continue without campaign filtering if there's an error
      }
    }
    
    // Apply pagination
    query = query.limit(limit).offset(offset).orderBy(desc(originalUrlRecords.createdAt));
    
    const [{ count }] = await countQuery;
    const records = await query;
    
    return {
      records,
      total: Number(count)
    };
  }

  async getOriginalUrlRecord(id: number): Promise<OriginalUrlRecord | undefined> {
    const [record] = await db.select().from(originalUrlRecords).where(eq(originalUrlRecords.id, id));
    return record;
  }

  async getOriginalUrlRecordByName(name: string): Promise<OriginalUrlRecord | undefined> {
    const [record] = await db.select().from(originalUrlRecords).where(eq(originalUrlRecords.name, name));
    return record;
  }

  async createOriginalUrlRecord(insertRecord: InsertOriginalUrlRecord): Promise<OriginalUrlRecord> {
    const now = new Date();
    
    const recordData = {
      ...insertRecord,
      createdAt: now,
      updatedAt: now
    };
    
    const [record] = await db
      .insert(originalUrlRecords)
      .values(recordData)
      .returning();
    
    return record;
  }

  async updateOriginalUrlRecord(id: number, updateRecord: UpdateOriginalUrlRecord): Promise<OriginalUrlRecord | undefined> {
    const [existing] = await db.select().from(originalUrlRecords).where(eq(originalUrlRecords.id, id));
    if (!existing) return undefined;
    
    const updateData: any = {
      updatedAt: new Date()
    };
    
    // Copy fields from updateRecord that are defined
    if (updateRecord.name !== undefined) {
      updateData.name = updateRecord.name;
    }
    
    if (updateRecord.targetUrl !== undefined) {
      updateData.targetUrl = updateRecord.targetUrl;
    }
    
    // IMPORTANT: If original click limit is included in the update, ALWAYS set status to "paused"
    // regardless of whether the value is changing or staying the same
    if (updateRecord.originalClickLimit !== undefined) {
      updateData.originalClickLimit = updateRecord.originalClickLimit;
      // Force status to paused when original click limit is updated, even to the same value
      updateData.status = "paused";
      
      // If value is same, still note that we're pausing because the field was touched
      if (updateRecord.originalClickLimit === existing.originalClickLimit) {
        console.log(`🛑 ORIGINAL CLICK LIMIT UPDATED TO SAME VALUE (${updateRecord.originalClickLimit}): Still setting status to PAUSED automatically`);
      } else {
        console.log(`🛑 ORIGINAL CLICK LIMIT CHANGED FROM ${existing.originalClickLimit} TO ${updateRecord.originalClickLimit}: Setting status to PAUSED automatically`);
      }
      
      console.log(`🔄 Adding originalClickLimit = ${updateRecord.originalClickLimit} to update operation`);
      console.log(`🔄 Setting status = "paused" due to original click value update`);
    } else {
      // If status is explicitly set in the update, use it
      if (updateRecord.status !== undefined) {
        updateData.status = updateRecord.status;
      }
    }
    
    // First update the original record
    const [updated] = await db
      .update(originalUrlRecords)
      .set(updateData)
      .where(eq(originalUrlRecords.id, id))
      .returning();
    
    // If the original click limit was included in the update, propagate that change
    if (updateRecord.originalClickLimit !== undefined) {
      // Log appropriate message depending on if value changed or stayed the same
      if (updateRecord.originalClickLimit === existing.originalClickLimit) {
        console.log(`🔄 Original click limit for record #${id} updated to same value (${updateRecord.originalClickLimit}), but still pausing as requested`);
      } else {
        console.log(`🔄 Updating original click limit for record #${id} from ${existing.originalClickLimit} to ${updateRecord.originalClickLimit}`);
      }
      
      console.log(`🔴 URL PAUSED: Original click value updated`);
      
      // We're updating the original click limit, so sync with all related URLs
      const updatedCount = await this.syncUrlsWithOriginalRecord(id);
      console.log(`✅ Successfully propagated original click limit update and paused status to ${updatedCount} URLs`);
    }
    
    return updated;
  }

  async deleteOriginalUrlRecord(id: number): Promise<boolean> {
    const [record] = await db.select().from(originalUrlRecords).where(eq(originalUrlRecords.id, id));
    if (!record) return false;
    
    await db.delete(originalUrlRecords).where(eq(originalUrlRecords.id, id));
    return true;
  }

  async syncUrlsWithOriginalRecord(recordId: number): Promise<number> {
    try {
      const [record] = await db.select().from(originalUrlRecords).where(eq(originalUrlRecords.id, recordId));
      if (!record) return 0;
      
      console.log(`✅ Syncing original record "${record.name}" with click limit ${record.originalClickLimit} and status "${record.status}"`);
      console.log(`🔄 Propagating changes to all linked URL instances...`);
      
      // CRITICAL FIX: Use direct SQL to update all URLs with matching name
      // This bypasses all possible ORM issues or trigger problems
      
      // Step 1: Disable triggers
      await db.execute(sql`
        ALTER TABLE urls DISABLE TRIGGER protect_original_click_values_trigger
      `);
      
      await db.execute(sql`
        ALTER TABLE urls DISABLE TRIGGER prevent_auto_click_update_trigger
      `);
      
      // Step 2: Update all URLs with the matching name
      // FIXED: Also update the status from the original record
      await db.execute(sql`
        UPDATE urls
        SET 
          original_click_limit = ${record.originalClickLimit},
          click_limit = ROUND(${record.originalClickLimit} * COALESCE((SELECT multiplier FROM campaigns WHERE id = campaign_id), 1)),
          status = ${record.status || 'active'},
          updated_at = NOW()
        WHERE name = ${record.name}
      `);
      
      // Step 3: Re-enable triggers
      await db.execute(sql`
        ALTER TABLE urls ENABLE TRIGGER protect_original_click_values_trigger
      `);
      
      await db.execute(sql`
        ALTER TABLE urls ENABLE TRIGGER prevent_auto_click_update_trigger
      `);
      
      // Find all URLs with matching name - this will include URLs in all campaigns
      const matchingUrls = await db.select().from(urls).where(eq(urls.name, record.name));
      if (matchingUrls.length === 0) return 0;
      
      console.log(`🔄 Found ${matchingUrls.length} URLs with name "${record.name}" to update`);
      
      // IMPROVEMENT: Pre-emptively invalidate all campaign caches - clear everything for guaranteed fresh data
      console.log(`🧹 PRE-EMPTIVELY INVALIDATING ALL CACHES FOR IMMEDIATE UPDATE VISIBILITY`);
      
      // Track all campaign IDs for these URLs to ensure we refresh all affected campaigns
      const affectedCampaignIds = new Set<number>();
      matchingUrls.forEach(url => {
        if (url.campaignId) {
          affectedCampaignIds.add(url.campaignId);
        }
      });
      
      // Clear caches for all campaigns that contain this URL
      affectedCampaignIds.forEach(campaignId => {
        console.log(`🧹 URL #${record.name} belongs to campaign #${campaignId} - invalidating campaign cache`);
        this.invalidateCampaignCache(campaignId);
      });
      
      // FORCE-REFRESH all campaigns with this URL to ensure everything is updated
      for (const campaignId of affectedCampaignIds) {
        // Force a deep cache invalidation of the campaign
        this.invalidateCampaignCache(campaignId);
        
        // Force refresh the campaign data and URLs
        await this.getCampaign(campaignId, true);
        await this.getUrls(campaignId, true);
        
        console.log(`✅ Force refreshed campaign ${campaignId} with updated URL data`);
      }
      
      return matchingUrls.length;
    } catch (error) {
      console.error('Error syncing URLs with original record:', error);
      throw error;
    }
  }

  /**
   * Temporarily enables or disables the database click protection bypass.
   * This is used for legitimate operations that need to modify click limits,
   * such as campaign multiplier changes and Original URL Record syncs.
   * @param enabled Whether to enable (true) or disable (false) the bypass
   */
  async setClickProtectionBypass(enabled: boolean): Promise<void> {
    try {
      // Check if the protection_settings table exists, and create it if needed
      try {
        await db.execute(sql`
          CREATE TABLE IF NOT EXISTS protection_settings (
            key TEXT PRIMARY KEY,
            value BOOLEAN NOT NULL
          )
        `);
      } catch (createError) {
        console.error('Error checking/creating protection_settings table:', createError);
      }
      
      if (enabled) {
        console.log('⚠️ Setting click protection bypass to ENABLED');
        // Use a direct database table approach instead of session variables
        await db.execute(sql`
          INSERT INTO protection_settings (key, value)
          VALUES ('click_protection_enabled', FALSE)
          ON CONFLICT (key) DO UPDATE SET value = FALSE
        `);
        this.clickProtectionBypassed = true;
      } else {
        console.log('✅ Setting click protection bypass to DISABLED (protection enabled)');
        await db.execute(sql`
          INSERT INTO protection_settings (key, value)
          VALUES ('click_protection_enabled', TRUE)
          ON CONFLICT (key) DO UPDATE SET value = TRUE
        `);
        this.clickProtectionBypassed = false;
      }
    } catch (error) {
      console.error(`Error setting click protection bypass to ${enabled}:`, error);
      
      // Don't throw - just log the error
      console.error('Protection settings operation failed, continuing anyway');
    }
  }

  // Campaign Click Records Implementation
  
  async recordCampaignClick(
    campaignId: number, 
    urlId?: number
  ): Promise<CampaignClickRecord> {
    try {
      const [record] = await db.insert(campaignClickRecords).values({
        campaignId,
        urlId: urlId || null,
        timestamp: new Date()
      }).returning();
      
      return record;
    } catch (error) {
      console.error("Error recording campaign click:", error);
      throw error;
    }
  }
  
  async getCampaignClickRecords(
    page: number, 
    limit: number,
    campaignId?: number,
    filter?: TimeRangeFilter
  ): Promise<{ records: CampaignClickRecord[], total: number }> {
    try {
      // Start with a base query
      let query = db.select().from(campaignClickRecords);
      let countQuery = db.select({ count: sql`count(*)` }).from(campaignClickRecords);
      
      // Add campaign filtering if specified
      if (campaignId) {
        query = query.where(eq(campaignClickRecords.campaignId, campaignId));
        countQuery = countQuery.where(eq(campaignClickRecords.campaignId, campaignId));
      }
      
      // Add date filtering if provided
      if (filter) {
        const { filterType, startDate, endDate, timezone } = filter;
        
        // Calculate date ranges based on filter type
        const now = new Date();
        let startDateObj: Date;
        let endDateObj: Date = now;
        
        switch (filterType) {
          case 'today':
            startDateObj = new Date(now.getFullYear(), now.getMonth(), now.getDate());
            break;
          case 'yesterday':
            startDateObj = new Date(now.getFullYear(), now.getMonth(), now.getDate() - 1);
            // Set endDateObj to end of yesterday (23:59:59.999) instead of start of today
            endDateObj = new Date(now.getFullYear(), now.getMonth(), now.getDate() - 1, 23, 59, 59, 999);
            break;
          case 'last_2_days':
            startDateObj = new Date(now.getFullYear(), now.getMonth(), now.getDate() - 2);
            break;
          case 'last_3_days':
            startDateObj = new Date(now.getFullYear(), now.getMonth(), now.getDate() - 3);
            break;
          case 'last_4_days':
            startDateObj = new Date(now.getFullYear(), now.getMonth(), now.getDate() - 4);
            break;
          case 'last_5_days':
            startDateObj = new Date(now.getFullYear(), now.getMonth(), now.getDate() - 5);
            break;
          case 'last_6_days':
            startDateObj = new Date(now.getFullYear(), now.getMonth(), now.getDate() - 6);
            break;
          case 'last_7_days':
            startDateObj = new Date(now.getFullYear(), now.getMonth(), now.getDate() - 7);
            break;
          case 'this_month':
            startDateObj = new Date(now.getFullYear(), now.getMonth(), 1);
            break;
          case 'last_month':
            startDateObj = new Date(now.getFullYear(), now.getMonth() - 1, 1);
            // Set endDateObj to end of last day of last month (23:59:59.999)
            endDateObj = new Date(now.getFullYear(), now.getMonth(), 0, 23, 59, 59, 999);
            break;
          case 'last_6_months':
            startDateObj = new Date(now.getFullYear(), now.getMonth() - 6, 1);
            break;
          case 'this_year':
            startDateObj = new Date(now.getFullYear(), 0, 1);
            break;
          case 'last_year':
            startDateObj = new Date(now.getFullYear() - 1, 0, 1);
            // Set endDateObj to end of last day of last year (23:59:59.999)
            endDateObj = new Date(now.getFullYear() - 1, 11, 31, 23, 59, 59, 999);
            break;
          case 'custom_range':
            // For custom range, use the provided dates
            if (!startDate || !endDate) {
              throw new Error("Start date and end date are required for custom range filter");
            }
            startDateObj = new Date(startDate);
            // Include the entire day in end date
            endDateObj = new Date(endDate);
            endDateObj.setHours(23, 59, 59, 999);
            break;
          case 'total':
          default:
            // If 'total', don't apply any date filter
            startDateObj = new Date(0); // Jan 1, 1970
            break;
        }
        
        // Apply date range filter
        if (filterType !== 'total') {
          query = query.where(
            and(
              sql`${campaignClickRecords.timestamp} >= ${startDateObj}`,
              sql`${campaignClickRecords.timestamp} <= ${endDateObj}`
            )
          );
          
          countQuery = countQuery.where(
            and(
              sql`${campaignClickRecords.timestamp} >= ${startDateObj}`,
              sql`${campaignClickRecords.timestamp} <= ${endDateObj}`
            )
          );
        }
      }
      
      // Get total count
      const [countResult] = await countQuery;
      const total = Number(countResult?.count || 0);
      
      // Apply pagination
      query = query
        .orderBy(desc(campaignClickRecords.timestamp))
        .offset((page - 1) * limit)
        .limit(limit);
      
      // Execute the query
      const records = await query;
      
      return { records, total };
    } catch (error) {
      console.error("Error getting campaign click records:", error);
      throw error;
    }
  }
  
  // Use redirect logs for more accurate campaign click tracking
  async getRedirectLogsSummary(
    campaignId: number,
    filter: TimeRangeFilter
  ): Promise<{
    totalClicks: number | string,
    hourlyBreakdown?: { hour: number, clicks: number | string }[],
    dailyBreakdown?: Record<string, number | string>,
    filterInfo?: { type: string, dateRange: string }
  }> {
    try {
      // We now have redirectLogsManager imported at the top of the file
      
      // Check for new campaigns that won't have history
      const campaign = await this.getCampaign(campaignId);
      if (!campaign) {
        throw new Error(`Campaign with ID ${campaignId} not found`);
      }
      
      // Use the campaign creation date to check if logs exist
      const createdAt = campaign.createdAt || new Date();
      const now = new Date();
      
      // For date ranges that can't have data (future or before campaign created)
      if (filter.filterType === 'yesterday' || 
          filter.filterType === 'last_month' || 
          filter.filterType === 'last_year') {
        const { startDate, endDate } = this.getDateRangeForFilter(filter);
        if (endDate < createdAt) {
          // Return zero data if the campaign didn't exist in this time period
          return {
            totalClicks: 0,
            dailyBreakdown: {},
            filterInfo: {
              type: filter.filterType,
              dateRange: `No data available before campaign creation (${createdAt.toLocaleDateString()})`
            }
          };
        }
      }
      
      // Get actual summary data from redirect logs
      return await redirectLogsManager.getCampaignSummary(campaignId, filter);
    } catch (error) {
      console.error('Error getting redirect logs summary:', error);
      // Return a proper zero-data response rather than null
      return {
        totalClicks: 0,
        dailyBreakdown: {},
        filterInfo: {
          type: filter.filterType,
          dateRange: "No data available for this time period"
        }
      };
    }
  }
  
  // Helper function to get date range based on filter type
  private getDateRangeForFilter(filter: TimeRangeFilter): { startDate: Date, endDate: Date } {
    const now = new Date();
    let startDate: Date;
    let endDate: Date = now;
    
    const { filterType } = filter;
    
    switch (filterType) {
      case 'today':
        startDate = new Date(now.getFullYear(), now.getMonth(), now.getDate());
        break;
      case 'yesterday':
        startDate = new Date(now.getFullYear(), now.getMonth(), now.getDate() - 1);
        endDate = new Date(now.getFullYear(), now.getMonth(), now.getDate() - 1, 23, 59, 59, 999);
        break;
      case 'last_7_days':
        startDate = new Date(now.getFullYear(), now.getMonth(), now.getDate() - 7);
        break;
      case 'last_30_days':
        startDate = new Date(now.getFullYear(), now.getMonth(), now.getDate() - 30);
        break;
      case 'this_month':
        startDate = new Date(now.getFullYear(), now.getMonth(), 1);
        break;
      case 'last_month':
        startDate = new Date(now.getFullYear(), now.getMonth() - 1, 1);
        endDate = new Date(now.getFullYear(), now.getMonth(), 0, 23, 59, 59, 999);
        break;
      case 'this_year':
        startDate = new Date(now.getFullYear(), 0, 1);
        break;
      case 'last_year':
        startDate = new Date(now.getFullYear() - 1, 0, 1);
        endDate = new Date(now.getFullYear() - 1, 11, 31, 23, 59, 59, 999);
        break;
      case 'custom_range':
        if (!filter.startDate || !filter.endDate) {
          throw new Error("Start date and end date are required for custom range filter");
        }
        startDate = new Date(filter.startDate);
        endDate = new Date(filter.endDate);
        endDate.setHours(23, 59, 59, 999);
        break;
      case 'total':
      default:
        startDate = new Date(0); // Jan 1, 1970
        break;
    }
    
    return { startDate, endDate };
  }
  
  async getCampaignClickSummary(
    campaignId: number,
    filter: TimeRangeFilter
  ): Promise<{
    totalClicks: number,
    hourlyBreakdown?: { hour: number, clicks: number }[],
    dailyBreakdown?: Record<string, number>
  }> {
    try {
      // Calculate date ranges based on filter type
      const now = new Date();
      let startDateObj: Date;
      let endDateObj: Date = now;
      
      const { filterType, startDate, endDate } = filter;
      
      switch (filterType) {
        case 'today':
          startDateObj = new Date(now.getFullYear(), now.getMonth(), now.getDate());
          break;
        case 'yesterday':
          startDateObj = new Date(now.getFullYear(), now.getMonth(), now.getDate() - 1);
          // Set endDateObj to end of yesterday (23:59:59.999) instead of start of today
          endDateObj = new Date(now.getFullYear(), now.getMonth(), now.getDate() - 1, 23, 59, 59, 999);
          break;
        case 'last_2_days':
          startDateObj = new Date(now.getFullYear(), now.getMonth(), now.getDate() - 2);
          break;
        case 'last_3_days':
          startDateObj = new Date(now.getFullYear(), now.getMonth(), now.getDate() - 3);
          break;
        case 'last_4_days':
          startDateObj = new Date(now.getFullYear(), now.getMonth(), now.getDate() - 4);
          break;
        case 'last_5_days':
          startDateObj = new Date(now.getFullYear(), now.getMonth(), now.getDate() - 5);
          break;
        case 'last_6_days':
          startDateObj = new Date(now.getFullYear(), now.getMonth(), now.getDate() - 6);
          break;
        case 'last_7_days':
          startDateObj = new Date(now.getFullYear(), now.getMonth(), now.getDate() - 7);
          break;
        case 'last_30_days':
          startDateObj = new Date(now.getFullYear(), now.getMonth(), now.getDate() - 30);
          break;
        case 'this_month':
          startDateObj = new Date(now.getFullYear(), now.getMonth(), 1);
          break;
        case 'last_month':
          startDateObj = new Date(now.getFullYear(), now.getMonth() - 1, 1);
          // Set endDateObj to end of last day of last month (23:59:59.999)
          endDateObj = new Date(now.getFullYear(), now.getMonth(), 0, 23, 59, 59, 999);
          break;
        case 'last_6_months':
          startDateObj = new Date(now.getFullYear(), now.getMonth() - 6, 1);
          break;
        case 'this_year':
          startDateObj = new Date(now.getFullYear(), 0, 1);
          break;
        case 'last_year':
          startDateObj = new Date(now.getFullYear() - 1, 0, 1);
          // Set endDateObj to end of last day of last year (23:59:59.999)
          endDateObj = new Date(now.getFullYear() - 1, 11, 31, 23, 59, 59, 999);
          break;
        case 'custom_range':
          // For custom range, use the provided dates
          if (!startDate || !endDate) {
            throw new Error("Start date and end date are required for custom range filter");
          }
          startDateObj = new Date(startDate);
          // Include the entire day in end date
          endDateObj = new Date(endDate);
          endDateObj.setHours(23, 59, 59, 999);
          break;
        case 'total':
        default:
          // If 'total', don't apply any date filter
          startDateObj = new Date(0); // Jan 1, 1970
          break;
      }
      
      console.log(`Getting clicks for campaign ${campaignId} with filter type ${filterType}`);
      console.log(`Date range: ${startDateObj.toISOString()} to ${endDateObj.toISOString()}`);
      
      // Construct a proper query with conditional clauses
      let query = db.select({ count: sql`count(*)` })
        .from(campaignClickRecords)
        .where(eq(campaignClickRecords.campaignId, campaignId));
      
      // Add date filtering if not 'total'
      if (filterType !== 'total') {
        query = query.where(
          and(
            sql`${campaignClickRecords.timestamp} >= ${startDateObj}`,
            sql`${campaignClickRecords.timestamp} <= ${endDateObj}`
          )
        );
      }
      
      // Get total clicks with filtering
      const [totalResult] = await query;
      
      const totalClicks = Number(totalResult?.count || 0);
      
      // Get the daily breakdown 
      let dailyBreakdown: Record<string, number> = {};
      
      // Build daily query for date-based breakdown
      let dailyQuery = `
        SELECT 
          TO_CHAR(timestamp, 'YYYY-MM-DD') as date,
          COUNT(*) as clicks
        FROM 
          campaign_click_records
        WHERE 
          campaign_id = $1
      `;
      
      // Add date filtering for non-total queries
      const dailyParams = [campaignId];
      if (filterType !== 'total') {
        dailyQuery += ` AND timestamp >= $2 AND timestamp <= $3`;
        dailyParams.push(startDateObj);
        dailyParams.push(endDateObj);
      }
      
      // Add the grouping and ordering
      dailyQuery += `
        GROUP BY 
          TO_CHAR(timestamp, 'YYYY-MM-DD')
        ORDER BY 
          date
      `;
      
      console.log(`Daily query with filterType ${filterType}:`, dailyQuery);
      
      const dailyResult = await pool.query(dailyQuery, dailyParams);
      dailyResult.rows.forEach(row => {
        dailyBreakdown[row.date] = parseInt(row.clicks);
      });
      
      // If hourly breakdown is requested, get that too
      let hourlyBreakdown: { hour: number, clicks: number }[] | undefined;
      
      if (filter.showHourly) {
        // Build the query conditionally
        let hourlyQuery = `
          SELECT 
            EXTRACT(HOUR FROM timestamp) as hour,
            COUNT(*) as clicks
          FROM 
            campaign_click_records
          WHERE 
            campaign_id = $1
        `;
        
        // Add date filtering for non-total queries
        const params = [campaignId];
        if (filterType !== 'total') {
          hourlyQuery += ` AND timestamp >= $2 AND timestamp <= $3`;
          params.push(startDateObj);
          params.push(endDateObj);
        }
        
        // Add the grouping and ordering
        hourlyQuery += `
          GROUP BY 
            EXTRACT(HOUR FROM timestamp)
          ORDER BY 
            hour
        `;
        
        console.log(`Hourly query with filterType ${filterType}:`, hourlyQuery);
        console.log('Query params:', params);
        
        const result = await pool.query(hourlyQuery, params);
        
        // Create an array with all 24 hours, filling in zeros for hours with no clicks
        hourlyBreakdown = Array.from({ length: 24 }, (_, i) => ({
          hour: i,
          clicks: 0
        }));
        
        // Fill in actual data
        result.rows.forEach(row => {
          const hour = parseInt(row.hour);
          hourlyBreakdown![hour].clicks = parseInt(row.clicks);
        });
      }
      
      return {
        totalClicks,
        hourlyBreakdown,
        dailyBreakdown
      };
    } catch (error) {
      console.error("Error getting campaign click summary:", error);
      throw error;
    }
  }
  
  /**
   * Record a URL click in the database and click logs
   */
  async recordUrlClick(
    urlId: number
  ): Promise<UrlClickRecord> {
    // First, log the click to the URL click logs for Indian timezone reporting
    await urlClickLogsManager.logClick(urlId);
    
    // Then, record it in the database for API access
    const clickTime = new Date();
    
    // Insert into URL click records with only the essential data (no tracking info)
    const result = await pool.query(
      `INSERT INTO url_click_records (url_id, click_time) 
       VALUES ($1, $2) 
       RETURNING id, url_id as "urlId", click_time as "timestamp"`,
      [urlId, clickTime]
    );
    
    console.log(`📊 Recorded URL click for URL ID ${urlId}`);
    
    // Return a properly formatted record
    return result.rows[0];
  }
  
  /**
   * Get URL click records with pagination and filtering
   */
  async getUrlClickRecords(
    page: number,
    limit: number,
    urlId?: number,
    filter?: TimeRangeFilter
  ): Promise<{ records: UrlClickRecord[], total: number }> {
    try {
      const offset = (page - 1) * limit;
      
      // Use raw SQL queries since the schema and database columns don't match
      let whereClause = '';
      const queryParams: any[] = [];
      let paramIndex = 1;
      
      // Add URL filter if provided
      if (urlId) {
        whereClause = 'WHERE url_id = $1';
        queryParams.push(urlId);
        paramIndex++;
      }
      
      // Add date range filter if provided
      if (filter) {
        const { startDate, endDate } = this.getDateRangeForFilter(filter);
        
        if (whereClause === '') {
          whereClause = `WHERE click_time >= $${paramIndex} AND click_time <= $${paramIndex + 1}`;
        } else {
          whereClause += ` AND click_time >= $${paramIndex} AND click_time <= $${paramIndex + 1}`;
        }
        
        queryParams.push(startDate, endDate);
        paramIndex += 2;
      }
      
      // Execute count query first
      const countQuery = `SELECT COUNT(*) FROM url_click_records ${whereClause}`;
      const countResult = await pool.query(countQuery, queryParams);
      const total = parseInt(countResult.rows[0].count);
      
      // Then fetch the records with pagination - no created_at field in the table
      const recordsQuery = `
        SELECT id, url_id as "urlId", click_time as "timestamp"
        FROM url_click_records
        ${whereClause}
        ORDER BY click_time DESC
        LIMIT ${limit} OFFSET ${offset}
      `;
      
      const recordsResult = await pool.query(recordsQuery, queryParams);
      
      // The query already returns correctly aliased fields, just use them directly
      const records = recordsResult.rows;
      
      return { records, total };
    } catch (error) {
      console.error('Error retrieving URL click records:', error);
      return { records: [], total: 0 };
    }
  }
  
  /**
   * Get summary statistics for URL clicks
   */
  async getUrlClickSummary(
    urlId: number,
    filter: TimeRangeFilter
  ): Promise<{
    totalClicks: string | number,
    hourlyBreakdown?: { hour: number, clicks: string | number }[],
    dailyBreakdown?: Record<string, string | number>,
    filterInfo?: { type: string, dateRange: string }
  }> {
    try {
      // Use the URL Click Logs Manager to get detailed click statistics with Indian timezone
      return await urlClickLogsManager.getUrlClickSummary(urlId, filter);
    } catch (error) {
      console.error(`Error getting URL click summary for URL ${urlId}:`, error);
      return {
        totalClicks: 0,
        hourlyBreakdown: [],
        dailyBreakdown: {},
        filterInfo: {
          type: filter.filterType,
          dateRange: 'Error retrieving data'
        }
      };
    }
  }
}

export const storage = new DatabaseStorage();

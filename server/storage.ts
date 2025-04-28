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
  clickAnalytics,
  AnalyticsFilter,
  AnalyticsResponse
} from "@shared/schema";
import { db, pool } from "./db";
import { eq, and, isNull, asc, desc, sql, inArray, ne, ilike, or, between, gte, lte, count } from "drizzle-orm";

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
  
  // System operations
  fullSystemCleanup(): Promise<{ campaignsDeleted: number, urlsDeleted: number, originalUrlRecordsDeleted: number, analyticsRecordsDeleted: number }>;
  
  // Analytics operations
  recordClick(urlId: number, campaignId: number, data?: {
    userAgent?: string;
    ipAddress?: string;
    referer?: string;
    country?: string;
    city?: string; 
    deviceType?: string;
    browser?: string;
    operatingSystem?: string;
  }): Promise<void>;
  
  getAnalytics(filter: AnalyticsFilter): Promise<AnalyticsResponse>;
  
  getCampaignsList(): Promise<{ id: number, name: string }[]>;
  getUrlsList(search?: string): Promise<{ id: number, name: string, campaignId: number }[]>;
}

export class DatabaseStorage implements IStorage {
  // Caching infrastructure for high-performance operations
  private campaignUrlsCache: Map<number, {
    timestamp: number,
    urls: UrlWithActiveStatus[]
  }> = new Map();
  
  private urlCache: Map<number, {
    timestamp: number,
    url: Url
  }> = new Map();
  
  private campaignCache: Map<number, {
    timestamp: number,
    campaign: Campaign
  }> = new Map();
  
  private customPathCache: Map<string, {
    timestamp: number,
    campaignId: number
  }> = new Map();
  
  // Pending click updates for batch processing
  private pendingClickUpdates: Map<number, number> = new Map();
  
  // Cache settings
  private cacheTTL = -1; // Always bypass cache for instant updates
  
  // Click batch update settings
  private clickUpdateThreshold = 10;
  private clickUpdateTimer: NodeJS.Timeout | null = null;
  
  // Special settings
  private clickProtectionBypassed = false;
  
  constructor() {
    // Set up click update timer and process
    this.clickUpdateTimer = setInterval(() => {
      this.flushPendingClickUpdates();
    }, 5000); // Flush every 5 seconds
    
    // Handle graceful shutdown
    process.on('beforeExit', () => {
      this.flushPendingClickUpdates();
      if (this.clickUpdateTimer) {
        clearInterval(this.clickUpdateTimer);
      }
    });
  }
  
  // Campaign operations
  async getCampaigns(): Promise<CampaignWithUrls[]> {
    const allCampaigns = await db.select().from(campaigns).orderBy(desc(campaigns.createdAt));
    const result = [];
    
    for (const campaign of allCampaigns) {
      const urlsForCampaign = await this.getUrls(campaign.id);
      result.push({
        ...campaign,
        urls: urlsForCampaign
      });
    }
    
    return result;
  }
  
  async getCampaign(id: number, forceRefresh: boolean = false): Promise<CampaignWithUrls | undefined> {
    // Check cache first for performance
    const cacheKey = id;
    const cachedItem = this.campaignCache.get(cacheKey);
    
    if (!forceRefresh && cachedItem && (this.cacheTTL < 0 || Date.now() - cachedItem.timestamp < this.cacheTTL)) {
      // Cache hit - get URLs and return
      const urlsForCampaign = await this.getUrls(id);
      return {
        ...cachedItem.campaign,
        urls: urlsForCampaign
      };
    }
    
    // Cache miss - fetch from database
    try {
      const [campaign] = await db.select().from(campaigns).where(eq(campaigns.id, id));
      
      if (!campaign) {
        return undefined;
      }
      
      // Update cache
      this.campaignCache.set(cacheKey, {
        timestamp: Date.now(),
        campaign
      });
      
      // Fetch URLs
      const urlsForCampaign = await this.getUrls(id);
      
      return {
        ...campaign,
        urls: urlsForCampaign
      };
    } catch (err) {
      console.error(`Error fetching campaign ${id}:`, err);
      return undefined;
    }
  }
  
  async getCampaignByCustomPath(customPath: string): Promise<CampaignWithUrls | undefined> {
    // Check cache first for performance
    const cacheKey = customPath;
    const cachedItem = this.customPathCache.get(cacheKey);
    
    if (cachedItem && (this.cacheTTL < 0 || Date.now() - cachedItem.timestamp < this.cacheTTL)) {
      // Cache hit - get campaign and return
      return this.getCampaign(cachedItem.campaignId);
    }
    
    // Direct database lookup to ensure fresh data
    try {
      const [campaign] = await db
        .select()
        .from(campaigns)
        .where(eq(campaigns.customPath, customPath));
      
      if (!campaign) {
        return undefined;
      }
      
      // Update cache
      this.customPathCache.set(cacheKey, {
        timestamp: Date.now(),
        campaignId: campaign.id
      });
      
      // Fetch URLs
      const urlsForCampaign = await this.getUrls(campaign.id);
      
      return {
        ...campaign,
        urls: urlsForCampaign
      };
    } catch (err) {
      console.error(`Error fetching campaign by custom path ${customPath}:`, err);
      return undefined;
    }
  }
  
  async createCampaign(insertCampaign: InsertCampaign): Promise<Campaign> {
    const [campaign] = await db.insert(campaigns).values(insertCampaign).returning();
    return campaign;
  }
  
  async updateCampaign(id: number, updateCampaign: UpdateCampaign): Promise<Campaign | undefined> {
    // Check if update includes multiplier change for proper click protection
    if (updateCampaign.multiplier !== undefined) {
      const oldCampaign = await this.getCampaign(id);
      const oldMultiplier = oldCampaign?.multiplier || 1;
      const newMultiplier = updateCampaign.multiplier;
      
      // If multiplier is changing, need to update URL clicks with click protection bypass
      if (oldMultiplier !== newMultiplier) {
        console.log(`🔄 Campaign ${id} multiplier changing from ${oldMultiplier} to ${newMultiplier}, updating URL click values...`);
        
        // Enable click protection bypass
        await this.setClickProtectionBypass(true);
        
        // Get URLs
        const urls = await this.getUrls(id);
        
        // Update click limit for all URLs in campaign
        for (const url of urls) {
          // Calculate new click limit based on ratio
          if (url.originalClickLimit) {
            const newClickLimit = Math.floor(url.originalClickLimit * newMultiplier);
            console.log(`  → URL ${url.id}: Updating clickLimit from ${url.clickLimit} to ${newClickLimit} (originalClickLimit: ${url.originalClickLimit} × multiplier: ${newMultiplier})`);
            
            // Update the URL
            await db
              .update(urls)
              .set({ clickLimit: newClickLimit })
              .where(eq(urls.id, url.id));
          }
        }
        
        // Disable click protection bypass
        await this.setClickProtectionBypass(false);
      }
    }
    
    // Perform the campaign update
    const [updatedCampaign] = await db
      .update(campaigns)
      .set({ 
        ...updateCampaign, 
        updatedAt: new Date()
      })
      .where(eq(campaigns.id, id))
      .returning();
    
    if (updatedCampaign) {
      // Invalidate campaign cache
      this.invalidateCampaignCache(id);
      return updatedCampaign;
    }
    
    return undefined;
  }
  
  async deleteCampaign(id: number): Promise<boolean> {
    // Start a transaction to ensure all operations complete together
    try {
      // Mark all URLs in this campaign as deleted (soft delete)
      await db
        .update(urls)
        .set({ 
          status: "inactive",
          updatedAt: new Date()
        })
        .where(eq(urls.campaignId, id));
      
      // Mark campaign as deleted (soft delete)
      await db
        .update(campaigns)
        .set({
          status: "inactive",
          updatedAt: new Date()
        })
        .where(eq(campaigns.id, id));
      
      // Invalidate campaign cache
      this.invalidateCampaignCache(id);
      
      return true;
    } catch (err) {
      console.error(`Error deleting campaign ${id}:`, err);
      return false;
    }
  }
  
  // URL operations
  async getUrls(campaignId: number, forceRefresh: boolean = false): Promise<UrlWithActiveStatus[]> {
    // Check cache first for performance
    const cacheKey = campaignId;
    const cachedItem = this.campaignUrlsCache.get(cacheKey);
    
    if (!forceRefresh && cachedItem && (this.cacheTTL < 0 || Date.now() - cachedItem.timestamp < this.cacheTTL)) {
      // Cache hit
      return cachedItem.urls;
    }
    
    // Cache miss - fetch from database
    const urlsResult = await db
      .select()
      .from(urls)
      .where(eq(urls.campaignId, campaignId))
      .orderBy(desc(urls.createdAt));
    
    // Calculate active status for each URL
    const urlsWithStatus: UrlWithActiveStatus[] = urlsResult.map(url => {
      const isActive = url.status === "active";
      
      // Check if URL has reached its click limit
      let limitReached = false;
      if (isActive && url.clickLimit !== null && url.clickLimit > 0) {
        limitReached = url.clicks >= url.clickLimit;
      }
      
      return {
        ...url,
        activeStatus: limitReached ? 'limit-reached' : (isActive ? 'active' : 'inactive'),
        originalClickLimit: url.originalClickLimit || url.clickLimit
      };
    });
    
    // Update cache
    this.campaignUrlsCache.set(cacheKey, {
      timestamp: Date.now(),
      urls: urlsWithStatus
    });
    
    return urlsWithStatus;
  }
  
  async getAllUrls(
    page: number = 1, 
    limit: number = 20, 
    search: string = '',
    status: string = ''
  ): Promise<{ urls: UrlWithActiveStatus[], total: number }> {
    // Calculate offset from page number
    const offset = (page - 1) * limit;
    
    // Build base query
    let query = db.select().from(urls);
    let countQuery = db.select({ count: count() }).from(urls);
    
    // Add search filter if provided
    if (search) {
      const searchCondition = or(
        ilike(urls.name, `%${search}%`),
        ilike(urls.targetUrl, `%${search}%`)
      );
      query = query.where(searchCondition);
      countQuery = countQuery.where(searchCondition);
    }
    
    // Add status filter if provided
    if (status === 'active') {
      query = query.where(eq(urls.status, 'active'));
      countQuery = countQuery.where(eq(urls.status, 'active'));
    } else if (status === 'inactive') {
      query = query.where(eq(urls.status, 'inactive'));
      countQuery = countQuery.where(eq(urls.status, 'inactive'));
    }
    
    // Execute count query
    const [countResult] = await countQuery;
    const total = Number(countResult.count);
    
    // Execute data query with pagination
    const urlsResult = await query
      .orderBy(desc(urls.updatedAt))
      .limit(limit)
      .offset(offset);
    
    // Calculate active status for each URL
    const urlsWithStatus: UrlWithActiveStatus[] = urlsResult.map(url => {
      const isActive = url.status === "active";
      
      // Check if URL has reached its click limit
      let limitReached = false;
      if (isActive && url.clickLimit !== null && url.clickLimit > 0) {
        limitReached = url.clicks >= url.clickLimit;
      }
      
      return {
        ...url,
        activeStatus: limitReached ? 'limit-reached' : (isActive ? 'active' : 'inactive'),
        originalClickLimit: url.originalClickLimit || url.clickLimit
      };
    });
    
    return {
      urls: urlsWithStatus,
      total
    };
  }
  
  async getUrl(id: number): Promise<Url | undefined> {
    // Check cache first for performance
    const cacheKey = id;
    const cachedItem = this.urlCache.get(cacheKey);
    
    if (cachedItem && (this.cacheTTL < 0 || Date.now() - cachedItem.timestamp < this.cacheTTL)) {
      // Cache hit
      return cachedItem.url;
    }
    
    // Cache miss - fetch from database
    try {
      const [url] = await db.select().from(urls).where(eq(urls.id, id));
      
      if (!url) {
        return undefined;
      }
      
      // Update cache
      this.urlCache.set(cacheKey, {
        timestamp: Date.now(),
        url
      });
      
      return url;
    } catch (err) {
      console.error(`Error fetching URL ${id}:`, err);
      return undefined;
    }
  }
  
  async createUrl(insertUrl: InsertUrl & { originalClickLimit?: number }): Promise<Url> {
    // Check if we need to apply campaign multiplier
    if (insertUrl.campaignId && insertUrl.clickLimit !== undefined) {
      // Get campaign multiplier
      const multiplier = await this.getCampaignMultiplier(insertUrl.campaignId);
      
      // Store original click limit
      if (insertUrl.originalClickLimit === undefined) {
        insertUrl.originalClickLimit = insertUrl.clickLimit;
      }
      
      // Apply multiplier to click limit
      if (multiplier !== 1) {
        insertUrl.clickLimit = Math.floor(insertUrl.originalClickLimit * multiplier);
        console.log(`Applied campaign multiplier ${multiplier} to URL clickLimit: ${insertUrl.originalClickLimit} → ${insertUrl.clickLimit}`);
      }
    }
    
    const [url] = await db.insert(urls).values(insertUrl).returning();
    
    // Invalidate campaign URLs cache
    if (url.campaignId) {
      this.invalidateCampaignCache(url.campaignId);
    }
    
    return url;
  }
  
  async updateUrl(id: number, updateUrl: UpdateUrl): Promise<Url | undefined> {
    // Check if we're updating click limit and need to apply campaign multiplier
    if (updateUrl.clickLimit !== undefined && updateUrl.campaignId !== undefined) {
      // Get campaign multiplier
      const multiplier = await this.getCampaignMultiplier(updateUrl.campaignId);
      
      // Store original click limit
      if (!updateUrl.skipMultiplier) {
        updateUrl.originalClickLimit = updateUrl.clickLimit;
        
        // Apply multiplier to click limit
        if (multiplier !== 1) {
          updateUrl.clickLimit = Math.floor(updateUrl.originalClickLimit * multiplier);
          console.log(`Applied campaign multiplier ${multiplier} to URL clickLimit: ${updateUrl.originalClickLimit} → ${updateUrl.clickLimit}`);
        }
      }
      
      // Remove the temporary flag
      delete updateUrl.skipMultiplier;
    }
    
    const [updatedUrl] = await db
      .update(urls)
      .set({ 
        ...updateUrl, 
        updatedAt: new Date()
      })
      .where(eq(urls.id, id))
      .returning();
    
    if (updatedUrl) {
      // Invalidate URL cache
      this.invalidateUrlCache(id);
      
      // Invalidate campaign URLs cache if campaign ID exists
      if (updatedUrl.campaignId) {
        this.invalidateCampaignCache(updatedUrl.campaignId);
      }
      
      return updatedUrl;
    }
    
    return undefined;
  }
  
  private async getCampaignMultiplier(campaignId: number): Promise<number> {
    const campaign = await this.getCampaign(campaignId);
    return campaign?.multiplier || 1;
  }
  
  async deleteUrl(id: number): Promise<boolean> {
    try {
      // First get the URL to find its campaign ID (for cache invalidation)
      const url = await this.getUrl(id);
      
      if (!url) {
        return false;
      }
      
      // Soft delete by marking as inactive
      await db
        .update(urls)
        .set({ 
          status: "inactive",
          updatedAt: new Date()
        })
        .where(eq(urls.id, id));
      
      // Invalidate URL cache
      this.invalidateUrlCache(id);
      
      // Invalidate campaign URLs cache if campaign ID exists
      if (url.campaignId) {
        this.invalidateCampaignCache(url.campaignId);
      }
      
      return true;
    } catch (err) {
      console.error(`Error soft-deleting URL ${id}:`, err);
      return false;
    }
  }
  
  async permanentlyDeleteUrl(id: number): Promise<boolean> {
    try {
      // First get the URL to find its campaign ID (for cache invalidation)
      const url = await this.getUrl(id);
      
      if (!url) {
        return false;
      }
      
      // Delete associated data first
      await db.delete(clickAnalytics).where(eq(clickAnalytics.urlId, id));
      
      // Delete the URL
      await db.delete(urls).where(eq(urls.id, id));
      
      // Invalidate URL cache
      this.invalidateUrlCache(id);
      
      // Invalidate campaign URLs cache if campaign ID exists
      if (url.campaignId) {
        this.invalidateCampaignCache(url.campaignId);
      }
      
      return true;
    } catch (err) {
      console.error(`Error permanently deleting URL ${id}:`, err);
      return false;
    }
  }
  
  async bulkUpdateUrls(ids: number[], action: string): Promise<boolean> {
    if (!ids.length) {
      return false;
    }
    
    try {
      // Get the URLs to find campaign IDs (for cache invalidation)
      const urlsToUpdate = await db
        .select()
        .from(urls)
        .where(inArray(urls.id, ids));
      
      // Create a set of campaign IDs for cache invalidation
      const campaignIds = new Set(urlsToUpdate.map(url => url.campaignId).filter(Boolean));
      
      // Perform bulk action
      if (action === 'activate') {
        await db
          .update(urls)
          .set({ 
            status: "active",
            updatedAt: new Date()
          })
          .where(inArray(urls.id, ids));
      } else if (action === 'deactivate') {
        await db
          .update(urls)
          .set({ 
            status: "inactive",
            updatedAt: new Date()
          })
          .where(inArray(urls.id, ids));
      } else if (action === 'delete') {
        // Soft delete
        await db
          .update(urls)
          .set({ 
            status: "inactive",
            updatedAt: new Date()
          })
          .where(inArray(urls.id, ids));
      } else {
        return false;
      }
      
      // Invalidate URL caches
      for (const id of ids) {
        this.invalidateUrlCache(id);
      }
      
      // Invalidate campaign URLs caches
      for (const campaignId of campaignIds) {
        this.invalidateCampaignCache(campaignId);
      }
      
      return true;
    } catch (err) {
      console.error(`Error performing bulk action ${action} on URLs:`, err);
      return false;
    }
  }
  
  /**
   * Ultra-high performance click incrementing to handle millions of redirects per second
   * Uses memory-first approach with batched database updates
   */
  async incrementUrlClicks(id: number): Promise<Url | undefined> {
    // First get pending update count
    const pendingCount = this.pendingClickUpdates.get(id) || 0;
    
    // Increment pending count
    this.pendingClickUpdates.set(id, pendingCount + 1);
    
    // If threshold reached, flush this URL
    if (pendingCount + 1 >= this.clickUpdateThreshold) {
      this.batchUpdateUrlClicks(id, pendingCount + 1, false);
      this.pendingClickUpdates.delete(id);
    }
    
    // Get URL from cache or database
    return this.getUrl(id);
  }
  
  /**
   * Asynchronous batch update of URL clicks to database
   * This reduces database load for high-volume traffic
   */
  private async batchUpdateUrlClicks(id: number, pendingCount: number, isCompleted: boolean): Promise<void> {
    try {
      if (isCompleted) {
        console.log(`Batch updating click count for URL ${id} (+${pendingCount}) - final update`);
      }
      
      // Update database with accumulated clicks
      await db
        .update(urls)
        .set({ 
          clicks: sql`clicks + ${pendingCount}`,
          updatedAt: new Date()
        })
        .where(eq(urls.id, id));
      
      // Invalidate URL cache to ensure fresh data on next fetch
      this.invalidateUrlCache(id);
    } catch (error) {
      console.error(`Error batch updating clicks for URL ${id}:`, error);
      
      // If this was not the final cleanup attempt, put the pending count back
      if (!isCompleted) {
        const currentPending = this.pendingClickUpdates.get(id) || 0;
        this.pendingClickUpdates.set(id, currentPending + pendingCount);
      }
    }
  }
  
  /**
   * Flushes all pending click updates to the database
   * Called periodically via timer and on app shutdown
   * This ensures we don't lose track of clicks during high-load periods
   */
  private async flushPendingClickUpdates(): Promise<void> {
    try {
      // For each URL with pending clicks, perform a batch update
      for (const [id, pendingCount] of this.pendingClickUpdates.entries()) {
        if (pendingCount > 0) {
          try {
            if (pendingCount > 1000) {
              console.log(`⚠️ Large number of pending clicks (${pendingCount}) for URL ${id}`);
            }
            await this.batchUpdateUrlClicks(id, pendingCount, true);
          } catch (error) {
            console.error(`Error updating clicks for URL ${id} during flush:`, error);
          }
        }
      }
      
      // Clear the pending updates map
      this.pendingClickUpdates.clear();
    } catch (error) {
      console.error('Error flushing pending click updates:', error);
    }
  }
  
  async getWeightedUrlDistribution(campaignId: number) {
    // Get all active URLs for this campaign
    const allUrls = await this.getUrls(campaignId, true);
    const activeUrls = allUrls.filter(url => url.status === "active" && url.weight > 0);
    
    // If no active URLs, return empty result
    if (!activeUrls.length) {
      return {
        activeUrls: [],
        weightedDistribution: []
      };
    }
    
    // Calculate total weight
    const totalWeight = activeUrls.reduce((sum, url) => sum + url.weight, 0);
    
    // Create weighted distribution
    const weightedDistribution = [];
    let currentRange = 0;
    
    for (const url of activeUrls) {
      const relativeWeight = url.weight / totalWeight;
      const rangePortion = Math.round(relativeWeight * 10000); // Use 10000 for precise distribution
      
      weightedDistribution.push({
        url,
        weight: relativeWeight,
        startRange: currentRange,
        endRange: currentRange + rangePortion - 1
      });
      
      currentRange += rangePortion;
    }
    
    return {
      activeUrls,
      weightedDistribution
    };
  }
  
  async getRandomWeightedUrl(campaignId: number): Promise<UrlWithActiveStatus | null> {
    const { activeUrls, weightedDistribution } = await this.getWeightedUrlDistribution(campaignId);
    
    // If no active URLs, return null
    if (!activeUrls.length) {
      return null;
    }
    
    // If only one active URL, return it directly
    if (activeUrls.length === 1) {
      return activeUrls[0];
    }
    
    // Pick a random number in the range
    const totalRange = weightedDistribution.reduce((max, item) => 
      item.endRange > max ? item.endRange : max, 0);
    
    const randomValue = Math.floor(Math.random() * (totalRange + 1));
    
    // Find the URL that contains this random value in its range
    const selectedDistribution = weightedDistribution.find(
      item => randomValue >= item.startRange && randomValue <= item.endRange
    );
    
    if (selectedDistribution) {
      // Check if selected URL has reached its click limit
      if (selectedDistribution.url.clickLimit && 
          selectedDistribution.url.clicks >= selectedDistribution.url.clickLimit) {
        // Try to find another URL that hasn't reached its limit
        const availableUrls = activeUrls.filter(url => 
          !url.clickLimit || url.clicks < url.clickLimit
        );
        
        if (availableUrls.length) {
          // Pick a random URL from available ones
          const randomIndex = Math.floor(Math.random() * availableUrls.length);
          return availableUrls[randomIndex];
        } else {
          // All URLs have reached their limits, return the original selection anyway
          return selectedDistribution.url;
        }
      }
      
      return selectedDistribution.url;
    }
    
    // Fallback to first URL if something goes wrong
    return activeUrls[0];
  }
  
  private invalidateCampaignCache(campaignId: number) {
    this.campaignCache.delete(campaignId);
    this.campaignUrlsCache.delete(campaignId);
  }
  
  private invalidateUrlCache(urlId: number) {
    this.urlCache.delete(urlId);
  }
  
  async updateUrlStatus(id: number, status: string): Promise<void> {
    if (status === 'active') {
      await db
        .update(urls)
        .set({ 
          status: "active",
          updatedAt: new Date()
        })
        .where(eq(urls.id, id));
    } else if (status === 'inactive') {
      await db
        .update(urls)
        .set({ 
          status: "inactive",
          updatedAt: new Date()
        })
        .where(eq(urls.id, id));
    }
    
    // Invalidate URL cache
    this.invalidateUrlCache(id);
  }
  
  async fullSystemCleanup(): Promise<{ campaignsDeleted: number, urlsDeleted: number, originalUrlRecordsDeleted: number, analyticsRecordsDeleted: number }> {
    try {
      // First, count how many items we'll delete
      const campaignCount = await db.select({ count: sql`count(*)` }).from(campaigns);
      const urlCount = await db.select({ count: sql`count(*)` }).from(urls);
      const originalUrlRecordCount = await db.select({ count: sql`count(*)` }).from(originalUrlRecords);
      
      let analyticsCount = 0;
      try {
        const analyticsResult = await db.select({ count: sql`count(*)` }).from(clickAnalytics);
        analyticsCount = Number(analyticsResult[0].count) || 0;
      } catch (err) {
        console.log('Analytics table may not exist yet, continuing cleanup...');
      }
      
      // 0. First delete all analytics data as it references URLs and campaigns
      try {
        await db.delete(clickAnalytics);
      } catch (err) {
        console.log('Error deleting analytics data (table may not exist):', err);
      }
      
      // 1. Delete all URLs
      await db.delete(urls);
      
      // 2. Delete all campaigns
      await db.delete(campaigns);
      
      // 3. Delete all original URL records
      await db.delete(originalUrlRecords);
      
      // 4. Also delete protection settings if they exist
      try {
        await db.execute(sql`DELETE FROM protection_settings`);
      } catch (err) {
        console.log('Protection settings table may not exist, continuing cleanup...');
      }
      
      // 5. Delete pending budget updates if they exist
      try {
        await db.execute(sql`DELETE FROM pending_url_budget_updates`);
      } catch (err) {
        console.log('Pending budget updates table may not exist, continuing cleanup...');
      }
      
      // 6. Delete sessions table data if it exists
      try {
        await db.execute(sql`DELETE FROM sessions`);
      } catch (err) {
        console.log('Sessions table may not exist, continuing cleanup...');
      }
      
      // Reset sequences to ensure new records start from ID 1
      console.log(`🔄 SYSTEM RESET: Resetting all database sequences to start from 1...`);
      try {
        // Reset URLs sequence
        await db.execute(sql`ALTER SEQUENCE urls_id_seq RESTART WITH 1`);
        
        // Reset campaigns sequence
        await db.execute(sql`ALTER SEQUENCE campaigns_id_seq RESTART WITH 1`);
        
        // Reset original URL records sequence
        await db.execute(sql`ALTER SEQUENCE original_url_records_id_seq RESTART WITH 1`);
        
        // Reset click analytics sequence if it exists
        try {
          await db.execute(sql`ALTER SEQUENCE click_analytics_id_seq RESTART WITH 1`);
        } catch (err) {
          console.log('Click analytics sequence may not exist, continuing cleanup...');
        }
        
        // Reset TrafficStar campaigns sequence if it exists
        try {
          await db.execute(sql`ALTER SEQUENCE trafficstar_campaigns_id_seq RESTART WITH 1`);
        } catch (err) {
          console.log('TrafficStar campaigns sequence may not exist, continuing cleanup...');
        }
      } catch (err) {
        console.error('Error resetting sequences:', err);
      }
      
      // Clear all caches
      this.campaignCache.clear();
      this.urlCache.clear();
      this.campaignUrlsCache.clear();
      this.customPathCache.clear();
      this.pendingClickUpdates.clear();
      
      return {
        campaignsDeleted: Number(campaignCount[0].count) || 0,
        urlsDeleted: Number(urlCount[0].count) || 0,
        originalUrlRecordsDeleted: Number(originalUrlRecordCount[0].count) || 0,
        analyticsRecordsDeleted: analyticsCount
      };
    } catch (error) {
      console.error('Error during system cleanup:', error);
      throw new Error('System cleanup failed');
    }
  }
  
  // Original URL Records operations
  async getOriginalUrlRecords(page: number = 1, limit: number = 20, search?: string): Promise<{ records: OriginalUrlRecord[], total: number }> {
    // Calculate offset from page number
    const offset = (page - 1) * limit;
    
    // Build base query
    let query = db.select().from(originalUrlRecords);
    let countQuery = db.select({ count: count() }).from(originalUrlRecords);
    
    // Add search filter if provided
    if (search) {
      const searchCondition = or(
        ilike(originalUrlRecords.name, `%${search}%`),
        ilike(originalUrlRecords.targetUrl, `%${search}%`)
      );
      query = query.where(searchCondition);
      countQuery = countQuery.where(searchCondition);
    }
    
    // Execute count query
    const [countResult] = await countQuery;
    const total = Number(countResult.count);
    
    // Execute data query with pagination
    const records = await query
      .orderBy(desc(originalUrlRecords.updatedAt))
      .limit(limit)
      .offset(offset);
    
    return {
      records,
      total
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
    const [record] = await db.insert(originalUrlRecords).values(insertRecord).returning();
    return record;
  }
  
  async updateOriginalUrlRecord(id: number, updateRecord: UpdateOriginalUrlRecord): Promise<OriginalUrlRecord | undefined> {
    const existingRecord = await this.getOriginalUrlRecord(id);
    
    // Check if originalClickLimit is changing, which means we need to update URLs
    if (existingRecord && updateRecord.originalClickLimit !== undefined && updateRecord.originalClickLimit !== existingRecord.originalClickLimit) {
      const oldClickValue = existingRecord.originalClickLimit || 0;
      const newClickValue = updateRecord.originalClickLimit;
      
      console.log(`🔄 Original URL Record ${id} clicks changing from ${oldClickValue} to ${newClickValue}, updating all related URLs...`);
      
      // Enable click protection bypass
      await this.setClickProtectionBypass(true);
      
      // Find all URLs that use this record's name
      const relatedUrls = await db
        .select()
        .from(urls)
        .where(eq(urls.name, existingRecord.name));
      
      // Update each URL's click limit and original click limit
      for (const url of relatedUrls) {
        const campaignId = url.campaignId;
        let multiplier = 1;
        
        // Get campaign multiplier if URL is associated with a campaign
        if (campaignId) {
          const campaign = await this.getCampaign(campaignId);
          if (campaign) {
            multiplier = campaign.multiplier || 1;
          }
        }
        
        // Calculate new click limit applying the multiplier
        const newOriginalClickLimit = newClickValue;
        const newClickLimit = Math.floor(newOriginalClickLimit * multiplier);
        
        console.log(`  → URL ${url.id}: Updating clickLimit from ${url.clickLimit} to ${newClickLimit} (originalClickLimit: ${newOriginalClickLimit} × multiplier: ${multiplier})`);
        
        // Update the URL
        await db
          .update(urls)
          .set({ 
            clickLimit: newClickLimit,
            originalClickLimit: newOriginalClickLimit,
            updatedAt: new Date()
          })
          .where(eq(urls.id, url.id));
        
        // Invalidate URL cache
        this.invalidateUrlCache(url.id);
      }
      
      // Disable click protection bypass
      await this.setClickProtectionBypass(false);
    }
    
    // Update the record
    const [updatedRecord] = await db
      .update(originalUrlRecords)
      .set({ 
        ...updateRecord, 
        updatedAt: new Date()
      })
      .where(eq(originalUrlRecords.id, id))
      .returning();
    
    return updatedRecord;
  }
  
  async deleteOriginalUrlRecord(id: number): Promise<boolean> {
    try {
      // Delete the record
      await db.delete(originalUrlRecords).where(eq(originalUrlRecords.id, id));
      return true;
    } catch (err) {
      console.error(`Error deleting original URL record ${id}:`, err);
      return false;
    }
  }
  
  async syncUrlsWithOriginalRecord(recordId: number): Promise<number> {
    try {
      const [record] = await db.select().from(originalUrlRecords).where(eq(originalUrlRecords.id, recordId));
      
      if (!record) {
        throw new Error(`Original URL record with ID ${recordId} not found`);
      }
      
      // Find all URLs that have names matching this record's name
      const relatedUrls = await db
        .select()
        .from(urls)
        .where(eq(urls.name, record.name));
      
      // Enable click protection bypass for this legitimate operation
      await this.setClickProtectionBypass(true);
      
      // Update click limits for all related URLs
      let updatedCount = 0;
      
      for (const url of relatedUrls) {
        const campaignId = url.campaignId;
        let multiplier = 1;
        
        // Get campaign multiplier if URL is associated with a campaign
        if (campaignId) {
          const campaign = await this.getCampaign(campaignId);
          if (campaign) {
            multiplier = campaign.multiplier || 1;
          }
        }
        
        // Calculate new click limit applying the multiplier
        const newOriginalClickLimit = record.originalClickLimit || 0;
        const newClickLimit = Math.floor(newOriginalClickLimit * multiplier);
        
        // Update the URL
        await db
          .update(urls)
          .set({ 
            clickLimit: newClickLimit,
            originalClickLimit: newOriginalClickLimit,
            updatedAt: new Date()
          })
          .where(eq(urls.id, url.id));
        
        // Invalidate URL cache
        this.invalidateUrlCache(url.id);
        
        updatedCount++;
      }
      
      // Disable click protection bypass
      await this.setClickProtectionBypass(false);
      
      return updatedCount;
    } catch (error) {
      console.error(`Error syncing URLs with original record ${recordId}:`, error);
      
      // Ensure click protection is re-enabled even if an error occurs
      try {
        await this.setClickProtectionBypass(false);
      } catch (err) {
        console.error('Error resetting click protection bypass:', err);
      }
      
      return 0;
    }
  }
  
  // Analytics operations
  async recordClick(
    urlId: number, 
    campaignId: number, 
    data?: {
      userAgent?: string;
      ipAddress?: string;
      referer?: string;
      country?: string;
      city?: string; 
      deviceType?: string;
      browser?: string;
      operatingSystem?: string;
    }
  ): Promise<void> {
    try {
      const now = new Date();
      
      // Create record data
      const recordData = {
        urlId,
        campaignId,
        timestamp: now,
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
    try {
      const result = await db
        .select({
          id: campaigns.id,
          name: campaigns.name
        })
        .from(campaigns)
        .orderBy(desc(campaigns.createdAt));
      
      return result;
    } catch (error) {
      console.error('Error getting campaigns list for analytics:', error);
      return [];
    }
  }
  
  /**
   * Get a list of all URLs for analytics selection
   */
  async getUrlsList(search?: string): Promise<{ id: number, name: string, campaignId: number }[]> {
    try {
      // Base query to get URLs
      let query = db
        .select({
          id: urls.id,
          name: urls.name,
          campaignId: urls.campaignId
        })
        .from(urls)
        .where(eq(urls.status, 'active'));
      
      // Add search filter if provided
      if (search) {
        query = query.where(
          ilike(urls.name, `%${search}%`)
        );
      }
      
      // Execute query
      const result = await query.orderBy(desc(urls.createdAt));
      
      return result;
    } catch (error) {
      console.error('Error getting URLs list for analytics selection:', error);
      return []; // Return empty array on error
    }
  }
  
  /**
   * Helper method to get date range from filter
   */
  private getDateRangeFromFilter(filter: AnalyticsFilter): { startDate: Date, endDate: Date } {
    const now = new Date();
    const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    
    if (filter.timeRange === 'today') {
      return {
        startDate: today,
        endDate: now
      };
    } else if (filter.timeRange === 'yesterday') {
      const yesterday = new Date(today);
      yesterday.setDate(yesterday.getDate() - 1);
      const yesterdayEnd = new Date(yesterday);
      yesterdayEnd.setHours(23, 59, 59, 999);
      return {
        startDate: yesterday,
        endDate: yesterdayEnd
      };
    } else if (filter.timeRange === 'last_7_days') {
      const sevenDaysAgo = new Date(today);
      sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);
      return {
        startDate: sevenDaysAgo,
        endDate: now
      };
    } else if (filter.timeRange === 'last_30_days') {
      const thirtyDaysAgo = new Date(today);
      thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);
      return {
        startDate: thirtyDaysAgo,
        endDate: now
      };
    } else if (filter.timeRange === 'this_month') {
      const firstDayOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);
      return {
        startDate: firstDayOfMonth,
        endDate: now
      };
    } else if (filter.timeRange === 'last_month') {
      const firstDayOfLastMonth = new Date(now.getFullYear(), now.getMonth() - 1, 1);
      const lastDayOfLastMonth = new Date(now.getFullYear(), now.getMonth(), 0);
      lastDayOfLastMonth.setHours(23, 59, 59, 999);
      return {
        startDate: firstDayOfLastMonth,
        endDate: lastDayOfLastMonth
      };
    } else if (filter.timeRange === 'custom' && filter.startDate && filter.endDate) {
      const startDate = new Date(filter.startDate);
      const endDate = new Date(filter.endDate);
      endDate.setHours(23, 59, 59, 999); // Set to end of day
      return {
        startDate,
        endDate
      };
    } else {
      // Default to last 7 days
      const sevenDaysAgo = new Date(today);
      sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);
      return {
        startDate: sevenDaysAgo,
        endDate: now
      };
    }
  }
  
  /**
   * Get total click count for analytics
   */
  private async getClickCount(
    filter: AnalyticsFilter, 
    startDate: Date, 
    endDate: Date
  ): Promise<number> {
    try {
      // Format date strings for SQL
      const startStr = startDate.toISOString();
      const endStr = endDate.toISOString();
      
      let query = '';
      let params: any[] = [];
      
      if (filter.type === 'campaign') {
        query = `
          SELECT COUNT(*) as count 
          FROM click_analytics 
          WHERE campaign_id = $1 
          AND timestamp >= $2 
          AND timestamp <= $3
        `;
        params = [filter.id, startStr, endStr];
      } else {
        query = `
          SELECT COUNT(*) as count 
          FROM click_analytics 
          WHERE url_id = $1 
          AND timestamp >= $2 
          AND timestamp <= $3
        `;
        params = [filter.id, startStr, endStr];
      }
      
      const result = await pool.query(query, params);
      return parseInt(result.rows[0].count, 10) || 0;
    } catch (error) {
      console.error('Error getting click count for analytics:', error);
      return 0; // Return 0 on error
    }
  }
  
  /**
   * Get timeseries data for analytics
   */
  private async getTimeseriesData(
    filter: AnalyticsFilter, 
    startDate: Date, 
    endDate: Date
  ): Promise<{ period: string, clicks: number }[]> {
    try {
      // Format date strings for SQL
      const startStr = startDate.toISOString();
      const endStr = endDate.toISOString();
      
      let query = '';
      let params: any[] = [];
      
      // Build query based on filter type and grouping
      if (filter.type === 'campaign') {
        if (filter.groupBy === 'hour') {
          query = `
            SELECT 
              DATE_TRUNC('hour', timestamp AT TIME ZONE $4) as period,
              COUNT(*) as clicks
            FROM click_analytics 
            WHERE campaign_id = $1 AND timestamp >= $2 AND timestamp <= $3
            GROUP BY period
            ORDER BY period ASC
          `;
          params = [filter.id, startStr, endStr, filter.timezone || 'UTC'];
        } else if (filter.groupBy === 'day') {
          query = `
            SELECT 
              DATE_TRUNC('day', timestamp AT TIME ZONE $4) as period,
              COUNT(*) as clicks
            FROM click_analytics 
            WHERE campaign_id = $1 AND timestamp >= $2 AND timestamp <= $3
            GROUP BY period
            ORDER BY period ASC
          `;
          params = [filter.id, startStr, endStr, filter.timezone || 'UTC'];
        } else if (filter.groupBy === 'week') {
          query = `
            SELECT 
              DATE_TRUNC('week', timestamp AT TIME ZONE $4) as period,
              COUNT(*) as clicks
            FROM click_analytics 
            WHERE campaign_id = $1 AND timestamp >= $2 AND timestamp <= $3
            GROUP BY period
            ORDER BY period ASC
          `;
          params = [filter.id, startStr, endStr, filter.timezone || 'UTC'];
        } else {
          query = `
            SELECT 
              DATE_TRUNC('month', timestamp AT TIME ZONE $4) as period,
              COUNT(*) as clicks
            FROM click_analytics 
            WHERE campaign_id = $1 AND timestamp >= $2 AND timestamp <= $3
            GROUP BY period
            ORDER BY period ASC
          `;
          params = [filter.id, startStr, endStr, filter.timezone || 'UTC'];
        }
      } else {
        // Similar queries for URL type, just with url_id instead of campaign_id
        if (filter.groupBy === 'hour') {
          query = `
            SELECT 
              DATE_TRUNC('hour', timestamp AT TIME ZONE $4) as period,
              COUNT(*) as clicks
            FROM click_analytics 
            WHERE url_id = $1 AND timestamp >= $2 AND timestamp <= $3
            GROUP BY period
            ORDER BY period ASC
          `;
          params = [filter.id, startStr, endStr, filter.timezone || 'UTC'];
        } else if (filter.groupBy === 'day') {
          query = `
            SELECT 
              DATE_TRUNC('day', timestamp AT TIME ZONE $4) as period,
              COUNT(*) as clicks
            FROM click_analytics 
            WHERE url_id = $1 AND timestamp >= $2 AND timestamp <= $3
            GROUP BY period
            ORDER BY period ASC
          `;
          params = [filter.id, startStr, endStr, filter.timezone || 'UTC'];
        } else if (filter.groupBy === 'week') {
          query = `
            SELECT 
              DATE_TRUNC('week', timestamp AT TIME ZONE $4) as period,
              COUNT(*) as clicks
            FROM click_analytics 
            WHERE url_id = $1 AND timestamp >= $2 AND timestamp <= $3
            GROUP BY period
            ORDER BY period ASC
          `;
          params = [filter.id, startStr, endStr, filter.timezone || 'UTC'];
        } else {
          query = `
            SELECT 
              DATE_TRUNC('month', timestamp AT TIME ZONE $4) as period,
              COUNT(*) as clicks
            FROM click_analytics 
            WHERE url_id = $1 AND timestamp >= $2 AND timestamp <= $3
            GROUP BY period
            ORDER BY period ASC
          `;
          params = [filter.id, startStr, endStr, filter.timezone || 'UTC'];
        }
      }
      
      // Execute query
      const result = await pool.query(query, params);
      
      // Format results
      const formatPeriod = (date: Date, groupBy: string): string => {
        if (groupBy === 'hour') {
          return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')} ${String(date.getHours()).padStart(2, '0')}:00`;
        } else if (groupBy === 'day') {
          return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
        } else if (groupBy === 'week') {
          const firstDayOfWeek = new Date(date);
          const day = date.getDay() || 7; // Convert Sunday (0) to 7
          firstDayOfWeek.setDate(date.getDate() - (day - 1));
          return `Week of ${firstDayOfWeek.getFullYear()}-${String(firstDayOfWeek.getMonth() + 1).padStart(2, '0')}-${String(firstDayOfWeek.getDate()).padStart(2, '0')}`;
        } else {
          return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`;
        }
      };
      
      // Map results to expected format
      return result.rows.map(row => ({
        period: formatPeriod(new Date(row.period), filter.groupBy),
        clicks: parseInt(row.clicks, 10) || 0
      }));
    } catch (error) {
      console.error('Error getting timeseries data for analytics:', error);
      return []; // Return empty array on error
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
}

export const storage = new DatabaseStorage();
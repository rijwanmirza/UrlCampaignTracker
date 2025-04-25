
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
  urls
} from "@shared/schema";
import { db, pool } from "./db";
import { eq, and, isNull, asc, desc, sql, inArray, ne, ilike, or } from "drizzle-orm";

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
  fullSystemCleanup(): Promise<{ campaignsDeleted: number, urlsDeleted: number }>;
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
  
  // Cache TTL optimized for high volume (milliseconds)
  private cacheTTL = 2000; // Reduced to 2 seconds for fresher data with high throughput
  
  // Batch processing threshold before writing to DB
  private clickUpdateThreshold = 10;
  
  // Timer for periodic persistence of clicks
  private clickUpdateTimer: NodeJS.Timeout | null = null;

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
  }

  async getCampaign(id: number): Promise<CampaignWithUrls | undefined> {
    // Check campaign cache first for better performance
    const cachedCampaign = this.campaignCache.get(id);
    const now = Date.now();
    
    if (cachedCampaign && (now - cachedCampaign.lastUpdated < this.cacheTTL)) {
      // Use cached campaign data
      const campaign = cachedCampaign.campaign;
      
      // Still need to get fresh URLs for this campaign
      const urls = await this.getUrls(id);
      
      return {
        ...campaign,
        urls
      };
    }
    
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
  }

  async getCampaignByCustomPath(customPath: string): Promise<CampaignWithUrls | undefined> {
    // Check custom path cache for faster lookups
    const cachedPath = this.customPathCache.get(customPath);
    const now = Date.now();
    
    if (cachedPath && (now - cachedPath.lastUpdated < this.cacheTTL)) {
      // We have the campaign ID in cache, use it to get the campaign
      return this.getCampaign(cachedPath.campaignId);
    }
    
    // Cache miss - lookup in database
    const [campaign] = await db.select().from(campaigns).where(eq(campaigns.customPath, customPath));
    if (!campaign) return undefined;
    
    // Add to path cache for future lookups
    this.customPathCache.set(customPath, {
      lastUpdated: now,
      campaignId: campaign.id
    });
    
    // Also add to campaign cache
    this.campaignCache.set(campaign.id, {
      lastUpdated: now,
      campaign
    });
    
    const urls = await this.getUrls(campaign.id);
    return {
      ...campaign,
      urls
    };
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

  async getUrls(campaignId: number): Promise<UrlWithActiveStatus[]> {
    // Get all URLs for a campaign that are not deleted or rejected
    // This ensures rejected URLs with duplicate names don't appear in campaigns
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
    
    console.log('🔍 DEBUG: Storage - Creating URL');
    console.log('  - Name:', insertUrl.name);
    console.log('  - Target URL:', insertUrl.targetUrl);
    console.log('  - Campaign ID:', insertUrl.campaignId);
    console.log('  - Click limit (after multiplier):', insertUrl.clickLimit);
    console.log('  - Original click limit (user input):', originalClickLimit);
    
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
        originalClickLimit, // This should be the raw user input
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

  async deleteUrl(id: number): Promise<boolean> {
    const [url] = await db.select().from(urls).where(eq(urls.id, id));
    if (!url) return false;
    
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
    
    return true;
  }

  async permanentlyDeleteUrl(id: number): Promise<boolean> {
    try {
      // First get the URL to find its campaign ID (for cache invalidation)
      const [url] = await db.select().from(urls).where(eq(urls.id, id));
      if (!url) return false;
      
      // Completely remove the URL from the database with no trace
      await db.delete(urls).where(eq(urls.id, id));
      
      // Invalidate campaign cache if this URL was associated with a campaign
      if (url.campaignId) {
        this.invalidateCampaignCache(url.campaignId);
      }
      
      // We've completely removed the URL with no traces left on the server
      // Database will automatically reclaim space over time through autovacuum
      
      return true;
    } catch (error) {
      console.error("Failed to permanently delete URL:", error);
      return false;
    }
  }

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
    
    if (shouldDelete) {
      // Permanently delete URLs
      await db.delete(urls).where(inArray(urls.id, ids));
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
      if (isCompleted) {
        urlWithUpdatedClicks.status = 'completed';
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
      
      const updatedUrl = {
        ...url,
        clicks: newClicks,
        status: isCompleted ? 'completed' : url.status
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
              // If URL is completed, use our updateUrlStatus method which handles
              // removing from campaign
              await this.updateUrlStatus(id, 'completed');
              
              // Also update the click count (updateUrlStatus only updates status and campaignId)
              await db
                .update(urls)
                .set({
                  clicks: sql`${urls.clicks} + ${pendingCount}`,
                  updatedAt: new Date()
                })
                .where(eq(urls.id, id));
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
    // Check cache first
    const cachedData = this.campaignUrlsCache.get(campaignId);
    const now = Date.now();
    
    if (cachedData && (now - cachedData.lastUpdated < this.cacheTTL)) {
      return {
        activeUrls: cachedData.activeUrls,
        weightedDistribution: cachedData.weightedDistribution
      };
    }
    
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
    this.campaignUrlsCache.delete(campaignId);
  }
  
  // Helper to update URL status (used for async marking URLs as completed)
  async updateUrlStatus(id: number, status: string): Promise<void> {
    // When a URL is completed, we need to remove it from the campaign
    if (status === 'completed') {
      // First, get the URL to find its campaign ID
      const [url] = await db.select().from(urls).where(eq(urls.id, id));
      
      if (url?.campaignId) {
        // Store the campaign ID before removing it
        const campaignId = url.campaignId;
        
        // Update the URL: set status to completed and remove from campaign (set campaignId to null)
        await db
          .update(urls)
          .set({
            status,
            campaignId: null, // Remove from campaign
            updatedAt: new Date()
          })
          .where(eq(urls.id, id));
          
        // Invalidate the campaign cache since we've removed a URL
        this.invalidateCampaignCache(campaignId);
        
        console.log(`URL ${id} marked as completed and removed from campaign ${campaignId}`);
      } else {
        // If there's no campaign ID, just update the status
        await db
          .update(urls)
          .set({
            status,
            updatedAt: new Date()
          })
          .where(eq(urls.id, id));
      }
    } else {
      // For non-completed status updates, use the original behavior
      await db
        .update(urls)
        .set({
          status,
          updatedAt: new Date()
        })
        .where(eq(urls.id, id));
        
      // Get the URL to find its campaign ID
      const [url] = await db.select().from(urls).where(eq(urls.id, id));
      if (url?.campaignId) {
        this.invalidateCampaignCache(url.campaignId);
      }
    }
  }
  
  // Full system cleanup - deletes all campaigns and URLs
  async fullSystemCleanup(): Promise<{ campaignsDeleted: number, urlsDeleted: number }> {
    try {
      // First, count how many items we'll delete
      const allCampaigns = await this.getCampaigns();
      let totalUrls = 0;
      
      for (const campaign of allCampaigns) {
        totalUrls += campaign.urls.length;
      }
      
      // Delete all URLs first (to handle foreign key constraints)
      await db.delete(urls);
      
      // Then delete all campaigns
      await db.delete(campaigns);
      
      // Clear all caches for complete reset
      this.campaignUrlsCache.clear();
      this.urlCache.clear();
      this.campaignCache.clear();
      this.customPathCache.clear();
      this.pendingClickUpdates.clear();
      
      // Cancel any pending update timer
      if (this.clickUpdateTimer) {
        clearInterval(this.clickUpdateTimer);
        // Restart the timer
        this.clickUpdateTimer = setInterval(() => this.flushPendingClickUpdates(), 1000);
      }
      
      console.log(`Full system cleanup completed: deleted ${allCampaigns.length} campaigns and ${totalUrls} URLs`);
      
      return {
        campaignsDeleted: allCampaigns.length,
        urlsDeleted: totalUrls
      };
    } catch (error) {
      console.error("Error during full system cleanup:", error);
      throw error;
    }
  }
}

export const storage = new DatabaseStorage();

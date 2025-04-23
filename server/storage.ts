
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
import { db } from "./db";
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
}

export class DatabaseStorage implements IStorage {
  // Cache for active URLs by campaign for faster lookups during redirects
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
  
  // Cache ttl in milliseconds (5 seconds)
  private cacheTTL = 5000;

  constructor() {
    this.campaignUrlsCache = new Map();
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
    const [campaign] = await db.select().from(campaigns).where(eq(campaigns.id, id));
    if (!campaign) return undefined;
    
    const urls = await this.getUrls(id);
    return {
      ...campaign,
      urls
    };
  }

  async getCampaignByCustomPath(customPath: string): Promise<CampaignWithUrls | undefined> {
    const [campaign] = await db.select().from(campaigns).where(eq(campaigns.customPath, customPath));
    if (!campaign) return undefined;
    
    const urls = await this.getUrls(campaign.id);
    return {
      ...campaign,
      urls
    };
  }

  async createCampaign(insertCampaign: InsertCampaign): Promise<Campaign> {
    const now = new Date();
    const [campaign] = await db
      .insert(campaigns)
      .values({
        ...insertCampaign,
        redirectMethod: insertCampaign.redirectMethod || "direct",
        createdAt: now,
        updatedAt: now
      })
      .returning();
    
    return campaign;
  }

  async updateCampaign(id: number, updateCampaign: UpdateCampaign): Promise<Campaign | undefined> {
    const [existing] = await db.select().from(campaigns).where(eq(campaigns.id, id));
    if (!existing) return undefined;
    
    const [updated] = await db
      .update(campaigns)
      .set({
        ...updateCampaign,
        updatedAt: new Date()
      })
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
    // Get all URLs for a campaign that are not deleted
    const urlsResult = await db
      .select()
      .from(urls)
      .where(
        and(
          eq(urls.campaignId, campaignId),
          ne(urls.status, 'deleted')
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
    const [url] = await db.select().from(urls).where(eq(urls.id, id));
    return url;
  }

  async createUrl(insertUrl: InsertUrl): Promise<Url> {
    const now = new Date();
    
    // Set originalClickLimit to the initial clickLimit value (before multiplier)
    const originalClickLimit = insertUrl.clickLimit;
    
    const [url] = await db
      .insert(urls)
      .values({
        ...insertUrl,
        originalClickLimit,
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
      
      // Optimize database storage by running VACUUM periodically (uncommonly)
      // This helps reclaim space and optimize the database for better performance
      const shouldVacuum = Math.random() < 0.1; // 10% chance to run VACUUM after permanent deletion
      if (shouldVacuum) {
        try {
          console.log("Running database optimization to reclaim storage...");
          // We use pool directly to run a raw SQL command
          await db.run(sql`VACUUM;`);
        } catch (vacuumError) {
          console.error("Database optimization failed, but URL was deleted:", vacuumError);
        }
      }
      
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

  async incrementUrlClicks(id: number): Promise<Url | undefined> {
    const [url] = await db.select().from(urls).where(eq(urls.id, id));
    if (!url) return undefined;
    
    const newClicks = url.clicks + 1;
    const isCompleted = newClicks >= url.clickLimit;
    
    const [updatedUrl] = await db
      .update(urls)
      .set({ 
        clicks: newClicks,
        status: isCompleted ? 'completed' : url.status,
        updatedAt: new Date() 
      })
      .where(eq(urls.id, id))
      .returning();
    
    // Invalidate campaign cache for this URL to ensure weight distribution is recalculated
    if (url.campaignId) {
      this.invalidateCampaignCache(url.campaignId);
    }
    
    return updatedUrl;
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

export const storage = new DatabaseStorage();

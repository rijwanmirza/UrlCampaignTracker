
import { 
  Campaign, 
  InsertCampaign, 
  Url, 
  InsertUrl, 
  UpdateUrl, 
  CampaignWithUrls,
  UrlWithActiveStatus
} from "@shared/schema";

export interface IStorage {
  // Campaign operations
  getCampaigns(): Promise<CampaignWithUrls[]>;
  getCampaign(id: number): Promise<CampaignWithUrls | undefined>;
  createCampaign(campaign: InsertCampaign): Promise<Campaign>;
  
  // URL operations
  getUrls(campaignId: number): Promise<UrlWithActiveStatus[]>;
  getUrl(id: number): Promise<Url | undefined>;
  createUrl(url: InsertUrl): Promise<Url>;
  updateUrl(id: number, url: UpdateUrl): Promise<Url | undefined>;
  deleteUrl(id: number): Promise<boolean>;
  
  // Redirect operation
  incrementUrlClicks(id: number): Promise<Url | undefined>;
}

export class MemStorage implements IStorage {
  private campaigns: Map<number, Campaign>;
  private urls: Map<number, Url>;
  private campaignIdCounter: number;
  private urlIdCounter: number;
  
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
    this.campaigns = new Map();
    this.urls = new Map();
    this.campaignIdCounter = 1;
    this.urlIdCounter = 1;
    this.campaignUrlsCache = new Map();
  }

  async getCampaigns(): Promise<CampaignWithUrls[]> {
    const campaignsWithUrls: CampaignWithUrls[] = [];
    
    // Convert Map to Array to avoid iterator issues
    const campaignArray = Array.from(this.campaigns.values());
    
    for (const campaign of campaignArray) {
      const urls = await this.getUrls(campaign.id);
      campaignsWithUrls.push({
        ...campaign,
        urls
      });
    }
    
    return campaignsWithUrls;
  }

  async getCampaign(id: number): Promise<CampaignWithUrls | undefined> {
    const campaign = this.campaigns.get(id);
    if (!campaign) return undefined;
    
    const urls = await this.getUrls(id);
    return {
      ...campaign,
      urls
    };
  }

  async createCampaign(insertCampaign: InsertCampaign): Promise<Campaign> {
    const id = this.campaignIdCounter++;
    const campaign: Campaign = {
      id,
      ...insertCampaign,
      redirectMethod: insertCampaign.redirectMethod || "direct", // Ensure default value
      createdAt: new Date()
    };
    
    this.campaigns.set(id, campaign);
    return campaign;
  }

  async getUrls(campaignId: number): Promise<UrlWithActiveStatus[]> {
    const urlsInCampaign: UrlWithActiveStatus[] = [];
    
    // Convert Map to Array to avoid iterator issues
    const urlArray = Array.from(this.urls.values());
    
    for (const url of urlArray) {
      if (url.campaignId === campaignId) {
        urlsInCampaign.push({
          ...url,
          isActive: url.clicks < url.clickLimit
        });
      }
    }
    
    return urlsInCampaign;
  }

  async getUrl(id: number): Promise<Url | undefined> {
    return this.urls.get(id);
  }

  async createUrl(insertUrl: InsertUrl): Promise<Url> {
    const id = this.urlIdCounter++;
    const url: Url = {
      id,
      ...insertUrl,
      clicks: 0,
      createdAt: new Date()
    };
    
    this.urls.set(id, url);
    
    // Invalidate the campaign cache when adding a new URL
    this.invalidateCampaignCache(url.campaignId);
    
    return url;
  }

  async updateUrl(id: number, updateUrl: UpdateUrl): Promise<Url | undefined> {
    const existingUrl = this.urls.get(id);
    if (!existingUrl) return undefined;
    
    const updatedUrl: Url = {
      ...existingUrl,
      ...updateUrl
    };
    
    this.urls.set(id, updatedUrl);
    
    // Invalidate the campaign cache when updating a URL
    this.invalidateCampaignCache(existingUrl.campaignId);
    
    return updatedUrl;
  }

  async deleteUrl(id: number): Promise<boolean> {
    const url = this.urls.get(id);
    if (url) {
      // Invalidate the campaign cache before deleting the URL
      this.invalidateCampaignCache(url.campaignId);
    }
    
    return this.urls.delete(id);
  }

  async incrementUrlClicks(id: number): Promise<Url | undefined> {
    const url = this.urls.get(id);
    if (!url) return undefined;
    
    const updatedUrl: Url = {
      ...url,
      clicks: url.clicks + 1
    };
    
    this.urls.set(id, updatedUrl);
    
    // Invalidate campaign cache for this URL to ensure weight distribution is recalculated
    this.invalidateCampaignCache(url.campaignId);
    
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
}

export const storage = new MemStorage();

import { v4 as uuidv4 } from "nanoid";
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

  constructor() {
    this.campaigns = new Map();
    this.urls = new Map();
    this.campaignIdCounter = 1;
    this.urlIdCounter = 1;
  }

  async getCampaigns(): Promise<CampaignWithUrls[]> {
    const campaignsWithUrls: CampaignWithUrls[] = [];
    
    for (const campaign of this.campaigns.values()) {
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
      createdAt: new Date()
    };
    
    this.campaigns.set(id, campaign);
    return campaign;
  }

  async getUrls(campaignId: number): Promise<UrlWithActiveStatus[]> {
    const urlsInCampaign: UrlWithActiveStatus[] = [];
    
    for (const url of this.urls.values()) {
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
    return updatedUrl;
  }

  async deleteUrl(id: number): Promise<boolean> {
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
    return updatedUrl;
  }
}

export const storage = new MemStorage();

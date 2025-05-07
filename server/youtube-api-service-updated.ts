import { google, youtube_v3 } from 'googleapis';
import { db } from './db';
import { urls, youtubeUrlRecords, campaigns } from '@shared/schema';
import { eq, and, inArray } from 'drizzle-orm';
import { logger } from './logger';
import { storage } from './storage';

// Configuration
const YOUTUBE_API_KEY = process.env.YOUTUBE_API_KEY || '';
const BATCH_SIZE = 50; // Maximum videos to fetch in a single API call

/**
 * YouTube API Service
 * Checks videos for various conditions:
 * - Country restrictions (India)
 * - Private videos
 * - Deleted videos
 * - Age-restricted videos
 * - Made for kids
 * - Video duration exceeding maximum limit
 */
export class YouTubeApiService {
  private youtube: youtube_v3.Youtube;
  
  constructor() {
    this.youtube = google.youtube({
      version: 'v3',
      auth: YOUTUBE_API_KEY
    });
    
    logger.info('YouTube API Service initialized');
  }
  
  /**
   * Check if YOUTUBE_API_KEY is available
   */
  isConfigured(): boolean {
    return !!YOUTUBE_API_KEY;
  }
  
  /**
   * Extract YouTube video ID from URL
   * Supports various YouTube URL formats
   */
  extractVideoId(url: string): string | null {
    try {
      // First, check if it's a valid URL
      const urlObj = new URL(url);
      
      // Handle youtu.be format
      if (urlObj.hostname === 'youtu.be') {
        return urlObj.pathname.substring(1);
      }
      
      // Handle youtube.com formats
      if (urlObj.hostname === 'www.youtube.com' || urlObj.hostname === 'youtube.com') {
        // Regular video URL
        if (urlObj.pathname === '/watch') {
          return urlObj.searchParams.get('v');
        }
        
        // Shortened format
        if (urlObj.pathname.startsWith('/v/')) {
          return urlObj.pathname.substring(3);
        }
        
        // Embed format
        if (urlObj.pathname.startsWith('/embed/')) {
          return urlObj.pathname.substring(7);
        }
      }
      
      return null;
    } catch (error) {
      logger.error(`Error extracting video ID from URL: ${url}`, error);
      return null;
    }
  }
  
  /**
   * Checks if a URL is a valid YouTube URL
   */
  isYouTubeUrl(url: string): boolean {
    try {
      const urlObj = new URL(url);
      const isYouTubeDomain = 
        urlObj.hostname === 'www.youtube.com' || 
        urlObj.hostname === 'youtube.com' || 
        urlObj.hostname === 'youtu.be';
      
      return isYouTubeDomain && !!this.extractVideoId(url);
    } catch (error) {
      return false;
    }
  }
  
  /**
   * Parse ISO 8601 duration to minutes
   * Example: PT1H30M15S -> 90.25 minutes
   */
  parseDurationToMinutes(duration: string): number {
    try {
      // Remove the "PT" prefix
      const time = duration.substring(2);
      
      // Extract hours, minutes, seconds
      const hoursMatch = time.match(/(\d+)H/);
      const minutesMatch = time.match(/(\d+)M/);
      const secondsMatch = time.match(/(\d+)S/);
      
      const hours = hoursMatch ? parseInt(hoursMatch[1]) : 0;
      const minutes = minutesMatch ? parseInt(minutesMatch[1]) : 0;
      const seconds = secondsMatch ? parseInt(secondsMatch[1]) : 0;
      
      // Convert to total minutes (including fractional minutes for seconds)
      return hours * 60 + minutes + (seconds / 60);
    } catch (error) {
      logger.error(`Error parsing duration: ${duration}`, error);
      return 0; // Return 0 minutes on error
    }
  }
  
  /**
   * Get videos information in batch
   */
  async getVideosInfo(videoIds: string[]): Promise<youtube_v3.Schema$Video[]> {
    if (!this.isConfigured()) {
      throw new Error('YouTube API key not configured');
    }
    
    try {
      const response = await this.youtube.videos.list({
        part: ['snippet', 'contentDetails', 'status'],
        id: videoIds
      });
      
      return response.data.items || [];
    } catch (error) {
      logger.error('Error fetching YouTube videos info:', error);
      throw error;
    }
  }
  
  /**
   * Process all campaigns with YouTube API enabled
   */
  async processEnabledCampaigns(): Promise<void> {
    try {
      // Get all campaigns with YouTube API enabled
      const enabledCampaigns = await db
        .select()
        .from(campaigns)
        .where(eq(campaigns.youtubeApiEnabled, true));
      
      logger.info(`Found ${enabledCampaigns.length} campaigns with YouTube API enabled`);
      
      for (const campaign of enabledCampaigns) {
        await this.processCampaign(campaign.id);
      }
    } catch (error) {
      logger.error('Error processing YouTube API enabled campaigns:', error);
    }
  }
  
  /**
   * Process a single campaign
   */
  async processCampaign(campaignId: number): Promise<void> {
    try {
      // Get campaign details
      const [campaign] = await db
        .select()
        .from(campaigns)
        .where(eq(campaigns.id, campaignId));
      
      if (!campaign) {
        logger.error(`Campaign not found: ${campaignId}`);
        return;
      }
      
      if (!campaign.youtubeApiEnabled) {
        logger.info(`YouTube API not enabled for campaign ${campaignId}`);
        return;
      }
      
      logger.info(`Processing YouTube checks for campaign ${campaignId}`);
      
      // Get all active URLs for this campaign
      const activeUrls = await db
        .select()
        .from(urls)
        .where(
          and(
            eq(urls.campaignId, campaignId),
            eq(urls.status, 'active')
          )
        );
      
      if (activeUrls.length === 0) {
        logger.info(`No active URLs found for campaign ${campaignId}`);
        return;
      }
      
      // Filter for YouTube URLs
      const youtubeUrls = activeUrls.filter(url => this.isYouTubeUrl(url.targetUrl));
      
      if (youtubeUrls.length === 0) {
        logger.info(`No YouTube URLs found for campaign ${campaignId}`);
        return;
      }
      
      logger.info(`Found ${youtubeUrls.length} YouTube URLs to check for campaign ${campaignId}`);
      
      // Extract video IDs
      const urlsWithVideoIds = youtubeUrls.map(url => ({
        ...url,
        videoId: this.extractVideoId(url.targetUrl)
      })).filter(url => url.videoId !== null);
      
      // Process URLs in batches
      for (let i = 0; i < urlsWithVideoIds.length; i += BATCH_SIZE) {
        const batch = urlsWithVideoIds.slice(i, i + BATCH_SIZE);
        const videoIds = batch.map(url => url.videoId).filter(Boolean) as string[];
        
        await this.processVideoBatch(campaign, batch, videoIds);
      }
      
      // Update last check time
      await db
        .update(campaigns)
        .set({
          youtubeApiLastCheck: new Date(),
          updatedAt: new Date()
        })
        .where(eq(campaigns.id, campaignId));
      
      logger.info(`YouTube checks completed for campaign ${campaignId}`);
    } catch (error) {
      logger.error(`Error processing YouTube checks for campaign ${campaignId}:`, error);
    }
  }
  
  /**
   * Process a batch of videos
   */
  private async processVideoBatch(
    campaign: typeof campaigns.$inferSelect,
    urlsWithVideoIds: (typeof urls.$inferSelect & { videoId: string | null })[],
    videoIds: string[]
  ): Promise<void> {
    try {
      // Fetch video info from YouTube API
      const videos = await this.getVideosInfo(videoIds);
      const videoMap = new Map<string, youtube_v3.Schema$Video>();
      
      videos.forEach(video => {
        if (video.id) {
          videoMap.set(video.id, video);
        }
      });
      
      // Check each URL
      for (const url of urlsWithVideoIds) {
        if (!url.videoId) continue;
        
        const video = videoMap.get(url.videoId);
        
        if (!video) {
          // Video not found - this means it's deleted/unavailable
          if (campaign.youtubeCheckDeleted) {
            await this.deleteUrl(url, campaign, 'Video not found (deleted or unavailable)', {
              deletedVideo: true
            });
          }
          continue;
        }
        
        // Check for country restrictions (India)
        if (campaign.youtubeCheckCountryRestriction && 
            video.contentDetails?.regionRestriction?.blocked?.includes('IN')) {
          await this.deleteUrl(url, campaign, 'Video restricted in India', {
            countryRestricted: true
          });
          continue;
        }
        
        // Check for private video
        if (campaign.youtubeCheckPrivate && 
            video.status?.privacyStatus === 'private') {
          await this.deleteUrl(url, campaign, 'Private video', {
            privateVideo: true
          });
          continue;
        }
        
        // Check for age restriction
        const ageRestricted = video.contentDetails?.contentRating?.ytRating === 'ytAgeRestricted';
        if (campaign.youtubeCheckAgeRestricted && ageRestricted) {
          await this.deleteUrl(url, campaign, 'Age restricted video', {
            ageRestricted: true
          });
          continue;
        }
        
        // Check for made for kids
        const madeForKids = video.status?.madeForKids === true;
        if (campaign.youtubeCheckMadeForKids && madeForKids) {
          await this.deleteUrl(url, campaign, 'Video made for kids', {
            madeForKids: true
          });
          continue;
        }
        
        // Check for video duration exceeding max limit
        if (campaign.youtubeCheckDuration && video.contentDetails?.duration) {
          const durationMinutes = this.parseDurationToMinutes(video.contentDetails.duration);
          const maxDurationMinutes = campaign.youtubeMaxDurationMinutes || 30; // Default to 30 minutes
          
          if (durationMinutes > maxDurationMinutes) {
            await this.deleteUrl(url, campaign, `Video exceeds maximum duration (${Math.floor(durationMinutes)} minutes)`, {
              exceededDuration: true
            });
            continue;
          }
        }
      }
    } catch (error) {
      logger.error('Error processing YouTube video batch:', error);
    }
  }
  
  /**
   * Delete URL and record the reason
   */
  private async deleteUrl(
    url: typeof urls.$inferSelect, 
    campaign: typeof campaigns.$inferSelect,
    reason: string,
    flags: {
      countryRestricted?: boolean;
      privateVideo?: boolean;
      deletedVideo?: boolean;
      ageRestricted?: boolean;
      madeForKids?: boolean;
      exceededDuration?: boolean;
    }
  ): Promise<void> {
    try {
      // Extract video ID again
      const videoId = this.extractVideoId(url.targetUrl) || 'unknown';
      
      // Insert record into youtube_url_records
      await db.insert(youtubeUrlRecords).values({
        urlId: url.id,
        campaignId: campaign.id,
        name: url.name,
        targetUrl: url.targetUrl,
        youtubeVideoId: videoId,
        deletionReason: reason,
        countryRestricted: flags.countryRestricted || false,
        privateVideo: flags.privateVideo || false,
        deletedVideo: flags.deletedVideo || false,
        ageRestricted: flags.ageRestricted || false,
        madeForKids: flags.madeForKids || false,
        exceededDuration: flags.exceededDuration || false,
        deletedAt: new Date(),
        createdAt: new Date()
      });
      
      // Update URL status to deleted
      await db
        .update(urls)
        .set({
          status: 'deleted',
          updatedAt: new Date()
        })
        .where(eq(urls.id, url.id));
      
      logger.info(`URL deleted due to YouTube API check: ${url.id} (${url.name}) - Reason: ${reason}`);
    } catch (error) {
      logger.error(`Error deleting URL ${url.id}:`, error);
    }
  }
  
  /**
   * Schedule YouTube API checks
   */
  scheduleChecks(): void {
    // Run immediately on startup
    this.checkAllCampaigns();
    
    // Set interval for regular checks - check every minute which campaigns need processing
    setInterval(() => {
      this.checkAllCampaigns();
    }, 60000); // Check every minute
    
    logger.info('YouTube API checks scheduled');
  }
  
  /**
   * Check all campaigns to find those that need processing
   */
  private async checkAllCampaigns(): Promise<void> {
    try {
      // Get all enabled campaigns
      const enabledCampaigns = await db
        .select()
        .from(campaigns)
        .where(eq(campaigns.youtubeApiEnabled, true));
      
      const now = new Date();
      
      for (const campaign of enabledCampaigns) {
        // If no last check time or interval has elapsed, process campaign
        const intervalMinutes = campaign.youtubeApiIntervalMinutes || 60; // Default to 60 minutes if null
        if (!campaign.youtubeApiLastCheck || 
            this.hasIntervalElapsed(campaign.youtubeApiLastCheck, intervalMinutes, now)) {
          await this.processCampaign(campaign.id);
        }
      }
    } catch (error) {
      logger.error('Error checking campaigns for YouTube API processing:', error);
    }
  }
  
  /**
   * Check if the configured interval has elapsed since the last check
   */
  private hasIntervalElapsed(lastCheck: Date, intervalMinutes: number, now: Date): boolean {
    // Convert to milliseconds
    const interval = intervalMinutes * 60 * 1000;
    return (now.getTime() - lastCheck.getTime()) >= interval;
  }
}

// Create singleton instance
export const youtubeApiService = new YouTubeApiService();
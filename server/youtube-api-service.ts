import { google, youtube_v3 } from 'googleapis';
import { db } from './db';
import { urls, youtubeUrlRecords, campaigns, youtubeApiLogs, YouTubeApiLogType } from '@shared/schema';
import { eq, and, inArray, desc } from 'drizzle-orm';
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
  private schedulerTimer: NodeJS.Timeout | null = null;
  
  constructor() {
    this.youtube = google.youtube({
      version: 'v3',
      auth: YOUTUBE_API_KEY
    });
    
    logger.info('YouTube API Service initialized');
  }
  
  /**
   * Log YouTube API activity to database
   */
  async logApiActivity(
    logType: string, 
    message: string, 
    campaignId?: number, 
    details?: any, 
    isError: boolean = false
  ): Promise<void> {
    try {
      // Use DrizzleORM insert with only the fields that exist in the schema
      await db.insert(youtubeApiLogs).values({
        logType,
        message,
        campaignId: campaignId || null,
        details: details ? details : null,
        isError,
        timestamp: new Date()
      });
    } catch (error) {
      logger.error('Error logging YouTube API activity:', error);
    }
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
  async getVideosInfo(videoIds: string[], campaignId?: number): Promise<youtube_v3.Schema$Video[]> {
    if (!this.isConfigured()) {
      throw new Error('YouTube API key not configured');
    }
    
    try {
      // Create a more detailed API request message with timestamp
      const formattedVideoIds = videoIds.length > 5 
        ? `${videoIds.slice(0, 5).join(', ')}... (and ${videoIds.length - 5} more)`
        : videoIds.join(', ');
      
      const apiRequestMsg = `API Request at ${new Date().toISOString()} - ${videoIds.length} videos: ${formattedVideoIds}`;
      
      // Log the API call being made - this is what we want to see in the logs UI
      await this.logApiActivity(
        YouTubeApiLogType.API_REQUEST,
        apiRequestMsg,
        campaignId,
        { 
          videoIds,
          timestamp: new Date().toISOString(),
          requestType: 'videos.list',
          quotaCost: 1 // Each videos.list call costs 1 quota unit
        },
        false
      );
      
      // Log when API request starts
      logger.info(`[YOUTUBE-API] Making request for ${videoIds.length} videos: ${videoIds.slice(0, 3).join(', ')}${videoIds.length > 3 ? '...' : ''}`);
      
      // Track API request time for performance monitoring
      const startTime = Date.now();
      
      const response = await this.youtube.videos.list({
        part: ['snippet', 'contentDetails', 'status'],
        id: videoIds
      });
      
      // Calculate request duration
      const duration = Date.now() - startTime;
      
      // Create a detailed API response message with timestamp
      const apiResponseMsg = `API Response at ${new Date().toISOString()} - Received ${response.data.items?.length || 0}/${videoIds.length} videos in ${duration}ms`;
      
      // Log successful API response - this is also what we want to see in the logs UI
      await this.logApiActivity(
        YouTubeApiLogType.API_RESPONSE,
        apiResponseMsg,
        campaignId,
        { 
          responseTime: duration,
          videosReceived: (response.data.items || []).length,
          videoIdsRequested: videoIds.length,
          timestamp: new Date().toISOString(),
          quotaUsage: 1 // Each videos.list call costs 1 quota unit
        },
        false
      );
      
      logger.info(`[YOUTUBE-API] Response received with ${response.data.items?.length || 0} videos in ${duration}ms`);
      
      return response.data.items || [];
    } catch (error) {
      // Log failed API request with timestamp
      const errorMsg = `API Error at ${new Date().toISOString()} - ${error instanceof Error ? error.message : String(error)}`;
      
      await this.logApiActivity(
        YouTubeApiLogType.API_ERROR,
        errorMsg,
        campaignId,
        { 
          error: error instanceof Error ? error.message : String(error),
          videoIds,
          timestamp: new Date().toISOString()
        },
        true
      );
      
      logger.error('Error fetching YouTube videos info:', error);
      throw error;
    }
  }
  
  /**
   * Validate a single URL against YouTube API conditions
   * Used for immediate validation when adding URLs to campaigns
   * @returns Object with validation result and reason if failed
   */
  async validateSingleUrl(
    targetUrl: string, 
    campaign: any
  ): Promise<{ isValid: boolean; reason: string; validationDetails?: any }> {
    try {
      // Extract video ID from URL
      const videoId = this.extractVideoId(targetUrl);
      
      if (!videoId) {
        return { 
          isValid: false, 
          reason: 'Invalid YouTube URL - could not extract video ID'
        };
      }
      
      // Get video info from YouTube API with campaign ID for logging
      const videos = await this.getVideosInfo([videoId], campaign.id);
      
      if (!videos || videos.length === 0) {
        return { 
          isValid: false, 
          reason: 'Video not found or has been deleted'
        };
      }
      
      const video = videos[0];
      
      // Track validation details for YouTube URL record
      const validationDetails = {
        countryRestricted: false,
        privateVideo: false,
        deletedVideo: false,
        ageRestricted: false,
        madeForKids: false,
        exceededDuration: false
      };
      
      // Check if video is restricted in India
      if (campaign.youtubeCheckCountryRestriction && video.contentDetails?.regionRestriction?.blocked) {
        const blockedRegions = video.contentDetails.regionRestriction.blocked;
        if (Array.isArray(blockedRegions) && blockedRegions.includes('IN')) {
          validationDetails.countryRestricted = true;
          return { 
            isValid: false, 
            reason: 'Video is restricted in India', 
            validationDetails 
          };
        }
      }
      
      // Check if video is private
      if (campaign.youtubeCheckPrivate && video.status?.privacyStatus === 'private') {
        validationDetails.privateVideo = true;
        return { 
          isValid: false, 
          reason: 'Video is private', 
          validationDetails 
        };
      }
      
      // Check if video is age-restricted
      if (campaign.youtubeCheckAgeRestricted && 
          (video.contentDetails?.contentRating?.ytRating === 'ytAgeRestricted' || 
           video.contentDetails?.contentRating?.mpaaRating === 'mpaaUnrated')) {
        validationDetails.ageRestricted = true;
        return { 
          isValid: false, 
          reason: 'Video is age restricted', 
          validationDetails 
        };
      }
      
      // Check if video is made for kids
      if (campaign.youtubeCheckMadeForKids && video.status?.madeForKids === true) {
        validationDetails.madeForKids = true;
        return { 
          isValid: false, 
          reason: 'Video is made for kids', 
          validationDetails 
        };
      }
      
      // Check for video duration exceeding max limit
      if (campaign.youtubeCheckDuration && video.contentDetails?.duration) {
        const durationMinutes = this.parseDurationToMinutes(video.contentDetails.duration);
        const maxDurationMinutes = campaign.youtubeMaxDurationMinutes || 30; // Default to 30 minutes
        
        if (durationMinutes > maxDurationMinutes) {
          validationDetails.exceededDuration = true;
          return { 
            isValid: false, 
            reason: `Video exceeds maximum duration (${Math.floor(durationMinutes)} minutes)`, 
            validationDetails 
          };
        }
      }
      
      // All checks passed
      return { isValid: true, reason: 'Video passed all checks' };
    } catch (error) {
      logger.error('Error validating YouTube URL:', error);
      return { 
        isValid: false, 
        reason: `YouTube API error: ${error instanceof Error ? error.message : String(error)}`
      };
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
      
      // Process campaigns in parallel with a concurrency limit
      const CONCURRENCY_LIMIT = 2;
      const chunks = [];
      
      // Split campaigns into chunks to control concurrency
      for (let i = 0; i < enabledCampaigns.length; i += CONCURRENCY_LIMIT) {
        chunks.push(enabledCampaigns.slice(i, i + CONCURRENCY_LIMIT));
      }
      
      // Process each chunk in parallel
      for (const chunk of chunks) {
        await Promise.all(
          chunk.map(campaign => this.processCampaign(campaign.id))
        );
        
        // Add a short break between chunks to prevent rate limiting
        if (chunks.length > 1) {
          await new Promise(resolve => setTimeout(resolve, 300));
        }
      }
    } catch (error) {
      logger.error('Error processing YouTube API enabled campaigns:', error);
    }
  }
  
  /**
   * Process a single campaign
   */
  async processCampaign(campaignId: number, forceCheck: boolean = false): Promise<void> {
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
      
      // Check if interval has elapsed unless forceCheck is true
      if (!forceCheck && campaign.youtubeApiLastCheck) {
        const intervalMinutes = campaign.youtubeApiIntervalMinutes || 60; // Default to 60 minutes if null
        const now = new Date();
        
        if (!this.hasIntervalElapsed(campaign.youtubeApiLastCheck, intervalMinutes, now)) {
          logger.info(`Skipping YouTube check for campaign ${campaignId} - interval not elapsed (${intervalMinutes} minutes)`);
          return;
        }
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
      // Fetch video info from YouTube API with campaign ID for logging
      const videos = await this.getVideosInfo(videoIds, campaign.id);
      const videoMap = new Map<string, youtube_v3.Schema$Video>();
      
      videos.forEach(video => {
        if (video.id) {
          videoMap.set(video.id, video);
        }
      });
      
      // Create an array of promised operations for each URL
      const urlOperations: Promise<void>[] = [];
      
      // Process each URL
      for (const url of urlsWithVideoIds) {
        if (!url.videoId) continue;
        
        const video = videoMap.get(url.videoId);
        
        if (!video) {
          // Video not found - this means it's deleted/unavailable
          if (campaign.youtubeCheckDeleted) {
            urlOperations.push(
              this.deleteUrl(url, campaign, 'Video not found (deleted or unavailable)', {
                deletedVideo: true
              })
            );
          }
          continue;
        }
        
        // Check for country restrictions (India)
        if (campaign.youtubeCheckCountryRestriction && 
            video.contentDetails?.regionRestriction?.blocked?.includes('IN')) {
          urlOperations.push(
            this.deleteUrl(url, campaign, 'Video restricted in India', {
              countryRestricted: true
            })
          );
          continue;
        }
        
        // Check for private video
        if (campaign.youtubeCheckPrivate && 
            video.status?.privacyStatus === 'private') {
          urlOperations.push(
            this.deleteUrl(url, campaign, 'Private video', {
              privateVideo: true
            })
          );
          continue;
        }
        
        // Check for age restriction
        const ageRestricted = video.contentDetails?.contentRating?.ytRating === 'ytAgeRestricted';
        if (campaign.youtubeCheckAgeRestricted && ageRestricted) {
          urlOperations.push(
            this.deleteUrl(url, campaign, 'Age restricted video', {
              ageRestricted: true
            })
          );
          continue;
        }
        
        // Check for made for kids
        const madeForKids = video.status?.madeForKids === true;
        if (campaign.youtubeCheckMadeForKids && madeForKids) {
          urlOperations.push(
            this.deleteUrl(url, campaign, 'Video made for kids', {
              madeForKids: true
            })
          );
          continue;
        }
        
        // Check for video duration exceeding max limit
        if (campaign.youtubeCheckDuration && video.contentDetails?.duration) {
          const durationMinutes = this.parseDurationToMinutes(video.contentDetails.duration);
          const maxDurationMinutes = campaign.youtubeMaxDurationMinutes || 30; // Default to 30 minutes
          
          if (durationMinutes > maxDurationMinutes) {
            urlOperations.push(
              this.deleteUrl(url, campaign, `Video exceeds maximum duration (${Math.floor(durationMinutes)} minutes)`, {
                exceededDuration: true
              })
            );
            continue;
          }
        }
      }
      
      // Execute all URL operations in parallel for better performance
      if (urlOperations.length > 0) {
        await Promise.all(urlOperations);
      }
    } catch (error) {
      logger.error('Error processing YouTube video batch:', error);
    }
  }
  
  /**
   * Save a direct rejected URL to youtube_url_records
   * Used for immediate validation when adding URLs to campaigns
   */
  async saveDirectRejectedUrl(
    urlData: any,
    campaignId: number,
    reason: string,
    videoId: string,
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
      // Insert record into youtube_url_records
      const record = await db.insert(youtubeUrlRecords).values({
        urlId: null, // NULL for direct rejections that weren't created as URLs
        campaignId: campaignId,
        name: urlData.name || 'Unnamed URL',
        targetUrl: urlData.targetUrl || '',
        youtubeVideoId: videoId || 'unknown',
        deletionReason: `[Direct Rejected] ${reason}`,
        countryRestricted: flags?.countryRestricted || false,
        privateVideo: flags?.privateVideo || false,
        deletedVideo: flags?.deletedVideo || false,
        ageRestricted: flags?.ageRestricted || false,
        madeForKids: flags?.madeForKids || false,
        exceededDuration: flags?.exceededDuration || false,
        deletedAt: new Date(),
        createdAt: new Date()
      }).returning();
      
      logger.info(`Direct rejected URL recorded (ID: ${record[0]?.id}): ${urlData.name} - ${reason}`);
      
      // Log detailed validation results
      console.log('✅ Saved YouTube URL validation record with details:', {
        name: urlData.name,
        videoId,
        reason,
        flags
      });
    } catch (error) {
      logger.error('Error recording direct rejected URL:', error);
      console.error('Failed to save YouTube URL validation record:', error);
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
   * Dynamic scheduler for YouTube API checks
   * This schedules the next check based on the campaign with the shortest remaining time
   */
  scheduleChecks(): void {
    // Clear any existing scheduler if it exists
    if (this.schedulerTimer) {
      clearTimeout(this.schedulerTimer);
      this.schedulerTimer = null;
    }
    
    // Initial scheduling (this will create the first timer)
    this.scheduleNextCheck();
    
    logger.info('YouTube API checks scheduled with dynamic timing');
  }
  
  /**
   * Schedules the next check based on the campaign with the shortest remaining time
   * This ensures we only check exactly when needed, not sooner or later
   */
  private async scheduleNextCheck(): Promise<void> {
    try {
      // Get all enabled campaigns
      const enabledCampaigns = await db
        .select()
        .from(campaigns)
        .where(eq(campaigns.youtubeApiEnabled, true));
      
      if (enabledCampaigns.length === 0) {
        // If no campaigns, check again in 15 minutes
        this.schedulerTimer = setTimeout(() => this.scheduleNextCheck(), 15 * 60 * 1000);
        logger.info('[youtube-api-scheduler] No enabled campaigns found, checking again in 15 minutes');
        return;
      }
      
      const now = new Date();
      
      // Log detailed information about all campaigns for debugging
      await this.logApiActivity(
        YouTubeApiLogType.SCHEDULER,
        `Calculating next check time for ${enabledCampaigns.length} campaigns`,
        undefined,
        { campaignCount: enabledCampaigns.length }
      );
      
      // Track campaigns and their time information
      const campaignTimings: Array<{
        id: number;
        name: string;
        lastCheck: Date | null;
        intervalMinutes: number;
        elapsedMinutes: number;
        remainingMinutes: number;
        needsProcessing: boolean;
      }> = [];
      
      let shortestRemainingMs = Infinity;
      let campaignWithShortestTime: typeof enabledCampaigns[0] | null = null;
      let anyNeedsProcessingNow = false;
      
      // Find the campaign with the shortest remaining time
      for (const campaign of enabledCampaigns) {
        const intervalMinutes = campaign.youtubeApiIntervalMinutes || 60; // Default to 60 minutes if null
        const intervalMs = intervalMinutes * 60 * 1000;
        
        let elapsedMs = 0;
        let elapsedMinutes = 0;
        let remainingMs = intervalMs;
        let remainingMinutes = intervalMinutes;
        let needsProcessing = false;
        
        if (!campaign.youtubeApiLastCheck) {
          // If any campaign has no last check, process immediately
          needsProcessing = true;
          anyNeedsProcessingNow = true;
        } else {
          elapsedMs = now.getTime() - campaign.youtubeApiLastCheck.getTime();
          elapsedMinutes = Math.floor(elapsedMs / (60 * 1000));
          remainingMs = Math.max(0, intervalMs - elapsedMs);
          remainingMinutes = Math.ceil(remainingMs / (60 * 1000));
          
          // Only process if the full interval has elapsed (strictly greater than or equal)
          needsProcessing = elapsedMinutes >= intervalMinutes;
          
          if (needsProcessing) {
            anyNeedsProcessingNow = true;
          }
        }
        
        // Add to campaign timings for logging
        campaignTimings.push({
          id: campaign.id,
          name: campaign.name,
          lastCheck: campaign.youtubeApiLastCheck,
          intervalMinutes,
          elapsedMinutes,
          remainingMinutes,
          needsProcessing
        });
        
        // Track the shortest remaining time
        if (!needsProcessing && remainingMs < shortestRemainingMs) {
          shortestRemainingMs = remainingMs;
          campaignWithShortestTime = campaign;
        }
      }
      
      // Log detailed timing information for debugging
      await this.logApiActivity(
        YouTubeApiLogType.SCHEDULER,
        `Campaign timing details`,
        undefined,
        { campaignTimings }
      );
      
      if (anyNeedsProcessingNow) {
        // Log which campaigns need processing now
        const campaignsNeedingProcess = campaignTimings
          .filter(c => c.needsProcessing)
          .map(c => c.id);
          
        await this.logApiActivity(
          YouTubeApiLogType.SCHEDULER,
          `Processing ${campaignsNeedingProcess.length} campaigns now: ${campaignsNeedingProcess.join(', ')}`,
          undefined,
          { campaignsNeedingProcess }
        );
        
        // If any campaign needs processing now, do it and then schedule next check
        await this.checkAllCampaigns();
        
        // After processing, reschedule with a short delay to avoid immediate rechecking
        this.schedulerTimer = setTimeout(() => this.scheduleNextCheck(), 5000);
      } else {
        // Schedule next check at exactly the time needed
        // Add 1 second buffer to ensure we're slightly after the interval
        const nextCheckMs = shortestRemainingMs + 1000;
        
        // Log when the next check will occur
        const nextCheckMinutes = Math.ceil(nextCheckMs / (60 * 1000));
        const nextCheckTime = new Date(now.getTime() + nextCheckMs);
        
        await this.logApiActivity(
          YouTubeApiLogType.SCHEDULER,
          `Next check scheduled for campaign ${campaignWithShortestTime?.id} in ${nextCheckMinutes} minutes at ${nextCheckTime.toISOString()}`,
          campaignWithShortestTime?.id ?? undefined,
          { 
            nextCheckMinutes,
            nextCheckTime: nextCheckTime.toISOString(),
            campaignInfo: campaignWithShortestTime
              ? {
                  id: campaignWithShortestTime.id,
                  name: campaignWithShortestTime.name,
                  intervalMinutes: campaignWithShortestTime.youtubeApiIntervalMinutes
                }
              : null
          }
        );
        
        logger.info(`[youtube-api-scheduler] Next check scheduled in exactly ${nextCheckMinutes} minutes`);
        
        // Schedule the next check with the exact timing
        this.schedulerTimer = setTimeout(() => this.scheduleNextCheck(), nextCheckMs);
      }
    } catch (error) {
      logger.error('Error scheduling next check:', error);
      
      await this.logApiActivity(
        YouTubeApiLogType.SCHEDULER_CHECK,
        'Error scheduling next check',
        undefined,
        { error: error instanceof Error ? error.message : String(error) },
        true
      );
      
      // On error, retry in 5 minutes
      this.schedulerTimer = setTimeout(() => this.scheduleNextCheck(), 5 * 60 * 1000);
    }
  }
  
  /**
   * Only logs campaign schedule status without processing
   * This reduces unnecessary API activity logging
   */
  private async logCampaignScheduleStatus(): Promise<void> {
    try {
      // Get all enabled campaigns
      const enabledCampaigns = await db
        .select()
        .from(campaigns)
        .where(eq(campaigns.youtubeApiEnabled, true));
      
      if (enabledCampaigns.length === 0) {
        return; // No campaigns to check
      }
      
      const now = new Date();
      
      for (const campaign of enabledCampaigns) {
        const intervalMinutes = campaign.youtubeApiIntervalMinutes || 60; // Default to 60 minutes if null
        
        if (!campaign.youtubeApiLastCheck) {
          // For initial checks, we'll process through the checkAllCampaigns method
          this.checkAllCampaigns();
          return;
        } else {
          const elapsedMs = now.getTime() - campaign.youtubeApiLastCheck.getTime();
          const elapsedMinutes = Math.floor(elapsedMs / (60 * 1000));
          const minutesRemaining = Math.max(0, intervalMinutes - elapsedMinutes);
          
          // Only process if the full interval has elapsed
          const shouldProcess = elapsedMinutes >= intervalMinutes;
          
          const message = `Campaign ${campaign.id}: Last check: ${campaign.youtubeApiLastCheck.toISOString()}, Interval: ${intervalMinutes} minutes, Time remaining: ${minutesRemaining} minutes`;
          logger.info(`[youtube-api-scheduler] ${message}`);
          
          // If any campaign needs processing, run the full check
          if (shouldProcess) {
            this.checkAllCampaigns();
            return;
          }
        }
      }
    } catch (error) {
      logger.error('Error checking campaign schedule status:', error);
    }
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
      
      // Log scheduler activity
      await this.logApiActivity(
        YouTubeApiLogType.INTERVAL_CHECK,
        `Scheduler checking ${enabledCampaigns.length} campaigns with YouTube API enabled`,
        undefined,
        { campaignIds: enabledCampaigns.map(c => c.id) }
      );
      
      const now = new Date();
      
      for (const campaign of enabledCampaigns) {
        // If no last check time or interval has elapsed, process campaign
        const intervalMinutes = campaign.youtubeApiIntervalMinutes || 60; // Default to 60 minutes if null
        
        // Calculate time remaining until next check
        let minutesRemaining = 0;
        let shouldProcess = false;
        
        if (!campaign.youtubeApiLastCheck) {
          shouldProcess = true;
          const message = `Campaign ${campaign.id}: No previous check found, processing now`;
          logger.info(`[youtube-api-scheduler] ${message}`);
          
          await this.logApiActivity(
            YouTubeApiLogType.INTERVAL_CHECK,
            message,
            campaign.id,
            { 
              name: campaign.name,
              intervalMinutes,
              reason: 'initial_check'
            }
          );
        } else {
          const elapsedMs = now.getTime() - campaign.youtubeApiLastCheck.getTime();
          const elapsedMinutes = Math.floor(elapsedMs / (60 * 1000));
          minutesRemaining = Math.max(0, intervalMinutes - elapsedMinutes);
          
          // Only process if the full interval has elapsed (strictly greater than or equal)
          shouldProcess = elapsedMinutes >= intervalMinutes;
          
          const message = `Campaign ${campaign.id}: Last check: ${campaign.youtubeApiLastCheck.toISOString()}, Interval: ${intervalMinutes} minutes, Time remaining: ${minutesRemaining} minutes`;
          logger.info(`[youtube-api-scheduler] ${message}`);
          
          await this.logApiActivity(
            YouTubeApiLogType.INTERVAL_CHECK,
            message,
            campaign.id,
            { 
              name: campaign.name,
              lastCheck: campaign.youtubeApiLastCheck,
              intervalMinutes,
              elapsedMinutes,
              minutesRemaining: minutesRemaining > 0 ? minutesRemaining : 0,
              shouldProcess
            }
          );
        }
        
        if (shouldProcess) {
          const message = `Campaign ${campaign.id}: Interval elapsed, processing now`;
          logger.info(`[youtube-api-scheduler] ${message}`);
          await this.processCampaign(campaign.id);
        } else {
          const message = `Campaign ${campaign.id}: Skipping check, ${minutesRemaining} minutes remaining`;
          logger.info(`[youtube-api-scheduler] ${message}`);
        }
      }
    } catch (error) {
      logger.error('Error checking campaigns for YouTube API processing:', error);
      
      await this.logApiActivity(
        YouTubeApiLogType.INTERVAL_CHECK,
        'Error checking campaigns for YouTube API processing',
        undefined,
        { error: error instanceof Error ? error.message : String(error) },
        true
      );
    }
  }
  
  /**
   * Check if the configured interval has elapsed since the last check
   * This ensures we strictly respect the interval timing
   */
  private hasIntervalElapsed(lastCheck: Date, intervalMinutes: number, now: Date): boolean {
    // Calculate elapsed minutes (more precise than millisecond comparison)
    const elapsedMs = now.getTime() - lastCheck.getTime();
    const elapsedMinutes = Math.floor(elapsedMs / (60 * 1000));
    
    // Only return true if the full interval has elapsed (strictly greater than or equal)
    return elapsedMinutes >= intervalMinutes;
  }
}

// Create singleton instance
export const youtubeApiService = new YouTubeApiService();